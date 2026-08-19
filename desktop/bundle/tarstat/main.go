// tarstat — stream a tar.zst archive and report unpacked size distribution.
// Read-only analysis tool: decodes sequentially, never buffers the whole
// archive and never writes unpacked data to disk.
//
// Usage: tarstat <archive.tar.zst>
//
// Reports:
//   - total unpacked bytes / file count
//   - per top-level directory (first path segment)
//   - per extension (lowercased; dotfiles and ext-less files -> "(none)")
//   - per node_modules package (first segment after the LAST "node_modules/",
//     "@scope/name" counted as one unit) aggregated across all roots
//   - top 30 largest single files
package main

import (
	"archive/tar"
	"bufio"
	"container/heap"
	"fmt"
	"io"
	"os"
	"path"
	"sort"
	"strings"

	"github.com/klauspost/compress/zstd"
)

const topFilesN = 30

type fileEnt struct {
	name string
	size int64
}

// minHeap keeps the N largest files seen so far (min-heap by size).
type minHeap []fileEnt

func (h minHeap) Len() int            { return len(h) }
func (h minHeap) Less(i, j int) bool  { return h[i].size < h[j].size }
func (h minHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *minHeap) Push(x any)         { *h = append(*h, x.(fileEnt)) }
func (h *minHeap) Pop() any {
	old := *h
	n := len(old)
	it := old[n-1]
	*h = old[:n-1]
	return it
}

type kv struct {
	k string
	v int64
}

func sortedDesc(m map[string]int64) []kv {
	out := make([]kv, 0, len(m))
	for k, v := range m {
		out = append(out, kv{k, v})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].v != out[j].v {
			return out[i].v > out[j].v
		}
		return out[i].k < out[j].k
	})
	return out
}

func mib(b int64) float64 { return float64(b) / (1 << 20) }

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: tarstat <archive.tar.zst>")
		os.Exit(2)
	}
	f, err := os.Open(os.Args[1])
	if err != nil {
		fatal(err)
	}
	defer f.Close()

	zr, err := zstd.NewReader(bufio.NewReaderSize(f, 4<<20))
	if err != nil {
		fatal(err)
	}
	defer zr.Close()
	tr := tar.NewReader(zr)

	topDir := map[string]int64{}
	subDir := map[string]int64{} // second level under the dominant top dir
	extBytes := map[string]int64{}
	extCount := map[string]int64{}
	pkg := map[string]int64{}
	h := &minHeap{}
	heap.Init(h)

	var totalBytes, totalFiles int64

	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			fatal(err)
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		name := hdr.Name
		size := hdr.Size
		totalBytes += size
		totalFiles++

		// top-level directory
		if i := strings.IndexByte(name, '/'); i >= 0 {
			topDir[name[:i]] += size
			rest := name[i+1:]
			if j := strings.IndexByte(rest, '/'); j >= 0 {
				subDir[name[:i+1+j]] += size
			} else {
				subDir[name[:i]+"/(files)"] += size
			}
		} else {
			topDir["(root files)"] += size
		}

		// extension; leading-dot names with no other dot -> "(none)"
		base := path.Base(name)
		ext := strings.ToLower(path.Ext(base))
		if ext == "" || (strings.HasPrefix(base, ".") && strings.Count(base, ".") == 1) {
			ext = "(none)"
		}
		extBytes[ext] += size
		extCount[ext]++

		// node_modules package (attribute nested deps to the innermost package)
		if idx := strings.LastIndex(name, "node_modules/"); idx >= 0 {
			rest := name[idx+len("node_modules/"):]
			parts := strings.SplitN(rest, "/", 3)
			if len(parts) >= 2 {
				name0 := parts[0]
				if strings.HasPrefix(name0, "@") {
					name0 = name0 + "/" + parts[1]
				}
				pkg[name0] += size
			}
		}

		heap.Push(h, fileEnt{name, size})
		if h.Len() > topFilesN {
			heap.Pop(h)
		}
	}

	topFiles := make([]fileEnt, 0, h.Len())
	for h.Len() > 0 {
		topFiles = append(topFiles, heap.Pop(h).(fileEnt))
	}
	sort.Slice(topFiles, func(i, j int) bool { return topFiles[i].size > topFiles[j].size })

	st, _ := os.Stat(os.Args[1])
	fmt.Printf("archive: %s (%.1f MiB compressed)\n", os.Args[1], mib(st.Size()))
	fmt.Printf("unpacked: %.1f MiB in %d files\n\n", mib(totalBytes), totalFiles)

	fmt.Println("== top-level directories ==")
	for _, e := range sortedDesc(topDir) {
		fmt.Printf("%9.1f MiB  %s\n", mib(e.v), e.k)
	}

	fmt.Println("\n== second-level directories (top 15) ==")
	for i, e := range sortedDesc(subDir) {
		if i >= 15 {
			break
		}
		fmt.Printf("%9.1f MiB  %s\n", mib(e.v), e.k)
	}

	fmt.Println("\n== extensions (top 20 by bytes) ==")
	for i, e := range sortedDesc(extBytes) {
		if i >= 20 {
			break
		}
		fmt.Printf("%9.1f MiB  %7d files  %s\n", mib(e.v), extCount[e.k], e.k)
	}

	fmt.Println("\n== node_modules packages (top 30 by bytes, all roots combined) ==")
	for i, e := range sortedDesc(pkg) {
		if i >= 30 {
			break
		}
		fmt.Printf("%9.1f MiB  %s\n", mib(e.v), e.k)
	}

	fmt.Printf("\n== largest %d files ==\n", topFilesN)
	for _, e := range topFiles {
		fmt.Printf("%9.1f MiB  %s\n", mib(e.size), e.name)
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "tarstat:", err)
	os.Exit(1)
}
