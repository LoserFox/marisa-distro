package main

import (
	"archive/tar"
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/klauspost/compress/zstd"
)

// countingReader counts the compressed bytes consumed so far. Read is only
// ever called from the single reader goroutine below, so the counter needs
// no synchronization.
type countingReader struct {
	r io.Reader
	n int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += int64(n)
	return n, err
}

// extractTarZst materializes a tar.zst bundle (single zstd stream, written
// by desktop/bundle/tarszst) into dest. skip(name) may exclude entries (the
// embedded build skips the VERSION marker the caller writes last, so a crash
// never leaves a matching marker on a partial tree). progress, when non-nil,
// receives (compressed bytes consumed, total bytes) after each tar entry,
// from the reader goroutine. Returns the file count.
//
// The zstd stream decodes sequentially at ~1GB/s, but writing 56k small
// files serially would starve on IOPS — so one reader goroutine decodes the
// stream and hands file contents to a small writer pool (byte-budget
// limited), mirroring the parallel-write behavior of the old zip extractor.
func extractTarZst(data []byte, dest string, skip func(string) bool, progress func(consumed, total int64)) (int, error) {
	const (
		workers     = 8
		writeBudget = 256 << 20 // max buffered-but-unwritten bytes
	)

	type writeJob struct {
		target   string
		data     []byte
		perm     os.FileMode // permission bits restored from the tar header
		budgeted bool        // whether this job counts against the writeBudget
	}

	counting := &countingReader{r: bytes.NewReader(data)}
	zr, err := zstd.NewReader(counting)
	if err != nil {
		return 0, err
	}
	defer zr.Close()

	tr := tar.NewReader(zr)
	jobs := make(chan writeJob, workers*2)
	errCh := make(chan error, 1)
	var (
		wg        sync.WaitGroup
		mu        sync.Mutex
		firstErr  error
		buffered  atomic.Int64
		fileCount atomic.Int64
	)
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobs {
				if err := writeFile(j.target, j.data, j.perm); err != nil {
					mu.Lock()
					if firstErr == nil {
						firstErr = err
					}
					mu.Unlock()
				} else {
					fileCount.Add(1)
				}
				if j.budgeted {
					buffered.Add(-int64(len(j.data)))
				}
			}
		}()
	}

	// Reader: decode the stream, hand files to the writers. Closes jobs on
	// both success and failure paths (the single close site).
	go func() {
		defer close(jobs)
		for {
			hdr, err := tr.Next()
			if err == io.EOF {
				errCh <- nil
				return
			}
			if err != nil {
				errCh <- fmt.Errorf("read tar entry: %w", err)
				return
			}
			if skip != nil && skip(hdr.Name) {
				continue
			}
			name := filepath.Clean(filepath.FromSlash(hdr.Name))
			if name == "." || name == ".." || strings.HasPrefix(name, ".."+string(filepath.Separator)) || filepath.IsAbs(name) {
				errCh <- fmt.Errorf("unsafe tar entry %q", hdr.Name)
				return
			}
			target := filepath.Join(dest, name)
			switch hdr.Typeflag {
			case tar.TypeDir:
				if err := os.MkdirAll(target, 0o755); err != nil {
					errCh <- err
					return
				}
			case tar.TypeReg, tar.TypeRegA:
				// Byte budget: block reading until writers free space.
				// Files larger than the budget bypass it entirely and are
				// streamed to a writer goroutine that writes directly from
				// the reader's buffer, so a 275MB file never deadlocks a
				// 256MB budget (measured 2026-08-22).
				oversized := hdr.Size > writeBudget
				if !oversized {
					for {
						cur := buffered.Load()
						if cur+hdr.Size <= writeBudget && buffered.CompareAndSwap(cur, cur+hdr.Size) {
							break
						}
					}
				}
				buf := make([]byte, hdr.Size)
				if _, err := io.ReadFull(tr, buf); err != nil {
					errCh <- fmt.Errorf("read %s: %w", hdr.Name, err)
					return
				}
				perm := os.FileMode(hdr.Mode) & 0o777
				if perm == 0 {
					perm = 0o644 // defensive: archives without mode bits stay plain files
				}
				jobs <- writeJob{target: target, data: buf, perm: perm, budgeted: !oversized}
			}
			if progress != nil {
				progress(counting.n, int64(len(data)))
			}
		}
	}()

	readErr := <-errCh
	wg.Wait()
	if readErr != nil {
		return int(fileCount.Load()), readErr
	}
	mu.Lock()
	err = firstErr
	mu.Unlock()
	if err != nil {
		return int(fileCount.Load()), err
	}
	return int(fileCount.Load()), nil
}

// writeFile writes one buffered file with the permission bits carried by its
// tar header. The parent directory already exists: tarszst emits every
// directory entry before its files, and the reader materializes them — an
// extra MkdirAll here would be one stat per file (45k stats ≈ the
// install-time bottleneck, measured 2026-08-18). Executable entries (bundled
// node/mnemon binaries, launcher.sh — tarszst normalizes their mode to 0755)
// re-assert exact perms after Close because OpenFile applies the process
// umask; plain 0644 files skip that extra syscall.
func writeFile(target string, data []byte, perm os.FileMode) error {
	dst, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, perm)
	if err != nil {
		return err
	}
	// No Truncate presize: measured slower (extra allocation syscall + zero
	// fill on NTFS); plain sequential writes at 8 workers won (2026-08-18).
	_, copyErr := dst.Write(data)
	closeErr := dst.Close()
	if copyErr == nil {
		copyErr = closeErr
	}
	if perm.Perm() != 0o644 {
		if chErr := os.Chmod(target, perm); chErr != nil && copyErr == nil {
			copyErr = chErr
		}
	}
	return copyErr
}
