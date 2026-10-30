// L2 DOM 适配器的公共流程：元数据（citation_* meta + 选择器）→ 摘要 → 参考文献 → 正文 → 文末信息 → 附件。
// 每个站点只提供选择器配置（PRD §2.2「选择器配置 + 少量代码」）。
import { createArticle, inlinesToPlain, trimInlines } from '../article-ir';
import { HtmlConverter, refIdsFromElement, citationMeta } from '../parsers/html-blocks';
import { classifyBackSection } from '../parsers/back-matter';
import { normalizeDoi, normalizePmcid, normalizePmid, extractYear } from '../ids';
import { normalizeLicense } from '../license';
import { textOf, resolveUrl } from '../parsers/dom-utils';

const REF_LINK_NOISE = /^(DOI|PubMed|PMC free article|Google Scholar|CrossRef|Crossref|Article|CAS|PubMed Central|Europe PMC|Free full text|Abstract|Full Text)$/i;
const DROP_SECTION = /^(references?|literature cited|bibliography|associated data|supplementary (information|materials?|data)|additional files?|electronic supplementary material|citations?( (&|and) impact)?|cited by|similar articles|related articles|articles citing this|author information|authors? and affiliations|ethics declarations|additional information|rights and permissions|about this article|cite this article|share this article|comments|statements|authors[’'] original submitted files for images|peer review( information)?|publisher[’']s note|reprints and permissions|metrics|article and author information|download links|copyright)$/i;
const NOTES_SECTION = /^(footnotes?|notes|article notes)$/i;

const PLACEHOLDER_NAME = /^\s*(undefined|null|nan|\[object object\])\s*$/i;

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

/** 名字可能是 citation_*，也可能只有 Dublin Core（eLife 只有 dc.*；有的站点写 DC.title） */
function metaValues(doc, ...names) {
  for (const n of names) {
    const v = citationMeta(doc, n);
    if (v.length) return v;
    const upper = n.replace(/^dc\./, 'DC.');
    if (upper !== n) {
      const u = citationMeta(doc, upper);
      if (u.length) return u;
    }
  }
  return [];
}

