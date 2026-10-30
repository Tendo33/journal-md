// PDF 解析设置只存 chrome.storage.local（Token 不跨设备同步，也不进 sync，PRD §2.11）。默认关闭。
import { DEFAULT_PDF_PROVIDER, PDF_PROVIDER_IDS } from './providers';

export const PDF_SETTINGS_KEY = 'pdfSettings';
export const PDF_TASK_KEY = 'pdfTask';

export function normalizePdfSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const tokens = {};
  for (const id of PDF_PROVIDER_IDS) {
    const v = r.tokens && typeof r.tokens[id] === 'string' ? r.tokens[id].trim().slice(0, 4096) : '';
    if (v) tokens[id] = v;
  }
  return {
    enabled: r.enabled === true,
    provider: PDF_PROVIDER_IDS.includes(r.provider) ? r.provider : DEFAULT_PDF_PROVIDER,
    tokens,
  };
}

export async function loadPdfSettings(area = chrome.storage.local) {
  try {
    const got = await area.get(PDF_SETTINGS_KEY);
    return normalizePdfSettings(got && got[PDF_SETTINGS_KEY]);
  } catch (_) {
    return normalizePdfSettings(null);
  }
}

export async function savePdfSettings(patch, area = chrome.storage.local) {
  const cur = await loadPdfSettings(area);
  const next = normalizePdfSettings({ ...cur, ...patch, tokens: { ...cur.tokens, ...(patch.tokens || {}) } });
  await area.set({ [PDF_SETTINGS_KEY]: next });
  return next;
}
