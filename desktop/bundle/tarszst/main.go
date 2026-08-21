// tarszst — write a directory tree as a single-stream tar.zst archive.
// Replaces zipzstd in make-bundle.ps1: one zstd stream over the whole tree
// (sorted so similar files are adjacent) beats per-file zip compression on
// both ratio and speed — the 16MB window dedups across files, and there is
// no per-entry encoder or CRC overhead. Decoding is a single sequential
// zstd stream (~1GB/s), which the desktop extractor consumes directly.
//
// Usage: tarszst <srcDir> <outTarZst>
//
// Deterministic output: entries are sorted by (ext, dir, name) and all
// metadata is normalized (ModTime=epoch, Uid/Gid 0, mode 0644/0755), so the
// same input tree produces a byte-identical archive.
package main

import (
	"archive/tar"
	"bufio"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"sort"
	"strings"
	"time"

	"github.com/klauspost/compress/zstd"
)

type item struct {
	path string
	name string
	size int64
	dir  bool
	ext  string
	dirP string
}

func main() {
	flag.Parse()
	args := flag.Args()
	if len(args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: tarszst <srcDir> <outTarZst>")
		os.Exit(2)
	}
	src, out := args[0], args[1]

	debug.SetGCPercent(400)

	items, err := collect(src)
	if err != nil {
		fatal(err)
	}

	f, err := os.Create(out)
	if err != nil {
		fatal(err)
	}
	bw := bufio.NewWriterSize(f, 4<<20)
	enc, err := zstd.NewWriter(bw,
		zstd.WithEncoderLevel(zstd.EncoderLevelFromZstd(8)), // zstd -8 sweet spot
		zstd.WithEncoderConcurrency(runtime.GOMAXPROCS(0)),  // block-parallel
		// 16MB window: larger windows (128MB) shrink the archive further but
		// far-distance matches make DECODING several times slower — and
		// install time matters more than download size (measured 2026-08-18:
		// 108MB archive @128MB window decoded in 23.6s vs 16MB window's ~5s).
		zstd.WithWindowSize(16<<20),
		zstd.WithEncoderCRC(false), // tar carries no CRC anyway
	)
	if err != nil {
		fatal(err)
	}
	tw := tar.NewWriter(enc)

	epoch := time.Unix(0, 0)
	files := 0
	dirs := 0
	for _, it := range items {
		if it.dir {
			err := tw.WriteHeader(&tar.Header{
				Name:     it.name + "/",
				Typeflag: tar.TypeDir,
				Mode:     0o755,
				ModTime:  epoch,
			})
			if err != nil {
				fatal(err)
			}
			dirs++
			continue
		}
		err := tw.WriteHeader(&tar.Header{
			Name:     it.name,
			Typeflag: tar.TypeReg,
			Mode:     0o644,
			Size:     it.size,
			ModTime:  epoch,
		})
		if err != nil {
			fatal(err)
		}
		in, err := os.Open(it.path)
		if err != nil {
			fatal(err)
		}
		// Guard against the file changing between collect() and open (hard
		// links into the pnpm store can be rewritten mid-build): a stale
		// Size header would abort the whole stream with "write too long".
		if fi, statErr := in.Stat(); statErr == nil && fi.Size() != it.size {
			in.Close()
			fatal(fmt.Errorf("file changed size during archive: %s (%d -> %d)", it.name, it.size, fi.Size()))
		}
		if _, err := io.Copy(tw, in); err != nil {
			in.Close()
			fatal(fmt.Errorf("write %s: %w", it.name, err))
		}
		in.Close()
		files++
	}
	if err := tw.Close(); err != nil {
		fatal(err)
	}
	if err := enc.Close(); err != nil {
		fatal(err)
	}
	if err := bw.Flush(); err != nil {
		fatal(err)
	}
	if err := f.Close(); err != nil {
		fatal(err)
	}

	size, _ := os.Stat(out)
	fmt.Printf("tarszst: %d files (%d dirs) -> %s (%.1f MB)\n",
		files, dirs, out, float64(size.Size())/1e6)
}

// collect walks src and returns directories (walk order) followed by files
// sorted by (ext, dir, name) so similar content is adjacent in the stream.
func collect(src string) ([]item, error) {
	var dirs []item
	var files []item
	err := filepath.WalkDir(src, func(path string, d os.DirEntry, walkErr error) error {
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
			dirs = append(dirs, item{name: name, dir: true})
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		files = append(files, item{
			path: path,
			name: name,
			size: info.Size(),
			ext:  strings.ToLower(filepath.Ext(name)),
			dirP: filepath.Dir(name),
		})
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(files, func(i, j int) bool {
		if files[i].ext != files[j].ext {
			return files[i].ext < files[j].ext
		}
		if files[i].dirP != files[j].dirP {
			return files[i].dirP < files[j].dirP
		}
		return files[i].name < files[j].name
	})
	return append(dirs, files...), nil
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "tarszst:", err)
	os.Exit(1)
}