/** dc.creator 是「Love, Michael I」：改成「Michael I Love」，与 citation_author 的常见写法一致时不动 */
function personName(name) {
  const m = String(name).match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2]} ${m[1]}`.trim() : String(name).trim();
}

/**
 * 文章根元素：配置里的候选按顺序试，有正文白名单（cfg.body）时只要「里面真有正文容器」的那个。
 * MDPI 页面渲染完后有好几个 <article>（相关文章卡片在前），取第一个就会什么都拿不到（QA JM-M2-02）
 */
function pickRoot(doc, cfg) {
  for (const s of [].concat(cfg.root || [])) {
    let els = [];
    try { els = Array.from(doc.querySelectorAll(s)); } catch (_) { els = []; }
    const hit = cfg.body ? els.find((el) => first(el, cfg.body)) : els[0];
    if (hit) return hit;
  }
  return doc.body;
}

/** 没有专门类名的摘要：标题正好是「Abstract」的 h2/h3，取它的父元素（Frontiers） */
function abstractByHeading(root) {
  const h = all(root, 'h2, h3').find((x) => /^\s*abstract\s*$/i.test(x.textContent || ''));
  return h && h.parentElement && h.parentElement !== root && h.parentElement.firstElementChild === h ? h.parentElement : null;
}

function refText(conv, li, cfg) {
  const cite = first(li, cfg.refText);
  const clone = (cite || li).cloneNode(true);
  if (cfg.hooks && cfg.hooks.refPrepare) cfg.hooks.refPrepare(clone);
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
    // Springer / Nature 的链接文字带「(download PDF )」
    label = label.replace(/\s*\(download [^)]*\)\s*$/i, '').trim();
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
  const root = pickRoot(doc, cfg);

  // ---- 元数据 ----
  const h1 = first(root, cfg.title) || first(doc, cfg.title);
  meta.title = (metaValues(doc, 'citation_title', 'dc.title')[0] || textOf(h1)).replace(/\s+/g, ' ').trim();
  const authors = metaValues(doc, 'citation_author', 'dc.creator', 'dc.contributor').map(personName);
  const authorEls = authors.length ? [] : all(root, cfg.authors);
  // 前端页面没渲染完时姓名位置可能是字面的「undefined」（Europe PMC 的团体作者，QA JM-M2-06）
  meta.authors = (authors.length ? authors : authorEls.map(textOf)).filter((n) => n && !PLACEHOLDER_NAME.test(n))
    .filter((n, i, arr) => arr.indexOf(n) === i).map((name) => ({ name, affiliations: [] }));
  meta.journal = metaValues(doc, 'citation_journal_title')[0] || textOf(first(root, cfg.journal)) || (cfg.journalName || '');
  meta.year = extractYear(metaValues(doc, 'citation_publication_date', 'citation_date', 'citation_online_date', 'dc.date')[0] || textOf(first(root, cfg.date)));
  // DOI / PMCID 只从文章自己的元数据区取，不能扫整页：参考文献和「相关文章」里也有 DOI、PMCID（QA JM-01）
  const metaArea = first(doc, cfg.metaArea);
  const doiEl = metaArea ? first(metaArea, cfg.doi) : null;
  meta.doi = normalizeDoi(metaValues(doc, 'citation_doi', 'dc.identifier')[0] || (doiEl && (doiEl.getAttribute('href') || textOf(doiEl))) || '');
  // 页面上的 ID 优先，URL 里的只作兜底：两者不一致说明单页应用的 DOM 还是上一篇（审查 N-D）
  const pmidText = metaArea ? (textOf(metaArea).match(/PMID:?\s*(\d{1,9})/i) || [])[1] : '';
  meta.pmid = normalizePmid(citationMeta(doc, 'citation_pmid')[0] || pmidText || ids.pmid || '');
  const pmcText = metaArea ? (textOf(metaArea).match(/PMCID:?\s*(PMC\d+)/i) || [])[1] : '';
  meta.pmcid = normalizePmcid(citationMeta(doc, 'citation_pmcid')[0] || pmcText || ids.pmcid || '');
  // 许可证只从专门的位置取（审查 M-1）：站点自己的版权 / 许可框和 rel="license"（cfg.license，每个站点写死的容器）、
  // 许可 / 版权说明文字（cfg.licenseText）、citation_* / dc.rights 元数据。绝不在整页里找 CC 链接——
  // 参考文献、数据集引用、页脚里都可能有，会把订阅文章误判成开放获取，PDF 解析就不弹确认了
  const lic = first(doc, cfg.license);
  const dcRights = metaValues(doc, 'citation_license', 'dc.rights', 'dcterms.license')[0] || '';
  // 没有许可链接时看版权说明文字（PLOS：「…distributed under the terms of the Creative Commons Attribution License…」）
  const licText = all(doc, cfg.licenseText).map(textOf).find((tx) => /creative commons|\bCC[ -]BY\b|CC0/i.test(tx)) || '';
  meta.license = lic ? normalizeLicense(lic.getAttribute('href') || textOf(lic))
    : (/creativecommons\.org|creative commons/i.test(dcRights) ? normalizeLicense(dcRights) : (licText ? normalizeLicense(licText.replace(/^.*?(?=creative commons|\bCC[ -]BY|CC0)/i, '')) : ''));
  // PDF 地址（L3 PDF 解析用）：citation_pdf_url，没有时按站点配置找下载链接
  const pdfLink = first(root, cfg.pdfLink) || first(doc, cfg.pdfLink);
  meta.pdfUrl = resolveUrl(metaValues(doc, 'citation_pdf_url')[0] || (pdfLink && pdfLink.getAttribute('href')) || '', url);
  meta.keywords = citationMeta(doc, 'citation_keywords').flatMap(splitKeywords);
  const kwItems = all(root, cfg.keywordItems).map(textOf).filter(Boolean);
  if (kwItems.length) meta.keywords = [...new Set(kwItems)];

  // ---- 参考文献（先建 id 集合，正文里的 #CR1 链接才能变成脚注）----
  // 条目 id：li 自己的 id，或者条目里第一个带 id 的元素（Springer 的 p#ref-CR1）；cfg.refId 可按序号生成（MDPI）。
  // 条目里其他元素的 id 记作别名，正文链接指向它们时也能对上（PLOS 的 li#ref1 > a#pmed-…-b1）
  const refAlias = new Map();
  const refItems = all(root, cfg.refItems).map((li, i) => {
    const inner = Array.from(li.querySelectorAll('[id]')).map((e) => e.getAttribute('id'));
    const id = (cfg.refId && cfg.refId(li, i)) || li.getAttribute('id') || inner[0] || '';
    for (const a of inner) if (a !== id && !refAlias.has(a)) refAlias.set(a, id);
    return { li, id };
  }).filter((r) => r.id);
  const refIds = new Set(refItems.map((r) => r.id));
  const conv = new HtmlConverter(ir, { baseUrl: url, refIds, refAlias, selectors: cfg.selectors, hooks: cfg.hooks || {} });
  ir.refs = refItems.map(({ li, id }, i) => ({
    id,
    label: textOf(first(li, cfg.refLabel)).replace(/[.\s]+$/, '') || String(i + 1),
    text: refText(conv, li, cfg),
    ...refIdsFromElement(li),
    url: '',
  }));

  // ---- 摘要 ----
  let absEls = all(root, cfg.abstract).filter((el, _i, arr) => !arr.some((o) => o !== el && o.contains(el)));
  if (!absEls.length && cfg.abstractByHeading) absEls = [abstractByHeading(root)].filter(Boolean);
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
  // cfg.body 是白名单：只从这些容器取正文（没有就是没有正文）；否则整个 root 去掉已知的非正文部分
  let body;
  if (cfg.body) {
    body = doc.createElement('div');
    all(root, cfg.body).filter((el, _i, arr) => !arr.some((o) => o !== el && o.contains(el))).forEach((el) => body.appendChild(el.cloneNode(true)));
  } else {
    body = root.cloneNode(true);
  }
  removeAll(body, [cfg.abstract, cfg.refList, cfg.supp, cfg.keywords, ...(cfg.remove || [])]);
  if (cfg.abstractByHeading) { const a = abstractByHeading(body); if (a) a.remove(); }
  if (cfg.hooks && cfg.hooks.prepareBody) cfg.hooks.prepareBody(body);
  const sections = conv.sections(body);

  const plainTitle = (x) => inlinesToPlain(x.title || []).replace(/\s+/g, ' ').trim();
  // 子节里的致谢 / 利益冲突 / 数据可用性也移到文末（Springer「Additional information > Competing interests」、
  // Frontiers「Statements > Conflict of interest」）；参考文献、附件等子节直接去掉
  const prune = (sec) => {
    const children = [];
    for (const c of sec.children || []) {
      const t = plainTitle(c);
      const k = c.title ? classifyBackSection(t, '') : null;
      if (k) ir.back[k].push(...c.blocks, ...flatten(c.children));
      else if (DROP_SECTION.test(t)) continue;
      else if (NOTES_SECTION.test(t)) {
        if (c.blocks.length || c.children.length) ir.back.other.push({ title: c.title, blocks: [...c.blocks, ...flatten(c.children)], children: [] });
      } else {
        const p = prune(c);
        if (p.blocks.length || p.children.length || !p.title) children.push(p);
      }
    }
    return { ...sec, children };
  };
  for (const s of sections) {
    const title = plainTitle(s);
    const key = s.title ? classifyBackSection(title, '') : null;
    if (key) {
      ir.back[key].push(...s.blocks, ...flatten(s.children));
    } else if (NOTES_SECTION.test(title)) {
      if (s.blocks.length || s.children.length) ir.back.other.push({ title: s.title, blocks: [...s.blocks, ...flatten(s.children)], children: [] });
    } else {
      const pruned = prune(s);
      if (DROP_SECTION.test(title)) continue;
      if (pruned.blocks.length || pruned.children.length) ir.sections.push(pruned);
    }
  }
  ir.notices = [...new Set(ir.notices)];
  return ir;
}
