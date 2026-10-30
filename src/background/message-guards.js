// 后台消息的来源校验（思路移植自 arxiv-md src/background/message-guards.js）。
// 只接受本扩展自己的页面，以及注入在支持站点（https）上的本扩展 content script。
import { isSupportedHost } from '../core/sites/registry';

/**
 * 本扩展页面的 URL 前缀：Chrome 为 chrome-extension://<id>/；Firefox 的扩展页是 moz-extension://<内部 UUID>/
 * （UUID ≠ runtime.id），只能从 runtime.getURL('') 取得。
 */
export function extensionPagePrefixes(runtimeId, baseUrl = runtimeBaseUrl()) {
  const out = [`chrome-extension://${runtimeId}/`];
  if (typeof baseUrl === 'string' && /^(?:chrome|moz)-extension:\/\/[^/?#@:]+\/$/.test(baseUrl) && !out.includes(baseUrl)) out.push(baseUrl);
  return out;
}

function runtimeBaseUrl() {
  try {
    const rt = globalThis.chrome && globalThis.chrome.runtime;
    return rt && typeof rt.getURL === 'function' ? rt.getURL('') : '';
  } catch (_) {
    return '';
  }
}

const isExtensionPageUrl = (url, runtimeId, baseUrl) => typeof url === 'string' && extensionPagePrefixes(runtimeId, baseUrl).some((p) => url.startsWith(p));

/**
 * 优先看 sender.url（真正发消息的 frame），tab.url 只作兜底：
 * 本扩展页面放行；其余必须是 https 的支持站点（content script 只注入在这些站点上）。
 */
export function isTrustedSender(sender, runtimeId, baseUrl) {
  if (!sender || !runtimeId || sender.id !== runtimeId) return false;
  const url = sender.url || (sender.tab && sender.tab.url) || '';
  if (!url) return !sender.tab; // 没有 url 也不是标签页：扩展自身上下文
  if (isExtensionPageUrl(url, runtimeId, baseUrl)) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && isSupportedHost(u.hostname);
  } catch (_) {
    return false;
  }
}

/**
 * 只有扩展自己的页面（popup、以标签页打开的设置页）能发：看发消息的 frame 地址（sender.url）必须是本扩展页面。
 * content script 的 sender.url 是网页地址，一律拒绝，网页脚本没法替用户点确认。
 * 和 arxiv-md 不同，这里不因为带 sender.tab 就拒绝：设置页 open_in_tab，也要能测试 Token。
 */
export function isExtensionPageSender(sender, runtimeId, baseUrl) {
  if (!sender || !runtimeId || sender.id !== runtimeId) return false;
  return isExtensionPageUrl(sender.url, runtimeId, baseUrl);
}
