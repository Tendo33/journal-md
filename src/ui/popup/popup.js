import { loadSettings } from '../../config/settings';
import { applyI18n, resolveLanguage, t } from '../../config/i18n';
import { MSG, ACTIONS } from '../../utils/messages';
import { describeResult, errorText, openLinkText } from '../shared/result-text';
import { quickCheck, emptyText, routeItems, shortcutText, exportShortcut } from './popup-view';
import { loadPdfSettings, pdfReady, PDF_TASK_KEY } from '../../pdf/settings';
import { pdfStatusText, providerLabel } from '../shared/pdf-text';

const $ = (id) => document.getElementById(id);
let lang = 'en';
let tab = null;
let busy = false;
let pageInfo = null;
let pdfSettings = null;

function show(id, visible) {
  $(id).hidden = !visible;
}

/** 空状态和另外两款插件同一写法：图标 + 标题 + 去哪里 / 为什么 */
function setEmpty(text, titleKey = 'popupReadFailTitle') {
  show('ctx', false);
  // 同另外两款：按钮留在原位置灰，让人知道到了文章页能做什么
  show('actions', true);
  $('actions').querySelectorAll('button').forEach((b) => { b.disabled = true; });
  $('empty-title').textContent = t(lang, titleKey);
  $('empty-desc').textContent = text;
  show('empty', true);
}

/**
 * 状态区：先清空、下一帧再写，同一句话也会被读屏重新播报（R15）。
 * 每次调用取消上一次还没执行的写入，并在回调里先清空，避免「正在转换…」残留（设计 MF3）。
 */
let statusSeq = 0;
let statusFrame = 0;
function setStatus(lines) {
  const el = $('status');
  const seq = ++statusSeq;
  cancelAnimationFrame(statusFrame);
  el.textContent = '';
  statusFrame = requestAnimationFrame(() => {
    if (seq !== statusSeq) return;
    el.textContent = '';
    for (const { text, cls, href, linkText, button } of lines) {
      if (!text && !button) continue;
      const p = document.createElement('p');
      p.className = cls;
      p.textContent = text || '';
      if (href) {
        p.append(' ');
        const a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = linkText || t(lang, 'noticeFullTextLink');
        p.append(a);
      }
      if (button) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-secondary';
        b.textContent = button.label;
        b.addEventListener('click', button.onClick);
        if (text) p.append(document.createElement('br'));
        p.append(b);
      }
      el.append(p);
    }
  });
}

function renderRoutes(routes, jatsState) {
  const dd = $('routes');
  dd.textContent = '';
  for (const item of routeItems(lang, routes, jatsState)) {
    const span = document.createElement('span');
    span.className = 'route';
    span.dataset.state = item.state;
    span.textContent = item.text;
    span.title = item.desc;
    span.setAttribute('aria-label', item.desc);
    dd.append(span);
  }
}

function setRow(id, value) {
  $(id).textContent = value || '';
  show(`row-${id}`, !!value);
}

