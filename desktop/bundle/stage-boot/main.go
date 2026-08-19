// stage-boot — verify a make-bundle STAGED tree without repacking: recreate
// the LINKS.json junctions, boot the backend from the stage, POST
// host.describe, and exit 0 only when the handshake field canOpenPath is
// present. This is the fast iteration loop for bundle-content bugs (a full
// make-bundle run costs ~10 minutes; this costs seconds).
//
// Usage: stage-boot <stageDir>
package main

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/Microsoft/go-winio"
	"golang.org/x/sys/windows"
)

const fsctlSetReparsePoint = 0x000900A4

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: stage-boot <stageDir>")
		os.Exit(2)
	}
	stage := os.Args[1]

	if err := recreateLinks(filepath.Join(stage, "LINKS.json"), stage); err != nil {
		fatal(err)
	}

	// Launch the bundled backend (same shape as desktop launcher.cmd).
	cmd := exec.Command(filepath.Join(stage, "node.exe"),
		filepath.Join(stage, "marisa-distro", "harness", "apps", "cli", "lib", "bin.js"),
		"--profile", "marisa",
		"--patch", filepath.Join(stage, ".dsh", "profiles", "marisa", "desktop.overlay.yml"),
		"--patch", filepath.Join(stage, ".dsh", "profiles", "marisa", "standalone.overlay.yml"))
	cmd.Dir = filepath.Join(stage, "marisa-distro", "harness")
	cmd.Env = append(os.Environ(), "DSH_HOME="+filepath.Join(stage, ".dsh"))
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		fatal(err)
	}
	if err := cmd.Start(); err != nil {
		fatal(err)
	}
	defer func() {
		_ = exec.Command("taskkill", "/PID", fmt.Sprint(cmd.Process.Pid), "/T", "/F").Run()
	}()

	// Wait for the URL line.
	urlCh := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 64*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "dsh web: ") {
				urlCh <- strings.TrimSpace(strings.TrimPrefix(line, "dsh web: "))
				return
			}
		}
		urlCh <- ""
	}()

	var url string
	select {
	case url = <-urlCh:
	case <-time.After(120 * time.Second):
		fatal(fmt.Errorf("backend did not publish a URL within 120s"))
	}
	if url == "" {
		fatal(fmt.Errorf("backend exited before publishing a URL"))
	}
	fmt.Printf("boot OK: %s\n", url)

	// Verify the handshake contract.
	body := `{"type":"client-request","rpcId":"stage-boot","method":"host.describe","payload":{}}`
	resp, err := http.Post(url+"/api/host.describe", "application/json", strings.NewReader(body))
	if err != nil {
		fatal(fmt.Errorf("host.describe: %w", err))
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != 200 {
		fatal(fmt.Errorf("host.describe status %d: %s", resp.StatusCode, raw))
	}
	if !strings.Contains(string(raw), `"canOpenPath"`) {
		fatal(fmt.Errorf("host.describe missing canOpenPath: %s", raw))
	}
	fmt.Println("handshake OK: host.describe has canOpenPath")
}

// ── junction recreation (same layout as desktop/junction_windows.go) ────────
func recreateLinks(manifestPath, root string) error {
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return fmt.Errorf("read LINKS.json: %w", err)
	}
	data = bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF})
	var entries []struct {
		Link   string `json:"link"`
		Target string `json:"target"`
	}
	if err := json.Unmarshal(data, &entries); err != nil {
		return fmt.Errorf("parse LINKS.json: %w", err)
	}
	created := 0
	for _, e := range entries {
		link := filepath.Join(root, filepath.FromSlash(e.Link))
		target := filepath.Join(root, filepath.FromSlash(e.Target))
		if err := createJunction(link, target); err != nil {
			return fmt.Errorf("junction %s: %w", e.Link, err)
		}
		created++
	}
	fmt.Printf("recreated %d junctions\n", created)
	return nil
}

func createJunction(link, target string) error {
	if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		return err
	}
	if _, err := os.Lstat(link); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.Mkdir(link, 0o755); err != nil && !os.IsExist(err) {
		return err
	}
	created := true
	defer func() {
		if created {
			_ = os.Remove(link)
		}
	}()

	absTarget, err := filepath.Abs(target)
	if err != nil {
		return err
	}
	data := winio.EncodeReparsePoint(&winio.ReparsePoint{
		Target:       filepath.Clean(absTarget),
		IsMountPoint: true,
	})
	linkPtr, err := windows.UTF16PtrFromString(link)
	if err != nil {
		return err
	}
	h, err := windows.CreateFile(linkPtr,
		windows.GENERIC_WRITE,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		nil, windows.OPEN_EXISTING, 0x00200000|0x02000000, 0)
	if err != nil {
		return fmt.Errorf("open link dir %s: %w", link, err)
	}
	defer windows.CloseHandle(h)

	var returned uint32
	dataLen := binary.LittleEndian.Uint16(data[4:6])
	if err := windows.DeviceIoControl(h, fsctlSetReparsePoint,
		&data[0], uint32(8)+uint32(dataLen), nil, 0, &returned, nil); err != nil {
		return fmt.Errorf("set reparse point %s -> %s: %w", link, absTarget, err)
	}
	created = false
	return nil
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "stage-boot:", err)
	os.Exit(1)
}
