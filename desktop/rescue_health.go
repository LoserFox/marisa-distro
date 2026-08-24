// 页面健康检查：壳层对 WebView2 内页面可用性的探针。
//
// 背景：三级状态机原本只看「后端进程是否发布 URL 行」——后端活着但页面
// 白屏 / JS 报错（如 client bundle 缺 inject 导致 web boot 失败）时，壳层
// 毫无感知，永不降级。这里补上页面级信号：
//
//   - 导航后壳层起 127.0.0.1 随机端口 HTTP 端点（CORS 放行），并周期性向
//     当前文档注入探针 JS（导航完成前注入会落在旧文档上，故重复注入）；
//   - 探针捕获 window error / unhandledrejection，页面 DOM 加载完成标记
//     booted，每 3s 心跳一次到壳层端点；
//   - 判定：窗口内 booted 且零错误 → 页面健康（正常返回，不报告）；
//     窗口内出现未捕获 JS 错误 → 该次启动失败（计入降级计数）；
//     窗口超时仍未 booted → 页面未加载/白屏，该次启动失败。
//
// 安全：仅绑定 127.0.0.1，只回传页面自身状态（错误次数/首条错误消息），
// 无敏感数据，不做鉴权（与后端页面同机互信）。
package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// pageBootTimeout 是页面健康检查窗口：SetURL 后等待页面加载完成且无未捕获
// JS 错误的时限。超出即视为该次启动的页面级失败。
const pageBootTimeout = 90 * time.Second

// stableRunTime 是「快速异常退出」的判定阈值：发布 URL 后 stableRunTime 内
// 异常退出计入连续失败（崩溃循环可触发降级）；长期运行后的偶发退出清零，
// 不参与降级，避免历史崩溃累积误触发。
const stableRunTime = 2 * time.Minute

// pageHealth 是一次页面健康检查会话：页面内探针心跳到本端 HTTP 端点，
// 壳层据此读取页面状态。
type pageHealth struct {
	srv    *http.Server
	addr   string // 心跳端点地址 http://127.0.0.1:<port>
	mu     sync.Mutex
	booted bool
	errs   int
	errMsg string
}

// newPageHealth 启动本端心跳端点（127.0.0.1 随机端口）。
func newPageHealth() (*pageHealth, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	p := &pageHealth{addr: ln.Addr().String()}
	mux := http.NewServeMux()
	mux.HandleFunc("/hb", p.handleHeartbeat)
	p.srv = &http.Server{Handler: mux}
	go func() {
		if err := p.srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Printf("page health server: %v", err)
		}
	}()
	return p, nil
}

// close 关闭心跳端点。
func (p *pageHealth) close() { _ = p.srv.Close() }

// handleHeartbeat 接收页面探针心跳：booted 标记 + 错误计数 + 首条错误消息。
func (p *pageHealth) handleHeartbeat(w http.ResponseWriter, r *http.Request) {
	// 页面 origin 是后端端口，壳层端点跨源，放行。
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Cache-Control", "no-store")
	q := r.URL.Query()
	p.mu.Lock()
	defer p.mu.Unlock()
	if q.Get("b") == "1" {
		p.booted = true
	}
	if e := q.Get("e"); e != "" {
		if n, err := strconv.Atoi(e); err == nil {
			p.errs = n
		}
	}
	if m := q.Get("m"); m != "" && p.errMsg == "" {
		p.errMsg = m
	}
	w.WriteHeader(http.StatusNoContent)
}

// snapshot 返回当前页面状态（booted / 错误次数 / 首条错误消息）。
func (p *pageHealth) snapshot() (booted bool, errs int, errMsg string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.booted, p.errs, p.errMsg
}

// probeJS 返回注入页面的探针脚本：捕获未捕获错误/未处理拒绝，页面加载
// 完成标记 booted，周期心跳到壳层端点。重复注入幂等（探针已装则跳过）。
func (p *pageHealth) probeJS() string {
	return fmt.Sprintf(pageProbeTemplate, "http://"+p.addr+"/hb")
}

