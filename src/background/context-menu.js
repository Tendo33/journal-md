// 右键菜单（PRD §2.5）：页面上「导出本页为 Markdown」「复制本页为 Markdown」（与 zhihu-md 同一说法），只在支持的站点出现。
// 依赖注入，便于在 node 里测试（结构参考 arxiv-md src/background/context-menu.js）。
import { t } from '../config/i18n';
import { SUPPORTED_PAGE_PATTERNS } from '../core/sites/registry';
import { ACTIONS } from '../utils/messages';

export const MENU = Object.freeze({ EXPORT: 'jmd-export', COPY: 'jmd-copy' });

export function buildMenuItems(lang) {
  return [
    { id: MENU.EXPORT, title: t(lang, 'menuExport'), contexts: ['page'], documentUrlPatterns: SUPPORTED_PAGE_PATTERNS },
    { id: MENU.COPY, title: t(lang, 'menuCopy'), contexts: ['page'], documentUrlPatterns: SUPPORTED_PAGE_PATTERNS },
  ];
}

export function menuAction(menuItemId) {
  if (menuItemId === MENU.EXPORT) return ACTIONS.DOWNLOAD;
  if (menuItemId === MENU.COPY) return ACTIONS.COPY;
  return null;
}

/** 重建菜单；并发调用串行化，避免 duplicate id */
export function createMenuBuilder({ menus, runtime, getLanguage, log = () => {} }) {
  let chain = Promise.resolve();
  async function rebuild() {
    const lang = await getLanguage();
    await new Promise((r) => menus.removeAll(() => r()));
    for (const item of buildMenuItems(lang)) {
      menus.create(item, () => { if (runtime.lastError) log(`menu ${item.id}: ${runtime.lastError.message}`); });
    }
  }
  return {
    refresh() {
      chain = chain.then(rebuild, rebuild);
      return chain;
    },
  };
}
