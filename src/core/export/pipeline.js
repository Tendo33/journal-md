// 导出流程（PRD §2.2 三级取数；L3 PDF 解析是单独的入口，见 src/background/pdf-task.js）：
//   PMC / Europe PMC 页：有 PMCID 且开启「优先结构化来源」→ Europe PMC fullTextXML；失败或超时 → 当前页 DOM
//   PubMed 页：DOM 取题录和摘要；有 PMCID → Europe PMC 全文；否则「仅摘要」
//   出版商页（Springer/BMC、Nature、Frontiers、MDPI、PLOS、eLife），开启「优先结构化来源」时：
//     同站 XML（目前只有 Frontiers 的 citation_xml_url）→ 按 DOI 查 Europe PMC，开放获取就取 fullTextXML → 当前页 DOM
// 纯函数 + 注入依赖（fetchJats、services），content script 和测试共用。
import { hasBody, hasContent } from '../article-ir';
import { parseJats } from '../parsers/jats';
import { extractPmc } from '../adapters/pmc';
import { extractEuropePmc } from '../adapters/europepmc';
import { extractPubmed } from '../adapters/pubmed';
import { PUBLISHER_ADAPTERS } from '../adapters/publishers';
import { detectSite } from '../sites/registry';
import { renderMarkdown } from '../render/markdown';
import { buildFilename } from '../filename';
import { normalizeSettings } from '../../config/settings';
import { ERR, NOTICE } from '../errors';
import { normalizePmcid } from '../ids';
import { planAssets, assetAlternates } from './zip-plan';
import { isOpenAccessPdf } from '../../pdf/oa';
import { originsNeededFor } from '../zip-image-hosts';

const DOM_ADAPTERS = {
  pmc: extractPmc,
  europepmc: extractEuropePmc,
  pubmed: extractPubmed,
  ...PUBLISHER_ADAPTERS,
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
    // L3 PDF 解析用：PDF 地址、是否开放获取（决定要不要弹确认），任务文件名和 front matter 用的题录
    pdf: m.pdfUrl ? { url: m.pdfUrl, openAccess: isOpenAccessPdf({ pageUrl: url, pdfUrl: m.pdfUrl, license: m.license }), license: m.license } : null,
    // ZIP 打包页面图片要用到的可选主机权限（PLOS 存储桶 / media.springernature.com）。弹窗点「下载 ZIP」时在点击里申请
    zipOrigins: settings.includeImages ? originsNeededFor([...planAssets(ir).keys()]) : [],
    meta: { title: m.title, year: m.year, doi: m.doi, pmid: m.pmid, pmcid: m.pmcid, journal: m.journal, authors: (m.authors || []).slice(0, 50).map((a) => ({ name: a.name })) },
    routes: {
      // jats：有 PMCID 才可能；是否真的可用（OA）要由后台探测
      jats: det.site.publisher
        ? settings.preferJats && !!(m.doi || (det.site.siteXml && siteXmlUrl(doc, url)))
        : !!m.pmcid && (det.site.id === 'pubmed' || settings.preferJats),
      dom: domFull,
      abstract: (ir.abstract || []).length > 0,
    },
  };
}

const FLOAT_KEY = /^\s*(extended data\s+|supplementary\s+)?(fig(?:ure)?|table|box)\.?\s*(S?\d+[A-Za-z]?)\b/i;

/** 「Fig. 1」「Figure 1」「Extended Data Table 2」→ fig:1 / table:2 / extended:table:2，用来对齐 JATS 和页面上的同一张图 */
export function floatKey(label) {
  const m = String(label || '').match(FLOAT_KEY);
  if (!m) return '';
  const kind = /^fig/i.test(m[2]) ? 'fig' : m[2].toLowerCase();
  return `${m[1] ? 'extended:' : ''}${kind}:${m[3].toUpperCase()}`;
}

/**
 * 出版商页面走 Europe PMC JATS 时，图片地址默认是 PMC 的 instance/bin：从别的网站请求时 PMC 返回的 301 没有 CORS 头，
 * 扩展后台请求又会拿到 PMC 的防爬验证页，ZIP 一张都打不进（QA JM-M2-01）。所以按图号换成页面上出版商自己的图片地址
 * （如 eLife 的 iiif），PMC 地址留作备选。
 */
export function preferPageImages(ir, dom) {
  const byKey = new Map();
  for (const x of [...dom.figures, ...dom.tables]) {
    const k = floatKey(x.label);
    if (k && x.src && !byKey.has(k)) byKey.set(k, x.src);
  }
  for (const x of [...ir.figures, ...ir.tables]) {
    const pageSrc = byKey.get(floatKey(x.label));
    if (!x.src || !pageSrc || pageSrc === x.src) continue;
    x.altSrc = x.src;
    x.src = pageSrc;
  }
  return ir;
}