const pageProbeTemplate = `(function(){
if(window.__marisaProbe)return;
var P=window.__marisaProbe={b:false,e:0,m:''};
window.addEventListener('error',function(x){P.e++;if(!P.m){try{P.m=String(x&&x.message||x&&x.error||x)||'script error';}catch(_){P.m='?';}}},true);
window.addEventListener('unhandledrejection',function(x){P.e++;if(!P.m){try{P.m=String(x&&x.reason||x)||'unhandled rejection';}catch(_){P.m='?';}}},true);
function mark(){P.b=true;}
if(document.readyState==='interactive'||document.readyState==='complete'){mark();}
else{document.addEventListener('DOMContentLoaded',mark);}
setInterval(function(){try{fetch(%q+"?b="+(P.b?1:0)+"&e="+P.e+"&m="+encodeURIComponent(P.m),{cache:'no-store'}).catch(function(){});}catch(_){}},3000);
})();`

// monitorPageHealth 驱动一次页面健康检查：重复注入探针直到收到首个心跳
// （导航完成前注入会落在旧文档上），然后按窗口内状态判定：
//
//   - booted 且零错误 → 页面健康，记录日志后正常返回（不上报失败）；
//   - 窗口内出现未捕获 JS 错误 → errCh 收到失败（页面级启动失败）；
//   - 窗口超时仍未 booted → errCh 收到失败（页面未加载/白屏）。
//
// stop 关闭即放弃检查（进程终结/应用退出）；errCh 至多收到一次失败。
// inject 由调用方绑定窗口（win.ExecJS），便于单测注入。
func monitorPageHealth(ph *pageHealth, inject func(string), stop <-chan struct{}, errCh chan<- error, timeout time.Duration) {
	defer ph.close()
	// 注入循环：导航完成前探针落在旧文档，重复注入直到检查结束。
	injectTicker := time.NewTicker(500 * time.Millisecond)
	defer injectTicker.Stop()
	// 状态评估循环：心跳到位后按 1s 粒度判定健康/失败。
	checkTicker := time.NewTicker(time.Second)
	defer checkTicker.Stop()
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	for {
		select {
		case <-stop:
			return
		case <-injectTicker.C:
			inject(ph.probeJS())
		case <-deadline.C:
			b, e, m := ph.snapshot()
			if b && e == 0 {
				log.Printf("页面健康检查通过（%s）", ph.addr)
				return
			}
			if !b {
				errCh <- fmt.Errorf("web 页面在 %s 内未加载完成（白屏或导航失败）", timeout)
			} else {
				errCh <- fmt.Errorf("web 页面 JS 报错 %d 次：%s", e, m)
			}
			return
		case <-checkTicker.C:
			b, e, m := ph.snapshot()
			if b && e == 0 {
				log.Printf("页面健康检查通过（%s）", ph.addr)
				return
			}
			if b && e > 0 {
				errCh <- fmt.Errorf("web 页面 JS 报错 %d 次：%s", e, m)
				return
			}
		}
	}
}

// exitFailureClass 判定一次后端进程终结对连续失败计数的影响：
//
//   - 干净退出（exitErr==nil）→ 清零（正常重启路径）；
//   - 用户主动重启（托盘「重启后端」）→ 清零；
//   - 发布 URL 后 stableRunTime 内的异常退出 → 计入连续失败
//     （崩溃循环因此可触发降级，不再无限重试）；
//   - 长期运行（>= stableRunTime）后的异常退出 → 清零（视为偶发）。
//
// 返回 (count, reset)，至多一项为 true。
func exitFailureClass(exitErr error, userRestart bool, ranFor time.Duration) (count bool, reset bool) {
	if exitErr == nil || userRestart {
		return false, true
	}
	if ranFor < stableRunTime {
		return true, false
	}
	return false, true
}
