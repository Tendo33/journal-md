// L2 DOM 适配器的公共流程：元数据（citation_* meta + 选择器）→ 摘要 → 参考文献 → 正文 → 文末信息 → 附件。
// 每个站点只提供选择器配置（PRD §2.2「选择器配置 + 少量代码」）。
import { createArticle, inlinesToPlain, trimInlines } from '../article-ir';
import { HtmlConverter, refIdsFromElement, citationMeta } from '../parsers/html-blocks';
import { classifyBackSection } from '../parsers/back-matter';
import { normalizeDoi, normalizePmcid, normalizePmid, extractYear } from '../ids';
import { normalizeLicense } from '../license';
import { textOf, resolveUrl } from '../parsers/dom-utils';

const REF_LINK_NOISE = /^(DOI|PubMed|PMC free article|Google Scholar|CrossRef|Crossref|Article|CAS|PubMed Central|Europe PMC|Free full text|Abstract|Full Text)$/i;
const DROP_SECTION = /^(references?|literature cited|bibliography|associated data|supplementary (information|materials?|data)|additional files?|electronic supplementary material)$/i;
const NOTES_SECTION = /^(footnotes?|notes|article notes)$/i;

function first(root, selectors) {
  for (const s of [].concat(selectors || [])) {
    try {
      const el = root.querySelector(s);
      if (el) return el;
    } catch (_) { /* 非法选择器忽略 */ }
  }
  return null;
}

function all(root, selector) {
  if (!selector) return [];
  try { return Array.from(root.querySelectorAll(selector)); } catch (_) { return []; }
}

function removeAll(root, selectors) {
  for (const s of [].concat(selectors || [])) all(root, s).forEach((el) => el.remove());
}

export function splitKeywords(text) {
  return String(text || '').replace(/^\s*key\s*words?\s*:?\s*/i, '').replace(/\.\s*$/, '')
    .split(/\s*[;,]\s*/).map((s) => s.trim()).filter(Boolean);
}

/** 摘要容器 → Section[]：外层「Abstract」标题去掉，小标题各成一节 */
export function abstractSections(conv, el) {
  const secs = conv.sections(el);
  const out = [];
  for (const s of secs) {
    const title = inlinesToPlain(s.title || []).trim();
    if (!s.title || /^abstract$/i.test(title)) {
      if (s.blocks.length) out.push({ title: null, blocks: s.blocks, children: [] });
      for (const c of s.children) out.push({ title: c.title, blocks: [...c.blocks, ...flatten(c.children)], children: [] });
    } else {
      out.push({ title: s.title, blocks: [...s.blocks, ...flatten(s.children)], children: [] });
    }
  }
  return out;
}

function flatten(sections) {
  const out = [];
  for (const s of sections || []) {
    if (s.title) out.push({ type: 'paragraph', inlines: [{ t: 'strong', c: s.title }] });
    out.push(...s.blocks, ...flatten(s.children));
  }
  return out;
}

function refText(conv, li, cfg) {
  const cite = first(li, cfg.refText);
  const clone = (cite || li).cloneNode(true);
  removeAll(clone, cfg.refLabel);
  all(clone, 'a').forEach((a) => { if (REF_LINK_NOISE.test(textOf(a))) a.remove(); });
  let inl = trimInlines(conv.inlines(clone));
  // 去掉链接被删后留下的空方括号和「doi: 10.xxx」尾巴（DOI 会在渲染时统一追加成链接）
  inl = inl.map((n) => (n.t === 'text' ? { ...n, v: n.v.replace(/\[\s*\]/g, '') } : n));
  const last = inl[inl.length - 1];
  if (last && last.t === 'text') last.v = last.v.replace(/\s*doi:?\s*10\.\d{4,9}\/\S+?\.?\s*$/i, '').replace(/\s+$/, '');
  return trimInlines(inl);
}

function suppItems(conv, root, cfg, baseUrl) {
  const out = [];
  all(root, cfg.supp).forEach((el, i) => {
    const link = el.querySelector('a[href]');
    const href = link ? resolveUrl(link.getAttribute('href'), baseUrl) : '';
    const captionEls = all(el, cfg.suppCaption).filter((c) => !c.contains(link));
    let text = captionEls.map(textOf).filter(Boolean).join(' ');
    let label = '';
    const m = text.match(/^((?:additional|supplementary|supporting|electronic supplementary)[^.:]{0,40}?\d+[A-Za-z]?|(?:table|figure|fig\.?|data|file|movie|video|appendix)\s*S\d+[A-Za-z]?)[.:]\s*/i);
    if (m) {
      label = m[1];
      text = text.slice(m[0].length);
    } else {
      label = link ? textOf(link) : `Supplementary file ${i + 1}`;
    }
    out.push({
      id: el.getAttribute('id') || `supp-${i + 1}`,
      label,
      caption: text ? [{ type: 'paragraph', inlines: [{ t: 'text', v: text }] }] : [],
      href,
    });
  });
  return out;
}