async function sendToTab(message) {
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (_) {
    // 安装前已打开的标签页没有 content script：注入一次再试
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

async function inspect(settings) {
  const quick = quickCheck(tab && tab.url, settings);
  if (!quick.ok) return setEmpty(emptyText(lang, quick), 'popupUnsupportedTitle');
  let info;
  try {
    info = await sendToTab({ type: MSG.INSPECT });
  } catch (_) {
    return setEmpty(errorText(lang, 'content_unreachable'));
  }
  if (!info || !info.ok) return setEmpty(errorText(lang, (info && info.error) || 'no_content', info || {}));
  show('loading', false);
  show('info', true);
  show('actions', true);
  $('ctx-title').textContent = info.title;
  $('ctx-title').title = info.title;
  $('platform').textContent = info.siteName;
  setRow('doi', info.ids.doi);
  setRow('pmcid', info.ids.pmcid);
  setRow('pmid', info.ids.pmid);
  // 打开弹窗不联网（审查 M-1）：JATS 是否可用只在用户点导出 / 复制时才向 Europe PMC 请求
  renderRoutes(info.routes);
  pageInfo = info;
  await setupPdf();
}

// ---- L3 PDF 解析：设置里给所选后端填了 Token 才显示按钮；点了直接发送，不弹确认（Simon 2026-10-30 18:06）----
function setPdfStatus(task) {
  const el = $('pdf-status');
  el.dataset.state = (task && task.state) || '';
  el.textContent = '';
  const text = task && pdfStatusText(lang, task);
  if (text) requestAnimationFrame(() => { el.textContent = text; });
}

async function setupPdf() {
  pdfSettings = await loadPdfSettings();
  const pdf = pageInfo && pageInfo.pdf;
  // 快速解析（文字层）不需要 Key：本页有 PDF 就显示
  if (pdf && pdf.url) {
    $('pdf-fast').hidden = false;
    show('pdf-row', true);
  }
  if (!pdfReady(pdfSettings)) { $('pdf').hidden = true; return; }
  const name = providerLabel(pdfSettings.provider);
  $('pdf').textContent = t(lang, 'pdfButton', { provider: name });
  $('pdf').title = t(lang, 'pdfButtonTitle', { provider: name });
  // 本页没有 PDF 时不显示按钮；解析别处免费版本的 PDF 时只显示状态行
  $('pdf').hidden = !(pdf && pdf.url);
  // 弹窗重新打开时显示这一页上次任务的状态
  const got = await chrome.storage.local.get(PDF_TASK_KEY);
  const task = got && got[PDF_TASK_KEY];
  show('pdf-row', !$('pdf').hidden || !$('pdf-fast').hidden || !!(task && task.pageUrl === tab.url));
  if (task && task.pageUrl === tab.url) setPdfStatus(task);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[PDF_TASK_KEY] && changes[PDF_TASK_KEY].newValue && changes[PDF_TASK_KEY].newValue.pageUrl === tab.url) setPdfStatus(changes[PDF_TASK_KEY].newValue);
  });
}

/** 快速解析：把 pdf-fast.js 注入文章页，在页面里下载 PDF、读文字层、保存 Markdown（不经过第三方） */
async function startFastPdf() {
  if ($('pdf-fast').getAttribute('aria-disabled') === 'true') return;
  $('pdf-fast').setAttribute('aria-disabled', 'true');
  setPdfStatus({ state: 'fast' });
  let r;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['pdf-fast.js'] });
    r = await chrome.tabs.sendMessage(tab.id, { type: MSG.PDF_FAST, pdfUrl: pageInfo.pdf.url, meta: pageInfo.meta });
  } catch (_) {
    r = { ok: false, error: 'content_unreachable' };
  }
  $('pdf-fast').removeAttribute('aria-disabled');
  setPdfStatus(r && r.ok ? { state: 'fast_done', ...r } : { state: 'fast_failed', error: (r && r.error) || 'pdf_parse' });
}

/** pdfUrl：别处免费版本的 PDF（默认解析本页的 PDF） */
async function startPdf(pdfUrl) {
  const pdf = typeof pdfUrl === 'string' ? { url: pdfUrl, license: '' } : pageInfo.pdf;
  show('pdf-row', true);
  $('pdf').setAttribute('aria-disabled', 'true');
  setPdfStatus({ state: 'checking', provider: pdfSettings.provider });
  let r;
  try {
    r = await chrome.runtime.sendMessage({
      type: MSG.PDF_START,
      request: { pdfUrl: pdf.url, pageUrl: tab.url, license: pdf.license, meta: pageInfo.meta },
    });
  } catch (_) {
    r = { ok: false, code: 'NETWORK' };
  }
  $('pdf').removeAttribute('aria-disabled');
  if (r && r.ok) return;
  // 任务过程中的状态由 storage 变化推送；最后再读一次，没开始就失败（另一个任务在跑、地址不对……）时用返回的错误码
  const got = await chrome.storage.local.get(PDF_TASK_KEY);
  const task = got && got[PDF_TASK_KEY];
  if (task && task.pageUrl === tab.url && task.state === 'failed') setPdfStatus(task);
  else setPdfStatus({ state: 'failed', errorCode: (r && r.code) || 'PROVIDER_FAILED', provider: pdfSettings.provider });
}

