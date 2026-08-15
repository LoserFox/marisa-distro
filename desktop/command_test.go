package main

import (
	"os"
	"reflect"
	"testing"
)

func TestParseCommandLine(t *testing.T) {
	cases := []struct {
		line string
		want []string
	}{
		{"dsh web --port 0", []string{"dsh", "web", "--port", "0"}},
		{`"C:\Program Files\dsh\bin\dsh.cmd" web --port 0`, []string{`C:\Program Files\dsh\bin\dsh.cmd`, "web", "--port", "0"}},
		{"node C:\\checkout\\bin.ts web --port {port}", []string{"node", `C:\checkout\bin.ts`, "web", "--port", "{port}"}},
		{"", nil},
		{"   ", nil},
	}
	for _, c := range cases {
		got := parseCommandLine(c.line)
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("parseCommandLine(%q) = %#v, want %#v", c.line, got, c.want)
		}
	}
}

func TestWebCommandLine(t *testing.T) {
	t.Setenv("DSH_WEB_CMD", "")
	if got, want := webCommandLine("0"), "dsh web --port 0"; got != want {
		t.Errorf("default: got %q, want %q", got, want)
	}
	t.Setenv("DSH_WEB_CMD", `node "C:\my checkout\bin.ts" web --port {port}`)
	if got, want := webCommandLine("8080"), `node "C:\my checkout\bin.ts" web --port 8080`; got != want {
		t.Errorf("override: got %q, want %q", got, want)
	}
	_ = os.Getenv // keep os import if unused paths change
}
