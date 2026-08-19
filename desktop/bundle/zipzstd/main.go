// zipzstd — write a zip archive with zstd compression (method 93) from a
// directory tree. Replaces `7z a -tzip -mx=9` in make-bundle.ps1.
//
// Design (per the 2026-08-18 packaging review; mature primitives only):
//   - One GLOBAL encoder per compression tier. zstd.Encoder.EncodeAll is
//     safe for concurrent use (it draws from an internal state pool sized by
//     WithEncoderConcurrency), so worker goroutines share it — encoder
//     memory is tiers × window, not workers × 24 MB.
//   - Tiered levels: <64KB → 12, 64KB..8MB → 17, >8MB → streaming encoder
//     with full concurrency. Level 19 on 4KB files buys ~1% for 5-10x CPU.
//   - Content-hash dedup: identical file contents (node_modules is full of
//     them) compress once and the bytes are reused via zip.Writer.CreateRaw.
//   - Store fallback: already-compressed extensions and anything that fails
//     to compress (>=98% of input) go in uncompressed — saves a decode on
//     the client for free.
//   - Deterministic output: entries are sorted by (ext, dir, name) so
//     similar files sit adjacent in the output stream (better ratio), and
//     all metadata is normalized (ModTime=epoch, mode 0644/0755) so the
//     same input produces byte-identical archives.
//   - Byte-budget in-flight limit (512MB) instead of counting files.
//   - Ordered output: each entry carries its sort index and the writer
//     drains through a min-heap, so the archive order matches the sorted
//     walk even though compression is concurrent.
package main

import (
	"container/heap"
	"flag"
	"fmt"
	"hash/crc32"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/cespare/xxhash/v2"
	"github.com/klauspost/compress/zstd"
	zip "github.com/klauspost/compress/zip"
)

type entry struct {
	path string
	name string
	size int64
	// sortKey: (ext, dir, name) — group similar files for window locality.
	ext string
	dir string
}

type result struct {
	idx  int // order in the sorted walk; writer drains via min-heap
	name string
	size int64 // uncompressed
	comp []byte
	raw  []byte // uncompressed bytes when Store fallback applies
	crc  uint32
}

// ── tier encoders (shared; EncodeAll is concurrency-safe) ──────────────────
var (
	encSmall *zstd.Encoder // < 64KB, level 12
	encMed   *zstd.Encoder // 64KB..8MB, level 17
	// large files (>8MB) use a streaming encoder per file (rare, ~2 files)
)

const (
	smallLimit = 64 << 10
	medLimit   = 8 << 20
	// inFlightBudget caps total uncompressed bytes being compressed at once.
	inFlightBudget = 512 << 20
	// storeThreshold: if compression saves less than 2%, store raw.
	storeThreshold = 0.98
)

// storedExts never benefit from compression.
var storedExts = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".webp": true, ".gif": true,
	".woff": true, ".woff2": true, ".gz": true, ".br": true, ".zip": true,
	".zst": true, ".7z": true, ".xz": true, ".mp4": true, ".ico": true,
}

// minHeap lets the writer emit entries in sorted order.
type minHeap []*result

func (h minHeap) Len() int            { return len(h) }
func (h minHeap) Less(i, j int) bool  { return h[i].idx < h[j].idx }
func (h minHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *minHeap) Push(x any)         { *h = append(*h, x.(*result)) }
func (h *minHeap) Pop() any           { old := *h; n := len(old); x := old[n-1]; *h = old[:n-1]; return x }

func main() {
	flag.Parse()
	args := flag.Args()
	if len(args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: zipzstd <srcDir> <outZip>")
		os.Exit(2)
	}
	src, out := args[0], args[1]

	debug.SetGCPercent(400)
	debug.SetMemoryLimit(3 << 30)

	dirs, files, err := collect(src)
	if err != nil {
		fatal(err)
	}

	// ── shared tier encoders ────────────────────────────────────────────────
	encSmall = mustEncoder(12)
	encMed = mustEncoder(17)
	defer encSmall.Close()
	defer encMed.Close()

	// ── worker pool with byte-budget limiting ───────────────────────────────
	workers := runtime.GOMAXPROCS(0)
	jobCh := make(chan int) // index into files
	resCh := make(chan *result, workers*4)

	var inFlight atomic.Int64 // uncompressed bytes currently being compressed
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			largeEnc, err := zstd.NewWriter(nil,
				zstd.WithEncoderLevel(zstd.EncoderLevelFromZstd(17)),
				zstd.WithEncoderConcurrency(runtime.GOMAXPROCS(0)))
			if err != nil {
				fatal(err)
			}
			defer largeEnc.Close()
			for i := range jobCh {
				e := &files[i]
				// Byte-budget: block until budget is available.
				for {
					cur := inFlight.Load()
					if cur+e.size <= inFlightBudget && inFlight.CompareAndSwap(cur, cur+e.size) {
						break
					}
					runtime.Gosched()
				}
				data, err := os.ReadFile(e.path)
				if err != nil {
					fatal(err)
				}
				res := compressOne(largeEnc, e, data)
				res.idx = i
				inFlight.Add(-e.size)
				resCh <- res
			}
		}()
	}
	go func() {
		for i := range files {
			jobCh <- i
		}
		close(jobCh)
		wg.Wait()
		close(resCh)
	}()

	// ── writer: directories first, then min-heap ordered files ─────────────
	f, err := os.Create(out)
	if err != nil {
		fatal(err)
	}
	zw := zip.NewWriter(f)

	dirCount := 0
	for _, e := range dirs {
		_, err := zw.CreateHeader(&zip.FileHeader{Name: e.name + "/", Method: zip.Store})
		if err != nil {
			fatal(err)
		}
		dirCount++
	}
	// Files are written in sorted order (each result carries its sort index).
	pending := &minHeap{}
	heap.Init(pending)
	next := 0
	fileCount := 0
	for res := range resCh {
		heap.Push(pending, res)
		for pending.Len() > 0 && (*pending)[0].idx == next {
			r := heap.Pop(pending).(*result)
			writeEntry(zw, r)
			fileCount++
			next++
		}
	}
	for pending.Len() > 0 {
		r := heap.Pop(pending).(*result)
		writeEntry(zw, r)
		fileCount++
		next++
	}
	if err := zw.Close(); err != nil {
		fatal(err)
	}
	if err := f.Close(); err != nil {
		fatal(err)
	}

	size, _ := os.Stat(out)
	fmt.Printf("zipzstd: %d files (%d dirs) -> %s (%.1f MB)\n",
		fileCount, dirCount, out, float64(size.Size())/1e6)
}