function finish(ir, settings, notices, now, format = 'md') {
  // ZIP：图片链接先写成包内路径（images/…），由调用方下载图片并打包
  const plan = format === 'zip' && settings.includeImages ? planAssets(ir) : null;
  const markdown = renderMarkdown(ir, { includeImages: settings.includeImages, now, rewriteAsset: plan ? (src) => plan.get(src) : null });
  if (ir.notices.includes(NOTICE.EQUATION_IMAGE)) notices.push({ code: NOTICE.EQUATION_IMAGE });
  if (ir.meta.abstractOnly) notices.push({ code: NOTICE.ABSTRACT_ONLY, fullTextUrl: ir.meta.fullTextUrl });
  return {
    ok: true,
    markdown,
    filename: buildFilename(ir.meta, settings.filenameTemplate),
    route: ir.sourceRoute,
    abstractOnly: !!ir.meta.abstractOnly,
    notices,
    meta: { title: ir.meta.title, doi: ir.meta.doi, pmid: ir.meta.pmid, pmcid: ir.meta.pmcid, license: ir.meta.license, pdfUrl: ir.meta.pdfUrl || '' },
    ...(plan ? { assets: [...plan].map(([url, path]) => ({ url, path, alts: assetAlternates(ir).get(url) || [] })) } : {}),
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

/**
 * URL 和页面都给出了 PMCID / PMID 却不相同。DOI 不比：出版商地址里的 DOI 是按路径推出来的（Nature 的 slug），
 * 推错了会把正常页面也拦下来
 */
export function staleDom(urlIds = {}, pageMeta = {}) {
  return ['pmcid', 'pmid'].some((k) => urlIds[k] && pageMeta[k] && !same(urlIds[k], pageMeta[k]));
}

/** 页面声明的同站 XML（citation_xml_url）；跨站的不用 */
export function siteXmlUrl(doc, url) {
  const meta = doc.querySelector('meta[name="citation_xml_url"]');
  const href = meta && meta.getAttribute('content');
  if (!href) return '';
  try {
    const x = new URL(href, url);
    const page = new URL(url);
    return x.protocol === 'https:' && x.host === page.host ? x.href : '';
  } catch (_) {
    return '';
  }
}

/**
 * 出版商 XML 里的图片是相对文件名（fpsyg-04-00863-g001.tif）：到当前页面上找同名的图片 / 文件链接，找不到就不给地址
 */
export function domAssetResolver(doc, url) {
  const urls = [];
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    for (const a of ['data-large', 'data-original', 'data-src', 'src']) {
      const v = img.getAttribute(a);
      if (v) { try { urls.push(new URL(v, url).href); } catch (_) { /* 忽略 */ } }
    }
  }
  const links = Array.from(doc.querySelectorAll('a[href]')).map((a) => { try { return new URL(a.getAttribute('href'), url).href; } catch (_) { return ''; } }).filter(Boolean);
  return (href, kind) => {
    const base = String(href || '').split(/[?#]/)[0].split('/').pop().replace(/\.[a-z0-9]{2,5}$/i, '').toLowerCase();
    if (!base || base.length < 4) return '';
    const pool = kind === 'image' ? urls : links;
    return pool.find((u) => u.toLowerCase().includes(base)) || '';
  };
}

/**
 * 站点标了 serverHtml 时，用本页服务器 HTML 解析出的文档（有正文才用）；否则、或请求失败时用当前 DOM
 */
async function serverDocument(det, doc, url, services) {
  if (!det.site.serverHtml || !services.fetchPageHtml || typeof DOMParser === 'undefined') return doc;
  const res = await callService(services.fetchPageHtml, url.split('#')[0]);
  if (!res.ok || !res.html) return doc;
  try {
    const parsed = new DOMParser().parseFromString(res.html, 'text/html');
    return hasBody(DOM_ADAPTERS[det.site.id](parsed, url, det.ids)) ? parsed : doc;
  } catch (_) {
    return doc;
  }
}

async function callService(fn, ...args) {
  try {
    return (await fn(...args)) || { ok: false, reason: 'network' };
  } catch (_) {
    return { ok: false, reason: 'network' };
  }
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
    if (!ir.meta.pmcid) ir.meta.pmcid = normalizePmcid(pmcid);
    return ir;
  } catch (_) {
    notices.push({ code: NOTICE.JATS_FALLBACK, reason: 'parse' });
    return null;
  }
}

/**
 * @param {{ doc:Document, url:string, settings?:object, fetchJats:(pmcid:string)=>Promise<object>, now?:Date }} args
 */
/** 出版商页面：同站 XML → Europe PMC（按 DOI）→ 返回 JATS 的 IR，失败返回 null（原因记进 notices） */
async function publisherJats({ det, dom, doc, url, fetchJats, services, notices }) {
  const sameDoi = (jatsMeta) => !dom.meta.doi || !jatsMeta.doi || same(jatsMeta.doi, dom.meta.doi);
  const xmlUrl = det.site.siteXml ? siteXmlUrl(doc, url) : '';
  if (xmlUrl && services.fetchSiteXml) {
    const res = await callService(services.fetchSiteXml, xmlUrl);
    if (res.ok) {
      try {
        const ir = parseJats(res.xml, { url, sourceRoute: det.site.xmlRoute, assetUrl: domAssetResolver(doc, url) });
        if (hasContent(ir) && sameDoi(ir.meta)) return ir;
        notices.push({ code: NOTICE.JATS_FALLBACK, reason: hasContent(ir) ? 'mismatch' : 'parse' });
      } catch (_) {
        notices.push({ code: NOTICE.JATS_FALLBACK, reason: 'parse' });
      }
    }
  }
  if (!dom.meta.doi || !services.lookupDoi) return null;
  const look = await callService(services.lookupDoi, dom.meta.doi);
  if (!look.ok) {
    notices.push({ code: NOTICE.JATS_FALLBACK, reason: look.reason || 'network' });
    return null;
  }
  // 查到的 PMCID 来自 DOI 检索：JATS 里的 DOI 必须和页面一致
  return tryJats(look.pmcid, url, fetchJats, notices, (jatsMeta) => !!jatsMeta.doi && same(jatsMeta.doi, dom.meta.doi));
}

/**
 * @param {{ doc:Document, url:string, settings?:object, fetchJats:(pmcid:string)=>Promise<object>, now?:Date,
 *   services?:{ lookupDoi?:(doi:string)=>Promise<object>, fetchSiteXml?:(url:string)=>Promise<object>, fetchPageHtml?:(url:string)=>Promise<object> },
 *   format?:'md'|'zip' }} args
 */
export async function exportArticle({ doc, url, settings: rawSettings, fetchJats, services = {}, now, format = 'md' }) {
  const settings = normalizeSettings(rawSettings);
  const det = detectSite(url);
  if (!det.site) return fail(ERR.UNSUPPORTED_PAGE);
  if (!det.supported) return fail(ERR.SITE_PLANNED, { siteName: det.site.name });
  if (settings.sites[det.site.id] === false) return fail(ERR.SITE_DISABLED, { siteName: det.site.name });
  if (!det.isArticle) return fail(ERR.NOT_ARTICLE);

  const notices = [];
  const pageDoc = await serverDocument(det, doc, url, services);
  const dom = DOM_ADAPTERS[det.site.id](pageDoc, url, det.ids);
  doc = pageDoc;
  // 单页应用换了文章、DOM 还没更新时，URL 里的 ID 和页面上的对不上：不导出旧文章（审查 N-D）
  if (staleDom(det.ids, dom.meta)) return fail(ERR.PAGE_CHANGED);
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
        return finish(ir, settings, notices, now, format);
      }
    }
    if (!dom.meta.title) return fail(ERR.NO_CONTENT);
    return finish(dom, settings, notices, now, format);
  }

  if (det.site.publisher && settings.preferJats) {
    const ir = await publisherJats({ det, dom, doc, url, fetchJats, services, notices });
    if (ir) {
      ir.meta.url = url;
      preferPageImages(ir, dom);
      if (!ir.meta.license) ir.meta.license = dom.meta.license;
      if (!ir.meta.keywords.length) ir.meta.keywords = dom.meta.keywords;
      return finish(ir, settings, notices, now, format);
    }
  } else if (pmcid && settings.preferJats) {
    const ir = await tryJats(pmcid, url, fetchJats, notices, verify);
    if (ir) {
      ir.meta.url = url;
      if (!ir.meta.pmid) ir.meta.pmid = dom.meta.pmid;
      return finish(ir, settings, notices, now, format);
    }
  }
  if (!dom.meta.title) return fail(ERR.NO_CONTENT);
  if (!hasBody(dom)) {
    if (!(dom.abstract || []).length) return fail(ERR.NO_CONTENT);
    dom.meta.abstractOnly = true;
    dom.meta.fullTextUrl = dom.meta.doi ? `https://doi.org/${dom.meta.doi}` : '';
  }
  return finish(dom, settings, notices, now, format);
}