/**
 * @param {Document} doc
 * @param {string} url
 * @param {object} cfg 站点选择器配置
 * @param {{pmcid?:string, pmid?:string}} [ids] URL 里识别出的 ID
 */
export function extractDomArticle(doc, url, cfg, ids = {}) {
  const ir = createArticle({ sourceRoute: cfg.route });
  const meta = ir.meta;
  meta.url = url;
  const root = first(doc, cfg.root) || doc.body;

  // ---- 元数据 ----
  const h1 = first(root, cfg.title) || first(doc, cfg.title);
  meta.title = (citationMeta(doc, 'citation_title')[0] || textOf(h1)).replace(/\s+/g, ' ').trim();
  const authors = citationMeta(doc, 'citation_author');
  const authorEls = authors.length ? [] : all(root, cfg.authors);
  meta.authors = (authors.length ? authors : authorEls.map(textOf)).filter(Boolean)
    .filter((n, i, arr) => arr.indexOf(n) === i).map((name) => ({ name, affiliations: [] }));
  meta.journal = citationMeta(doc, 'citation_journal_title')[0] || textOf(first(root, cfg.journal));
  meta.year = extractYear(citationMeta(doc, 'citation_publication_date')[0] || citationMeta(doc, 'citation_date')[0] || textOf(first(root, cfg.date)));
  meta.doi = normalizeDoi(citationMeta(doc, 'citation_doi')[0] || (first(root, cfg.doi) && (first(root, cfg.doi).getAttribute('href') || textOf(first(root, cfg.doi)))));
  meta.pmid = normalizePmid(citationMeta(doc, 'citation_pmid')[0] || ids.pmid || '');
  const pmcText = (textOf(root).match(/PMCID:?\s*(PMC\d+)/i) || [])[1];
  meta.pmcid = normalizePmcid(ids.pmcid || citationMeta(doc, 'citation_pmcid')[0] || pmcText || '');
  const lic = first(root, cfg.license) || first(doc, cfg.license);
  meta.license = lic ? normalizeLicense(lic.getAttribute('href') || textOf(lic)) : '';
  meta.keywords = citationMeta(doc, 'citation_keywords').flatMap(splitKeywords);

  // ---- 参考文献（先建 id 集合，正文里的 #CR1 链接才能变成脚注）----
  const refItems = all(root, cfg.refItems).filter((li) => li.getAttribute('id'));
  const refIds = new Set(refItems.map((li) => li.getAttribute('id')));
  const conv = new HtmlConverter(ir, { baseUrl: url, refIds, selectors: cfg.selectors });
  ir.refs = refItems.map((li) => ({
    id: li.getAttribute('id'),
    label: textOf(li.querySelector(cfg.refLabel)),
    text: refText(conv, li, cfg),
    ...refIdsFromElement(li),
    url: '',
  }));

  // ---- 摘要 ----
  const absEls = all(root, cfg.abstract).filter((el, _i, arr) => !arr.some((o) => o !== el && o.contains(el)));
  // 页面上可见的关键词优先于 citation_keywords（后者常常不全）
  const kwdEl = first(root, cfg.keywords);
  if (kwdEl && splitKeywords(textOf(kwdEl)).length) meta.keywords = splitKeywords(textOf(kwdEl));
  for (const absEl of absEls) {
    const clone = absEl.cloneNode(true);
    removeAll(clone, cfg.keywords);
    ir.abstract.push(...abstractSections(conv, clone));
  }

  // ---- 附件 ----
  ir.supp = suppItems(conv, root, cfg, url);

  // ---- 正文 ----
  const body = root.cloneNode(true);
  removeAll(body, [cfg.abstract, cfg.refList, cfg.supp, cfg.keywords, ...(cfg.remove || [])]);
  const sections = conv.sections(body);

  for (const s of sections) {
    const title = inlinesToPlain(s.title || []).replace(/\s+/g, ' ').trim();
    const key = s.title ? classifyBackSection(title, '') : null;
    if (key) {
      ir.back[key].push(...s.blocks, ...flatten(s.children));
    } else if (DROP_SECTION.test(title)) {
      continue;
    } else if (NOTES_SECTION.test(title)) {
      if (s.blocks.length || s.children.length) ir.back.other.push({ title: s.title, blocks: [...s.blocks, ...flatten(s.children)], children: [] });
    } else {
      ir.sections.push(s);
    }
  }
  ir.notices = [...new Set(ir.notices)];
  return ir;
}
