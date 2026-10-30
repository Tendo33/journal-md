// 页内悬浮按钮（PRD §2.5）：文章页右下角「M↓」，点开是菜单：下载 .md、下载 ZIP、复制、隐藏按钮。
// 外观和状态沿用 zhihu-md 悬浮球 / arxiv-md PDF 悬浮按钮：44px 圆形、M↓ 字形、导出中外圈转动、成功变勾、失败变叹号。
// 放在 Shadow DOM 里，不受页面样式影响；键盘：Enter/空格/↓ 打开菜单，↑↓ Home End 移动，Esc 关闭并回到按钮。
// 结果文字由页内 toast（role=status）播报，按钮本身只更新 aria-label 和 aria-busy，避免读屏念两遍。

import { t } from '../config/i18n';

const HOST_TAG = 'journal-md-fab';

/** 悬浮按钮的全部文案，语言取自设置（resolveLanguage(settings.language)，和弹窗、设置页同一规则），不看页面或浏览器语言 */
export function fabLabels(lang) {
  return {
    button: t(lang, 'fabButton'),
    menu: t(lang, 'fabMenu'),
    download: t(lang, 'fabDownload'),
    zip: t(lang, 'fabZip'),
    copy: t(lang, 'fabCopy'),
    hide: t(lang, 'fabHide'),
    run: t(lang, 'statusWorking').replace(/[….]+$/, ''),
    ok: t(lang, 'fabDone'),
    err: t(lang, 'fabFailed'),
  };
}

// 系列统一（2026-10-30 审计）：球本体的尺寸、位置、字形和投影同 zhihu-md a5957b4 悬浮球——44px 圆、右 24 / 下 24、
// 「M↓」700/14、平时 0 4px 12px rgba(0,0,0,.12)，悬停上移 2px、加深并换成 0 12px 32px / 0 4px 12px 两层投影，按下回到原位；
// 成功 / 失败临时变 --success / --danger。焦点环用系列中性焦点色 #0969da / #79c0ff（不用品牌色，R07）。
// 菜单面板按审计 §4.2：r-md 8、内边距 4、0 8px 24px rgba(0,0,0,.16)，菜单项 h32、6px 12px、r-sm 6，字 14/1.5。
// tokens 内联，因为 shadow root 里读不到扩展页面的样式表；品牌色和 tokens.css 一致（#0f766e，深色 #14b8a6 配 #06142b）。
const CSS = `
:host { all: initial; }
.wrap { position: fixed; right: 24px; bottom: var(--jmd-bottom, 24px); z-index: 2147483647; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans", sans-serif;
  --brand: #0f766e; --brand-hover: #0b5f58; --brand-press: #084c46; --brand-on: #ffffff; --success: #0f7a3d; --danger: #b42318; --focus: #0969da;
  --surface: #ffffff; --text: #1b1f24; --text-2: #5b6270; --border: #dde1e6; --state-hover: rgb(0 0 0 / .05);
  --ball-shadow: 0 4px 12px rgba(0, 0, 0, .12); --ball-shadow-hover: 0 12px 32px rgba(0, 0, 0, .2), 0 4px 12px rgba(0, 0, 0, .1);
  --shadow-pop: 0 8px 24px rgba(0, 0, 0, .16); }
@media (prefers-color-scheme: dark) {
  .wrap { --brand: #14b8a6; --brand-hover: #2dd4bf; --brand-press: #0d9488; --brand-on: #06142b; --success: #4ade80; --danger: #f87171; --focus: #79c0ff;
    --surface: #1b1d22; --text: #e8eaed; --text-2: #a1a7b3; --border: #33373e; --state-hover: rgb(255 255 255 / .06);
    --ball-shadow: 0 4px 12px rgba(0, 0, 0, .5); --ball-shadow-hover: 0 12px 32px rgba(0, 0, 0, .6); --shadow-pop: 0 8px 24px rgba(0, 0, 0, .5); }
}
.fab { position: relative; box-sizing: border-box; width: 44px; height: 44px; border-radius: 50%; border: 0; margin: 0; padding: 0; display: grid; place-items: center;
  background: var(--brand); color: var(--brand-on); cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 700; line-height: 1; letter-spacing: 0; user-select: none;
  box-shadow: var(--ball-shadow); transition: transform .2s ease, background .2s ease, box-shadow .2s ease; }
.fab:hover { transform: translateY(-2px); background: var(--brand-hover); box-shadow: var(--ball-shadow-hover); }
.fab:active { transform: translateY(0); background: var(--brand-press); box-shadow: 0 2px 8px color-mix(in oklab, var(--brand) 30%, transparent); transition-duration: .1s; }
.fab:focus { outline: none; }
.fab:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.fab .ring { position: absolute; inset: -4px; border-radius: 50%; border: 3px solid transparent; pointer-events: none; }
.fab.run .ring { border-color: var(--brand) transparent transparent transparent; animation: spin 1s linear infinite; }
.fab.run { cursor: progress; }
.fab.ok { background: var(--success); color: var(--brand-on); }
.fab.err { background: var(--danger); color: var(--brand-on); }
.fab svg { width: 18px; height: 18px; }
.menu { box-sizing: border-box; min-width: 200px; margin: 0; padding: 4px; list-style: none; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text);
  box-shadow: var(--shadow-pop); }
.menu[hidden] { display: none; }
.item { all: unset; box-sizing: border-box; display: flex; align-items: center; width: 100%; min-height: 32px; padding: 6px 12px; border-radius: 6px; cursor: pointer;
  font-family: inherit; font-size: 14px; line-height: 1.5; color: var(--text); transition: background-color 120ms cubic-bezier(.2,0,0,1); }
.item:hover { background: var(--state-hover); }
.item:focus { outline: none; }
.item:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.item.quiet { color: var(--text-2); }
.sep { height: 1px; margin: 4px 8px; background: var(--border); }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .fab, .item { transition: none; } .fab:hover { transform: none; } .fab.run .ring { animation: none; border-color: var(--brand); } }
@media print { .wrap { display: none; } }
`;

