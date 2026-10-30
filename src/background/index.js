// 后台：Chrome/Edge 是 service worker，Firefox 是 event page（同一份产物，见 scripts/manifest-target.js）。
// 职责：代 content script 请求 Europe PMC（跨域 + 超时）、下载 .md、右键菜单和快捷键、安装后打开引导页。
import { createJatsService } from '../core/europepmc/client';
import { loadSettings, SETTINGS_KEY } from '../config/settings';
import { resolveLanguage } from '../config/i18n';
import { MSG } from '../utils/messages';
import { downloadMarkdown } from './download';
import { createMenuBuilder, menuAction } from './context-menu';
import { createActionRunner } from './run-action';

const log = (...args) => console.warn('[journal-md]', ...args);

const jats = createJatsService({ fetchImpl: (...args) => fetch(...args) });
const getLanguage = async () => resolveLanguage((await loadSettings()).language);
const menus = createMenuBuilder({ menus: chrome.contextMenus, runtime: chrome.runtime, getLanguage, log });
const runner = createActionRunner({ tabs: chrome.tabs, scripting: chrome.scripting, action: chrome.action, log });

export function handleMessage(message, sender) {
  // 只接受本扩展自己的页面和 content script
  if (!message || !sender || sender.id !== chrome.runtime.id) return null;
  switch (message.type) {
  case MSG.FETCH_JATS:
    return jats.get(message.pmcid);
  case MSG.PROBE_JATS:
    return jats.get(message.pmcid).then((r) => ({ ok: r.ok, reason: r.reason }));
  case MSG.DOWNLOAD:
    return downloadMarkdown({ markdown: message.markdown, filename: message.filename });
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
