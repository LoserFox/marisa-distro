// 三级启动状态机（normal → minimal → rescue）的常量与持久状态。
//
// 状态文件放在日志目录（backend 树之外），恢复/重解包不会清掉它；冷启动
// 读到 stage=rescue 时直接进急救页，避免每次开机都重复等待两轮失败。
package main

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"time"
)

const (
	// normal 阶段连续启动失败多少次后降级极简模式（base+web-app，无 marisa 插件）。
	normalFailuresBeforeMinimal = 2
	// minimal 阶段连续启动失败多少次后进入急救模式（壳层自带页面）。
	minimalFailuresBeforeRescue = 2
	// 极简模式使用的 profile：harness 内置模板（@deepseek-ai/dsh-base +
	// @deepseek-ai/dsh-web-app），不加载任何 marisa 插件与非核心组合。
	minimalBootProfile = "web"
	// 注入 launcher.cmd 的环境变量：覆盖 --profile 名。
	bootProfileEnv = "MARISA_BOOT_PROFILE"
)

// bootStage 标识当前启动阶段。
type bootStage string

const (
	stageNormal  bootStage = "normal"
	stageMinimal bootStage = "minimal"
	stageRescue  bootStage = "rescue"
)

// rescueState 是跨进程持久化的启动阶段状态。
type rescueState struct {
	Stage     bootStage `json:"stage"`
	LastError string    `json:"lastError,omitempty"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// rescueStatePath 返回状态文件路径（与桌面日志同目录，backend 树之外）。
func rescueStatePath() (string, error) {
	dir, err := appLogDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "rescue-state.json"), nil
}

// loadRescueState 读取持久状态；缺失/损坏按 normal 处理（启动失败后会在
// 新位置重新写入，不会被一次坏文件永久锁死）。
func loadRescueState() rescueState {
	path, err := rescueStatePath()
	if err != nil {
		return rescueState{Stage: stageNormal}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return rescueState{Stage: stageNormal}
	}
	var s rescueState
	if err := json.Unmarshal(data, &s); err != nil {
		return rescueState{Stage: stageNormal}
	}
	return s
}

// saveRescueState 持久化当前阶段与最近一次启动失败原因。
func saveRescueState(stage bootStage, lastErr error) {
	path, err := rescueStatePath()
	if err != nil {
		return
	}
	s := rescueState{Stage: stage, UpdatedAt: time.Now()}
	if lastErr != nil {
		s.LastError = lastErr.Error()
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		log.Printf("save rescue state: %v", err)
	}
}

// applyBootProfile 按阶段设置/清除注入 launcher 的 profile 选择：
// normal 用 marisa 完整组合；minimal 用 harness 内置 web 模板。
func applyBootProfile(stage bootStage) {
	if stage == stageMinimal {
		os.Setenv(bootProfileEnv, minimalBootProfile)
	} else {
		os.Unsetenv(bootProfileEnv)
	}
}
