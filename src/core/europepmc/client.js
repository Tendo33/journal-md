// Europe PMC REST：GET /{PMCID}/fullTextXML（只对 OA 文章开放，非 OA 返回 404）。
// 在后台（service worker / event page）里调用；fetch 可注入，测试不访问真实网络。
import { normalizePmcid } from '../ids';

export const EUROPEPMC_REST = 'https://www.ebi.ac.uk/europepmc/webservices/rest';
export const JATS_TIMEOUT_MS = 8000;

export function fullTextXmlUrl(pmcid) {
  return `${EUROPEPMC_REST}/${normalizePmcid(pmcid)}/fullTextXML`;
}

/**
 * @returns {Promise<{ok:true, xml:string} | {ok:false, reason:'invalid_id'|'not_available'|'timeout'|'network'|'http', status?:number}>}
 */
export async function fetchFullTextXml(pmcid, { fetchImpl = globalThis.fetch, timeoutMs = JATS_TIMEOUT_MS, timers = globalThis } = {}) {
  const id = normalizePmcid(pmcid);
  if (!id) return { ok: false, reason: 'invalid_id' };
  const controller = new AbortController();
  let timedOut = false;
  const timer = timers.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const res = await fetchImpl(fullTextXmlUrl(id), {
      signal: controller.signal,
      headers: { Accept: 'application/xml' },
      credentials: 'omit',
      cache: 'default',
    });
    if (res.status === 404) return { ok: false, reason: 'not_available', status: 404 };
    if (!res.ok) return { ok: false, reason: 'http', status: res.status };
    const xml = await res.text();
    if (!/<article[\s>]/.test(xml)) return { ok: false, reason: 'not_available', status: res.status };
    return { ok: true, xml };
  } catch (_) {
    return { ok: false, reason: timedOut ? 'timeout' : 'network' };
  } finally {
    timers.clearTimeout(timer);
  }
}

/**
 * 带缓存和请求合并的取数服务：popup 探测和随后的导出共用同一次请求。
 * 只缓存成功和「非 OA」两种确定结果；超时、网络错误下次重试。
 */
export function createJatsService({ fetchImpl, timeoutMs = JATS_TIMEOUT_MS, maxEntries = 4, ttlMs = 10 * 60 * 1000, now = () => Date.now(), timers } = {}) {
  const cache = new Map();
  const inflight = new Map();

  function remember(id, result) {
    if (!(result.ok || result.reason === 'not_available')) return;
    cache.delete(id);
    cache.set(id, { at: now(), result });
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
  }

  async function get(pmcid) {
    const id = normalizePmcid(pmcid);
    if (!id) return { ok: false, reason: 'invalid_id' };
    const hit = cache.get(id);
    if (hit && now() - hit.at < ttlMs) return hit.result;
    if (inflight.has(id)) return inflight.get(id);
    const p = fetchFullTextXml(id, { fetchImpl, timeoutMs, ...(timers ? { timers } : {}) })
      .then((result) => { remember(id, result); return result; })
      .finally(() => inflight.delete(id));
    inflight.set(id, p);
    return p;
  }

  return { get, _cache: cache };
}
