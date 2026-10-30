// 页内悬浮按钮（PRD §2.5）：文章页右下角「M↓」，点开是菜单：下载 .md、下载 ZIP、复制、隐藏按钮。
// 外观和状态沿用 zhihu-md 悬浮球 / arxiv-md PDF 悬浮按钮：44px 圆形、M↓ 字形、导出中外圈转动、成功变勾、失败变叹号。
// 放在 Shadow DOM 里，不受页面样式影响；键盘：Enter/空格/↓ 打开菜单，↑↓ Home End 移动，Esc 关闭并回到按钮。
// 结果文字由页内 toast（role=status）播报，按钮本身只更新 aria-label 和 aria-busy，避免读屏念两遍。

const HOST_TAG = 'journal-md-fab';

const CSS = `
:host { all: initial; }
.wrap { position: fixed; right: 24px; bottom: 24px; z-index: 2147483646; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
  font: 14px/20px system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --brand: #0f766e; --brand-on: #ffffff; --success: #1a7f37; --error: #b42318; --focus: #0969da;
  --panel: #ffffff; --text: #1f2328; --muted: #59636e; --border: #d0d7de; --hover: #f6f8fa; }
@media (prefers-color-scheme: dark) {
  .wrap { --brand: #14b8a6; --brand-on: #0d1117; --success: #3fb950; --error: #f47067; --focus: #79c0ff;
    --panel: #1f2428; --text: #e6edf3; --muted: #9198a1; --border: #3d444d; --hover: #2a3036; }
}
.fab { position: relative; width: 44px; height: 44px; border-radius: 50%; border: 0; margin: 0; padding: 0; display: grid; place-items: center;
  background: var(--brand); color: var(--brand-on); cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 700; line-height: 1; letter-spacing: 0;
  box-shadow: 0 0 0 2px var(--panel), 0 4px 12px rgba(0, 0, 0, .35); transition: transform .15s ease; }
.fab:hover { transform: translateY(-2px); }
.fab:focus { outline: none; }
.fab:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; }
.fab .ring { position: absolute; inset: -4px; border-radius: 50%; border: 3px solid transparent; pointer-events: none; }
.fab.run .ring { border-color: var(--brand) transparent transparent transparent; animation: spin 1s linear infinite; }
.fab.run { cursor: progress; }
.fab.ok { background: var(--success); }
.fab.err { background: var(--error); }
.fab svg { width: 18px; height: 18px; }
.menu { min-width: 200px; margin: 0; padding: 4px; list-style: none; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); color: var(--text);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .18); }
.menu[hidden] { display: none; }
.item { all: unset; box-sizing: border-box; display: flex; align-items: center; width: 100%; min-height: 32px; padding: 6px 12px; border-radius: 6px; cursor: pointer;
  font-family: inherit; font-size: 14px; line-height: 20px; color: var(--text); }
.item:hover { background: var(--hover); }
.item:focus { outline: none; }
.item:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.item.quiet { color: var(--muted); }
.sep { height: 1px; margin: 4px 8px; background: var(--border); }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .fab { transition: none; } .fab:hover { transform: none; } .fab.run .ring { animation: none; border-color: var(--brand); } }
@media print { .wrap { display: none; } }
`;

const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(doc, d) {
  const s = doc.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2.5');
  s.setAttribute('aria-hidden', 'true');
  const p = doc.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  s.append(p);
  return s;
}

const FACE = {
  idle: (doc) => Object.assign(doc.createElement('span'), { textContent: 'M↓' }),
  run: (doc) => Object.assign(doc.createElement('span'), { textContent: 'M↓' }),
  ok: (doc) => icon(doc, 'M5 12l5 5L20 7'),
  err: (doc) => icon(doc, 'M12 7v6M12 16.5v.5'),
};

/**
 * @param {Document} doc
 * @param {{ labels: Record<string,string>, onAction: (action:'download'|'zip'|'copy') => Promise<{ok:boolean}>, onHide: () => void }} opts
 *   labels: button / menu / download / zip / copy / hide / run / ok / err
 */
