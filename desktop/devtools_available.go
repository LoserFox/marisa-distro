// DevTools 可用性：非 production 构建编译 wails 的 WebView2 DevTools 实现
// （PutAreDevToolsEnabled(true)），托盘菜单「打开 DevTools」因此生效。
// 现行全部构建（dev 壳、MSI 的 installedbundle）都不带 production tag，
// 属于此分支。
//
//go:build !production

package main

const devToolsAvailable = true