function onPdfClick() {
  if ($('pdf').getAttribute('aria-disabled') === 'true') return;
  startPdf();
}

/** 只有摘要：说明原因，给全文链接；有 PDF 时提示用 PDF 解析；最后是「仍导出摘要」按钮 */
function abstractOnlyLines(result, action) {
  const lines = [{ text: errorText(lang, 'abstract_only'), cls: 'alert err' }];
  if (result.fullTextUrl) lines.push({ text: t(lang, 'abstractOnlyPublisher'), cls: 'note', href: result.fullTextUrl });
  // 别处的免费版本（Unpaywall、bioRxiv / medRxiv）：链接；PDF 在填了 Key 时可以直接解析
  const open = (result.openVersions || []).slice(0, 4);
  if (open.length) lines.push({ text: t(lang, 'openVersionsTitle'), cls: 'note' });
  for (const l of open) {
    const canParse = l.pdfUrl && pdfSettings && pdfReady(pdfSettings);
    lines.push({ text: openLinkText(lang, l), cls: 'note', href: l.url, linkText: t(lang, 'openLinkOpen'), button: canParse ? { label: t(lang, 'btnParseThisPdf'), onClick: () => startPdf(l.pdfUrl) } : null });
  }
  if (pageInfo && pageInfo.pdf && pageInfo.pdf.url) {
    lines.push({ text: t(lang, 'abstractOnlyPdfReady'), cls: 'note' });
  }
  lines.push({ cls: 'note', button: { label: t(lang, 'btnExportAbstract'), onClick: () => run(action, true) } });
  return lines;
}

async function run(action, allowAbstract = false) {
  if (busy) return;
  busy = true;
  const buttons = [$('export'), $('copy'), $('zip')];
  buttons.forEach((b) => b.setAttribute('aria-disabled', 'true'));
  $('actions').setAttribute('aria-busy', 'true');
  setStatus([{ text: t(lang, 'statusWorking'), cls: 'alert info run' }]);
  let result;
  try {
    result = await sendToTab({ type: MSG.EXPORT, action: action === ACTIONS.COPY ? ACTIONS.NONE : action, allowAbstract });
    if (result && result.ok && action === ACTIONS.COPY) {
      // popup 有焦点和用户手势，在这里写剪贴板最稳
      await navigator.clipboard.writeText(result.markdown);
      result = { ...result, copied: true };
    }
  } catch (e) {
    result = { ok: false, error: action === ACTIONS.COPY && result && result.ok ? 'clipboard_failed' : 'content_unreachable' };
  }
  const text = describeResult(result, lang, action);
  let lines = [{ text: text.status, cls: result && result.ok ? 'alert ok' : 'alert err' }];
  if (result && !result.ok && result.error === 'abstract_only') lines = abstractOnlyLines(result, action);
  if (result && result.ok) {
    lines.push({ text: text.route, cls: 'note' });
    for (const n of text.notes) lines.push({ text: n, cls: 'note' });
    const abs = (result.notices || []).find((n) => n.code === 'abstract_only');
    if (abs && abs.fullTextUrl) lines[lines.length - 1].href = abs.fullTextUrl;
  }
  setStatus(lines);
  buttons.forEach((b) => b.removeAttribute('aria-disabled'));
  $('actions').removeAttribute('aria-busy');
  busy = false;
}

async function main() {
  const settings = await loadSettings();
  lang = resolveLanguage(settings.language);
  applyI18n(document, lang);
  $('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('export').addEventListener('click', () => run(ACTIONS.DOWNLOAD));
  $('copy').addEventListener('click', () => run(ACTIONS.COPY));
  $('zip').addEventListener('click', () => run(ACTIONS.ZIP));
  $('pdf').addEventListener('click', onPdfClick);
  $('pdf-fast').addEventListener('click', startFastPdf);
  $('footer-version').textContent = `v${chrome.runtime.getManifest().version}`;
  chrome.commands.getAll().then((cmds) => {
    $('shortcut-kbd').textContent = exportShortcut(lang, cmds);
    $('shortcuts').title = shortcutText(lang, cmds);
  }, () => {});
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await inspect(settings);
}

main();
