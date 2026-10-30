// 导出流程（PRD §2.2 三级取数，M1 只有 L1 JATS 和 L2 DOM）：
//   PMC / Europe PMC 页：有 PMCID 且开启「优先结构化来源」→ Europe PMC fullTextXML；失败或超时 → 当前页 DOM
//   PubMed 页：DOM 取题录和摘要；有 PMCID → Europe PMC 全文；否则「仅摘要」
// 纯函数 + 注入依赖（fetchJats），content script 和测试共用。
import { hasBody, hasContent } from '../article-ir';
import { parseJats } from '../parsers/jats';
import { extractPmc } from '../adapters/pmc';
import { extractEuropePmc } from '../adapters/europepmc';
import { extractPubmed } from '../adapters/pubmed';
import { detectSite } from '../sites/registry';
import { renderMarkdown } from '../render/markdown';
import { buildFilename } from '../filename';
import { normalizeSettings } from '../../config/settings';
import { ERR, NOTICE } from '../errors';

const DOM_ADAPTERS = {
  pmc: extractPmc,
  europepmc: extractEuropePmc,
  pubmed: extractPubmed,
};

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

/** 页面状态检查（不联网）：popup 显示平台、ID、可用通道 */
export function inspectPage(doc, url, rawSettings) {
  const settings = normalizeSettings(rawSettings);
  const det = detectSite(url);
  const base = {
    siteId: det.site ? det.site.id : null,
    siteName: det.site ? det.site.name : null,
    supported: det.supported,
    isArticle: det.isArticle,
  };
  if (!det.site) return { ...base, ok: false, error: ERR.UNSUPPORTED_PAGE };
  if (!det.supported) return { ...base, ok: false, error: ERR.SITE_PLANNED };
  if (settings.sites[det.site.id] === false) return { ...base, ok: false, error: ERR.SITE_DISABLED };
  if (!det.isArticle) return { ...base, ok: false, error: ERR.NOT_ARTICLE };
  const ir = DOM_ADAPTERS[det.site.id](doc, url, det.ids);
  const m = ir.meta;
  const domFull = det.site.id !== 'pubmed' && hasBody(ir);
  return {
    ...base,
    ok: !!m.title,
    error: m.title ? undefined : ERR.NO_CONTENT,
    title: m.title,
    ids: { doi: m.doi, pmid: m.pmid, pmcid: m.pmcid },
    routes: {
      // jats：有 PMCID 才可能；是否真的可用（OA）要由后台探测
      jats: !!m.pmcid && (det.site.id === 'pubmed' || settings.preferJats),
      dom: domFull,
      abstract: (ir.abstract || []).length > 0,
    },
  };
}

function finish(ir, settings, notices, now) {
  const markdown = renderMarkdown(ir, { includeImages: settings.includeImages, now });
  if (ir.notices.includes(NOTICE.EQUATION_IMAGE)) notices.push({ code: NOTICE.EQUATION_IMAGE });
  if (ir.meta.abstractOnly) notices.push({ code: NOTICE.ABSTRACT_ONLY, fullTextUrl: ir.meta.fullTextUrl });
  return {
    ok: true,
    markdown,
    filename: buildFilename(ir.meta, settings.filenameTemplate),
    route: ir.sourceRoute,
    abstractOnly: !!ir.meta.abstractOnly,
    notices,
    meta: { title: ir.meta.title, doi: ir.meta.doi, pmid: ir.meta.pmid, pmcid: ir.meta.pmcid },
  };
}

const same = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/**
 * 取回的 JATS 必须是当前这篇文章（QA JM-01）：
 * 页面上的 PMID 或 DOI 与 JATS 一致即通过；两边都有却不一致即拒绝；
 * 没有可比的独立 ID 时，只信任 URL 里直接给出的 PMCID（PMC 页、Europe PMC /article/PMC/ 页）。
 */
export function jatsMatchesPage(jatsMeta, pageMeta, urlIds = {}) {
  if (same(jatsMeta.pmid, pageMeta.pmid) || same(jatsMeta.doi, pageMeta.doi)) return true;
  const comparable = (jatsMeta.pmid && pageMeta.pmid) || (jatsMeta.doi && pageMeta.doi);
  if (comparable) return false;
  return same(urlIds.pmcid, jatsMeta.pmcid);
}

async function tryJats(pmcid, url, fetchJats, notices, verify) {
  let res;
  try {
    res = await fetchJats(pmcid);
  } catch (_) {
    res = { ok: false, reason: 'network' };
  }
  if (!res || !res.ok) {
    notices.push({ code: NOTICE.JATS_FALLBACK, reason: (res && res.reason) || 'network' });
    return null;
  }
  try {
    const ir = parseJats(res.xml, { pmcid, url });
    if (!hasContent(ir)) throw new Error('empty');
    if (verify && !verify(ir.meta)) {
      notices.push({ code: NOTICE.JATS_FALLBACK, reason: 'mismatch' });
      return null;
    }
    return ir;
  } catch (_) {
    notices.push({ code: NOTICE.JATS_FALLBACK, reason: 'parse' });
    return null;
  }
}

/**
 * @param {{ doc:Document, url:string, settings?:object, fetchJats:(pmcid:string)=>Promise<object>, now?:Date }} args
 */
export async function exportArticle({ doc, url, settings: rawSettings, fetchJats, now }) {
  const settings = normalizeSettings(rawSettings);
  const det = detectSite(url);
  if (!det.site) return fail(ERR.UNSUPPORTED_PAGE);
  if (!det.supported) return fail(ERR.SITE_PLANNED, { siteName: det.site.name });
  if (settings.sites[det.site.id] === false) return fail(ERR.SITE_DISABLED, { siteName: det.site.name });
  if (!det.isArticle) return fail(ERR.NOT_ARTICLE);

  const notices = [];
  const dom = DOM_ADAPTERS[det.site.id](doc, url, det.ids);
  const pmcid = dom.meta.pmcid || det.ids.pmcid || '';
  const verify = (jatsMeta) => jatsMatchesPage(jatsMeta, dom.meta, det.ids);

  if (det.site.id === 'pubmed') {
    if (pmcid) {
      const ir = await tryJats(pmcid, url, fetchJats, notices, verify);
      if (ir) {
        // 页面上的 MeSH、PMID 等补进全文版本；url 保持当前页
        ir.meta.url = url;
        ir.meta.mesh = dom.meta.mesh;
        if (!ir.meta.pmid) ir.meta.pmid = dom.meta.pmid;
        if (!ir.meta.keywords.length) ir.meta.keywords = dom.meta.keywords;
        notices.push({ code: NOTICE.PUBMED_FULLTEXT });
        return finish(ir, settings, notices, now);
      }
    }
    if (!dom.meta.title) return fail(ERR.NO_CONTENT);
    return finish(dom, settings, notices, now);
  }

  if (pmcid && settings.preferJats) {
    const ir = await tryJats(pmcid, url, fetchJats, notices, verify);
    if (ir) {
      ir.meta.url = url;
      if (!ir.meta.pmid) ir.meta.pmid = dom.meta.pmid;
      return finish(ir, settings, notices, now);
    }
  }
  if (!dom.meta.title) return fail(ERR.NO_CONTENT);
  if (!hasBody(dom)) {
    if (!(dom.abstract || []).length) return fail(ERR.NO_CONTENT);
    dom.meta.abstractOnly = true;
    dom.meta.fullTextUrl = dom.meta.doi ? `https://doi.org/${dom.meta.doi}` : '';
  }
  return finish(dom, settings, notices, now);
}