const SVG_NS = 'http://www.w3.org/2000/svg';
const BASE_BOTTOM = 24;
const FAB_SIZE = 44;

function isModal(el) {
  try {
    if (el.matches && el.matches(':modal')) return true;
  } catch (_) { /* 旧浏览器不认 :modal */ }
  return String(el.tagName || '').toLowerCase() === 'dialog' && el.open === true;
}

/**
 * 站点的 Cookie 横幅、反馈按钮常常固定在右下角，z-index 也是最大值，会盖住按钮（QA JM-M2-07）。
 * 看按钮原本位置上最上层的元素：不是我们自己、而且是 fixed/sticky 的，就把按钮抬到它上面 16px；挡住的东西消失后回到原位。
 * @returns {number} 新的 bottom（px）
 */
export function clearBottom(doc, host, win = doc.defaultView) {
  if (!win || typeof doc.elementsFromPoint !== 'function') return BASE_BOTTOM;
  const x = win.innerWidth - 24 - FAB_SIZE / 2;
  const y = win.innerHeight - BASE_BOTTOM - FAB_SIZE / 2;
  const blocker = doc.elementsFromPoint(x, y).find((el) => {
    if (el === host || host.contains(el)) return false;
    const pos = win.getComputedStyle(el).position;
    return pos === 'fixed' || pos === 'sticky';
  });
  if (!blocker) return BASE_BOTTOM;
  // 模态 <dialog>（Nature / Springer 的 Cookie 同意框）在浏览器顶层、背后的页面不可点：任何 z-index 都盖不过它，
  // 抬高也没用，保持原位，等它关掉
  if (isModal(blocker)) return BASE_BOTTOM;
  const top = blocker.getBoundingClientRect().top;
  const lifted = Math.round(win.innerHeight - top + 16);
  // 挡住半个屏幕以上的（全屏遮罩、弹窗）不追着抬，留在原位
  return lifted > win.innerHeight / 2 ? BASE_BOTTOM : Math.max(BASE_BOTTOM, lifted);
}

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
export function mountFab(doc, { labels: initialLabels, onAction, onHide }) {
  let labels = { ...initialLabels };
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
    btn.dataset.message = message || '';
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
  // 挂在 <html> 的最后，z-index 相同时也排在页面元素上面
  doc.documentElement.appendChild(host);
  const reposition = () => {
    // 先回到原位再看：否则抬高后测到的就不是原来那个位置
    host.style.removeProperty('--jmd-bottom');
    const bottom = clearBottom(doc, host);
    if (bottom !== BASE_BOTTOM) host.style.setProperty('--jmd-bottom', `${bottom}px`);
  };
  reposition();
  // 横幅多半在加载后几秒内出现、在用户点掉后消失：前 30 秒每 2 秒看一次，之后在窗口大小变化和打开菜单时看
  let checks = 0;
  const poll = setInterval(() => { reposition(); if (++checks >= 15) clearInterval(poll); }, 2000);
  const win = doc.defaultView;
  if (win) win.addEventListener('resize', reposition);
  btn.addEventListener('pointerenter', reposition);
  // 模态 Cookie 框关掉后（close 事件不冒泡，用捕获）马上重新看一次
  doc.addEventListener('close', reposition, true);
  const api = {
    host,
    button: btn,
    menu,
    setState,
    getState: () => state,
    run,
    reposition,
    /** 设置里换了语言：原地换文案（菜单开着、按钮状态都不变） */
    setLabels(next) {
      labels = { ...next };
      menu.setAttribute('aria-label', labels.menu);
      for (const it of items) it.textContent = labels[it.dataset.action] || it.textContent;
      const msg = btn.dataset.message || '';
      setState(state, msg);
    },
    getLabels: () => ({ ...labels }),
    remove: () => { clearTimeout(timer); clearInterval(poll); if (win) win.removeEventListener('resize', reposition); doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('close', reposition, true); host.remove(); },
  };
  host.__jmdFab = api;
  return api;
}

export function fabMounted(doc) {
  return !!doc.querySelector(HOST_TAG);
}

/** 悬浮按钮当前的 bottom（px，可能被抬到 Cookie 横幅上面）；没有按钮时 null。页内提示用它贴在按钮旁边 */
export function fabBottom(doc) {
  const host = doc.querySelector(HOST_TAG);
  if (!host) return null;
  const v = parseInt(host.style.getPropertyValue('--jmd-bottom'), 10);
  return Number.isFinite(v) ? v : BASE_BOTTOM;
}
