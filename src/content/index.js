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
import { mountFab, fabMounted } from './fab';
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

async function runExport(action, withToast) {
  const settings = await loadSettings();
  const lang = resolveLanguage(settings.language);
  if (withToast) showToast(t(lang, 'statusWorking'), 'working', { raised: fabMounted(document) });
  let result;
  try {
    result = await exportArticle({ doc: document, url: location.href, settings, fetchJats, services: { lookupDoi, fetchSiteXml }, format: action === ACTIONS.ZIP ? 'zip' : 'md' });
  } catch (e) {
    console.error('[journal-md] export failed', e);
    result = { ok: false, error: 'unknown' };
  }
  if (result.ok && action === ACTIONS.ZIP) {
    let zip = null;
    try {
      zip = await buildArticleZip(result);
    } catch (e) {
      console.error('[journal-md] zip failed', e);
    }
    const filename = zipFilename(result.filename);
    const dl = zip ? await chrome.runtime.sendMessage({ type: MSG.DOWNLOAD_ZIP, base64: base64FromBytes(zip.bytes), filename }) : null;
    if (!dl || !dl.ok) result = { ...result, ok: false, error: 'download_failed' };
    // markdown 换成 ZIP 里那份（下载失败的图片已换回原网址），供调用方复制
    else result = { ...result, saved: true, filename, zip: { packed: zip.packed, total: zip.total } };
  } else if (result.ok && action === ACTIONS.DOWNLOAD) {
    const dl = await chrome.runtime.sendMessage({ type: MSG.DOWNLOAD, markdown: result.markdown, filename: result.filename });
    if (!dl || !dl.ok) result = { ...result, ok: false, error: 'download_failed' };
    else result = { ...result, saved: true };
  } else if (result.ok && action === ACTIONS.COPY) {
    const copied = await writeClipboard(result.markdown);
    if (!copied) result = { ...result, ok: false, error: 'clipboard_failed' };
    else result = { ...result, copied: true };
  }
  if (withToast) {
    const text = describeResult(result, lang, action);
    showToast([text.status, ...text.notes].filter(Boolean).join(' '), result.ok ? 'success' : 'error', { closeLabel: t(lang, 'btnClose'), raised: fabMounted(document) });
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
  if (fab) return;
  const lang = resolveLanguage(settings.language);
  fab = mountFab(document, {
    labels: {
      button: t(lang, 'fabButton'),
      menu: t(lang, 'fabMenu'),
      download: t(lang, 'fabDownload'),
      zip: t(lang, 'fabZip'),
      copy: t(lang, 'fabCopy'),
      hide: t(lang, 'fabHide'),
      run: t(lang, 'statusWorking').replace(/[….]+$/, ''),
      ok: t(lang, 'fabDone'),
      err: t(lang, 'fabFailed'),
    },
    onAction: (action) => runExport(action, true),
    onHide: async () => {
      await saveSettings({ showFab: false });
      showToast(t(lang, 'fabHidden'), 'info', { closeLabel: t(lang, 'btnClose') });
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
    if (fab) { fab.remove(); fab = null; }
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
