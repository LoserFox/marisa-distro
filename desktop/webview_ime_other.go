// WebView2 IME 候选框定位补偿的非 Windows 占位：事件与机制均为 Windows
// 专属（TSF 坐标换算），其他平台无此问题，注册为空操作。
//
//go:build !windows

package main

import "github.com/wailsapp/wails/v3/pkg/application"

func registerWebviewImeKeepalive(_ *application.WebviewWindow) {}
