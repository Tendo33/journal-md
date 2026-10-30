// 右键菜单和快捷键：让当前标签页的 content script 执行导出 / 复制。
// 标签页在安装前就打开、还没有 content script 时，用 scripting 注入一次再重试（activeTab + 已授权 host）。
import { MSG } from '../utils/messages';
import { detectSite } from '../core/sites/registry';

const BADGE_CLEAR_MS = 4000;

/**
 * content script 不在场（不支持的页面、页面还没加载完、扩展刚更新）时由后台在页面里显示一条提示：
 * 快捷键和右键菜单会带来 activeTab 授权，可以注入这个自包含的函数（不能引用外部变量）。
 */
export function pageNotice(text) {
  const id = 'journal-md-notice-host';
  const old = document.getElementById(id);
  if (old) old.remove();
  const host = document.createElement('div');
  host.id = id;
  const root = host.attachShadow({ mode: 'open' });
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.textContent = text;
  box.style.cssText = 'position:fixed;right:16px;bottom:80px;z-index:2147483647;max-width:min(360px,calc(100vw - 32px));box-sizing:border-box;padding:12px 16px;border-radius:8px;border:1px solid #b42318;background:#fff;color:#1f2328;font:14px/20px system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.16)';
  root.append(box);
  (document.body || document.documentElement).appendChild(host);
  setTimeout(() => host.remove(), 8000);
}

export function createActionRunner({ tabs, scripting, action, timers = globalThis, log = () => {}, describeError = null }) {
  async function notice(tabId, error) {
    if (!describeError || !scripting || !scripting.executeScript) return;
    try {
      await scripting.executeScript({ target: { tabId }, func: pageNotice, args: [await describeError(error)] });
    } catch (e) {
      log(`notice failed: ${e && e.message}`); // chrome:// 等页面不能注入，只剩徽标
    }
  }

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
      const error = det.site ? 'site_planned' : 'unsupported_page';
      await notice(tab.id, error);
      return { ok: false, error };
    }
    badge(tab.id, '…', '#0f766e');
    let result;
    try {
      result = await send(tab.id, { type: MSG.EXPORT, action: actionName, toast: true });
    } catch (e) {
      log(`run ${actionName} failed: ${e && e.message}`);
      result = { ok: false, error: 'content_unreachable' };
    }
    const ok = result && result.ok;
    badge(tab.id, ok ? '✓' : '!', ok ? '#1a7f37' : '#b42318');
    // content script 没回话：它自己的提示也没出来，由后台补一条（QA JM-M2-02：失败不能没有任何提示）
    if (!result || result.error === 'content_unreachable') await notice(tab.id, (result && result.error) || 'unknown');
    return result || { ok: false, error: 'unknown' };
  }

  return { run };
}
