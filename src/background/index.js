// 后台：Chrome/Edge 是 service worker，Firefox 是 event page（同一份产物，见 scripts/manifest-target.js）。
// 职责：代 content script 请求 Europe PMC（跨域 + 超时）、下载 .md / ZIP、右键菜单和快捷键、安装后打开引导页、
// PDF 解析任务（L3，默认关闭）。
import { createJatsService, createDoiLookupService } from '../core/europepmc/client';
import { loadSettings, SETTINGS_KEY } from '../config/settings';
import { resolveLanguage } from '../config/i18n';
import { errorText } from '../ui/shared/result-text';
import { MSG } from '../utils/messages';
import { downloadMarkdown, downloadZip } from './download';
import { fetchAsset } from './fetch-asset';
import { createMenuBuilder, menuAction } from './context-menu';
import { createActionRunner } from './run-action';
import { isTrustedSender, isExtensionPageSender } from './message-guards';
import { createPdfRunner } from './pdf-task';
import { createPdfRegistry } from '../pdf/providers';
import { saveDeliverable } from '@pdf-core/output/save.js';
import { requirePaddleOriginRule, installPaddleOriginRuleListeners } from './paddle-origin-rule';
import { scheduleReloadWhenIdle } from './dnr-reinit';

const log = (...args) => console.warn('[journal-md]', ...args);

const jats = createJatsService({ fetchImpl: (...args) => fetch(...args) });
const doiLookup = createDoiLookupService({ fetchImpl: (...args) => fetch(...args) });
const getLanguage = async () => resolveLanguage((await loadSettings()).language);
const menus = createMenuBuilder({ menus: chrome.contextMenus, runtime: chrome.runtime, getLanguage, log });
const runner = createActionRunner({
  tabs: chrome.tabs, scripting: chrome.scripting, action: chrome.action, log,
  describeError: async (error) => errorText(await getLanguage(), error),
});

function downloadPromise(opts) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ saveAs: false, conflictAction: 'uniquify', ...opts }, (id) => {
      const err = chrome.runtime.lastError;
      if (err || id === undefined) reject(new Error((err && err.message) || 'download_failed'));
      else resolve(id);
    });
  });
}

function pdfBadge(state) {
  try {
    const text = state === 'run' ? '…' : state === 'ok' ? '✓' : '!';
    chrome.action.setBadgeBackgroundColor({ color: state === 'ok' ? '#1a7f37' : state === 'err' ? '#b42318' : '#0f766e' });
    chrome.action.setBadgeText({ text });
    if (state !== 'run') setTimeout(() => chrome.action.setBadgeText({ text: '' }), 6000);
  } catch (_) { /* 没有 action API（测试环境） */ }
}

const pdf = createPdfRunner({
  registry: createPdfRegistry(),
  storage: chrome.storage.local,
  downloadUrl: (opts) => downloadPromise(opts),
  saveDeliverable: (result, base) => saveDeliverable(result, base, { download: (opts) => downloadPromise(opts) }),
  // PaddleOCR 网关拒绝带扩展 Origin 的请求：提交前确认 DNR 规则已装上（arxiv-md R5-01）。
  // Chromium 同一会话刚授予 DNR 权限时规则可能装不上（arxiv-md QA L-01）：等扩展页面都关掉、没有任务时重载扩展，下次就能用
  ensureRule: async (providerId) => {
    if (providerId !== 'paddleocr') return;
    try {
      await requirePaddleOriginRule(chrome);
    } catch (e) {
      if (e && e.reason === 'dnr_not_ready' && chrome.runtime.getContexts) scheduleReloadWhenIdle({ isIdle: () => !pdf.isRunning() });
      throw e;
    }
  },
  badge: pdfBadge,
  log,
  getFilenameTemplate: async () => (await loadSettings()).filenameTemplate,
});

export function handleMessage(message, sender) {
  // 只接受本扩展自己的页面和支持站点上的 content script（审查 N-4）
  if (!message || !isTrustedSender(sender, chrome.runtime.id)) return null;
  switch (message.type) {
  case MSG.FETCH_JATS:
    return jats.get(message.pmcid);
  case MSG.LOOKUP_DOI:
    return doiLookup.get(message.doi);
  case MSG.DOWNLOAD:
    return downloadMarkdown({ markdown: message.markdown, filename: message.filename });
  case MSG.DOWNLOAD_ZIP:
    return downloadZip({ base64: message.base64, filename: message.filename });
  case MSG.FETCH_ASSET:
    return fetchAsset(message.url);
  // PDF 解析只能由扩展自己的页面发起（弹窗里的确认、设置页的测试连接），网页脚本没法替用户确认
  case MSG.PDF_START:
    return isExtensionPageSender(sender, chrome.runtime.id) ? pdf.start(message.request || {}) : null;
  case MSG.PDF_TEST:
    return isExtensionPageSender(sender, chrome.runtime.id) ? pdf.test(message.provider, message.token) : null;
  default:
    return null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const p = handleMessage(message, sender);
  if (!p) return false;
  Promise.resolve(p).then(sendResponse, (e) => sendResponse({ ok: false, error: 'unknown', detail: e && e.message }));
  return true;
});

chrome.runtime.onInstalled.addListener((details) => {
  menus.refresh();
  if (details && details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html?welcome=1') });
  }
});

chrome.runtime.onStartup.addListener(() => menus.refresh());

// 上一次被打断的 PDF 任务标成失败；有 DNR 权限时装好 PaddleOCR 的去 Origin 规则
pdf.recover().catch(() => {});
if (chrome.permissions && chrome.permissions.onAdded) installPaddleOriginRuleListeners(chrome);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[SETTINGS_KEY]) menus.refresh();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const action = menuAction(info.menuItemId);
  if (action) runner.run(tab, action);
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  const action = command === 'export-markdown' ? 'download' : command === 'copy-markdown' ? 'copy' : null;
  if (!action) return;
  const target = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  runner.run(target, action);
});
