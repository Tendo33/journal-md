// 界面文案只有一份来源：_locales/*/messages.json（manifest 用 __MSG_*__，界面用 t()）。
// chrome.i18n 不能在运行时切换语言，所以界面自己读 JSON，以便设置页的「语言」选项立即生效。
import en from '../_locales/en/messages.json';
import zh from '../_locales/zh_CN/messages.json';

export const MESSAGES = { en, zh };

/** 'auto' 跟随浏览器：zh* → 中文，其余英文（与 arxiv-md utils/browser-language.js 规则一致） */
export function resolveLanguage(setting, uiLanguage) {
  if (setting === 'en' || setting === 'zh') return setting;
  let ui = uiLanguage;
  if (ui === undefined) {
    ui = (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage)
      ? chrome.i18n.getUILanguage()
      : (typeof navigator !== 'undefined' ? navigator.language : '');
  }
  return /^zh\b/i.test(ui || '') ? 'zh' : 'en';
}

/** 只替换传入的占位符，其余 {xxx} 原样保留（文件名模板说明里要显示 {title}） */
export function t(lang, key, subs) {
  const table = MESSAGES[lang] || MESSAGES.en;
  const entry = table[key] || MESSAGES.en[key];
  let s = entry ? entry.message : key;
  if (subs) for (const [k, v] of Object.entries(subs)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** 给 [data-i18n] / [data-i18n-title] / [data-i18n-aria-label] 元素填文案 */
export function applyI18n(root, lang) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(lang, el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(lang, el.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => { el.setAttribute('aria-label', t(lang, el.dataset.i18nAriaLabel)); });
  if (root.documentElement) root.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
}
