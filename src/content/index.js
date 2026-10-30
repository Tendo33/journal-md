// content script：只在支持站点的文章页注入；页面加载时不发网络请求，
// 只在收到 popup / 后台的消息（或用户点页内按钮）时解析当前 DOM。
import { exportArticle, inspectPage } from '../core/export/pipeline';
import { loadSettings } from '../config/settings';
import { resolveLanguage, t } from '../config/i18n';
import { MSG, ACTIONS } from '../utils/messages';
import { writeClipboard } from '../utils/clipboard';
import { describeResult } from '../ui/shared/result-text';
import { showToast } from './toast';
import { buildArticleZip, base64FromBytes, zipFilename } from './zip-export';
import { mountFab, fabBottom, fabLabels } from './fab';
import { detectSite } from '../core/sites/registry';
import { saveSettings, SETTINGS_KEY } from '../config/settings';

const SITE_XML_TIMEOUT_MS = 8000;

function fetchJats(pmcid) {
  return chrome.runtime.sendMessage({ type: MSG.FETCH_JATS, pmcid });
}

function lookupDoi(doi) {
  return chrome.runtime.sendMessage({ type: MSG.LOOKUP_DOI, doi });
}

/** 出版商同站 XML（Frontiers citation_xml_url）：只取和当前页同源的地址，在页面里请求（带用户自己的 Cookie，不经过第三方） */
/** 本页的服务器 HTML（MDPI）：只取和当前页同源、同路径的地址，不跟着跳到别的站 */
async function fetchPageHtml(url) {
  let target;
  try { target = new URL(url, location.href); } catch (_) { return { ok: false, reason: 'invalid_id' }; }
  if (target.origin !== location.origin || target.pathname !== location.pathname) return { ok: false, reason: 'invalid_id' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SITE_XML_TIMEOUT_MS);
  try {
    const res = await fetch(target.href, { credentials: 'same-origin', signal: controller.signal, headers: { Accept: 'text/html' } });
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok || !type.includes('text/html') || new URL(res.url).origin !== location.origin) return { ok: false, reason: 'http', status: res.status };
    return { ok: true, html: await res.text() };
  } catch (_) {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSiteXml(url) {
  let target;
  try { target = new URL(url, location.href); } catch (_) { return { ok: false, reason: 'invalid_id' }; }
  if (target.origin !== location.origin) return { ok: false, reason: 'invalid_id' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SITE_XML_TIMEOUT_MS);
  try {
    const res = await fetch(target.href, { credentials: 'same-origin', signal: controller.signal, headers: { Accept: 'application/xml, text/xml' } });
    if (!res.ok) return { ok: false, reason: res.status === 404 ? 'not_available' : 'http', status: res.status };
    const xml = await res.text();
    return /<article[\s>]/.test(xml) ? { ok: true, xml } : { ok: false, reason: 'not_available' };
  } catch (_) {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 单页应用（MDPI 新站、Frontiers）在加载后还会重新渲染：等 DOM 安静下来（400ms 没有变化，最多 maxMs）。
 * 只在第一次没取到正文时用（QA JM-M2-02）。
 */
export function waitForDomSettled(doc, { quietMs = 400, maxMs = 3000 } = {}) {
  return new Promise((resolve) => {
    let quiet = null;
    const done = () => { observer.disconnect(); clearTimeout(quiet); clearTimeout(limit); resolve(); };
    const observer = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(done, quietMs); });
    observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
    quiet = setTimeout(done, quietMs);
    const limit = setTimeout(done, maxMs);
  });
}

const RETRY_ERRORS = ['no_content', 'page_changed'];

async function exportOnce(settings, action) {
  return exportArticle({ doc: document, url: location.href, settings, fetchJats, services: { lookupDoi, fetchSiteXml, fetchPageHtml }, format: action === ACTIONS.ZIP ? 'zip' : 'md' });
}

async function deliver(result, action) {
  if (result.ok && action === ACTIONS.ZIP) {
    let zip = null;
    try {
      zip = await buildArticleZip(result);
    } catch (e) {
      console.error('[journal-md] zip failed', e);
    }
    const filename = zipFilename(result.filename);
    const dl = zip ? await chrome.runtime.sendMessage({ type: MSG.DOWNLOAD_ZIP, base64: base64FromBytes(zip.bytes), filename }) : null;
    if (!dl || !dl.ok) return { ...result, ok: false, error: 'download_failed' };
    // markdown 换成 ZIP 里那份（下载失败的图片已换回原网址），供调用方复制
    return { ...result, saved: true, filename, zip: { packed: zip.packed, total: zip.total, failedHosts: zip.failedHosts } };
  }
  if (result.ok && action === ACTIONS.DOWNLOAD) {
    const dl = await chrome.runtime.sendMessage({ type: MSG.DOWNLOAD, markdown: result.markdown, filename: result.filename });
    return !dl || !dl.ok ? { ...result, ok: false, error: 'download_failed' } : { ...result, saved: true };
  }
  if (result.ok && action === ACTIONS.COPY) {
    const copied = await writeClipboard(result.markdown);
    return copied ? { ...result, copied: true } : { ...result, ok: false, error: 'clipboard_failed' };
  }
  return result;
}

async function runExport(action, withToast) {
  let lang = 'en';
  let result;
  // 任何一步出错都要落到最后的提示上，不能静默失败（QA JM-M2-02）
  try {
    const settings = await loadSettings();
    lang = resolveLanguage(settings.language);
    if (withToast) showToast(t(lang, 'statusWorking'), 'working', { lang, beside: fabBottom(document) });
    result = await exportOnce(settings, action);
    if (!result.ok && RETRY_ERRORS.includes(result.error)) {
      await waitForDomSettled(document);
      result = await exportOnce(settings, action);
    }
    result = await deliver(result, action);
  } catch (e) {
    console.error('[journal-md] export failed', e);
    result = { ok: false, error: result && result.ok ? 'download_failed' : 'unknown' };
  }
  if (withToast) {
    const text = describeResult(result, lang, action);
    showToast([text.status, ...text.notes].filter(Boolean).join(' '), result.ok ? 'success' : 'error', { lang, beside: fabBottom(document) });
  }
  delete result.assets;
  return result;
}

function onMessage(message, _sender, sendResponse) {
  if (!message || typeof message.type !== 'string') return false;
  if (message.type === MSG.PING) {
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === MSG.INSPECT) {
    loadSettings().then((s) => sendResponse(inspectPage(document, location.href, s)))
      .catch(() => sendResponse({ ok: false, error: 'unknown' }));
    return true;
  }
  if (message.type === MSG.EXPORT) {
    const action = Object.values(ACTIONS).includes(message.action) ? message.action : ACTIONS.NONE;
    runExport(action, !!message.toast).then(sendResponse);
    return true;
  }
  return false;
}

// ---- 页内悬浮按钮 ----
let fab = null;
let fabLang = 'en';

function fabWanted(settings) {
  const det = detectSite(location.href);
  return !!(settings.showFab && det.supported && det.isArticle && settings.sites[det.site.id] !== false);
}

async function syncFab() {
  const settings = await loadSettings();
  if (!fabWanted(settings)) {
    if (fab) { fab.remove(); fab = null; }
    return;
  }
  const lang = resolveLanguage(settings.language);
  // 已经显示：只在语言变了时原地换文案（设置页切换语言立即生效，按钮状态和打开的菜单不受影响）
  if (fab) {
    if (lang !== fabLang) { fabLang = lang; fab.setLabels(fabLabels(lang)); }
    return;
  }
  fabLang = lang;
  fab = mountFab(document, {
    labels: fabLabels(lang),
    onAction: (action) => runExport(action, true),
    onHide: async () => {
      await saveSettings({ showFab: false });
      showToast(t(fabLang, 'fabHidden'), 'info', { lang: fabLang });
    },
  });
}

// popup 可能用 scripting 再注入一次：只挂一个监听器
if (!globalThis.__journalMdContentLoaded) {
  globalThis.__journalMdContentLoaded = true;
  chrome.runtime.onMessage.addListener(onMessage);
  syncFab();
  // 设置页里开关按钮、切换语言、关闭站点时立即生效
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes[SETTINGS_KEY]) return;
    syncFab();
  });
  // 单页应用（Europe PMC、Frontiers）换文章时地址变了但不重新加载：按地址决定按钮是否显示
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    syncFab();
  }, 1500);
}
