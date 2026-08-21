// 命令行启动阶段覆盖（--minimal / --rescue）的单测。
package main

import (
	"os"
	"testing"
)

// TestParseBootFlags 验证 --minimal / --rescue 的解析与未知参数忽略。
func TestParseBootFlags(t *testing.T) {
	orig := forcedBootStage
	origArgs := os.Args
	defer func() {
		forcedBootStage = orig
		os.Args = origArgs
	}()

	cases := []struct {
		name string
		args []string
		want bootStage
	}{
		{"无参数", []string{"Marisa-DSH.exe"}, ""},
		{"--minimal", []string{"Marisa-DSH.exe", "--minimal"}, stageMinimal},
		{"--rescue", []string{"Marisa-DSH.exe", "--rescue"}, stageRescue},
		{"--console 与 --minimal 并存", []string{"Marisa-DSH.exe", "--console", "--minimal"}, stageMinimal},
		{"未知参数忽略", []string{"Marisa-DSH.exe", "--whatever"}, ""},
		{"未知参数在前", []string{"Marisa-DSH.exe", "--whatever", "--rescue"}, stageRescue},
		{"--minimal 后 --rescue 覆盖", []string{"Marisa-DSH.exe", "--minimal", "--rescue"}, stageRescue},
	}
	for _, c := range cases {
		forcedBootStage = ""
		os.Args = c.args
		parseBootFlags()
		if forcedBootStage != c.want {
			t.Errorf("%s: forcedBootStage = %q, want %q", c.name, forcedBootStage, c.want)
		}
	}
}
