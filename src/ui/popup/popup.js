import { loadSettings } from '../../config/settings';
import { applyI18n, resolveLanguage, t } from '../../config/i18n';
import { MSG, ACTIONS } from '../../utils/messages';
import { describeResult, errorText } from '../shared/result-text';
import { quickCheck, emptyText, routeItems, shortcutText, requestZipImagePermission } from './popup-view';
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

function setEmpty(text) {
  show('loading', false);
  show('info', false);
  show('actions', false);
  const el = $('empty');
  el.textContent = text;
  el.hidden = false;
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
    for (const { text, cls, href } of lines) {
      if (!text) continue;
      const p = document.createElement('p');
      p.className = cls;
      p.textContent = text;
      if (href) {
        p.append(' ');
        const a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = t(lang, 'noticeFullTextLink');
        p.append(a);
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
  if (!quick.ok) return setEmpty(emptyText(lang, quick));
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
  if (!pdfReady(pdfSettings) || !pdf || !pdf.url) return;
  const name = providerLabel(pdfSettings.provider);
  $('pdf').textContent = t(lang, 'pdfButton', { provider: name });
  $('pdf').title = t(lang, 'pdfButtonTitle', { provider: name });
  show('pdf-row', true);
  // 弹窗重新打开时显示这一页上次任务的状态
  const got = await chrome.storage.local.get(PDF_TASK_KEY);
  const task = got && got[PDF_TASK_KEY];
  if (task && task.pageUrl === tab.url) setPdfStatus(task);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[PDF_TASK_KEY] && changes[PDF_TASK_KEY].newValue && changes[PDF_TASK_KEY].newValue.pageUrl === tab.url) setPdfStatus(changes[PDF_TASK_KEY].newValue);
  });
}

async function startPdf() {
  const pdf = pageInfo.pdf;
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

async function run(action, permission = null) {
  if (busy) return;
  busy = true;
  const buttons = [$('export'), $('copy'), $('zip')];
  buttons.forEach((b) => b.setAttribute('aria-disabled', 'true'));
  $('actions').setAttribute('aria-busy', 'true');
  setStatus([{ text: t(lang, 'statusWorking'), cls: 'alert info run' }]);
  let result;
  try {
    // 先等权限弹窗的结果（拒绝也照样导出：图片保留网络链接，结果里有提示）
    if (permission) await permission;
    result = await sendToTab({ type: MSG.EXPORT, action: action === ACTIONS.COPY ? ACTIONS.NONE : action });
    if (result && result.ok && action === ACTIONS.COPY) {
      // popup 有焦点和用户手势，在这里写剪贴板最稳
      await navigator.clipboard.writeText(result.markdown);
      result = { ...result, copied: true };
    }
  } catch (e) {
    result = { ok: false, error: action === ACTIONS.COPY && result && result.ok ? 'clipboard_failed' : 'content_unreachable' };
  }
  const text = describeResult(result, lang, action);
  const lines = [{ text: text.status, cls: result && result.ok ? 'alert ok' : 'alert err' }];
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
  $('zip').addEventListener('click', () => {
    if (busy) return;
    // 同步申请，不能放到 run() 的 await 之后
    const permission = requestZipImagePermission(chrome.permissions, pageInfo && pageInfo.zipOrigins);
    run(ACTIONS.ZIP, permission);
  });
  $('pdf').addEventListener('click', onPdfClick);
  chrome.commands.getAll().then((cmds) => { $('shortcuts').textContent = shortcutText(lang, cmds); }, () => {});
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await inspect(settings);
}

main();
