package main

import (
	"fmt"
	"log"
	"os"
	"time"
)

// extractionProgress reports embedded-backend extraction progress: a
// Chinese in-place percentage line on a real terminal (launched from a
// console), or 10%-step log lines when stdout is not a terminal (launched
// from Explorer / desktop). The first standalone launch unpacks ~45k files,
// which takes 10-30s with no output unless something says otherwise.
type extractionProgress struct {
	total    int64
	lastPct  int64
	terminal bool
	started  time.Time
}

// newExtractionProgress detects whether stdout is a char device (a console)
// and prepares progress reporting over the given compressed byte total.
func newExtractionProgress(total int64) *extractionProgress {
	terminal := false
	if fi, err := os.Stdout.Stat(); err == nil && fi.Mode()&os.ModeCharDevice != 0 {
		terminal = true
	}
	return &extractionProgress{total: total, terminal: terminal}
}

// start announces the unpack phase before the first byte is written.
func (p *extractionProgress) start() {
	p.started = time.Now()
	if p.terminal {
		fmt.Fprint(os.Stdout, "正在解压运行环境… 0%\r")
	} else {
		log.Printf("解压运行环境开始（%d 字节）", p.total)
	}
}

// report renders one progress tick. consumed counts compressed bytes read
// from the bundle; pct is throttled to whole-percent changes so 45k entries
// do not spam the console.
func (p *extractionProgress) report(consumed, total int64) {
	if total <= 0 {
		return
	}
	pct := consumed * 100 / total
	if pct == p.lastPct {
		return
	}
	p.lastPct = pct
	if p.terminal {
		fmt.Fprintf(os.Stdout, "正在解压运行环境… %d%%\r", pct)
	} else if pct%10 == 0 {
		log.Printf("解压进度：%d%%", pct)
	}
}

// done clears the progress line and reports completion with the entry count.
func (p *extractionProgress) done(entries int) {
	elapsed := time.Since(p.started).Round(100 * time.Millisecond)
	if p.terminal {
		fmt.Fprintf(os.Stdout, "解压完成：%d 个文件（%s）\n", entries, elapsed)
	} else {
		log.Printf("解压完成：%d 个文件（%s）", entries, elapsed)
	}
}
