// 右键菜单和快捷键：让当前标签页的 content script 执行导出 / 复制。
// 标签页在安装前就打开、还没有 content script 时，用 scripting 注入一次再重试（activeTab + 已授权 host）。
import { MSG } from '../utils/messages';
import { detectSite } from '../core/sites/registry';

const BADGE_CLEAR_MS = 4000;

export function createActionRunner({ tabs, scripting, action, timers = globalThis, log = () => {} }) {
  function badge(tabId, text, color) {
    if (!action || tabId == null) return;
    try {
      action.setBadgeBackgroundColor({ tabId, color });
      action.setBadgeText({ tabId, text });
      if (text) timers.setTimeout(() => action.setBadgeText({ tabId, text: '' }), BADGE_CLEAR_MS);
    } catch (_) { /* 标签页已关闭 */ }
  }

  async function send(tabId, message) {
    try {
      return await tabs.sendMessage(tabId, message);
    } catch (e) {
      // 没有接收方：注入后重试一次
      await scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      return tabs.sendMessage(tabId, message);
    }
  }

  /** @returns {Promise<object>} content script 的导出结果 */
  async function run(tab, actionName) {
    if (!tab || tab.id == null) return { ok: false, error: 'content_unreachable' };
    const det = detectSite(tab.url || '');
    if (!det.supported) {
      badge(tab.id, '!', '#b42318');
      return { ok: false, error: det.site ? 'site_planned' : 'unsupported_page' };
    }
    badge(tab.id, '…', '#1d4e89');
    let result;
    try {
      result = await send(tab.id, { type: MSG.EXPORT, action: actionName, toast: true });
    } catch (e) {
      log(`run ${actionName} failed: ${e && e.message}`);
      result = { ok: false, error: 'content_unreachable' };
    }
    const ok = result && result.ok;
    badge(tab.id, ok ? '✓' : '!', ok ? '#1a7f37' : '#b42318');
    return result || { ok: false, error: 'unknown' };
  }

  return { run };
}
