// popup 的纯展示逻辑（不碰 chrome.*，便于测试）。
import { t } from '../../config/i18n';
import { detectSite } from '../../core/sites/registry';
import { errorText } from '../shared/result-text';

/** 只看 URL 和设置就能判断的失败（不用等 content script） */
export function quickCheck(url, settings) {
  const det = detectSite(url || '');
  if (!det.site) return { ok: false, error: 'unsupported_page' };
  if (!det.supported) return { ok: false, error: 'site_planned', siteName: det.site.name };
  if (settings && settings.sites && settings.sites[det.site.id] === false) return { ok: false, error: 'site_disabled', siteName: det.site.name };
  if (!det.isArticle) return { ok: false, error: 'not_article' };
  return { ok: true, siteId: det.site.id, siteName: det.site.name };
}

export function emptyText(lang, check) {
  return errorText(lang, check.error, check);
}

/**
 * 「JATS：导出时检查 · 页面 ✓」。打开弹窗时不请求 Europe PMC，所以 JATS 只显示「导出时检查」。
 */
export function routeItems(lang, routes) {
  const items = [];
  if (routes.jats) {
    items.push({ text: t(lang, 'routeJatsDeferred'), state: 'deferred', desc: t(lang, 'routeJatsDeferred') });
  }
  items.push({ text: `${t(lang, 'routeDom')} ${routes.dom ? '✓' : '✗'}`, state: routes.dom ? 'yes' : 'no', desc: `${t(lang, 'routeDom')}: ${t(lang, routes.dom ? 'routeYes' : 'routeNo')}` });
  if (!routes.dom) {
    items.push({ text: `${t(lang, 'routeAbstract')} ${routes.abstract ? '✓' : '✗'}`, state: routes.abstract ? 'yes' : 'no', desc: `${t(lang, 'routeAbstract')}: ${t(lang, routes.abstract ? 'routeYes' : 'routeNo')}` });
  }
  return items;
}

export function shortcutText(lang, commands) {
  const find = (name) => ((commands || []).find((c) => c.name === name) || {}).shortcut || t(lang, 'popupNoShortcut');
  return t(lang, 'popupShortcuts', { export: find('export-markdown'), copy: find('copy-markdown') });
}
