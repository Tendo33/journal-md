// Elsevier 全文接口（Article Retrieval API）：GET https://api.elsevier.com/content/article/{doi|pii}/{id}?view=FULL
// 用户自己在 dev.elsevier.com 申请的 API Key，只存在本浏览器（chrome.storage.local），只发给 api.elsevier.com。
// 是否给全文由 Elsevier 按请求来源判断：请求从用户的浏览器发出，在订阅了的机构网络里（校园网、机构 VPN）就能拿到全文；
// 没有权限时只返回题录和摘要，调用方按「没有正文」处理。
import { normalizeDoi } from '../ids';

export const ELSEVIER_API = 'https://api.elsevier.com/content/article';
export const ELSEVIER_KEY_URL = 'https://dev.elsevier.com/apikey/manage';
export const ELSEVIER_TIMEOUT_MS = 15000;
export const PUBLISHER_KEYS_KEY = 'publisherKeys';

/** Elsevier 的 DOI 前缀（ScienceDirect、Cell Press、The Lancet 等） */
export function isElsevierDoi(doi) {
  return /^10\.1016\//i.test(normalizeDoi(doi));
}

export function normalizePii(pii) {
  return String(pii || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

export function elsevierUrl({ doi, pii }, view = 'FULL') {
  const d = normalizeDoi(doi);
  const p = normalizePii(pii);
  if (!d && !p) return '';
  const path = d ? `doi/${d.split('/').map(encodeURIComponent).join('/')}` : `pii/${encodeURIComponent(p)}`;
  return `${ELSEVIER_API}/${path}?view=${view}&httpAccept=text%2Fxml`;
}

export async function loadPublisherKeys(area = chrome.storage.local) {
  try {
    const got = await area.get(PUBLISHER_KEYS_KEY);
    const v = (got && got[PUBLISHER_KEYS_KEY]) || {};
    return { elsevier: typeof v.elsevier === 'string' ? v.elsevier.trim().slice(0, 200) : '' };
  } catch (_) {
    return { elsevier: '' };
  }
}

export async function savePublisherKeys(patch, area = chrome.storage.local) {
  const cur = await loadPublisherKeys(area);
  const next = { elsevier: typeof patch.elsevier === 'string' ? patch.elsevier.trim().slice(0, 200) : cur.elsevier };
  await area.set({ [PUBLISHER_KEYS_KEY]: next });
  return next;
}

/**
 * @returns {Promise<{ok:true, xml:string} | {ok:false, reason:'no_key'|'invalid_id'|'auth'|'not_found'|'quota'|'unavailable'|'http'|'timeout'|'network', status?:number}>}
 */
export async function fetchElsevierXml(ids, key, { fetchImpl = globalThis.fetch, timeoutMs = ELSEVIER_TIMEOUT_MS, timers = globalThis, view = 'FULL' } = {}) {
  if (!key) return { ok: false, reason: 'no_key' };
  const url = elsevierUrl(ids || {}, view);
  if (!url) return { ok: false, reason: 'invalid_id' };
  const controller = new AbortController();
  let timedOut = false;
  const timer = timers.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    // 不带 Cookie：Elsevier 按 IP 和 Key 判断权限
    const res = await fetchImpl(url, { signal: controller.signal, credentials: 'omit', headers: { Accept: 'text/xml', 'X-ELS-APIKey': key } });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'auth', status: res.status };
    if (res.status === 404) return { ok: false, reason: 'not_found', status: 404 };
    if (res.status === 429) return { ok: false, reason: 'quota', status: 429 };
    // 实测（2026-11-05）：格式不对的 Key 也返回 503「Service Unavailable」，和服务真的不可用分不开
    if (res.status === 503) return { ok: false, reason: 'unavailable', status: 503 };
    if (!res.ok) return { ok: false, reason: 'http', status: res.status };
    return { ok: true, xml: await res.text() };
  } catch (_) {
    return { ok: false, reason: timedOut ? 'timeout' : 'network' };
  } finally {
    timers.clearTimeout(timer);
  }
}

/** 设置页的「测试」：只取一篇开放获取文章的题录（view=META），不消耗全文配额 */
export const ELSEVIER_TEST_DOI = '10.1016/j.cell.2020.02.052';
export async function testElsevierKey(key, opts = {}) {
  const r = await fetchElsevierXml({ doi: ELSEVIER_TEST_DOI }, String(key || '').trim(), { ...opts, view: 'META' });
  return r.ok ? { ok: true } : { ok: false, reason: r.reason, status: r.status };
}
