globalThis.__dshChunks__ = globalThis.__dshChunks__ || {};
globalThis.__dshChunks__["docx"] = (require) => {
	var module = { exports: {} };
	var exports = module.exports;
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region \0rolldown/runtime.js
	var __create = Object.create;
	var __defProp = Object.defineProperty;
	var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
	var __getOwnPropNames = Object.getOwnPropertyNames;
	var __getProtoOf = Object.getPrototypeOf;
	var __hasOwnProp = Object.prototype.hasOwnProperty;
	var __esmMin = (fn, res, err) => () => {
		if (err) throw err[0];
		try {
			return fn && (res = fn(fn = 0)), res;
		} catch (e) {
			throw err = [e], e;
		}
	};
	var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
	var __exportAll = (all, no_symbols) => {
		let target = {};
		for (var name in all) __defProp(target, name, {
			get: all[name],
			enumerable: true
		});
		if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
		return target;
	};
	var __copyProps = (to, from, except, desc) => {
		if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
			key = keys[i];
			if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
				get: ((k) => from[k]).bind(null, key),
				enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
			});
		}
		return to;
	};
	var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
		value: mod,
		enumerable: true
	}) : target, mod));
	//#endregion
	let react = require("react");
	let react_jsx_runtime = require("react/jsx-runtime");
	//#region src/client/api.ts
	/** Absolute URL of the media route for one path (images only). */
	function mediaUrl(scope, path) {
		return fileUrl(scope, path, false);
	}
	/** Absolute URL of the download route: serves raw bytes (binary-safe) with
	*  `Content-Disposition: attachment`, so the browser saves the file. */
	function downloadUrl(scope, path) {
		return fileUrl(scope, path, true);
	}
	/** Shared URL builder for the /sidebar/file route (media vs download). */
	function fileUrl(scope, path, download) {
		const params = new URLSearchParams({
			sessionId: scope.sessionId,
			path
		});
		if (scope.cwd !== void 0 && scope.cwd !== "") params.set("cwd", scope.cwd);
		if (download) params.set("download", "1");
		return `/sidebar/file?${params.toString()}`;
	}
	//#endregion
	//#region src/client/locales.ts
	/**
	* Minimal zh/en copy for the sidebar. The copy follows the DSH i18n system:
	* the client apply attaches the locale service (`ctx.locale`, provided by
	* `@deepseek-ai/dsh-client-locale`) through {@link attachLocale}, and
	* `t()`/`isZh()` resolve the active locale from it — the Host-backed
	* `locale.preference` wins over the raw browser language and switches live.
	* Without an attached service (standalone/test compositions) the browser
	* language is used, matching the previous behavior. The dictionaries are
	* also registered into the DSH locale registry under {@link LOCALE_NS}.
	*/
	/** The zh dictionary (also registered into the DSH locale registry under {@link LOCALE_NS}). */
	const zh = {
		explorer: "资源管理器",
		git: "源代码管理",
		terminal: "终端",
		editor: "编辑器",
		newTab: "新建标签页",
		openExplorer: "资源管理器",
		openGit: "Git 面板",
		newTerminal: "新终端",
		terminalLimit: "终端数量已达上限 (3)",
		close: "关闭",
		collapse: "折叠侧边栏",
		expand: "展开侧边栏",
		collapseBottomPanel: "折叠底部面板",
		expandBottomPanel: "展开底部面板",
		terminalError: "终端连接失败",
		terminalConnectFailed: "终端多次连接失败",
		terminalRetry: "重试",
		preview: "预览",
		edit: "编辑",
		refresh: "刷新",
		save: "保存",
		saved: "已保存",
		unsaved: "未保存",
		saveFailed: "保存失败",
		truncation: "文件过大，仅显示前 512KB",
		binary: "二进制文件，无法预览",
		loading: "加载中…",
		error: "加载失败",
		retry: "重试",
		splitLeft: "向左分栏",
		splitRight: "向右分栏",
		splitUp: "向上分栏",
		splitDown: "向下分栏",
		notRepo: "当前目录不是 git 仓库",
		noChanges: "没有变更",
		stage: "暂存",
		unstage: "取消暂存",
		stageAll: "全部暂存",
		unstageAll: "全部取消暂存",
		commitPlaceholder: "提交信息 (Ctrl+Enter)",
		commit: "提交",
		commitError: "提交失败",
		branch: "分支",
		checkoutError: "切换分支失败",
		history: "历史",
		changes: "变更",
		staged: "已暂存",
		unstaged: "未暂存",
		cancel: "取消",
		diffEmpty: "没有文本差异",
		diffLoadError: "加载差异失败",
		diffBinary: "二进制",
		diffAdded: "新增",
		diffDeleted: "删除",
		diffRenamed: "重命名",
		diffExpand: "展开其余 {count} 行",
		diffCollapse: "收起",
		discard: "放弃更改",
		discardTitle: "放弃更改",
		discardDesc: "将丢弃「{path}」的工作区修改（不可恢复）。",
		viewCommitDiff: "查看提交差异",
		copyShortHash: "复制短哈希",
		copyFullHash: "复制完整哈希",
		copySubject: "复制提交信息",
		revertCommit: "还原此提交",
		revertTitle: "还原此提交",
		revertDesc: "将在当前分支创建一个反转「{subject}」的新提交。",
		cherryPickCommit: "捡取此提交",
		cherryPickTitle: "捡取此提交",
		cherryPickDesc: "将「{subject}」的更改应用到当前分支。",
		timeJustNow: "刚刚",
		timeMinutesAgo: "{n} 分钟前",
		timeHoursAgo: "{n} 小时前",
		timeYesterday: "昨天",
		loadMore: "加载更多",
		historyLoadError: "加载更多历史失败",
		produced: "本次产出",
		producedOpen: "在侧边栏中打开",
		disconnected: "终端连接断开，重连中…",
		exited: "终端进程已退出",
		noSession: "选择一个会话以使用侧边栏",
		pluginNotLoaded: "插件未加载，标签页暂不可用：",
		hiddenFiles: "隐藏文件",
		parent: "上级目录",
		copied: "已复制",
		copy: "复制",
		newFile: "新文件",
		openEditor: "打开编辑器",
		gitDetail: "查看变更详情",
		referenceFile: "@文件",
		addToConversation: "添加到对话",
		copyRelative: "复制相对地址",
		copyAbsolute: "复制绝对地址",
		download: "下载",
		settingsNav: "侧边卡片",
		settingsOpenTitle: "新会话默认打开",
		settingsOpenDesc: "新建会话时自动展开侧边卡片；已存在的会话保持各自布局",
		settingsWidthTitle: "默认宽度占比",
		settingsWidthDesc: "新建会话时侧边卡片占窗口宽度的百分比 (20–60)",
		settingsWidthSuffix: "%",
		settingsOpenPathTitle: "聊天区文件在侧边栏打开",
		settingsOpenPathDesc: "在聊天里点击文件链接（工具行、产物列表、文件提及）时，在侧边栏编辑器中打开，不再调用系统默认应用",
		settingsSaveFailed: "保存失败",
		settingsConflict: "设置已被其他窗口修改，请重试",
		binaryNoPreview: "此文件类型不支持预览",
		downloadToView: "下载查看",
		officeTooLarge: "文件过大，无法预览",
		officeCorrupt: "文件损坏或格式无效",
		officeEncrypted: "不支持加密文件",
		officeLoadFailed: "Office 预览组件加载失败",
		previousSlide: "上一页",
		nextSlide: "下一页",
		zoom: "缩放",
		zoomHint: "Alt + 滚轮",
		settingsSubagentTitle: "检测到子代理时自动展开任务管理页",
		settingsSubagentDesc: "当前会话产生新的子代理时，自动展开侧边栏并打开任务管理页；关闭后需手动打开",
		settingsJobsTitle: "有新后台任务时自动展开后台任务页",
		settingsJobsDesc: "当前会话出现新的后台任务时，自动展开侧边栏并打开后台任务页（每个新任务都会触发）；关闭后需手动打开",
		settingsToolsTitle: "为模型注入终端工具",
		settingsToolsDesc: "开启后，模型可通过 terminal_create 等 8 个工具创建并操作侧边栏终端（默认关闭）",
		settingsBottomTerminalTitle: "底部面板首次展开自动开终端",
		settingsBottomTerminalDesc: "每次会话中第一次展开底部面板时，尝试在底部面板自动打开一个新终端标签（终端数量上限仍会限制；默认开启）",
		settingsTabsTitle: "侧边栏内容",
		settingsViewersTitle: "文件预览",
		settingsGeneralTitle: "常规",
		settingsPopup: "功能设置",
		settingsViewerCatchAll: "兜底：任意文件",
		viewerImage: "图片",
		viewerPdf: "PDF",
		viewerDocx: "Word 文档",
		viewerXlsx: "Excel 表格",
		viewerPptx: "PPT 演示",
		viewerMarkdown: "Markdown",
		viewerCode: "代码",
		viewerBinary: "二进制下载",
		viewerHtml: "HTML",
		browser: "浏览器",
		browserPlaceholder: "输入网址，例如 example.com",
		browserGo: "前往",
		browserBack: "后退",
		browserForward: "前进",
		browserStart: "输入网址开始浏览（沙箱模式）",
		browserBlockedScheme: "已阻止：仅支持 http/https 链接",
		browserBlockedLoopback: "已阻止：不允许在浏览器中访问本机或内部地址",
		browserInvalid: "无效的网址",
		browserNoSandboxWarning: "沙箱已关闭：当前页面与界面同源，拥有完整会话权限（可在设置中恢复）",
		htmlNoSandboxWarning: "沙箱已关闭：此 HTML 与界面同源，可读取会话文件与内部接口（可在设置中恢复）",
		sandboxStatusOn: "沙箱模式：已启用 · 页面无法访问界面数据与本地文件，登录态与第三方 Cookie 可能不可用",
		sandboxUnlock: "临时解锁（不安全）",
		sandboxRestore: "恢复沙箱",
		settingsHtmlDefaultUnsafeTitle: "HTML 预览默认以非沙箱模式打开（不安全）",
		settingsHtmlDefaultUnsafeDesc: "开启后，每次打开 HTML 文件时预览默认处于非沙箱状态（与界面同源，可读取会话文件与内部接口）；可在状态行临时恢复沙箱",
		settingsHtmlSandboxTitle: "关闭 HTML 预览沙箱（不安全）",
		settingsHtmlSandboxDesc: "关闭后，预览的 HTML 将与界面同源运行，可读取会话文件、本地存储并调用内部接口。仅对完全可信的文件开启",
		settingsBrowserSandboxTitle: "关闭浏览器沙箱（不安全）",
		settingsBrowserSandboxDesc: "关闭后，访问的任何网站都将与界面同源运行，可读取会话数据并冒充你的登录状态。仅对完全可信的站点开启",
		settingsBrowserLinksTitle: "聊天区外链在侧边栏打开",
		settingsBrowserLinksDesc: "开启后，点击聊天或界面中的 http/https 外链时在侧边栏浏览器中打开，不再弹出新窗口；Ctrl/Cmd 点击可临时放行",
		browserOpenExternal: "在浏览器中打开",
		browserEmbedBlocked: "{host} 拒绝了嵌入请求",
		browserEmbedBlockedDesc: "该站点通过 X-Frame-Options / frame-ancestors 禁止在其它页面中显示，无法在侧边栏内加载。可在浏览器中直接打开",
		browserEmbedAnyway: "仍然加载",
		subagent: "任务管理",
		openSubagent: "任务管理",
		subagentMainAgent: "主代理",
		subagentEmpty: "暂无子代理",
		subagentEmptyDesc: "当前主代理派生的子代理将显示在这里",
		subagentRunning: "运行中",
		subagentInactive: "空闲",
		subagentModeOneShot: "一次性",
		subagentModeContinuable: "可续接",
		subagentCount: "{count} 个子代理",
		subagentCountRunning: "{count} 个子代理 · {running} 运行中",
		subagentDiagCorrupt: "目录损坏",
		subagentDiagUnsupported: "不支持的条目",
		subagentDiagUnavailable: "不可用",
		subagentThinking: "思考中…",
		jobs: "后台任务",
		jobsCount: "{count} 个后台任务",
		jobsCountRunning: "{count} 个后台任务 · {running} 运行中",
		jobStatusRunning: "运行中",
		jobStatusStopping: "终止中",
		jobStatusCompleted: "已完成",
		jobStatusKilled: "已终止",
		jobStatusFailed: "失败",
		jobDurationSeconds: "{seconds} 秒",
		jobDurationMinutes: "{minutes} 分 {seconds} 秒",
		jobDurationHours: "{hours} 小时 {minutes} 分",
		jobViewOutput: "查看输出",
		jobHideOutput: "收起输出",
		jobNoOutput: "暂无输出",
		jobNotReadYet: "等待模型读取该任务的输出（模型执行 job_output 后，输出会显示在这里）",
		jobOutputTruncated: "输出过长，已截断显示",
		jobOutputError: "输出读取失败",
		jobKill: "终止",
		jobKillConfirm: "再次点击确认终止",
		jobKillError: "终止失败"
	};
	/** The en dictionary (key-set-equal to zh, enforced by the type annotation). */
	const en = {
		explorer: "Explorer",
		git: "Source Control",
		terminal: "Terminal",
		editor: "Editor",
		newTab: "New tab",
		openExplorer: "Explorer",
		openGit: "Git panel",
		newTerminal: "New terminal",
		terminalLimit: "Terminal limit reached (3)",
		close: "Close",
		collapse: "Collapse sidebar",
		expand: "Expand sidebar",
		collapseBottomPanel: "Collapse bottom panel",
		expandBottomPanel: "Expand bottom panel",
		terminalError: "Terminal connection failed",
		terminalConnectFailed: "Terminal failed to connect repeatedly",
		terminalRetry: "Retry",
		preview: "Preview",
		edit: "Edit",
		refresh: "Refresh",
		save: "Save",
		saved: "Saved",
		unsaved: "Unsaved",
		saveFailed: "Save failed",
		truncation: "File too large — showing the first 512KB",
		binary: "Binary file, preview unavailable",
		loading: "Loading…",
		error: "Failed to load",
		retry: "Retry",
		splitLeft: "Split left",
		splitRight: "Split right",
		splitUp: "Split up",
		splitDown: "Split down",
		notRepo: "This directory is not a git repository",
		noChanges: "No changes",
		stage: "Stage",
		unstage: "Unstage",
		stageAll: "Stage all",
		unstageAll: "Unstage all",
		commitPlaceholder: "Commit message (Ctrl+Enter)",
		commit: "Commit",
		commitError: "Commit failed",
		branch: "Branch",
		checkoutError: "Branch switch failed",
		history: "History",
		changes: "Changes",
		staged: "Staged",
		unstaged: "Unstaged",
		cancel: "Cancel",
		diffEmpty: "No text changes",
		diffLoadError: "Failed to load diff",
		diffBinary: "Binary",
		diffAdded: "Added",
		diffDeleted: "Deleted",
		diffRenamed: "Renamed",
		diffExpand: "Expand {count} more rows",
		diffCollapse: "Collapse",
		discard: "Discard changes",
		discardTitle: "Discard changes",
		discardDesc: "This discards the worktree changes of \"{path}\" (not recoverable).",
		viewCommitDiff: "View commit diff",
		copyShortHash: "Copy short hash",
		copyFullHash: "Copy full hash",
		copySubject: "Copy subject",
		revertCommit: "Revert commit",
		revertTitle: "Revert commit",
		revertDesc: "Create a new commit on the current branch that reverts \"{subject}\".",
		cherryPickCommit: "Cherry-pick commit",
		cherryPickTitle: "Cherry-pick commit",
		cherryPickDesc: "Apply the changes of \"{subject}\" to the current branch.",
		timeJustNow: "just now",
		timeMinutesAgo: "{n} min ago",
		timeHoursAgo: "{n} h ago",
		timeYesterday: "yesterday",
		loadMore: "Load more",
		historyLoadError: "Failed to load more history",
		produced: "Produced",
		producedOpen: "Open in sidebar",
		disconnected: "Terminal disconnected, reconnecting…",
		exited: "Terminal process exited",
		noSession: "Select a conversation to use the sidebar",
		pluginNotLoaded: "Plugin not loaded; tab unavailable:",
		hiddenFiles: "Hidden files",
		parent: "Parent directory",
		copied: "Copied",
		copy: "Copy",
		newFile: "New file",
		openEditor: "Open editor",
		gitDetail: "View change details",
		referenceFile: "@file",
		addToConversation: "Add to conversation",
		copyRelative: "Copy relative path",
		copyAbsolute: "Copy absolute path",
		download: "Download",
		settingsNav: "Side card",
		settingsOpenTitle: "Open by default for new conversations",
		settingsOpenDesc: "Expand the side card automatically for brand-new conversations; existing conversations keep their own layouts",
		settingsWidthTitle: "Default width share",
		settingsWidthDesc: "The side card's default share of the window width for new conversations (20–60)",
		settingsWidthSuffix: "%",
		settingsOpenPathTitle: "Open chat files in the sidebar",
		settingsOpenPathDesc: "Open file links in the chat (tool rows, produced files, mentions) in the sidebar editor instead of the system default app",
		settingsSaveFailed: "Failed to save",
		settingsConflict: "The setting changed in another window — please retry",
		binaryNoPreview: "This file type cannot be previewed",
		downloadToView: "Download to view",
		officeTooLarge: "File too large to preview",
		officeCorrupt: "File is corrupt or in an invalid format",
		officeEncrypted: "Encrypted files are not supported",
		officeLoadFailed: "Office preview component failed to load",
		previousSlide: "Previous",
		nextSlide: "Next",
		zoom: "Zoom",
		zoomHint: "Alt + wheel",
		settingsSubagentTitle: "Auto-open the Tasks page when a subagent appears",
		settingsSubagentDesc: "Expand the side card and open the Tasks page when the current conversation spawns a new subagent; turn off to open it manually",
		settingsJobsTitle: "Auto-open the Jobs page on a new background job",
		settingsJobsDesc: "Expand the side card and open the Jobs page whenever a new background job appears for the current conversation (every new job triggers); turn off to open it manually",
		settingsToolsTitle: "Inject terminal tools for the model",
		settingsToolsDesc: "When enabled, the model can create and drive sidebar terminals through the 8 terminal_* tools (off by default)",
		settingsBottomTerminalTitle: "Auto-open a terminal on the bottom panel's first expansion",
		settingsBottomTerminalDesc: "When the bottom panel is expanded for the first time in a session, try to open a fresh terminal tab there (the terminal quota still applies; on by default)",
		settingsTabsTitle: "Sidebar content",
		settingsViewersTitle: "File viewers",
		settingsGeneralTitle: "General",
		settingsPopup: "Feature settings",
		settingsViewerCatchAll: "Catch-all: any file",
		viewerImage: "Image",
		viewerPdf: "PDF",
		viewerDocx: "Word",
		viewerXlsx: "Excel",
		viewerPptx: "PowerPoint",
		viewerMarkdown: "Markdown",
		viewerCode: "Code",
		viewerBinary: "Binary download",
		viewerHtml: "HTML",
		browser: "Browser",
		browserPlaceholder: "Enter a URL, e.g. example.com",
		browserGo: "Go",
		browserBack: "Back",
		browserForward: "Forward",
		browserStart: "Enter a URL to start browsing (sandbox mode)",
		browserBlockedScheme: "Blocked: only http/https URLs are allowed",
		browserBlockedLoopback: "Blocked: local and internal addresses cannot be browsed here",
		browserInvalid: "Invalid URL",
		browserNoSandboxWarning: "Sandbox off: the current page runs with full GUI privileges (re-enable in settings)",
		htmlNoSandboxWarning: "Sandbox off: this HTML runs with full GUI privileges (re-enable in settings)",
		sandboxStatusOn: "Sandbox mode: on · pages cannot access the GUI's data or local files; logins and third-party cookies may not work",
		sandboxUnlock: "Temporarily disable (unsafe)",
		sandboxRestore: "Restore sandbox",
		settingsHtmlDefaultUnsafeTitle: "Open HTML previews unsandboxed by default (unsafe)",
		settingsHtmlDefaultUnsafeDesc: "When on, every newly opened HTML preview starts in the unsandboxed state (same origin as the GUI — it can read session files and internal APIs); the status row still offers a one-tap restore",
		settingsHtmlSandboxTitle: "Disable HTML preview sandbox (unsafe)",
		settingsHtmlSandboxDesc: "With the sandbox off, previewed HTML runs with the same origin as the GUI: it can read session files, local storage and call internal APIs. Only enable for fully trusted files",
		settingsBrowserSandboxTitle: "Disable browser sandbox (unsafe)",
		settingsBrowserSandboxDesc: "With the sandbox off, any visited site runs with the same origin as the GUI: it can read session data and act as your logged-in session. Only enable for fully trusted sites",
		settingsBrowserLinksTitle: "Open chat external links in the sidebar",
		settingsBrowserLinksDesc: "When on, clicking an http/https external link in the chat or GUI opens the sidebar browser instead of a new window; Ctrl/Cmd+click always bypasses",
		browserOpenExternal: "Open in browser",
		browserEmbedBlocked: "{host} refused to be embedded",
		browserEmbedBlockedDesc: "The site forbids being displayed inside other pages (X-Frame-Options / frame-ancestors), so it cannot load in the sidebar. Open it directly in your browser instead.",
		browserEmbedAnyway: "Load anyway",
		subagent: "Tasks",
		openSubagent: "Tasks",
		subagentMainAgent: "Main agent",
		subagentEmpty: "No subagents",
		subagentEmptyDesc: "Subagents spawned under the main agent will appear here",
		subagentRunning: "Running",
		subagentInactive: "Inactive",
		subagentModeOneShot: "One-shot",
		subagentModeContinuable: "Continuable",
		subagentCount: "{count} subagents",
		subagentCountRunning: "{count} subagents · {running} running",
		subagentDiagCorrupt: "Corrupt",
		subagentDiagUnsupported: "Unsupported",
		subagentDiagUnavailable: "Unavailable",
		subagentThinking: "Thinking…",
		jobs: "Background jobs",
		jobsCount: "{count} background jobs",
		jobsCountRunning: "{count} background jobs · {running} running",
		jobStatusRunning: "Running",
		jobStatusStopping: "Stopping",
		jobStatusCompleted: "Completed",
		jobStatusKilled: "Killed",
		jobStatusFailed: "Failed",
		jobDurationSeconds: "{seconds}s",
		jobDurationMinutes: "{minutes}m {seconds}s",
		jobDurationHours: "{hours}h {minutes}m",
		jobViewOutput: "View output",
		jobHideOutput: "Hide output",
		jobNoOutput: "No output yet",
		jobNotReadYet: "Waiting for the model to read this job; its output appears here once the model runs job_output",
		jobOutputTruncated: "Output truncated",
		jobOutputError: "Failed to read output",
		jobKill: "Kill",
		jobKillConfirm: "Click again to confirm kill",
		jobKillError: "Kill failed"
	};
	/**
	* The active locale id ('zh' | 'en'): the DSH locale service's snapshot when
	* attached, else the browser language.
	*/
	function activeLocale() {
		return (typeof navigator !== "undefined" ? navigator.language : "") ?? "en";
	}
	/** Translate a copy key; `{name}` placeholders interpolate from `params`. */
	function t(key, params) {
		let text = (activeLocale().toLowerCase().startsWith("zh") ? zh : en)[key];
		if (params !== void 0) for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
		return text;
	}
	//#endregion
	//#region \0dsh-css:/Users/menghuan/Code/DSH-better-sidebar/src/client/sidebar.module.css.mjs
	const css = ".W-zNGW_toggleCluster{z-index:55;flex-direction:row;gap:4px;display:flex;position:fixed;top:3px;right:10px}.W-zNGW_panel:not(.W-zNGW_panelHidden) .W-zNGW_tabBar{padding-right:72px}.W-zNGW_toggleButton{width:28px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background var(--ds-transition-duration-slow) var(--ds-ease-in-out), color var(--ds-transition-duration-slow) var(--ds-ease-in-out);background:0 0;border:none;border-radius:50%;justify-content:center;align-items:center;display:flex}.W-zNGW_toggleButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.W-zNGW_toggleButton:disabled{opacity:.4;cursor:default}.W-zNGW_panel{z-index:50;background:var(--dsw-specific-sidebar-fill);border-left:1px solid var(--dsw-alias-border-l2);transition:transform var(--ds-transition-duration-slow) var(--ds-ease-in-out), width var(--ds-transition-duration-slow) var(--ds-ease-in-out);flex-direction:column;display:flex;position:fixed;top:0;bottom:0;right:0}.W-zNGW_panelHidden{pointer-events:none;visibility:hidden;transition:transform var(--ds-transition-duration-slow) var(--ds-ease-in-out), width var(--ds-transition-duration-slow) var(--ds-ease-in-out), visibility 0s linear var(--ds-transition-duration-slow);transform:translate(102%)}.W-zNGW_panel[data-dragging]{transition:none}.W-zNGW_panelResize{cursor:col-resize;z-index:2;touch-action:none;width:8px;position:absolute;top:0;bottom:0;left:-4px}.W-zNGW_panelResizeActive{background:var(--dsw-alias-interactive-bg-hover-accent)}.W-zNGW_panelBody{flex:1;min-width:0;min-height:0;display:flex}.W-zNGW_bottomPanel{z-index:50;background:var(--dsw-specific-sidebar-fill);border-top:1px solid var(--dsw-alias-border-l2);transition:transform var(--ds-transition-duration-slow) var(--ds-ease-in-out), height var(--ds-transition-duration-slow) var(--ds-ease-in-out);flex-direction:column;display:flex;position:fixed;bottom:0}.W-zNGW_bottomPanelHidden{pointer-events:none;visibility:hidden;transition:transform var(--ds-transition-duration-slow) var(--ds-ease-in-out), height var(--ds-transition-duration-slow) var(--ds-ease-in-out), visibility 0s linear var(--ds-transition-duration-slow);transform:translateY(102%)}.W-zNGW_bottomPanel[data-dragging]{transition:none}.W-zNGW_bottomResize{cursor:row-resize;z-index:2;touch-action:none;height:8px;position:absolute;top:-4px;left:0;right:0}.W-zNGW_bottomResizeActive{background:var(--dsw-alias-interactive-bg-hover-accent)}.W-zNGW_bottomClose{z-index:4;width:28px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex;position:absolute;top:3px;right:6px}.W-zNGW_bottomClose:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.W-zNGW_bottomPanel .W-zNGW_tabBar{padding-right:40px}.W-zNGW_cornerHandle{z-index:52;cursor:nwse-resize;touch-action:none;width:12px;height:12px;position:fixed}.W-zNGW_cornerHandle:hover,.W-zNGW_cornerHandle[data-dragging]{background:var(--dsw-alias-interactive-bg-hover-accent)}.W-zNGW_iconButton{width:28px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.W-zNGW_iconButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.W-zNGW_iconButton:disabled{opacity:.4;cursor:default}.W-zNGW_workbench,.W-zNGW_split{flex:1;min-width:0;min-height:0;display:flex}.W-zNGW_splitRow{flex-direction:row}.W-zNGW_splitCol{flex-direction:column}.W-zNGW_splitChild{display:flex;position:relative;overflow:hidden}.W-zNGW_divider{z-index:3;touch-action:none;flex:none;position:relative}.W-zNGW_dividerRow:after,.W-zNGW_dividerCol:after{content:\"\";background:var(--dsw-alias-border-l2);transition:background var(--ds-transition-duration-slow) var(--ds-ease-in-out);position:absolute}.W-zNGW_dividerRow{cursor:col-resize;width:7px;margin:0 -2px}.W-zNGW_dividerRow:after{width:1px;top:0;bottom:0;left:50%;transform:translate(-50%)}.W-zNGW_dividerCol{cursor:row-resize;height:7px;margin:-2px 0}.W-zNGW_dividerCol:after{height:1px;top:50%;left:0;right:0;transform:translateY(-50%)}.W-zNGW_divider:hover:after,.W-zNGW_dividerActive:after{background:var(--dsw-alias-interactive-bg-hover-accent)}.W-zNGW_pane{background:var(--dsw-alias-bg-base);flex-direction:column;flex:1;min-width:0;min-height:0;display:flex;position:relative}.W-zNGW_paneDrop{outline:1px solid var(--dsw-alias-interactive-bg-hover-accent);outline-offset:-1px}.W-zNGW_dropOverlay{z-index:6;pointer-events:none;background:var(--dsw-alias-interactive-bg-hover-accent);opacity:.5;position:absolute}.W-zNGW_dropLeft{width:25%;top:0;bottom:0;left:0}.W-zNGW_dropRight{width:25%;top:0;bottom:0;right:0}.W-zNGW_dropUp{height:25%;top:0;left:0;right:0}.W-zNGW_dropDown{height:25%;bottom:0;left:0;right:0}.W-zNGW_dropCenter{outline:2px dashed var(--dsw-alias-interactive-bg-hover-accent);outline-offset:-2px;background:0 0;inset:25%}.W-zNGW_paneContent{flex-direction:column;flex:1;min-height:0;display:flex;overflow:hidden}.W-zNGW_paneTab{flex-direction:column;flex:1;min-height:0;display:flex}.W-zNGW_paneTabHidden{display:none}.W-zNGW_paneEmptyCards{flex:1;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));align-content:start;gap:8px;min-height:0;padding:12px;display:grid;overflow:hidden}.W-zNGW_paneCard{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);min-width:0;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-strong-12);cursor:pointer;text-align:center;border-radius:8px;flex-direction:column;justify-content:center;align-items:center;gap:6px;padding:12px 8px;display:flex}.W-zNGW_paneCard:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}.W-zNGW_paneCard:disabled{opacity:.45;cursor:default}.W-zNGW_tabBar{border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none;align-items:stretch;height:34px;display:flex}.W-zNGW_tabBarDrop{outline:1px dashed var(--dsw-alias-interactive-bg-hover-accent);outline-offset:-1px}.W-zNGW_tabList{scrollbar-width:none;flex:1;min-width:0;display:flex;overflow-x:auto}.W-zNGW_tabList::-webkit-scrollbar{display:none}.W-zNGW_tab{min-width:64px;max-width:160px;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary);border-right:1px solid var(--dsw-alias-border-l1);cursor:pointer;user-select:none;background:0 0;flex:none;align-items:center;gap:4px;padding:0 4px 0 10px;display:flex}.W-zNGW_tab:hover{background:var(--dsw-alias-interactive-bg-hover)}.W-zNGW_tabActive{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-active)}.W-zNGW_tabTitle{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.W-zNGW_tabClose{width:18px;height:18px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:4px;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.W-zNGW_tabClose:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.W-zNGW_tabBarPlus{background:var(--dsw-alias-bg-layer-1);width:22px;height:22px;color:var(--dsw-alias-label-tertiary);cursor:pointer;border:none;border-radius:5px;flex:none;justify-content:center;align-self:center;align-items:center;margin:0 6px;padding:0;display:inline-flex;position:sticky;right:0}.W-zNGW_tabBarPlus:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.W-zNGW_explorer{flex-direction:column;flex:1;min-height:0;display:flex}.W-zNGW_explorerHeader{flex:none;justify-content:space-between;align-items:center;gap:8px;height:36px;padding:0 8px 0 12px;display:flex}.W-zNGW_explorerRoot{font:var(--dsw-font-s-14);color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.W-zNGW_explorerBody{flex:1;min-height:0;padding:2px 6px 8px;overflow-y:auto}.W-zNGW_explorerRow{width:100%;height:34px;font:var(--dsw-font-s-14);color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;white-space:nowrap;animation:W-zNGW_dsh-row-in .15s var(--ds-ease-in-out);background:0 0;border:none;border-radius:8px;align-items:center;gap:6px;padding:0 8px;display:flex}.W-zNGW_explorerRow:hover{background:var(--dsw-alias-interactive-bg-hover)}.W-zNGW_explorerDir{font:var(--dsw-font-s-strong-14)}.W-zNGW_explorerHidden{opacity:.45}.W-zNGW_explorerName{text-overflow:ellipsis;overflow:hidden}.W-zNGW_explorerRef{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);height:20px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-strong-11);cursor:pointer;border-radius:999px;flex:none;align-items:center;padding:0 8px;display:none}.W-zNGW_explorerRef:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.W-zNGW_explorerRow:hover .W-zNGW_explorerRef,.W-zNGW_explorerRow:focus-within .W-zNGW_explorerRef{display:inline-flex}.W-zNGW_explorerCopied{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);flex:none}.W-zNGW_explorerError{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary);cursor:default}@keyframes W-zNGW_dsh-row-in{0%{opacity:0}}.W-zNGW_explorerEmpty{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);text-align:center;padding:16px}.W-zNGW_editor{flex-direction:column;flex:1;min-height:0;display:flex}.W-zNGW_editorHeader{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;align-items:center;gap:6px;padding:4px 8px;display:flex}.W-zNGW_editorTitle{min-width:0;font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;flex:1;overflow:hidden}.W-zNGW_editorStatus{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary)}.W-zNGW_editorStatusError{color:var(--dsw-alias-state-error-primary)}.W-zNGW_dirtyDot{background:var(--dsw-alias-state-warn-primary);border-radius:50%;flex:none;width:7px;height:7px}.W-zNGW_editorPlaceholder{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);text-align:center;flex:1;justify-content:center;align-items:center;padding:16px;display:flex}.W-zNGW_orphanedType{opacity:.7;overflow-wrap:anywhere;margin-top:8px;font-size:12px;display:block}.W-zNGW_editorBinary{text-align:center;flex-direction:column;flex:1;justify-content:center;align-items:center;gap:12px;padding:24px 16px;display:flex}.W-zNGW_editorBinaryNotice{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary)}.W-zNGW_editorDownloadLink{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-strong-12);cursor:pointer;transition:background var(--ds-transition-duration-slow) var(--ds-ease-in-out), border-color var(--ds-transition-duration-slow) var(--ds-ease-in-out);border-radius:6px;align-items:center;gap:6px;padding:6px 14px;text-decoration:none;display:inline-flex}.W-zNGW_editorDownloadLink:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}.W-zNGW_editorError{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary);padding:12px 16px}.W-zNGW_editorBanner{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-state-warn-label);background:var(--dsw-alias-state-warn-tertiary);flex:none;padding:4px 12px}.W-zNGW_sandboxStatus{font:var(--dsw-font-xxxs-11);flex:none;align-items:center;gap:8px;padding:4px 10px;display:flex}.W-zNGW_sandboxStatusOn{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border-bottom:1px solid var(--dsw-alias-border-l1)}.W-zNGW_sandboxStatusOff{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);border-bottom:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent)}.W-zNGW_sandboxDot{background:var(--dsw-alias-state-success-primary);border-radius:50%;flex:none;width:6px;height:6px}.W-zNGW_sandboxStatusOff .W-zNGW_sandboxDot{background:var(--dsw-alias-state-error-primary)}.W-zNGW_sandboxStatusText{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.W-zNGW_sandboxAction{border:1px solid var(--dsw-alias-border-l2);font:inherit;color:inherit;cursor:pointer;background:0 0;border-radius:6px;flex:none;padding:2px 8px}.W-zNGW_sandboxAction:hover{background:var(--dsw-alias-interactive-bg-hover)}.W-zNGW_editorHtml{background:var(--dsw-alias-bg-base);border:none;flex:1;width:100%;min-height:0}.W-zNGW_browser{flex-direction:column;flex:1;min-height:0;display:flex}.W-zNGW_browserBar{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;align-items:center;gap:4px;padding:6px 8px;display:flex}.W-zNGW_browserInput{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);min-width:0;height:28px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12);border-radius:6px;flex:1;padding:0 10px}.W-zNGW_browserInput:focus{border-color:var(--dsw-alias-border-l2);outline:none}.W-zNGW_browserMessage{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-state-warn-label);background:var(--dsw-alias-state-warn-tertiary);flex:none;padding:4px 12px}.W-zNGW_browserFrame{background:var(--dsw-alias-bg-base);border:none;flex:1;width:100%;min-height:0}.W-zNGW_browserStart{text-align:center;min-height:0;font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-tertiary);flex:1;justify-content:center;align-items:center;padding:20px;display:flex}.W-zNGW_browserBlocked{text-align:center;min-height:0;color:var(--dsw-alias-state-warn-primary);flex-direction:column;flex:1;justify-content:center;align-items:center;gap:6px;padding:24px;display:flex}.W-zNGW_browserBlockedTitle{font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-primary)}.W-zNGW_browserBlockedDesc{max-width:280px;font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-secondary)}.W-zNGW_browserBlockedActions{gap:8px;margin-top:6px;display:flex}.W-zNGW_browserBlockedButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxxs-11);cursor:pointer;border-radius:6px;padding:4px 12px}.W-zNGW_browserBlockedButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.W-zNGW_editorCm{background:0 0;flex:1;min-height:0;overflow:hidden}.W-zNGW_editorCmHidden{display:none}.W-zNGW_editorCm .cm-editor{height:100%}.W-zNGW_editorCm .cm-editor.cm-focused{outline:none}.W-zNGW_editorModeToggle{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:6px;flex:none;align-items:center;gap:2px;padding:2px;display:inline-flex}.W-zNGW_editorModeButton{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-11);cursor:pointer;background:0 0;border:none;border-radius:4px;padding:2px 8px}.W-zNGW_editorModeButton:hover{color:var(--dsw-alias-label-primary)}.W-zNGW_editorModeActive{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}.W-zNGW_editorImageWrap{flex:1;justify-content:center;align-items:center;min-height:0;padding:12px;display:flex;overflow:auto}.W-zNGW_editorImage{object-fit:contain;max-width:100%;max-height:100%}.W-zNGW_editorMd{min-height:0;font:var(--dsw-font-xs-13);flex:1;padding:10px 14px;overflow-y:auto}.W-zNGW_selectionPopup{z-index:60;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);height:28px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxxs-strong-11);white-space:nowrap;cursor:pointer;border-radius:6px;align-items:center;padding:0 10px;display:inline-flex;position:fixed;transform:translate(-50%,calc(-100% - 8px))}.W-zNGW_selectionPopup:hover{background:var(--dsw-alias-interactive-bg-hover)}.W-zNGW_editorDocx{background:var(--dsw-alias-bg-base);flex-direction:column;flex:1;min-height:0;display:flex}.W-zNGW_editorDocxViewport{background:var(--dsw-alias-bg-base);flex-direction:column;flex:1;min-height:0;display:flex;overflow:auto}.W-zNGW_editorDocxWrap{flex:none;padding:16px}.W-zNGW_editorDocxZoom{border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none;align-items:center;gap:8px;min-height:34px;padding:4px 10px;display:flex}.W-zNGW_editorDocxZoomHint,.W-zNGW_editorDocxZoomValue{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);flex:none}.W-zNGW_editorDocxZoomValue{text-align:right;width:36px}.W-zNGW_editorDocxZoomRange{min-width:72px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer;flex:1}.W-zNGW_editorPdf{background:var(--dsw-alias-bg-base);flex-direction:column;flex:1;min-height:0;display:flex}.W-zNGW_editorPdfToolbar{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;justify-content:flex-end;padding:6px 8px;display:flex}.W-zNGW_editorPdfStage{flex:1;min-height:0;display:flex;position:relative}.W-zNGW_editorPdfFrame{background:var(--dsw-alias-bg-base);border:none;flex:1;width:100%;min-height:0}.W-zNGW_editorPdfFrameBlocked{pointer-events:none}.W-zNGW_editorPdfDragShield{z-index:4;pointer-events:none;background:0 0;position:absolute;inset:0}.W-zNGW_editorPdfDragShieldActive{pointer-events:auto}body[data-dsh-tab-dragging] .W-zNGW_editorPdfFrame{pointer-events:none!important}body[data-dsh-tab-dragging] .W-zNGW_editorPdfDragShield{pointer-events:auto!important}.W-zNGW_editorXlsx{background:var(--dsw-alias-bg-base);flex:1;min-height:0;position:relative;overflow:hidden}.W-zNGW_editorUniverHost{width:100%;min-width:0;height:100%;min-height:0}.W-zNGW_editorOfficeOverlay{z-index:2;background:var(--dsw-alias-bg-base);display:flex;position:absolute;inset:0}.W-zNGW_editorPptx{background:var(--dsw-alias-bg-base);flex-direction:column;flex:1;min-height:0;display:flex}.W-zNGW_editorPptxToolbar{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;justify-content:center;align-items:center;gap:8px;padding:6px 8px;display:flex}.W-zNGW_editorPptxToolbar .W-zNGW_editorDownloadLink{margin-left:auto}.W-zNGW_editorPptxButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);height:28px;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-strong-12);cursor:pointer;border-radius:6px;padding:0 10px}.W-zNGW_editorPptxButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.W-zNGW_editorPptxButton:disabled{opacity:.4;cursor:default}.W-zNGW_editorPptxPosition{text-align:center;min-width:64px;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary)}.W-zNGW_editorPptxStage{flex:1;min-height:0;position:relative;overflow:hidden}.W-zNGW_editorPptxHost{width:100%;min-width:0;height:100%;min-height:0;overflow:auto}.W-zNGW_terminalWrap{background:var(--dsw-alias-bg-base);flex-direction:column;flex:1;min-height:0;display:flex;position:relative}.W-zNGW_terminal{flex:1;min-height:0;padding:6px 4px 6px 8px}.W-zNGW_terminal .xterm{height:100%}.W-zNGW_terminalBanner{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-state-warn-label);background:var(--dsw-alias-state-warn-tertiary);flex-wrap:wrap;flex:none;align-items:center;gap:8px;padding:3px 10px;display:flex}.W-zNGW_terminalBannerUrl{word-break:break-all;opacity:.85;flex-basis:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.W-zNGW_boundaryError{z-index:50;background:var(--dsw-alias-bg-layer-1);border-left:1px solid var(--dsw-alias-border-l2);font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary);flex-direction:column;align-items:flex-start;gap:8px;padding:16px;display:flex;position:fixed;top:0;bottom:0;right:0;overflow:auto}.W-zNGW_terminalRetry{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxxs-strong-11);cursor:pointer;border-radius:999px;flex:none;padding:1px 8px}.W-zNGW_terminalRetry:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.W-zNGW_git{flex-direction:column;flex:1;min-width:0;min-height:0;display:flex;overflow:hidden auto}.W-zNGW_gitHeader{flex:none;align-items:center;gap:8px;height:36px;padding:0 8px 0 12px;display:flex}.W-zNGW_gitBranchSelect{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);min-width:0;height:26px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12);border-radius:6px;flex:1;padding:0 6px}.W-zNGW_gitSection{border-top:1px solid var(--dsw-alias-border-l1)}.W-zNGW_gitSectionHeader{font:var(--dsw-font-xxxs-strong-11);color:var(--dsw-alias-label-tertiary);text-transform:uppercase;justify-content:space-between;align-items:center;padding:6px 12px 4px;display:flex}.W-zNGW_gitLink{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-brand-primary);cursor:pointer;background:0 0;border:none;padding:0}.W-zNGW_gitLink:hover:not(:disabled){text-decoration:underline}.W-zNGW_gitLink:disabled{opacity:.4;cursor:default}.W-zNGW_gitRow{min-height:34px;animation:W-zNGW_dsh-row-in .15s var(--ds-ease-in-out);border-radius:8px;align-items:center;gap:6px;margin:0 6px;padding:0 8px;display:flex}.W-zNGW_gitRow:hover{background:var(--dsw-alias-interactive-bg-hover)}.W-zNGW_gitRowSelected{background:var(--dsw-alias-interactive-bg-active)}.W-zNGW_gitRowMain{cursor:pointer;text-align:left;background:0 0;border:none;flex:1;align-items:center;gap:8px;min-width:0;padding:3px 0;display:flex}.W-zNGW_gitBadge{width:20px;height:16px;font:var(--dsw-font-xxxs-strong-11);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);border-radius:4px;flex:none;justify-content:center;align-items:center;display:inline-flex}.W-zNGW_gitName{text-overflow:ellipsis;white-space:nowrap;min-width:0;font:var(--dsw-font-s-14);color:var(--dsw-alias-label-primary);flex:1;overflow:hidden}.W-zNGW_gitEmpty{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);padding:4px 12px 8px}.W-zNGW_gitPlaceholder{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);text-align:center;padding:16px}.W-zNGW_gitError{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;padding:8px 12px}.W-zNGW_gitDiff{border-top:1px solid var(--dsw-alias-border-l1);padding:8px}.W-zNGW_gitDiffTab{flex-direction:column;flex:1;min-width:0;min-height:0;display:flex;overflow:hidden auto}.W-zNGW_gitDiffTabHeader{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;align-items:center;gap:8px;height:36px;padding:0 8px 0 12px;display:flex}.W-zNGW_gitDiffTabTitle{text-overflow:ellipsis;white-space:nowrap;min-width:0;font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-primary);flex:1;overflow:hidden}.W-zNGW_gitDiffFile{align-items:baseline;gap:6px;padding:8px 2px 2px;display:flex}.W-zNGW_gitDiffFilePath{font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.W-zNGW_gitDiffFileOld{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:none;max-width:40%;overflow:hidden}.W-zNGW_gitDiffFileTag{border:1px solid var(--dsw-alias-border-l2);font:var(--dsw-font-xxxs-strong-11);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:0 6px}.W-zNGW_gitDiffHunk{font:var(--dsw-font-markdown-code-block-small);color:var(--dsw-alias-label-tertiary);gap:8px;padding:3px 2px;display:flex}.W-zNGW_gitDiffHunkHeader{color:var(--dsw-alias-label-secondary);flex:none}.W-zNGW_gitDiffHunkSection{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.W-zNGW_gitDiffLine{font:var(--dsw-font-markdown-code-block-small);white-space:pre-wrap;overflow-wrap:anywhere;align-items:stretch;min-width:0;line-height:20px;display:flex}.W-zNGW_gitDiffNum{text-align:right;width:36px;color:var(--dsw-alias-label-tertiary);user-select:none;flex:none;padding-right:8px}.W-zNGW_gitDiffCode{flex:1;min-width:0;overflow:visible}.W-zNGW_gitDiffCtx{color:var(--dsw-alias-label-primary)}.W-zNGW_gitDiffDel{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)}.W-zNGW_gitDiffAdd{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent)}.W-zNGW_gitDiffMeta{padding-left:2px}.W-zNGW_gitDiffMetaText{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);font-style:italic}.W-zNGW_gitDiffExpand{width:100%;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-brand-primary);cursor:pointer;text-align:center;background:0 0;border:none;margin:4px 0;display:block}.W-zNGW_gitDiffExpand:hover{background:var(--dsw-alias-interactive-bg-hover)}.W-zNGW_gitConfirmDesc{font:var(--dsw-font-s-14);color:var(--dsw-alias-label-primary);white-space:pre-wrap;margin:0}.W-zNGW_gitCommit{border-top:1px solid var(--dsw-alias-border-l1);align-items:center;gap:6px;padding:8px 12px;display:flex}.W-zNGW_gitCommitInput{flex:1;min-width:0}.W-zNGW_gitCommitButton{background:var(--dsw-alias-button-primary-fill);height:26px;color:var(--dsw-alias-label-primary-inverted);font:var(--dsw-font-xxs-strong-12);cursor:pointer;border:none;border-radius:6px;flex:none;padding:0 12px}.W-zNGW_gitCommitButton:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.W-zNGW_gitCommitButton:disabled{opacity:.45;cursor:default}.W-zNGW_gitLogRow{cursor:pointer;border-radius:8px;flex-direction:column;gap:2px;padding:5px 12px;display:flex}.W-zNGW_gitLogRow:hover{background:var(--dsw-alias-interactive-bg-hover)}.W-zNGW_gitLogLine1{align-items:baseline;gap:8px;min-width:0;display:flex}.W-zNGW_gitLogHash{font:var(--dsw-font-markdown-code-block-small);color:var(--dsw-alias-label-tertiary);flex:none}.W-zNGW_gitLogLine2{flex-wrap:wrap;align-items:center;gap:6px;min-width:0;display:flex}.W-zNGW_gitLogRef{border:1px solid var(--dsw-alias-border-l2);font:var(--dsw-font-xxxs-strong-11);color:var(--dsw-alias-brand-primary);white-space:nowrap;border-radius:999px;flex:none;padding:0 5px}.W-zNGW_gitLogSubject{text-overflow:ellipsis;white-space:nowrap;min-width:0;font:var(--dsw-font-s-14);color:var(--dsw-alias-label-primary);flex:1;overflow:hidden}.W-zNGW_gitLogMeta{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary)}.W-zNGW_gitLogMore{border:1px solid var(--dsw-alias-border-l2);width:calc(100% - 24px);font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:6px;margin:4px 12px 8px;padding:6px 0;display:block}.W-zNGW_gitLogMore:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.W-zNGW_gitLogMore:disabled{opacity:.5;cursor:default}.W-zNGW_producedRow{flex-wrap:wrap;align-items:center;gap:8px;padding:4px 0;display:flex}.W-zNGW_producedLabel{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary)}.W-zNGW_producedChip{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);max-width:200px;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12);cursor:pointer;border-radius:999px;align-items:center;gap:4px;padding:2px 8px;display:inline-flex;overflow:hidden}.W-zNGW_producedChip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.W-zNGW_producedChip span{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.W-zNGW_producedMore{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary)}.W-zNGW_toggleButton:focus-visible,.W-zNGW_bottomClose:focus-visible,.W-zNGW_iconButton:focus-visible,.W-zNGW_tab:focus-visible,.W-zNGW_tabClose:focus-visible,.W-zNGW_tabBarPlus:focus-visible,.W-zNGW_paneCard:focus-visible,.W-zNGW_explorerRow:focus-visible,.W-zNGW_explorerRef:focus-visible,.W-zNGW_gitRowMain:focus-visible,.W-zNGW_gitLink:focus-visible,.W-zNGW_gitCommitButton:focus-visible,.W-zNGW_gitLogRow:focus-visible,.W-zNGW_gitLogMore:focus-visible,.W-zNGW_gitDiffExpand:focus-visible,.W-zNGW_terminalRetry:focus-visible,.W-zNGW_editorModeButton:focus-visible,.W-zNGW_editorDownloadLink:focus-visible,.W-zNGW_editorPptxButton:focus-visible,.W-zNGW_editorDocxZoomRange:focus-visible{outline:2px solid var(--dsw-alias-interactive-bg-hover-accent);outline-offset:-1px}@media (prefers-reduced-motion:reduce){.W-zNGW_panel,.W-zNGW_panelHidden,.W-zNGW_bottomPanel,.W-zNGW_bottomPanelHidden,.W-zNGW_toggleCluster,.W-zNGW_toggleButton,.W-zNGW_tab,.W-zNGW_tabBarPlus,.W-zNGW_paneCard,.W-zNGW_explorerRow,.W-zNGW_gitRow,.W-zNGW_divider,.W-zNGW_dividerRow:after,.W-zNGW_dividerCol:after{transition:none;animation:none}}@media (width<=767px){.W-zNGW_panel:not(.W-zNGW_panelHidden) .W-zNGW_tabBar{padding-right:40px}.W-zNGW_tab{min-width:48px;max-width:128px}}";
	const tagId = "dsh-better-sidebar/sidebar.module.css";
	if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
		const tag = document.createElement("style");
		tag.dataset.plugin = "dsh-better-sidebar";
		tag.dataset.pluginCss = tagId;
		tag.textContent = css;
		document.head.appendChild(tag);
	}
	var sidebar_module_css_default = {
		"splitChild": "W-zNGW_splitChild",
		"editorModeToggle": "W-zNGW_editorModeToggle",
		"tabBarPlus": "W-zNGW_tabBarPlus",
		"terminalRetry": "W-zNGW_terminalRetry",
		"sandboxStatusOff": "W-zNGW_sandboxStatusOff",
		"editorDocx": "W-zNGW_editorDocx",
		"editorMd": "W-zNGW_editorMd",
		"browserBlocked": "W-zNGW_browserBlocked",
		"gitDiffFileOld": "W-zNGW_gitDiffFileOld",
		"dropOverlay": "W-zNGW_dropOverlay",
		"tabList": "W-zNGW_tabList",
		"explorerCopied": "W-zNGW_explorerCopied",
		"editorStatus": "W-zNGW_editorStatus",
		"browserMessage": "W-zNGW_browserMessage",
		"editorPdfDragShieldActive": "W-zNGW_editorPdfDragShieldActive",
		"splitRow": "W-zNGW_splitRow",
		"terminalBanner": "W-zNGW_terminalBanner",
		"gitDiffFile": "W-zNGW_gitDiffFile",
		"explorerRef": "W-zNGW_explorerRef",
		"editorDocxZoomRange": "W-zNGW_editorDocxZoomRange",
		"dirtyDot": "W-zNGW_dirtyDot",
		"gitRow": "W-zNGW_gitRow",
		"terminalWrap": "W-zNGW_terminalWrap",
		"gitName": "W-zNGW_gitName",
		"explorerEmpty": "W-zNGW_explorerEmpty",
		"git": "W-zNGW_git",
		"toggleButton": "W-zNGW_toggleButton",
		"editorPptxButton": "W-zNGW_editorPptxButton",
		"gitDiffFileTag": "W-zNGW_gitDiffFileTag",
		"gitLogRow": "W-zNGW_gitLogRow",
		"gitRowMain": "W-zNGW_gitRowMain",
		"tabTitle": "W-zNGW_tabTitle",
		"editorBinaryNotice": "W-zNGW_editorBinaryNotice",
		"editorImage": "W-zNGW_editorImage",
		"editorDocxWrap": "W-zNGW_editorDocxWrap",
		"editorDocxZoomValue": "W-zNGW_editorDocxZoomValue",
		"editorHtml": "W-zNGW_editorHtml",
		"editorPdfFrame": "W-zNGW_editorPdfFrame",
		"producedLabel": "W-zNGW_producedLabel",
		"editorError": "W-zNGW_editorError",
		"bottomPanelHidden": "W-zNGW_bottomPanelHidden",
		"editorPptx": "W-zNGW_editorPptx",
		"sandboxStatusOn": "W-zNGW_sandboxStatusOn",
		"gitLogLine2": "W-zNGW_gitLogLine2",
		"gitLogSubject": "W-zNGW_gitLogSubject",
		"gitDiffHunk": "W-zNGW_gitDiffHunk",
		"gitCommitInput": "W-zNGW_gitCommitInput",
		"editorDocxViewport": "W-zNGW_editorDocxViewport",
		"producedMore": "W-zNGW_producedMore",
		"toggleCluster": "W-zNGW_toggleCluster",
		"editorPdfStage": "W-zNGW_editorPdfStage",
		"dividerActive": "W-zNGW_dividerActive",
		"gitDiffDel": "W-zNGW_gitDiffDel",
		"iconButton": "W-zNGW_iconButton",
		"gitCommit": "W-zNGW_gitCommit",
		"gitLogMeta": "W-zNGW_gitLogMeta",
		"producedChip": "W-zNGW_producedChip",
		"panelResize": "W-zNGW_panelResize",
		"gitDiffHunkHeader": "W-zNGW_gitDiffHunkHeader",
		"explorerBody": "W-zNGW_explorerBody",
		"editorDocxZoomHint": "W-zNGW_editorDocxZoomHint",
		"gitEmpty": "W-zNGW_gitEmpty",
		"tabBarDrop": "W-zNGW_tabBarDrop",
		"editorPdf": "W-zNGW_editorPdf",
		"bottomResizeActive": "W-zNGW_bottomResizeActive",
		"browserBlockedDesc": "W-zNGW_browserBlockedDesc",
		"editorOfficeOverlay": "W-zNGW_editorOfficeOverlay",
		"tabBar": "W-zNGW_tabBar",
		"panelHidden": "W-zNGW_panelHidden",
		"boundaryError": "W-zNGW_boundaryError",
		"gitSectionHeader": "W-zNGW_gitSectionHeader",
		"browserInput": "W-zNGW_browserInput",
		"gitDiffHunkSection": "W-zNGW_gitDiffHunkSection",
		"divider": "W-zNGW_divider",
		"sandboxStatus": "W-zNGW_sandboxStatus",
		"editorPptxHost": "W-zNGW_editorPptxHost",
		"gitDiffAdd": "W-zNGW_gitDiffAdd",
		"editorPdfDragShield": "W-zNGW_editorPdfDragShield",
		"gitDiffTabHeader": "W-zNGW_gitDiffTabHeader",
		"gitLink": "W-zNGW_gitLink",
		"paneCard": "W-zNGW_paneCard",
		"workbench": "W-zNGW_workbench",
		"gitDiffMeta": "W-zNGW_gitDiffMeta",
		"gitLogMore": "W-zNGW_gitLogMore",
		"dropLeft": "W-zNGW_dropLeft",
		"producedRow": "W-zNGW_producedRow",
		"explorerError": "W-zNGW_explorerError",
		"gitDiffMetaText": "W-zNGW_gitDiffMetaText",
		"gitConfirmDesc": "W-zNGW_gitConfirmDesc",
		"editorPlaceholder": "W-zNGW_editorPlaceholder",
		"editorPptxToolbar": "W-zNGW_editorPptxToolbar",
		"terminal": "W-zNGW_terminal",
		"editorBanner": "W-zNGW_editorBanner",
		"panelBody": "W-zNGW_panelBody",
		"explorerHeader": "W-zNGW_explorerHeader",
		"dsh-row-in": "W-zNGW_dsh-row-in",
		"browserBlockedActions": "W-zNGW_browserBlockedActions",
		"panelResizeActive": "W-zNGW_panelResizeActive",
		"explorerDir": "W-zNGW_explorerDir",
		"orphanedType": "W-zNGW_orphanedType",
		"gitSection": "W-zNGW_gitSection",
		"gitLogRef": "W-zNGW_gitLogRef",
		"dropUp": "W-zNGW_dropUp",
		"cornerHandle": "W-zNGW_cornerHandle",
		"explorerRoot": "W-zNGW_explorerRoot",
		"split": "W-zNGW_split",
		"pane": "W-zNGW_pane",
		"bottomClose": "W-zNGW_bottomClose",
		"bottomResize": "W-zNGW_bottomResize",
		"splitCol": "W-zNGW_splitCol",
		"dropRight": "W-zNGW_dropRight",
		"sandboxStatusText": "W-zNGW_sandboxStatusText",
		"editorCm": "W-zNGW_editorCm",
		"paneEmptyCards": "W-zNGW_paneEmptyCards",
		"editorXlsx": "W-zNGW_editorXlsx",
		"editorPdfFrameBlocked": "W-zNGW_editorPdfFrameBlocked",
		"editorPptxPosition": "W-zNGW_editorPptxPosition",
		"paneTab": "W-zNGW_paneTab",
		"paneDrop": "W-zNGW_paneDrop",
		"dropCenter": "W-zNGW_dropCenter",
		"editor": "W-zNGW_editor",
		"sandboxAction": "W-zNGW_sandboxAction",
		"browserBlockedButton": "W-zNGW_browserBlockedButton",
		"terminalBannerUrl": "W-zNGW_terminalBannerUrl",
		"gitRowSelected": "W-zNGW_gitRowSelected",
		"gitLogLine1": "W-zNGW_gitLogLine1",
		"dividerRow": "W-zNGW_dividerRow",
		"browserBar": "W-zNGW_browserBar",
		"panel": "W-zNGW_panel",
		"browserBlockedTitle": "W-zNGW_browserBlockedTitle",
		"tabActive": "W-zNGW_tabActive",
		"selectionPopup": "W-zNGW_selectionPopup",
		"browserStart": "W-zNGW_browserStart",
		"gitDiffTab": "W-zNGW_gitDiffTab",
		"browser": "W-zNGW_browser",
		"dividerCol": "W-zNGW_dividerCol",
		"tabClose": "W-zNGW_tabClose",
		"editorCmHidden": "W-zNGW_editorCmHidden",
		"gitBranchSelect": "W-zNGW_gitBranchSelect",
		"gitDiffExpand": "W-zNGW_gitDiffExpand",
		"editorModeActive": "W-zNGW_editorModeActive",
		"gitHeader": "W-zNGW_gitHeader",
		"gitCommitButton": "W-zNGW_gitCommitButton",
		"gitLogHash": "W-zNGW_gitLogHash",
		"gitDiffCtx": "W-zNGW_gitDiffCtx",
		"editorDownloadLink": "W-zNGW_editorDownloadLink",
		"browserFrame": "W-zNGW_browserFrame",
		"editorDocxZoom": "W-zNGW_editorDocxZoom",
		"gitDiffCode": "W-zNGW_gitDiffCode",
		"bottomPanel": "W-zNGW_bottomPanel",
		"gitDiffLine": "W-zNGW_gitDiffLine",
		"editorBinary": "W-zNGW_editorBinary",
		"editorPdfToolbar": "W-zNGW_editorPdfToolbar",
		"editorUniverHost": "W-zNGW_editorUniverHost",
		"editorTitle": "W-zNGW_editorTitle",
		"tab": "W-zNGW_tab",
		"paneContent": "W-zNGW_paneContent",
		"editorImageWrap": "W-zNGW_editorImageWrap",
		"explorerName": "W-zNGW_explorerName",
		"explorerRow": "W-zNGW_explorerRow",
		"editorHeader": "W-zNGW_editorHeader",
		"sandboxDot": "W-zNGW_sandboxDot",
		"gitBadge": "W-zNGW_gitBadge",
		"gitDiffTabTitle": "W-zNGW_gitDiffTabTitle",
		"editorStatusError": "W-zNGW_editorStatusError",
		"editorPptxStage": "W-zNGW_editorPptxStage",
		"gitPlaceholder": "W-zNGW_gitPlaceholder",
		"gitDiffFilePath": "W-zNGW_gitDiffFilePath",
		"gitDiff": "W-zNGW_gitDiff",
		"paneTabHidden": "W-zNGW_paneTabHidden",
		"explorerHidden": "W-zNGW_explorerHidden",
		"dropDown": "W-zNGW_dropDown",
		"editorModeButton": "W-zNGW_editorModeButton",
		"gitError": "W-zNGW_gitError",
		"gitDiffNum": "W-zNGW_gitDiffNum",
		"explorer": "W-zNGW_explorer"
	};
	//#endregion
	//#region src/client/office-shared.tsx
	/**
	* Shared pieces of the Office preview views (docx / xlsx): the load-state
	* union, the shared props, and the download fallback. The two views live in
	* their own modules (docx-view.tsx / xlsx-view.tsx) so the bundler can emit
	* them as separate lazy chunks — docx-preview and the Univer family (several
	* MB) must never share a script (see docs/plans/2026-08-12-lazy-chunks-design.md).
	*/
	/**
	* The shared error / fallback affordance: the failure reason plus a download
	* link, so the user always has a path to the file. Used by both DocxView and
	* XlsxView, and matches the binary placeholder download link.
	*/
	function BinaryFallback(props) {
		const { scope, path, message } = props;
		return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: sidebar_module_css_default.editorBinary,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: sidebar_module_css_default.editorBinaryNotice,
				children: message
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
				className: sidebar_module_css_default.editorDownloadLink,
				href: downloadUrl(scope, path),
				download: true,
				children: t("downloadToView")
			})]
		});
	}
	//#endregion
	//#region node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/dist/jszip.min.js
	var require_jszip_min = /* @__PURE__ */ __commonJSMin(((exports, module) => {
		/*!
		
		JSZip v3.10.1 - A JavaScript class for generating and reading zip files
		<http://stuartk.com/jszip>
		
		(c) 2009-2016 Stuart Knightley <stuart [at] stuartk.com>
		Dual licenced under the MIT license or GPLv3. See https://raw.github.com/Stuk/jszip/main/LICENSE.markdown.
		
		JSZip uses the library pako released under the MIT license :
		https://github.com/nodeca/pako/blob/main/LICENSE
		*/
		(function(e) {
			if ("object" == typeof exports && "undefined" != typeof module) module.exports = e();
			else if ("function" == typeof define && define.amd) define([], e);
			else ("undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof self ? self : this).JSZip = e();
		})(function() {
			return function s(a, o, h) {
				function u(r, e) {
					if (!o[r]) {
						if (!a[r]) {
							var t = "function" == typeof require && require;
							if (!e && t) return t(r, !0);
							if (l) return l(r, !0);
							var n = /* @__PURE__ */ new Error("Cannot find module '" + r + "'");
							throw n.code = "MODULE_NOT_FOUND", n;
						}
						var i = o[r] = { exports: {} };
						a[r][0].call(i.exports, function(e) {
							var t = a[r][1][e];
							return u(t || e);
						}, i, i.exports, s, a, o, h);
					}
					return o[r].exports;
				}
				for (var l = "function" == typeof require && require, e = 0; e < h.length; e++) u(h[e]);
				return u;
			}({
				1: [function(e, t, r) {
					"use strict";
					var d = e("./utils"), c = e("./support"), p = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
					r.encode = function(e) {
						for (var t, r, n, i, s, a, o, h = [], u = 0, l = e.length, f = l, c = "string" !== d.getTypeOf(e); u < e.length;) f = l - u, n = c ? (t = e[u++], r = u < l ? e[u++] : 0, u < l ? e[u++] : 0) : (t = e.charCodeAt(u++), r = u < l ? e.charCodeAt(u++) : 0, u < l ? e.charCodeAt(u++) : 0), i = t >> 2, s = (3 & t) << 4 | r >> 4, a = 1 < f ? (15 & r) << 2 | n >> 6 : 64, o = 2 < f ? 63 & n : 64, h.push(p.charAt(i) + p.charAt(s) + p.charAt(a) + p.charAt(o));
						return h.join("");
					}, r.decode = function(e) {
						var t, r, n, i, s, a, o = 0, h = 0, u = "data:";
						if (e.substr(0, u.length) === u) throw new Error("Invalid base64 input, it looks like a data url.");
						var l, f = 3 * (e = e.replace(/[^A-Za-z0-9+/=]/g, "")).length / 4;
						if (e.charAt(e.length - 1) === p.charAt(64) && f--, e.charAt(e.length - 2) === p.charAt(64) && f--, f % 1 != 0) throw new Error("Invalid base64 input, bad content length.");
						for (l = c.uint8array ? new Uint8Array(0 | f) : new Array(0 | f); o < e.length;) t = p.indexOf(e.charAt(o++)) << 2 | (i = p.indexOf(e.charAt(o++))) >> 4, r = (15 & i) << 4 | (s = p.indexOf(e.charAt(o++))) >> 2, n = (3 & s) << 6 | (a = p.indexOf(e.charAt(o++))), l[h++] = t, 64 !== s && (l[h++] = r), 64 !== a && (l[h++] = n);
						return l;
					};
				}, {
					"./support": 30,
					"./utils": 32
				}],
				2: [function(e, t, r) {
					"use strict";
					var n = e("./external"), i = e("./stream/DataWorker"), s = e("./stream/Crc32Probe"), a = e("./stream/DataLengthProbe");
					function o(e, t, r, n, i) {
						this.compressedSize = e, this.uncompressedSize = t, this.crc32 = r, this.compression = n, this.compressedContent = i;
					}
					o.prototype = {
						getContentWorker: function() {
							var e = new i(n.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new a("data_length")), t = this;
							return e.on("end", function() {
								if (this.streamInfo.data_length !== t.uncompressedSize) throw new Error("Bug : uncompressed data size mismatch");
							}), e;
						},
						getCompressedWorker: function() {
							return new i(n.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize", this.compressedSize).withStreamInfo("uncompressedSize", this.uncompressedSize).withStreamInfo("crc32", this.crc32).withStreamInfo("compression", this.compression);
						}
					}, o.createWorkerFrom = function(e, t, r) {
						return e.pipe(new s()).pipe(new a("uncompressedSize")).pipe(t.compressWorker(r)).pipe(new a("compressedSize")).withStreamInfo("compression", t);
					}, t.exports = o;
				}, {
					"./external": 6,
					"./stream/Crc32Probe": 25,
					"./stream/DataLengthProbe": 26,
					"./stream/DataWorker": 27
				}],
				3: [function(e, t, r) {
					"use strict";
					var n = e("./stream/GenericWorker");
					r.STORE = {
						magic: "\0\0",
						compressWorker: function() {
							return new n("STORE compression");
						},
						uncompressWorker: function() {
							return new n("STORE decompression");
						}
					}, r.DEFLATE = e("./flate");
				}, {
					"./flate": 7,
					"./stream/GenericWorker": 28
				}],
				4: [function(e, t, r) {
					"use strict";
					var n = e("./utils");
					var o = function() {
						for (var e, t = [], r = 0; r < 256; r++) {
							e = r;
							for (var n = 0; n < 8; n++) e = 1 & e ? 3988292384 ^ e >>> 1 : e >>> 1;
							t[r] = e;
						}
						return t;
					}();
					t.exports = function(e, t) {
						return void 0 !== e && e.length ? "string" !== n.getTypeOf(e) ? function(e, t, r, n) {
							var i = o, s = n + r;
							e ^= -1;
							for (var a = n; a < s; a++) e = e >>> 8 ^ i[255 & (e ^ t[a])];
							return -1 ^ e;
						}(0 | t, e, e.length, 0) : function(e, t, r, n) {
							var i = o, s = n + r;
							e ^= -1;
							for (var a = n; a < s; a++) e = e >>> 8 ^ i[255 & (e ^ t.charCodeAt(a))];
							return -1 ^ e;
						}(0 | t, e, e.length, 0) : 0;
					};
				}, { "./utils": 32 }],
				5: [function(e, t, r) {
					"use strict";
					r.base64 = !1, r.binary = !1, r.dir = !1, r.createFolders = !0, r.date = null, r.compression = null, r.compressionOptions = null, r.comment = null, r.unixPermissions = null, r.dosPermissions = null;
				}, {}],
				6: [function(e, t, r) {
					"use strict";
					var n = null;
					n = "undefined" != typeof Promise ? Promise : e("lie"), t.exports = { Promise: n };
				}, { lie: 37 }],
				7: [function(e, t, r) {
					"use strict";
					var n = "undefined" != typeof Uint8Array && "undefined" != typeof Uint16Array && "undefined" != typeof Uint32Array, i = e("pako"), s = e("./utils"), a = e("./stream/GenericWorker"), o = n ? "uint8array" : "array";
					function h(e, t) {
						a.call(this, "FlateWorker/" + e), this._pako = null, this._pakoAction = e, this._pakoOptions = t, this.meta = {};
					}
					r.magic = "\b\0", s.inherits(h, a), h.prototype.processChunk = function(e) {
						this.meta = e.meta, null === this._pako && this._createPako(), this._pako.push(s.transformTo(o, e.data), !1);
					}, h.prototype.flush = function() {
						a.prototype.flush.call(this), null === this._pako && this._createPako(), this._pako.push([], !0);
					}, h.prototype.cleanUp = function() {
						a.prototype.cleanUp.call(this), this._pako = null;
					}, h.prototype._createPako = function() {
						this._pako = new i[this._pakoAction]({
							raw: !0,
							level: this._pakoOptions.level || -1
						});
						var t = this;
						this._pako.onData = function(e) {
							t.push({
								data: e,
								meta: t.meta
							});
						};
					}, r.compressWorker = function(e) {
						return new h("Deflate", e);
					}, r.uncompressWorker = function() {
						return new h("Inflate", {});
					};
				}, {
					"./stream/GenericWorker": 28,
					"./utils": 32,
					pako: 38
				}],
				8: [function(e, t, r) {
					"use strict";
					function A(e, t) {
						var r, n = "";
						for (r = 0; r < t; r++) n += String.fromCharCode(255 & e), e >>>= 8;
						return n;
					}
					function n(e, t, r, n, i, s) {
						var a, o, h = e.file, u = e.compression, l = s !== O.utf8encode, f = I.transformTo("string", s(h.name)), c = I.transformTo("string", O.utf8encode(h.name)), d = h.comment, p = I.transformTo("string", s(d)), m = I.transformTo("string", O.utf8encode(d)), _ = c.length !== h.name.length, g = m.length !== d.length, b = "", v = "", y = "", w = h.dir, k = h.date, x = {
							crc32: 0,
							compressedSize: 0,
							uncompressedSize: 0
						};
						t && !r || (x.crc32 = e.crc32, x.compressedSize = e.compressedSize, x.uncompressedSize = e.uncompressedSize);
						var S = 0;
						t && (S |= 8), l || !_ && !g || (S |= 2048);
						var z = 0, C = 0;
						w && (z |= 16), "UNIX" === i ? (C = 798, z |= function(e, t) {
							var r = e;
							return e || (r = t ? 16893 : 33204), (65535 & r) << 16;
						}(h.unixPermissions, w)) : (C = 20, z |= function(e) {
							return 63 & (e || 0);
						}(h.dosPermissions)), a = k.getUTCHours(), a <<= 6, a |= k.getUTCMinutes(), a <<= 5, a |= k.getUTCSeconds() / 2, o = k.getUTCFullYear() - 1980, o <<= 4, o |= k.getUTCMonth() + 1, o <<= 5, o |= k.getUTCDate(), _ && (v = A(1, 1) + A(B(f), 4) + c, b += "up" + A(v.length, 2) + v), g && (y = A(1, 1) + A(B(p), 4) + m, b += "uc" + A(y.length, 2) + y);
						var E = "";
						return E += "\n\0", E += A(S, 2), E += u.magic, E += A(a, 2), E += A(o, 2), E += A(x.crc32, 4), E += A(x.compressedSize, 4), E += A(x.uncompressedSize, 4), E += A(f.length, 2), E += A(b.length, 2), {
							fileRecord: R.LOCAL_FILE_HEADER + E + f + b,
							dirRecord: R.CENTRAL_FILE_HEADER + A(C, 2) + E + A(p.length, 2) + "\0\0\0\0" + A(z, 4) + A(n, 4) + f + b + p
						};
					}
					var I = e("../utils"), i = e("../stream/GenericWorker"), O = e("../utf8"), B = e("../crc32"), R = e("../signature");
					function s(e, t, r, n) {
						i.call(this, "ZipFileWorker"), this.bytesWritten = 0, this.zipComment = t, this.zipPlatform = r, this.encodeFileName = n, this.streamFiles = e, this.accumulate = !1, this.contentBuffer = [], this.dirRecords = [], this.currentSourceOffset = 0, this.entriesCount = 0, this.currentFile = null, this._sources = [];
					}
					I.inherits(s, i), s.prototype.push = function(e) {
						var t = e.meta.percent || 0, r = this.entriesCount, n = this._sources.length;
						this.accumulate ? this.contentBuffer.push(e) : (this.bytesWritten += e.data.length, i.prototype.push.call(this, {
							data: e.data,
							meta: {
								currentFile: this.currentFile,
								percent: r ? (t + 100 * (r - n - 1)) / r : 100
							}
						}));
					}, s.prototype.openedSource = function(e) {
						this.currentSourceOffset = this.bytesWritten, this.currentFile = e.file.name;
						var t = this.streamFiles && !e.file.dir;
						if (t) {
							var r = n(e, t, !1, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
							this.push({
								data: r.fileRecord,
								meta: { percent: 0 }
							});
						} else this.accumulate = !0;
					}, s.prototype.closedSource = function(e) {
						this.accumulate = !1;
						var t = this.streamFiles && !e.file.dir, r = n(e, t, !0, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
						if (this.dirRecords.push(r.dirRecord), t) this.push({
							data: function(e) {
								return R.DATA_DESCRIPTOR + A(e.crc32, 4) + A(e.compressedSize, 4) + A(e.uncompressedSize, 4);
							}(e),
							meta: { percent: 100 }
						});
						else for (this.push({
							data: r.fileRecord,
							meta: { percent: 0 }
						}); this.contentBuffer.length;) this.push(this.contentBuffer.shift());
						this.currentFile = null;
					}, s.prototype.flush = function() {
						for (var e = this.bytesWritten, t = 0; t < this.dirRecords.length; t++) this.push({
							data: this.dirRecords[t],
							meta: { percent: 100 }
						});
						var r = this.bytesWritten - e, n = function(e, t, r, n, i) {
							var s = I.transformTo("string", i(n));
							return R.CENTRAL_DIRECTORY_END + "\0\0\0\0" + A(e, 2) + A(e, 2) + A(t, 4) + A(r, 4) + A(s.length, 2) + s;
						}(this.dirRecords.length, r, e, this.zipComment, this.encodeFileName);
						this.push({
							data: n,
							meta: { percent: 100 }
						});
					}, s.prototype.prepareNextSource = function() {
						this.previous = this._sources.shift(), this.openedSource(this.previous.streamInfo), this.isPaused ? this.previous.pause() : this.previous.resume();
					}, s.prototype.registerPrevious = function(e) {
						this._sources.push(e);
						var t = this;
						return e.on("data", function(e) {
							t.processChunk(e);
						}), e.on("end", function() {
							t.closedSource(t.previous.streamInfo), t._sources.length ? t.prepareNextSource() : t.end();
						}), e.on("error", function(e) {
							t.error(e);
						}), this;
					}, s.prototype.resume = function() {
						return !!i.prototype.resume.call(this) && (!this.previous && this._sources.length ? (this.prepareNextSource(), !0) : this.previous || this._sources.length || this.generatedError ? void 0 : (this.end(), !0));
					}, s.prototype.error = function(e) {
						var t = this._sources;
						if (!i.prototype.error.call(this, e)) return !1;
						for (var r = 0; r < t.length; r++) try {
							t[r].error(e);
						} catch (e) {}
						return !0;
					}, s.prototype.lock = function() {
						i.prototype.lock.call(this);
						for (var e = this._sources, t = 0; t < e.length; t++) e[t].lock();
					}, t.exports = s;
				}, {
					"../crc32": 4,
					"../signature": 23,
					"../stream/GenericWorker": 28,
					"../utf8": 31,
					"../utils": 32
				}],
				9: [function(e, t, r) {
					"use strict";
					var u = e("../compressions"), n = e("./ZipFileWorker");
					r.generateWorker = function(e, a, t) {
						var o = new n(a.streamFiles, t, a.platform, a.encodeFileName), h = 0;
						try {
							e.forEach(function(e, t) {
								h++;
								var r = function(e, t) {
									var r = e || t, n = u[r];
									if (!n) throw new Error(r + " is not a valid compression method !");
									return n;
								}(t.options.compression, a.compression), n = t.options.compressionOptions || a.compressionOptions || {}, i = t.dir, s = t.date;
								t._compressWorker(r, n).withStreamInfo("file", {
									name: e,
									dir: i,
									date: s,
									comment: t.comment || "",
									unixPermissions: t.unixPermissions,
									dosPermissions: t.dosPermissions
								}).pipe(o);
							}), o.entriesCount = h;
						} catch (e) {
							o.error(e);
						}
						return o;
					};
				}, {
					"../compressions": 3,
					"./ZipFileWorker": 8
				}],
				10: [function(e, t, r) {
					"use strict";
					function n() {
						if (!(this instanceof n)) return new n();
						if (arguments.length) throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");
						this.files = Object.create(null), this.comment = null, this.root = "", this.clone = function() {
							var e = new n();
							for (var t in this) "function" != typeof this[t] && (e[t] = this[t]);
							return e;
						};
					}
					(n.prototype = e("./object")).loadAsync = e("./load"), n.support = e("./support"), n.defaults = e("./defaults"), n.version = "3.10.1", n.loadAsync = function(e, t) {
						return new n().loadAsync(e, t);
					}, n.external = e("./external"), t.exports = n;
				}, {
					"./defaults": 5,
					"./external": 6,
					"./load": 11,
					"./object": 15,
					"./support": 30
				}],
				11: [function(e, t, r) {
					"use strict";
					var u = e("./utils"), i = e("./external"), n = e("./utf8"), s = e("./zipEntries"), a = e("./stream/Crc32Probe"), l = e("./nodejsUtils");
					function f(n) {
						return new i.Promise(function(e, t) {
							var r = n.decompressed.getContentWorker().pipe(new a());
							r.on("error", function(e) {
								t(e);
							}).on("end", function() {
								r.streamInfo.crc32 !== n.decompressed.crc32 ? t(/* @__PURE__ */ new Error("Corrupted zip : CRC32 mismatch")) : e();
							}).resume();
						});
					}
					t.exports = function(e, o) {
						var h = this;
						return o = u.extend(o || {}, {
							base64: !1,
							checkCRC32: !1,
							optimizedBinaryString: !1,
							createFolders: !1,
							decodeFileName: n.utf8decode
						}), l.isNode && l.isStream(e) ? i.Promise.reject(/* @__PURE__ */ new Error("JSZip can't accept a stream when loading a zip file.")) : u.prepareContent("the loaded zip file", e, !0, o.optimizedBinaryString, o.base64).then(function(e) {
							var t = new s(o);
							return t.load(e), t;
						}).then(function(e) {
							var t = [i.Promise.resolve(e)], r = e.files;
							if (o.checkCRC32) for (var n = 0; n < r.length; n++) t.push(f(r[n]));
							return i.Promise.all(t);
						}).then(function(e) {
							for (var t = e.shift(), r = t.files, n = 0; n < r.length; n++) {
								var i = r[n], s = i.fileNameStr, a = u.resolve(i.fileNameStr);
								h.file(a, i.decompressed, {
									binary: !0,
									optimizedBinaryString: !0,
									date: i.date,
									dir: i.dir,
									comment: i.fileCommentStr.length ? i.fileCommentStr : null,
									unixPermissions: i.unixPermissions,
									dosPermissions: i.dosPermissions,
									createFolders: o.createFolders
								}), i.dir || (h.file(a).unsafeOriginalName = s);
							}
							return t.zipComment.length && (h.comment = t.zipComment), h;
						});
					};
				}, {
					"./external": 6,
					"./nodejsUtils": 14,
					"./stream/Crc32Probe": 25,
					"./utf8": 31,
					"./utils": 32,
					"./zipEntries": 33
				}],
				12: [function(e, t, r) {
					"use strict";
					var n = e("../utils"), i = e("../stream/GenericWorker");
					function s(e, t) {
						i.call(this, "Nodejs stream input adapter for " + e), this._upstreamEnded = !1, this._bindStream(t);
					}
					n.inherits(s, i), s.prototype._bindStream = function(e) {
						var t = this;
						(this._stream = e).pause(), e.on("data", function(e) {
							t.push({
								data: e,
								meta: { percent: 0 }
							});
						}).on("error", function(e) {
							t.isPaused ? this.generatedError = e : t.error(e);
						}).on("end", function() {
							t.isPaused ? t._upstreamEnded = !0 : t.end();
						});
					}, s.prototype.pause = function() {
						return !!i.prototype.pause.call(this) && (this._stream.pause(), !0);
					}, s.prototype.resume = function() {
						return !!i.prototype.resume.call(this) && (this._upstreamEnded ? this.end() : this._stream.resume(), !0);
					}, t.exports = s;
				}, {
					"../stream/GenericWorker": 28,
					"../utils": 32
				}],
				13: [function(e, t, r) {
					"use strict";
					var i = e("readable-stream").Readable;
					function n(e, t, r) {
						i.call(this, t), this._helper = e;
						var n = this;
						e.on("data", function(e, t) {
							n.push(e) || n._helper.pause(), r && r(t);
						}).on("error", function(e) {
							n.emit("error", e);
						}).on("end", function() {
							n.push(null);
						});
					}
					e("../utils").inherits(n, i), n.prototype._read = function() {
						this._helper.resume();
					}, t.exports = n;
				}, {
					"../utils": 32,
					"readable-stream": 16
				}],
				14: [function(e, t, r) {
					"use strict";
					t.exports = {
						isNode: "undefined" != typeof Buffer,
						newBufferFrom: function(e, t) {
							if (Buffer.from && Buffer.from !== Uint8Array.from) return Buffer.from(e, t);
							if ("number" == typeof e) throw new Error("The \"data\" argument must not be a number");
							return new Buffer(e, t);
						},
						allocBuffer: function(e) {
							if (Buffer.alloc) return Buffer.alloc(e);
							var t = new Buffer(e);
							return t.fill(0), t;
						},
						isBuffer: function(e) {
							return Buffer.isBuffer(e);
						},
						isStream: function(e) {
							return e && "function" == typeof e.on && "function" == typeof e.pause && "function" == typeof e.resume;
						}
					};
				}, {}],
				15: [function(e, t, r) {
					"use strict";
					function s(e, t, r) {
						var n, i = u.getTypeOf(t), s = u.extend(r || {}, f);
						s.date = s.date || /* @__PURE__ */ new Date(), null !== s.compression && (s.compression = s.compression.toUpperCase()), "string" == typeof s.unixPermissions && (s.unixPermissions = parseInt(s.unixPermissions, 8)), s.unixPermissions && 16384 & s.unixPermissions && (s.dir = !0), s.dosPermissions && 16 & s.dosPermissions && (s.dir = !0), s.dir && (e = g(e)), s.createFolders && (n = _(e)) && b.call(this, n, !0);
						var a = "string" === i && !1 === s.binary && !1 === s.base64;
						r && void 0 !== r.binary || (s.binary = !a), (t instanceof c && 0 === t.uncompressedSize || s.dir || !t || 0 === t.length) && (s.base64 = !1, s.binary = !0, t = "", s.compression = "STORE", i = "string");
						var o = null;
						o = t instanceof c || t instanceof l ? t : p.isNode && p.isStream(t) ? new m(e, t) : u.prepareContent(e, t, s.binary, s.optimizedBinaryString, s.base64);
						var h = new d(e, o, s);
						this.files[e] = h;
					}
					var i = e("./utf8"), u = e("./utils"), l = e("./stream/GenericWorker"), a = e("./stream/StreamHelper"), f = e("./defaults"), c = e("./compressedObject"), d = e("./zipObject"), o = e("./generate"), p = e("./nodejsUtils"), m = e("./nodejs/NodejsStreamInputAdapter"), _ = function(e) {
						"/" === e.slice(-1) && (e = e.substring(0, e.length - 1));
						var t = e.lastIndexOf("/");
						return 0 < t ? e.substring(0, t) : "";
					}, g = function(e) {
						return "/" !== e.slice(-1) && (e += "/"), e;
					}, b = function(e, t) {
						return t = void 0 !== t ? t : f.createFolders, e = g(e), this.files[e] || s.call(this, e, null, {
							dir: !0,
							createFolders: t
						}), this.files[e];
					};
					function h(e) {
						return "[object RegExp]" === Object.prototype.toString.call(e);
					}
					t.exports = {
						load: function() {
							throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
						},
						forEach: function(e) {
							var t, r, n;
							for (t in this.files) n = this.files[t], (r = t.slice(this.root.length, t.length)) && t.slice(0, this.root.length) === this.root && e(r, n);
						},
						filter: function(r) {
							var n = [];
							return this.forEach(function(e, t) {
								r(e, t) && n.push(t);
							}), n;
						},
						file: function(e, t, r) {
							if (1 !== arguments.length) return e = this.root + e, s.call(this, e, t, r), this;
							if (h(e)) {
								var n = e;
								return this.filter(function(e, t) {
									return !t.dir && n.test(e);
								});
							}
							var i = this.files[this.root + e];
							return i && !i.dir ? i : null;
						},
						folder: function(r) {
							if (!r) return this;
							if (h(r)) return this.filter(function(e, t) {
								return t.dir && r.test(e);
							});
							var e = this.root + r, t = b.call(this, e), n = this.clone();
							return n.root = t.name, n;
						},
						remove: function(r) {
							r = this.root + r;
							var e = this.files[r];
							if (e || ("/" !== r.slice(-1) && (r += "/"), e = this.files[r]), e && !e.dir) delete this.files[r];
							else for (var t = this.filter(function(e, t) {
								return t.name.slice(0, r.length) === r;
							}), n = 0; n < t.length; n++) delete this.files[t[n].name];
							return this;
						},
						generate: function() {
							throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
						},
						generateInternalStream: function(e) {
							var t, r = {};
							try {
								if ((r = u.extend(e || {}, {
									streamFiles: !1,
									compression: "STORE",
									compressionOptions: null,
									type: "",
									platform: "DOS",
									comment: null,
									mimeType: "application/zip",
									encodeFileName: i.utf8encode
								})).type = r.type.toLowerCase(), r.compression = r.compression.toUpperCase(), "binarystring" === r.type && (r.type = "string"), !r.type) throw new Error("No output type specified.");
								u.checkSupport(r.type), "darwin" !== r.platform && "freebsd" !== r.platform && "linux" !== r.platform && "sunos" !== r.platform || (r.platform = "UNIX"), "win32" === r.platform && (r.platform = "DOS");
								var n = r.comment || this.comment || "";
								t = o.generateWorker(this, r, n);
							} catch (e) {
								(t = new l("error")).error(e);
							}
							return new a(t, r.type || "string", r.mimeType);
						},
						generateAsync: function(e, t) {
							return this.generateInternalStream(e).accumulate(t);
						},
						generateNodeStream: function(e, t) {
							return (e = e || {}).type || (e.type = "nodebuffer"), this.generateInternalStream(e).toNodejsStream(t);
						}
					};
				}, {
					"./compressedObject": 2,
					"./defaults": 5,
					"./generate": 9,
					"./nodejs/NodejsStreamInputAdapter": 12,
					"./nodejsUtils": 14,
					"./stream/GenericWorker": 28,
					"./stream/StreamHelper": 29,
					"./utf8": 31,
					"./utils": 32,
					"./zipObject": 35
				}],
				16: [function(e, t, r) {
					"use strict";
					t.exports = e("stream");
				}, { stream: void 0 }],
				17: [function(e, t, r) {
					"use strict";
					var n = e("./DataReader");
					function i(e) {
						n.call(this, e);
						for (var t = 0; t < this.data.length; t++) e[t] = 255 & e[t];
					}
					e("../utils").inherits(i, n), i.prototype.byteAt = function(e) {
						return this.data[this.zero + e];
					}, i.prototype.lastIndexOfSignature = function(e) {
						for (var t = e.charCodeAt(0), r = e.charCodeAt(1), n = e.charCodeAt(2), i = e.charCodeAt(3), s = this.length - 4; 0 <= s; --s) if (this.data[s] === t && this.data[s + 1] === r && this.data[s + 2] === n && this.data[s + 3] === i) return s - this.zero;
						return -1;
					}, i.prototype.readAndCheckSignature = function(e) {
						var t = e.charCodeAt(0), r = e.charCodeAt(1), n = e.charCodeAt(2), i = e.charCodeAt(3), s = this.readData(4);
						return t === s[0] && r === s[1] && n === s[2] && i === s[3];
					}, i.prototype.readData = function(e) {
						if (this.checkOffset(e), 0 === e) return [];
						var t = this.data.slice(this.zero + this.index, this.zero + this.index + e);
						return this.index += e, t;
					}, t.exports = i;
				}, {
					"../utils": 32,
					"./DataReader": 18
				}],
				18: [function(e, t, r) {
					"use strict";
					var n = e("../utils");
					function i(e) {
						this.data = e, this.length = e.length, this.index = 0, this.zero = 0;
					}
					i.prototype = {
						checkOffset: function(e) {
							this.checkIndex(this.index + e);
						},
						checkIndex: function(e) {
							if (this.length < this.zero + e || e < 0) throw new Error("End of data reached (data length = " + this.length + ", asked index = " + e + "). Corrupted zip ?");
						},
						setIndex: function(e) {
							this.checkIndex(e), this.index = e;
						},
						skip: function(e) {
							this.setIndex(this.index + e);
						},
						byteAt: function() {},
						readInt: function(e) {
							var t, r = 0;
							for (this.checkOffset(e), t = this.index + e - 1; t >= this.index; t--) r = (r << 8) + this.byteAt(t);
							return this.index += e, r;
						},
						readString: function(e) {
							return n.transformTo("string", this.readData(e));
						},
						readData: function() {},
						lastIndexOfSignature: function() {},
						readAndCheckSignature: function() {},
						readDate: function() {
							var e = this.readInt(4);
							return new Date(Date.UTC(1980 + (e >> 25 & 127), (e >> 21 & 15) - 1, e >> 16 & 31, e >> 11 & 31, e >> 5 & 63, (31 & e) << 1));
						}
					}, t.exports = i;
				}, { "../utils": 32 }],
				19: [function(e, t, r) {
					"use strict";
					var n = e("./Uint8ArrayReader");
					function i(e) {
						n.call(this, e);
					}
					e("../utils").inherits(i, n), i.prototype.readData = function(e) {
						this.checkOffset(e);
						var t = this.data.slice(this.zero + this.index, this.zero + this.index + e);
						return this.index += e, t;
					}, t.exports = i;
				}, {
					"../utils": 32,
					"./Uint8ArrayReader": 21
				}],
				20: [function(e, t, r) {
					"use strict";
					var n = e("./DataReader");
					function i(e) {
						n.call(this, e);
					}
					e("../utils").inherits(i, n), i.prototype.byteAt = function(e) {
						return this.data.charCodeAt(this.zero + e);
					}, i.prototype.lastIndexOfSignature = function(e) {
						return this.data.lastIndexOf(e) - this.zero;
					}, i.prototype.readAndCheckSignature = function(e) {
						return e === this.readData(4);
					}, i.prototype.readData = function(e) {
						this.checkOffset(e);
						var t = this.data.slice(this.zero + this.index, this.zero + this.index + e);
						return this.index += e, t;
					}, t.exports = i;
				}, {
					"../utils": 32,
					"./DataReader": 18
				}],
				21: [function(e, t, r) {
					"use strict";
					var n = e("./ArrayReader");
					function i(e) {
						n.call(this, e);
					}
					e("../utils").inherits(i, n), i.prototype.readData = function(e) {
						if (this.checkOffset(e), 0 === e) return /* @__PURE__ */ new Uint8Array(0);
						var t = this.data.subarray(this.zero + this.index, this.zero + this.index + e);
						return this.index += e, t;
					}, t.exports = i;
				}, {
					"../utils": 32,
					"./ArrayReader": 17
				}],
				22: [function(e, t, r) {
					"use strict";
					var n = e("../utils"), i = e("../support"), s = e("./ArrayReader"), a = e("./StringReader"), o = e("./NodeBufferReader"), h = e("./Uint8ArrayReader");
					t.exports = function(e) {
						var t = n.getTypeOf(e);
						return n.checkSupport(t), "string" !== t || i.uint8array ? "nodebuffer" === t ? new o(e) : i.uint8array ? new h(n.transformTo("uint8array", e)) : new s(n.transformTo("array", e)) : new a(e);
					};
				}, {
					"../support": 30,
					"../utils": 32,
					"./ArrayReader": 17,
					"./NodeBufferReader": 19,
					"./StringReader": 20,
					"./Uint8ArrayReader": 21
				}],
				23: [function(e, t, r) {
					"use strict";
					r.LOCAL_FILE_HEADER = "PK", r.CENTRAL_FILE_HEADER = "PK", r.CENTRAL_DIRECTORY_END = "PK", r.ZIP64_CENTRAL_DIRECTORY_LOCATOR = "PK\x07", r.ZIP64_CENTRAL_DIRECTORY_END = "PK", r.DATA_DESCRIPTOR = "PK\x07\b";
				}, {}],
				24: [function(e, t, r) {
					"use strict";
					var n = e("./GenericWorker"), i = e("../utils");
					function s(e) {
						n.call(this, "ConvertWorker to " + e), this.destType = e;
					}
					i.inherits(s, n), s.prototype.processChunk = function(e) {
						this.push({
							data: i.transformTo(this.destType, e.data),
							meta: e.meta
						});
					}, t.exports = s;
				}, {
					"../utils": 32,
					"./GenericWorker": 28
				}],
				25: [function(e, t, r) {
					"use strict";
					var n = e("./GenericWorker"), i = e("../crc32");
					function s() {
						n.call(this, "Crc32Probe"), this.withStreamInfo("crc32", 0);
					}
					e("../utils").inherits(s, n), s.prototype.processChunk = function(e) {
						this.streamInfo.crc32 = i(e.data, this.streamInfo.crc32 || 0), this.push(e);
					}, t.exports = s;
				}, {
					"../crc32": 4,
					"../utils": 32,
					"./GenericWorker": 28
				}],
				26: [function(e, t, r) {
					"use strict";
					var n = e("../utils"), i = e("./GenericWorker");
					function s(e) {
						i.call(this, "DataLengthProbe for " + e), this.propName = e, this.withStreamInfo(e, 0);
					}
					n.inherits(s, i), s.prototype.processChunk = function(e) {
						if (e) {
							var t = this.streamInfo[this.propName] || 0;
							this.streamInfo[this.propName] = t + e.data.length;
						}
						i.prototype.processChunk.call(this, e);
					}, t.exports = s;
				}, {
					"../utils": 32,
					"./GenericWorker": 28
				}],
				27: [function(e, t, r) {
					"use strict";
					var n = e("../utils"), i = e("./GenericWorker");
					function s(e) {
						i.call(this, "DataWorker");
						var t = this;
						this.dataIsReady = !1, this.index = 0, this.max = 0, this.data = null, this.type = "", this._tickScheduled = !1, e.then(function(e) {
							t.dataIsReady = !0, t.data = e, t.max = e && e.length || 0, t.type = n.getTypeOf(e), t.isPaused || t._tickAndRepeat();
						}, function(e) {
							t.error(e);
						});
					}
					n.inherits(s, i), s.prototype.cleanUp = function() {
						i.prototype.cleanUp.call(this), this.data = null;
					}, s.prototype.resume = function() {
						return !!i.prototype.resume.call(this) && (!this._tickScheduled && this.dataIsReady && (this._tickScheduled = !0, n.delay(this._tickAndRepeat, [], this)), !0);
					}, s.prototype._tickAndRepeat = function() {
						this._tickScheduled = !1, this.isPaused || this.isFinished || (this._tick(), this.isFinished || (n.delay(this._tickAndRepeat, [], this), this._tickScheduled = !0));
					}, s.prototype._tick = function() {
						if (this.isPaused || this.isFinished) return !1;
						var e = null, t = Math.min(this.max, this.index + 16384);
						if (this.index >= this.max) return this.end();
						switch (this.type) {
							case "string":
								e = this.data.substring(this.index, t);
								break;
							case "uint8array":
								e = this.data.subarray(this.index, t);
								break;
							case "array":
							case "nodebuffer": e = this.data.slice(this.index, t);
						}
						return this.index = t, this.push({
							data: e,
							meta: { percent: this.max ? this.index / this.max * 100 : 0 }
						});
					}, t.exports = s;
				}, {
					"../utils": 32,
					"./GenericWorker": 28
				}],
				28: [function(e, t, r) {
					"use strict";
					function n(e) {
						this.name = e || "default", this.streamInfo = {}, this.generatedError = null, this.extraStreamInfo = {}, this.isPaused = !0, this.isFinished = !1, this.isLocked = !1, this._listeners = {
							data: [],
							end: [],
							error: []
						}, this.previous = null;
					}
					n.prototype = {
						push: function(e) {
							this.emit("data", e);
						},
						end: function() {
							if (this.isFinished) return !1;
							this.flush();
							try {
								this.emit("end"), this.cleanUp(), this.isFinished = !0;
							} catch (e) {
								this.emit("error", e);
							}
							return !0;
						},
						error: function(e) {
							return !this.isFinished && (this.isPaused ? this.generatedError = e : (this.isFinished = !0, this.emit("error", e), this.previous && this.previous.error(e), this.cleanUp()), !0);
						},
						on: function(e, t) {
							return this._listeners[e].push(t), this;
						},
						cleanUp: function() {
							this.streamInfo = this.generatedError = this.extraStreamInfo = null, this._listeners = [];
						},
						emit: function(e, t) {
							if (this._listeners[e]) for (var r = 0; r < this._listeners[e].length; r++) this._listeners[e][r].call(this, t);
						},
						pipe: function(e) {
							return e.registerPrevious(this);
						},
						registerPrevious: function(e) {
							if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
							this.streamInfo = e.streamInfo, this.mergeStreamInfo(), this.previous = e;
							var t = this;
							return e.on("data", function(e) {
								t.processChunk(e);
							}), e.on("end", function() {
								t.end();
							}), e.on("error", function(e) {
								t.error(e);
							}), this;
						},
						pause: function() {
							return !this.isPaused && !this.isFinished && (this.isPaused = !0, this.previous && this.previous.pause(), !0);
						},
						resume: function() {
							if (!this.isPaused || this.isFinished) return !1;
							var e = this.isPaused = !1;
							return this.generatedError && (this.error(this.generatedError), e = !0), this.previous && this.previous.resume(), !e;
						},
						flush: function() {},
						processChunk: function(e) {
							this.push(e);
						},
						withStreamInfo: function(e, t) {
							return this.extraStreamInfo[e] = t, this.mergeStreamInfo(), this;
						},
						mergeStreamInfo: function() {
							for (var e in this.extraStreamInfo) Object.prototype.hasOwnProperty.call(this.extraStreamInfo, e) && (this.streamInfo[e] = this.extraStreamInfo[e]);
						},
						lock: function() {
							if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
							this.isLocked = !0, this.previous && this.previous.lock();
						},
						toString: function() {
							var e = "Worker " + this.name;
							return this.previous ? this.previous + " -> " + e : e;
						}
					}, t.exports = n;
				}, {}],
				29: [function(e, t, r) {
					"use strict";
					var h = e("../utils"), i = e("./ConvertWorker"), s = e("./GenericWorker"), u = e("../base64"), n = e("../support"), a = e("../external"), o = null;
					if (n.nodestream) try {
						o = e("../nodejs/NodejsStreamOutputAdapter");
					} catch (e) {}
					function l(e, o) {
						return new a.Promise(function(t, r) {
							var n = [], i = e._internalType, s = e._outputType, a = e._mimeType;
							e.on("data", function(e, t) {
								n.push(e), o && o(t);
							}).on("error", function(e) {
								n = [], r(e);
							}).on("end", function() {
								try {
									t(function(e, t, r) {
										switch (e) {
											case "blob": return h.newBlob(h.transformTo("arraybuffer", t), r);
											case "base64": return u.encode(t);
											default: return h.transformTo(e, t);
										}
									}(s, function(e, t) {
										var r, n = 0, i = null, s = 0;
										for (r = 0; r < t.length; r++) s += t[r].length;
										switch (e) {
											case "string": return t.join("");
											case "array": return Array.prototype.concat.apply([], t);
											case "uint8array":
												for (i = new Uint8Array(s), r = 0; r < t.length; r++) i.set(t[r], n), n += t[r].length;
												return i;
											case "nodebuffer": return Buffer.concat(t);
											default: throw new Error("concat : unsupported type '" + e + "'");
										}
									}(i, n), a));
								} catch (e) {
									r(e);
								}
								n = [];
							}).resume();
						});
					}
					function f(e, t, r) {
						var n = t;
						switch (t) {
							case "blob":
							case "arraybuffer":
								n = "uint8array";
								break;
							case "base64": n = "string";
						}
						try {
							this._internalType = n, this._outputType = t, this._mimeType = r, h.checkSupport(n), this._worker = e.pipe(new i(n)), e.lock();
						} catch (e) {
							this._worker = new s("error"), this._worker.error(e);
						}
					}
					f.prototype = {
						accumulate: function(e) {
							return l(this, e);
						},
						on: function(e, t) {
							var r = this;
							return "data" === e ? this._worker.on(e, function(e) {
								t.call(r, e.data, e.meta);
							}) : this._worker.on(e, function() {
								h.delay(t, arguments, r);
							}), this;
						},
						resume: function() {
							return h.delay(this._worker.resume, [], this._worker), this;
						},
						pause: function() {
							return this._worker.pause(), this;
						},
						toNodejsStream: function(e) {
							if (h.checkSupport("nodestream"), "nodebuffer" !== this._outputType) throw new Error(this._outputType + " is not supported by this method");
							return new o(this, { objectMode: "nodebuffer" !== this._outputType }, e);
						}
					}, t.exports = f;
				}, {
					"../base64": 1,
					"../external": 6,
					"../nodejs/NodejsStreamOutputAdapter": 13,
					"../support": 30,
					"../utils": 32,
					"./ConvertWorker": 24,
					"./GenericWorker": 28
				}],
				30: [function(e, t, r) {
					"use strict";
					if (r.base64 = !0, r.array = !0, r.string = !0, r.arraybuffer = "undefined" != typeof ArrayBuffer && "undefined" != typeof Uint8Array, r.nodebuffer = "undefined" != typeof Buffer, r.uint8array = "undefined" != typeof Uint8Array, "undefined" == typeof ArrayBuffer) r.blob = !1;
					else {
						var n = /* @__PURE__ */ new ArrayBuffer(0);
						try {
							r.blob = 0 === new Blob([n], { type: "application/zip" }).size;
						} catch (e) {
							try {
								var i = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
								i.append(n), r.blob = 0 === i.getBlob("application/zip").size;
							} catch (e) {
								r.blob = !1;
							}
						}
					}
					try {
						r.nodestream = !!e("readable-stream").Readable;
					} catch (e) {
						r.nodestream = !1;
					}
				}, { "readable-stream": 16 }],
				31: [function(e, t, s) {
					"use strict";
					for (var o = e("./utils"), h = e("./support"), r = e("./nodejsUtils"), n = e("./stream/GenericWorker"), u = new Array(256), i = 0; i < 256; i++) u[i] = 252 <= i ? 6 : 248 <= i ? 5 : 240 <= i ? 4 : 224 <= i ? 3 : 192 <= i ? 2 : 1;
					u[254] = u[254] = 1;
					function a() {
						n.call(this, "utf-8 decode"), this.leftOver = null;
					}
					function l() {
						n.call(this, "utf-8 encode");
					}
					s.utf8encode = function(e) {
						return h.nodebuffer ? r.newBufferFrom(e, "utf-8") : function(e) {
							var t, r, n, i, s, a = e.length, o = 0;
							for (i = 0; i < a; i++) 55296 == (64512 & (r = e.charCodeAt(i))) && i + 1 < a && 56320 == (64512 & (n = e.charCodeAt(i + 1))) && (r = 65536 + (r - 55296 << 10) + (n - 56320), i++), o += r < 128 ? 1 : r < 2048 ? 2 : r < 65536 ? 3 : 4;
							for (t = h.uint8array ? new Uint8Array(o) : new Array(o), i = s = 0; s < o; i++) 55296 == (64512 & (r = e.charCodeAt(i))) && i + 1 < a && 56320 == (64512 & (n = e.charCodeAt(i + 1))) && (r = 65536 + (r - 55296 << 10) + (n - 56320), i++), r < 128 ? t[s++] = r : (r < 2048 ? t[s++] = 192 | r >>> 6 : (r < 65536 ? t[s++] = 224 | r >>> 12 : (t[s++] = 240 | r >>> 18, t[s++] = 128 | r >>> 12 & 63), t[s++] = 128 | r >>> 6 & 63), t[s++] = 128 | 63 & r);
							return t;
						}(e);
					}, s.utf8decode = function(e) {
						return h.nodebuffer ? o.transformTo("nodebuffer", e).toString("utf-8") : function(e) {
							var t, r, n, i, s = e.length, a = new Array(2 * s);
							for (t = r = 0; t < s;) if ((n = e[t++]) < 128) a[r++] = n;
							else if (4 < (i = u[n])) a[r++] = 65533, t += i - 1;
							else {
								for (n &= 2 === i ? 31 : 3 === i ? 15 : 7; 1 < i && t < s;) n = n << 6 | 63 & e[t++], i--;
								1 < i ? a[r++] = 65533 : n < 65536 ? a[r++] = n : (n -= 65536, a[r++] = 55296 | n >> 10 & 1023, a[r++] = 56320 | 1023 & n);
							}
							return a.length !== r && (a.subarray ? a = a.subarray(0, r) : a.length = r), o.applyFromCharCode(a);
						}(e = o.transformTo(h.uint8array ? "uint8array" : "array", e));
					}, o.inherits(a, n), a.prototype.processChunk = function(e) {
						var t = o.transformTo(h.uint8array ? "uint8array" : "array", e.data);
						if (this.leftOver && this.leftOver.length) {
							if (h.uint8array) {
								var r = t;
								(t = new Uint8Array(r.length + this.leftOver.length)).set(this.leftOver, 0), t.set(r, this.leftOver.length);
							} else t = this.leftOver.concat(t);
							this.leftOver = null;
						}
						var n = function(e, t) {
							var r;
							for ((t = t || e.length) > e.length && (t = e.length), r = t - 1; 0 <= r && 128 == (192 & e[r]);) r--;
							return r < 0 ? t : 0 === r ? t : r + u[e[r]] > t ? r : t;
						}(t), i = t;
						n !== t.length && (h.uint8array ? (i = t.subarray(0, n), this.leftOver = t.subarray(n, t.length)) : (i = t.slice(0, n), this.leftOver = t.slice(n, t.length))), this.push({
							data: s.utf8decode(i),
							meta: e.meta
						});
					}, a.prototype.flush = function() {
						this.leftOver && this.leftOver.length && (this.push({
							data: s.utf8decode(this.leftOver),
							meta: {}
						}), this.leftOver = null);
					}, s.Utf8DecodeWorker = a, o.inherits(l, n), l.prototype.processChunk = function(e) {
						this.push({
							data: s.utf8encode(e.data),
							meta: e.meta
						});
					}, s.Utf8EncodeWorker = l;
				}, {
					"./nodejsUtils": 14,
					"./stream/GenericWorker": 28,
					"./support": 30,
					"./utils": 32
				}],
				32: [function(e, t, a) {
					"use strict";
					var o = e("./support"), h = e("./base64"), r = e("./nodejsUtils"), u = e("./external");
					function n(e) {
						return e;
					}
					function l(e, t) {
						for (var r = 0; r < e.length; ++r) t[r] = 255 & e.charCodeAt(r);
						return t;
					}
					e("setimmediate"), a.newBlob = function(t, r) {
						a.checkSupport("blob");
						try {
							return new Blob([t], { type: r });
						} catch (e) {
							try {
								var n = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
								return n.append(t), n.getBlob(r);
							} catch (e) {
								throw new Error("Bug : can't construct the Blob.");
							}
						}
					};
					var i = {
						stringifyByChunk: function(e, t, r) {
							var n = [], i = 0, s = e.length;
							if (s <= r) return String.fromCharCode.apply(null, e);
							for (; i < s;) "array" === t || "nodebuffer" === t ? n.push(String.fromCharCode.apply(null, e.slice(i, Math.min(i + r, s)))) : n.push(String.fromCharCode.apply(null, e.subarray(i, Math.min(i + r, s)))), i += r;
							return n.join("");
						},
						stringifyByChar: function(e) {
							for (var t = "", r = 0; r < e.length; r++) t += String.fromCharCode(e[r]);
							return t;
						},
						applyCanBeUsed: {
							uint8array: function() {
								try {
									return o.uint8array && 1 === String.fromCharCode.apply(null, /* @__PURE__ */ new Uint8Array(1)).length;
								} catch (e) {
									return !1;
								}
							}(),
							nodebuffer: function() {
								try {
									return o.nodebuffer && 1 === String.fromCharCode.apply(null, r.allocBuffer(1)).length;
								} catch (e) {
									return !1;
								}
							}()
						}
					};
					function s(e) {
						var t = 65536, r = a.getTypeOf(e), n = !0;
						if ("uint8array" === r ? n = i.applyCanBeUsed.uint8array : "nodebuffer" === r && (n = i.applyCanBeUsed.nodebuffer), n) for (; 1 < t;) try {
							return i.stringifyByChunk(e, r, t);
						} catch (e) {
							t = Math.floor(t / 2);
						}
						return i.stringifyByChar(e);
					}
					function f(e, t) {
						for (var r = 0; r < e.length; r++) t[r] = e[r];
						return t;
					}
					a.applyFromCharCode = s;
					var c = {};
					c.string = {
						string: n,
						array: function(e) {
							return l(e, new Array(e.length));
						},
						arraybuffer: function(e) {
							return c.string.uint8array(e).buffer;
						},
						uint8array: function(e) {
							return l(e, new Uint8Array(e.length));
						},
						nodebuffer: function(e) {
							return l(e, r.allocBuffer(e.length));
						}
					}, c.array = {
						string: s,
						array: n,
						arraybuffer: function(e) {
							return new Uint8Array(e).buffer;
						},
						uint8array: function(e) {
							return new Uint8Array(e);
						},
						nodebuffer: function(e) {
							return r.newBufferFrom(e);
						}
					}, c.arraybuffer = {
						string: function(e) {
							return s(new Uint8Array(e));
						},
						array: function(e) {
							return f(new Uint8Array(e), new Array(e.byteLength));
						},
						arraybuffer: n,
						uint8array: function(e) {
							return new Uint8Array(e);
						},
						nodebuffer: function(e) {
							return r.newBufferFrom(new Uint8Array(e));
						}
					}, c.uint8array = {
						string: s,
						array: function(e) {
							return f(e, new Array(e.length));
						},
						arraybuffer: function(e) {
							return e.buffer;
						},
						uint8array: n,
						nodebuffer: function(e) {
							return r.newBufferFrom(e);
						}
					}, c.nodebuffer = {
						string: s,
						array: function(e) {
							return f(e, new Array(e.length));
						},
						arraybuffer: function(e) {
							return c.nodebuffer.uint8array(e).buffer;
						},
						uint8array: function(e) {
							return f(e, new Uint8Array(e.length));
						},
						nodebuffer: n
					}, a.transformTo = function(e, t) {
						if (t = t || "", !e) return t;
						a.checkSupport(e);
						return c[a.getTypeOf(t)][e](t);
					}, a.resolve = function(e) {
						for (var t = e.split("/"), r = [], n = 0; n < t.length; n++) {
							var i = t[n];
							"." === i || "" === i && 0 !== n && n !== t.length - 1 || (".." === i ? r.pop() : r.push(i));
						}
						return r.join("/");
					}, a.getTypeOf = function(e) {
						return "string" == typeof e ? "string" : "[object Array]" === Object.prototype.toString.call(e) ? "array" : o.nodebuffer && r.isBuffer(e) ? "nodebuffer" : o.uint8array && e instanceof Uint8Array ? "uint8array" : o.arraybuffer && e instanceof ArrayBuffer ? "arraybuffer" : void 0;
					}, a.checkSupport = function(e) {
						if (!o[e.toLowerCase()]) throw new Error(e + " is not supported by this platform");
					}, a.MAX_VALUE_16BITS = 65535, a.MAX_VALUE_32BITS = -1, a.pretty = function(e) {
						var t, r, n = "";
						for (r = 0; r < (e || "").length; r++) n += "\\x" + ((t = e.charCodeAt(r)) < 16 ? "0" : "") + t.toString(16).toUpperCase();
						return n;
					}, a.delay = function(e, t, r) {
						setImmediate(function() {
							e.apply(r || null, t || []);
						});
					}, a.inherits = function(e, t) {
						function r() {}
						r.prototype = t.prototype, e.prototype = new r();
					}, a.extend = function() {
						var e, t, r = {};
						for (e = 0; e < arguments.length; e++) for (t in arguments[e]) Object.prototype.hasOwnProperty.call(arguments[e], t) && void 0 === r[t] && (r[t] = arguments[e][t]);
						return r;
					}, a.prepareContent = function(r, e, n, i, s) {
						return u.Promise.resolve(e).then(function(n) {
							return o.blob && (n instanceof Blob || -1 !== ["[object File]", "[object Blob]"].indexOf(Object.prototype.toString.call(n))) && "undefined" != typeof FileReader ? new u.Promise(function(t, r) {
								var e = new FileReader();
								e.onload = function(e) {
									t(e.target.result);
								}, e.onerror = function(e) {
									r(e.target.error);
								}, e.readAsArrayBuffer(n);
							}) : n;
						}).then(function(e) {
							var t = a.getTypeOf(e);
							return t ? ("arraybuffer" === t ? e = a.transformTo("uint8array", e) : "string" === t && (s ? e = h.decode(e) : n && !0 !== i && (e = function(e) {
								return l(e, o.uint8array ? new Uint8Array(e.length) : new Array(e.length));
							}(e))), e) : u.Promise.reject(/* @__PURE__ */ new Error("Can't read the data of '" + r + "'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"));
						});
					};
				}, {
					"./base64": 1,
					"./external": 6,
					"./nodejsUtils": 14,
					"./support": 30,
					setimmediate: 54
				}],
				33: [function(e, t, r) {
					"use strict";
					var n = e("./reader/readerFor"), i = e("./utils"), s = e("./signature"), a = e("./zipEntry"), o = e("./support");
					function h(e) {
						this.files = [], this.loadOptions = e;
					}
					h.prototype = {
						checkSignature: function(e) {
							if (!this.reader.readAndCheckSignature(e)) {
								this.reader.index -= 4;
								var t = this.reader.readString(4);
								throw new Error("Corrupted zip or bug: unexpected signature (" + i.pretty(t) + ", expected " + i.pretty(e) + ")");
							}
						},
						isSignature: function(e, t) {
							var r = this.reader.index;
							this.reader.setIndex(e);
							var n = this.reader.readString(4) === t;
							return this.reader.setIndex(r), n;
						},
						readBlockEndOfCentral: function() {
							this.diskNumber = this.reader.readInt(2), this.diskWithCentralDirStart = this.reader.readInt(2), this.centralDirRecordsOnThisDisk = this.reader.readInt(2), this.centralDirRecords = this.reader.readInt(2), this.centralDirSize = this.reader.readInt(4), this.centralDirOffset = this.reader.readInt(4), this.zipCommentLength = this.reader.readInt(2);
							var e = this.reader.readData(this.zipCommentLength), t = o.uint8array ? "uint8array" : "array", r = i.transformTo(t, e);
							this.zipComment = this.loadOptions.decodeFileName(r);
						},
						readBlockZip64EndOfCentral: function() {
							this.zip64EndOfCentralSize = this.reader.readInt(8), this.reader.skip(4), this.diskNumber = this.reader.readInt(4), this.diskWithCentralDirStart = this.reader.readInt(4), this.centralDirRecordsOnThisDisk = this.reader.readInt(8), this.centralDirRecords = this.reader.readInt(8), this.centralDirSize = this.reader.readInt(8), this.centralDirOffset = this.reader.readInt(8), this.zip64ExtensibleData = {};
							for (var e, t, r, n = this.zip64EndOfCentralSize - 44; 0 < n;) e = this.reader.readInt(2), t = this.reader.readInt(4), r = this.reader.readData(t), this.zip64ExtensibleData[e] = {
								id: e,
								length: t,
								value: r
							};
						},
						readBlockZip64EndOfCentralLocator: function() {
							if (this.diskWithZip64CentralDirStart = this.reader.readInt(4), this.relativeOffsetEndOfZip64CentralDir = this.reader.readInt(8), this.disksCount = this.reader.readInt(4), 1 < this.disksCount) throw new Error("Multi-volumes zip are not supported");
						},
						readLocalFiles: function() {
							var e, t;
							for (e = 0; e < this.files.length; e++) t = this.files[e], this.reader.setIndex(t.localHeaderOffset), this.checkSignature(s.LOCAL_FILE_HEADER), t.readLocalPart(this.reader), t.handleUTF8(), t.processAttributes();
						},
						readCentralDir: function() {
							var e;
							for (this.reader.setIndex(this.centralDirOffset); this.reader.readAndCheckSignature(s.CENTRAL_FILE_HEADER);) (e = new a({ zip64: this.zip64 }, this.loadOptions)).readCentralPart(this.reader), this.files.push(e);
							if (this.centralDirRecords !== this.files.length && 0 !== this.centralDirRecords && 0 === this.files.length) throw new Error("Corrupted zip or bug: expected " + this.centralDirRecords + " records in central dir, got " + this.files.length);
						},
						readEndOfCentral: function() {
							var e = this.reader.lastIndexOfSignature(s.CENTRAL_DIRECTORY_END);
							if (e < 0) throw !this.isSignature(0, s.LOCAL_FILE_HEADER) ? /* @__PURE__ */ new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html") : /* @__PURE__ */ new Error("Corrupted zip: can't find end of central directory");
							this.reader.setIndex(e);
							var t = e;
							if (this.checkSignature(s.CENTRAL_DIRECTORY_END), this.readBlockEndOfCentral(), this.diskNumber === i.MAX_VALUE_16BITS || this.diskWithCentralDirStart === i.MAX_VALUE_16BITS || this.centralDirRecordsOnThisDisk === i.MAX_VALUE_16BITS || this.centralDirRecords === i.MAX_VALUE_16BITS || this.centralDirSize === i.MAX_VALUE_32BITS || this.centralDirOffset === i.MAX_VALUE_32BITS) {
								if (this.zip64 = !0, (e = this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR)) < 0) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");
								if (this.reader.setIndex(e), this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR), this.readBlockZip64EndOfCentralLocator(), !this.isSignature(this.relativeOffsetEndOfZip64CentralDir, s.ZIP64_CENTRAL_DIRECTORY_END) && (this.relativeOffsetEndOfZip64CentralDir = this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_END), this.relativeOffsetEndOfZip64CentralDir < 0)) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");
								this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir), this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_END), this.readBlockZip64EndOfCentral();
							}
							var r = this.centralDirOffset + this.centralDirSize;
							this.zip64 && (r += 20, r += 12 + this.zip64EndOfCentralSize);
							var n = t - r;
							if (0 < n) this.isSignature(t, s.CENTRAL_FILE_HEADER) || (this.reader.zero = n);
							else if (n < 0) throw new Error("Corrupted zip: missing " + Math.abs(n) + " bytes.");
						},
						prepareReader: function(e) {
							this.reader = n(e);
						},
						load: function(e) {
							this.prepareReader(e), this.readEndOfCentral(), this.readCentralDir(), this.readLocalFiles();
						}
					}, t.exports = h;
				}, {
					"./reader/readerFor": 22,
					"./signature": 23,
					"./support": 30,
					"./utils": 32,
					"./zipEntry": 34
				}],
				34: [function(e, t, r) {
					"use strict";
					var n = e("./reader/readerFor"), s = e("./utils"), i = e("./compressedObject"), a = e("./crc32"), o = e("./utf8"), h = e("./compressions"), u = e("./support");
					function l(e, t) {
						this.options = e, this.loadOptions = t;
					}
					l.prototype = {
						isEncrypted: function() {
							return 1 == (1 & this.bitFlag);
						},
						useUTF8: function() {
							return 2048 == (2048 & this.bitFlag);
						},
						readLocalPart: function(e) {
							var t, r;
							if (e.skip(22), this.fileNameLength = e.readInt(2), r = e.readInt(2), this.fileName = e.readData(this.fileNameLength), e.skip(r), -1 === this.compressedSize || -1 === this.uncompressedSize) throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");
							if (null === (t = function(e) {
								for (var t in h) if (Object.prototype.hasOwnProperty.call(h, t) && h[t].magic === e) return h[t];
								return null;
							}(this.compressionMethod))) throw new Error("Corrupted zip : compression " + s.pretty(this.compressionMethod) + " unknown (inner file : " + s.transformTo("string", this.fileName) + ")");
							this.decompressed = new i(this.compressedSize, this.uncompressedSize, this.crc32, t, e.readData(this.compressedSize));
						},
						readCentralPart: function(e) {
							this.versionMadeBy = e.readInt(2), e.skip(2), this.bitFlag = e.readInt(2), this.compressionMethod = e.readString(2), this.date = e.readDate(), this.crc32 = e.readInt(4), this.compressedSize = e.readInt(4), this.uncompressedSize = e.readInt(4);
							var t = e.readInt(2);
							if (this.extraFieldsLength = e.readInt(2), this.fileCommentLength = e.readInt(2), this.diskNumberStart = e.readInt(2), this.internalFileAttributes = e.readInt(2), this.externalFileAttributes = e.readInt(4), this.localHeaderOffset = e.readInt(4), this.isEncrypted()) throw new Error("Encrypted zip are not supported");
							e.skip(t), this.readExtraFields(e), this.parseZIP64ExtraField(e), this.fileComment = e.readData(this.fileCommentLength);
						},
						processAttributes: function() {
							this.unixPermissions = null, this.dosPermissions = null;
							var e = this.versionMadeBy >> 8;
							this.dir = !!(16 & this.externalFileAttributes), 0 == e && (this.dosPermissions = 63 & this.externalFileAttributes), 3 == e && (this.unixPermissions = this.externalFileAttributes >> 16 & 65535), this.dir || "/" !== this.fileNameStr.slice(-1) || (this.dir = !0);
						},
						parseZIP64ExtraField: function() {
							if (this.extraFields[1]) {
								var e = n(this.extraFields[1].value);
								this.uncompressedSize === s.MAX_VALUE_32BITS && (this.uncompressedSize = e.readInt(8)), this.compressedSize === s.MAX_VALUE_32BITS && (this.compressedSize = e.readInt(8)), this.localHeaderOffset === s.MAX_VALUE_32BITS && (this.localHeaderOffset = e.readInt(8)), this.diskNumberStart === s.MAX_VALUE_32BITS && (this.diskNumberStart = e.readInt(4));
							}
						},
						readExtraFields: function(e) {
							var t, r, n, i = e.index + this.extraFieldsLength;
							for (this.extraFields || (this.extraFields = {}); e.index + 4 < i;) t = e.readInt(2), r = e.readInt(2), n = e.readData(r), this.extraFields[t] = {
								id: t,
								length: r,
								value: n
							};
							e.setIndex(i);
						},
						handleUTF8: function() {
							var e = u.uint8array ? "uint8array" : "array";
							if (this.useUTF8()) this.fileNameStr = o.utf8decode(this.fileName), this.fileCommentStr = o.utf8decode(this.fileComment);
							else {
								var t = this.findExtraFieldUnicodePath();
								if (null !== t) this.fileNameStr = t;
								else {
									var r = s.transformTo(e, this.fileName);
									this.fileNameStr = this.loadOptions.decodeFileName(r);
								}
								var n = this.findExtraFieldUnicodeComment();
								if (null !== n) this.fileCommentStr = n;
								else {
									var i = s.transformTo(e, this.fileComment);
									this.fileCommentStr = this.loadOptions.decodeFileName(i);
								}
							}
						},
						findExtraFieldUnicodePath: function() {
							var e = this.extraFields[28789];
							if (e) {
								var t = n(e.value);
								return 1 !== t.readInt(1) ? null : a(this.fileName) !== t.readInt(4) ? null : o.utf8decode(t.readData(e.length - 5));
							}
							return null;
						},
						findExtraFieldUnicodeComment: function() {
							var e = this.extraFields[25461];
							if (e) {
								var t = n(e.value);
								return 1 !== t.readInt(1) ? null : a(this.fileComment) !== t.readInt(4) ? null : o.utf8decode(t.readData(e.length - 5));
							}
							return null;
						}
					}, t.exports = l;
				}, {
					"./compressedObject": 2,
					"./compressions": 3,
					"./crc32": 4,
					"./reader/readerFor": 22,
					"./support": 30,
					"./utf8": 31,
					"./utils": 32
				}],
				35: [function(e, t, r) {
					"use strict";
					function n(e, t, r) {
						this.name = e, this.dir = r.dir, this.date = r.date, this.comment = r.comment, this.unixPermissions = r.unixPermissions, this.dosPermissions = r.dosPermissions, this._data = t, this._dataBinary = r.binary, this.options = {
							compression: r.compression,
							compressionOptions: r.compressionOptions
						};
					}
					var s = e("./stream/StreamHelper"), i = e("./stream/DataWorker"), a = e("./utf8"), o = e("./compressedObject"), h = e("./stream/GenericWorker");
					n.prototype = {
						internalStream: function(e) {
							var t = null, r = "string";
							try {
								if (!e) throw new Error("No output type specified.");
								var n = "string" === (r = e.toLowerCase()) || "text" === r;
								"binarystring" !== r && "text" !== r || (r = "string"), t = this._decompressWorker();
								var i = !this._dataBinary;
								i && !n && (t = t.pipe(new a.Utf8EncodeWorker())), !i && n && (t = t.pipe(new a.Utf8DecodeWorker()));
							} catch (e) {
								(t = new h("error")).error(e);
							}
							return new s(t, r, "");
						},
						async: function(e, t) {
							return this.internalStream(e).accumulate(t);
						},
						nodeStream: function(e, t) {
							return this.internalStream(e || "nodebuffer").toNodejsStream(t);
						},
						_compressWorker: function(e, t) {
							if (this._data instanceof o && this._data.compression.magic === e.magic) return this._data.getCompressedWorker();
							var r = this._decompressWorker();
							return this._dataBinary || (r = r.pipe(new a.Utf8EncodeWorker())), o.createWorkerFrom(r, e, t);
						},
						_decompressWorker: function() {
							return this._data instanceof o ? this._data.getContentWorker() : this._data instanceof h ? this._data : new i(this._data);
						}
					};
					for (var u = [
						"asText",
						"asBinary",
						"asNodeBuffer",
						"asUint8Array",
						"asArrayBuffer"
					], l = function() {
						throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
					}, f = 0; f < u.length; f++) n.prototype[u[f]] = l;
					t.exports = n;
				}, {
					"./compressedObject": 2,
					"./stream/DataWorker": 27,
					"./stream/GenericWorker": 28,
					"./stream/StreamHelper": 29,
					"./utf8": 31
				}],
				36: [function(e, l, t) {
					(function(t) {
						"use strict";
						var r, n, e = t.MutationObserver || t.WebKitMutationObserver;
						if (e) {
							var i = 0, s = new e(u), a = t.document.createTextNode("");
							s.observe(a, { characterData: !0 }), r = function() {
								a.data = i = ++i % 2;
							};
						} else if (t.setImmediate || void 0 === t.MessageChannel) r = "document" in t && "onreadystatechange" in t.document.createElement("script") ? function() {
							var e = t.document.createElement("script");
							e.onreadystatechange = function() {
								u(), e.onreadystatechange = null, e.parentNode.removeChild(e), e = null;
							}, t.document.documentElement.appendChild(e);
						} : function() {
							setTimeout(u, 0);
						};
						else {
							var o = new t.MessageChannel();
							o.port1.onmessage = u, r = function() {
								o.port2.postMessage(0);
							};
						}
						var h = [];
						function u() {
							var e, t;
							n = !0;
							for (var r = h.length; r;) {
								for (t = h, h = [], e = -1; ++e < r;) t[e]();
								r = h.length;
							}
							n = !1;
						}
						l.exports = function(e) {
							1 !== h.push(e) || n || r();
						};
					}).call(this, "undefined" != typeof global ? global : "undefined" != typeof self ? self : "undefined" != typeof window ? window : {});
				}, {}],
				37: [function(e, t, r) {
					"use strict";
					var i = e("immediate");
					function u() {}
					var l = {}, s = ["REJECTED"], a = ["FULFILLED"], n = ["PENDING"];
					function o(e) {
						if ("function" != typeof e) throw new TypeError("resolver must be a function");
						this.state = n, this.queue = [], this.outcome = void 0, e !== u && d(this, e);
					}
					function h(e, t, r) {
						this.promise = e, "function" == typeof t && (this.onFulfilled = t, this.callFulfilled = this.otherCallFulfilled), "function" == typeof r && (this.onRejected = r, this.callRejected = this.otherCallRejected);
					}
					function f(t, r, n) {
						i(function() {
							var e;
							try {
								e = r(n);
							} catch (e) {
								return l.reject(t, e);
							}
							e === t ? l.reject(t, /* @__PURE__ */ new TypeError("Cannot resolve promise with itself")) : l.resolve(t, e);
						});
					}
					function c(e) {
						var t = e && e.then;
						if (e && ("object" == typeof e || "function" == typeof e) && "function" == typeof t) return function() {
							t.apply(e, arguments);
						};
					}
					function d(t, e) {
						var r = !1;
						function n(e) {
							r || (r = !0, l.reject(t, e));
						}
						function i(e) {
							r || (r = !0, l.resolve(t, e));
						}
						var s = p(function() {
							e(i, n);
						});
						"error" === s.status && n(s.value);
					}
					function p(e, t) {
						var r = {};
						try {
							r.value = e(t), r.status = "success";
						} catch (e) {
							r.status = "error", r.value = e;
						}
						return r;
					}
					(t.exports = o).prototype.finally = function(t) {
						if ("function" != typeof t) return this;
						var r = this.constructor;
						return this.then(function(e) {
							return r.resolve(t()).then(function() {
								return e;
							});
						}, function(e) {
							return r.resolve(t()).then(function() {
								throw e;
							});
						});
					}, o.prototype.catch = function(e) {
						return this.then(null, e);
					}, o.prototype.then = function(e, t) {
						if ("function" != typeof e && this.state === a || "function" != typeof t && this.state === s) return this;
						var r = new this.constructor(u);
						this.state !== n ? f(r, this.state === a ? e : t, this.outcome) : this.queue.push(new h(r, e, t));
						return r;
					}, h.prototype.callFulfilled = function(e) {
						l.resolve(this.promise, e);
					}, h.prototype.otherCallFulfilled = function(e) {
						f(this.promise, this.onFulfilled, e);
					}, h.prototype.callRejected = function(e) {
						l.reject(this.promise, e);
					}, h.prototype.otherCallRejected = function(e) {
						f(this.promise, this.onRejected, e);
					}, l.resolve = function(e, t) {
						var r = p(c, t);
						if ("error" === r.status) return l.reject(e, r.value);
						var n = r.value;
						if (n) d(e, n);
						else {
							e.state = a, e.outcome = t;
							for (var i = -1, s = e.queue.length; ++i < s;) e.queue[i].callFulfilled(t);
						}
						return e;
					}, l.reject = function(e, t) {
						e.state = s, e.outcome = t;
						for (var r = -1, n = e.queue.length; ++r < n;) e.queue[r].callRejected(t);
						return e;
					}, o.resolve = function(e) {
						if (e instanceof this) return e;
						return l.resolve(new this(u), e);
					}, o.reject = function(e) {
						var t = new this(u);
						return l.reject(t, e);
					}, o.all = function(e) {
						var r = this;
						if ("[object Array]" !== Object.prototype.toString.call(e)) return this.reject(/* @__PURE__ */ new TypeError("must be an array"));
						var n = e.length, i = !1;
						if (!n) return this.resolve([]);
						var s = new Array(n), a = 0, t = -1, o = new this(u);
						for (; ++t < n;) h(e[t], t);
						return o;
						function h(e, t) {
							r.resolve(e).then(function(e) {
								s[t] = e, ++a !== n || i || (i = !0, l.resolve(o, s));
							}, function(e) {
								i || (i = !0, l.reject(o, e));
							});
						}
					}, o.race = function(e) {
						var t = this;
						if ("[object Array]" !== Object.prototype.toString.call(e)) return this.reject(/* @__PURE__ */ new TypeError("must be an array"));
						var r = e.length, n = !1;
						if (!r) return this.resolve([]);
						var i = -1, s = new this(u);
						for (; ++i < r;) a = e[i], t.resolve(a).then(function(e) {
							n || (n = !0, l.resolve(s, e));
						}, function(e) {
							n || (n = !0, l.reject(s, e));
						});
						var a;
						return s;
					};
				}, { immediate: 36 }],
				38: [function(e, t, r) {
					"use strict";
					var n = {};
					(0, e("./lib/utils/common").assign)(n, e("./lib/deflate"), e("./lib/inflate"), e("./lib/zlib/constants")), t.exports = n;
				}, {
					"./lib/deflate": 39,
					"./lib/inflate": 40,
					"./lib/utils/common": 41,
					"./lib/zlib/constants": 44
				}],
				39: [function(e, t, r) {
					"use strict";
					var a = e("./zlib/deflate"), o = e("./utils/common"), h = e("./utils/strings"), i = e("./zlib/messages"), s = e("./zlib/zstream"), u = Object.prototype.toString, l = 0, f = -1, c = 0, d = 8;
					function p(e) {
						if (!(this instanceof p)) return new p(e);
						this.options = o.assign({
							level: f,
							method: d,
							chunkSize: 16384,
							windowBits: 15,
							memLevel: 8,
							strategy: c,
							to: ""
						}, e || {});
						var t = this.options;
						t.raw && 0 < t.windowBits ? t.windowBits = -t.windowBits : t.gzip && 0 < t.windowBits && t.windowBits < 16 && (t.windowBits += 16), this.err = 0, this.msg = "", this.ended = !1, this.chunks = [], this.strm = new s(), this.strm.avail_out = 0;
						var r = a.deflateInit2(this.strm, t.level, t.method, t.windowBits, t.memLevel, t.strategy);
						if (r !== l) throw new Error(i[r]);
						if (t.header && a.deflateSetHeader(this.strm, t.header), t.dictionary) {
							var n;
							if (n = "string" == typeof t.dictionary ? h.string2buf(t.dictionary) : "[object ArrayBuffer]" === u.call(t.dictionary) ? new Uint8Array(t.dictionary) : t.dictionary, (r = a.deflateSetDictionary(this.strm, n)) !== l) throw new Error(i[r]);
							this._dict_set = !0;
						}
					}
					function n(e, t) {
						var r = new p(t);
						if (r.push(e, !0), r.err) throw r.msg || i[r.err];
						return r.result;
					}
					p.prototype.push = function(e, t) {
						var r, n, i = this.strm, s = this.options.chunkSize;
						if (this.ended) return !1;
						n = t === ~~t ? t : !0 === t ? 4 : 0, "string" == typeof e ? i.input = h.string2buf(e) : "[object ArrayBuffer]" === u.call(e) ? i.input = new Uint8Array(e) : i.input = e, i.next_in = 0, i.avail_in = i.input.length;
						do {
							if (0 === i.avail_out && (i.output = new o.Buf8(s), i.next_out = 0, i.avail_out = s), 1 !== (r = a.deflate(i, n)) && r !== l) return this.onEnd(r), !(this.ended = !0);
							0 !== i.avail_out && (0 !== i.avail_in || 4 !== n && 2 !== n) || ("string" === this.options.to ? this.onData(h.buf2binstring(o.shrinkBuf(i.output, i.next_out))) : this.onData(o.shrinkBuf(i.output, i.next_out)));
						} while ((0 < i.avail_in || 0 === i.avail_out) && 1 !== r);
						return 4 === n ? (r = a.deflateEnd(this.strm), this.onEnd(r), this.ended = !0, r === l) : 2 !== n || (this.onEnd(l), !(i.avail_out = 0));
					}, p.prototype.onData = function(e) {
						this.chunks.push(e);
					}, p.prototype.onEnd = function(e) {
						e === l && ("string" === this.options.to ? this.result = this.chunks.join("") : this.result = o.flattenChunks(this.chunks)), this.chunks = [], this.err = e, this.msg = this.strm.msg;
					}, r.Deflate = p, r.deflate = n, r.deflateRaw = function(e, t) {
						return (t = t || {}).raw = !0, n(e, t);
					}, r.gzip = function(e, t) {
						return (t = t || {}).gzip = !0, n(e, t);
					};
				}, {
					"./utils/common": 41,
					"./utils/strings": 42,
					"./zlib/deflate": 46,
					"./zlib/messages": 51,
					"./zlib/zstream": 53
				}],
				40: [function(e, t, r) {
					"use strict";
					var c = e("./zlib/inflate"), d = e("./utils/common"), p = e("./utils/strings"), m = e("./zlib/constants"), n = e("./zlib/messages"), i = e("./zlib/zstream"), s = e("./zlib/gzheader"), _ = Object.prototype.toString;
					function a(e) {
						if (!(this instanceof a)) return new a(e);
						this.options = d.assign({
							chunkSize: 16384,
							windowBits: 0,
							to: ""
						}, e || {});
						var t = this.options;
						t.raw && 0 <= t.windowBits && t.windowBits < 16 && (t.windowBits = -t.windowBits, 0 === t.windowBits && (t.windowBits = -15)), !(0 <= t.windowBits && t.windowBits < 16) || e && e.windowBits || (t.windowBits += 32), 15 < t.windowBits && t.windowBits < 48 && 0 == (15 & t.windowBits) && (t.windowBits |= 15), this.err = 0, this.msg = "", this.ended = !1, this.chunks = [], this.strm = new i(), this.strm.avail_out = 0;
						var r = c.inflateInit2(this.strm, t.windowBits);
						if (r !== m.Z_OK) throw new Error(n[r]);
						this.header = new s(), c.inflateGetHeader(this.strm, this.header);
					}
					function o(e, t) {
						var r = new a(t);
						if (r.push(e, !0), r.err) throw r.msg || n[r.err];
						return r.result;
					}
					a.prototype.push = function(e, t) {
						var r, n, i, s, a, o, h = this.strm, u = this.options.chunkSize, l = this.options.dictionary, f = !1;
						if (this.ended) return !1;
						n = t === ~~t ? t : !0 === t ? m.Z_FINISH : m.Z_NO_FLUSH, "string" == typeof e ? h.input = p.binstring2buf(e) : "[object ArrayBuffer]" === _.call(e) ? h.input = new Uint8Array(e) : h.input = e, h.next_in = 0, h.avail_in = h.input.length;
						do {
							if (0 === h.avail_out && (h.output = new d.Buf8(u), h.next_out = 0, h.avail_out = u), (r = c.inflate(h, m.Z_NO_FLUSH)) === m.Z_NEED_DICT && l && (o = "string" == typeof l ? p.string2buf(l) : "[object ArrayBuffer]" === _.call(l) ? new Uint8Array(l) : l, r = c.inflateSetDictionary(this.strm, o)), r === m.Z_BUF_ERROR && !0 === f && (r = m.Z_OK, f = !1), r !== m.Z_STREAM_END && r !== m.Z_OK) return this.onEnd(r), !(this.ended = !0);
							h.next_out && (0 !== h.avail_out && r !== m.Z_STREAM_END && (0 !== h.avail_in || n !== m.Z_FINISH && n !== m.Z_SYNC_FLUSH) || ("string" === this.options.to ? (i = p.utf8border(h.output, h.next_out), s = h.next_out - i, a = p.buf2string(h.output, i), h.next_out = s, h.avail_out = u - s, s && d.arraySet(h.output, h.output, i, s, 0), this.onData(a)) : this.onData(d.shrinkBuf(h.output, h.next_out)))), 0 === h.avail_in && 0 === h.avail_out && (f = !0);
						} while ((0 < h.avail_in || 0 === h.avail_out) && r !== m.Z_STREAM_END);
						return r === m.Z_STREAM_END && (n = m.Z_FINISH), n === m.Z_FINISH ? (r = c.inflateEnd(this.strm), this.onEnd(r), this.ended = !0, r === m.Z_OK) : n !== m.Z_SYNC_FLUSH || (this.onEnd(m.Z_OK), !(h.avail_out = 0));
					}, a.prototype.onData = function(e) {
						this.chunks.push(e);
					}, a.prototype.onEnd = function(e) {
						e === m.Z_OK && ("string" === this.options.to ? this.result = this.chunks.join("") : this.result = d.flattenChunks(this.chunks)), this.chunks = [], this.err = e, this.msg = this.strm.msg;
					}, r.Inflate = a, r.inflate = o, r.inflateRaw = function(e, t) {
						return (t = t || {}).raw = !0, o(e, t);
					}, r.ungzip = o;
				}, {
					"./utils/common": 41,
					"./utils/strings": 42,
					"./zlib/constants": 44,
					"./zlib/gzheader": 47,
					"./zlib/inflate": 49,
					"./zlib/messages": 51,
					"./zlib/zstream": 53
				}],
				41: [function(e, t, r) {
					"use strict";
					var n = "undefined" != typeof Uint8Array && "undefined" != typeof Uint16Array && "undefined" != typeof Int32Array;
					r.assign = function(e) {
						for (var t = Array.prototype.slice.call(arguments, 1); t.length;) {
							var r = t.shift();
							if (r) {
								if ("object" != typeof r) throw new TypeError(r + "must be non-object");
								for (var n in r) r.hasOwnProperty(n) && (e[n] = r[n]);
							}
						}
						return e;
					}, r.shrinkBuf = function(e, t) {
						return e.length === t ? e : e.subarray ? e.subarray(0, t) : (e.length = t, e);
					};
					var i = {
						arraySet: function(e, t, r, n, i) {
							if (t.subarray && e.subarray) e.set(t.subarray(r, r + n), i);
							else for (var s = 0; s < n; s++) e[i + s] = t[r + s];
						},
						flattenChunks: function(e) {
							var t, r, n, i, s, a;
							for (t = n = 0, r = e.length; t < r; t++) n += e[t].length;
							for (a = new Uint8Array(n), t = i = 0, r = e.length; t < r; t++) s = e[t], a.set(s, i), i += s.length;
							return a;
						}
					}, s = {
						arraySet: function(e, t, r, n, i) {
							for (var s = 0; s < n; s++) e[i + s] = t[r + s];
						},
						flattenChunks: function(e) {
							return [].concat.apply([], e);
						}
					};
					r.setTyped = function(e) {
						e ? (r.Buf8 = Uint8Array, r.Buf16 = Uint16Array, r.Buf32 = Int32Array, r.assign(r, i)) : (r.Buf8 = Array, r.Buf16 = Array, r.Buf32 = Array, r.assign(r, s));
					}, r.setTyped(n);
				}, {}],
				42: [function(e, t, r) {
					"use strict";
					var h = e("./common"), i = !0, s = !0;
					try {
						String.fromCharCode.apply(null, [0]);
					} catch (e) {
						i = !1;
					}
					try {
						String.fromCharCode.apply(null, /* @__PURE__ */ new Uint8Array(1));
					} catch (e) {
						s = !1;
					}
					for (var u = new h.Buf8(256), n = 0; n < 256; n++) u[n] = 252 <= n ? 6 : 248 <= n ? 5 : 240 <= n ? 4 : 224 <= n ? 3 : 192 <= n ? 2 : 1;
					function l(e, t) {
						if (t < 65537 && (e.subarray && s || !e.subarray && i)) return String.fromCharCode.apply(null, h.shrinkBuf(e, t));
						for (var r = "", n = 0; n < t; n++) r += String.fromCharCode(e[n]);
						return r;
					}
					u[254] = u[254] = 1, r.string2buf = function(e) {
						var t, r, n, i, s, a = e.length, o = 0;
						for (i = 0; i < a; i++) 55296 == (64512 & (r = e.charCodeAt(i))) && i + 1 < a && 56320 == (64512 & (n = e.charCodeAt(i + 1))) && (r = 65536 + (r - 55296 << 10) + (n - 56320), i++), o += r < 128 ? 1 : r < 2048 ? 2 : r < 65536 ? 3 : 4;
						for (t = new h.Buf8(o), i = s = 0; s < o; i++) 55296 == (64512 & (r = e.charCodeAt(i))) && i + 1 < a && 56320 == (64512 & (n = e.charCodeAt(i + 1))) && (r = 65536 + (r - 55296 << 10) + (n - 56320), i++), r < 128 ? t[s++] = r : (r < 2048 ? t[s++] = 192 | r >>> 6 : (r < 65536 ? t[s++] = 224 | r >>> 12 : (t[s++] = 240 | r >>> 18, t[s++] = 128 | r >>> 12 & 63), t[s++] = 128 | r >>> 6 & 63), t[s++] = 128 | 63 & r);
						return t;
					}, r.buf2binstring = function(e) {
						return l(e, e.length);
					}, r.binstring2buf = function(e) {
						for (var t = new h.Buf8(e.length), r = 0, n = t.length; r < n; r++) t[r] = e.charCodeAt(r);
						return t;
					}, r.buf2string = function(e, t) {
						var r, n, i, s, a = t || e.length, o = new Array(2 * a);
						for (r = n = 0; r < a;) if ((i = e[r++]) < 128) o[n++] = i;
						else if (4 < (s = u[i])) o[n++] = 65533, r += s - 1;
						else {
							for (i &= 2 === s ? 31 : 3 === s ? 15 : 7; 1 < s && r < a;) i = i << 6 | 63 & e[r++], s--;
							1 < s ? o[n++] = 65533 : i < 65536 ? o[n++] = i : (i -= 65536, o[n++] = 55296 | i >> 10 & 1023, o[n++] = 56320 | 1023 & i);
						}
						return l(o, n);
					}, r.utf8border = function(e, t) {
						var r;
						for ((t = t || e.length) > e.length && (t = e.length), r = t - 1; 0 <= r && 128 == (192 & e[r]);) r--;
						return r < 0 ? t : 0 === r ? t : r + u[e[r]] > t ? r : t;
					};
				}, { "./common": 41 }],
				43: [function(e, t, r) {
					"use strict";
					t.exports = function(e, t, r, n) {
						for (var i = 65535 & e | 0, s = e >>> 16 & 65535 | 0, a = 0; 0 !== r;) {
							for (r -= a = 2e3 < r ? 2e3 : r; s = s + (i = i + t[n++] | 0) | 0, --a;);
							i %= 65521, s %= 65521;
						}
						return i | s << 16 | 0;
					};
				}, {}],
				44: [function(e, t, r) {
					"use strict";
					t.exports = {
						Z_NO_FLUSH: 0,
						Z_PARTIAL_FLUSH: 1,
						Z_SYNC_FLUSH: 2,
						Z_FULL_FLUSH: 3,
						Z_FINISH: 4,
						Z_BLOCK: 5,
						Z_TREES: 6,
						Z_OK: 0,
						Z_STREAM_END: 1,
						Z_NEED_DICT: 2,
						Z_ERRNO: -1,
						Z_STREAM_ERROR: -2,
						Z_DATA_ERROR: -3,
						Z_BUF_ERROR: -5,
						Z_NO_COMPRESSION: 0,
						Z_BEST_SPEED: 1,
						Z_BEST_COMPRESSION: 9,
						Z_DEFAULT_COMPRESSION: -1,
						Z_FILTERED: 1,
						Z_HUFFMAN_ONLY: 2,
						Z_RLE: 3,
						Z_FIXED: 4,
						Z_DEFAULT_STRATEGY: 0,
						Z_BINARY: 0,
						Z_TEXT: 1,
						Z_UNKNOWN: 2,
						Z_DEFLATED: 8
					};
				}, {}],
				45: [function(e, t, r) {
					"use strict";
					var o = function() {
						for (var e, t = [], r = 0; r < 256; r++) {
							e = r;
							for (var n = 0; n < 8; n++) e = 1 & e ? 3988292384 ^ e >>> 1 : e >>> 1;
							t[r] = e;
						}
						return t;
					}();
					t.exports = function(e, t, r, n) {
						var i = o, s = n + r;
						e ^= -1;
						for (var a = n; a < s; a++) e = e >>> 8 ^ i[255 & (e ^ t[a])];
						return -1 ^ e;
					};
				}, {}],
				46: [function(e, t, r) {
					"use strict";
					var h, c = e("../utils/common"), u = e("./trees"), d = e("./adler32"), p = e("./crc32"), n = e("./messages"), l = 0, f = 4, m = 0, _ = -2, g = -1, b = 4, i = 2, v = 8, y = 9, s = 286, a = 30, o = 19, w = 2 * s + 1, k = 15, x = 3, S = 258, z = S + x + 1, C = 42, E = 113, A = 1, I = 2, O = 3, B = 4;
					function R(e, t) {
						return e.msg = n[t], t;
					}
					function T(e) {
						return (e << 1) - (4 < e ? 9 : 0);
					}
					function D(e) {
						for (var t = e.length; 0 <= --t;) e[t] = 0;
					}
					function F(e) {
						var t = e.state, r = t.pending;
						r > e.avail_out && (r = e.avail_out), 0 !== r && (c.arraySet(e.output, t.pending_buf, t.pending_out, r, e.next_out), e.next_out += r, t.pending_out += r, e.total_out += r, e.avail_out -= r, t.pending -= r, 0 === t.pending && (t.pending_out = 0));
					}
					function N(e, t) {
						u._tr_flush_block(e, 0 <= e.block_start ? e.block_start : -1, e.strstart - e.block_start, t), e.block_start = e.strstart, F(e.strm);
					}
					function U(e, t) {
						e.pending_buf[e.pending++] = t;
					}
					function P(e, t) {
						e.pending_buf[e.pending++] = t >>> 8 & 255, e.pending_buf[e.pending++] = 255 & t;
					}
					function L(e, t) {
						var r, n, i = e.max_chain_length, s = e.strstart, a = e.prev_length, o = e.nice_match, h = e.strstart > e.w_size - z ? e.strstart - (e.w_size - z) : 0, u = e.window, l = e.w_mask, f = e.prev, c = e.strstart + S, d = u[s + a - 1], p = u[s + a];
						e.prev_length >= e.good_match && (i >>= 2), o > e.lookahead && (o = e.lookahead);
						do
							if (u[(r = t) + a] === p && u[r + a - 1] === d && u[r] === u[s] && u[++r] === u[s + 1]) {
								s += 2, r++;
								do								;
while (u[++s] === u[++r] && u[++s] === u[++r] && u[++s] === u[++r] && u[++s] === u[++r] && u[++s] === u[++r] && u[++s] === u[++r] && u[++s] === u[++r] && u[++s] === u[++r] && s < c);
								if (n = S - (c - s), s = c - S, a < n) {
									if (e.match_start = t, o <= (a = n)) break;
									d = u[s + a - 1], p = u[s + a];
								}
							}
						while ((t = f[t & l]) > h && 0 != --i);
						return a <= e.lookahead ? a : e.lookahead;
					}
					function j(e) {
						var t, r, n, i, s, a, o, h, u, l, f = e.w_size;
						do {
							if (i = e.window_size - e.lookahead - e.strstart, e.strstart >= f + (f - z)) {
								for (c.arraySet(e.window, e.window, f, f, 0), e.match_start -= f, e.strstart -= f, e.block_start -= f, t = r = e.hash_size; n = e.head[--t], e.head[t] = f <= n ? n - f : 0, --r;);
								for (t = r = f; n = e.prev[--t], e.prev[t] = f <= n ? n - f : 0, --r;);
								i += f;
							}
							if (0 === e.strm.avail_in) break;
							if (a = e.strm, o = e.window, h = e.strstart + e.lookahead, u = i, l = void 0, l = a.avail_in, u < l && (l = u), r = 0 === l ? 0 : (a.avail_in -= l, c.arraySet(o, a.input, a.next_in, l, h), 1 === a.state.wrap ? a.adler = d(a.adler, o, l, h) : 2 === a.state.wrap && (a.adler = p(a.adler, o, l, h)), a.next_in += l, a.total_in += l, l), e.lookahead += r, e.lookahead + e.insert >= x) for (s = e.strstart - e.insert, e.ins_h = e.window[s], e.ins_h = (e.ins_h << e.hash_shift ^ e.window[s + 1]) & e.hash_mask; e.insert && (e.ins_h = (e.ins_h << e.hash_shift ^ e.window[s + x - 1]) & e.hash_mask, e.prev[s & e.w_mask] = e.head[e.ins_h], e.head[e.ins_h] = s, s++, e.insert--, !(e.lookahead + e.insert < x)););
						} while (e.lookahead < z && 0 !== e.strm.avail_in);
					}
					function Z(e, t) {
						for (var r, n;;) {
							if (e.lookahead < z) {
								if (j(e), e.lookahead < z && t === l) return A;
								if (0 === e.lookahead) break;
							}
							if (r = 0, e.lookahead >= x && (e.ins_h = (e.ins_h << e.hash_shift ^ e.window[e.strstart + x - 1]) & e.hash_mask, r = e.prev[e.strstart & e.w_mask] = e.head[e.ins_h], e.head[e.ins_h] = e.strstart), 0 !== r && e.strstart - r <= e.w_size - z && (e.match_length = L(e, r)), e.match_length >= x) if (n = u._tr_tally(e, e.strstart - e.match_start, e.match_length - x), e.lookahead -= e.match_length, e.match_length <= e.max_lazy_match && e.lookahead >= x) {
								for (e.match_length--; e.strstart++, e.ins_h = (e.ins_h << e.hash_shift ^ e.window[e.strstart + x - 1]) & e.hash_mask, r = e.prev[e.strstart & e.w_mask] = e.head[e.ins_h], e.head[e.ins_h] = e.strstart, 0 != --e.match_length;);
								e.strstart++;
							} else e.strstart += e.match_length, e.match_length = 0, e.ins_h = e.window[e.strstart], e.ins_h = (e.ins_h << e.hash_shift ^ e.window[e.strstart + 1]) & e.hash_mask;
							else n = u._tr_tally(e, 0, e.window[e.strstart]), e.lookahead--, e.strstart++;
							if (n && (N(e, !1), 0 === e.strm.avail_out)) return A;
						}
						return e.insert = e.strstart < x - 1 ? e.strstart : x - 1, t === f ? (N(e, !0), 0 === e.strm.avail_out ? O : B) : e.last_lit && (N(e, !1), 0 === e.strm.avail_out) ? A : I;
					}
					function W(e, t) {
						for (var r, n, i;;) {
							if (e.lookahead < z) {
								if (j(e), e.lookahead < z && t === l) return A;
								if (0 === e.lookahead) break;
							}
							if (r = 0, e.lookahead >= x && (e.ins_h = (e.ins_h << e.hash_shift ^ e.window[e.strstart + x - 1]) & e.hash_mask, r = e.prev[e.strstart & e.w_mask] = e.head[e.ins_h], e.head[e.ins_h] = e.strstart), e.prev_length = e.match_length, e.prev_match = e.match_start, e.match_length = x - 1, 0 !== r && e.prev_length < e.max_lazy_match && e.strstart - r <= e.w_size - z && (e.match_length = L(e, r), e.match_length <= 5 && (1 === e.strategy || e.match_length === x && 4096 < e.strstart - e.match_start) && (e.match_length = x - 1)), e.prev_length >= x && e.match_length <= e.prev_length) {
								for (i = e.strstart + e.lookahead - x, n = u._tr_tally(e, e.strstart - 1 - e.prev_match, e.prev_length - x), e.lookahead -= e.prev_length - 1, e.prev_length -= 2; ++e.strstart <= i && (e.ins_h = (e.ins_h << e.hash_shift ^ e.window[e.strstart + x - 1]) & e.hash_mask, r = e.prev[e.strstart & e.w_mask] = e.head[e.ins_h], e.head[e.ins_h] = e.strstart), 0 != --e.prev_length;);
								if (e.match_available = 0, e.match_length = x - 1, e.strstart++, n && (N(e, !1), 0 === e.strm.avail_out)) return A;
							} else if (e.match_available) {
								if ((n = u._tr_tally(e, 0, e.window[e.strstart - 1])) && N(e, !1), e.strstart++, e.lookahead--, 0 === e.strm.avail_out) return A;
							} else e.match_available = 1, e.strstart++, e.lookahead--;
						}
						return e.match_available && (n = u._tr_tally(e, 0, e.window[e.strstart - 1]), e.match_available = 0), e.insert = e.strstart < x - 1 ? e.strstart : x - 1, t === f ? (N(e, !0), 0 === e.strm.avail_out ? O : B) : e.last_lit && (N(e, !1), 0 === e.strm.avail_out) ? A : I;
					}
					function M(e, t, r, n, i) {
						this.good_length = e, this.max_lazy = t, this.nice_length = r, this.max_chain = n, this.func = i;
					}
					function H() {
						this.strm = null, this.status = 0, this.pending_buf = null, this.pending_buf_size = 0, this.pending_out = 0, this.pending = 0, this.wrap = 0, this.gzhead = null, this.gzindex = 0, this.method = v, this.last_flush = -1, this.w_size = 0, this.w_bits = 0, this.w_mask = 0, this.window = null, this.window_size = 0, this.prev = null, this.head = null, this.ins_h = 0, this.hash_size = 0, this.hash_bits = 0, this.hash_mask = 0, this.hash_shift = 0, this.block_start = 0, this.match_length = 0, this.prev_match = 0, this.match_available = 0, this.strstart = 0, this.match_start = 0, this.lookahead = 0, this.prev_length = 0, this.max_chain_length = 0, this.max_lazy_match = 0, this.level = 0, this.strategy = 0, this.good_match = 0, this.nice_match = 0, this.dyn_ltree = new c.Buf16(2 * w), this.dyn_dtree = new c.Buf16(2 * (2 * a + 1)), this.bl_tree = new c.Buf16(2 * (2 * o + 1)), D(this.dyn_ltree), D(this.dyn_dtree), D(this.bl_tree), this.l_desc = null, this.d_desc = null, this.bl_desc = null, this.bl_count = new c.Buf16(k + 1), this.heap = new c.Buf16(2 * s + 1), D(this.heap), this.heap_len = 0, this.heap_max = 0, this.depth = new c.Buf16(2 * s + 1), D(this.depth), this.l_buf = 0, this.lit_bufsize = 0, this.last_lit = 0, this.d_buf = 0, this.opt_len = 0, this.static_len = 0, this.matches = 0, this.insert = 0, this.bi_buf = 0, this.bi_valid = 0;
					}
					function G(e) {
						var t;
						return e && e.state ? (e.total_in = e.total_out = 0, e.data_type = i, (t = e.state).pending = 0, t.pending_out = 0, t.wrap < 0 && (t.wrap = -t.wrap), t.status = t.wrap ? C : E, e.adler = 2 === t.wrap ? 0 : 1, t.last_flush = l, u._tr_init(t), m) : R(e, _);
					}
					function K(e) {
						var t = G(e);
						return t === m && function(e) {
							e.window_size = 2 * e.w_size, D(e.head), e.max_lazy_match = h[e.level].max_lazy, e.good_match = h[e.level].good_length, e.nice_match = h[e.level].nice_length, e.max_chain_length = h[e.level].max_chain, e.strstart = 0, e.block_start = 0, e.lookahead = 0, e.insert = 0, e.match_length = e.prev_length = x - 1, e.match_available = 0, e.ins_h = 0;
						}(e.state), t;
					}
					function Y(e, t, r, n, i, s) {
						if (!e) return _;
						var a = 1;
						if (t === g && (t = 6), n < 0 ? (a = 0, n = -n) : 15 < n && (a = 2, n -= 16), i < 1 || y < i || r !== v || n < 8 || 15 < n || t < 0 || 9 < t || s < 0 || b < s) return R(e, _);
						8 === n && (n = 9);
						var o = new H();
						return (e.state = o).strm = e, o.wrap = a, o.gzhead = null, o.w_bits = n, o.w_size = 1 << o.w_bits, o.w_mask = o.w_size - 1, o.hash_bits = i + 7, o.hash_size = 1 << o.hash_bits, o.hash_mask = o.hash_size - 1, o.hash_shift = ~~((o.hash_bits + x - 1) / x), o.window = new c.Buf8(2 * o.w_size), o.head = new c.Buf16(o.hash_size), o.prev = new c.Buf16(o.w_size), o.lit_bufsize = 1 << i + 6, o.pending_buf_size = 4 * o.lit_bufsize, o.pending_buf = new c.Buf8(o.pending_buf_size), o.d_buf = 1 * o.lit_bufsize, o.l_buf = 3 * o.lit_bufsize, o.level = t, o.strategy = s, o.method = r, K(e);
					}
					h = [
						new M(0, 0, 0, 0, function(e, t) {
							var r = 65535;
							for (r > e.pending_buf_size - 5 && (r = e.pending_buf_size - 5);;) {
								if (e.lookahead <= 1) {
									if (j(e), 0 === e.lookahead && t === l) return A;
									if (0 === e.lookahead) break;
								}
								e.strstart += e.lookahead, e.lookahead = 0;
								var n = e.block_start + r;
								if ((0 === e.strstart || e.strstart >= n) && (e.lookahead = e.strstart - n, e.strstart = n, N(e, !1), 0 === e.strm.avail_out)) return A;
								if (e.strstart - e.block_start >= e.w_size - z && (N(e, !1), 0 === e.strm.avail_out)) return A;
							}
							return e.insert = 0, t === f ? (N(e, !0), 0 === e.strm.avail_out ? O : B) : (e.strstart > e.block_start && (N(e, !1), e.strm.avail_out), A);
						}),
						new M(4, 4, 8, 4, Z),
						new M(4, 5, 16, 8, Z),
						new M(4, 6, 32, 32, Z),
						new M(4, 4, 16, 16, W),
						new M(8, 16, 32, 32, W),
						new M(8, 16, 128, 128, W),
						new M(8, 32, 128, 256, W),
						new M(32, 128, 258, 1024, W),
						new M(32, 258, 258, 4096, W)
					], r.deflateInit = function(e, t) {
						return Y(e, t, v, 15, 8, 0);
					}, r.deflateInit2 = Y, r.deflateReset = K, r.deflateResetKeep = G, r.deflateSetHeader = function(e, t) {
						return e && e.state ? 2 !== e.state.wrap ? _ : (e.state.gzhead = t, m) : _;
					}, r.deflate = function(e, t) {
						var r, n, i, s;
						if (!e || !e.state || 5 < t || t < 0) return e ? R(e, _) : _;
						if (n = e.state, !e.output || !e.input && 0 !== e.avail_in || 666 === n.status && t !== f) return R(e, 0 === e.avail_out ? -5 : _);
						if (n.strm = e, r = n.last_flush, n.last_flush = t, n.status === C) if (2 === n.wrap) e.adler = 0, U(n, 31), U(n, 139), U(n, 8), n.gzhead ? (U(n, (n.gzhead.text ? 1 : 0) + (n.gzhead.hcrc ? 2 : 0) + (n.gzhead.extra ? 4 : 0) + (n.gzhead.name ? 8 : 0) + (n.gzhead.comment ? 16 : 0)), U(n, 255 & n.gzhead.time), U(n, n.gzhead.time >> 8 & 255), U(n, n.gzhead.time >> 16 & 255), U(n, n.gzhead.time >> 24 & 255), U(n, 9 === n.level ? 2 : 2 <= n.strategy || n.level < 2 ? 4 : 0), U(n, 255 & n.gzhead.os), n.gzhead.extra && n.gzhead.extra.length && (U(n, 255 & n.gzhead.extra.length), U(n, n.gzhead.extra.length >> 8 & 255)), n.gzhead.hcrc && (e.adler = p(e.adler, n.pending_buf, n.pending, 0)), n.gzindex = 0, n.status = 69) : (U(n, 0), U(n, 0), U(n, 0), U(n, 0), U(n, 0), U(n, 9 === n.level ? 2 : 2 <= n.strategy || n.level < 2 ? 4 : 0), U(n, 3), n.status = E);
						else {
							var a = v + (n.w_bits - 8 << 4) << 8;
							a |= (2 <= n.strategy || n.level < 2 ? 0 : n.level < 6 ? 1 : 6 === n.level ? 2 : 3) << 6, 0 !== n.strstart && (a |= 32), a += 31 - a % 31, n.status = E, P(n, a), 0 !== n.strstart && (P(n, e.adler >>> 16), P(n, 65535 & e.adler)), e.adler = 1;
						}
						if (69 === n.status) if (n.gzhead.extra) {
							for (i = n.pending; n.gzindex < (65535 & n.gzhead.extra.length) && (n.pending !== n.pending_buf_size || (n.gzhead.hcrc && n.pending > i && (e.adler = p(e.adler, n.pending_buf, n.pending - i, i)), F(e), i = n.pending, n.pending !== n.pending_buf_size));) U(n, 255 & n.gzhead.extra[n.gzindex]), n.gzindex++;
							n.gzhead.hcrc && n.pending > i && (e.adler = p(e.adler, n.pending_buf, n.pending - i, i)), n.gzindex === n.gzhead.extra.length && (n.gzindex = 0, n.status = 73);
						} else n.status = 73;
						if (73 === n.status) if (n.gzhead.name) {
							i = n.pending;
							do {
								if (n.pending === n.pending_buf_size && (n.gzhead.hcrc && n.pending > i && (e.adler = p(e.adler, n.pending_buf, n.pending - i, i)), F(e), i = n.pending, n.pending === n.pending_buf_size)) {
									s = 1;
									break;
								}
								s = n.gzindex < n.gzhead.name.length ? 255 & n.gzhead.name.charCodeAt(n.gzindex++) : 0, U(n, s);
							} while (0 !== s);
							n.gzhead.hcrc && n.pending > i && (e.adler = p(e.adler, n.pending_buf, n.pending - i, i)), 0 === s && (n.gzindex = 0, n.status = 91);
						} else n.status = 91;
						if (91 === n.status) if (n.gzhead.comment) {
							i = n.pending;
							do {
								if (n.pending === n.pending_buf_size && (n.gzhead.hcrc && n.pending > i && (e.adler = p(e.adler, n.pending_buf, n.pending - i, i)), F(e), i = n.pending, n.pending === n.pending_buf_size)) {
									s = 1;
									break;
								}
								s = n.gzindex < n.gzhead.comment.length ? 255 & n.gzhead.comment.charCodeAt(n.gzindex++) : 0, U(n, s);
							} while (0 !== s);
							n.gzhead.hcrc && n.pending > i && (e.adler = p(e.adler, n.pending_buf, n.pending - i, i)), 0 === s && (n.status = 103);
						} else n.status = 103;
						if (103 === n.status && (n.gzhead.hcrc ? (n.pending + 2 > n.pending_buf_size && F(e), n.pending + 2 <= n.pending_buf_size && (U(n, 255 & e.adler), U(n, e.adler >> 8 & 255), e.adler = 0, n.status = E)) : n.status = E), 0 !== n.pending) {
							if (F(e), 0 === e.avail_out) return n.last_flush = -1, m;
						} else if (0 === e.avail_in && T(t) <= T(r) && t !== f) return R(e, -5);
						if (666 === n.status && 0 !== e.avail_in) return R(e, -5);
						if (0 !== e.avail_in || 0 !== n.lookahead || t !== l && 666 !== n.status) {
							var o = 2 === n.strategy ? function(e, t) {
								for (var r;;) {
									if (0 === e.lookahead && (j(e), 0 === e.lookahead)) {
										if (t === l) return A;
										break;
									}
									if (e.match_length = 0, r = u._tr_tally(e, 0, e.window[e.strstart]), e.lookahead--, e.strstart++, r && (N(e, !1), 0 === e.strm.avail_out)) return A;
								}
								return e.insert = 0, t === f ? (N(e, !0), 0 === e.strm.avail_out ? O : B) : e.last_lit && (N(e, !1), 0 === e.strm.avail_out) ? A : I;
							}(n, t) : 3 === n.strategy ? function(e, t) {
								for (var r, n, i, s, a = e.window;;) {
									if (e.lookahead <= S) {
										if (j(e), e.lookahead <= S && t === l) return A;
										if (0 === e.lookahead) break;
									}
									if (e.match_length = 0, e.lookahead >= x && 0 < e.strstart && (n = a[i = e.strstart - 1]) === a[++i] && n === a[++i] && n === a[++i]) {
										s = e.strstart + S;
										do										;
while (n === a[++i] && n === a[++i] && n === a[++i] && n === a[++i] && n === a[++i] && n === a[++i] && n === a[++i] && n === a[++i] && i < s);
										e.match_length = S - (s - i), e.match_length > e.lookahead && (e.match_length = e.lookahead);
									}
									if (e.match_length >= x ? (r = u._tr_tally(e, 1, e.match_length - x), e.lookahead -= e.match_length, e.strstart += e.match_length, e.match_length = 0) : (r = u._tr_tally(e, 0, e.window[e.strstart]), e.lookahead--, e.strstart++), r && (N(e, !1), 0 === e.strm.avail_out)) return A;
								}
								return e.insert = 0, t === f ? (N(e, !0), 0 === e.strm.avail_out ? O : B) : e.last_lit && (N(e, !1), 0 === e.strm.avail_out) ? A : I;
							}(n, t) : h[n.level].func(n, t);
							if (o !== O && o !== B || (n.status = 666), o === A || o === O) return 0 === e.avail_out && (n.last_flush = -1), m;
							if (o === I && (1 === t ? u._tr_align(n) : 5 !== t && (u._tr_stored_block(n, 0, 0, !1), 3 === t && (D(n.head), 0 === n.lookahead && (n.strstart = 0, n.block_start = 0, n.insert = 0))), F(e), 0 === e.avail_out)) return n.last_flush = -1, m;
						}
						return t !== f ? m : n.wrap <= 0 ? 1 : (2 === n.wrap ? (U(n, 255 & e.adler), U(n, e.adler >> 8 & 255), U(n, e.adler >> 16 & 255), U(n, e.adler >> 24 & 255), U(n, 255 & e.total_in), U(n, e.total_in >> 8 & 255), U(n, e.total_in >> 16 & 255), U(n, e.total_in >> 24 & 255)) : (P(n, e.adler >>> 16), P(n, 65535 & e.adler)), F(e), 0 < n.wrap && (n.wrap = -n.wrap), 0 !== n.pending ? m : 1);
					}, r.deflateEnd = function(e) {
						var t;
						return e && e.state ? (t = e.state.status) !== C && 69 !== t && 73 !== t && 91 !== t && 103 !== t && t !== E && 666 !== t ? R(e, _) : (e.state = null, t === E ? R(e, -3) : m) : _;
					}, r.deflateSetDictionary = function(e, t) {
						var r, n, i, s, a, o, h, u, l = t.length;
						if (!e || !e.state) return _;
						if (2 === (s = (r = e.state).wrap) || 1 === s && r.status !== C || r.lookahead) return _;
						for (1 === s && (e.adler = d(e.adler, t, l, 0)), r.wrap = 0, l >= r.w_size && (0 === s && (D(r.head), r.strstart = 0, r.block_start = 0, r.insert = 0), u = new c.Buf8(r.w_size), c.arraySet(u, t, l - r.w_size, r.w_size, 0), t = u, l = r.w_size), a = e.avail_in, o = e.next_in, h = e.input, e.avail_in = l, e.next_in = 0, e.input = t, j(r); r.lookahead >= x;) {
							for (n = r.strstart, i = r.lookahead - (x - 1); r.ins_h = (r.ins_h << r.hash_shift ^ r.window[n + x - 1]) & r.hash_mask, r.prev[n & r.w_mask] = r.head[r.ins_h], r.head[r.ins_h] = n, n++, --i;);
							r.strstart = n, r.lookahead = x - 1, j(r);
						}
						return r.strstart += r.lookahead, r.block_start = r.strstart, r.insert = r.lookahead, r.lookahead = 0, r.match_length = r.prev_length = x - 1, r.match_available = 0, e.next_in = o, e.input = h, e.avail_in = a, r.wrap = s, m;
					}, r.deflateInfo = "pako deflate (from Nodeca project)";
				}, {
					"../utils/common": 41,
					"./adler32": 43,
					"./crc32": 45,
					"./messages": 51,
					"./trees": 52
				}],
				47: [function(e, t, r) {
					"use strict";
					t.exports = function() {
						this.text = 0, this.time = 0, this.xflags = 0, this.os = 0, this.extra = null, this.extra_len = 0, this.name = "", this.comment = "", this.hcrc = 0, this.done = !1;
					};
				}, {}],
				48: [function(e, t, r) {
					"use strict";
					t.exports = function(e, t) {
						var r = e.state, n = e.next_in, i, s, a, o, h, u, l, f, c, d, p, m, _, g, b, v, y, w, k, x, S, z = e.input, C;
						i = n + (e.avail_in - 5), s = e.next_out, C = e.output, a = s - (t - e.avail_out), o = s + (e.avail_out - 257), h = r.dmax, u = r.wsize, l = r.whave, f = r.wnext, c = r.window, d = r.hold, p = r.bits, m = r.lencode, _ = r.distcode, g = (1 << r.lenbits) - 1, b = (1 << r.distbits) - 1;
						e: do {
							p < 15 && (d += z[n++] << p, p += 8, d += z[n++] << p, p += 8), v = m[d & g];
							t: for (;;) {
								if (d >>>= y = v >>> 24, p -= y, 0 === (y = v >>> 16 & 255)) C[s++] = 65535 & v;
								else {
									if (!(16 & y)) {
										if (0 == (64 & y)) {
											v = m[(65535 & v) + (d & (1 << y) - 1)];
											continue t;
										}
										if (32 & y) {
											r.mode = 12;
											break e;
										}
										e.msg = "invalid literal/length code", r.mode = 30;
										break e;
									}
									w = 65535 & v, (y &= 15) && (p < y && (d += z[n++] << p, p += 8), w += d & (1 << y) - 1, d >>>= y, p -= y), p < 15 && (d += z[n++] << p, p += 8, d += z[n++] << p, p += 8), v = _[d & b];
									r: for (;;) {
										if (d >>>= y = v >>> 24, p -= y, !(16 & (y = v >>> 16 & 255))) {
											if (0 == (64 & y)) {
												v = _[(65535 & v) + (d & (1 << y) - 1)];
												continue r;
											}
											e.msg = "invalid distance code", r.mode = 30;
											break e;
										}
										if (k = 65535 & v, p < (y &= 15) && (d += z[n++] << p, (p += 8) < y && (d += z[n++] << p, p += 8)), h < (k += d & (1 << y) - 1)) {
											e.msg = "invalid distance too far back", r.mode = 30;
											break e;
										}
										if (d >>>= y, p -= y, (y = s - a) < k) {
											if (l < (y = k - y) && r.sane) {
												e.msg = "invalid distance too far back", r.mode = 30;
												break e;
											}
											if (S = c, (x = 0) === f) {
												if (x += u - y, y < w) {
													for (w -= y; C[s++] = c[x++], --y;);
													x = s - k, S = C;
												}
											} else if (f < y) {
												if (x += u + f - y, (y -= f) < w) {
													for (w -= y; C[s++] = c[x++], --y;);
													if (x = 0, f < w) {
														for (w -= y = f; C[s++] = c[x++], --y;);
														x = s - k, S = C;
													}
												}
											} else if (x += f - y, y < w) {
												for (w -= y; C[s++] = c[x++], --y;);
												x = s - k, S = C;
											}
											for (; 2 < w;) C[s++] = S[x++], C[s++] = S[x++], C[s++] = S[x++], w -= 3;
											w && (C[s++] = S[x++], 1 < w && (C[s++] = S[x++]));
										} else {
											for (x = s - k; C[s++] = C[x++], C[s++] = C[x++], C[s++] = C[x++], 2 < (w -= 3););
											w && (C[s++] = C[x++], 1 < w && (C[s++] = C[x++]));
										}
										break;
									}
								}
								break;
							}
						} while (n < i && s < o);
						n -= w = p >> 3, d &= (1 << (p -= w << 3)) - 1, e.next_in = n, e.next_out = s, e.avail_in = n < i ? i - n + 5 : 5 - (n - i), e.avail_out = s < o ? o - s + 257 : 257 - (s - o), r.hold = d, r.bits = p;
					};
				}, {}],
				49: [function(e, t, r) {
					"use strict";
					var I = e("../utils/common"), O = e("./adler32"), B = e("./crc32"), R = e("./inffast"), T = e("./inftrees"), D = 1, F = 2, N = 0, U = -2, P = 1, n = 852, i = 592;
					function L(e) {
						return (e >>> 24 & 255) + (e >>> 8 & 65280) + ((65280 & e) << 8) + ((255 & e) << 24);
					}
					function s() {
						this.mode = 0, this.last = !1, this.wrap = 0, this.havedict = !1, this.flags = 0, this.dmax = 0, this.check = 0, this.total = 0, this.head = null, this.wbits = 0, this.wsize = 0, this.whave = 0, this.wnext = 0, this.window = null, this.hold = 0, this.bits = 0, this.length = 0, this.offset = 0, this.extra = 0, this.lencode = null, this.distcode = null, this.lenbits = 0, this.distbits = 0, this.ncode = 0, this.nlen = 0, this.ndist = 0, this.have = 0, this.next = null, this.lens = new I.Buf16(320), this.work = new I.Buf16(288), this.lendyn = null, this.distdyn = null, this.sane = 0, this.back = 0, this.was = 0;
					}
					function a(e) {
						var t;
						return e && e.state ? (t = e.state, e.total_in = e.total_out = t.total = 0, e.msg = "", t.wrap && (e.adler = 1 & t.wrap), t.mode = P, t.last = 0, t.havedict = 0, t.dmax = 32768, t.head = null, t.hold = 0, t.bits = 0, t.lencode = t.lendyn = new I.Buf32(n), t.distcode = t.distdyn = new I.Buf32(i), t.sane = 1, t.back = -1, N) : U;
					}
					function o(e) {
						var t;
						return e && e.state ? ((t = e.state).wsize = 0, t.whave = 0, t.wnext = 0, a(e)) : U;
					}
					function h(e, t) {
						var r, n;
						return e && e.state ? (n = e.state, t < 0 ? (r = 0, t = -t) : (r = 1 + (t >> 4), t < 48 && (t &= 15)), t && (t < 8 || 15 < t) ? U : (null !== n.window && n.wbits !== t && (n.window = null), n.wrap = r, n.wbits = t, o(e))) : U;
					}
					function u(e, t) {
						var r, n;
						return e ? (n = new s(), (e.state = n).window = null, (r = h(e, t)) !== N && (e.state = null), r) : U;
					}
					var l, f, c = !0;
					function j(e) {
						if (c) {
							var t;
							for (l = new I.Buf32(512), f = new I.Buf32(32), t = 0; t < 144;) e.lens[t++] = 8;
							for (; t < 256;) e.lens[t++] = 9;
							for (; t < 280;) e.lens[t++] = 7;
							for (; t < 288;) e.lens[t++] = 8;
							for (T(D, e.lens, 0, 288, l, 0, e.work, { bits: 9 }), t = 0; t < 32;) e.lens[t++] = 5;
							T(F, e.lens, 0, 32, f, 0, e.work, { bits: 5 }), c = !1;
						}
						e.lencode = l, e.lenbits = 9, e.distcode = f, e.distbits = 5;
					}
					function Z(e, t, r, n) {
						var i, s = e.state;
						return null === s.window && (s.wsize = 1 << s.wbits, s.wnext = 0, s.whave = 0, s.window = new I.Buf8(s.wsize)), n >= s.wsize ? (I.arraySet(s.window, t, r - s.wsize, s.wsize, 0), s.wnext = 0, s.whave = s.wsize) : (n < (i = s.wsize - s.wnext) && (i = n), I.arraySet(s.window, t, r - n, i, s.wnext), (n -= i) ? (I.arraySet(s.window, t, r - n, n, 0), s.wnext = n, s.whave = s.wsize) : (s.wnext += i, s.wnext === s.wsize && (s.wnext = 0), s.whave < s.wsize && (s.whave += i))), 0;
					}
					r.inflateReset = o, r.inflateReset2 = h, r.inflateResetKeep = a, r.inflateInit = function(e) {
						return u(e, 15);
					}, r.inflateInit2 = u, r.inflate = function(e, t) {
						var r, n, i, s, a, o, h, u, l, f, c, d, p, m, _, g, b, v, y, w, k, x, S, z, C = 0, E = new I.Buf8(4), A = [
							16,
							17,
							18,
							0,
							8,
							7,
							9,
							6,
							10,
							5,
							11,
							4,
							12,
							3,
							13,
							2,
							14,
							1,
							15
						];
						if (!e || !e.state || !e.output || !e.input && 0 !== e.avail_in) return U;
						12 === (r = e.state).mode && (r.mode = 13), a = e.next_out, i = e.output, h = e.avail_out, s = e.next_in, n = e.input, o = e.avail_in, u = r.hold, l = r.bits, f = o, c = h, x = N;
						e: for (;;) switch (r.mode) {
							case P:
								if (0 === r.wrap) {
									r.mode = 13;
									break;
								}
								for (; l < 16;) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								if (2 & r.wrap && 35615 === u) {
									E[r.check = 0] = 255 & u, E[1] = u >>> 8 & 255, r.check = B(r.check, E, 2, 0), l = u = 0, r.mode = 2;
									break;
								}
								if (r.flags = 0, r.head && (r.head.done = !1), !(1 & r.wrap) || (((255 & u) << 8) + (u >> 8)) % 31) {
									e.msg = "incorrect header check", r.mode = 30;
									break;
								}
								if (8 != (15 & u)) {
									e.msg = "unknown compression method", r.mode = 30;
									break;
								}
								if (l -= 4, k = 8 + (15 & (u >>>= 4)), 0 === r.wbits) r.wbits = k;
								else if (k > r.wbits) {
									e.msg = "invalid window size", r.mode = 30;
									break;
								}
								r.dmax = 1 << k, e.adler = r.check = 1, r.mode = 512 & u ? 10 : 12, l = u = 0;
								break;
							case 2:
								for (; l < 16;) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								if (r.flags = u, 8 != (255 & r.flags)) {
									e.msg = "unknown compression method", r.mode = 30;
									break;
								}
								if (57344 & r.flags) {
									e.msg = "unknown header flags set", r.mode = 30;
									break;
								}
								r.head && (r.head.text = u >> 8 & 1), 512 & r.flags && (E[0] = 255 & u, E[1] = u >>> 8 & 255, r.check = B(r.check, E, 2, 0)), l = u = 0, r.mode = 3;
							case 3:
								for (; l < 32;) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								r.head && (r.head.time = u), 512 & r.flags && (E[0] = 255 & u, E[1] = u >>> 8 & 255, E[2] = u >>> 16 & 255, E[3] = u >>> 24 & 255, r.check = B(r.check, E, 4, 0)), l = u = 0, r.mode = 4;
							case 4:
								for (; l < 16;) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								r.head && (r.head.xflags = 255 & u, r.head.os = u >> 8), 512 & r.flags && (E[0] = 255 & u, E[1] = u >>> 8 & 255, r.check = B(r.check, E, 2, 0)), l = u = 0, r.mode = 5;
							case 5:
								if (1024 & r.flags) {
									for (; l < 16;) {
										if (0 === o) break e;
										o--, u += n[s++] << l, l += 8;
									}
									r.length = u, r.head && (r.head.extra_len = u), 512 & r.flags && (E[0] = 255 & u, E[1] = u >>> 8 & 255, r.check = B(r.check, E, 2, 0)), l = u = 0;
								} else r.head && (r.head.extra = null);
								r.mode = 6;
							case 6:
								if (1024 & r.flags && (o < (d = r.length) && (d = o), d && (r.head && (k = r.head.extra_len - r.length, r.head.extra || (r.head.extra = new Array(r.head.extra_len)), I.arraySet(r.head.extra, n, s, d, k)), 512 & r.flags && (r.check = B(r.check, n, d, s)), o -= d, s += d, r.length -= d), r.length)) break e;
								r.length = 0, r.mode = 7;
							case 7:
								if (2048 & r.flags) {
									if (0 === o) break e;
									for (d = 0; k = n[s + d++], r.head && k && r.length < 65536 && (r.head.name += String.fromCharCode(k)), k && d < o;);
									if (512 & r.flags && (r.check = B(r.check, n, d, s)), o -= d, s += d, k) break e;
								} else r.head && (r.head.name = null);
								r.length = 0, r.mode = 8;
							case 8:
								if (4096 & r.flags) {
									if (0 === o) break e;
									for (d = 0; k = n[s + d++], r.head && k && r.length < 65536 && (r.head.comment += String.fromCharCode(k)), k && d < o;);
									if (512 & r.flags && (r.check = B(r.check, n, d, s)), o -= d, s += d, k) break e;
								} else r.head && (r.head.comment = null);
								r.mode = 9;
							case 9:
								if (512 & r.flags) {
									for (; l < 16;) {
										if (0 === o) break e;
										o--, u += n[s++] << l, l += 8;
									}
									if (u !== (65535 & r.check)) {
										e.msg = "header crc mismatch", r.mode = 30;
										break;
									}
									l = u = 0;
								}
								r.head && (r.head.hcrc = r.flags >> 9 & 1, r.head.done = !0), e.adler = r.check = 0, r.mode = 12;
								break;
							case 10:
								for (; l < 32;) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								e.adler = r.check = L(u), l = u = 0, r.mode = 11;
							case 11:
								if (0 === r.havedict) return e.next_out = a, e.avail_out = h, e.next_in = s, e.avail_in = o, r.hold = u, r.bits = l, 2;
								e.adler = r.check = 1, r.mode = 12;
							case 12: if (5 === t || 6 === t) break e;
							case 13:
								if (r.last) {
									u >>>= 7 & l, l -= 7 & l, r.mode = 27;
									break;
								}
								for (; l < 3;) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								switch (r.last = 1 & u, l -= 1, 3 & (u >>>= 1)) {
									case 0:
										r.mode = 14;
										break;
									case 1:
										if (j(r), r.mode = 20, 6 !== t) break;
										u >>>= 2, l -= 2;
										break e;
									case 2:
										r.mode = 17;
										break;
									case 3: e.msg = "invalid block type", r.mode = 30;
								}
								u >>>= 2, l -= 2;
								break;
							case 14:
								for (u >>>= 7 & l, l -= 7 & l; l < 32;) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								if ((65535 & u) != (u >>> 16 ^ 65535)) {
									e.msg = "invalid stored block lengths", r.mode = 30;
									break;
								}
								if (r.length = 65535 & u, l = u = 0, r.mode = 15, 6 === t) break e;
							case 15: r.mode = 16;
							case 16:
								if (d = r.length) {
									if (o < d && (d = o), h < d && (d = h), 0 === d) break e;
									I.arraySet(i, n, s, d, a), o -= d, s += d, h -= d, a += d, r.length -= d;
									break;
								}
								r.mode = 12;
								break;
							case 17:
								for (; l < 14;) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								if (r.nlen = 257 + (31 & u), u >>>= 5, l -= 5, r.ndist = 1 + (31 & u), u >>>= 5, l -= 5, r.ncode = 4 + (15 & u), u >>>= 4, l -= 4, 286 < r.nlen || 30 < r.ndist) {
									e.msg = "too many length or distance symbols", r.mode = 30;
									break;
								}
								r.have = 0, r.mode = 18;
							case 18:
								for (; r.have < r.ncode;) {
									for (; l < 3;) {
										if (0 === o) break e;
										o--, u += n[s++] << l, l += 8;
									}
									r.lens[A[r.have++]] = 7 & u, u >>>= 3, l -= 3;
								}
								for (; r.have < 19;) r.lens[A[r.have++]] = 0;
								if (r.lencode = r.lendyn, r.lenbits = 7, S = { bits: r.lenbits }, x = T(0, r.lens, 0, 19, r.lencode, 0, r.work, S), r.lenbits = S.bits, x) {
									e.msg = "invalid code lengths set", r.mode = 30;
									break;
								}
								r.have = 0, r.mode = 19;
							case 19:
								for (; r.have < r.nlen + r.ndist;) {
									for (; g = (C = r.lencode[u & (1 << r.lenbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l);) {
										if (0 === o) break e;
										o--, u += n[s++] << l, l += 8;
									}
									if (b < 16) u >>>= _, l -= _, r.lens[r.have++] = b;
									else {
										if (16 === b) {
											for (z = _ + 2; l < z;) {
												if (0 === o) break e;
												o--, u += n[s++] << l, l += 8;
											}
											if (u >>>= _, l -= _, 0 === r.have) {
												e.msg = "invalid bit length repeat", r.mode = 30;
												break;
											}
											k = r.lens[r.have - 1], d = 3 + (3 & u), u >>>= 2, l -= 2;
										} else if (17 === b) {
											for (z = _ + 3; l < z;) {
												if (0 === o) break e;
												o--, u += n[s++] << l, l += 8;
											}
											l -= _, k = 0, d = 3 + (7 & (u >>>= _)), u >>>= 3, l -= 3;
										} else {
											for (z = _ + 7; l < z;) {
												if (0 === o) break e;
												o--, u += n[s++] << l, l += 8;
											}
											l -= _, k = 0, d = 11 + (127 & (u >>>= _)), u >>>= 7, l -= 7;
										}
										if (r.have + d > r.nlen + r.ndist) {
											e.msg = "invalid bit length repeat", r.mode = 30;
											break;
										}
										for (; d--;) r.lens[r.have++] = k;
									}
								}
								if (30 === r.mode) break;
								if (0 === r.lens[256]) {
									e.msg = "invalid code -- missing end-of-block", r.mode = 30;
									break;
								}
								if (r.lenbits = 9, S = { bits: r.lenbits }, x = T(D, r.lens, 0, r.nlen, r.lencode, 0, r.work, S), r.lenbits = S.bits, x) {
									e.msg = "invalid literal/lengths set", r.mode = 30;
									break;
								}
								if (r.distbits = 6, r.distcode = r.distdyn, S = { bits: r.distbits }, x = T(F, r.lens, r.nlen, r.ndist, r.distcode, 0, r.work, S), r.distbits = S.bits, x) {
									e.msg = "invalid distances set", r.mode = 30;
									break;
								}
								if (r.mode = 20, 6 === t) break e;
							case 20: r.mode = 21;
							case 21:
								if (6 <= o && 258 <= h) {
									e.next_out = a, e.avail_out = h, e.next_in = s, e.avail_in = o, r.hold = u, r.bits = l, R(e, c), a = e.next_out, i = e.output, h = e.avail_out, s = e.next_in, n = e.input, o = e.avail_in, u = r.hold, l = r.bits, 12 === r.mode && (r.back = -1);
									break;
								}
								for (r.back = 0; g = (C = r.lencode[u & (1 << r.lenbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l);) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								if (g && 0 == (240 & g)) {
									for (v = _, y = g, w = b; g = (C = r.lencode[w + ((u & (1 << v + y) - 1) >> v)]) >>> 16 & 255, b = 65535 & C, !(v + (_ = C >>> 24) <= l);) {
										if (0 === o) break e;
										o--, u += n[s++] << l, l += 8;
									}
									u >>>= v, l -= v, r.back += v;
								}
								if (u >>>= _, l -= _, r.back += _, r.length = b, 0 === g) {
									r.mode = 26;
									break;
								}
								if (32 & g) {
									r.back = -1, r.mode = 12;
									break;
								}
								if (64 & g) {
									e.msg = "invalid literal/length code", r.mode = 30;
									break;
								}
								r.extra = 15 & g, r.mode = 22;
							case 22:
								if (r.extra) {
									for (z = r.extra; l < z;) {
										if (0 === o) break e;
										o--, u += n[s++] << l, l += 8;
									}
									r.length += u & (1 << r.extra) - 1, u >>>= r.extra, l -= r.extra, r.back += r.extra;
								}
								r.was = r.length, r.mode = 23;
							case 23:
								for (; g = (C = r.distcode[u & (1 << r.distbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l);) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								if (0 == (240 & g)) {
									for (v = _, y = g, w = b; g = (C = r.distcode[w + ((u & (1 << v + y) - 1) >> v)]) >>> 16 & 255, b = 65535 & C, !(v + (_ = C >>> 24) <= l);) {
										if (0 === o) break e;
										o--, u += n[s++] << l, l += 8;
									}
									u >>>= v, l -= v, r.back += v;
								}
								if (u >>>= _, l -= _, r.back += _, 64 & g) {
									e.msg = "invalid distance code", r.mode = 30;
									break;
								}
								r.offset = b, r.extra = 15 & g, r.mode = 24;
							case 24:
								if (r.extra) {
									for (z = r.extra; l < z;) {
										if (0 === o) break e;
										o--, u += n[s++] << l, l += 8;
									}
									r.offset += u & (1 << r.extra) - 1, u >>>= r.extra, l -= r.extra, r.back += r.extra;
								}
								if (r.offset > r.dmax) {
									e.msg = "invalid distance too far back", r.mode = 30;
									break;
								}
								r.mode = 25;
							case 25:
								if (0 === h) break e;
								if (d = c - h, r.offset > d) {
									if ((d = r.offset - d) > r.whave && r.sane) {
										e.msg = "invalid distance too far back", r.mode = 30;
										break;
									}
									p = d > r.wnext ? (d -= r.wnext, r.wsize - d) : r.wnext - d, d > r.length && (d = r.length), m = r.window;
								} else m = i, p = a - r.offset, d = r.length;
								for (h < d && (d = h), h -= d, r.length -= d; i[a++] = m[p++], --d;);
								0 === r.length && (r.mode = 21);
								break;
							case 26:
								if (0 === h) break e;
								i[a++] = r.length, h--, r.mode = 21;
								break;
							case 27:
								if (r.wrap) {
									for (; l < 32;) {
										if (0 === o) break e;
										o--, u |= n[s++] << l, l += 8;
									}
									if (c -= h, e.total_out += c, r.total += c, c && (e.adler = r.check = r.flags ? B(r.check, i, c, a - c) : O(r.check, i, c, a - c)), c = h, (r.flags ? u : L(u)) !== r.check) {
										e.msg = "incorrect data check", r.mode = 30;
										break;
									}
									l = u = 0;
								}
								r.mode = 28;
							case 28:
								if (r.wrap && r.flags) {
									for (; l < 32;) {
										if (0 === o) break e;
										o--, u += n[s++] << l, l += 8;
									}
									if (u !== (4294967295 & r.total)) {
										e.msg = "incorrect length check", r.mode = 30;
										break;
									}
									l = u = 0;
								}
								r.mode = 29;
							case 29:
								x = 1;
								break e;
							case 30:
								x = -3;
								break e;
							case 31: return -4;
							case 32:
							default: return U;
						}
						return e.next_out = a, e.avail_out = h, e.next_in = s, e.avail_in = o, r.hold = u, r.bits = l, (r.wsize || c !== e.avail_out && r.mode < 30 && (r.mode < 27 || 4 !== t)) && Z(e, e.output, e.next_out, c - e.avail_out) ? (r.mode = 31, -4) : (f -= e.avail_in, c -= e.avail_out, e.total_in += f, e.total_out += c, r.total += c, r.wrap && c && (e.adler = r.check = r.flags ? B(r.check, i, c, e.next_out - c) : O(r.check, i, c, e.next_out - c)), e.data_type = r.bits + (r.last ? 64 : 0) + (12 === r.mode ? 128 : 0) + (20 === r.mode || 15 === r.mode ? 256 : 0), (0 == f && 0 === c || 4 === t) && x === N && (x = -5), x);
					}, r.inflateEnd = function(e) {
						if (!e || !e.state) return U;
						var t = e.state;
						return t.window && (t.window = null), e.state = null, N;
					}, r.inflateGetHeader = function(e, t) {
						var r;
						return e && e.state ? 0 == (2 & (r = e.state).wrap) ? U : ((r.head = t).done = !1, N) : U;
					}, r.inflateSetDictionary = function(e, t) {
						var r, n = t.length;
						return e && e.state ? 0 !== (r = e.state).wrap && 11 !== r.mode ? U : 11 === r.mode && O(1, t, n, 0) !== r.check ? -3 : Z(e, t, n, n) ? (r.mode = 31, -4) : (r.havedict = 1, N) : U;
					}, r.inflateInfo = "pako inflate (from Nodeca project)";
				}, {
					"../utils/common": 41,
					"./adler32": 43,
					"./crc32": 45,
					"./inffast": 48,
					"./inftrees": 50
				}],
				50: [function(e, t, r) {
					"use strict";
					var D = e("../utils/common"), F = [
						3,
						4,
						5,
						6,
						7,
						8,
						9,
						10,
						11,
						13,
						15,
						17,
						19,
						23,
						27,
						31,
						35,
						43,
						51,
						59,
						67,
						83,
						99,
						115,
						131,
						163,
						195,
						227,
						258,
						0,
						0
					], N = [
						16,
						16,
						16,
						16,
						16,
						16,
						16,
						16,
						17,
						17,
						17,
						17,
						18,
						18,
						18,
						18,
						19,
						19,
						19,
						19,
						20,
						20,
						20,
						20,
						21,
						21,
						21,
						21,
						16,
						72,
						78
					], U = [
						1,
						2,
						3,
						4,
						5,
						7,
						9,
						13,
						17,
						25,
						33,
						49,
						65,
						97,
						129,
						193,
						257,
						385,
						513,
						769,
						1025,
						1537,
						2049,
						3073,
						4097,
						6145,
						8193,
						12289,
						16385,
						24577,
						0,
						0
					], P = [
						16,
						16,
						16,
						16,
						17,
						17,
						18,
						18,
						19,
						19,
						20,
						20,
						21,
						21,
						22,
						22,
						23,
						23,
						24,
						24,
						25,
						25,
						26,
						26,
						27,
						27,
						28,
						28,
						29,
						29,
						64,
						64
					];
					t.exports = function(e, t, r, n, i, s, a, o) {
						var h, u, l, f, c, d, p, m, _, g = o.bits, b = 0, v = 0, y = 0, w = 0, k = 0, x = 0, S = 0, z = 0, C = 0, E = 0, A = null, I = 0, O = new D.Buf16(16), B = new D.Buf16(16), R = null, T = 0;
						for (b = 0; b <= 15; b++) O[b] = 0;
						for (v = 0; v < n; v++) O[t[r + v]]++;
						for (k = g, w = 15; 1 <= w && 0 === O[w]; w--);
						if (w < k && (k = w), 0 === w) return i[s++] = 20971520, i[s++] = 20971520, o.bits = 1, 0;
						for (y = 1; y < w && 0 === O[y]; y++);
						for (k < y && (k = y), b = z = 1; b <= 15; b++) if (z <<= 1, (z -= O[b]) < 0) return -1;
						if (0 < z && (0 === e || 1 !== w)) return -1;
						for (B[1] = 0, b = 1; b < 15; b++) B[b + 1] = B[b] + O[b];
						for (v = 0; v < n; v++) 0 !== t[r + v] && (a[B[t[r + v]]++] = v);
						if (d = 0 === e ? (A = R = a, 19) : 1 === e ? (A = F, I -= 257, R = N, T -= 257, 256) : (A = U, R = P, -1), b = y, c = s, S = v = E = 0, l = -1, f = (C = 1 << (x = k)) - 1, 1 === e && 852 < C || 2 === e && 592 < C) return 1;
						for (;;) {
							for (p = b - S, _ = a[v] < d ? (m = 0, a[v]) : a[v] > d ? (m = R[T + a[v]], A[I + a[v]]) : (m = 96, 0), h = 1 << b - S, y = u = 1 << x; i[c + (E >> S) + (u -= h)] = p << 24 | m << 16 | _ | 0, 0 !== u;);
							for (h = 1 << b - 1; E & h;) h >>= 1;
							if (0 !== h ? (E &= h - 1, E += h) : E = 0, v++, 0 == --O[b]) {
								if (b === w) break;
								b = t[r + a[v]];
							}
							if (k < b && (E & f) !== l) {
								for (0 === S && (S = k), c += y, z = 1 << (x = b - S); x + S < w && !((z -= O[x + S]) <= 0);) x++, z <<= 1;
								if (C += 1 << x, 1 === e && 852 < C || 2 === e && 592 < C) return 1;
								i[l = E & f] = k << 24 | x << 16 | c - s | 0;
							}
						}
						return 0 !== E && (i[c + E] = b - S << 24 | 4194304), o.bits = k, 0;
					};
				}, { "../utils/common": 41 }],
				51: [function(e, t, r) {
					"use strict";
					t.exports = {
						2: "need dictionary",
						1: "stream end",
						0: "",
						"-1": "file error",
						"-2": "stream error",
						"-3": "data error",
						"-4": "insufficient memory",
						"-5": "buffer error",
						"-6": "incompatible version"
					};
				}, {}],
				52: [function(e, t, r) {
					"use strict";
					var i = e("../utils/common"), o = 0, h = 1;
					function n(e) {
						for (var t = e.length; 0 <= --t;) e[t] = 0;
					}
					var s = 0, a = 29, u = 256, l = u + 1 + a, f = 30, c = 19, _ = 2 * l + 1, g = 15, d = 16, p = 7, m = 256, b = 16, v = 17, y = 18, w = [
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						1,
						1,
						1,
						1,
						2,
						2,
						2,
						2,
						3,
						3,
						3,
						3,
						4,
						4,
						4,
						4,
						5,
						5,
						5,
						5,
						0
					], k = [
						0,
						0,
						0,
						0,
						1,
						1,
						2,
						2,
						3,
						3,
						4,
						4,
						5,
						5,
						6,
						6,
						7,
						7,
						8,
						8,
						9,
						9,
						10,
						10,
						11,
						11,
						12,
						12,
						13,
						13
					], x = [
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						2,
						3,
						7
					], S = [
						16,
						17,
						18,
						0,
						8,
						7,
						9,
						6,
						10,
						5,
						11,
						4,
						12,
						3,
						13,
						2,
						14,
						1,
						15
					], z = new Array(2 * (l + 2));
					n(z);
					var C = new Array(2 * f);
					n(C);
					var E = new Array(512);
					n(E);
					var A = new Array(256);
					n(A);
					var I = new Array(a);
					n(I);
					var O, B, R, T = new Array(f);
					function D(e, t, r, n, i) {
						this.static_tree = e, this.extra_bits = t, this.extra_base = r, this.elems = n, this.max_length = i, this.has_stree = e && e.length;
					}
					function F(e, t) {
						this.dyn_tree = e, this.max_code = 0, this.stat_desc = t;
					}
					function N(e) {
						return e < 256 ? E[e] : E[256 + (e >>> 7)];
					}
					function U(e, t) {
						e.pending_buf[e.pending++] = 255 & t, e.pending_buf[e.pending++] = t >>> 8 & 255;
					}
					function P(e, t, r) {
						e.bi_valid > d - r ? (e.bi_buf |= t << e.bi_valid & 65535, U(e, e.bi_buf), e.bi_buf = t >> d - e.bi_valid, e.bi_valid += r - d) : (e.bi_buf |= t << e.bi_valid & 65535, e.bi_valid += r);
					}
					function L(e, t, r) {
						P(e, r[2 * t], r[2 * t + 1]);
					}
					function j(e, t) {
						for (var r = 0; r |= 1 & e, e >>>= 1, r <<= 1, 0 < --t;);
						return r >>> 1;
					}
					function Z(e, t, r) {
						var n, i, s = new Array(g + 1), a = 0;
						for (n = 1; n <= g; n++) s[n] = a = a + r[n - 1] << 1;
						for (i = 0; i <= t; i++) {
							var o = e[2 * i + 1];
							0 !== o && (e[2 * i] = j(s[o]++, o));
						}
					}
					function W(e) {
						var t;
						for (t = 0; t < l; t++) e.dyn_ltree[2 * t] = 0;
						for (t = 0; t < f; t++) e.dyn_dtree[2 * t] = 0;
						for (t = 0; t < c; t++) e.bl_tree[2 * t] = 0;
						e.dyn_ltree[2 * m] = 1, e.opt_len = e.static_len = 0, e.last_lit = e.matches = 0;
					}
					function M(e) {
						8 < e.bi_valid ? U(e, e.bi_buf) : 0 < e.bi_valid && (e.pending_buf[e.pending++] = e.bi_buf), e.bi_buf = 0, e.bi_valid = 0;
					}
					function H(e, t, r, n) {
						var i = 2 * t, s = 2 * r;
						return e[i] < e[s] || e[i] === e[s] && n[t] <= n[r];
					}
					function G(e, t, r) {
						for (var n = e.heap[r], i = r << 1; i <= e.heap_len && (i < e.heap_len && H(t, e.heap[i + 1], e.heap[i], e.depth) && i++, !H(t, n, e.heap[i], e.depth));) e.heap[r] = e.heap[i], r = i, i <<= 1;
						e.heap[r] = n;
					}
					function K(e, t, r) {
						var n, i, s, a, o = 0;
						if (0 !== e.last_lit) for (; n = e.pending_buf[e.d_buf + 2 * o] << 8 | e.pending_buf[e.d_buf + 2 * o + 1], i = e.pending_buf[e.l_buf + o], o++, 0 === n ? L(e, i, t) : (L(e, (s = A[i]) + u + 1, t), 0 !== (a = w[s]) && P(e, i -= I[s], a), L(e, s = N(--n), r), 0 !== (a = k[s]) && P(e, n -= T[s], a)), o < e.last_lit;);
						L(e, m, t);
					}
					function Y(e, t) {
						var r, n, i, s = t.dyn_tree, a = t.stat_desc.static_tree, o = t.stat_desc.has_stree, h = t.stat_desc.elems, u = -1;
						for (e.heap_len = 0, e.heap_max = _, r = 0; r < h; r++) 0 !== s[2 * r] ? (e.heap[++e.heap_len] = u = r, e.depth[r] = 0) : s[2 * r + 1] = 0;
						for (; e.heap_len < 2;) s[2 * (i = e.heap[++e.heap_len] = u < 2 ? ++u : 0)] = 1, e.depth[i] = 0, e.opt_len--, o && (e.static_len -= a[2 * i + 1]);
						for (t.max_code = u, r = e.heap_len >> 1; 1 <= r; r--) G(e, s, r);
						for (i = h; r = e.heap[1], e.heap[1] = e.heap[e.heap_len--], G(e, s, 1), n = e.heap[1], e.heap[--e.heap_max] = r, e.heap[--e.heap_max] = n, s[2 * i] = s[2 * r] + s[2 * n], e.depth[i] = (e.depth[r] >= e.depth[n] ? e.depth[r] : e.depth[n]) + 1, s[2 * r + 1] = s[2 * n + 1] = i, e.heap[1] = i++, G(e, s, 1), 2 <= e.heap_len;);
						e.heap[--e.heap_max] = e.heap[1], function(e, t) {
							var r, n, i, s, a, o, h = t.dyn_tree, u = t.max_code, l = t.stat_desc.static_tree, f = t.stat_desc.has_stree, c = t.stat_desc.extra_bits, d = t.stat_desc.extra_base, p = t.stat_desc.max_length, m = 0;
							for (s = 0; s <= g; s++) e.bl_count[s] = 0;
							for (h[2 * e.heap[e.heap_max] + 1] = 0, r = e.heap_max + 1; r < _; r++) p < (s = h[2 * h[2 * (n = e.heap[r]) + 1] + 1] + 1) && (s = p, m++), h[2 * n + 1] = s, u < n || (e.bl_count[s]++, a = 0, d <= n && (a = c[n - d]), o = h[2 * n], e.opt_len += o * (s + a), f && (e.static_len += o * (l[2 * n + 1] + a)));
							if (0 !== m) {
								do {
									for (s = p - 1; 0 === e.bl_count[s];) s--;
									e.bl_count[s]--, e.bl_count[s + 1] += 2, e.bl_count[p]--, m -= 2;
								} while (0 < m);
								for (s = p; 0 !== s; s--) for (n = e.bl_count[s]; 0 !== n;) u < (i = e.heap[--r]) || (h[2 * i + 1] !== s && (e.opt_len += (s - h[2 * i + 1]) * h[2 * i], h[2 * i + 1] = s), n--);
							}
						}(e, t), Z(s, u, e.bl_count);
					}
					function X(e, t, r) {
						var n, i, s = -1, a = t[1], o = 0, h = 7, u = 4;
						for (0 === a && (h = 138, u = 3), t[2 * (r + 1) + 1] = 65535, n = 0; n <= r; n++) i = a, a = t[2 * (n + 1) + 1], ++o < h && i === a || (o < u ? e.bl_tree[2 * i] += o : 0 !== i ? (i !== s && e.bl_tree[2 * i]++, e.bl_tree[2 * b]++) : o <= 10 ? e.bl_tree[2 * v]++ : e.bl_tree[2 * y]++, s = i, u = (o = 0) === a ? (h = 138, 3) : i === a ? (h = 6, 3) : (h = 7, 4));
					}
					function V(e, t, r) {
						var n, i, s = -1, a = t[1], o = 0, h = 7, u = 4;
						for (0 === a && (h = 138, u = 3), n = 0; n <= r; n++) if (i = a, a = t[2 * (n + 1) + 1], !(++o < h && i === a)) {
							if (o < u) for (; L(e, i, e.bl_tree), 0 != --o;);
							else 0 !== i ? (i !== s && (L(e, i, e.bl_tree), o--), L(e, b, e.bl_tree), P(e, o - 3, 2)) : o <= 10 ? (L(e, v, e.bl_tree), P(e, o - 3, 3)) : (L(e, y, e.bl_tree), P(e, o - 11, 7));
							s = i, u = (o = 0) === a ? (h = 138, 3) : i === a ? (h = 6, 3) : (h = 7, 4);
						}
					}
					n(T);
					var q = !1;
					function J(e, t, r, n) {
						P(e, (s << 1) + (n ? 1 : 0), 3), function(e, t, r, n) {
							M(e), n && (U(e, r), U(e, ~r)), i.arraySet(e.pending_buf, e.window, t, r, e.pending), e.pending += r;
						}(e, t, r, !0);
					}
					r._tr_init = function(e) {
						q || (function() {
							var e, t, r, n, i, s = new Array(g + 1);
							for (n = r = 0; n < a - 1; n++) for (I[n] = r, e = 0; e < 1 << w[n]; e++) A[r++] = n;
							for (A[r - 1] = n, n = i = 0; n < 16; n++) for (T[n] = i, e = 0; e < 1 << k[n]; e++) E[i++] = n;
							for (i >>= 7; n < f; n++) for (T[n] = i << 7, e = 0; e < 1 << k[n] - 7; e++) E[256 + i++] = n;
							for (t = 0; t <= g; t++) s[t] = 0;
							for (e = 0; e <= 143;) z[2 * e + 1] = 8, e++, s[8]++;
							for (; e <= 255;) z[2 * e + 1] = 9, e++, s[9]++;
							for (; e <= 279;) z[2 * e + 1] = 7, e++, s[7]++;
							for (; e <= 287;) z[2 * e + 1] = 8, e++, s[8]++;
							for (Z(z, l + 1, s), e = 0; e < f; e++) C[2 * e + 1] = 5, C[2 * e] = j(e, 5);
							O = new D(z, w, u + 1, l, g), B = new D(C, k, 0, f, g), R = new D(new Array(0), x, 0, c, p);
						}(), q = !0), e.l_desc = new F(e.dyn_ltree, O), e.d_desc = new F(e.dyn_dtree, B), e.bl_desc = new F(e.bl_tree, R), e.bi_buf = 0, e.bi_valid = 0, W(e);
					}, r._tr_stored_block = J, r._tr_flush_block = function(e, t, r, n) {
						var i, s, a = 0;
						0 < e.level ? (2 === e.strm.data_type && (e.strm.data_type = function(e) {
							var t, r = 4093624447;
							for (t = 0; t <= 31; t++, r >>>= 1) if (1 & r && 0 !== e.dyn_ltree[2 * t]) return o;
							if (0 !== e.dyn_ltree[18] || 0 !== e.dyn_ltree[20] || 0 !== e.dyn_ltree[26]) return h;
							for (t = 32; t < u; t++) if (0 !== e.dyn_ltree[2 * t]) return h;
							return o;
						}(e)), Y(e, e.l_desc), Y(e, e.d_desc), a = function(e) {
							var t;
							for (X(e, e.dyn_ltree, e.l_desc.max_code), X(e, e.dyn_dtree, e.d_desc.max_code), Y(e, e.bl_desc), t = c - 1; 3 <= t && 0 === e.bl_tree[2 * S[t] + 1]; t--);
							return e.opt_len += 3 * (t + 1) + 5 + 5 + 4, t;
						}(e), i = e.opt_len + 3 + 7 >>> 3, (s = e.static_len + 3 + 7 >>> 3) <= i && (i = s)) : i = s = r + 5, r + 4 <= i && -1 !== t ? J(e, t, r, n) : 4 === e.strategy || s === i ? (P(e, 2 + (n ? 1 : 0), 3), K(e, z, C)) : (P(e, 4 + (n ? 1 : 0), 3), function(e, t, r, n) {
							var i;
							for (P(e, t - 257, 5), P(e, r - 1, 5), P(e, n - 4, 4), i = 0; i < n; i++) P(e, e.bl_tree[2 * S[i] + 1], 3);
							V(e, e.dyn_ltree, t - 1), V(e, e.dyn_dtree, r - 1);
						}(e, e.l_desc.max_code + 1, e.d_desc.max_code + 1, a + 1), K(e, e.dyn_ltree, e.dyn_dtree)), W(e), n && M(e);
					}, r._tr_tally = function(e, t, r) {
						return e.pending_buf[e.d_buf + 2 * e.last_lit] = t >>> 8 & 255, e.pending_buf[e.d_buf + 2 * e.last_lit + 1] = 255 & t, e.pending_buf[e.l_buf + e.last_lit] = 255 & r, e.last_lit++, 0 === t ? e.dyn_ltree[2 * r]++ : (e.matches++, t--, e.dyn_ltree[2 * (A[r] + u + 1)]++, e.dyn_dtree[2 * N(t)]++), e.last_lit === e.lit_bufsize - 1;
					}, r._tr_align = function(e) {
						P(e, 2, 3), L(e, m, z), function(e) {
							16 === e.bi_valid ? (U(e, e.bi_buf), e.bi_buf = 0, e.bi_valid = 0) : 8 <= e.bi_valid && (e.pending_buf[e.pending++] = 255 & e.bi_buf, e.bi_buf >>= 8, e.bi_valid -= 8);
						}(e);
					};
				}, { "../utils/common": 41 }],
				53: [function(e, t, r) {
					"use strict";
					t.exports = function() {
						this.input = null, this.next_in = 0, this.avail_in = 0, this.total_in = 0, this.output = null, this.next_out = 0, this.avail_out = 0, this.total_out = 0, this.msg = "", this.state = null, this.data_type = 2, this.adler = 0;
					};
				}, {}],
				54: [function(e, t, r) {
					(function(e) {
						(function(r, n) {
							"use strict";
							if (!r.setImmediate) {
								var i, s, t, a, o = 1, h = {}, u = !1, l = r.document, e = Object.getPrototypeOf && Object.getPrototypeOf(r);
								e = e && e.setTimeout ? e : r, i = "[object process]" === {}.toString.call(r.process) ? function(e) {
									process.nextTick(function() {
										c(e);
									});
								} : function() {
									if (r.postMessage && !r.importScripts) {
										var e = !0, t = r.onmessage;
										return r.onmessage = function() {
											e = !1;
										}, r.postMessage("", "*"), r.onmessage = t, e;
									}
								}() ? (a = "setImmediate$" + Math.random() + "$", r.addEventListener ? r.addEventListener("message", d, !1) : r.attachEvent("onmessage", d), function(e) {
									r.postMessage(a + e, "*");
								}) : r.MessageChannel ? ((t = new MessageChannel()).port1.onmessage = function(e) {
									c(e.data);
								}, function(e) {
									t.port2.postMessage(e);
								}) : l && "onreadystatechange" in l.createElement("script") ? (s = l.documentElement, function(e) {
									var t = l.createElement("script");
									t.onreadystatechange = function() {
										c(e), t.onreadystatechange = null, s.removeChild(t), t = null;
									}, s.appendChild(t);
								}) : function(e) {
									setTimeout(c, 0, e);
								}, e.setImmediate = function(e) {
									"function" != typeof e && (e = new Function("" + e));
									for (var t = new Array(arguments.length - 1), r = 0; r < t.length; r++) t[r] = arguments[r + 1];
									return h[o] = {
										callback: e,
										args: t
									}, i(o), o++;
								}, e.clearImmediate = f;
							}
							function f(e) {
								delete h[e];
							}
							function c(e) {
								if (u) setTimeout(c, 0, e);
								else {
									var t = h[e];
									if (t) {
										u = !0;
										try {
											(function(e) {
												var t = e.callback, r = e.args;
												switch (r.length) {
													case 0:
														t();
														break;
													case 1:
														t(r[0]);
														break;
													case 2:
														t(r[0], r[1]);
														break;
													case 3:
														t(r[0], r[1], r[2]);
														break;
													default: t.apply(n, r);
												}
											})(t);
										} finally {
											f(e), u = !1;
										}
									}
								}
							}
							function d(e) {
								e.source === r && "string" == typeof e.data && 0 === e.data.indexOf(a) && c(+e.data.slice(a.length));
							}
						})("undefined" == typeof self ? void 0 === e ? this : e : self);
					}).call(this, "undefined" != typeof global ? global : "undefined" != typeof self ? self : "undefined" != typeof window ? window : {});
				}, {}]
			}, {}, [10])(10);
		});
	}));
	//#endregion
	//#region node_modules/.pnpm/docx-preview@0.4.0/node_modules/docx-preview/dist/docx-preview.mjs
	var docx_preview_exports = /* @__PURE__ */ __exportAll({
		defaultOptions: () => defaultOptions,
		parseAsync: () => parseAsync,
		renderAsync: () => renderAsync,
		renderDocument: () => renderDocument
	});
	/*
	* @license
	* docx-preview <https://github.com/VolodymyrBaydalka/docxjs>
	* Released under Apache License 2.0  <https://github.com/VolodymyrBaydalka/docxjs/blob/master/LICENSE>
	* Copyright Volodymyr Baydalka
	*/
	function parseRelationships(root, xml) {
		return xml.elements(root).map((e) => ({
			id: xml.attr(e, "Id"),
			type: xml.attr(e, "Type"),
			target: xml.attr(e, "Target"),
			targetMode: xml.attr(e, "TargetMode")
		}));
	}
	function escapeClassName(className) {
		return className?.replace(/[ .]+/g, "-").replace(/[&]+/g, "and").toLowerCase();
	}
	function encloseFontFamily(fontFamily) {
		return /^[^"'].*\s.*[^"']$/.test(fontFamily) ? `'${fontFamily}'` : fontFamily;
	}
	function splitPath(path) {
		let si = path.lastIndexOf("/") + 1;
		return [si == 0 ? "" : path.substring(0, si), si == 0 ? path : path.substring(si)];
	}
	function resolvePath(path, base) {
		try {
			return new URL(path, "http://docx/" + base).toString().substring(12);
		} catch {
			return `${base}${path}`;
		}
	}
	function keyBy(array, by) {
		return array.reduce((a, x) => {
			a[by(x)] = x;
			return a;
		}, {});
	}
	function blobToBase64(blob) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onloadend = () => resolve(reader.result);
			reader.onerror = () => reject();
			reader.readAsDataURL(blob);
		});
	}
	function isObject(item) {
		return item && typeof item === "object" && !Array.isArray(item);
	}
	function isString(item) {
		return typeof item === "string" || item instanceof String;
	}
	function mergeDeep(target, ...sources) {
		if (!sources.length) return target;
		const source = sources.shift();
		if (isObject(target) && isObject(source)) for (const key in source) if (isObject(source[key])) mergeDeep(target[key] ?? (target[key] = {}), source[key]);
		else target[key] = source[key];
		return mergeDeep(target, ...sources);
	}
	function asArray(val) {
		return Array.isArray(val) ? val : [val];
	}
	function clamp(val, min, max) {
		return min > val ? min : max < val ? max : val;
	}
	function convertLength(val, usage = LengthUsage.Dxa) {
		if (val == null || /.+(p[xt]|[%])$/.test(val)) return val;
		var num = parseInt(val) * usage.mul;
		if (usage.min && usage.max) num = clamp(num, usage.min, usage.max);
		return `${num.toFixed(2)}${usage.unit}`;
	}
	function convertBoolean(v, defaultValue = false) {
		switch (v) {
			case "1": return true;
			case "0": return false;
			case "on": return true;
			case "off": return false;
			case "true": return true;
			case "false": return false;
			default: return defaultValue;
		}
	}
	function parseCommonProperty(elem, props, xml) {
		if (elem.namespaceURI != ns$1.wordml) return false;
		switch (elem.localName) {
			case "color":
				props.color = xml.attr(elem, "val");
				break;
			case "sz":
				props.fontSize = xml.lengthAttr(elem, "val", LengthUsage.FontSize);
				break;
			default: return false;
		}
		return true;
	}
	function parseXmlString(xmlString, trimXmlDeclaration = false) {
		if (trimXmlDeclaration) xmlString = xmlString.replace(/<[?].*[?]>/, "");
		xmlString = removeUTF8BOM(xmlString);
		const result = new DOMParser().parseFromString(xmlString, "application/xml");
		const errorText = hasXmlParserError(result);
		if (errorText) throw new Error(errorText);
		return result;
	}
	function hasXmlParserError(doc) {
		return doc.getElementsByTagName("parsererror")[0]?.textContent;
	}
	function removeUTF8BOM(data) {
		return data.charCodeAt(0) === 65279 ? data.substring(1) : data;
	}
	function serializeXmlString(elem) {
		return new XMLSerializer().serializeToString(elem);
	}
	function parseFonts(root, xml) {
		return xml.elements(root).map((el) => parseFont(el, xml));
	}
	function parseFont(elem, xml) {
		let result = {
			name: xml.attr(elem, "name"),
			embedFontRefs: []
		};
		for (let el of xml.elements(elem)) switch (el.localName) {
			case "family":
				result.family = xml.attr(el, "val");
				break;
			case "altName":
				result.altName = xml.attr(el, "val");
				break;
			case "embedRegular":
			case "embedBold":
			case "embedItalic":
			case "embedBoldItalic": result.embedFontRefs.push(parseEmbedFontRef(el, xml));
		}
		return result;
	}
	function parseEmbedFontRef(elem, xml) {
		return {
			id: xml.attr(elem, "id"),
			key: xml.attr(elem, "fontKey"),
			type: embedFontTypeMap[elem.localName]
		};
	}
	function parseContentTypes(root, xml) {
		return xml.elements(root).map((e) => ({
			extension: xml.attr(e, "Extension"),
			partName: xml.attr(e, "PartName"),
			contentType: xml.attr(e, "ContentType")
		}));
	}
	function normalizePath(path) {
		return path.startsWith("/") ? path.substr(1) : path;
	}
	function parseBorder(elem, xml) {
		return {
			type: xml.attr(elem, "val"),
			color: xml.attr(elem, "color"),
			size: xml.lengthAttr(elem, "sz", LengthUsage.Border),
			offset: xml.lengthAttr(elem, "space", LengthUsage.Point),
			frame: xml.boolAttr(elem, "frame"),
			shadow: xml.boolAttr(elem, "shadow")
		};
	}
	function parseBorders(elem, xml) {
		var result = {};
		for (let e of xml.elements(elem)) switch (e.localName) {
			case "left":
				result.left = parseBorder(e, xml);
				break;
			case "top":
				result.top = parseBorder(e, xml);
				break;
			case "right":
				result.right = parseBorder(e, xml);
				break;
			case "bottom": result.bottom = parseBorder(e, xml);
		}
		return result;
	}
	function parseSectionProperties(elem, xml = globalXmlParser) {
		var section = {};
		for (let e of xml.elements(elem)) switch (e.localName) {
			case "pgSz":
				section.pageSize = {
					width: xml.lengthAttr(e, "w"),
					height: xml.lengthAttr(e, "h"),
					orientation: xml.attr(e, "orient")
				};
				break;
			case "type":
				section.type = xml.attr(e, "val");
				break;
			case "pgMar":
				section.pageMargins = {
					left: xml.lengthAttr(e, "left"),
					right: xml.lengthAttr(e, "right"),
					top: xml.lengthAttr(e, "top"),
					bottom: xml.lengthAttr(e, "bottom"),
					header: xml.lengthAttr(e, "header"),
					footer: xml.lengthAttr(e, "footer"),
					gutter: xml.lengthAttr(e, "gutter")
				};
				break;
			case "cols":
				section.columns = parseColumns(e, xml);
				break;
			case "headerReference":
				(section.headerRefs ?? (section.headerRefs = [])).push(parseFooterHeaderReference(e, xml));
				break;
			case "footerReference":
				(section.footerRefs ?? (section.footerRefs = [])).push(parseFooterHeaderReference(e, xml));
				break;
			case "titlePg":
				section.titlePage = xml.boolAttr(e, "val", true);
				break;
			case "pgBorders":
				section.pageBorders = parseBorders(e, xml);
				break;
			case "pgNumType": section.pageNumber = parsePageNumber(e, xml);
		}
		return section;
	}
	function parseColumns(elem, xml) {
		return {
			numberOfColumns: xml.intAttr(elem, "num"),
			space: xml.lengthAttr(elem, "space"),
			separator: xml.boolAttr(elem, "sep"),
			equalWidth: xml.boolAttr(elem, "equalWidth", true),
			columns: xml.elements(elem, "col").map((e) => ({
				width: xml.lengthAttr(e, "w"),
				space: xml.lengthAttr(e, "space")
			}))
		};
	}
	function parsePageNumber(elem, xml) {
		return {
			chapSep: xml.attr(elem, "chapSep"),
			chapStyle: xml.attr(elem, "chapStyle"),
			format: xml.attr(elem, "fmt"),
			start: xml.intAttr(elem, "start")
		};
	}
	function parseFooterHeaderReference(elem, xml) {
		return {
			id: xml.attr(elem, "id"),
			type: xml.attr(elem, "type")
		};
	}
	function parseLineSpacing(elem, xml) {
		return {
			before: xml.lengthAttr(elem, "before"),
			after: xml.lengthAttr(elem, "after"),
			line: xml.intAttr(elem, "line"),
			lineRule: xml.attr(elem, "lineRule")
		};
	}
	function parseRunProperties(elem, xml) {
		let result = {};
		for (let el of xml.elements(elem)) parseRunProperty(el, result, xml);
		return result;
	}
	function parseRunProperty(elem, props, xml) {
		if (parseCommonProperty(elem, props, xml)) return true;
		return false;
	}
	function parseParagraphProperties(elem, xml) {
		let result = {};
		for (let el of xml.elements(elem)) parseParagraphProperty(el, result, xml);
		return result;
	}
	function parseParagraphProperty(elem, props, xml) {
		if (elem.namespaceURI != ns$1.wordml) return false;
		if (parseCommonProperty(elem, props, xml)) return true;
		switch (elem.localName) {
			case "tabs":
				props.tabs = parseTabs(elem, xml);
				break;
			case "sectPr":
				props.sectionProps = parseSectionProperties(elem, xml);
				break;
			case "numPr":
				props.numbering = parseNumbering$1(elem, xml);
				break;
			case "spacing":
				props.lineSpacing = parseLineSpacing(elem, xml);
				return false;
			case "textAlignment":
				props.textAlignment = xml.attr(elem, "val");
				return false;
			case "keepLines":
				props.keepLines = xml.boolAttr(elem, "val", true);
				break;
			case "keepNext":
				props.keepNext = xml.boolAttr(elem, "val", true);
				break;
			case "pageBreakBefore":
				props.pageBreakBefore = xml.boolAttr(elem, "val", true);
				break;
			case "outlineLvl":
				props.outlineLevel = xml.intAttr(elem, "val");
				break;
			case "pStyle":
				props.styleName = xml.attr(elem, "val");
				break;
			case "rPr":
				props.runProps = parseRunProperties(elem, xml);
				break;
			default: return false;
		}
		return true;
	}
	function parseTabs(elem, xml) {
		return xml.elements(elem, "tab").map((e) => ({
			position: xml.lengthAttr(e, "pos"),
			leader: xml.attr(e, "leader"),
			style: xml.attr(e, "val")
		}));
	}
	function parseNumbering$1(elem, xml) {
		var result = {};
		for (let e of xml.elements(elem)) switch (e.localName) {
			case "numId":
				result.id = xml.attr(e, "val");
				break;
			case "ilvl": result.level = xml.intAttr(e, "val");
		}
		return result;
	}
	function parseNumberingPart(elem, xml) {
		let result = {
			numberings: [],
			abstractNumberings: [],
			bulletPictures: []
		};
		for (let e of xml.elements(elem)) switch (e.localName) {
			case "num":
				result.numberings.push(parseNumbering(e, xml));
				break;
			case "abstractNum":
				result.abstractNumberings.push(parseAbstractNumbering(e, xml));
				break;
			case "numPicBullet": result.bulletPictures.push(parseNumberingBulletPicture(e, xml));
		}
		return result;
	}
	function parseNumbering(elem, xml) {
		let result = {
			id: xml.attr(elem, "numId"),
			overrides: []
		};
		for (let e of xml.elements(elem)) switch (e.localName) {
			case "abstractNumId":
				result.abstractId = xml.attr(e, "val");
				break;
			case "lvlOverride": result.overrides.push(parseNumberingLevelOverrride(e, xml));
		}
		return result;
	}
	function parseAbstractNumbering(elem, xml) {
		let result = {
			id: xml.attr(elem, "abstractNumId"),
			levels: []
		};
		for (let e of xml.elements(elem)) switch (e.localName) {
			case "name":
				result.name = xml.attr(e, "val");
				break;
			case "multiLevelType":
				result.multiLevelType = xml.attr(e, "val");
				break;
			case "numStyleLink":
				result.numberingStyleLink = xml.attr(e, "val");
				break;
			case "styleLink":
				result.styleLink = xml.attr(e, "val");
				break;
			case "lvl": result.levels.push(parseNumberingLevel(e, xml));
		}
		return result;
	}
	function parseNumberingLevel(elem, xml) {
		let result = { level: xml.intAttr(elem, "ilvl") };
		for (let e of xml.elements(elem)) switch (e.localName) {
			case "start":
				result.start = xml.attr(e, "val");
				break;
			case "lvlRestart":
				result.restart = xml.intAttr(e, "val");
				break;
			case "numFmt":
				result.format = xml.attr(e, "val");
				break;
			case "lvlText":
				result.text = xml.attr(e, "val");
				break;
			case "lvlJc":
				result.justification = xml.attr(e, "val");
				break;
			case "lvlPicBulletId":
				result.bulletPictureId = xml.attr(e, "val");
				break;
			case "pStyle":
				result.paragraphStyle = xml.attr(e, "val");
				break;
			case "pPr":
				result.paragraphProps = parseParagraphProperties(e, xml);
				break;
			case "rPr": result.runProps = parseRunProperties(e, xml);
		}
		return result;
	}
	function parseNumberingLevelOverrride(elem, xml) {
		let result = { level: xml.intAttr(elem, "ilvl") };
		for (let e of xml.elements(elem)) switch (e.localName) {
			case "startOverride":
				result.start = xml.intAttr(e, "val");
				break;
			case "lvl": result.numberingLevel = parseNumberingLevel(e, xml);
		}
		return result;
	}
	function parseNumberingBulletPicture(elem, xml) {
		var pict = xml.element(elem, "pict");
		var shape = pict && xml.element(pict, "shape");
		var imagedata = shape && xml.element(shape, "imagedata");
		return imagedata ? {
			id: xml.attr(elem, "numPicBulletId"),
			referenceId: xml.attr(imagedata, "id"),
			style: xml.attr(shape, "style")
		} : null;
	}
	function parseExtendedProps(root, xmlParser) {
		const result = {};
		for (let el of xmlParser.elements(root)) switch (el.localName) {
			case "Template":
				result.template = el.textContent;
				break;
			case "Pages":
				result.pages = safeParseToInt(el.textContent);
				break;
			case "Words":
				result.words = safeParseToInt(el.textContent);
				break;
			case "Characters":
				result.characters = safeParseToInt(el.textContent);
				break;
			case "Application":
				result.application = el.textContent;
				break;
			case "Lines":
				result.lines = safeParseToInt(el.textContent);
				break;
			case "Paragraphs":
				result.paragraphs = safeParseToInt(el.textContent);
				break;
			case "Company":
				result.company = el.textContent;
				break;
			case "AppVersion": result.appVersion = el.textContent;
		}
		return result;
	}
	function safeParseToInt(value) {
		if (typeof value === "undefined") return;
		return parseInt(value);
	}
	function parseCoreProps(root, xmlParser) {
		const result = {};
		for (let el of xmlParser.elements(root)) switch (el.localName) {
			case "title":
				result.title = el.textContent;
				break;
			case "description":
				result.description = el.textContent;
				break;
			case "subject":
				result.subject = el.textContent;
				break;
			case "creator":
				result.creator = el.textContent;
				break;
			case "keywords":
				result.keywords = el.textContent;
				break;
			case "language":
				result.language = el.textContent;
				break;
			case "lastModifiedBy":
				result.lastModifiedBy = el.textContent;
				break;
			case "revision": el.textContent && (result.revision = parseInt(el.textContent));
		}
		return result;
	}
	function parseTheme(elem, xml) {
		var result = new DmlTheme();
		var themeElements = xml.element(elem, "themeElements");
		for (let el of xml.elements(themeElements)) switch (el.localName) {
			case "clrScheme":
				result.colorScheme = parseColorScheme(el, xml);
				break;
			case "fontScheme": result.fontScheme = parseFontScheme(el, xml);
		}
		return result;
	}
	function parseColorScheme(elem, xml) {
		var result = {
			name: xml.attr(elem, "name"),
			colors: {}
		};
		for (let el of xml.elements(elem)) {
			var srgbClr = xml.element(el, "srgbClr");
			var sysClr = xml.element(el, "sysClr");
			if (srgbClr) result.colors[el.localName] = xml.attr(srgbClr, "val");
			else if (sysClr) result.colors[el.localName] = xml.attr(sysClr, "lastClr");
		}
		return result;
	}
	function parseFontScheme(elem, xml) {
		var result = { name: xml.attr(elem, "name") };
		for (let el of xml.elements(elem)) switch (el.localName) {
			case "majorFont":
				result.majorFont = parseFontInfo(el, xml);
				break;
			case "minorFont": result.minorFont = parseFontInfo(el, xml);
		}
		return result;
	}
	function parseFontInfo(elem, xml) {
		return {
			latinTypeface: xml.elementAttr(elem, "latin", "typeface"),
			eaTypeface: xml.elementAttr(elem, "ea", "typeface"),
			csTypeface: xml.elementAttr(elem, "cs", "typeface")
		};
	}
	function parseSettings(elem, xml) {
		var result = {};
		for (let el of xml.elements(elem)) switch (el.localName) {
			case "defaultTabStop":
				result.defaultTabStop = xml.lengthAttr(el, "val");
				break;
			case "footnotePr":
				result.footnoteProps = parseNoteProperties(el, xml);
				break;
			case "endnotePr":
				result.endnoteProps = parseNoteProperties(el, xml);
				break;
			case "autoHyphenation": result.autoHyphenation = xml.boolAttr(el, "val");
		}
		return result;
	}
	function parseNoteProperties(elem, xml) {
		var result = { defaultNoteIds: [] };
		for (let el of xml.elements(elem)) switch (el.localName) {
			case "numFmt":
				result.nummeringFormat = xml.attr(el, "val");
				break;
			case "footnote":
			case "endnote": result.defaultNoteIds.push(xml.attr(el, "id"));
		}
		return result;
	}
	function parseCustomProps(root, xml) {
		return xml.elements(root, "property").map((e) => {
			const firstChild = e.firstChild;
			return {
				formatId: xml.attr(e, "fmtid"),
				name: xml.attr(e, "name"),
				type: firstChild.nodeName,
				value: firstChild.textContent
			};
		});
	}
	function deobfuscate(data, guidKey) {
		const len = 16;
		const trimmed = guidKey.replace(/{|}|-/g, "");
		const numbers = new Array(len);
		for (let i = 0; i < len; i++) numbers[len - i - 1] = parseInt(trimmed.substring(i * 2, i * 2 + 2), 16);
		for (let i = 0; i < 32; i++) data[i] = data[i] ^ numbers[i % len];
		return data;
	}
	function parseBookmarkStart(elem, xml) {
		return {
			type: DomType.BookmarkStart,
			id: xml.attr(elem, "id"),
			name: xml.attr(elem, "name"),
			colFirst: xml.intAttr(elem, "colFirst"),
			colLast: xml.intAttr(elem, "colLast")
		};
	}
	function parseBookmarkEnd(elem, xml) {
		return {
			type: DomType.BookmarkEnd,
			id: xml.attr(elem, "id")
		};
	}
	function parseVmlElement(elem, parser) {
		var result = new VmlElement();
		switch (elem.localName) {
			case "rect":
				result.tagName = "rect";
				Object.assign(result.attrs, {
					width: "100%",
					height: "100%"
				});
				break;
			case "oval":
				result.tagName = "ellipse";
				Object.assign(result.attrs, {
					cx: "50%",
					cy: "50%",
					rx: "50%",
					ry: "50%"
				});
				break;
			case "line":
				result.tagName = "line";
				break;
			case "shape":
				result.tagName = "g";
				break;
			case "textbox":
				result.tagName = "foreignObject";
				Object.assign(result.attrs, {
					width: "100%",
					height: "100%"
				});
				break;
			default: return null;
		}
		for (const at of globalXmlParser.attrs(elem)) switch (at.localName) {
			case "style":
				result.cssStyleText = at.value;
				break;
			case "fillcolor":
				result.attrs.fill = at.value;
				break;
			case "from":
				const [x1, y1] = parsePoint(at.value);
				Object.assign(result.attrs, {
					x1,
					y1
				});
				break;
			case "to":
				const [x2, y2] = parsePoint(at.value);
				Object.assign(result.attrs, {
					x2,
					y2
				});
		}
		for (const el of globalXmlParser.elements(elem)) switch (el.localName) {
			case "stroke":
				Object.assign(result.attrs, parseStroke(el));
				break;
			case "fill":
				Object.assign(result.attrs, parseFill());
				break;
			case "imagedata":
				result.tagName = "image";
				Object.assign(result.attrs, {
					width: "100%",
					height: "100%"
				});
				result.imageHref = {
					id: globalXmlParser.attr(el, "id"),
					title: globalXmlParser.attr(el, "title")
				};
				break;
			case "txbxContent":
				result.children.push(...parser.parseBodyElements(el));
				break;
			default:
				const child = parseVmlElement(el, parser);
				child && result.children.push(child);
		}
		return result;
	}
	function parseStroke(el) {
		return {
			"stroke": globalXmlParser.attr(el, "color"),
			"stroke-width": globalXmlParser.lengthAttr(el, "weight", LengthUsage.Emu) ?? "1px"
		};
	}
	function parseFill(el) {
		return {};
	}
	function parsePoint(val) {
		return val.split(",");
	}
	function computePixelToPoint(container = document.body) {
		const temp = document.createElement("div");
		temp.style.width = "100pt";
		container.appendChild(temp);
		const result = 100 / temp.offsetWidth;
		container.removeChild(temp);
		return result;
	}
	function updateTabStop(elem, tabs, defaultTabSize, pixelToPoint = 72 / 96) {
		const p = elem.closest("p");
		const ebb = elem.getBoundingClientRect();
		const pbb = p.getBoundingClientRect();
		const pcs = getComputedStyle(p);
		const tabStops = tabs?.length > 0 ? tabs.map((t) => ({
			pos: lengthToPoint(t.position),
			leader: t.leader,
			style: t.style
		})).sort((a, b) => a.pos - b.pos) : [defaultTab];
		const lastTab = tabStops[tabStops.length - 1];
		const pWidthPt = pbb.width * pixelToPoint;
		const size = lengthToPoint(defaultTabSize);
		let pos = lastTab.pos + size;
		if (pos < pWidthPt) for (; pos < pWidthPt && tabStops.length < maxTabs; pos += size) tabStops.push({
			...defaultTab,
			pos
		});
		const marginLeft = parseFloat(pcs.marginLeft);
		const pOffset = pbb.left + marginLeft;
		const left = (ebb.left - pOffset) * pixelToPoint;
		const tab = tabStops.find((t) => t.style != "clear" && t.pos > left);
		if (tab == null) return;
		let width = 1;
		if (tab.style == "right" || tab.style == "center") {
			const tabStops = Array.from(p.querySelectorAll(`.${elem.className}`));
			const nextIdx = tabStops.indexOf(elem) + 1;
			const range = document.createRange();
			range.setStart(elem, 1);
			if (nextIdx < tabStops.length) range.setEndBefore(tabStops[nextIdx]);
			else range.setEndAfter(p);
			const mul = tab.style == "center" ? .5 : 1;
			const nextBB = range.getBoundingClientRect();
			const offset = nextBB.left + mul * nextBB.width - (pbb.left - marginLeft);
			width = tab.pos - offset * pixelToPoint;
		} else width = tab.pos - left;
		elem.innerHTML = "&nbsp;";
		elem.style.textDecoration = "inherit";
		elem.style.wordSpacing = `${width.toFixed(0)}pt`;
		switch (tab.leader) {
			case "dot":
			case "middleDot":
				elem.style.textDecoration = "underline";
				elem.style.textDecorationStyle = "dotted";
				break;
			case "hyphen":
			case "heavy":
			case "underscore": elem.style.textDecoration = "underline";
		}
	}
	function lengthToPoint(length) {
		return parseFloat(length);
	}
	function h(elem) {
		if (isString(elem)) return document.createTextNode(elem);
		if (elem instanceof Node) return elem;
		const { ns, tagName, className, style, children, ...props } = elem;
		if (tagName === "#fragment") return document.createDocumentFragment();
		if (tagName === "#comment") return document.createComment(children[0]);
		const result = ns ? document.createElementNS(ns, tagName) : document.createElement(tagName);
		if (className) result.setAttribute("class", className);
		if (style) {
			if (isString(style)) result.setAttribute("style", style);
			else Object.assign(result.style, style);
		}
		if (props) {
			for (const [key, value] of Object.entries(props)) if (value !== void 0) result[key] = value;
		}
		if (children) children.forEach((c) => result.appendChild(h(c)));
		return result;
	}
	function cx(...classNames) {
		return classNames.filter(Boolean).join(" ");
	}
	function findParent(elem, type) {
		var parent = elem.parent;
		while (parent != null && parent.type != type) parent = parent.parent;
		return parent;
	}
	function parseAsync(data, userOptions) {
		const ops = {
			...defaultOptions,
			...userOptions
		};
		return WordDocument.load(data, new DocumentParser(ops), ops);
	}
	async function renderDocument(document, userOptions) {
		const ops = {
			...defaultOptions,
			...userOptions
		};
		return await new HtmlRenderer().render(document, ops);
	}
	async function renderAsync(data, bodyContainer, styleContainer, userOptions) {
		const doc = await parseAsync(data, userOptions);
		const nodes = await renderDocument(doc, userOptions);
		styleContainer ?? (styleContainer = bodyContainer);
		styleContainer.innerHTML = "";
		bodyContainer.innerHTML = "";
		for (let n of nodes) (n.nodeName === "STYLE" ? styleContainer : bodyContainer).appendChild(n);
		return doc;
	}
	var import_jszip_min, RelationshipTypes, ns$1, LengthUsage, XmlParser, globalXmlParser, Part, embedFontTypeMap, FontTablePart, OpenXmlPackage, DocumentPart, SectionType, NumberingPart, StylesPart, DomType, OpenXmlElementBase, WmlHeader, WmlFooter, BaseHeaderFooterPart, HeaderPart, FooterPart, ExtendedPropsPart, CorePropsPart, DmlTheme, ThemePart, WmlBaseNote, WmlFootnote, WmlEndnote, BaseNotePart, FootnotesPart, EndnotesPart, SettingsPart, CustomPropsPart, CommentsPart, CommentsExtendedPart, topLevelRels, WordDocument, VmlElement, WmlComment, WmlCommentReference, WmlCommentRangeStart, WmlCommentRangeEnd, autos, supportedNamespaceURIs, mmlTagMap, DocumentParser, knownColors, xmlUtil, values, defaultTab, maxTabs, ns, HtmlRenderer, defaultOptions;
	var init_docx_preview = __esmMin((() => {
		import_jszip_min = /* @__PURE__ */ __toESM(require_jszip_min(), 1);
		(function(RelationshipTypes) {
			RelationshipTypes["OfficeDocument"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
			RelationshipTypes["FontTable"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable";
			RelationshipTypes["Image"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
			RelationshipTypes["Numbering"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering";
			RelationshipTypes["Styles"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
			RelationshipTypes["StylesWithEffects"] = "http://schemas.microsoft.com/office/2007/relationships/stylesWithEffects";
			RelationshipTypes["Theme"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme";
			RelationshipTypes["Settings"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings";
			RelationshipTypes["WebSettings"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings";
			RelationshipTypes["Hyperlink"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";
			RelationshipTypes["Footnotes"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes";
			RelationshipTypes["Endnotes"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes";
			RelationshipTypes["Footer"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer";
			RelationshipTypes["Header"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header";
			RelationshipTypes["ExtendedProperties"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties";
			RelationshipTypes["CoreProperties"] = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";
			RelationshipTypes["CustomProperties"] = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/custom-properties";
			RelationshipTypes["Comments"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
			RelationshipTypes["CommentsExtended"] = "http://schemas.microsoft.com/office/2011/relationships/commentsExtended";
			RelationshipTypes["AltChunk"] = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk";
		})(RelationshipTypes || (RelationshipTypes = {}));
		ns$1 = { wordml: "http://schemas.openxmlformats.org/wordprocessingml/2006/main" };
		LengthUsage = {
			Dxa: {
				mul: .05,
				unit: "pt"
			},
			Emu: {
				mul: 1 / 12700,
				unit: "pt"
			},
			FontSize: {
				mul: .5,
				unit: "pt"
			},
			Border: {
				mul: .125,
				unit: "pt",
				min: .25,
				max: 12
			},
			Point: {
				mul: 1,
				unit: "pt"
			},
			Percent: {
				mul: .02,
				unit: "%"
			}
		};
		XmlParser = class {
			elements(elem, localName = null) {
				const result = [];
				for (let i = 0, l = elem.childNodes.length; i < l; i++) {
					let c = elem.childNodes.item(i);
					if (c.nodeType == Node.ELEMENT_NODE && (localName == null || c.localName == localName)) result.push(c);
				}
				return result;
			}
			element(elem, localName) {
				for (let i = 0, l = elem.childNodes.length; i < l; i++) {
					let c = elem.childNodes.item(i);
					if (c.nodeType == 1 && c.localName == localName) return c;
				}
				return null;
			}
			elementAttr(elem, localName, attrLocalName) {
				var el = this.element(elem, localName);
				return el ? this.attr(el, attrLocalName) : void 0;
			}
			attrs(elem) {
				return Array.from(elem.attributes);
			}
			attr(elem, localName) {
				for (let i = 0, l = elem.attributes.length; i < l; i++) {
					let a = elem.attributes.item(i);
					if (a.localName == localName) return a.value;
				}
				return null;
			}
			intAttr(node, attrName, defaultValue = null) {
				var val = this.attr(node, attrName);
				return val ? parseInt(val) : defaultValue;
			}
			hexAttr(node, attrName, defaultValue = null) {
				var val = this.attr(node, attrName);
				return val ? parseInt(val, 16) : defaultValue;
			}
			floatAttr(node, attrName, defaultValue = null) {
				var val = this.attr(node, attrName);
				return val ? parseFloat(val) : defaultValue;
			}
			boolAttr(node, attrName, defaultValue = null) {
				return convertBoolean(this.attr(node, attrName), defaultValue);
			}
			lengthAttr(node, attrName, usage = LengthUsage.Dxa) {
				return convertLength(this.attr(node, attrName), usage);
			}
		};
		globalXmlParser = new XmlParser();
		Part = class {
			constructor(_package, path) {
				this._package = _package;
				this.path = path;
			}
			async load() {
				this.rels = await this._package.loadRelationships(this.path);
				const xmlText = await this._package.load(this.path);
				const xmlDoc = this._package.parseXmlDocument(xmlText);
				if (this._package.options.keepOrigin) this._xmlDocument = xmlDoc;
				this.parseXml(xmlDoc.firstElementChild);
			}
			save() {
				this._package.update(this.path, serializeXmlString(this._xmlDocument));
			}
			parseXml(root) {}
		};
		embedFontTypeMap = {
			embedRegular: "regular",
			embedBold: "bold",
			embedItalic: "italic",
			embedBoldItalic: "boldItalic"
		};
		FontTablePart = class extends Part {
			parseXml(root) {
				this.fonts = parseFonts(root, this._package.xmlParser);
			}
		};
		OpenXmlPackage = class OpenXmlPackage {
			constructor(_zip, options) {
				this._zip = _zip;
				this.options = options;
				this.xmlParser = new XmlParser();
			}
			get(path) {
				const p = normalizePath(path);
				return this._zip.files[p] ?? this._zip.files[p.replace(/\//g, "\\")];
			}
			update(path, content) {
				this._zip.file(path, content);
			}
			static async load(input, options) {
				const zip = await import_jszip_min.default.loadAsync(input);
				return new OpenXmlPackage(zip, options);
			}
			save(type = "blob") {
				return this._zip.generateAsync({ type });
			}
			load(path, type = "string") {
				return this.get(path)?.async(type) ?? Promise.resolve(null);
			}
			async loadRelationships(path = null) {
				let relsPath = `_rels/.rels`;
				if (path != null) {
					const [f, fn] = splitPath(path);
					relsPath = `${f}_rels/${fn}.rels`;
				}
				const txt = await this.load(relsPath);
				return txt ? parseRelationships(this.parseXmlDocument(txt).firstElementChild, this.xmlParser) : null;
			}
			async loadContentTypes() {
				const txt = await this.load("[Content_Types].xml");
				return txt ? parseContentTypes(this.parseXmlDocument(txt).firstElementChild, this.xmlParser) : [];
			}
			parseXmlDocument(txt) {
				return parseXmlString(txt, this.options.trimXmlDeclaration);
			}
		};
		DocumentPart = class extends Part {
			constructor(pkg, path, parser) {
				super(pkg, path);
				this._documentParser = parser;
			}
			parseXml(root) {
				this.body = this._documentParser.parseDocumentFile(root);
			}
		};
		(function(SectionType) {
			SectionType["Continuous"] = "continuous";
			SectionType["NextPage"] = "nextPage";
			SectionType["NextColumn"] = "nextColumn";
			SectionType["EvenPage"] = "evenPage";
			SectionType["OddPage"] = "oddPage";
		})(SectionType || (SectionType = {}));
		NumberingPart = class extends Part {
			constructor(pkg, path, parser) {
				super(pkg, path);
				this._documentParser = parser;
			}
			parseXml(root) {
				Object.assign(this, parseNumberingPart(root, this._package.xmlParser));
				this.domNumberings = this._documentParser.parseNumberingFile(root);
			}
		};
		StylesPart = class extends Part {
			constructor(pkg, path, parser) {
				super(pkg, path);
				this._documentParser = parser;
			}
			parseXml(root) {
				this.styles = this._documentParser.parseStylesFile(root);
			}
		};
		(function(DomType) {
			DomType["Document"] = "document";
			DomType["Paragraph"] = "paragraph";
			DomType["Run"] = "run";
			DomType["Break"] = "break";
			DomType["NoBreakHyphen"] = "noBreakHyphen";
			DomType["Table"] = "table";
			DomType["Row"] = "row";
			DomType["Cell"] = "cell";
			DomType["Hyperlink"] = "hyperlink";
			DomType["SmartTag"] = "smartTag";
			DomType["Drawing"] = "drawing";
			DomType["Image"] = "image";
			DomType["Text"] = "text";
			DomType["Tab"] = "tab";
			DomType["Symbol"] = "symbol";
			DomType["BookmarkStart"] = "bookmarkStart";
			DomType["BookmarkEnd"] = "bookmarkEnd";
			DomType["Footer"] = "footer";
			DomType["Header"] = "header";
			DomType["FootnoteReference"] = "footnoteReference";
			DomType["EndnoteReference"] = "endnoteReference";
			DomType["Footnote"] = "footnote";
			DomType["Endnote"] = "endnote";
			DomType["SimpleField"] = "simpleField";
			DomType["ComplexField"] = "complexField";
			DomType["Instruction"] = "instruction";
			DomType["VmlPicture"] = "vmlPicture";
			DomType["MmlMath"] = "mmlMath";
			DomType["MmlMathParagraph"] = "mmlMathParagraph";
			DomType["MmlFraction"] = "mmlFraction";
			DomType["MmlFunction"] = "mmlFunction";
			DomType["MmlFunctionName"] = "mmlFunctionName";
			DomType["MmlNumerator"] = "mmlNumerator";
			DomType["MmlDenominator"] = "mmlDenominator";
			DomType["MmlRadical"] = "mmlRadical";
			DomType["MmlBase"] = "mmlBase";
			DomType["MmlDegree"] = "mmlDegree";
			DomType["MmlSuperscript"] = "mmlSuperscript";
			DomType["MmlSubscript"] = "mmlSubscript";
			DomType["MmlPreSubSuper"] = "mmlPreSubSuper";
			DomType["MmlSubArgument"] = "mmlSubArgument";
			DomType["MmlSuperArgument"] = "mmlSuperArgument";
			DomType["MmlNary"] = "mmlNary";
			DomType["MmlDelimiter"] = "mmlDelimiter";
			DomType["MmlRun"] = "mmlRun";
			DomType["MmlEquationArray"] = "mmlEquationArray";
			DomType["MmlLimit"] = "mmlLimit";
			DomType["MmlLimitLower"] = "mmlLimitLower";
			DomType["MmlMatrix"] = "mmlMatrix";
			DomType["MmlMatrixRow"] = "mmlMatrixRow";
			DomType["MmlBox"] = "mmlBox";
			DomType["MmlBar"] = "mmlBar";
			DomType["MmlGroupChar"] = "mmlGroupChar";
			DomType["VmlElement"] = "vmlElement";
			DomType["Inserted"] = "inserted";
			DomType["Deleted"] = "deleted";
			DomType["DeletedText"] = "deletedText";
			DomType["Comment"] = "comment";
			DomType["CommentReference"] = "commentReference";
			DomType["CommentRangeStart"] = "commentRangeStart";
			DomType["CommentRangeEnd"] = "commentRangeEnd";
			DomType["AltChunk"] = "altChunk";
		})(DomType || (DomType = {}));
		OpenXmlElementBase = class {
			constructor() {
				this.children = [];
				this.cssStyle = {};
			}
		};
		WmlHeader = class extends OpenXmlElementBase {
			constructor() {
				super(...arguments);
				this.type = DomType.Header;
			}
		};
		WmlFooter = class extends OpenXmlElementBase {
			constructor() {
				super(...arguments);
				this.type = DomType.Footer;
			}
		};
		BaseHeaderFooterPart = class extends Part {
			constructor(pkg, path, parser) {
				super(pkg, path);
				this._documentParser = parser;
			}
			parseXml(root) {
				this.rootElement = this.createRootElement();
				this.rootElement.children = this._documentParser.parseBodyElements(root);
			}
		};
		HeaderPart = class extends BaseHeaderFooterPart {
			createRootElement() {
				return new WmlHeader();
			}
		};
		FooterPart = class extends BaseHeaderFooterPart {
			createRootElement() {
				return new WmlFooter();
			}
		};
		ExtendedPropsPart = class extends Part {
			parseXml(root) {
				this.props = parseExtendedProps(root, this._package.xmlParser);
			}
		};
		CorePropsPart = class extends Part {
			parseXml(root) {
				this.props = parseCoreProps(root, this._package.xmlParser);
			}
		};
		DmlTheme = class {};
		ThemePart = class extends Part {
			constructor(pkg, path) {
				super(pkg, path);
			}
			parseXml(root) {
				this.theme = parseTheme(root, this._package.xmlParser);
			}
		};
		WmlBaseNote = class {};
		WmlFootnote = class extends WmlBaseNote {
			constructor() {
				super(...arguments);
				this.type = DomType.Footnote;
			}
		};
		WmlEndnote = class extends WmlBaseNote {
			constructor() {
				super(...arguments);
				this.type = DomType.Endnote;
			}
		};
		BaseNotePart = class extends Part {
			constructor(pkg, path, parser) {
				super(pkg, path);
				this._documentParser = parser;
			}
		};
		FootnotesPart = class extends BaseNotePart {
			constructor(pkg, path, parser) {
				super(pkg, path, parser);
			}
			parseXml(root) {
				this.notes = this._documentParser.parseNotes(root, "footnote", WmlFootnote);
			}
		};
		EndnotesPart = class extends BaseNotePart {
			constructor(pkg, path, parser) {
				super(pkg, path, parser);
			}
			parseXml(root) {
				this.notes = this._documentParser.parseNotes(root, "endnote", WmlEndnote);
			}
		};
		SettingsPart = class extends Part {
			constructor(pkg, path) {
				super(pkg, path);
			}
			parseXml(root) {
				this.settings = parseSettings(root, this._package.xmlParser);
			}
		};
		CustomPropsPart = class extends Part {
			parseXml(root) {
				this.props = parseCustomProps(root, this._package.xmlParser);
			}
		};
		CommentsPart = class extends Part {
			constructor(pkg, path, parser) {
				super(pkg, path);
				this._documentParser = parser;
			}
			parseXml(root) {
				this.comments = this._documentParser.parseComments(root);
				this.commentMap = keyBy(this.comments, (x) => x.id);
			}
		};
		CommentsExtendedPart = class extends Part {
			constructor(pkg, path) {
				super(pkg, path);
				this.comments = [];
			}
			parseXml(root) {
				const xml = this._package.xmlParser;
				for (let el of xml.elements(root, "commentEx")) this.comments.push({
					paraId: xml.attr(el, "paraId"),
					paraIdParent: xml.attr(el, "paraIdParent"),
					done: xml.boolAttr(el, "done")
				});
				this.commentMap = keyBy(this.comments, (x) => x.paraId);
			}
		};
		topLevelRels = [
			{
				type: RelationshipTypes.OfficeDocument,
				target: "word/document.xml"
			},
			{
				type: RelationshipTypes.ExtendedProperties,
				target: "docProps/app.xml"
			},
			{
				type: RelationshipTypes.CoreProperties,
				target: "docProps/core.xml"
			},
			{
				type: RelationshipTypes.CustomProperties,
				target: "docProps/custom.xml"
			}
		];
		WordDocument = class WordDocument {
			constructor() {
				this.parts = [];
				this.partsMap = {};
				this.contentTypes = [];
			}
			static async load(blob, parser, options) {
				var d = new WordDocument();
				d._options = options;
				d._parser = parser;
				d._package = await OpenXmlPackage.load(blob, options);
				d.rels = await d._package.loadRelationships();
				d.contentTypes = await d._package.loadContentTypes();
				await Promise.all(topLevelRels.map((rel) => {
					const r = d.rels.find((x) => x.type === rel.type) ?? rel;
					return d.loadRelationshipPart(r.target, r.type);
				}));
				return d;
			}
			save(type = "blob") {
				return this._package.save(type);
			}
			async loadRelationshipPart(path, type) {
				if (this.partsMap[path]) return this.partsMap[path];
				if (!this._package.get(path)) return null;
				let part = null;
				switch (type) {
					case RelationshipTypes.OfficeDocument:
						this.documentPart = part = new DocumentPart(this._package, path, this._parser);
						break;
					case RelationshipTypes.FontTable:
						this.fontTablePart = part = new FontTablePart(this._package, path);
						break;
					case RelationshipTypes.Numbering:
						this.numberingPart = part = new NumberingPart(this._package, path, this._parser);
						break;
					case RelationshipTypes.Styles:
						this.stylesPart = part = new StylesPart(this._package, path, this._parser);
						break;
					case RelationshipTypes.Theme:
						this.themePart = part = new ThemePart(this._package, path);
						break;
					case RelationshipTypes.Footnotes:
						this.footnotesPart = part = new FootnotesPart(this._package, path, this._parser);
						break;
					case RelationshipTypes.Endnotes:
						this.endnotesPart = part = new EndnotesPart(this._package, path, this._parser);
						break;
					case RelationshipTypes.Footer:
						part = new FooterPart(this._package, path, this._parser);
						break;
					case RelationshipTypes.Header:
						part = new HeaderPart(this._package, path, this._parser);
						break;
					case RelationshipTypes.CoreProperties:
						this.corePropsPart = part = new CorePropsPart(this._package, path);
						break;
					case RelationshipTypes.ExtendedProperties:
						this.extendedPropsPart = part = new ExtendedPropsPart(this._package, path);
						break;
					case RelationshipTypes.CustomProperties:
						part = new CustomPropsPart(this._package, path);
						break;
					case RelationshipTypes.Settings:
						this.settingsPart = part = new SettingsPart(this._package, path);
						break;
					case RelationshipTypes.Comments:
						this.commentsPart = part = new CommentsPart(this._package, path, this._parser);
						break;
					case RelationshipTypes.CommentsExtended: this.commentsExtendedPart = part = new CommentsExtendedPart(this._package, path);
				}
				if (part == null) return Promise.resolve(null);
				this.partsMap[path] = part;
				this.parts.push(part);
				await part.load();
				if (part.rels?.length > 0) {
					const [folder] = splitPath(part.path);
					await Promise.all(part.rels.map((rel) => this.loadRelationshipPart(resolvePath(rel.target, folder), rel.type)));
				}
				return part;
			}
			async loadDocumentImage(id, part) {
				const path = this.getPathById(part ?? this.documentPart, id);
				return path ? this.blobToURL(await this._package.load(path, "blob"), path) : null;
			}
			async loadNumberingImage(id) {
				const path = this.getPathById(this.numberingPart, id);
				return path ? this.blobToURL(await this._package.load(path, "blob"), path) : null;
			}
			async loadFont(id, key) {
				const path = this.getPathById(this.fontTablePart, id);
				if (!path) return null;
				const x = await this._package.load(path, "uint8array");
				return x ? this.blobToURL(new Blob([deobfuscate(x, key)]), path) : x;
			}
			async loadAltChunk(id, part) {
				const path = this.getPathById(part ?? this.documentPart, id);
				return path ? this._package.load(path, "string") : Promise.resolve(null);
			}
			blobToURL(blob, path) {
				if (!blob) return null;
				if (path) {
					const ct = this.contentTypes.find((x) => x.partName === path || x.extension && path.endsWith(`.${x.extension}`));
					blob = ct ? new Blob([blob], { type: ct.contentType }) : blob;
				}
				if (this._options.useBase64URL) return blobToBase64(blob);
				return URL.createObjectURL(blob);
			}
			findPartByRelId(id, basePart = null) {
				var rel = (basePart.rels ?? this.rels).find((r) => r.id == id);
				const folder = basePart ? splitPath(basePart.path)[0] : "";
				return rel ? this.partsMap[resolvePath(rel.target, folder)] : null;
			}
			getPathById(part, id) {
				const rel = part.rels.find((x) => x.id == id);
				const [folder] = splitPath(part.path);
				return rel ? resolvePath(rel.target, folder) : null;
			}
		};
		VmlElement = class extends OpenXmlElementBase {
			constructor() {
				super(...arguments);
				this.type = DomType.VmlElement;
				this.attrs = {};
			}
		};
		WmlComment = class extends OpenXmlElementBase {
			constructor() {
				super(...arguments);
				this.type = DomType.Comment;
			}
		};
		WmlCommentReference = class extends OpenXmlElementBase {
			constructor(id) {
				super();
				this.id = id;
				this.type = DomType.CommentReference;
			}
		};
		WmlCommentRangeStart = class extends OpenXmlElementBase {
			constructor(id) {
				super();
				this.id = id;
				this.type = DomType.CommentRangeStart;
			}
		};
		WmlCommentRangeEnd = class extends OpenXmlElementBase {
			constructor(id) {
				super();
				this.id = id;
				this.type = DomType.CommentRangeEnd;
			}
		};
		autos = {
			shd: "inherit",
			color: "black",
			borderColor: "black",
			highlight: "transparent"
		};
		supportedNamespaceURIs = [];
		mmlTagMap = {
			"oMath": DomType.MmlMath,
			"oMathPara": DomType.MmlMathParagraph,
			"f": DomType.MmlFraction,
			"func": DomType.MmlFunction,
			"fName": DomType.MmlFunctionName,
			"num": DomType.MmlNumerator,
			"den": DomType.MmlDenominator,
			"rad": DomType.MmlRadical,
			"deg": DomType.MmlDegree,
			"e": DomType.MmlBase,
			"sSup": DomType.MmlSuperscript,
			"sSub": DomType.MmlSubscript,
			"sPre": DomType.MmlPreSubSuper,
			"sup": DomType.MmlSuperArgument,
			"sub": DomType.MmlSubArgument,
			"d": DomType.MmlDelimiter,
			"nary": DomType.MmlNary,
			"eqArr": DomType.MmlEquationArray,
			"lim": DomType.MmlLimit,
			"limLow": DomType.MmlLimitLower,
			"m": DomType.MmlMatrix,
			"mr": DomType.MmlMatrixRow,
			"box": DomType.MmlBox,
			"bar": DomType.MmlBar,
			"groupChr": DomType.MmlGroupChar
		};
		DocumentParser = class {
			constructor(options) {
				this.options = {
					ignoreWidth: false,
					debug: false,
					...options
				};
			}
			parseNotes(xmlDoc, elemName, elemClass) {
				var result = [];
				for (let el of globalXmlParser.elements(xmlDoc, elemName)) {
					const node = new elemClass();
					node.id = globalXmlParser.attr(el, "id");
					node.noteType = globalXmlParser.attr(el, "type");
					node.children = this.parseBodyElements(el);
					result.push(node);
				}
				return result;
			}
			parseComments(xmlDoc) {
				var result = [];
				for (let el of globalXmlParser.elements(xmlDoc, "comment")) {
					const item = new WmlComment();
					item.id = globalXmlParser.attr(el, "id");
					item.author = globalXmlParser.attr(el, "author");
					item.initials = globalXmlParser.attr(el, "initials");
					item.date = globalXmlParser.attr(el, "date");
					item.children = this.parseBodyElements(el);
					result.push(item);
				}
				return result;
			}
			parseDocumentFile(xmlDoc) {
				var xbody = globalXmlParser.element(xmlDoc, "body");
				var background = globalXmlParser.element(xmlDoc, "background");
				var sectPr = globalXmlParser.element(xbody, "sectPr");
				return {
					type: DomType.Document,
					children: this.parseBodyElements(xbody),
					props: sectPr ? parseSectionProperties(sectPr, globalXmlParser) : {},
					cssStyle: background ? this.parseBackground(background) : {}
				};
			}
			parseBackground(elem) {
				var result = {};
				var color = xmlUtil.colorAttr(elem, "color");
				if (color) result["background-color"] = color;
				return result;
			}
			parseBodyElements(element) {
				var children = [];
				for (const elem of globalXmlParser.elements(element)) switch (elem.localName) {
					case "p":
						children.push(this.parseParagraph(elem));
						break;
					case "altChunk":
						children.push(this.parseAltChunk(elem));
						break;
					case "tbl":
						children.push(this.parseTable(elem));
						break;
					case "sdt": children.push(...this.parseSdt(elem, (e) => this.parseBodyElements(e)));
				}
				return children;
			}
			parseStylesFile(xstyles) {
				var result = [];
				for (const n of globalXmlParser.elements(xstyles)) switch (n.localName) {
					case "style":
						result.push(this.parseStyle(n));
						break;
					case "docDefaults": result.push(this.parseDefaultStyles(n));
				}
				return result;
			}
			parseDefaultStyles(node) {
				var result = {
					id: null,
					name: null,
					target: null,
					basedOn: null,
					styles: []
				};
				for (const c of globalXmlParser.elements(node)) switch (c.localName) {
					case "rPrDefault":
						var rPr = globalXmlParser.element(c, "rPr");
						if (rPr) result.styles.push({
							target: "span",
							values: this.parseDefaultProperties(rPr, {})
						});
						break;
					case "pPrDefault":
						var pPr = globalXmlParser.element(c, "pPr");
						if (pPr) result.styles.push({
							target: "p",
							values: this.parseDefaultProperties(pPr, {})
						});
				}
				return result;
			}
			parseStyle(node) {
				var result = {
					id: globalXmlParser.attr(node, "styleId"),
					isDefault: globalXmlParser.boolAttr(node, "default"),
					name: null,
					target: null,
					basedOn: null,
					styles: [],
					linked: null
				};
				switch (globalXmlParser.attr(node, "type")) {
					case "paragraph":
						result.target = "p";
						break;
					case "table":
						result.target = "table";
						break;
					case "character": result.target = "span";
				}
				for (const n of globalXmlParser.elements(node)) switch (n.localName) {
					case "basedOn":
						result.basedOn = globalXmlParser.attr(n, "val");
						break;
					case "name":
						result.name = globalXmlParser.attr(n, "val");
						break;
					case "link":
						result.linked = globalXmlParser.attr(n, "val");
						break;
					case "next":
						result.next = globalXmlParser.attr(n, "val");
						break;
					case "aliases":
						result.aliases = globalXmlParser.attr(n, "val").split(",");
						break;
					case "pPr":
						result.styles.push({
							target: "p",
							values: this.parseDefaultProperties(n, {})
						});
						result.paragraphProps = parseParagraphProperties(n, globalXmlParser);
						break;
					case "rPr":
						result.styles.push({
							target: "span",
							values: this.parseDefaultProperties(n, {})
						});
						result.runProps = parseRunProperties(n, globalXmlParser);
						break;
					case "tblPr":
					case "tcPr":
						result.styles.push({
							target: "td",
							values: this.parseDefaultProperties(n, {})
						});
						break;
					case "tblStylePr":
						for (let s of this.parseTableStyle(n)) result.styles.push(s);
						break;
					case "rsid":
					case "qFormat":
					case "hidden":
					case "semiHidden":
					case "unhideWhenUsed":
					case "autoRedefine":
					case "uiPriority": break;
					default: this.options.debug && console.warn(`DOCX: Unknown style element: ${n.localName}`);
				}
				return result;
			}
			parseTableStyle(node) {
				var result = [];
				var type = globalXmlParser.attr(node, "type");
				var selector = "";
				var modificator = "";
				switch (type) {
					case "firstRow":
						modificator = ".first-row";
						selector = "tr.first-row td";
						break;
					case "lastRow":
						modificator = ".last-row";
						selector = "tr.last-row td";
						break;
					case "firstCol":
						modificator = ".first-col";
						selector = "td.first-col";
						break;
					case "lastCol":
						modificator = ".last-col";
						selector = "td.last-col";
						break;
					case "band1Vert":
						modificator = ":not(.no-vband)";
						selector = "td.odd-col";
						break;
					case "band2Vert":
						modificator = ":not(.no-vband)";
						selector = "td.even-col";
						break;
					case "band1Horz":
						modificator = ":not(.no-hband)";
						selector = "tr.odd-row";
						break;
					case "band2Horz":
						modificator = ":not(.no-hband)";
						selector = "tr.even-row";
						break;
					default: return [];
				}
				for (const n of globalXmlParser.elements(node)) switch (n.localName) {
					case "pPr":
						result.push({
							target: `${selector} p`,
							mod: modificator,
							values: this.parseDefaultProperties(n, {})
						});
						break;
					case "rPr":
						result.push({
							target: `${selector} span`,
							mod: modificator,
							values: this.parseDefaultProperties(n, {})
						});
						break;
					case "tblPr":
					case "tcPr": result.push({
						target: selector,
						mod: modificator,
						values: this.parseDefaultProperties(n, {})
					});
				}
				return result;
			}
			parseNumberingFile(node) {
				const levels = [];
				const nums = [];
				const bullets = [];
				for (const n of globalXmlParser.elements(node)) switch (n.localName) {
					case "abstractNum":
						levels.push(...this.parseAbstractNumbering(n, bullets));
						break;
					case "numPicBullet":
						bullets.push(this.parseNumberingPicBullet(n));
						break;
					case "num": nums.push({
						numId: globalXmlParser.attr(n, "numId"),
						abstractNumId: globalXmlParser.elementAttr(n, "abstractNumId", "val")
					});
				}
				return nums.flatMap((x) => levels.filter((lvl) => x.abstractNumId == lvl.id).map((lvl) => ({
					...lvl,
					id: x.numId
				})));
			}
			parseNumberingPicBullet(elem) {
				var pict = globalXmlParser.element(elem, "pict");
				var shape = pict && globalXmlParser.element(pict, "shape");
				var imagedata = shape && globalXmlParser.element(shape, "imagedata");
				return imagedata ? {
					id: globalXmlParser.intAttr(elem, "numPicBulletId"),
					src: globalXmlParser.attr(imagedata, "id"),
					style: globalXmlParser.attr(shape, "style")
				} : null;
			}
			parseAbstractNumbering(node, bullets) {
				var result = [];
				var id = globalXmlParser.attr(node, "abstractNumId");
				for (const n of globalXmlParser.elements(node)) switch (n.localName) {
					case "lvl": result.push(this.parseNumberingLevel(id, n, bullets));
				}
				return result;
			}
			parseNumberingLevel(id, node, bullets) {
				var result = {
					id,
					level: globalXmlParser.intAttr(node, "ilvl"),
					start: 1,
					pStyleName: void 0,
					pStyle: {},
					rStyle: {},
					suff: "tab"
				};
				for (const n of globalXmlParser.elements(node)) switch (n.localName) {
					case "start":
						result.start = globalXmlParser.intAttr(n, "val");
						break;
					case "pPr":
						this.parseDefaultProperties(n, result.pStyle);
						break;
					case "rPr":
						this.parseDefaultProperties(n, result.rStyle);
						break;
					case "lvlPicBulletId":
						var bulletId = globalXmlParser.intAttr(n, "val");
						result.bullet = bullets.find((x) => x?.id == bulletId);
						break;
					case "lvlText":
						result.levelText = globalXmlParser.attr(n, "val");
						break;
					case "pStyle":
						result.pStyleName = globalXmlParser.attr(n, "val");
						break;
					case "numFmt":
						result.format = globalXmlParser.attr(n, "val");
						break;
					case "suff": result.suff = globalXmlParser.attr(n, "val");
				}
				return result;
			}
			parseSdt(node, parser) {
				const sdtContent = globalXmlParser.element(node, "sdtContent");
				return sdtContent ? parser(sdtContent) : [];
			}
			parseChange(type, node, parentParser) {
				return {
					type,
					children: parentParser(node)?.children ?? [],
					id: globalXmlParser.attr(node, "id"),
					author: globalXmlParser.attr(node, "author"),
					date: globalXmlParser.attr(node, "date")
				};
			}
			parseAltChunk(node) {
				return {
					type: DomType.AltChunk,
					children: [],
					id: globalXmlParser.attr(node, "id")
				};
			}
			parseParagraph(node) {
				var result = {
					type: DomType.Paragraph,
					children: []
				};
				for (let el of globalXmlParser.elements(node)) switch (el.localName) {
					case "pPr":
						this.parseParagraphProperties(el, result);
						break;
					case "r":
						result.children.push(this.parseRun(el, result));
						break;
					case "hyperlink":
						result.children.push(this.parseHyperlink(el, result));
						break;
					case "smartTag":
						result.children.push(this.parseSmartTag(el, result));
						break;
					case "bookmarkStart":
						result.children.push(parseBookmarkStart(el, globalXmlParser));
						break;
					case "bookmarkEnd":
						result.children.push(parseBookmarkEnd(el, globalXmlParser));
						break;
					case "commentRangeStart":
						result.children.push(new WmlCommentRangeStart(globalXmlParser.attr(el, "id")));
						break;
					case "commentRangeEnd":
						result.children.push(new WmlCommentRangeEnd(globalXmlParser.attr(el, "id")));
						break;
					case "oMath":
					case "oMathPara":
						result.children.push(this.parseMathElement(el));
						break;
					case "sdt":
						result.children.push(...this.parseSdt(el, (e) => this.parseParagraph(e).children));
						break;
					case "ins":
						result.children.push(this.parseChange(DomType.Inserted, el, (e) => this.parseParagraph(e)));
						break;
					case "del": result.children.push(this.parseChange(DomType.Deleted, el, (e) => this.parseParagraph(e)));
				}
				return result;
			}
			parseParagraphProperties(elem, paragraph) {
				this.parseDefaultProperties(elem, paragraph.cssStyle = {}, null, (c) => {
					if (parseParagraphProperty(c, paragraph, globalXmlParser)) return true;
					switch (c.localName) {
						case "pStyle":
							paragraph.styleName = globalXmlParser.attr(c, "val");
							break;
						case "cnfStyle":
							paragraph.className = values.classNameOfCnfStyle(c);
							break;
						case "framePr":
							this.parseFrame(c, paragraph);
							break;
						case "rPr": break;
						default: return false;
					}
					return true;
				});
			}
			parseFrame(node, paragraph) {
				if (globalXmlParser.attr(node, "dropCap") == "drop") paragraph.cssStyle["float"] = "left";
			}
			parseHyperlink(node, parent) {
				var result = {
					type: DomType.Hyperlink,
					parent,
					children: []
				};
				result.anchor = globalXmlParser.attr(node, "anchor");
				result.id = globalXmlParser.attr(node, "id");
				for (const c of globalXmlParser.elements(node)) switch (c.localName) {
					case "r": result.children.push(this.parseRun(c, result));
				}
				return result;
			}
			parseSmartTag(node, parent) {
				var result = {
					type: DomType.SmartTag,
					parent,
					children: []
				};
				var uri = globalXmlParser.attr(node, "uri");
				var element = globalXmlParser.attr(node, "element");
				if (uri) result.uri = uri;
				if (element) result.element = element;
				for (const c of globalXmlParser.elements(node)) switch (c.localName) {
					case "r":
						result.children.push(this.parseRun(c, result));
						break;
					case "smartTag": result.children.push(this.parseSmartTag(c, result));
				}
				return result;
			}
			parseRun(node, parent) {
				var result = {
					type: DomType.Run,
					parent,
					children: []
				};
				for (let c of globalXmlParser.elements(node)) {
					c = this.checkAlternateContent(c);
					switch (c.localName) {
						case "t":
							result.children.push({
								type: DomType.Text,
								text: c.textContent
							});
							break;
						case "delText":
							result.children.push({
								type: DomType.DeletedText,
								text: c.textContent
							});
							break;
						case "commentReference":
							result.children.push(new WmlCommentReference(globalXmlParser.attr(c, "id")));
							break;
						case "fldSimple":
							result.children.push({
								type: DomType.SimpleField,
								instruction: globalXmlParser.attr(c, "instr"),
								lock: globalXmlParser.boolAttr(c, "lock", false),
								dirty: globalXmlParser.boolAttr(c, "dirty", false)
							});
							break;
						case "instrText":
							result.fieldRun = true;
							result.children.push({
								type: DomType.Instruction,
								text: c.textContent
							});
							break;
						case "fldChar":
							result.fieldRun = true;
							result.children.push({
								type: DomType.ComplexField,
								charType: globalXmlParser.attr(c, "fldCharType"),
								lock: globalXmlParser.boolAttr(c, "lock", false),
								dirty: globalXmlParser.boolAttr(c, "dirty", false)
							});
							break;
						case "noBreakHyphen":
							result.children.push({ type: DomType.NoBreakHyphen });
							break;
						case "br":
							result.children.push({
								type: DomType.Break,
								break: globalXmlParser.attr(c, "type") || "textWrapping"
							});
							break;
						case "lastRenderedPageBreak":
							result.children.push({
								type: DomType.Break,
								break: "lastRenderedPageBreak"
							});
							break;
						case "sym":
							result.children.push({
								type: DomType.Symbol,
								font: encloseFontFamily(globalXmlParser.attr(c, "font")),
								char: globalXmlParser.hexAttr(c, "char")
							});
							break;
						case "tab":
							result.children.push({ type: DomType.Tab });
							break;
						case "footnoteReference":
							result.children.push({
								type: DomType.FootnoteReference,
								id: globalXmlParser.attr(c, "id")
							});
							break;
						case "endnoteReference":
							result.children.push({
								type: DomType.EndnoteReference,
								id: globalXmlParser.attr(c, "id")
							});
							break;
						case "drawing":
							let d = this.parseDrawing(c);
							if (d) result.children.push(d);
							break;
						case "pict":
							result.children.push(this.parseVmlPicture(c));
							break;
						case "rPr": this.parseRunProperties(c, result);
					}
				}
				return result;
			}
			parseMathElement(elem) {
				const propsTag = `${elem.localName}Pr`;
				const result = {
					type: mmlTagMap[elem.localName],
					children: []
				};
				for (const el of globalXmlParser.elements(elem)) if (mmlTagMap[el.localName]) result.children.push(this.parseMathElement(el));
				else if (el.localName == "r") {
					var run = this.parseRun(el);
					run.type = DomType.MmlRun;
					result.children.push(run);
				} else if (el.localName == propsTag) result.props = this.parseMathProperies(el);
				return result;
			}
			parseMathProperies(elem) {
				const result = {};
				for (const el of globalXmlParser.elements(elem)) switch (el.localName) {
					case "chr":
						result.char = globalXmlParser.attr(el, "val");
						break;
					case "vertJc":
						result.verticalJustification = globalXmlParser.attr(el, "val");
						break;
					case "pos":
						result.position = globalXmlParser.attr(el, "val");
						break;
					case "degHide":
						result.hideDegree = globalXmlParser.boolAttr(el, "val");
						break;
					case "begChr":
						result.beginChar = globalXmlParser.attr(el, "val");
						break;
					case "endChr": result.endChar = globalXmlParser.attr(el, "val");
				}
				return result;
			}
			parseRunProperties(elem, run) {
				this.parseDefaultProperties(elem, run.cssStyle = {}, null, (c) => {
					switch (c.localName) {
						case "rStyle":
							run.styleName = globalXmlParser.attr(c, "val");
							break;
						case "vertAlign":
							run.verticalAlign = values.valueOfVertAlign(c, true);
							break;
						default: return false;
					}
					return true;
				});
			}
			parseVmlPicture(elem) {
				const result = {
					type: DomType.VmlPicture,
					children: []
				};
				for (const el of globalXmlParser.elements(elem)) {
					const child = parseVmlElement(el, this);
					child && result.children.push(child);
				}
				return result;
			}
			checkAlternateContent(elem) {
				if (elem.localName != "AlternateContent") return elem;
				var choice = globalXmlParser.element(elem, "Choice");
				if (choice) {
					var requires = globalXmlParser.attr(choice, "Requires");
					var namespaceURI = elem.lookupNamespaceURI(requires);
					if (supportedNamespaceURIs.includes(namespaceURI)) return choice.firstElementChild;
				}
				return globalXmlParser.element(elem, "Fallback")?.firstElementChild;
			}
			parseDrawing(node) {
				for (var n of globalXmlParser.elements(node)) switch (n.localName) {
					case "inline":
					case "anchor": return this.parseDrawingWrapper(n);
				}
			}
			parseDrawingWrapper(node) {
				var result = {
					type: DomType.Drawing,
					children: [],
					cssStyle: {}
				};
				var isAnchor = node.localName == "anchor";
				let wrapType = null;
				let simplePos = globalXmlParser.boolAttr(node, "simplePos");
				globalXmlParser.boolAttr(node, "behindDoc");
				let posX = {
					relative: "page",
					align: "left",
					offset: "0"
				};
				let posY = {
					relative: "page",
					align: "top",
					offset: "0"
				};
				for (var n of globalXmlParser.elements(node)) switch (n.localName) {
					case "simplePos":
						if (simplePos) {
							posX.offset = globalXmlParser.lengthAttr(n, "x", LengthUsage.Emu);
							posY.offset = globalXmlParser.lengthAttr(n, "y", LengthUsage.Emu);
						}
						break;
					case "extent":
						result.cssStyle["width"] = globalXmlParser.lengthAttr(n, "cx", LengthUsage.Emu);
						result.cssStyle["height"] = globalXmlParser.lengthAttr(n, "cy", LengthUsage.Emu);
						break;
					case "positionH":
					case "positionV":
						if (!simplePos) {
							let pos = n.localName == "positionH" ? posX : posY;
							var alignNode = globalXmlParser.element(n, "align");
							var offsetNode = globalXmlParser.element(n, "posOffset");
							pos.relative = globalXmlParser.attr(n, "relativeFrom") ?? pos.relative;
							if (alignNode) pos.align = alignNode.textContent;
							if (offsetNode) pos.offset = convertLength(offsetNode.textContent, LengthUsage.Emu);
						}
						break;
					case "wrapTopAndBottom":
						wrapType = "wrapTopAndBottom";
						break;
					case "wrapNone":
						wrapType = "wrapNone";
						break;
					case "graphic":
						var g = this.parseGraphic(n);
						if (g) result.children.push(g);
				}
				if (wrapType == "wrapTopAndBottom") {
					result.cssStyle["display"] = "block";
					if (posX.align) {
						result.cssStyle["text-align"] = posX.align;
						result.cssStyle["width"] = "100%";
					}
				} else if (wrapType == "wrapNone") {
					result.cssStyle["display"] = "block";
					result.cssStyle["position"] = "relative";
					result.cssStyle["width"] = "0px";
					result.cssStyle["height"] = "0px";
					if (posX.offset) result.cssStyle["left"] = posX.offset;
					if (posY.offset) result.cssStyle["top"] = posY.offset;
				} else if (isAnchor && (posX.align == "left" || posX.align == "right")) result.cssStyle["float"] = posX.align;
				return result;
			}
			parseGraphic(elem) {
				var graphicData = globalXmlParser.element(elem, "graphicData");
				for (let n of globalXmlParser.elements(graphicData)) switch (n.localName) {
					case "pic": return this.parsePicture(n);
				}
				return null;
			}
			parsePicture(elem) {
				var result = {
					type: DomType.Image,
					src: "",
					cssStyle: {}
				};
				var blipFill = globalXmlParser.element(elem, "blipFill");
				var blip = globalXmlParser.element(blipFill, "blip");
				var srcRect = globalXmlParser.element(blipFill, "srcRect");
				result.src = globalXmlParser.attr(blip, "embed");
				if (srcRect) result.srcRect = [
					globalXmlParser.intAttr(srcRect, "l", 0) / 1e5,
					globalXmlParser.intAttr(srcRect, "t", 0) / 1e5,
					globalXmlParser.intAttr(srcRect, "r", 0) / 1e5,
					globalXmlParser.intAttr(srcRect, "b", 0) / 1e5
				];
				var spPr = globalXmlParser.element(elem, "spPr");
				var xfrm = globalXmlParser.element(spPr, "xfrm");
				result.cssStyle["position"] = "relative";
				if (xfrm) {
					result.rotation = globalXmlParser.intAttr(xfrm, "rot", 0) / 6e4;
					for (var n of globalXmlParser.elements(xfrm)) switch (n.localName) {
						case "ext":
							result.cssStyle["width"] = globalXmlParser.lengthAttr(n, "cx", LengthUsage.Emu);
							result.cssStyle["height"] = globalXmlParser.lengthAttr(n, "cy", LengthUsage.Emu);
							break;
						case "off":
							result.cssStyle["left"] = globalXmlParser.lengthAttr(n, "x", LengthUsage.Emu);
							result.cssStyle["top"] = globalXmlParser.lengthAttr(n, "y", LengthUsage.Emu);
					}
				}
				return result;
			}
			parseTable(node) {
				var result = {
					type: DomType.Table,
					children: []
				};
				for (const c of globalXmlParser.elements(node)) switch (c.localName) {
					case "tr":
						result.children.push(this.parseTableRow(c));
						break;
					case "tblGrid":
						result.columns = this.parseTableColumns(c);
						break;
					case "tblPr": this.parseTableProperties(c, result);
				}
				return result;
			}
			parseTableColumns(node) {
				var result = [];
				for (const n of globalXmlParser.elements(node)) switch (n.localName) {
					case "gridCol": result.push({ width: globalXmlParser.lengthAttr(n, "w") });
				}
				return result;
			}
			parseTableProperties(elem, table) {
				table.cssStyle = {};
				table.cellStyle = {};
				this.parseDefaultProperties(elem, table.cssStyle, table.cellStyle, (c) => {
					switch (c.localName) {
						case "tblStyle":
							table.styleName = globalXmlParser.attr(c, "val");
							break;
						case "tblLook":
							table.className = values.classNameOftblLook(c);
							break;
						case "tblpPr":
							this.parseTablePosition(c, table);
							break;
						case "tblStyleColBandSize":
							table.colBandSize = globalXmlParser.intAttr(c, "val");
							break;
						case "tblStyleRowBandSize":
							table.rowBandSize = globalXmlParser.intAttr(c, "val");
							break;
						case "hidden":
							table.cssStyle["display"] = "none";
							break;
						default: return false;
					}
					return true;
				});
				switch (table.cssStyle["text-align"]) {
					case "center":
						delete table.cssStyle["text-align"];
						table.cssStyle["margin-left"] = "auto";
						table.cssStyle["margin-right"] = "auto";
						break;
					case "right":
						delete table.cssStyle["text-align"];
						table.cssStyle["margin-left"] = "auto";
				}
			}
			parseTablePosition(node, table) {
				var topFromText = globalXmlParser.lengthAttr(node, "topFromText");
				var bottomFromText = globalXmlParser.lengthAttr(node, "bottomFromText");
				var rightFromText = globalXmlParser.lengthAttr(node, "rightFromText");
				var leftFromText = globalXmlParser.lengthAttr(node, "leftFromText");
				table.cssStyle["float"] = "left";
				table.cssStyle["margin-bottom"] = values.addSize(table.cssStyle["margin-bottom"], bottomFromText);
				table.cssStyle["margin-left"] = values.addSize(table.cssStyle["margin-left"], leftFromText);
				table.cssStyle["margin-right"] = values.addSize(table.cssStyle["margin-right"], rightFromText);
				table.cssStyle["margin-top"] = values.addSize(table.cssStyle["margin-top"], topFromText);
			}
			parseTableRow(node) {
				var result = {
					type: DomType.Row,
					children: []
				};
				for (const c of globalXmlParser.elements(node)) switch (c.localName) {
					case "tc":
						result.children.push(this.parseTableCell(c));
						break;
					case "trPr":
					case "tblPrEx": this.parseTableRowProperties(c, result);
				}
				return result;
			}
			parseTableRowProperties(elem, row) {
				row.cssStyle = this.parseDefaultProperties(elem, {}, null, (c) => {
					switch (c.localName) {
						case "cnfStyle":
							row.className = values.classNameOfCnfStyle(c);
							break;
						case "tblHeader":
							row.isHeader = globalXmlParser.boolAttr(c, "val");
							break;
						case "gridBefore":
							row.gridBefore = globalXmlParser.intAttr(c, "val");
							break;
						case "gridAfter":
							row.gridAfter = globalXmlParser.intAttr(c, "val");
							break;
						default: return false;
					}
					return true;
				});
			}
			parseTableCell(node) {
				var result = {
					type: DomType.Cell,
					children: []
				};
				for (const c of globalXmlParser.elements(node)) switch (c.localName) {
					case "tbl":
						result.children.push(this.parseTable(c));
						break;
					case "p":
						result.children.push(this.parseParagraph(c));
						break;
					case "tcPr": this.parseTableCellProperties(c, result);
				}
				return result;
			}
			parseTableCellProperties(elem, cell) {
				cell.cssStyle = this.parseDefaultProperties(elem, {}, null, (c) => {
					switch (c.localName) {
						case "gridSpan":
							cell.span = globalXmlParser.intAttr(c, "val", null);
							break;
						case "vMerge":
							cell.verticalMerge = globalXmlParser.attr(c, "val") ?? "continue";
							break;
						case "cnfStyle":
							cell.className = values.classNameOfCnfStyle(c);
							break;
						default: return false;
					}
					return true;
				});
				this.parseTableCellVerticalText(elem, cell);
			}
			parseTableCellVerticalText(elem, cell) {
				const directionMap = {
					"btLr": {
						writingMode: "vertical-rl",
						transform: "rotate(180deg)"
					},
					"lrTb": {
						writingMode: "vertical-lr",
						transform: "none"
					},
					"tbRl": {
						writingMode: "vertical-rl",
						transform: "none"
					}
				};
				for (const c of globalXmlParser.elements(elem)) if (c.localName === "textDirection") {
					const style = directionMap[globalXmlParser.attr(c, "val")] || { writingMode: "horizontal-tb" };
					cell.cssStyle["writing-mode"] = style.writingMode;
					cell.cssStyle["transform"] = style.transform;
				}
			}
			parseDefaultProperties(elem, style = null, childStyle = null, handler = null) {
				style = style || {};
				for (const c of globalXmlParser.elements(elem)) {
					if (handler?.(c)) continue;
					switch (c.localName) {
						case "jc":
							style["text-align"] = values.valueOfJc(c);
							break;
						case "textAlignment":
							style["vertical-align"] = values.valueOfTextAlignment(c);
							break;
						case "color":
							style["color"] = xmlUtil.colorAttr(c, "val", null, autos.color);
							break;
						case "sz":
							style["font-size"] = style["min-height"] = globalXmlParser.lengthAttr(c, "val", LengthUsage.FontSize);
							break;
						case "shd":
							style["background-color"] = xmlUtil.colorAttr(c, "fill", null, autos.shd);
							break;
						case "highlight":
							style["background-color"] = xmlUtil.colorAttr(c, "val", null, autos.highlight);
							break;
						case "vertAlign": break;
						case "position":
							style.verticalAlign = globalXmlParser.lengthAttr(c, "val", LengthUsage.FontSize);
							break;
						case "tcW": if (this.options.ignoreWidth) break;
						case "tblW":
							style["width"] = values.valueOfSize(c, "w");
							break;
						case "trHeight":
							this.parseTrHeight(c, style);
							break;
						case "strike":
							style["text-decoration"] = globalXmlParser.boolAttr(c, "val", true) ? "line-through" : "none";
							break;
						case "b":
							style["font-weight"] = globalXmlParser.boolAttr(c, "val", true) ? "bold" : "normal";
							break;
						case "i":
							style["font-style"] = globalXmlParser.boolAttr(c, "val", true) ? "italic" : "normal";
							break;
						case "caps":
							style["text-transform"] = globalXmlParser.boolAttr(c, "val", true) ? "uppercase" : "none";
							break;
						case "smallCaps":
							style["font-variant"] = globalXmlParser.boolAttr(c, "val", true) ? "small-caps" : "none";
							break;
						case "u":
							this.parseUnderline(c, style);
							break;
						case "ind":
						case "tblInd":
							this.parseIndentation(c, style);
							break;
						case "rFonts":
							this.parseFont(c, style);
							break;
						case "tblBorders":
							this.parseBorderProperties(c, childStyle || style);
							break;
						case "tblCellSpacing":
							style["border-spacing"] = values.valueOfMargin(c);
							style["border-collapse"] = "separate";
							break;
						case "pBdr":
							this.parseBorderProperties(c, style);
							break;
						case "bdr":
							style["border"] = values.valueOfBorder(c);
							break;
						case "tcBorders":
							this.parseBorderProperties(c, style);
							break;
						case "vanish":
							if (globalXmlParser.boolAttr(c, "val", true)) style["display"] = "none";
							break;
						case "kern": break;
						case "noWrap": break;
						case "tblCellMar":
						case "tcMar":
							this.parseMarginProperties(c, childStyle || style);
							break;
						case "tblLayout":
							style["table-layout"] = values.valueOfTblLayout(c);
							break;
						case "vAlign":
							style["vertical-align"] = values.valueOfTextAlignment(c);
							break;
						case "spacing":
							if (elem.localName == "pPr") this.parseSpacing(c, style);
							break;
						case "wordWrap":
							if (globalXmlParser.boolAttr(c, "val")) style["overflow-wrap"] = "break-word";
							break;
						case "suppressAutoHyphens":
							style["hyphens"] = globalXmlParser.boolAttr(c, "val", true) ? "none" : "auto";
							break;
						case "lang":
							style["$lang"] = globalXmlParser.attr(c, "val");
							break;
						case "rtl":
						case "bidi":
							if (globalXmlParser.boolAttr(c, "val", true)) style["direction"] = "rtl";
							break;
						case "bCs":
						case "iCs":
						case "szCs":
						case "tabs":
						case "outlineLvl":
						case "contextualSpacing":
						case "tblStyleColBandSize":
						case "tblStyleRowBandSize":
						case "webHidden":
						case "pageBreakBefore":
						case "suppressLineNumbers":
						case "keepLines":
						case "keepNext":
						case "widowControl":
						case "noProof": break;
						default: if (this.options.debug) console.warn(`DOCX: Unknown document element: ${elem.localName}.${c.localName}`);
					}
				}
				return style;
			}
			parseUnderline(node, style) {
				var val = globalXmlParser.attr(node, "val");
				if (val == null) return;
				switch (val) {
					case "dash":
					case "dashDotDotHeavy":
					case "dashDotHeavy":
					case "dashedHeavy":
					case "dashLong":
					case "dashLongHeavy":
					case "dotDash":
					case "dotDotDash":
						style["text-decoration"] = "underline dashed";
						break;
					case "dotted":
					case "dottedHeavy":
						style["text-decoration"] = "underline dotted";
						break;
					case "double":
						style["text-decoration"] = "underline double";
						break;
					case "single":
					case "thick":
						style["text-decoration"] = "underline";
						break;
					case "wave":
					case "wavyDouble":
					case "wavyHeavy":
						style["text-decoration"] = "underline wavy";
						break;
					case "words":
						style["text-decoration"] = "underline";
						break;
					case "none": style["text-decoration"] = "none";
				}
				var col = xmlUtil.colorAttr(node, "color");
				if (col) style["text-decoration-color"] = col;
			}
			parseFont(node, style) {
				var fonts = [
					globalXmlParser.attr(node, "ascii"),
					values.themeValue(node, "asciiTheme"),
					globalXmlParser.attr(node, "eastAsia")
				].filter((x) => x).map((x) => encloseFontFamily(x));
				if (fonts.length > 0) style["font-family"] = [...new Set(fonts)].join(", ");
			}
			parseIndentation(node, style) {
				var firstLine = globalXmlParser.lengthAttr(node, "firstLine");
				var hanging = globalXmlParser.lengthAttr(node, "hanging");
				var left = globalXmlParser.lengthAttr(node, "left");
				var start = globalXmlParser.lengthAttr(node, "start");
				var right = globalXmlParser.lengthAttr(node, "right");
				var end = globalXmlParser.lengthAttr(node, "end");
				if (firstLine) style["text-indent"] = firstLine;
				if (hanging) style["text-indent"] = `-${hanging}`;
				if (left || start) style["margin-inline-start"] = left || start;
				if (right || end) style["margin-inline-end"] = right || end;
			}
			parseSpacing(node, style) {
				var before = globalXmlParser.lengthAttr(node, "before");
				var after = globalXmlParser.lengthAttr(node, "after");
				var line = globalXmlParser.intAttr(node, "line", null);
				var lineRule = globalXmlParser.attr(node, "lineRule");
				if (before) style["margin-top"] = before;
				if (after) style["margin-bottom"] = after;
				if (line !== null) switch (lineRule) {
					case "auto":
						style["line-height"] = `${(line / 240).toFixed(2)}`;
						break;
					case "atLeast":
						style["line-height"] = `calc(100% + ${line / 20}pt)`;
						break;
					default: style["line-height"] = style["min-height"] = `${line / 20}pt`;
				}
			}
			parseMarginProperties(node, output) {
				for (const c of globalXmlParser.elements(node)) switch (c.localName) {
					case "left":
						output["padding-left"] = values.valueOfMargin(c);
						break;
					case "right":
						output["padding-right"] = values.valueOfMargin(c);
						break;
					case "top":
						output["padding-top"] = values.valueOfMargin(c);
						break;
					case "bottom": output["padding-bottom"] = values.valueOfMargin(c);
				}
			}
			parseTrHeight(node, output) {
				switch (globalXmlParser.attr(node, "hRule")) {
					case "exact":
						output["height"] = globalXmlParser.lengthAttr(node, "val");
						break;
					default: output["height"] = globalXmlParser.lengthAttr(node, "val");
				}
			}
			parseBorderProperties(node, output) {
				for (const c of globalXmlParser.elements(node)) switch (c.localName) {
					case "start":
					case "left":
						output["border-left"] = values.valueOfBorder(c);
						break;
					case "end":
					case "right":
						output["border-right"] = values.valueOfBorder(c);
						break;
					case "top":
						output["border-top"] = values.valueOfBorder(c);
						break;
					case "bottom": output["border-bottom"] = values.valueOfBorder(c);
				}
			}
		};
		knownColors = [
			"black",
			"blue",
			"cyan",
			"darkBlue",
			"darkCyan",
			"darkGray",
			"darkGreen",
			"darkMagenta",
			"darkRed",
			"darkYellow",
			"green",
			"lightGray",
			"magenta",
			"none",
			"red",
			"white",
			"yellow"
		];
		xmlUtil = class {
			static colorAttr(node, attrName, defValue = null, autoColor = "black") {
				var v = globalXmlParser.attr(node, attrName);
				if (v) {
					if (v == "auto") return autoColor;
					else if (knownColors.includes(v)) return v;
					return `#${v}`;
				}
				var themeColor = globalXmlParser.attr(node, "themeColor");
				return themeColor ? `var(--docx-${themeColor}-color)` : defValue;
			}
		};
		values = class values {
			static themeValue(c, attr) {
				var val = globalXmlParser.attr(c, attr);
				return val ? `var(--docx-${val}-font)` : null;
			}
			static valueOfSize(c, attr) {
				var type = LengthUsage.Dxa;
				switch (globalXmlParser.attr(c, "type")) {
					case "dxa": break;
					case "pct":
						type = LengthUsage.Percent;
						break;
					case "auto": return "auto";
				}
				return globalXmlParser.lengthAttr(c, attr, type);
			}
			static valueOfMargin(c) {
				return globalXmlParser.lengthAttr(c, "w");
			}
			static valueOfBorder(c) {
				var type = values.parseBorderType(globalXmlParser.attr(c, "val"));
				if (type == "none") return "none";
				var color = xmlUtil.colorAttr(c, "color");
				return `${globalXmlParser.lengthAttr(c, "sz", LengthUsage.Border)} ${type} ${color == "auto" ? autos.borderColor : color}`;
			}
			static parseBorderType(type) {
				switch (type) {
					case "single": return "solid";
					case "dashDotStroked": return "solid";
					case "dashed": return "dashed";
					case "dashSmallGap": return "dashed";
					case "dotDash": return "dotted";
					case "dotDotDash": return "dotted";
					case "dotted": return "dotted";
					case "double": return "double";
					case "doubleWave": return "double";
					case "inset": return "inset";
					case "nil": return "none";
					case "none": return "none";
					case "outset": return "outset";
					case "thick": return "solid";
					case "thickThinLargeGap": return "solid";
					case "thickThinMediumGap": return "solid";
					case "thickThinSmallGap": return "solid";
					case "thinThickLargeGap": return "solid";
					case "thinThickMediumGap": return "solid";
					case "thinThickSmallGap": return "solid";
					case "thinThickThinLargeGap": return "solid";
					case "thinThickThinMediumGap": return "solid";
					case "thinThickThinSmallGap": return "solid";
					case "threeDEmboss": return "solid";
					case "threeDEngrave": return "solid";
					case "triple": return "double";
					case "wave": return "solid";
				}
				return "solid";
			}
			static valueOfTblLayout(c) {
				return globalXmlParser.attr(c, "val") == "fixed" ? "fixed" : "auto";
			}
			static classNameOfCnfStyle(c) {
				const val = globalXmlParser.attr(c, "val");
				const classes = [
					"first-row",
					"last-row",
					"first-col",
					"last-col",
					"odd-col",
					"even-col",
					"odd-row",
					"even-row",
					"ne-cell",
					"nw-cell",
					"se-cell",
					"sw-cell"
				];
				if (val) return classes.filter((_, i) => val[i] == "1").join(" ");
				const attrs = [
					"firstRow",
					"lastRow",
					"firstColumn",
					"lastColumn",
					"oddVBand",
					"evenVBand",
					"oddHBand",
					"evenHBand",
					"firstRowLastColumn",
					"firstRowFirstColumn",
					"lastRowLastColumn",
					"lastRowFirstColumn"
				];
				return classes.filter((_, i) => globalXmlParser.boolAttr(c, attrs[i])).join(" ");
			}
			static valueOfJc(c) {
				var type = globalXmlParser.attr(c, "val");
				switch (type) {
					case "start":
					case "left": return "left";
					case "center": return "center";
					case "end":
					case "right": return "right";
					case "both": return "justify";
				}
				return type;
			}
			static valueOfVertAlign(c, asTagName = false) {
				var type = globalXmlParser.attr(c, "val");
				switch (type) {
					case "subscript": return "sub";
					case "superscript": return asTagName ? "sup" : "super";
				}
				return asTagName ? null : type;
			}
			static valueOfTextAlignment(c) {
				var type = globalXmlParser.attr(c, "val");
				switch (type) {
					case "auto":
					case "baseline": return "baseline";
					case "top": return "top";
					case "center": return "middle";
					case "bottom": return "bottom";
				}
				return type;
			}
			static addSize(a, b) {
				if (a == null) return b;
				if (b == null) return a;
				return `calc(${a} + ${b})`;
			}
			static classNameOftblLook(c) {
				const val = globalXmlParser.hexAttr(c, "val", 0);
				let className = "";
				if (globalXmlParser.boolAttr(c, "firstRow") || val & 32) className += " first-row";
				if (globalXmlParser.boolAttr(c, "lastRow") || val & 64) className += " last-row";
				if (globalXmlParser.boolAttr(c, "firstColumn") || val & 128) className += " first-col";
				if (globalXmlParser.boolAttr(c, "lastColumn") || val & 256) className += " last-col";
				if (globalXmlParser.boolAttr(c, "noHBand") || val & 512) className += " no-hband";
				if (globalXmlParser.boolAttr(c, "noVBand") || val & 1024) className += " no-vband";
				return className.trim();
			}
		};
		defaultTab = {
			pos: 0,
			leader: "none",
			style: "left"
		};
		maxTabs = 50;
		(function(ns) {
			ns["html"] = "http://www.w3.org/1999/xhtml";
			ns["svg"] = "http://www.w3.org/2000/svg";
			ns["mathML"] = "http://www.w3.org/1998/Math/MathML";
		})(ns || (ns = {}));
		HtmlRenderer = class {
			constructor() {
				this.className = "docx";
				this.styleMap = {};
				this.currentPart = null;
				this.tableVerticalMerges = [];
				this.currentVerticalMerge = null;
				this.tableCellPositions = [];
				this.currentCellPosition = null;
				this.footnoteMap = {};
				this.endnoteMap = {};
				this.currentEndnoteIds = [];
				this.usedHederFooterParts = [];
				this.currentTabs = [];
				this.commentMap = {};
				this.tasks = [];
				this.postRenderTasks = [];
				this.h = h;
			}
			async render(document, options) {
				this.document = document;
				this.options = options;
				this.className = options.className;
				this.rootSelector = options.inWrapper ? `.${this.className}-wrapper` : ":root";
				this.h = options.h ?? h;
				this.styleMap = null;
				this.tasks = [];
				if (this.options.renderComments && globalThis.Highlight) this.commentHighlight = new Highlight();
				const result = [...this.renderDefaultStyle()];
				if (document.themePart) result.push(...this.renderTheme(document.themePart));
				if (document.stylesPart != null) {
					this.styleMap = this.processStyles(document.stylesPart.styles);
					result.push(...this.renderStyles(document.stylesPart.styles));
				}
				if (document.numberingPart) {
					this.prodessNumberings(document.numberingPart.domNumberings);
					result.push(...await this.renderNumbering(document.numberingPart.domNumberings));
				}
				if (document.footnotesPart) this.footnoteMap = keyBy(document.footnotesPart.notes, (x) => x.id);
				if (document.endnotesPart) this.endnoteMap = keyBy(document.endnotesPart.notes, (x) => x.id);
				if (document.settingsPart) this.defaultTabSize = document.settingsPart.settings?.defaultTabStop;
				if (!options.ignoreFonts && document.fontTablePart) result.push(...await this.renderFontTable(document.fontTablePart));
				var sectionElements = this.renderSections(document.documentPart.body);
				if (this.options.inWrapper) result.push(this.renderWrapper(sectionElements));
				else result.push(...sectionElements);
				if (this.commentHighlight && options.renderComments) CSS.highlights.set(`${this.className}-comments`, this.commentHighlight);
				this.postRenderTasks.forEach((t) => t());
				await Promise.allSettled(this.tasks);
				this.refreshTabStops();
				return result;
			}
			renderTheme(themePart) {
				const variables = {};
				const fontScheme = themePart.theme?.fontScheme;
				if (fontScheme) {
					if (fontScheme.majorFont) variables["--docx-majorHAnsi-font"] = fontScheme.majorFont.latinTypeface;
					if (fontScheme.minorFont) variables["--docx-minorHAnsi-font"] = fontScheme.minorFont.latinTypeface;
				}
				const colorScheme = themePart.theme?.colorScheme;
				if (colorScheme) for (let [k, v] of Object.entries(colorScheme.colors)) variables[`--docx-${k}-color`] = `#${v}`;
				const cssText = this.styleToString(`.${this.className}`, variables);
				return [this.h({
					tagName: "#comment",
					children: ["docxjs document theme values"]
				}), this.h({
					tagName: "style",
					children: [cssText]
				})];
			}
			async renderFontTable(fontsPart) {
				const result = [];
				for (let f of fontsPart.fonts) for (let ref of f.embedFontRefs) try {
					const fontData = await this.document.loadFont(ref.id, ref.key);
					const cssValues = {
						"font-family": encloseFontFamily(f.name),
						"src": `url(${fontData})`
					};
					if (ref.type == "bold" || ref.type == "boldItalic") cssValues["font-weight"] = "bold";
					if (ref.type == "italic" || ref.type == "boldItalic") cssValues["font-style"] = "italic";
					result.push(this.h({
						tagName: "#comment",
						children: [`docxjs ${f.name} font`]
					}));
					result.push(this.h({
						tagName: "style",
						children: [this.styleToString(`@font-face`, cssValues)]
					}));
				} catch (e) {
					if (this.options.debug) console.warn(`Can't load font with id ${ref.id} and key ${ref.key}`);
				}
				return result;
			}
			processStyleName(className) {
				return className ? `${this.className}_${escapeClassName(className)}` : this.className;
			}
			processStyles(styles) {
				const stylesMap = keyBy(styles.filter((x) => x.id != null), (x) => x.id);
				for (const style of styles.filter((x) => x.basedOn)) {
					var baseStyle = stylesMap[style.basedOn];
					if (baseStyle) {
						style.paragraphProps = mergeDeep(style.paragraphProps, baseStyle.paragraphProps);
						style.runProps = mergeDeep(style.runProps, baseStyle.runProps);
						for (const baseValues of baseStyle.styles) {
							const styleValues = style.styles.find((x) => x.target == baseValues.target);
							if (styleValues) this.copyStyleProperties(baseValues.values, styleValues.values);
							else style.styles.push({
								...baseValues,
								values: { ...baseValues.values }
							});
						}
					} else if (this.options.debug) console.warn(`Can't find base style ${style.basedOn}`);
				}
				for (let style of styles) style.cssName = this.processStyleName(style.id);
				return stylesMap;
			}
			prodessNumberings(numberings) {
				for (let num of numberings.filter((n) => n.pStyleName)) {
					const style = this.findStyle(num.pStyleName);
					if (style?.paragraphProps?.numbering) style.paragraphProps.numbering.level = num.level;
				}
			}
			processElement(element) {
				if (element.children) for (var e of element.children) {
					e.parent = element;
					if (e.type == DomType.Table) this.processTable(e);
					else this.processElement(e);
				}
			}
			processTable(table) {
				for (var r of table.children) for (var c of r.children) {
					c.cssStyle = this.copyStyleProperties(table.cellStyle, c.cssStyle, [
						"border-left",
						"border-right",
						"border-top",
						"border-bottom",
						"padding-left",
						"padding-right",
						"padding-top",
						"padding-bottom"
					]);
					this.processElement(c);
				}
			}
			copyStyleProperties(input, output, attrs = null) {
				if (!input) return output;
				if (output == null) output = {};
				if (attrs == null) attrs = Object.getOwnPropertyNames(input);
				for (var key of attrs) if (input.hasOwnProperty(key) && !output.hasOwnProperty(key)) output[key] = input[key];
				return output;
			}
			createPageElement(className, props, docStyle) {
				const style = { ...docStyle };
				if (props) {
					if (props.pageMargins) {
						style.paddingLeft = props.pageMargins.left;
						style.paddingRight = props.pageMargins.right;
						style.paddingTop = props.pageMargins.top;
						style.paddingBottom = props.pageMargins.bottom;
					}
					if (props.pageSize) {
						if (!this.options.ignoreWidth) style.width = props.pageSize.width;
						if (!this.options.ignoreHeight) style.minHeight = props.pageSize.height;
					}
				}
				return this.h({
					tagName: "section",
					className,
					style
				});
			}
			createSectionContent(props) {
				const style = {};
				if (props.columns && props.columns.numberOfColumns) {
					style.columnCount = `${props.columns.numberOfColumns}`;
					style.columnGap = props.columns.space;
					if (props.columns.separator) style.columnRule = "1px solid black";
				}
				return this.h({
					tagName: "article",
					style
				});
			}
			renderSections(document) {
				const result = [];
				this.processElement(document);
				const sections = this.splitBySection(document.children, document.props);
				const pages = this.groupByPageBreaks(sections);
				let prevProps = null;
				for (let i = 0, l = pages.length; i < l; i++) {
					this.currentFootnoteIds = [];
					let props = pages[i][0].sectProps;
					const pageElement = this.createPageElement(this.className, props, document.cssStyle);
					this.options.renderHeaders && this.renderHeaderFooter(props.headerRefs, props, result.length, prevProps != props, pageElement);
					for (const sect of pages[i]) {
						var contentElement = this.createSectionContent(sect.sectProps);
						this.renderElements(sect.elements, contentElement);
						pageElement.appendChild(contentElement);
						props = sect.sectProps;
					}
					if (this.options.renderFootnotes) {
						const notes = this.renderNotes(this.currentFootnoteIds, this.footnoteMap);
						notes && pageElement.appendChild(notes);
					}
					if (this.options.renderEndnotes && i == l - 1) {
						const notes = this.renderNotes(this.currentEndnoteIds, this.endnoteMap);
						notes && pageElement.appendChild(notes);
					}
					this.options.renderFooters && this.renderHeaderFooter(props.footerRefs, props, result.length, prevProps != props, pageElement);
					result.push(pageElement);
					prevProps = props;
				}
				return result;
			}
			renderHeaderFooter(refs, props, page, firstOfSection, into) {
				if (!refs) return;
				var ref = (props.titlePage && firstOfSection ? refs.find((x) => x.type == "first") : null) ?? (page % 2 == 1 ? refs.find((x) => x.type == "even") : null) ?? refs.find((x) => x.type == "default");
				var part = ref && this.document.findPartByRelId(ref.id, this.document.documentPart);
				if (part) {
					this.currentPart = part;
					if (!this.usedHederFooterParts.includes(part.path)) {
						this.processElement(part.rootElement);
						this.usedHederFooterParts.push(part.path);
					}
					const [el] = this.renderElements([part.rootElement], into);
					if (props?.pageMargins) {
						if (part.rootElement.type === DomType.Header) {
							el.style.marginTop = `calc(${props.pageMargins.header} - ${props.pageMargins.top})`;
							el.style.minHeight = `calc(${props.pageMargins.top} - ${props.pageMargins.header})`;
						} else if (part.rootElement.type === DomType.Footer) {
							el.style.marginBottom = `calc(${props.pageMargins.footer} - ${props.pageMargins.bottom})`;
							el.style.minHeight = `calc(${props.pageMargins.bottom} - ${props.pageMargins.footer})`;
						}
					}
					this.currentPart = null;
				}
			}
			isPageBreakElement(elem) {
				if (elem.type != DomType.Break) return false;
				if (elem.break == "lastRenderedPageBreak") return !this.options.ignoreLastRenderedPageBreak;
				return elem.break == "page";
			}
			isPageBreakSection(prev, next) {
				if (!prev) return false;
				if (!next) return false;
				return prev.pageSize?.orientation != next.pageSize?.orientation || prev.pageSize?.width != next.pageSize?.width || prev.pageSize?.height != next.pageSize?.height;
			}
			splitBySection(elements, defaultProps) {
				var current = {
					sectProps: null,
					elements: [],
					pageBreak: false
				};
				var result = [current];
				for (let elem of elements) {
					if (elem.type == DomType.Paragraph) {
						if (this.findStyle(elem.styleName)?.paragraphProps?.pageBreakBefore) {
							current.sectProps = sectProps;
							current.pageBreak = true;
							current = {
								sectProps: null,
								elements: [],
								pageBreak: false
							};
							result.push(current);
						}
					}
					current.elements.push(elem);
					if (elem.type == DomType.Paragraph) {
						const p = elem;
						var sectProps = p.sectionProps;
						var pBreakIndex = -1;
						var rBreakIndex = -1;
						if (this.options.breakPages && p.children) pBreakIndex = p.children.findIndex((r) => {
							rBreakIndex = r.children?.findIndex(this.isPageBreakElement.bind(this)) ?? -1;
							return rBreakIndex != -1;
						});
						if (sectProps || pBreakIndex != -1) {
							current.sectProps = sectProps;
							current.pageBreak = pBreakIndex != -1;
							current = {
								sectProps: null,
								elements: [],
								pageBreak: false
							};
							result.push(current);
						}
						if (pBreakIndex != -1) {
							let breakRun = p.children[pBreakIndex];
							let splitRun = rBreakIndex < breakRun.children.length - 1;
							if (pBreakIndex < p.children.length - 1 || splitRun) {
								var children = elem.children;
								var newParagraph = {
									...elem,
									children: children.slice(pBreakIndex)
								};
								elem.children = children.slice(0, pBreakIndex);
								current.elements.push(newParagraph);
								if (splitRun) {
									let runChildren = breakRun.children;
									let newRun = {
										...breakRun,
										children: runChildren.slice(0, rBreakIndex)
									};
									elem.children.push(newRun);
									breakRun.children = runChildren.slice(rBreakIndex);
								}
							}
						}
					}
				}
				let currentSectProps = null;
				for (let i = result.length - 1; i >= 0; i--) if (result[i].sectProps == null) result[i].sectProps = currentSectProps ?? defaultProps;
				else currentSectProps = result[i].sectProps;
				return result;
			}
			groupByPageBreaks(sections) {
				let current = [];
				let prev;
				const result = [current];
				for (let s of sections) {
					current.push(s);
					if (this.options.ignoreLastRenderedPageBreak || s.pageBreak || this.isPageBreakSection(prev, s.sectProps)) result.push(current = []);
					prev = s.sectProps;
				}
				return result.filter((x) => x.length > 0);
			}
			renderWrapper(children) {
				return this.h({
					tagName: "div",
					className: `${this.className}-wrapper`,
					children
				});
			}
			renderDefaultStyle() {
				var c = this.className;
				var wrapperStyle = `
.${c}-wrapper { background: gray; padding: 30px; padding-bottom: 0px; display: flex; flex-flow: column; align-items: center; } 
.${c}-wrapper>section.${c} { background: white; box-shadow: 0 0 10px rgba(0, 0, 0, 0.5); margin-bottom: 30px; }`;
				if (this.options.hideWrapperOnPrint) wrapperStyle = `@media not print { ${wrapperStyle} }`;
				var styleText = `${wrapperStyle}
.${c} { color: black; hyphens: auto; text-underline-position: from-font; }
section.${c} { box-sizing: border-box; display: flex; flex-flow: column nowrap; position: relative; overflow: hidden; }
section.${c}>article { margin-bottom: auto; z-index: 1; }
section.${c}>footer { z-index: 1; }
.${c} table { border-collapse: collapse; }
.${c} table td, .${c} table th { vertical-align: top; }
.${c} p { margin: 0pt; min-height: 1em; }
.${c} span { white-space: pre-wrap; overflow-wrap: break-word; }
.${c} a { color: inherit; text-decoration: inherit; }
.${c} svg { fill: transparent; }
`;
				if (this.options.renderComments) styleText += `
.${c}-comment-ref { cursor: default; }
.${c}-comment-popover { display: none; z-index: 1000; padding: 0.5rem; background: white; position: absolute; box-shadow: 0 0 0.25rem rgba(0, 0, 0, 0.25); width: 30ch; }
.${c}-comment-ref:hover~.${c}-comment-popover { display: block; }
.${c}-comment-author,.${c}-comment-date { font-size: 0.875rem; color: #888; }
`;
				return [this.h({
					tagName: "#comment",
					children: ["docxjs library predefined styles"]
				}), this.h({
					tagName: "style",
					children: [styleText]
				})];
			}
			async renderNumbering(numberings) {
				var styleText = "";
				var resetCounters = [];
				for (var num of numberings) {
					var selector = `p.${this.numberingClass(num.id, num.level)}`;
					var listStyleType = "none";
					if (num.bullet) {
						let valiable = `--${this.className}-${num.bullet.src}`.toLowerCase();
						styleText += this.styleToString(`${selector}:before`, {
							"content": "' '",
							"display": "inline-block",
							"background": `var(${valiable})`
						}, num.bullet.style);
						try {
							const imgData = await this.document.loadNumberingImage(num.bullet.src);
							styleText += `${this.rootSelector} { ${valiable}: url(${imgData}) }`;
						} catch (e) {
							if (this.options.debug) console.warn(`Can't load numbering image with src ${num.bullet.src}`);
						}
					} else if (num.levelText) {
						let counter = this.numberingCounter(num.id, num.level);
						const counterReset = counter + " " + (num.start - 1);
						if (num.level > 0) styleText += this.styleToString(`p.${this.numberingClass(num.id, num.level - 1)}`, { "counter-set": counterReset });
						resetCounters.push(counterReset);
						styleText += this.styleToString(`${selector}:before`, {
							"content": this.levelTextToContent(num.levelText, num.suff, num.id, this.numFormatToCssValue(num.format)),
							"counter-increment": counter,
							...num.rStyle
						});
					} else listStyleType = this.numFormatToCssValue(num.format);
					styleText += this.styleToString(selector, {
						"display": "list-item",
						"list-style-position": "inside",
						"list-style-type": listStyleType,
						...num.pStyle
					});
				}
				if (resetCounters.length > 0) styleText += this.styleToString(this.rootSelector, { "counter-reset": resetCounters.join(" ") });
				return [this.h({
					tagName: "#comment",
					children: ["docxjs document numbering styles"]
				}), this.h({
					tagName: "style",
					children: [styleText]
				})];
			}
			renderStyles(styles) {
				var styleText = "";
				const stylesMap = this.styleMap;
				const defautStyles = keyBy(styles.filter((s) => s.isDefault), (s) => s.target);
				for (const style of styles) {
					var subStyles = style.styles;
					if (style.linked) {
						var linkedStyle = style.linked && stylesMap[style.linked];
						if (linkedStyle) subStyles = subStyles.concat(linkedStyle.styles);
						else if (this.options.debug) console.warn(`Can't find linked style ${style.linked}`);
					}
					for (const subStyle of subStyles) {
						var selector = `${style.target ?? ""}.${style.cssName}`;
						if (style.target != subStyle.target) selector += ` ${subStyle.target}`;
						if (defautStyles[style.target] == style) selector = `.${this.className} ${style.target}, ` + selector;
						styleText += this.styleToString(selector, subStyle.values);
					}
				}
				return [this.h({
					tagName: "#comment",
					children: ["docxjs document styles"]
				}), this.h({
					tagName: "style",
					children: [styleText]
				})];
			}
			renderNotes(noteIds, notesMap) {
				var notes = noteIds.map((id) => notesMap[id]).filter((x) => x);
				if (notes.length > 0) return this.h({
					tagName: "ol",
					children: this.renderElements(notes)
				});
			}
			renderElement(elem) {
				switch (elem.type) {
					case DomType.Paragraph: return this.renderParagraph(elem);
					case DomType.BookmarkStart: return this.renderBookmarkStart(elem);
					case DomType.BookmarkEnd: return null;
					case DomType.Run: return this.renderRun(elem);
					case DomType.Table: return this.renderTable(elem);
					case DomType.Row: return this.renderTableRow(elem);
					case DomType.Cell: return this.renderTableCell(elem);
					case DomType.Hyperlink: return this.renderHyperlink(elem);
					case DomType.SmartTag: return this.renderSmartTag(elem);
					case DomType.Drawing: return this.renderDrawing(elem);
					case DomType.Image: return this.renderImage(elem);
					case DomType.Text: return this.renderText(elem);
					case DomType.Text: return this.renderText(elem);
					case DomType.DeletedText: return this.renderDeletedText(elem);
					case DomType.Tab: return this.renderTab(elem);
					case DomType.Symbol: return this.renderSymbol(elem);
					case DomType.Break: return this.renderBreak(elem);
					case DomType.Footer: return this.renderContainer(elem, "footer");
					case DomType.Header: return this.renderContainer(elem, "header");
					case DomType.Footnote:
					case DomType.Endnote: return this.renderContainer(elem, "li");
					case DomType.FootnoteReference: return this.renderFootnoteReference(elem);
					case DomType.EndnoteReference: return this.renderEndnoteReference(elem);
					case DomType.NoBreakHyphen: return this.h({ tagName: "wbr" });
					case DomType.VmlPicture: return this.renderVmlPicture(elem);
					case DomType.VmlElement: return this.renderVmlElement(elem);
					case DomType.MmlMath: return this.renderContainerNS(elem, ns.mathML, "math", { xmlns: ns.mathML });
					case DomType.MmlMathParagraph: return this.renderContainer(elem, "span");
					case DomType.MmlFraction: return this.renderContainerNS(elem, ns.mathML, "mfrac");
					case DomType.MmlBase: return this.renderContainerNS(elem, ns.mathML, elem.parent.type == DomType.MmlMatrixRow ? "mtd" : "mrow");
					case DomType.MmlNumerator:
					case DomType.MmlDenominator:
					case DomType.MmlFunction:
					case DomType.MmlLimit:
					case DomType.MmlBox: return this.renderContainerNS(elem, ns.mathML, "mrow");
					case DomType.MmlGroupChar: return this.renderMmlGroupChar(elem);
					case DomType.MmlLimitLower: return this.renderContainerNS(elem, ns.mathML, "munder");
					case DomType.MmlMatrix: return this.renderContainerNS(elem, ns.mathML, "mtable");
					case DomType.MmlMatrixRow: return this.renderContainerNS(elem, ns.mathML, "mtr");
					case DomType.MmlRadical: return this.renderMmlRadical(elem);
					case DomType.MmlSuperscript: return this.renderContainerNS(elem, ns.mathML, "msup");
					case DomType.MmlSubscript: return this.renderContainerNS(elem, ns.mathML, "msub");
					case DomType.MmlDegree:
					case DomType.MmlSuperArgument:
					case DomType.MmlSubArgument: return this.renderContainerNS(elem, ns.mathML, "mn");
					case DomType.MmlFunctionName: return this.renderContainerNS(elem, ns.mathML, "ms");
					case DomType.MmlDelimiter: return this.renderMmlDelimiter(elem);
					case DomType.MmlRun: return this.renderMmlRun(elem);
					case DomType.MmlNary: return this.renderMmlNary(elem);
					case DomType.MmlPreSubSuper: return this.renderMmlPreSubSuper(elem);
					case DomType.MmlBar: return this.renderMmlBar(elem);
					case DomType.MmlEquationArray: return this.renderMllList(elem);
					case DomType.Inserted: return this.renderInserted(elem);
					case DomType.Deleted: return this.renderDeleted(elem);
					case DomType.CommentRangeStart: return this.renderCommentRangeStart(elem);
					case DomType.CommentRangeEnd: return this.renderCommentRangeEnd(elem);
					case DomType.CommentReference: return this.renderCommentReference(elem);
					case DomType.AltChunk: return this.renderAltChunk(elem);
				}
				return null;
			}
			renderElements(elems, into) {
				if (elems == null) return null;
				var result = elems.flatMap((e) => this.renderElement(e)).filter((e) => e != null);
				if (into) result.forEach((c) => into.appendChild(isString(c) ? document.createTextNode(c) : c));
				return result;
			}
			renderContainer(elem, tagName, props) {
				return this.h({
					tagName,
					children: this.renderElements(elem.children),
					...props
				});
			}
			renderContainerNS(elem, ns, tagName, props) {
				return this.h({
					ns,
					tagName,
					children: this.renderElements(elem.children),
					...props
				});
			}
			renderParagraph(elem) {
				var result = this.toHTML(elem, ns.html, "p");
				const style = this.findStyle(elem.styleName);
				elem.tabs ?? (elem.tabs = style?.paragraphProps?.tabs);
				const numbering = elem.numbering ?? style?.paragraphProps?.numbering;
				if (numbering) result.classList.add(this.numberingClass(numbering.id, numbering.level));
				return result;
			}
			renderHyperlink(elem) {
				const res = this.toH(elem, ns.html, "a");
				res.href = "";
				if (elem.id) res.href = this.document.documentPart.rels.find((it) => it.id == elem.id && it.targetMode === "External")?.target ?? res.href;
				if (elem.anchor) res.href += `#${elem.anchor}`;
				return this.h(res);
			}
			renderSmartTag(elem) {
				return this.renderContainer(elem, "span");
			}
			renderCommentRangeStart(commentStart) {
				if (!this.options.renderComments) return null;
				const rng = new Range();
				this.commentHighlight?.add(rng);
				const result = this.h({
					tagName: "#comment",
					children: [`start of comment #${commentStart.id}`]
				});
				this.later(() => rng.setStart(result, 0));
				this.commentMap[commentStart.id] = rng;
				return result;
			}
			renderCommentRangeEnd(commentEnd) {
				if (!this.options.renderComments) return null;
				const rng = this.commentMap[commentEnd.id];
				const result = this.h({
					tagName: "#comment",
					children: [`end of comment #${commentEnd.id}`]
				});
				this.later(() => rng?.setEnd(result, 0));
				return result;
			}
			renderCommentReference(commentRef) {
				if (!this.options.renderComments) return null;
				var comment = this.document.commentsPart?.commentMap[commentRef.id];
				if (!comment) return null;
				const commentRefEl = this.h({
					tagName: "span",
					className: `${this.className}-comment-ref`,
					children: ["💬"]
				});
				const commentsContainerEl = this.h({
					tagName: "div",
					className: `${this.className}-comment-popover`,
					children: [
						this.h({
							tagName: "div",
							className: `${this.className}-comment-author`,
							children: [comment.author]
						}),
						this.h({
							tagName: "div",
							className: `${this.className}-comment-date`,
							children: [new Date(comment.date).toLocaleString()]
						}),
						...this.renderElements(comment.children)
					]
				});
				return this.h({
					tagName: "#fragment",
					children: [
						this.h({
							tagName: "#comment",
							children: [`comment #${comment.id} by ${comment.author} on ${comment.date}`]
						}),
						commentRefEl,
						commentsContainerEl
					]
				});
			}
			renderAltChunk(elem) {
				if (!this.options.renderAltChunks) return null;
				var result = this.h({ tagName: "iframe" });
				this.tasks.push(this.document.loadAltChunk(elem.id, this.currentPart).then((x) => {
					result.srcdoc = x;
				}));
				return result;
			}
			renderDrawing(elem) {
				var result = this.toHTML(elem, ns.html, "div");
				result.style.display = "inline-block";
				result.style.position = "relative";
				result.style.textIndent = "0px";
				return result;
			}
			renderImage(elem) {
				let result = this.toHTML(elem, ns.html, "img", []);
				let transform = elem.cssStyle?.transform;
				if (elem.srcRect && elem.srcRect.some((x) => x != 0)) {
					var [left, top, right, bottom] = elem.srcRect;
					transform = `scale(${1 / (1 - left - right)}, ${1 / (1 - top - bottom)})`;
					result.style["clip-path"] = `rect(${(100 * top).toFixed(2)}% ${(100 * (1 - right)).toFixed(2)}% ${(100 * (1 - bottom)).toFixed(2)}% ${(100 * left).toFixed(2)}%)`;
				}
				if (elem.rotation) transform = `rotate(${elem.rotation}deg) ${transform ?? ""}`;
				result.style.transform = transform?.trim();
				if (this.document) this.tasks.push(this.document.loadDocumentImage(elem.src, this.currentPart).then((x) => {
					result.src = x;
				}));
				return result;
			}
			renderText(elem) {
				return this.h(elem.text);
			}
			renderDeletedText(elem) {
				return this.options.renderChanges ? this.renderText(elem) : null;
			}
			renderBreak(elem) {
				return elem.break == "textWrapping" ? this.h({ tagName: "br" }) : null;
			}
			renderInserted(elem) {
				if (this.options.renderChanges) return this.renderChange(elem, "ins");
				return this.renderElements(elem.children);
			}
			renderDeleted(elem) {
				if (this.options.renderChanges) return this.renderChange(elem, "del");
				return null;
			}
			renderChange(elem, tag) {
				return this.renderContainer(elem, tag, { dateTime: elem.date });
			}
			renderSymbol(elem) {
				return this.h({
					tagName: "span",
					children: [String.fromCharCode(elem.char)],
					style: { fontFamily: elem.font }
				});
			}
			renderFootnoteReference(elem) {
				this.currentFootnoteIds.push(elem.id);
				return this.h({
					tagName: "sup",
					children: [`${this.currentFootnoteIds.length}`]
				});
			}
			renderEndnoteReference(elem) {
				this.currentEndnoteIds.push(elem.id);
				return this.h({
					tagName: "sup",
					children: [`${this.currentEndnoteIds.length}`]
				});
			}
			renderTab(elem) {
				var tabSpan = this.h({
					tagName: "span",
					children: [" "]
				});
				if (this.options.experimental) {
					tabSpan.className = this.tabStopClass();
					var stops = findParent(elem, DomType.Paragraph)?.tabs;
					this.currentTabs.push({
						stops,
						span: tabSpan
					});
				}
				return tabSpan;
			}
			renderBookmarkStart(elem) {
				return this.h({
					tagName: "span",
					id: elem.name
				});
			}
			renderRun(elem) {
				if (elem.fieldRun) return null;
				let children = this.renderElements(elem.children);
				if (elem.verticalAlign) children = [this.h({
					tagName: elem.verticalAlign,
					children: this.renderElements(elem.children)
				})];
				const result = this.toHTML(elem, ns.html, "span", children);
				if (elem.id) result.id = elem.id;
				return result;
			}
			renderTable(elem) {
				this.tableCellPositions.push(this.currentCellPosition);
				this.tableVerticalMerges.push(this.currentVerticalMerge);
				this.currentVerticalMerge = {};
				this.currentCellPosition = {
					col: 0,
					row: 0
				};
				const children = [];
				if (elem.columns) children.push(this.renderTableColumns(elem.columns));
				children.push(...this.renderElements(elem.children));
				this.currentVerticalMerge = this.tableVerticalMerges.pop();
				this.currentCellPosition = this.tableCellPositions.pop();
				return this.toHTML(elem, ns.html, "table", children);
			}
			renderTableColumns(columns) {
				const children = columns.map((x) => this.h({
					tagName: "col",
					style: { width: x.width }
				}));
				return this.h({
					tagName: "colgroup",
					children
				});
			}
			renderTableRow(elem) {
				this.currentCellPosition.col = 0;
				const children = [];
				if (elem.gridBefore) children.push(this.renderTableCellPlaceholder(elem.gridBefore));
				children.push(...this.renderElements(elem.children));
				if (elem.gridAfter) children.push(this.renderTableCellPlaceholder(elem.gridAfter));
				this.currentCellPosition.row++;
				return this.toHTML(elem, ns.html, "tr", children);
			}
			renderTableCellPlaceholder(colSpan) {
				return this.h({
					tagName: "td",
					colSpan,
					style: { border: "none" }
				});
			}
			renderTableCell(elem) {
				let result = this.toHTML(elem, ns.html, "td");
				const key = this.currentCellPosition.col;
				if (elem.verticalMerge) {
					if (elem.verticalMerge == "restart") {
						this.currentVerticalMerge[key] = result;
						result.rowSpan = 1;
					} else if (this.currentVerticalMerge[key]) {
						this.currentVerticalMerge[key].rowSpan += 1;
						result.style.display = "none";
					}
				} else this.currentVerticalMerge[key] = null;
				if (elem.span) result.colSpan = elem.span;
				this.currentCellPosition.col += result.colSpan;
				return result;
			}
			renderVmlPicture(elem) {
				return this.renderContainer(elem, "div");
			}
			renderVmlElement(elem) {
				var container = this.h({
					ns: ns.svg,
					tagName: "svg",
					style: elem.cssStyleText
				});
				const result = this.renderVmlChildElement(elem);
				if (elem.imageHref?.id) this.tasks.push(this.document?.loadDocumentImage(elem.imageHref.id, this.currentPart).then((x) => result.setAttribute("href", x)));
				container.appendChild(result);
				requestAnimationFrame(() => {
					const bb = container.firstElementChild.getBBox();
					container.setAttribute("width", `${Math.ceil(bb.x + bb.width)}`);
					container.setAttribute("height", `${Math.ceil(bb.y + bb.height)}`);
				});
				return container;
			}
			renderVmlChildElement(elem) {
				const result = this.createSvgElement(elem.tagName);
				Object.entries(elem.attrs).forEach(([k, v]) => result.setAttribute(k, v));
				for (let child of elem.children) if (child.type == DomType.VmlElement) result.appendChild(this.renderVmlChildElement(child));
				else result.appendChild(...asArray(this.renderElement(child)));
				return result;
			}
			renderMmlRadical(elem) {
				const base = elem.children.find((el) => el.type == DomType.MmlBase);
				if (elem.props?.hideDegree) return this.createMathMLElement("msqrt", null, this.renderElements([base]));
				const degree = elem.children.find((el) => el.type == DomType.MmlDegree);
				return this.createMathMLElement("mroot", null, this.renderElements([base, degree]));
			}
			renderMmlDelimiter(elem) {
				const children = [];
				children.push(this.createMathMLElement("mo", null, [elem.props.beginChar ?? "("]));
				children.push(...this.renderElements(elem.children));
				children.push(this.createMathMLElement("mo", null, [elem.props.endChar ?? ")"]));
				return this.createMathMLElement("mrow", null, children);
			}
			renderMmlNary(elem) {
				const children = [];
				const grouped = keyBy(elem.children, (x) => x.type);
				const sup = grouped[DomType.MmlSuperArgument];
				const sub = grouped[DomType.MmlSubArgument];
				const supElem = sup ? this.createMathMLElement("mo", null, asArray(this.renderElement(sup))) : null;
				const subElem = sub ? this.createMathMLElement("mo", null, asArray(this.renderElement(sub))) : null;
				const charElem = this.createMathMLElement("mo", null, [elem.props?.char ?? "∫"]);
				if (supElem || subElem) children.push(this.createMathMLElement("munderover", null, [
					charElem,
					subElem,
					supElem
				]));
				else if (supElem) children.push(this.createMathMLElement("mover", null, [charElem, supElem]));
				else if (subElem) children.push(this.createMathMLElement("munder", null, [charElem, subElem]));
				else children.push(charElem);
				children.push(...this.renderElements(grouped[DomType.MmlBase].children));
				return this.createMathMLElement("mrow", null, children);
			}
			renderMmlPreSubSuper(elem) {
				const children = [];
				const grouped = keyBy(elem.children, (x) => x.type);
				const sup = grouped[DomType.MmlSuperArgument];
				const sub = grouped[DomType.MmlSubArgument];
				const supElem = sup ? this.createMathMLElement("mo", null, asArray(this.renderElement(sup))) : null;
				const subElem = sub ? this.createMathMLElement("mo", null, asArray(this.renderElement(sub))) : null;
				const stubElem = this.createMathMLElement("mo", null);
				children.push(this.createMathMLElement("msubsup", null, [
					stubElem,
					subElem,
					supElem
				]));
				children.push(...this.renderElements(grouped[DomType.MmlBase].children));
				return this.createMathMLElement("mrow", null, children);
			}
			renderMmlGroupChar(elem) {
				const tagName = elem.props.verticalJustification === "bot" ? "mover" : "munder";
				const result = this.renderContainerNS(elem, ns.mathML, tagName);
				if (elem.props.char) result.appendChild(this.createMathMLElement("mo", null, [elem.props.char]));
				return result;
			}
			renderMmlBar(elem) {
				const style = {};
				switch (elem.props.position) {
					case "top":
						style.textDecoration = "overline";
						break;
					case "bottom": style.textDecoration = "underline";
				}
				return this.renderContainerNS(elem, ns.mathML, "mrow", { style });
			}
			renderMmlRun(elem) {
				return this.toHTML(elem, ns.mathML, "ms");
			}
			renderMllList(elem) {
				const children = this.renderElements(elem.children).map((x) => this.createMathMLElement("mtr", null, [this.createMathMLElement("mtd", null, [x])]));
				return this.toHTML(elem, ns.mathML, "mtable", children);
			}
			toH(elem, ns, tagName, children = null) {
				const { "$lang": lang, ...style } = elem.cssStyle ?? {};
				return {
					ns,
					tagName,
					className: cx(elem.className, elem.styleName && this.processStyleName(elem.styleName)),
					lang,
					style,
					children: children ?? this.renderElements(elem.children)
				};
			}
			toHTML(elem, ns, tagName, children = null) {
				return this.h(this.toH(elem, ns, tagName, children));
			}
			findStyle(styleName) {
				return styleName && this.styleMap?.[styleName];
			}
			numberingClass(id, lvl) {
				return `${this.className}-num-${id}-${lvl}`;
			}
			tabStopClass() {
				return `${this.className}-tab-stop`;
			}
			styleToString(selectors, values, cssText = null) {
				let result = `${selectors} {\r\n`;
				for (const key in values) {
					if (key.startsWith("$")) continue;
					result += `  ${key}: ${values[key]};\r\n`;
				}
				if (cssText) result += cssText;
				return result + "}\r\n";
			}
			numberingCounter(id, lvl) {
				return `${this.className}-num-${id}-${lvl}`;
			}
			levelTextToContent(text, suff, id, numformat) {
				return `"${text.replace(/%\d*/g, (s) => {
					let lvl = parseInt(s.substring(1), 10) - 1;
					return `"counter(${this.numberingCounter(id, lvl)}, ${numformat})"`;
				})}${{
					"tab": "\\9",
					"space": "\\a0"
				}[suff] ?? ""}"`;
			}
			numFormatToCssValue(format) {
				return {
					none: "none",
					bullet: "disc",
					decimal: "decimal",
					lowerLetter: "lower-alpha",
					upperLetter: "upper-alpha",
					lowerRoman: "lower-roman",
					upperRoman: "upper-roman",
					decimalZero: "decimal-leading-zero",
					aiueo: "katakana",
					aiueoFullWidth: "katakana",
					chineseCounting: "simp-chinese-informal",
					chineseCountingThousand: "simp-chinese-informal",
					chineseLegalSimplified: "simp-chinese-formal",
					chosung: "hangul-consonant",
					ideographDigital: "cjk-ideographic",
					ideographTraditional: "cjk-heavenly-stem",
					ideographLegalTraditional: "trad-chinese-formal",
					ideographZodiac: "cjk-earthly-branch",
					iroha: "katakana-iroha",
					irohaFullWidth: "katakana-iroha",
					japaneseCounting: "japanese-informal",
					japaneseDigitalTenThousand: "cjk-decimal",
					japaneseLegal: "japanese-formal",
					thaiNumbers: "thai",
					koreanCounting: "korean-hangul-formal",
					koreanDigital: "korean-hangul-formal",
					koreanDigital2: "korean-hanja-informal",
					hebrew1: "hebrew",
					hebrew2: "hebrew",
					hindiNumbers: "devanagari",
					ganada: "hangul",
					taiwaneseCounting: "cjk-ideographic",
					taiwaneseCountingThousand: "cjk-ideographic",
					taiwaneseDigital: "cjk-decimal"
				}[format] ?? format;
			}
			refreshTabStops() {
				if (!this.options.experimental) return;
				setTimeout(() => {
					const pixelToPoint = computePixelToPoint();
					for (let tab of this.currentTabs) updateTabStop(tab.span, tab.stops, this.defaultTabSize, pixelToPoint);
				}, 500);
			}
			createElementNS(ns, tagName, props, children) {
				return this.h({
					ns,
					tagName,
					children,
					...props
				});
			}
			createElement(tagName, props, children) {
				return this.createElementNS(ns.html, tagName, props, children);
			}
			createMathMLElement(tagName, props, children) {
				return this.createElementNS(ns.mathML, tagName, props, children);
			}
			createSvgElement(tagName, props, children) {
				return this.createElementNS(ns.svg, tagName, props, children);
			}
			later(func) {
				this.postRenderTasks.push(func);
			}
		};
		defaultOptions = {
			ignoreHeight: false,
			ignoreWidth: false,
			ignoreFonts: false,
			breakPages: true,
			debug: false,
			experimental: false,
			className: "docx",
			inWrapper: true,
			hideWrapperOnPrint: false,
			trimXmlDeclaration: true,
			ignoreLastRenderedPageBreak: true,
			renderHeaders: true,
			renderFooters: true,
			renderFootnotes: true,
			renderEndnotes: true,
			useBase64URL: false,
			renderChanges: false,
			renderComments: false,
			renderAltChunks: true,
			h
		};
	}));
	//#endregion
	//#region src/client/docx-view.tsx
	/**
	* The .docx preview component: renders via docx-preview (preserved
	* styles/images/tables). Lives in its own module (split out of the former
	* office-view.tsx) so it builds as a standalone lazy chunk
	* (`lib/client-docx.js`) — the library is loaded only when a .docx is first
	* opened, and never pulls in the Univer/xlsx stack.
	*
	* Errors degrade to the shared download-button affordance, so a corrupted /
	* encrypted / oversized file always leaves the user with a way to get it.
	*/
	/**
	* Render a .docx file via docx-preview. The library renders into a container
	* div (no canvas); images and styles are inlined. Unmounting clears the
	* container's innerHTML — docx-preview has no dispose API, but tearing down
	* the DOM is enough.
	*/
	function DocxView(props) {
		const { scope, path, title } = props;
		const viewportRef = (0, react.useRef)(null);
		const wrapRef = (0, react.useRef)(null);
		const [load, setLoad] = (0, react.useState)({ status: "loading" });
		const [zoom, setZoom] = (0, react.useState)(100);
		(0, react.useEffect)(() => {
			let cancelled = false;
			const container = viewportRef.current;
			const wrap = wrapRef.current;
			if (container === null || wrap === null) return;
			setZoom(100);
			(async () => {
				try {
					const response = await fetch(mediaUrl(scope, path));
					if (cancelled) return;
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const buf = await response.arrayBuffer();
					if (cancelled) return;
					const { renderAsync } = await Promise.resolve().then(() => (init_docx_preview(), docx_preview_exports));
					await renderAsync(buf, wrap, void 0, {
						className: "docx",
						inWrapper: true,
						ignoreWidth: false,
						ignoreHeight: false,
						breakPages: true,
						experimental: false
					});
					if (!cancelled) setLoad({ status: "ready" });
				} catch (error) {
					if (!cancelled) setLoad({
						status: "error",
						message: error instanceof Error ? error.message : String(error)
					});
				}
			})();
			return () => {
				cancelled = true;
				if (wrap !== null) wrap.innerHTML = "";
			};
		}, [
			scope.sessionId,
			scope.cwd,
			path
		]);
		(0, react.useEffect)(() => {
			const viewport = viewportRef.current;
			if (viewport === null) return;
			const onWheel = (event) => {
				if (!event.altKey) return;
				event.preventDefault();
				const delta = event.deltaY < 0 ? 10 : -10;
				setZoom((current) => Math.max(50, Math.min(200, current + delta)));
			};
			viewport.addEventListener("wheel", onWheel, { passive: false });
			return () => {
				viewport.removeEventListener("wheel", onWheel);
			};
		}, []);
		return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: sidebar_module_css_default.editorDocx,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sidebar_module_css_default.editorDocxViewport,
				ref: viewportRef,
				children: [
					load.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.editorPlaceholder,
						children: t("loading")
					}),
					load.status === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BinaryFallback, {
						scope,
						path,
						message: load.message
					}),
					load.status !== "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.editorDocxWrap,
						ref: wrapRef,
						"aria-label": title,
						style: { zoom: zoom / 100 }
					})
				]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sidebar_module_css_default.editorDocxZoom,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sidebar_module_css_default.editorDocxZoomHint,
						children: t("zoomHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: sidebar_module_css_default.editorDocxZoomRange,
						type: "range",
						min: 50,
						max: 200,
						step: 10,
						value: zoom,
						"aria-label": t("zoom"),
						onChange: (event) => {
							setZoom(Number(event.currentTarget.value));
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: sidebar_module_css_default.editorDocxZoomValue,
						children: [zoom, "%"]
					})
				]
			})]
		});
	}
	//#endregion
	exports.DocxView = DocxView;
	return module.exports;
};

//# sourceMappingURL=client-docx.js.map