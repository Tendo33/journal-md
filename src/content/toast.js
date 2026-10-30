// 右键菜单 / 快捷键触发时的页内提示（shadow DOM，不受页面样式影响）。悬浮按钮留到 M2。
const HOST_ID = 'journal-md-toast-host';
const HIDE_MS = 6000;

const STYLE = `
:host { all: initial; }
.toast { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; max-width: min(360px, calc(100vw - 32px));
  box-sizing: border-box; display: flex; gap: 8px; align-items: flex-start; padding: 12px 16px; border-radius: 8px;
  font: 14px/20px system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  background: #ffffff; color: #1f2328; border: 1px solid #d0d7de; box-shadow: 0 8px 24px rgba(0,0,0,.16);
  transition: opacity .2s ease; }
.toast[data-kind="error"] { border-color: #b42318; }
.toast[data-kind="success"] { border-color: #1a7f37; }
.msg { flex: 1; min-width: 0; overflow-wrap: anywhere; }
button { all: unset; cursor: pointer; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center;
  border-radius: 4px; color: inherit; flex: none; }
button:focus-visible { outline: 2px solid #0969da; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  .toast { background: #1f2328; color: #e6edf3; border-color: #3d444d; }
  button:focus-visible { outline-color: #4493f8; }
}
@media (prefers-reduced-motion: reduce) { .toast { transition: none; } }
`;

let hideTimer = null;

export function showToast(message, kind = 'info', { closeLabel = 'Close' } = {}) {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style><div class="toast" role="status" aria-live="polite"><span class="msg"></span><button type="button">×</button></div>`;
    root.querySelector('button').addEventListener('click', () => host.remove());
    (document.body || document.documentElement).appendChild(host);
  }
  const root = host.shadowRoot;
  const box = root.querySelector('.toast');
  const msg = root.querySelector('.msg');
  root.querySelector('button').setAttribute('aria-label', closeLabel);
  box.dataset.kind = kind;
  // 同一句话再次出现也要能被读屏播报：先清空，下一帧再写
  msg.textContent = '';
  requestAnimationFrame(() => { msg.textContent = message; });
  clearTimeout(hideTimer);
  if (kind !== 'working') hideTimer = setTimeout(() => host.remove(), HIDE_MS);
}
