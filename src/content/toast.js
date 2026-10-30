// 右键菜单 / 快捷键 / 悬浮按钮触发时的页内提示（shadow DOM，不受页面样式影响）。
// 系列统一（2026-10-30）：样式和位置同 zhihu-md a5957b4 悬浮球的提示气泡——12px/18px 500、内边距 6/10、圆角 6、
// 90% 不透明表面 + 1px 边框 + 背景模糊、0 4px 12px rgba(0,0,0,.06)；有悬浮按钮时贴在按钮左侧 16px、和按钮垂直居中，
// 没有按钮时在悬浮球的位置（右 24 / 下 24）。失败用 role=alert（审计 §4.2）。
import { t } from '../config/i18n';

const HOST_ID = 'journal-md-toast-host';
const HIDE_MS = 6000;

const STYLE = `
:host { all: initial; }
.toast { --surface: #fff; --text: #1b1f24; --text-2: #5b6270; --border: #dde1e6; --success: #0f7a3d; --danger: #b42318;
  --focus: #0969da; --state-hover: rgb(0 0 0 / .05);
  position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; max-width: min(280px, calc(100vw - 48px));
  box-sizing: border-box; display: flex; gap: 4px; align-items: flex-start; padding: 6px 4px 6px 10px; border-radius: 6px;
  font: 500 12px/18px system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans", sans-serif;
  background: color-mix(in oklab, var(--surface) 90%, transparent); color: var(--text); border: 1px solid var(--border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, .06); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  transition: opacity 200ms cubic-bezier(.25,.1,.25,1); }
/* 贴在悬浮按钮左边：按钮右 24 + 宽 44 + 间距 16；垂直中线对齐按钮中心（--fab-bottom + 22px） */
.toast[data-beside] { right: 84px; bottom: calc(var(--fab-bottom, 24px) + 22px); transform: translateY(50%); max-width: min(280px, calc(100vw - 96px)); }
.toast[data-kind="error"] { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, var(--border)); }
.msg { flex: 1; min-width: 0; overflow-wrap: anywhere; padding: 3px 0; }
button { all: unset; box-sizing: border-box; cursor: pointer; width: 24px; height: 24px; display: inline-grid; place-items: center;
  border-radius: 6px; color: var(--text-2); flex: none; font-size: 14px; line-height: 1; }
button:hover { background: var(--state-hover); color: var(--text); }
button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  .toast { --surface: #1b1d22; --text: #e8eaed; --text-2: #a1a7b3; --border: #33373e; --success: #4ade80; --danger: #f87171;
    --focus: #79c0ff; --state-hover: rgb(255 255 255 / .06); box-shadow: 0 4px 12px rgba(0, 0, 0, .4); }
}
@media (prefers-reduced-motion: reduce) { .toast { transition: none; } }
`;

let hideTimer = null;

/**
 * @param {{lang?:'en'|'zh', closeLabel?:string, beside?:number|null}} opts
 *   lang：设置里的界面语言（关闭按钮的读屏名称用它，不再默认英文）；beside：悬浮按钮的 bottom（px），给了就贴在按钮左边
 */
export function showToast(message, kind = 'info', { lang = 'en', closeLabel, beside = null } = {}) {
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
  root.querySelector('button').setAttribute('aria-label', closeLabel || t(lang, 'btnClose'));
  box.dataset.kind = kind;
  box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  box.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
  if (typeof beside === 'number') {
    box.dataset.beside = '';
    box.style.setProperty('--fab-bottom', `${beside}px`);
  } else {
    delete box.dataset.beside;
    box.style.removeProperty('--fab-bottom');
  }
  // 同一句话再次出现也要能被读屏播报：先清空，下一帧再写
  msg.textContent = '';
  requestAnimationFrame(() => { msg.textContent = message; });
  clearTimeout(hideTimer);
  if (kind !== 'working') hideTimer = setTimeout(() => host.remove(), HIDE_MS);
}
