// 设置：存在 chrome.storage.sync 的 settings 键里，改动即时生效（无保存按钮）。
import { DEFAULT_FILENAME_TEMPLATE } from '../core/filename';
import { SUPPORTED_SITE_IDS } from '../core/sites/registry';

export const SETTINGS_KEY = 'settings';
export const LANGUAGES = ['auto', 'en', 'zh'];

export const DEFAULT_SETTINGS = Object.freeze({
  language: 'auto',
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  includeImages: true,
  preferJats: true,
  showFab: true,
  sites: Object.freeze(Object.fromEntries(SUPPORTED_SITE_IDS.map((id) => [id, true]))),
});

export function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const sites = { ...DEFAULT_SETTINGS.sites };
  if (r.sites && typeof r.sites === 'object') {
    for (const id of SUPPORTED_SITE_IDS) if (typeof r.sites[id] === 'boolean') sites[id] = r.sites[id];
  }
  const tpl = typeof r.filenameTemplate === 'string' ? r.filenameTemplate.trim().slice(0, 200) : '';
  return {
    language: LANGUAGES.includes(r.language) ? r.language : DEFAULT_SETTINGS.language,
    filenameTemplate: tpl || DEFAULT_SETTINGS.filenameTemplate,
    includeImages: typeof r.includeImages === 'boolean' ? r.includeImages : DEFAULT_SETTINGS.includeImages,
    preferJats: typeof r.preferJats === 'boolean' ? r.preferJats : DEFAULT_SETTINGS.preferJats,
    showFab: typeof r.showFab === 'boolean' ? r.showFab : DEFAULT_SETTINGS.showFab,
    sites,
  };
}

export async function loadSettings(area = chrome.storage.sync) {
  try {
    const got = await area.get(SETTINGS_KEY);
    return normalizeSettings(got && got[SETTINGS_KEY]);
  } catch (_) {
    return normalizeSettings(null);
  }
}

export async function saveSettings(patch, area = chrome.storage.sync) {
  const current = await loadSettings(area);
  const next = normalizeSettings({ ...current, ...patch, sites: { ...current.sites, ...(patch.sites || {}) } });
  await area.set({ [SETTINGS_KEY]: next });
  return next;
}
