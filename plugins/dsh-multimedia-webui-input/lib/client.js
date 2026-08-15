window.__ModuleLoader__.load({
  id: '@dsh-community/multimedia-webui-input',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    const SOURCE = 'multimedia-webui-input';
    const API = '/community-multimedia-webui-input/v1';
    const records = new Map();
    const listeners = new Set();
    let revision = 0;

    const css = `
      .dshca-wrap{position:relative;display:inline-flex;align-items:center}
      .dshca-button{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:0}
      .dshca-button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
      .dshca-button:disabled{opacity:.4;cursor:default}
      .dshca-menu{position:absolute;left:0;bottom:34px;z-index:20;min-width:142px;padding:5px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);box-shadow:var(--dsw-shadow-lv3);display:grid;gap:2px}
      .dshca-menu button{border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:28px;text-align:left;padding:0 9px;cursor:pointer}
      .dshca-menu button:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .dshca-dock{box-sizing:border-box;width:calc(100% - 32px);max-width:var(--dsh-composer-card-max-width,960px);margin:0 auto;display:flex;flex-wrap:wrap;gap:6px;padding:0 2px 6px}
      .dshca-dock:has(+ * .dshca-hero-dock){display:none}
      [data-composer-card]:has(.dshca-hero-dock){margin-top:38px}
      .dshca-hero-dock{position:absolute;left:16px;right:16px;bottom:6px;z-index:10;display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;pointer-events:none}
      .dshca-hero-dock .dshca-chip{pointer-events:auto}
      .dshca-chip{max-width:100%;min-width:min(180px,100%);height:32px;box-sizing:border-box;display:flex;align-items:center;gap:7px;padding:0 7px 0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-specific-tip);color:var(--dsw-alias-label-primary);font-size:12px}
      .dshca-chip[data-status=uploading]{border-color:var(--dsw-alias-state-business-primary)}
      .dshca-chip[data-status=error]{border-color:var(--dsw-alias-state-error-primary)}
      .dshca-chip-icon{flex:none;display:inline-flex;align-items:center;color:var(--dsw-alias-label-secondary)}
      .dshca-chip-icon svg{width:14px;height:14px}
      .dshca-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:320px}
      .dshca-meta{flex:none;color:var(--dsw-alias-label-caption);white-space:nowrap}
      .dshca-remove{flex:none;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-caption);cursor:pointer;padding:0;font-size:16px;line-height:1}
      .dshca-remove:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .dshca-error{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-state-error-primary)}
      .dshca-settings{display:flex;flex-direction:column;gap:18px;width:100%;color:var(--dsw-alias-label-primary)}
      .dshca-settings-head{display:flex;flex-direction:column;gap:5px}
      .dshca-settings-title{font-size:18px;line-height:26px;font-weight:600}
      .dshca-settings-copy{max-width:620px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
      .dshca-settings-card{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:16px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1)}
      .dshca-settings-scope{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:-10px;color:var(--dsw-alias-label-secondary);font-size:12px}
      .dshca-stat{display:flex;flex-direction:column;gap:4px;min-width:0}
      .dshca-stat strong{font-size:20px;line-height:28px;font-weight:600;font-variant-numeric:tabular-nums}
      .dshca-stat span{color:var(--dsw-alias-label-caption);font-size:12px}
      .dshca-settings-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .dshca-settings-action{height:32px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}
      .dshca-settings-action:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .dshca-settings-action[data-danger=true]{color:var(--dsw-alias-state-error-primary)}
      .dshca-settings-action:disabled{opacity:.45;cursor:default}
      .dshca-settings-status{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
      @media(max-width:720px){.dshca-settings-card{grid-template-columns:1fr}.dshca-dock{width:calc(100% - 16px)}}
    `;

    if (document.querySelector('style[data-plugin-css="@dsh-community/multimedia-webui-input"]') === null) {
      const style = document.createElement('style');
      style.dataset.plugin = '@dsh-community/multimedia-webui-input';
      style.dataset.pluginCss = '@dsh-community/multimedia-webui-input';
      style.textContent = css;
      document.head.appendChild(style);
    }

    function changed() {
      revision += 1;
      for (const listener of [...listeners]) listener();
    }

    function useRevision() {
      return React.useSyncExternalStore(
        listener => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => revision,
        () => revision,
      );
    }

    function id() {
      return globalThis.crypto?.randomUUID?.()
        ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }

    function humanBytes(value) {
      if (value < 1024) return `${value} B`;
      const units = ['KiB', 'MiB', 'GiB', 'TiB'];
      let next = value / 1024;
      let unit = units[0];
      for (let index = 1; index < units.length && next >= 1024; index += 1) {
        next /= 1024;
        unit = units[index];
      }
      return `${next >= 10 ? next.toFixed(0) : next.toFixed(1)} ${unit}`;
    }

    function compactReferenceLabel(label) {
      const prefix = label.length > 8 ? `${label.slice(0, 8)}…` : label;
      return `📎 ${prefix}`;
    }

    function normalizeRelativePath(value, fallback) {
      const path = (value || fallback).replaceAll('\\', '/').replace(/^\/+/, '');
      const parts = path.split('/').filter(Boolean);
      if (parts.length === 0 || parts.some(part => part === '.' || part === '..')) {
        throw new Error(`Unsafe attachment path: ${path}`);
      }
      return parts.join('/');
    }

    function validateItems(items) {
      if (items.length === 0) throw new Error('No files were selected');
      if (items.length > 10_000) throw new Error('Selection exceeds 10,000 files');
      let total = 0;
      const paths = new Set();
      for (const item of items) {
        if (item.path.split('/').length > 64) throw new Error(`${item.path} exceeds 64 directory levels`);
        if (item.file.size > 1024 ** 3) throw new Error(`${item.path} exceeds 1 GiB`);
        total += item.file.size;
        if (total > 2 * 1024 ** 3) throw new Error('Selection exceeds 2 GiB');
        if (paths.has(item.path)) throw new Error(`Duplicate attachment path: ${item.path}`);
        paths.add(item.path);
      }
      return total;
    }

    function filesFromList(list) {
      return [...list].map(file => ({
        file,
        path: normalizeRelativePath(file.webkitRelativePath, file.name),
      }));
    }

    function entryFile(entry) {
      return new Promise((resolve, reject) => entry.file(resolve, reject));
    }

    async function readAllEntries(reader) {
      const output = [];
      while (true) {
        const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0) return output;
        output.push(...batch);
      }
    }

    async function walkEntry(entry, prefix = '') {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isFile) {
        const file = await entryFile(entry);
        return [{ file, path: normalizeRelativePath(relative, file.name) }];
      }
      if (!entry.isDirectory) return [];
      const children = await readAllEntries(entry.createReader());
      const nested = await Promise.all(children.map(child => walkEntry(child, relative)));
      return nested.flat();
    }

    async function filesFromDrop(dataTransfer) {
      const itemEntries = [...dataTransfer.items]
        .filter(item => item.kind === 'file')
        .map(item => item.webkitGetAsEntry?.())
        .filter(Boolean);
      if (itemEntries.length === 0) return filesFromList(dataTransfer.files);
      const nested = await Promise.all(itemEntries.map(entry => walkEntry(entry)));
      return nested.flat();
    }

    async function responseJson(response) {
      let value;
      try {
        value = await response.json();
      } catch {
        throw new Error(`Attachment Host returned HTTP ${response.status}`);
      }
      if (!response.ok || value?.ok !== true) {
        throw new Error(value?.error?.message ?? `Attachment Host returned HTTP ${response.status}`);
      }
      return value;
    }

    function modelMessage(committed) {
      const visible = committed.files.slice(0, 50);
      const lines = [
        committed.root,
        '',
        'DSH_MULTIMEDIA_INPUT_V1',
        `Files: ${committed.files.length}`,
        `Manifest: ${committed.manifest.slice(committed.root.length + 1)}`,
        'Attached files (paths are relative to the root above):',
        ...visible.map(file => `- ${JSON.stringify(file.actualPath)} (${humanBytes(file.size)})${file.originalPath === file.actualPath ? '' : `; original=${JSON.stringify(file.originalPath)}`}`),
      ];
      if (committed.files.length > visible.length) {
        lines.push(`- ... ${committed.files.length - visible.length} more; read the manifest for the complete mapping`);
      }
      return lines.join('\n');
    }

    async function upload(record, signal) {
      if (record.committed !== undefined) return record.modelText;
      if (record.inflight !== undefined) return record.inflight;
      const task = (async () => {
        record.status = 'uploading';
        record.error = undefined;
        record.uploaded = 0;
        changed();
        let batchId;
        try {
          const created = await responseJson(await fetch(`${API}/batches`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionId: record.sessionId,
              files: record.items.map(item => ({
                path: item.path,
                size: item.file.size,
                type: item.file.type,
                lastModified: item.file.lastModified,
              })),
            }),
            signal,
          }));
          batchId = created.batchId;
          let cursor = 0;
          const worker = async () => {
            while (cursor < record.items.length) {
              const index = cursor++;
              const item = record.items[index];
              await responseJson(await fetch(`${API}/batches/${encodeURIComponent(batchId)}/files/${index}`, {
                method: 'PUT',
                headers: { 'content-type': 'application/octet-stream' },
                body: item.file,
                signal,
              }));
              record.uploaded += 1;
              changed();
            }
          };
          await Promise.all(Array.from({ length: Math.min(2, record.items.length) }, worker));
          const committed = await responseJson(await fetch(
            `${API}/batches/${encodeURIComponent(batchId)}/commit`,
            { method: 'POST', signal },
          ));
          record.committed = committed;
          record.modelText = modelMessage(committed);
          record.status = 'uploaded';
          changed();
          return record.modelText;
        } catch (cause) {
          if (batchId !== undefined) {
            fetch(`${API}/batches/${encodeURIComponent(batchId)}`, { method: 'DELETE' }).catch(() => {});
          }
          record.status = 'error';
          record.error = cause instanceof Error ? cause.message : String(cause);
          changed();
          throw cause;
        } finally {
          record.inflight = undefined;
        }
      })();
      record.inflight = task;
      return task;
    }

    function pick(kind, onFiles, onError) {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      if (kind === 'folder') input.setAttribute('webkitdirectory', '');
      input.addEventListener('change', () => {
        try {
          onFiles(filesFromList(input.files ?? []));
        } catch (cause) {
          onError(cause);
        }
      }, { once: true });
      input.click();
    }

    function Paperclip() {
      return h('svg', { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M5.2 8.6 9.8 4a2.1 2.1 0 1 1 3 3l-5.9 5.9a3.4 3.4 0 0 1-4.8-4.8l6-6',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }));
    }

    function AttachButton(props) {
      const [open, setOpen] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [message, setMessage] = React.useState('');
      const locked = props.input.phase !== 'plain';

      const accept = React.useCallback(async (itemsOrPromise) => {
        setBusy(true);
        setMessage('');
        try {
          const items = await itemsOrPromise;
          await props.add(items);
          setOpen(false);
        } catch (cause) {
          setMessage(cause instanceof Error ? cause.message : String(cause));
        } finally {
          setBusy(false);
        }
      }, [props.add]);

      React.useEffect(() => {
        const dragover = event => {
          const target = event.target instanceof Element ? event.target.closest('[data-composer-card]') : null;
          if (target === null || locked) return;
          if ([...event.dataTransfer.items].some(item => item.kind === 'file')) event.preventDefault();
        };
        const drop = event => {
          const target = event.target instanceof Element ? event.target.closest('[data-composer-card]') : null;
          if (target === null || locked) return;
          event.preventDefault();
          void accept(filesFromDrop(event.dataTransfer));
        };
        document.addEventListener('dragover', dragover);
        document.addEventListener('drop', drop);
        return () => {
          document.removeEventListener('dragover', dragover);
          document.removeEventListener('drop', drop);
        };
      }, [accept, locked]);

      return h('div', { className: 'dshca-wrap' },
        h('button', {
          type: 'button',
          className: 'dshca-button',
          title: message || 'Attach files or a folder',
          'aria-label': message || 'Attach files or a folder',
          'aria-expanded': open,
          disabled: locked || busy,
          onClick: () => setOpen(value => !value),
        }, h(Paperclip)),
        open && h('div', { className: 'dshca-menu', role: 'menu' },
          h('button', {
            type: 'button',
            role: 'menuitem',
            onClick: () => pick('files', items => void accept(items), cause => setMessage(String(cause))),
          }, 'Choose files'),
          h('button', {
            type: 'button',
            role: 'menuitem',
            onClick: () => pick('folder', items => void accept(items), cause => setMessage(String(cause))),
          }, 'Choose folder')));
    }

    function AttachmentChips(props, className) {
      const occurrences = props.input.occurrences.filter(item => item.source === SOURCE);
      if (occurrences.length === 0) return null;
      return h('div', { className }, ...occurrences.map(occurrence => {
        const record = records.get(occurrence.ref);
        const status = record?.status ?? 'missing';
        const meta = status === 'uploading'
          ? `${record.uploaded}/${record.items.length}`
          : status === 'uploaded' ? 'copied' : record === undefined ? 'unavailable' : humanBytes(record.total);
        return h('div', { className: 'dshca-chip', 'data-status': status, key: occurrence.occurrenceId },
          h('span', { className: 'dshca-chip-icon', 'aria-hidden': true }, h(Paperclip)),
          h('span', { className: 'dshca-name', title: record?.label ?? occurrence.label }, record?.label ?? occurrence.label),
          h('span', { className: status === 'error' ? 'dshca-error' : 'dshca-meta', title: record?.error },
            status === 'error' ? record.error : meta),
          h('button', {
            type: 'button',
            className: 'dshca-remove',
            'aria-label': `Remove ${record?.label ?? occurrence.label}`,
            disabled: props.input.phase !== 'plain',
            onClick: () => props.remove(occurrence),
          }, '×'));
      }));
    }

    function AttachmentDock(props) {
      useRevision();
      return AttachmentChips(props, 'dshca-dock');
    }

    function AttachmentHeroDock(props) {
      useRevision();
      const blank = props.useSession(snapshot => snapshot.blank);
      const input = props.useInput(snapshot => snapshot);
      if (!blank || input === undefined) return null;
      return AttachmentChips({ input, remove: props.remove }, 'dshca-hero-dock');
    }

    function attachmentCopy() {
      const zh = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh');
      return zh ? {
        nav: '多媒体输入',
        title: '多媒体输入与文件管理',
        copy: '附件只在发送时复制到当前会话工作区；从输入框删除的附件不会上传。空间统计仅在打开本页或手动刷新时执行。',
        sends: '已发送批次',
        files: '文件',
        size: '占用空间',
        refresh: '刷新统计',
        currentScope: '当前会话',
        workspaceScope: usage => `当前工作区 · ${usage.sessionDirectories} 个有附件的会话`,
        cleanCurrent: '清理当前会话附件',
        cleanWorkspace: '清理当前工作区全部会话附件',
        confirmCurrent: '将只删除当前会话中由 DSH Multimedia WebUI Input 创建的临时附件。请再次点击确认。',
        confirmWorkspace: '将删除当前工作区所有会话由 DSH Multimedia WebUI Input 创建的临时附件；不会影响其他工作区。请再次点击确认。',
        confirmCurrentButton: '再次点击：清理当前会话',
        confirmWorkspaceButton: '再次点击：清理当前工作区',
        cancel: '取消',
        noSession: '请先打开一个会话。',
        loading: '正在读取当前会话附件…',
        cleanedCurrent: result => `已清理当前会话 ${result.deletedFiles} 个文件（${humanBytes(result.deletedBytes)}）。`,
        cleanedWorkspace: result => `已清理当前工作区 ${result.deletedSessionDirectories} 个会话目录、${result.deletedFiles} 个文件（${humanBytes(result.deletedBytes)}）。`,
      } : {
        nav: 'Multimedia input',
        title: 'Multimedia input & file management',
        copy: 'Attachments are copied into the active workspace only when you send. Removing one from the composer cancels it. Usage is read only when this page opens or you refresh it.',
        sends: 'Sent batches',
        files: 'Files',
        size: 'Disk usage',
        refresh: 'Refresh usage',
        currentScope: 'Active session',
        workspaceScope: usage => `Active workspace · ${usage.sessionDirectories} sessions with attachments`,
        cleanCurrent: 'Clean active session',
        cleanWorkspace: 'Clean every session in this workspace',
        confirmCurrent: 'Only temporary attachments created by DSH Multimedia WebUI Input in the active session will be deleted. Click again to confirm.',
        confirmWorkspace: 'Temporary attachments created by DSH Multimedia WebUI Input in every session in this workspace will be deleted. Other workspaces are not affected. Click again to confirm.',
        confirmCurrentButton: 'Confirm: clean active session',
        confirmWorkspaceButton: 'Confirm: clean workspace',
        cancel: 'Cancel',
        noSession: 'Open a session first.',
        loading: 'Reading attachments for the active session…',
        cleanedCurrent: result => `Removed ${result.deletedFiles} files from the active session (${humanBytes(result.deletedBytes)}).`,
        cleanedWorkspace: result => `Removed ${result.deletedFiles} files from ${result.deletedSessionDirectories} session directories in this workspace (${humanBytes(result.deletedBytes)}).`,
      };
    }

    async function sessionRequest(path, sessionId, signal) {
      return responseJson(await fetch(`${API}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
        signal,
      }));
    }

    function AttachmentSettings(props) {
      const copy = attachmentCopy();
      const list = React.useSyncExternalStore(
        listener => props.sessions.list.subscribe(listener),
        () => props.sessions.list.getSnapshot(),
        () => props.sessions.list.getSnapshot(),
      );
      const sessionId = list.current;
      const [usage, setUsage] = React.useState({ sends: 0, files: 0, bytes: 0 });
      const [workspaceUsage, setWorkspaceUsage] = React.useState({ sessionDirectories: 0, sends: 0, files: 0, bytes: 0 });
      const [status, setStatus] = React.useState(sessionId === undefined ? copy.noSession : copy.loading);
      const [busy, setBusy] = React.useState(false);
      const [confirming, setConfirming] = React.useState(null);

      const load = React.useCallback(async (signal) => {
        if (sessionId === undefined) {
          setUsage({ sends: 0, files: 0, bytes: 0 });
          setWorkspaceUsage({ sessionDirectories: 0, sends: 0, files: 0, bytes: 0 });
          setStatus(copy.noSession);
          return;
        }
        setBusy(true);
        setStatus(copy.loading);
        try {
          const [next, workspace] = await Promise.all([
            sessionRequest('/usage/session', sessionId, signal),
            sessionRequest('/usage/workspace', sessionId, signal),
          ]);
          setUsage({ sends: next.sends, files: next.files, bytes: next.bytes });
          setWorkspaceUsage({
            sessionDirectories: workspace.sessionDirectories,
            sends: workspace.sends,
            files: workspace.files,
            bytes: workspace.bytes,
          });
          setStatus('');
        } catch (cause) {
          if (cause?.name !== 'AbortError') setStatus(cause instanceof Error ? cause.message : String(cause));
        } finally {
          if (!signal?.aborted) setBusy(false);
        }
      }, [sessionId]);

      React.useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
      }, [load]);

      const clean = async (scope) => {
        if (sessionId === undefined) return;
        if (confirming !== scope) {
          setConfirming(scope);
          setStatus(scope === 'session' ? copy.confirmCurrent : copy.confirmWorkspace);
          return;
        }
        setConfirming(null);
        setBusy(true);
        setStatus('');
        try {
          const result = await sessionRequest(`/cleanup/${scope}`, sessionId);
          if (scope === 'workspace') {
            setUsage({ sends: 0, files: 0, bytes: 0 });
            setWorkspaceUsage({ sessionDirectories: 0, sends: 0, files: 0, bytes: 0 });
            setStatus(copy.cleanedWorkspace(result));
          } else {
            setUsage({ sends: 0, files: 0, bytes: 0 });
            setWorkspaceUsage(current => ({
              sessionDirectories: Math.max(0, current.sessionDirectories - 1),
              sends: Math.max(0, current.sends - result.deletedSends),
              files: Math.max(0, current.files - result.deletedFiles),
              bytes: Math.max(0, current.bytes - result.deletedBytes),
            }));
            setStatus(copy.cleanedCurrent(result));
          }
        } catch (cause) {
          setStatus(cause instanceof Error ? cause.message : String(cause));
        } finally {
          setBusy(false);
        }
      };

      return h('div', { className: 'dshca-settings' },
        h('div', { className: 'dshca-settings-head' },
          h('div', { className: 'dshca-settings-title' }, copy.title),
          h('div', { className: 'dshca-settings-copy' }, copy.copy)),
        h('div', { className: 'dshca-settings-scope' }, h('span', null, copy.currentScope)),
        h('div', { className: 'dshca-settings-card' },
          h('div', { className: 'dshca-stat' }, h('strong', null, String(usage.sends)), h('span', null, copy.sends)),
          h('div', { className: 'dshca-stat' }, h('strong', null, String(usage.files)), h('span', null, copy.files)),
          h('div', { className: 'dshca-stat' }, h('strong', null, humanBytes(usage.bytes)), h('span', null, copy.size))),
        h('div', { className: 'dshca-settings-actions' },
          h('button', {
            type: 'button',
            className: 'dshca-settings-action',
            disabled: busy || sessionId === undefined,
            onClick: () => void load(),
          }, copy.refresh),
          h('button', {
            type: 'button',
            className: 'dshca-settings-action',
            'data-danger': true,
            disabled: busy || sessionId === undefined || usage.sends === 0,
            onClick: () => void clean('session'),
          }, confirming === 'session' ? copy.confirmCurrentButton : copy.cleanCurrent),
          h('button', {
            type: 'button',
            className: 'dshca-settings-action',
            'data-danger': true,
            disabled: busy || sessionId === undefined || workspaceUsage.sends === 0,
            onClick: () => void clean('workspace'),
          }, confirming === 'workspace' ? copy.confirmWorkspaceButton : copy.cleanWorkspace),
          confirming !== null && h('button', {
            type: 'button',
            className: 'dshca-settings-action',
            disabled: busy,
            onClick: () => {
              setConfirming(null);
              setStatus('');
            },
          }, copy.cancel)),
        h('div', { className: 'dshca-settings-status' }, copy.workspaceScope(workspaceUsage), ' · ', humanBytes(workspaceUsage.bytes)),
        status && h('div', { className: 'dshca-settings-status', role: 'status' }, status));
    }

    const inject = ['slots', 'conversation', 'sessions', 'slash'];

    function apply(ctx) {
      const sessions = ctx.get('sessions');
      const conversation = ctx.get('conversation');
      const slash = ctx.get('slash');

      const source = {
        trigger: '@',
        name: SOURCE,
        order: 1000,
        candidates: () => Promise.resolve([]),
        onPick: () => undefined,
        codec: {
          clipboardText: ref => records.get(ref)?.label ?? `attachment:${ref}`,
          serialize: (ref, signal) => {
            const record = records.get(ref);
            if (record === undefined) return Promise.reject(new Error('Attachment selection is no longer available in this browser tab'));
            return upload(record, signal);
          },
        },
      };
      ctx.effect(() => slash.registerSource(source), 'community-multimedia-webui-input: reference codec');

      const inputFor = sessionId => {
        const actx = sessions.scope(sessionId);
        if (actx === undefined) throw new Error(`Attachment session is not active: ${sessionId}`);
        return conversation.input.for(actx);
      };

      const add = async (sessionId, items) => {
        const total = validateItems(items);
        const input = inputFor(sessionId);
        let snapshot = input.state.getSnapshot();
        if (snapshot.phase !== 'plain') throw new Error('Wait for the current input operation to finish');
        if (snapshot.draft !== '' && !/\s$/u.test(snapshot.draft)) {
          input.setDraft(`${snapshot.draft} `);
          snapshot = input.state.getSnapshot();
        }
        const ref = id();
        const roots = new Set(items.map(item => item.path.split('/')[0]));
        const label = items.length === 1
          ? items[0].path
          : roots.size === 1 ? `${[...roots][0]} · ${items.length} files` : `${items.length} files`;
        const record = { ref, sessionId, items, total, label, status: 'ready', uploaded: 0 };
        records.set(ref, record);
        const accepted = input.insertReference({
          source: SOURCE,
          ref,
          // DSH's textarea reference cell is a fixed-width compact chip. Keep
          // both the file affordance and the beginning of its name visible;
          // the full label and size remain in our dock immediately above it.
          label: compactReferenceLabel(label),
          clipboardText: `[attachment: ${label}]`,
        }, {
          start: snapshot.draft.length,
          end: snapshot.draft.length,
          draftRev: snapshot.draftRev,
        });
        if (!accepted) {
          records.delete(ref);
          throw new Error('The DSH composer changed before the attachment could be inserted');
        }
        if (typeof input.state.subscribe === 'function') {
          const unsubscribe = input.state.subscribe(() => {
            const current = input.state.getSnapshot();
            const alive = current.occurrences.some(occurrence => occurrence.source === SOURCE && occurrence.ref === ref);
            if (alive || record.inflight !== undefined) return;
            unsubscribe();
            records.delete(ref);
            changed();
          });
        }
        changed();
      };

      const remove = (sessionId, occurrence) => {
        const input = inputFor(sessionId);
        const snapshot = input.state.getSnapshot();
        if (snapshot.phase !== 'plain') return;
        input.setDraft(snapshot.draft.slice(0, occurrence.offset) + snapshot.draft.slice(occurrence.offset + 1));
        records.delete(occurrence.ref);
        changed();
      };

      ctx.inject(['slots', 'conversation', 'sessions', 'slash'], scope => {
        scope.slots.inject('conversation.input.left', () => scope.slots.register({
          name: 'conversation.input.left',
          id: 'community-multimedia-webui-input-button',
          order: -100,
          inject: sessionId => ({ add: items => add(sessionId, items) }),
        }, AttachButton));
        scope.slots.inject('conversation.input.dock', () => scope.slots.register({
          name: 'conversation.input.dock',
          id: 'community-multimedia-webui-input-dock',
          order: 5,
          inject: sessionId => ({ remove: occurrence => remove(sessionId, occurrence) }),
        }, AttachmentDock));
        scope.slots.inject('conversation.input.overlay', () => scope.slots.register({
          name: 'conversation.input.overlay',
          id: 'community-multimedia-webui-input-hero-dock',
          order: -100,
          inject: sessionId => ({ remove: occurrence => remove(sessionId, occurrence) }),
        }, AttachmentHeroDock));
        scope.slots.inject('settings.section', () => scope.slots.register({
          name: 'settings.section',
          id: 'attachments',
          order: 20,
          label: () => attachmentCopy().nav,
          inject: () => ({ sessions }),
        }, AttachmentSettings));
      });
    }

    return { apply, inject };
  },
});
