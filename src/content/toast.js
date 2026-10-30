// 右键菜单 / 快捷键 / 悬浮按钮触发时的页内提示（shadow DOM，不受页面样式影响）。
// 页面上有悬浮按钮时提示上移，不压住按钮。
const HOST_ID = 'journal-md-toast-host';
const HIDE_MS = 6000;

const STYLE = `
:host { all: initial; }
.toast { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; max-width: min(360px, calc(100vw - 32px));
  box-sizing: border-box; display: flex; gap: 8px; align-items: flex-start; padding: 12px 16px; border-radius: 8px;
  font: 14px/20px system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  background: #ffffff; color: #1f2328; border: 1px solid #d0d7de; box-shadow: 0 8px 24px rgba(0,0,0,.16);
  transition: opacity .2s ease; }
.toast[data-raised] { bottom: 80px; }
.toast[data-kind="error"] { border-color: #b42318; }
.toast[data-kind="success"] { border-color: #1a7f37; }
.msg { flex: 1; min-width: 0; overflow-wrap: anywhere; }
button { all: unset; cursor: pointer; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center;
  border-radius: 4px; color: inherit; flex: none; }
button:focus-visible { outline: 2px solid #0969da; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  .toast { background: #1f2328; color: #e6edf3; border-color: #3d444d; }
  button:focus-visible { outline-color: #79c0ff; }
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
