// Unpaywall（api.unpaywall.org/v2/{doi}）：按 DOI 查这篇文章合法的免费版本（PMC、预印本、机构知识库、出版商免费版）。
// 只在页面上只有摘要时、在后台调用；只发 DOI 和 Unpaywall 要求的联系邮箱，不带 Cookie 和页面地址。
import { normalizeDoi, normalizePmcid } from '../ids';

export const UNPAYWALL_API = 'https://api.unpaywall.org/v2';
// Unpaywall 要求每个请求带一个联系邮箱（用于滥用时联系调用方），用项目维护者的 GitHub noreply 地址
export const UNPAYWALL_EMAIL = 'Tendo33@users.noreply.github.com';
export const UNPAYWALL_TIMEOUT_MS = 8000;

export function unpaywallUrl(doi) {
  return `${UNPAYWALL_API}/${encodeURIComponent(normalizeDoi(doi)).replace(/%2F/g, '/')}?email=${encodeURIComponent(UNPAYWALL_EMAIL)}`;
}

function httpsUrl(u) {
  try {
    const x = new URL(String(u || ''));
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href.replace(/^http:/, 'https:') : '';
  } catch (_) {
    return '';
  }
}

// Unpaywall 的 PMC 地址常常不带 PMC 前缀（/pmc/articles/7095418）
const PMC_URL = /(?:ncbi\.nlm\.nih\.gov\/pmc\/articles|pmc\.ncbi\.nlm\.nih\.gov\/articles|europepmc\.org\/(?:articles|article\/PMC))\/((?:PMC)?\d+)(?:[/?#]|$)/i;
const ARXIV_URL = /arxiv\.org\/(?:abs|pdf)\/([^?#]+?)(?:v\d+)?(?:\.pdf)?(?:[?#]|$)/i;
const PREPRINT_HOST = /(^|\.)(biorxiv|medrxiv)\.org$/i;
// bioRxiv / medRxiv 的 DOI 前缀；Unpaywall 常给 doi.org/10.1101/… 这样的地址
const PREPRINT_DOI = /doi\.org\/10\.1101\//i;

/**
 * 每个位置归成一类：pmc（可取 Europe PMC JATS）/ arxiv / preprint（bioRxiv、medRxiv）/ pdf / html
 * @returns {{kind:string, url:string, pdfUrl:string, pmcid?:string, arxivId?:string, version:string, hostType:string, license:string, repository:string}}
 */
export function classifyLocation(loc) {
  const url = httpsUrl(loc.url_for_landing_page || loc.url);
  const pdfUrl = httpsUrl(loc.url_for_pdf);
  const base = {
    url: url || pdfUrl,
    pdfUrl,
    version: String(loc.version || ''),
    hostType: String(loc.host_type || ''),
    license: String(loc.license || ''),
    repository: String(loc.repository_institution || ''),
  };
  const urls = [loc.url, loc.url_for_landing_page, loc.url_for_pdf].filter(Boolean).map(String);
  const first = (re) => urls.map((u) => u.match(re)).find(Boolean);
  const pmc = first(PMC_URL);
  if (pmc) return { ...base, kind: 'pmc', pmcid: normalizePmcid(pmc[1]) };
  const arxiv = first(ARXIV_URL);
  if (arxiv) return { ...base, kind: 'arxiv', arxivId: arxiv[1], url: `https://arxiv.org/abs/${arxiv[1]}` };
  let host = '';
  try { host = new URL(base.url).hostname; } catch (_) { /* 忽略 */ }
  if (PREPRINT_HOST.test(host) || urls.some((u) => PREPRINT_DOI.test(u))) return { ...base, kind: 'preprint' };
  return { ...base, kind: pdfUrl ? 'pdf' : 'html' };
}

/** 去重、排序：能直接取结构化全文的在前（PMC → 预印本 → arXiv），然后是正式版、接收稿、投稿稿 */
const KIND_RANK = { pmc: 0, preprint: 1, arxiv: 2, pdf: 3, html: 4 };
const VERSION_RANK = { publishedVersion: 0, acceptedVersion: 1, submittedVersion: 2 };

export function parseUnpaywall(json) {
  const locs = (json && Array.isArray(json.oa_locations) ? json.oa_locations : []).map(classifyLocation).filter((l) => l.url);
  const seen = new Set();
  const out = [];
  for (const l of locs.sort((a, b) => (KIND_RANK[a.kind] - KIND_RANK[b.kind]) || ((VERSION_RANK[a.version] ?? 3) - (VERSION_RANK[b.version] ?? 3)))) {
    const key = l.pmcid || l.arxivId || l.pdfUrl || l.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

/**
 * @returns {Promise<{ok:true, locations:object[]} | {ok:false, reason:'invalid_id'|'not_found'|'timeout'|'network'|'http', status?:number}>}
 */
export async function lookupUnpaywall(doi, { fetchImpl = globalThis.fetch, timeoutMs = UNPAYWALL_TIMEOUT_MS, timers = globalThis } = {}) {
  const id = normalizeDoi(doi);
  if (!id) return { ok: false, reason: 'invalid_id' };
  const controller = new AbortController();
  let timedOut = false;
  const timer = timers.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const res = await fetchImpl(unpaywallUrl(id), { signal: controller.signal, headers: { Accept: 'application/json' }, credentials: 'omit' });
    if (res.status === 404) return { ok: false, reason: 'not_found', status: 404 };
    if (!res.ok) return { ok: false, reason: 'http', status: res.status };
    const json = await res.json();
    if (json && json.doi && normalizeDoi(json.doi).toLowerCase() !== id.toLowerCase()) return { ok: false, reason: 'not_found' };
    return { ok: true, locations: parseUnpaywall(json) };
  } catch (_) {
    return { ok: false, reason: timedOut ? 'timeout' : 'network' };
  } finally {
    timers.clearTimeout(timer);
  }
}
