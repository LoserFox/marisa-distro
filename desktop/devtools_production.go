// production 构建下 wails 关闭 DevTools（openDevTools 为 no-op、
// PutAreDevToolsEnabled(false)），托盘菜单项随之隐藏。
//
//go:build production

package main

const devToolsAvailable = false
