// 右键菜单 / 快捷键 / 悬浮按钮触发时的页内提示（shadow DOM，不受页面样式影响）。
// 页面上有悬浮按钮时提示上移，不压住按钮。
const HOST_ID = 'journal-md-toast-host';
const HIDE_MS = 6000;

// 样式取自系列共用 ui-v2.css 的 .toast / .icon-btn（arxiv-md bdf0175 / zhihu-md a5957b4）：12px 圆角、左侧 4px 状态色条、
// shadow-2、13px/1.5；tokens 内联，因为 shadow root 里读不到扩展页面的样式表
const STYLE = `
:host { all: initial; }
.toast { --surface: #fff; --text: #1b1f24; --text-2: #5b6270; --border: #dde1e6; --info: #1f5fbf; --success: #0f7a3d; --danger: #b42318;
  --focus: #2563eb; --state-hover: rgb(0 0 0 / .05);
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; max-width: min(360px, calc(100vw - 32px));
  box-sizing: border-box; display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border-radius: 12px;
  font: 13px/1.5 system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  background: var(--surface); color: var(--text); border: 1px solid var(--border); border-left: 4px solid var(--info);
  box-shadow: 0 6px 16px -4px rgb(16 24 40 / .12), 0 2px 4px -2px rgb(16 24 40 / .06);
  transition: opacity 200ms cubic-bezier(.2,0,0,1); }
.toast[data-raised] { bottom: 80px; }
.toast[data-kind="error"] { border-left-color: var(--danger); }
.toast[data-kind="success"] { border-left-color: var(--success); }
.msg { flex: 1; min-width: 0; overflow-wrap: anywhere; padding: 6px 0; }
button { all: unset; box-sizing: border-box; cursor: pointer; width: 32px; height: 32px; display: inline-grid; place-items: center;
  border-radius: 8px; color: var(--text-2); flex: none; margin: 0 -8px 0 0; font-size: 16px; }
button:hover { background: var(--state-hover); color: var(--text); }
button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  .toast { --surface: #1b1d22; --text: #e8eaed; --text-2: #a1a7b3; --border: #33373e; --info: #7cb2ff; --success: #4ade80; --danger: #f87171;
    --focus: #60a5fa; --state-hover: rgb(255 255 255 / .06); box-shadow: 0 6px 16px -4px rgb(0 0 0 / .55); }
}
@media (prefers-reduced-motion: reduce) { .toast { transition: none; } }
`;

let hideTimer = null;

export function showToast(message, kind = 'info', { closeLabel = 'Close', raised = false } = {}) {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'open' });
    // 不用 innerHTML（AMO web-ext lint 警告，审查 N-8）
    const style = document.createElement('style');
    style.textContent = STYLE;
    const box = document.createElement('div');
    box.className = 'toast';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    const msg = document.createElement('span');
    msg.className = 'msg';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.addEventListener('click', () => host.remove());
    box.append(msg, close);
    root.append(style, box);
    (document.body || document.documentElement).appendChild(host);
  }
  const root = host.shadowRoot;
  const box = root.querySelector('.toast');
  const msg = root.querySelector('.msg');
  root.querySelector('button').setAttribute('aria-label', closeLabel);
  box.dataset.kind = kind;
  if (raised) box.dataset.raised = ''; else delete box.dataset.raised;
  // 同一句话再次出现也要能被读屏播报：先清空，下一帧再写
  msg.textContent = '';
  requestAnimationFrame(() => { msg.textContent = message; });
  clearTimeout(hideTimer);
  if (kind !== 'working') hideTimer = setTimeout(() => host.remove(), HIDE_MS);
}
