// bioRxiv / medRxiv 官方接口（api.biorxiv.org）：期刊 DOI → 预印本 DOI → 最新版本的 JATS XML。
//   GET /pubs/{server}/{publishedDoi}   期刊 DOI 对应的预印本（bioRxiv 自己维护的对应关系，比按标题猜可靠）
//   GET /details/{server}/{preprintDoi} 每个版本一条，jatsxml 是全文 XML 地址（www.biorxiv.org / www.medrxiv.org）
// 主站在 Cloudflare 后面，偶尔会拒绝请求；拿不到 XML 时调用方退回只给链接。
import { normalizeDoi } from '../ids';

export const BIORXIV_API = 'https://api.biorxiv.org';
export const PREPRINT_SERVERS = ['biorxiv', 'medrxiv'];
export const BIORXIV_TIMEOUT_MS = 8000;
const XML_HOSTS = new Set(['www.biorxiv.org', 'www.medrxiv.org']);

async function getJson(url, { fetchImpl, timeoutMs, timers }) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = timers.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' }, credentials: 'omit' });
    if (!res.ok) return { ok: false, reason: 'http', status: res.status };
    return { ok: true, json: await res.json() };
  } catch (_) {
    return { ok: false, reason: timedOut ? 'timeout' : 'network' };
  } finally {
    timers.clearTimeout(timer);
  }
}

const doiPath = (doi) => normalizeDoi(doi).split('/').map(encodeURIComponent).join('/');

/** jatsxml 只认两个预印本站点的 https 地址 */
export function preprintXmlUrl(u) {
  try {
    const x = new URL(String(u || ''));
    if (x.protocol === 'http:') x.protocol = 'https:';
    return x.protocol === 'https:' && XML_HOSTS.has(x.hostname) ? x.href : '';
  } catch (_) {
    return '';
  }
}

/**
 * 期刊 DOI → 预印本（两个站点都查，先 bioRxiv）
 * @returns {Promise<{ok:true, server:string, doi:string, version:string, date:string, title:string, xmlUrl:string, url:string} | {ok:false, reason:string}>}
 */
export async function findPreprint(publishedDoi, { fetchImpl = globalThis.fetch, timeoutMs = BIORXIV_TIMEOUT_MS, timers = globalThis } = {}) {
  const id = normalizeDoi(publishedDoi);
  if (!id) return { ok: false, reason: 'invalid_id' };
  const opts = { fetchImpl, timeoutMs, timers };
  let lastError = null;
  for (const server of PREPRINT_SERVERS) {
    const pubs = await getJson(`${BIORXIV_API}/pubs/${server}/${doiPath(id)}`, opts);
    if (!pubs.ok) { lastError = pubs; continue; }
    const hit = ((pubs.json && pubs.json.collection) || []).find((c) => c && c.preprint_doi && normalizeDoi(c.published_doi || '').toLowerCase() === id.toLowerCase());
    if (!hit) continue;
    const preprintDoi = normalizeDoi(hit.preprint_doi);
    const details = await getJson(`${BIORXIV_API}/details/${server}/${doiPath(preprintDoi)}`, opts);
    if (!details.ok) return details;
    const versions = ((details.json && details.json.collection) || []).filter((v) => v && preprintXmlUrl(v.jatsxml));
    // 最新版本（version 最大）
    const latest = versions.sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0];
    const url = `https://www.${server}.org/content/${preprintDoi}${latest ? `v${latest.version}` : ''}`;
    if (!latest) return { ok: true, server, doi: preprintDoi, version: '', date: '', title: String(hit.preprint_title || ''), xmlUrl: '', url };
    return { ok: true, server, doi: preprintDoi, version: String(latest.version || ''), date: String(latest.date || ''), title: String(latest.title || hit.preprint_title || ''), xmlUrl: preprintXmlUrl(latest.jatsxml), url };
  }
  return lastError || { ok: false, reason: 'not_found' };
}

/** 取预印本 JATS（后台请求，不带 Cookie） */
export async function fetchPreprintXml(xmlUrl, { fetchImpl = globalThis.fetch, timeoutMs = BIORXIV_TIMEOUT_MS, timers = globalThis } = {}) {
  const url = preprintXmlUrl(xmlUrl);
  if (!url) return { ok: false, reason: 'invalid_id' };
  const controller = new AbortController();
  let timedOut = false;
  const timer = timers.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/xml, text/xml' }, credentials: 'omit' });
    if (!res.ok) return { ok: false, reason: 'http', status: res.status };
    const xml = await res.text();
    return /<article[\s>]/.test(xml) ? { ok: true, xml } : { ok: false, reason: 'not_available' };
  } catch (_) {
    return { ok: false, reason: timedOut ? 'timeout' : 'network' };
  } finally {
    timers.clearTimeout(timer);
  }
}
