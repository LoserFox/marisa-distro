// extractprofile — extract a marisa profile bundle (single-stream tar.zst,
// written by desktop/bundle/tarszst) and recreate the workspace junctions
// recorded in LINKS.json, exactly like the desktop shell's extractor.
//
// This is the extraction front of the PROFILE distribution: terminal users
// download Marisa-DSH-profile-<ver>-win-x64.tar.zst + this exe, then:
//
//	extract-marisa.exe <bundle.tar.zst>          (dest = <bundle dir>\marisa)
//	extract-marisa.exe <bundle.tar.zst> <dest-dir>
//	extract-marisa.exe -force <bundle.tar.zst> <dest-dir>
//
// Semantics (data safety is the priority):
//   - dest missing                       -> fresh extraction
//     (staged in dest+".extracting", then atomically swapped in)
//   - dest/VERSION == bundle VERSION     -> up to date; junctions are still
//     re-created (idempotent), mirroring the shell's ensureBackend
//   - dest/VERSION differs               -> REFUSE by default: the bundle's
//     .dsh (bundled profile home) holds the user's sessions, so overwriting
//     would lose them. Extract into a NEW directory — that is the supported
//     upgrade path. -force overrides and removes the old dest.
package main

import (
	"archive/tar"
	"bytes"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/klauspost/compress/zstd"
)

func usage() {
	fmt.Fprintln(os.Stderr, "usage: extract-marisa.exe [-force] <bundle.tar.zst> [dest-dir]")
	os.Exit(2)
}

func main() {
	force := flag.Bool("force", false, "replace an existing dest with a different VERSION (removes its .dsh user data)")
	flag.Parse()
	args := flag.Args()
	if len(args) < 1 || len(args) > 2 {
		usage()
	}
	bundlePath := args[0]
	dest := ""
	if len(args) == 2 {
		dest = args[1]
	} else {
		dest = filepath.Join(filepath.Dir(bundlePath), "marisa")
	}
	dest, err := filepath.Abs(dest)
	if err != nil {
		fatal(err)
	}

	data, err := os.ReadFile(bundlePath)
	if err != nil {
		fatal(err)
	}
	bundleVersion, err := peekVersion(data)
	if err != nil {
		fatal(fmt.Errorf("read bundle VERSION: %w", err))
	}
	fmt.Printf("bundle: %s (%d bytes, VERSION %q)\n", bundlePath, len(data), bundleVersion)

	existingVersion, cliOK := inspectDest(dest)
	switch {
	case existingVersion == "":
		fmt.Printf("installing into %s\n", dest)
	case existingVersion == bundleVersion && cliOK:
		fmt.Printf("already up to date at %s (VERSION %q); re-creating workspace links\n", dest, bundleVersion)
		created, err := recreateLinks(filepath.Join(dest, "LINKS.json"), dest)
		if err != nil {
			fatal(fmt.Errorf("recreate links: %w", err))
		}
		fmt.Printf("done: %d links ok\n", created)
		return
	case !*force:
		fatal(fmt.Errorf(
			"refusing to overwrite %s (has VERSION %q, bundle is %q).\n"+
				"  The directory owns its .dsh user data (sessions). Extract into a NEW\n"+
				"  directory — the supported upgrade path keeps old data untouched.\n"+
				"  Pass -force to replace it anyway (old .dsh is removed).",
			dest, existingVersion, bundleVersion))
	default:
		fmt.Printf("-force: replacing %s (VERSION %q, old .dsh user data will be removed)\n", dest, existingVersion)
	}

	count, err := extractTo(data, dest)
	if err != nil {
		fatal(err)
	}
	fmt.Printf("done: %d files extracted to %s\n", count, dest)
}

// peekVersion reads the VERSION entry from the tar head. Entries are sorted
// (tarszst), so VERSION sits near the start; decoding the prefix is cheap.
func peekVersion(data []byte) (string, error) {
	zr, err := zstd.NewReader(bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	defer zr.Close()
	tr := tar.NewReader(zr)
	for {
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			return "", nil
		}
		if err != nil {
			return "", err
		}
		if hdr.Name == "VERSION" {
			buf := make([]byte, hdr.Size)
			_, err := io.ReadFull(tr, buf)
			return string(buf), err
		}
	}
}

// inspectDest reports an existing extraction's VERSION marker and whether its
// CLI entry point is present (a crash-safe completeness probe).
func inspectDest(dest string) (version string, cliOK bool) {
	if v, err := os.ReadFile(filepath.Join(dest, "VERSION")); err == nil {
		version = string(v)
	}
	_, err := os.Stat(filepath.Join(dest, "marisa-distro", "harness", "apps", "cli", "lib", "bin.js"))
	cliOK = err == nil
	return version, cliOK
}

// extractTo materializes the bundle into dest via a sibling staging dir and
// an atomic swap: a failure or crash leaves the previous dest intact.
func extractTo(data []byte, dest string) (int, error) {
	staging := dest + ".extracting"
	if err := os.RemoveAll(staging); err != nil {
		return 0, err
	}
	if err := os.MkdirAll(staging, 0o755); err != nil {
		return 0, err
	}

	next := int64(5)
	count, err := extractTarZst(data, staging, func(consumed, total int64) {
		pct := consumed * 100 / total
		if pct >= next {
			fmt.Printf("\rextracting %d%%", pct)
			next = pct - pct%5 + 5
		}
	})
	fmt.Print("\r              \r")
	if err != nil {
		_ = os.RemoveAll(staging)
		return 0, fmt.Errorf("extract: %w", err)
	}
	if err := os.RemoveAll(dest); err != nil {
		_ = os.RemoveAll(staging)
		return 0, fmt.Errorf("remove old dest: %w", err)
	}
	if err := os.Rename(staging, dest); err != nil {
		_ = os.RemoveAll(staging)
		return 0, fmt.Errorf("swap staging into place: %w", err)
	}
	// LINKS.json junctions are recreated AFTER the swap: their targets are
	// absolute paths under the FINAL dest (creating them inside the staging
	// dir would leave every junction pointing at the dead .extracting path).
	created, err := recreateLinks(filepath.Join(dest, "LINKS.json"), dest)
	if err != nil {
		return 0, fmt.Errorf("recreate links: %w", err)
	}
	fmt.Printf("workspace links: %d created\n", created)
	return count, nil
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "extract-marisa:", err)
	os.Exit(1)
}