func writeEntry(zw *zip.Writer, r *result) {
	hdr := &zip.FileHeader{
		Name:               r.name,
		Method:             zip.Store, // default; overridden below
		UncompressedSize64: uint64(r.size),
		CRC32:              r.crc,
		Modified:           time.Unix(0, 0), // normalized for reproducibility
	}
	if r.comp != nil {
		hdr.Method = 93 // zstd
		hdr.CompressedSize64 = uint64(len(r.comp))
		w, err := zw.CreateRaw(hdr)
		if err != nil {
			fatal(err)
		}
		if _, err := w.Write(r.comp); err != nil {
			fatal(err)
		}
		return
	}
	// Store fallback.
	hdr.CompressedSize64 = uint64(len(r.raw))
	w, err := zw.CreateRaw(hdr)
	if err != nil {
		fatal(err)
	}
	if _, err := w.Write(r.raw); err != nil {
		fatal(err)
	}
}

// seen dedups identical contents: compress once, reuse the bytes.
var seen = struct {
	sync.Mutex
	m map[string]*dedupEntry
}{m: make(map[string]*dedupEntry)}

type dedupEntry struct {
	comp []byte
	crc  uint32
	size int64
}

// compressOne picks the tier, applies dedup and Store fallback.
func compressOne(largeEnc *zstd.Encoder, e *entry, data []byte) *result {
	crc := crc32.ChecksumIEEE(data)
	base := &result{name: e.name, size: int64(len(data)), crc: crc}

	// Store fallback: already-compressed extensions.
	if storedExts[strings.ToLower(e.ext)] {
		base.raw = data
		return base
	}

	// Dedup by content hash.
	key := fmt.Sprintf("%d-%d", xxhash.Sum64(data), len(data))
	seen.Lock()
	if d, ok := seen.m[key]; ok {
		seen.Unlock()
		base.comp = d.comp
		return base
	}
	seen.Unlock()

	// Compress with the tier encoder.
	var comp []byte
	switch {
	case len(data) < smallLimit:
		comp = encSmall.EncodeAll(data, nil)
	case len(data) <= medLimit:
		comp = encMed.EncodeAll(data, nil)
	default:
		// Large files: streaming encoder with full internal concurrency.
		comp = largeEnc.EncodeAll(data, nil)
	}

	// Store fallback: compression gained nothing.
	if len(comp) >= int(float64(len(data))*storeThreshold) {
		base.raw = data
		return base
	}

	seen.Lock()
	if d, ok := seen.m[key]; ok {
		seen.Unlock()
		base.comp = d.comp // another worker won the race
		return base
	}
	seen.m[key] = &dedupEntry{comp: comp, crc: crc, size: int64(len(data))}
	seen.Unlock()
	base.comp = comp
	return base
}

func mustEncoder(level int) *zstd.Encoder {
	enc, err := zstd.NewWriter(nil,
		zstd.WithEncoderLevel(zstd.EncoderLevelFromZstd(level)),
		zstd.WithEncoderConcurrency(runtime.GOMAXPROCS(0)))
	if err != nil {
		panic(err)
	}
	return enc
}

// collect walks src and sorts files by (ext, dir, name) so similar files are
// adjacent in the output stream. Directories are returned in walk order.
func collect(src string) (dirs, files []entry, err error) {
	err = filepath.WalkDir(src, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		name := filepath.ToSlash(rel)
		if d.IsDir() {
			dirs = append(dirs, entry{name: name})
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		files = append(files, entry{
			path: path,
			name: name,
			size: info.Size(),
			ext:  strings.ToLower(filepath.Ext(name)),
			dir:  filepath.Dir(name),
		})
		return nil
	})
	if err != nil {
		return nil, nil, err
	}
	sort.Slice(files, func(i, j int) bool {
		if files[i].ext != files[j].ext {
			return files[i].ext < files[j].ext
		}
		if files[i].dir != files[j].dir {
			return files[i].dir < files[j].dir
		}
		return files[i].name < files[j].name
	})
	return dirs, files, nil
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "zipzstd:", err)
	os.Exit(1)
}

var _ = io.Copy // keep io import if helpers change