export function mountFab(doc, { labels, onAction, onHide }) {
  const existing = doc.querySelector(HOST_TAG);
  if (existing && existing.__jmdFab) return existing.__jmdFab;
  const host = doc.createElement(HOST_TAG);
  const root = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = CSS;
  const wrap = doc.createElement('div');
  wrap.className = 'wrap';

  const menu = doc.createElement('div');
  menu.className = 'menu';
  menu.id = 'jmd-fab-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  const items = [];
  const addItem = (id, text, quiet = false) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = quiet ? 'item quiet' : 'item';
    b.setAttribute('role', 'menuitem');
    b.tabIndex = -1;
    b.dataset.action = id;
    b.textContent = text;
    menu.append(b);
    items.push(b);
    return b;
  };
  addItem('download', labels.download);
  addItem('zip', labels.zip);
  addItem('copy', labels.copy);
  const sep = doc.createElement('div');
  sep.className = 'sep';
  sep.setAttribute('role', 'separator');
  menu.append(sep);
  addItem('hide', labels.hide, true);

  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'fab';
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-controls', 'jmd-fab-menu');
  btn.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', labels.menu);

  wrap.append(menu, btn);
  root.append(style, wrap);

  let state = 'idle';
  let timer = null;
  const setState = (next, message) => {
    state = next;
    btn.className = next === 'idle' ? 'fab' : `fab ${next}`;
    const ring = doc.createElement('span');
    ring.className = 'ring';
    ring.setAttribute('aria-hidden', 'true');
    const face = FACE[next] || FACE.idle;
    const f = face(doc);
    if (f.setAttribute) f.setAttribute('aria-hidden', 'true');
    btn.replaceChildren(ring, f);
    const label = next === 'idle' ? labels.button : `${labels[next]}${message ? `: ${message}` : ''}`;
    btn.setAttribute('aria-label', label);
    btn.title = next === 'idle' ? labels.button : label;
    if (next === 'run') btn.setAttribute('aria-busy', 'true');
    else btn.removeAttribute('aria-busy');
    clearTimeout(timer);
    if (next === 'ok' || next === 'err') timer = setTimeout(() => setState('idle'), next === 'ok' ? 4000 : 8000);
  };

  const isOpen = () => !menu.hidden;
  const focusItem = (i) => { const n = items.length; items[((i % n) + n) % n].focus(); };
  const open = (focusIndex = 0) => {
    if (state === 'run') return;
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    focusItem(focusIndex);
  };
  const close = (returnFocus = true) => {
    if (!isOpen()) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (returnFocus) btn.focus();
  };

  async function run(action) {
    close();
    if (action === 'hide') { onHide(); return; }
    setState('run');
    let result;
    try {
      result = await onAction(action);
    } catch (_) {
      result = { ok: false };
    }
    setState(result && result.ok ? 'ok' : 'err', result && result.message);
  }

  btn.addEventListener('click', () => (isOpen() ? close() : open()));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); open(0); }
    if (e.key === 'ArrowUp') { e.preventDefault(); open(items.length - 1); }
  });
  menu.addEventListener('click', (e) => {
    const item = e.target.closest && e.target.closest('[data-action]');
    if (item) run(item.dataset.action);
  });
  menu.addEventListener('keydown', (e) => {
    const i = items.indexOf(root.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(i + 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(i - 1); } else if (e.key === 'Home') { e.preventDefault(); focusItem(0); } else if (e.key === 'End') { e.preventDefault(); focusItem(items.length - 1); } else if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'Tab') { close(false); }
  });
  // 点页面别处关闭菜单（事件来自 shadow 外时 composedPath 里没有 host）
  const outside = (e) => { if (isOpen() && !e.composedPath().includes(host)) close(false); };
  doc.addEventListener('pointerdown', outside, true);

  setState('idle');
  (doc.body || doc.documentElement).appendChild(host);
  const api = {
    host,
    button: btn,
    menu,
    setState,
    getState: () => state,
    run,
    remove: () => { clearTimeout(timer); doc.removeEventListener('pointerdown', outside, true); host.remove(); },
  };
  host.__jmdFab = api;
  return api;
}

export function fabMounted(doc) {
  return !!doc.querySelector(HOST_TAG);
}
