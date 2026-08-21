// Extraction core: single-stream tar.zst decoder with a parallel write pool.
// Adapted from desktop/extract_tar.go (the desktop shell's extractor) so the
// profile tool materializes bundles byte-identically; kept in this package so
// the tool stays self-contained (desktop's is package main and tagged builds
// mix it with the shell).
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
// by desktop/bundle/tarszst) into dest. progress, when non-nil, receives
// (compressed bytes consumed, total bytes) after each tar entry, from the
// reader goroutine. Returns the file count.
//
// The zstd stream decodes sequentially at ~1GB/s, but writing 56k small
// files serially would starve on IOPS — so one reader goroutine decodes the
// stream and hands file contents to a small writer pool (byte-budget
// limited), mirroring the parallel-write behavior of the desktop extractor.
func extractTarZst(data []byte, dest string, progress func(consumed, total int64)) (int, error) {
	const (
		workers     = 8
		writeBudget = 256 << 20 // max buffered-but-unwritten bytes
	)

	type writeJob struct {
		target string
		data   []byte
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
				if err := writeFile(j.target, j.data); err != nil {
					mu.Lock()
					if firstErr == nil {
						firstErr = err
					}
					mu.Unlock()
				} else {
					fileCount.Add(1)
				}
				buffered.Add(-int64(len(j.data)))
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
				for {
					cur := buffered.Load()
					if cur+hdr.Size <= writeBudget && buffered.CompareAndSwap(cur, cur+hdr.Size) {
						break
					}
				}
				buf := make([]byte, hdr.Size)
				if _, err := io.ReadFull(tr, buf); err != nil {
					errCh <- fmt.Errorf("read %s: %w", hdr.Name, err)
					return
				}
				jobs <- writeJob{target: target, data: buf}
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

// writeFile writes one buffered file. The parent directory already exists:
// tarszst emits every directory entry before its files, and the reader
// materializes them.
func writeFile(target string, data []byte) error {
	dst, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	_, copyErr := dst.Write(data)
	closeErr := dst.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}
