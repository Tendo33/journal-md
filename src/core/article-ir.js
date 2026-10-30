// ArticleIR：JATS 解析器和各站 DOM 适配器的统一输出，Markdown 渲染器只认这一种结构（PRD §2.2）。
//
// ArticleIR = {
//   meta: {
//     title, authors: [{ name, affiliations: [string] }], journal, year (number|null),
//     doi, pmid, pmcid, license, url, keywords: [string], mesh: [string],
//     abstractOnly: boolean, fullTextUrl,
//   },
//   abstract: [Section],            // 结构化摘要的每个小标题一节；非结构化就是一节无标题
//   sections: [Section],            // 正文
//   figures: [Figure], tables: [Table],
//   refs: [Ref], supp: [Supp],
//   back: { acknowledgements, dataAvailability, funding, competingInterests, other: [Section] },
//   notices: [string],              // 解析过程中的提示代码，例如 'equation_image'
//   sourceRoute,                    // jats-europepmc / dom-pmc / dom-europepmc / dom-pubmed
// }
//
// Section = { title: Inline[]|null, blocks: Block[], children: Section[], type?: string }
// Block:
//   { type: 'paragraph', inlines }
//   { type: 'list', ordered, items: Block[][] }
//   { type: 'math', tex }                          // 独立公式
//   { type: 'mathImage', src }                     // 独立公式只有图片
//   { type: 'figure', id } / { type: 'table', id } // 指向 figures / tables
//   { type: 'quote', blocks } / { type: 'code', text }
// Inline:
//   { t: 'text', v } | { t: 'em'|'strong'|'sup'|'sub'|'underline', c: Inline[] } | { t: 'code', v }
//   { t: 'link', href, c } | { t: 'math', tex } | { t: 'mathImage', src } | { t: 'cite', rid, c } | { t: 'br' }
// Figure = { id, label, caption: Block[], src, alt }
// Table  = { id, label, caption: Block[], rows: [{ cells: [Cell] }], foot: Block[], src }  // 只有图片的表：rows 为空、src 有值
// Cell   = { header: boolean, colspan, rowspan, inlines }
// Ref    = { id, label, text: Inline[], doi, pmid, url }
// Supp   = { id, label, caption: Block[], href }

export const SOURCE_ROUTES = Object.freeze({
  JATS_EUROPEPMC: 'jats-europepmc',
  DOM_PMC: 'dom-pmc',
  DOM_EUROPEPMC: 'dom-europepmc',
  DOM_PUBMED: 'dom-pubmed',
});

export function createMeta(overrides = {}) {
  return {
    title: '',
    authors: [],
    journal: '',
    year: null,
    doi: '',
    pmid: '',
    pmcid: '',
    license: '',
    url: '',
    keywords: [],
    mesh: [],
    abstractOnly: false,
    fullTextUrl: '',
    ...overrides,
  };
}

export function createArticle(overrides = {}) {
  const { meta, back, ...rest } = overrides;
  return {
    meta: createMeta(meta),
    abstract: [],
    sections: [],
    figures: [],
    tables: [],
    refs: [],
    supp: [],
    back: {
      acknowledgements: [],
      dataAvailability: [],
      funding: [],
      competingInterests: [],
      other: [],
      ...(back || {}),
    },
    notices: [],
    sourceRoute: '',
    ...rest,
  };
}

export const text = (v) => ({ t: 'text', v });
export const paragraph = (inlines) => ({ type: 'paragraph', inlines });
export const section = (title, blocks = [], children = []) => ({ title, blocks, children });

/** 纯文本（用于标题、文件名、alt 等） */
export function inlinesToPlain(inlines) {
  if (!inlines) return '';
  if (typeof inlines === 'string') return inlines;
  return inlines.map((n) => {
    switch (n.t) {
    case 'text': return n.v;
    case 'code': return n.v;
    case 'math': return n.tex;
    case 'br': return ' ';
    case 'mathImage': return '';
    default: return inlinesToPlain(n.c || []);
    }
  }).join('');
}

export function blocksToPlain(blocks) {
  return (blocks || []).map((b) => {
    if (b.type === 'paragraph') return inlinesToPlain(b.inlines);
    if (b.type === 'list') return b.items.map((it) => blocksToPlain(it)).join(' ');
    if (b.type === 'quote') return blocksToPlain(b.blocks);
    if (b.type === 'code') return b.text;
    if (b.type === 'math') return b.tex;
    return '';
  }).filter(Boolean).join(' ');
}

function sectionHasContent(s) {
  return !!(s && ((s.blocks && s.blocks.length) || (s.children || []).some(sectionHasContent)));
}

/** 是否有正文（不算摘要） */
export function hasBody(ir) {
  return (ir.sections || []).some(sectionHasContent);
}

/** 是否有可导出的内容（标题 + 摘要或正文） */
export function hasContent(ir) {
  return !!(ir.meta.title && (hasBody(ir) || (ir.abstract || []).some(sectionHasContent)));
}

/** 合并相邻文本节点、去掉空文本 */
export function normalizeInlines(inlines) {
  const out = [];
  for (const n of inlines) {
    if (!n) continue;
    if (n.t === 'text') {
      if (!n.v) continue;
      const prev = out[out.length - 1];
      if (prev && prev.t === 'text') prev.v += n.v;
      else out.push({ t: 'text', v: n.v });
    } else {
      if (n.c) n.c = normalizeInlines(n.c);
      out.push(n);
    }
  }
  return out;
}

/** 去掉首尾空白（不动内部），全空返回 [] */
export function trimInlines(inlines) {
  const out = normalizeInlines(inlines.map((n) => ({ ...n })));
  while (out.length && out[0].t === 'text' && !out[0].v.trim()) out.shift();
  while (out.length && out[out.length - 1].t === 'text' && !out[out.length - 1].v.trim()) out.pop();
  if (out.length && out[0].t === 'text') out[0] = { t: 'text', v: out[0].v.replace(/^\s+/, '') };
  const last = out.length - 1;
  if (last >= 0 && out[last].t === 'text') out[last] = { t: 'text', v: out[last].v.replace(/\s+$/, '') };
  return out;
}
