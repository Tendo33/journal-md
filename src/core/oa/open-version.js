// 找合法的免费全文（页面上只有摘要时，后台调用）：
//   1. Unpaywall 和 bioRxiv 对应关系并行查
//   2. 有 PMC 版本 → Europe PMC JATS（作者稿也常在这里）
//   3. 有 bioRxiv / medRxiv 预印本 → 预印本 JATS
//   4. 都取不到结构化全文 → 只返回链接（arXiv 交给 arXiv to Markdown；PDF 可以交给 PDF 解析）
// 结果按 DOI 缓存 10 分钟；超时、网络错误不缓存。
import { normalizeDoi } from '../ids';
import { lookupUnpaywall } from './unpaywall';
import { findPreprint, fetchPreprintXml } from './biorxiv';

export const OPEN_ROUTES = Object.freeze({ PMC: 'jats-europepmc', PREPRINT: 'jats-preprint' });

/** 给弹窗的链接：只留展示和 PDF 解析需要的字段 */
function linkOf(l) {
  return { kind: l.kind, url: l.url, pdfUrl: l.pdfUrl || '', version: l.version || '', repository: l.repository || '', license: l.license || '' };
}

/**
 * @param {string} doi
 * @param {{ unpaywall:(doi)=>Promise, preprint:(doi)=>Promise, fetchJats:(pmcid)=>Promise, fetchPreprintXml:(url)=>Promise }} deps
 * @returns {Promise<{ok:true, xml:string, route:string, source:object, links:object[]} | {ok:false, reason:string, links:object[]}>}
 */
export async function findOpenVersion(doi, deps) {
  const id = normalizeDoi(doi);
  if (!id) return { ok: false, reason: 'invalid_id', links: [] };
  const [upw, pre] = await Promise.all([
    deps.unpaywall(id).catch(() => ({ ok: false, reason: 'network' })),
    deps.preprint(id).catch(() => ({ ok: false, reason: 'network' })),
  ]);
  const locations = upw.ok ? upw.locations : [];
  const links = [];
  if (pre.ok) links.push({ kind: 'preprint', url: pre.url, pdfUrl: '', version: 'submittedVersion', repository: pre.server === 'medrxiv' ? 'medRxiv' : 'bioRxiv', license: '' });
  for (const l of locations) {
    if (l.kind === 'pmc') continue;
    if (l.kind === 'preprint' && pre.ok) continue;
    links.push(linkOf(l));
  }

  for (const l of locations.filter((x) => x.kind === 'pmc')) {
    const res = await deps.fetchJats(l.pmcid).catch(() => ({ ok: false }));
    if (res && res.ok) return { ok: true, xml: res.xml, route: OPEN_ROUTES.PMC, source: { kind: 'pmc', pmcid: l.pmcid, url: l.url, version: l.version }, links };
  }
  if (pre.ok && pre.xmlUrl) {
    const res = await deps.fetchPreprintXml(pre.xmlUrl).catch(() => ({ ok: false }));
    if (res && res.ok) {
      return { ok: true, xml: res.xml, route: OPEN_ROUTES.PREPRINT, source: { kind: 'preprint', server: pre.server, doi: pre.doi, url: pre.url, version: pre.version, date: pre.date }, links: links.filter((x) => x.kind !== 'preprint') };
    }
  }
  const transient = [upw, pre].some((r) => !r.ok && ['timeout', 'network'].includes(r.reason));
  return { ok: false, reason: links.length ? 'links_only' : transient ? 'network' : 'not_found', links };
}

/** 后台用的服务：注入真实 fetch 和已有的 JATS 服务；按 DOI 缓存确定结果 */
export function createOpenVersionService({ fetchImpl, fetchJats, maxEntries = 16, ttlMs = 10 * 60 * 1000, now = () => Date.now() } = {}) {
  const cache = new Map();
  const inflight = new Map();
  const deps = {
    unpaywall: (doi) => lookupUnpaywall(doi, { fetchImpl }),
    preprint: (doi) => findPreprint(doi, { fetchImpl }),
    fetchJats,
    fetchPreprintXml: (url) => fetchPreprintXml(url, { fetchImpl }),
  };
  async function get(doi) {
    const id = normalizeDoi(doi).toLowerCase();
    if (!id) return { ok: false, reason: 'invalid_id', links: [] };
    const hit = cache.get(id);
    if (hit && now() - hit.at < ttlMs) return hit.result;
    if (inflight.has(id)) return inflight.get(id);
    const p = findOpenVersion(id, deps)
      .then((result) => {
        if (result.ok || result.reason !== 'network') {
          cache.set(id, { at: now(), result });
          while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
        }
        return result;
      })
      .finally(() => inflight.delete(id));
    inflight.set(id, p);
    return p;
  }
  return { get, _cache: cache };
}
