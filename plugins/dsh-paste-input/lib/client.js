window.__ModuleLoader__.load({
  id: '@dsh-community/dsh-paste-input',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    const SOURCE = 'dsh-paste-input';
    const API = '/dsh-paste-input/v1';
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
      .dshca-notice-overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}
      .dshca-notice{width:min(420px,calc(100vw - 48px));box-sizing:border-box;padding:18px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-base);box-shadow:var(--dsw-shadow-lv3);display:flex;flex-direction:column;gap:10px;color:var(--dsw-alias-label-primary)}
      .dshca-notice-title{font-size:15px;font-weight:600}
      .dshca-notice-copy{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
      .dshca-notice-check{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}
      .dshca-notice-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:2px}
      .dshca-notice-actions button{height:30px;padding:0 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}
      .dshca-notice-actions button:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .dshca-notice-actions .dshca-notice-ok{background:var(--dsw-alias-state-business-primary);border-color:transparent;color:#fff}
      .dshca-toast{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:100;max-width:min(560px,calc(100vw - 48px));box-sizing:border-box;padding:9px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;pointer-events:none;opacity:0;transition:opacity .18s ease}
      .dshca-toast[data-show=true]{opacity:1}
      .dshca-chat-attachments{display:flex;flex-wrap:wrap;gap:6px;padding:0}
      .dshca-chat-chip{position:relative;max-width:100%;min-width:0;height:30px;box-sizing:border-box;display:inline-flex;align-items:center;gap:7px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-specific-tip);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer}
      .dshca-chat-chip:hover{border-color:var(--dsw-alias-state-business-primary)}
      .dshca-chat-chip-icon{flex:none;display:inline-flex;align-items:center;color:var(--dsw-alias-label-secondary)}
      .dshca-chat-chip-icon svg{width:14px;height:14px}
      .dshca-chat-chip-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dshca-chat-chip-meta{flex:none;color:var(--dsw-alias-label-caption);white-space:nowrap}
      .dshca-chat-tip{display:none;position:absolute;bottom:calc(100% + 6px);left:0;z-index:40;min-width:260px;max-width:min(520px,78vw);box-sizing:border-box;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);box-shadow:var(--dsw-shadow-lv3);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-all;pointer-events:none}
      .dshca-chat-chip:hover .dshca-chat-tip{display:block}
      [data-paste-folded="1"]{display:none!important}
      .dshca-chat-usertext{flex:0 0 100%;white-space:pre-wrap;word-break:break-word;color:inherit;font:inherit}
    `;

    if (document.querySelector('style[data-plugin-css="@dsh-community/dsh-paste-input"]') === null) {
      const style = document.createElement('style');
      style.dataset.plugin = '@dsh-community/dsh-paste-input';
      style.dataset.pluginCss = '@dsh-community/dsh-paste-input';
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
        // Leading/trailing blank lines keep the markers on their own lines
        // even when the user typed words right before/after the chip.
        '',
        '==== DSH_PASTE_INPUT_V1 ====',
        committed.root,
        '',
        `Files: ${committed.files.length}`,
        `Manifest: ${committed.manifest.slice(committed.root.length + 1)}`,
        'Attached files (paths are relative to the root above):',
        ...visible.map(file => `- ${JSON.stringify(file.actualPath)} (${humanBytes(file.size)})${file.originalPath === file.actualPath ? '' : `; original=${JSON.stringify(file.originalPath)}`}`),
      ];
      if (committed.files.length > visible.length) {
        lines.push(`- ... ${committed.files.length - visible.length} more; read the manifest for the complete mapping`);
      }
      lines.push('==== END DSH_PASTE_INPUT ====', '');
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

        // ── paste support: clipboard files (screenshots, copied images) ──────────
    const NOTICE_KEY = 'dsh-paste-input.notice-dismissed.v1';
    let noticeDismissed = false;
    try { noticeDismissed = localStorage.getItem(NOTICE_KEY) === '1'; } catch { /* storage unavailable */ }

    function showToast(message) {
      const toast = document.createElement('div');
      toast.className = 'dshca-toast';
      toast.textContent = message;
      document.body.appendChild(toast);
      requestAnimationFrame(() => { toast.dataset.show = 'true'; });
      setTimeout(() => {
        toast.dataset.show = 'false';
        setTimeout(() => toast.remove(), 220);
      }, 4000);
    }

    function showPasteNotice(onConfirm, onCancel) {
      const overlay = document.createElement('div');
      overlay.className = 'dshca-notice-overlay';
      const card = document.createElement('div');
      card.className = 'dshca-notice';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-label', '粘贴文件提示');
      const title = document.createElement('div');
      title.className = 'dshca-notice-title';
      title.textContent = '粘贴文件提示';
      const copy = document.createElement('div');
      copy.className = 'dshca-notice-copy';
      copy.textContent = '你粘贴了图片或文件。DSH Paste Input 会把它们复制到当前会话工作区的临时附件目录（.dsh/tmp/attachments/），并在发送时随消息一起交给模型。';
      const label = document.createElement('label');
      label.className = 'dshca-notice-check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(' 我已了解，不再提示'));
      const actions = document.createElement('div');
      actions.className = 'dshca-notice-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'dshca-notice-cancel';
      cancel.textContent = '取消';
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'dshca-notice-ok';
      ok.textContent = '确定';
      actions.appendChild(cancel);
      actions.appendChild(ok);
      card.appendChild(title);
      card.appendChild(copy);
      card.appendChild(label);
      card.appendChild(actions);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      ok.addEventListener('click', () => {
        try { if (checkbox.checked) localStorage.setItem(NOTICE_KEY, '1'); } catch { /* storage unavailable */ }
        noticeDismissed = noticeDismissed || checkbox.checked;
        overlay.remove();
        onConfirm();
      });
      cancel.addEventListener('click', () => { overlay.remove(); onCancel?.(); });
      overlay.addEventListener('click', event => { if (event.target === overlay) { overlay.remove(); onCancel?.(); } });
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
        confirmCurrent: '将只删除当前会话中由 DSH Paste Input 创建的临时附件。请再次点击确认。',
        confirmWorkspace: '将删除当前工作区所有会话由 DSH Paste Input 创建的临时附件；不会影响其他工作区。请再次点击确认。',
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
        confirmCurrent: 'Only temporary attachments created by DSH Paste Input in the active session will be deleted. Click again to confirm.',
        confirmWorkspace: 'Temporary attachments created by DSH Paste Input in every session in this workspace will be deleted. Other workspaces are not affected. Click again to confirm.',
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

        // ── bubble-side attachment folding: hide the raw path block in user
    // bubbles and render attachment chips in its place (DOM projection; the
    // original text stays in the DOM for copy/logs, React re-renders are
    // re-folded by the observer).
    function parseAttachmentBlock(text) {
      const startMarker = '==== DSH_PASTE_INPUT_V1 ====';
      const endMarker = '==== END DSH_PASTE_INPUT ====';
      const lines = text.split('\n');
      // Marker format only: legacy unmarked history is intentionally not
      // folded. Prefix matching: user words typed right after the attachment
      // chip can land on the same line as the end marker.
      const startIdx = lines.findIndex(line => line.trim().startsWith(startMarker));
      const endIdx = startIdx !== -1 ? lines.findIndex((line, i) => i > startIdx && line.trim().startsWith(endMarker)) : -1;
      if (startIdx === -1 || endIdx === -1) return null;
      const startMatch = /^(==== DSH_PASTE_INPUT_V1 ====)/.exec(lines[startIdx].trim());
      const endMatch = /^(==== END DSH_PASTE_INPUT ====)/.exec(lines[endIdx].trim());
      if (startMatch === null || endMatch === null) return null;
      const root = lines[startIdx + 1].trim();
      if (root === '') return null;
      // Line start offsets, to slice the exact attachment block out of the
      // bubble text while keeping the user's own words around it.
      const lineStarts = [0];
      for (let i = 0; i < text.length; i += 1) {
        if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
      }
      let manifest = '';
      const manifestLine = lines[startIdx + 4];
      if (typeof manifestLine === 'string' && manifestLine.startsWith('Manifest: ')) {
        manifest = manifestLine.slice('Manifest: '.length);
      }
      const listIndex = lines.findIndex(line => line.startsWith('Attached files'));
      if (listIndex === -1) return null;
      const files = [];
      const blockStart = lineStarts[startIdx];
      // End marker matched to its own length, so user words on the same
      // line stay outside the folded block.
      const blockEnd = lineStarts[endIdx] + endMatch[1].length;
      for (let index = listIndex + 1; index < endIdx; index += 1) {
        const line = lines[index];
        if (!line.startsWith('- ')) continue;
        const match = /^- "((?:[^"\\]|\\.)*)" \((\d+(?:\.\d+)? (?:B|KiB|MiB|GiB|TiB))\)(?:; original=("(?:[^"\\]|\\.)*"))?/.exec(line);
        if (match === null) continue;
        let original = undefined;
        if (match[3] !== undefined) {
          try { original = JSON.parse(match[3]); } catch { original = match[3]; }
        }
        files.push({ path: match[1], size: match[2], original });
      }
      if (files.length === 0) {
        console.warn('dsh-paste-input: attachment block parsed with no files:', text.slice(0, 200));
        return null;
      }
      return { root, manifest, files, blockStart, blockEnd, raw: text.slice(blockStart, blockEnd) };
    }

    /** Parse every attachment block in a bubble text (multi-file sends produce one block per file). */
    function parseAttachmentBlocks(text) {
      const blocks = [];
      let cursor = 0;
      while (cursor < text.length) {
        const remaining = text.slice(cursor);
        const parsed = parseAttachmentBlock(remaining);
        if (parsed === null) break;
        const blockStart = parsed.blockStart + cursor;
        const blockEnd = parsed.blockEnd + cursor;
        blocks.push({
          root: parsed.root,
          manifest: parsed.manifest,
          files: parsed.files,
          blockStart,
          blockEnd,
          raw: text.slice(blockStart, blockEnd),
        });
        cursor = blockEnd;
      }
      return blocks;
    }

    // ── bubble-side attachment folding: hide the raw path block in user
    // bubbles and render attachment chips in its place (DOM projection; the
    // original text stays in the DOM for copy/logs, React re-renders are
    // re-folded by the observer).
    const warned = new Set();
    function foldAttachmentDiv(div) {
      const text = div.textContent ?? '';
      // Marker-only format; the original text div is hidden with CSS (React
      // never rewrites data attributes the way it rewrites textContent), and
      // the user's own words plus chips render into one owned wrap.
      if (!text.includes('==== DSH_PASTE_INPUT_V1 ====')) return;
      const blocks = parseAttachmentBlocks(text);
      if (blocks.length === 0) {
        // Not a foldable block; warn once per container (the sweep retries,
        // so an earlier parse miss can still fold later).
        if (!warned.has(div)) {
          warned.add(div);
          console.warn('dsh-paste-input: fold skipped (parse failed):', text.slice(0, 300));
        }
        return;
      }
      if (div.dataset.pasteFolded === undefined) div.dataset.pasteFolded = '1';
      if (div.dataset.pasteId === undefined) div.dataset.pasteId = id();
      const pasteId = div.dataset.pasteId;
      // If this exact container already has a live wrap, leave it. The
      // container's textContent is unchanged (a React rebuild would hand us a
      // fresh element without our data-paste-id), so the existing chips are
      // still valid. Rebuilding on every observer tick tears the subtree down
      // and re-inserts it ~8×/s for nothing, janking the page. Stale wraps from
      // React-rebuilt siblings are reaped by the orphan sweep in foldScan().
      if (div.parentElement !== null) {
        const existing = div.parentElement.querySelector('[data-paste-folded="container"][data-for="' + pasteId + '"]');
        if (existing !== null) return;
      }
      const wrap = document.createElement('div');
      wrap.className = 'dshca-chat-attachments';
      wrap.dataset.pasteFolded = 'container';
      wrap.dataset.for = pasteId;
      // Interleaved projection in source order: the user's own words before
      // each attachment block, then that block's file chips. Words around
      // different blocks keep their relative order (a multi-file send renders
      // text/chip/text/chip instead of pooling every chip after one merged
      // text block), and whitespace-only gaps between adjacent blocks collapse
      // so their chips flow as one run. Segments are trimmed of the protocol's
      // guard blank lines (the marker block owns those, not the user's text).
      let pos = 0;
      for (const block of blocks) {
        const before = text.slice(pos, block.blockStart).trim();
        if (before !== '') {
          const words = document.createElement('div');
          words.className = 'dshca-chat-usertext';
          words.textContent = before;
          wrap.appendChild(words);
        }
        for (const file of block.files) {
          const chip = document.createElement('div');
          chip.className = 'dshca-chat-chip';
          const icon = document.createElement('span');
          icon.className = 'dshca-chat-chip-icon';
          icon.setAttribute('aria-hidden', 'true');
          icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M5.2 8.6 9.8 4a2.1 2.1 0 1 1 3 3l-5.9 5.9a3.4 3.4 0 0 1-4.8-4.8l6-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          const name = document.createElement('span');
          name.className = 'dshca-chat-chip-name';
          name.textContent = file.path;
          const meta = document.createElement('span');
          meta.className = 'dshca-chat-chip-meta';
          meta.textContent = file.size;
          const absolute = block.root + '/' + file.path;
          const tip = document.createElement('div');
          tip.className = 'dshca-chat-tip';
          const tipLines = [];
          if (block.raw !== undefined) {
            // Full original attachment block, exactly as sent (root path,
            // protocol header, manifest, file list).
            tipLines.push(block.raw);
            if (file.original !== undefined && file.original !== file.path) {
              tipLines.push('原始：' + file.original);
            }
            tipLines.push('点击复制完整路径');
          } else {
            // Legacy folded rows (parsed before the raw slice existed).
            tipLines.push(file.path, '大小：' + file.size, '位置：' + absolute);
            if (block.manifest !== '') tipLines.push('清单：' + block.manifest);
            if (file.original !== undefined && file.original !== file.path) tipLines.push('原始：' + file.original);
            tipLines.push('点击复制完整路径');
          }
          tip.textContent = tipLines.join('\n');
          chip.appendChild(icon);
          chip.appendChild(name);
          chip.appendChild(meta);
          chip.appendChild(tip);
          chip.addEventListener('click', () => {
            navigator.clipboard?.writeText(absolute).then(
              () => showToast('已复制路径：' + absolute),
              () => showToast('复制失败：' + absolute),
            );
          });
          wrap.appendChild(chip);
        }
        pos = block.blockEnd;
      }
      const after = text.slice(pos).trim();
      if (after !== '') {
        const words = document.createElement('div');
        words.className = 'dshca-chat-usertext';
        words.textContent = after;
        wrap.appendChild(words);
      }
      div.parentElement?.insertBefore(wrap, div.nextSibling);
    }

    function foldScan() {
      // Remove orphan wraps whose owning text div no longer exists (React
      // rebuilds elements and may leave our old wraps behind).
      for (const wrap of document.querySelectorAll('[data-paste-folded="container"]')) {
        const owner = wrap.dataset.for;
        if (owner === undefined) { wrap.remove(); continue; }
        if (document.querySelector('[data-paste-id="' + owner + '"]') === null) wrap.remove();
      }
      // Text-driven scan: no dependency on DSH's internal DOM markers (they
      // differ across dist builds). Any text node carrying the attachment
      // header gets its container folded into chips.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      let node;
      while ((node = walker.nextNode()) !== null) {
        const text = node.textContent ?? '';
        if (!text.includes('DSH_PASTE_INPUT_V1')) continue;
        const container = node.parentElement;
        if (container === null || seen.has(container)) continue;
        // Never fold inside our own injected wraps: the file tooltip quotes the
        // raw attachment block verbatim, so its text carries the same marker we
        // scan for. Folding it would mint a fresh tooltip that again carries
        // the marker, and this live TreeWalker would visit that new text node,
        // fold it, mint another tooltip, ... forever — freezing the page.
        if (container.closest('[data-paste-folded="container"]') !== null) continue;
        seen.add(container);
        if (container.dataset.pasteFolded !== undefined) {
          // React may have removed our chip wrap on re-render; re-insert.
          try { foldAttachmentDiv(container); } catch { /* best-effort */ }
          continue;
        }
        try { foldAttachmentDiv(container); } catch (cause) { console.warn('dsh-paste-input fold failed:', cause); }
      }
    }

    const inject = ['slots', 'conversation', 'sessions', 'inputTriggers'];

    function apply(ctx) {
      const sessions = ctx.get('sessions');
      const conversation = ctx.get('conversation');
      const inputTriggers = ctx.get('inputTriggers');

      // Bubble folding observer, registered first so later apply failures can
      // never disable it; every chat-flow mutation re-scans (debounced).
      let foldTimer = null;
      const chatObserver = new MutationObserver(() => {
        if (foldTimer !== null) return;
        foldTimer = setTimeout(() => {
          foldTimer = null;
          try { foldScan(); } catch { /* folding is best-effort */ }
        }, 120);
      });
      try {
        if (document.body !== null) {
          // Live diagnostic marker: the rev of the bundle the browser really
          // loaded (from the boot graph, so it stays correct across rebuilds).
          const boot = globalThis.__DSH_BOOT__;
          const self = boot?.entries?.find(entry => entry.id === '@dsh-community/dsh-paste-input');
          document.body.dataset.pasteInputRev = self?.rev ?? 'unknown';
        }
        chatObserver.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['style', 'class', 'data-paste-folded'],
        });
      } catch (cause) { console.warn('dsh-paste-input: observer setup failed:', cause); }
      // Fallback sweeps: cover observer loss and late-mounted bubbles.
      const sweep = setInterval(() => { try { foldScan(); } catch { /* best-effort */ } }, 2000);
      try { foldScan(); } catch (cause) { console.warn('dsh-paste-input: initial fold failed:', cause); }
      ctx.effect(() => () => {
        chatObserver.disconnect();
        clearInterval(sweep);
        if (foldTimer !== null) clearTimeout(foldTimer);
      }, 'dsh-paste-input: bubble fold observer');

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
      ctx.effect(() => inputTriggers.registerSource(source), 'dsh-paste-input: reference codec');

      // Global paste interception: clipboard files become attachments; plain
      // text keeps the browser default. First-time paste shows a notice modal.
      const onPaste = event => {
        const files = [...(event.clipboardData?.files ?? [])];
        if (files.length === 0) return;
        event.preventDefault();
        const proceed = () => {
          const sessionId = sessions.list?.getSnapshot()?.current;
          if (sessionId === undefined) { showToast('请先打开一个会话。'); return; }
          let items;
          try { items = filesFromList(files); } catch (cause) {
            showToast(cause instanceof Error ? cause.message : String(cause));
            return;
          }
          add(sessionId, items).catch(cause => {
            showToast(cause instanceof Error ? cause.message : String(cause));
          });
        };
        if (noticeDismissed) proceed();
        else showPasteNotice(proceed, () => {});
      };
      document.addEventListener('paste', onPaste);
      ctx.effect(() => () => document.removeEventListener('paste', onPaste), 'dsh-paste-input: paste listener');

      // Whole-page file drop, registered at apply level (independent of any
      // slot rendering): files dropped anywhere join the attachment queue.
      const onDragover = event => {
        if ([...event.dataTransfer.items].some(item => item.kind === 'file')) event.preventDefault();
      };
      const onDrop = event => {
        const hasFiles = (event.dataTransfer?.files?.length ?? 0) > 0
          || [...(event.dataTransfer?.items ?? [])].some(item => item.kind === 'file');
        if (!hasFiles) return;
        event.preventDefault();
        const sessionId = sessions.list?.getSnapshot()?.current;
        if (sessionId === undefined) { showToast('请先打开一个会话。'); return; }
        filesFromDrop(event.dataTransfer).then(
          items => add(sessionId, items).catch(cause => {
            showToast(cause instanceof Error ? cause.message : String(cause));
          }),
          cause => showToast(cause instanceof Error ? cause.message : String(cause)),
        );
      };
      document.addEventListener('dragover', onDragover);
      document.addEventListener('drop', onDrop);
      ctx.effect(() => () => {
        document.removeEventListener('dragover', onDragover);
        document.removeEventListener('drop', onDrop);
      }, 'dsh-paste-input: page drop listener');



      const inputFor = sessionId => {
        const actx = sessions.scope(sessionId);
        if (actx === undefined) throw new Error(`Attachment session is not active: ${sessionId}`);
        return conversation.input.for(actx);
      };

      const add = async (sessionId, items) => {
        validateItems(items);
        const input = inputFor(sessionId);
        let snapshot = input.state.getSnapshot();
        if (snapshot.phase !== 'plain') throw new Error('Wait for the current input operation to finish');
        if (snapshot.draft !== '' && !/\s$/u.test(snapshot.draft)) {
          input.setDraft(`${snapshot.draft} `);
          snapshot = input.state.getSnapshot();
        }
        // One record per file: every file gets its own chip in the composer,
        // its own upload batch, and its own bubble chip, so the user can
        // remove a single file instead of the whole selection.
        for (const item of items) {
          const ref = id();
          const label = item.path;
          const record = { ref, sessionId, items: [item], total: item.file.size, label, status: 'ready', uploaded: 0 };
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
          snapshot = input.state.getSnapshot();
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

      ctx.inject(['slots', 'conversation', 'sessions', 'inputTriggers'], scope => {
        scope.slots.inject('conversation.input.left', () => scope.slots.register({
          name: 'conversation.input.left',
          id: 'dsh-paste-input-button',
          order: -100,
          inject: sessionId => ({ add: items => add(sessionId, items) }),
        }, AttachButton));
        scope.slots.inject('conversation.input.dock', () => scope.slots.register({
          name: 'conversation.input.dock',
          id: 'dsh-paste-input-dock',
          order: 5,
          inject: sessionId => ({ remove: occurrence => remove(sessionId, occurrence) }),
        }, AttachmentDock));
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
