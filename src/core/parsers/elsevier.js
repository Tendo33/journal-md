// Elsevier 全文 API（api.elsevier.com/content/article）返回的 XML → ArticleIR。
// 不是 JATS：外层 full-text-retrieval-response（coredata、objects、originalText），正文是 Elsevier 自己的 ja / ce / sb 格式：
//   head：ce:title、ce:author-group、ce:abstract（class="author" / "author-highlights" / "graphical"）、ce:keywords
//   body：ce:sections > ce:section（ce:label、ce:section-title、ce:para、嵌套 ce:section）、ce:acknowledgment
//   ce:floats：ce:figure（ce:label、ce:caption、ce:link locator="gr1"）、ce:table（CALS 表：tgroup / row / entry）
//   tail：ce:bibliography > ce:bibliography-sec > ce:bib-reference（sb:reference 结构化，或 ce:other-ref 文字）
// 公式是 mml:math；ce:cross-ref / ce:cross-refs 指向参考文献、图表。
import { createArticle, inlinesToPlain, trimInlines } from '../article-ir';
import { ln, kids, child, find, findAll, attr, textOf } from './dom-utils';
import { mathmlToLatex } from '../math/mathml-to-latex';
import { classifyBackSection } from './back-matter';
import { normalizeDoi, extractYear } from '../ids';
import { normalizeLicense } from '../license';

export const ELSEVIER_ROUTE = 'xml-elsevier';

export function parseElsevierXmlText(xmlText, DOMParserImpl = globalThis.DOMParser) {
  const doc = new DOMParserImpl().parseFromString(String(xmlText || ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || !doc.documentElement) {
    const e = new Error('Invalid Elsevier XML');
    e.code = 'elsevier_parse';
    throw e;
  }
  return doc.documentElement;
}

const INLINE_SKIP = new Set(['float-anchor', 'anchor', 'footnote', 'inter-ref-title']);

class ElsevierParser {
  constructor(root, { url, pii }) {
    this.root = root;
    this.ir = createArticle({ sourceRoute: ELSEVIER_ROUTE });
    this.ir.meta.url = url || '';
    this.pii = String(pii || '').replace(/[^0-9A-Za-z]/g, '');
    this.refIds = new Set();
    this.floatIds = new Map(); // id → 'fig' | 'table'
    this.images = new Map(); // locator (gr1) → 地址
  }

  // ---------- inline ----------
  inlines(el) {
    const out = [];
    for (const n of Array.from((el && el.childNodes) || [])) out.push(...this.inline(n));
    return out;
  }

  inline(n) {
    if (n.nodeType === 3) return [{ t: 'text', v: n.nodeValue.replace(/\s+/g, ' ') }];
    if (n.nodeType !== 1) return [];
    const name = ln(n);
    if (INLINE_SKIP.has(name)) return [];
    switch (name) {
    case 'italic': return [{ t: 'em', c: this.inlines(n) }];
    case 'bold': return [{ t: 'strong', c: this.inlines(n) }];
    case 'sup': return [{ t: 'sup', c: this.inlines(n) }];
    case 'inf': return [{ t: 'sub', c: this.inlines(n) }];
    case 'underline': return [{ t: 'underline', c: this.inlines(n) }];
    case 'monospace': return [{ t: 'code', v: n.textContent }];
    case 'small-caps': return this.inlines(n);
    case 'br': return [{ t: 'br' }];
    case 'math': return [{ t: 'math', tex: mathmlToLatex(n) }];
    case 'inline-figure': return [];
    case 'inter-ref': {
      const href = attr(n, 'href');
      const c = this.inlines(n);
      return /^https?:/i.test(href) ? [{ t: 'link', href, c: c.length ? c : [{ t: 'text', v: href }] }] : c;
    }
    case 'cross-ref': case 'cross-refs': {
      const rids = attr(n, 'refid').split(/\s+/).filter(Boolean);
      const label = this.inlines(n);
      const refs = rids.filter((r) => this.refIds.has(r));
      // 指向参考文献：脚注；指向图表：只留文字
      if (refs.length) return refs.map((rid, i) => ({ t: 'cite', rid, c: i === 0 ? label : [] }));
      return label;
    }
    default: return this.inlines(n);
    }
  }

  paragraph(el) {
    const inl = trimInlines(this.inlines(el));
    return inl.length ? [{ type: 'paragraph', inlines: inl }] : [];
  }

  // ---------- blocks ----------
  /** ce:para 里可能夹着展示公式（ce:display）和列表：拆成几个块；段里的 ce:float-anchor 把图表放到段后 */
  blocksOfPara(el) {
    const blocks = [];
    let buf = [];
    const flushText = () => {
      const inl = trimInlines(buf);
      if (inl.length) blocks.push({ type: 'paragraph', inlines: inl });
      buf = [];
    };
    const anchors = [];
    for (const n of Array.from(el.childNodes)) {
      const name = n.nodeType === 1 ? ln(n) : '';
      if (name === 'display') { flushText(); blocks.push(...this.display(n)); } else if (name === 'list') { flushText(); blocks.push(this.list(n)); } else {
        if (name === 'float-anchor') anchors.push(attr(n, 'refid'));
        else if (n.nodeType === 1) anchors.push(...findAll(n, 'float-anchor').map((a) => attr(a, 'refid')));
        buf.push(...this.inline(n));
      }
    }
    flushText();
    for (const id of anchors) {
      const kind = this.floatIds.get(id);
      if (kind && !this.placed.has(id)) { this.placed.add(id); blocks.push({ type: kind === 'fig' ? 'figure' : 'table', id }); }
    }
    return blocks;
  }

  display(el) {
    const out = [];
    for (const c of kids(el)) {
      const name = ln(c);
      if (name === 'formula') {
        const m = find(c, 'math');
        if (m) out.push({ type: 'math', tex: mathmlToLatex(m) });
      } else if (name === 'math') out.push({ type: 'math', tex: mathmlToLatex(c) });
      else if (name === 'figure' || name === 'table') {
        const id = attr(c, 'id');
        if (id && this.floatIds.has(id) && !this.placed.has(id)) { this.placed.add(id); out.push({ type: name === 'figure' ? 'figure' : 'table', id }); }
      }
    }
    return out;
  }

  list(el) {
    const ordered = /^\(?\d/.test(textOf(find(el, 'label')));
    const items = kids(el, 'list-item').map((li) => {
      const blocks = [];
      for (const c of kids(li)) {
        const name = ln(c);
        if (name === 'label') continue;
        if (name === 'para' || name === 'simple-para') blocks.push(...this.blocksOfPara(c));
        else if (name === 'list') blocks.push(this.list(c));
      }
      return blocks;
    });
    return { type: 'list', ordered, items };
  }

  section(el) {
    const label = textOf(child(el, 'label'));
    const titleEl = child(el, 'section-title');
    const title = titleEl ? trimInlines([...(label ? [{ t: 'text', v: `${label} ` }] : []), ...this.inlines(titleEl)]) : null;
    const blocks = [];
    const children = [];
    for (const c of kids(el)) {
      const name = ln(c);
      if (name === 'para' || name === 'simple-para') blocks.push(...this.blocksOfPara(c));
      else if (name === 'display') blocks.push(...this.display(c));
      else if (name === 'list') blocks.push(this.list(c));
      else if (name === 'section') children.push(this.section(c));
    }
    return { title, blocks, children };
  }

  // ---------- floats ----------
  imageUrl(locator) {
    if (!locator) return '';
    if (this.images.has(locator)) return this.images.get(locator);
    // objects 里没有时按 ScienceDirect 的固定规则拼（公开的图片 CDN）
    return this.pii ? `https://ars.els-cdn.com/content/image/1-s2.0-${this.pii}-${locator}.jpg` : '';
  }

  caption(el) {
    const cap = child(el, 'caption');
    if (!cap) return [];
    const out = [];
    for (const c of kids(cap)) {
      if (ln(c) === 'simple-para' || ln(c) === 'para') out.push(...this.blocksOfPara(c));
    }
    return out;
  }

  figure(el) {
    const link = find(el, 'link');
    const caption = this.caption(el);
    return {
      id: attr(el, 'id'),
      label: textOf(child(el, 'label')).replace(/[.:]\s*$/, ''),
      caption,
      src: this.imageUrl(attr(link, 'locator')),
      alt: inlinesToPlain((caption[0] && caption[0].inlines) || []).slice(0, 200),
    };
  }

  table(el) {
    const rows = [];
    for (const part of findAll(el, 'thead', 'tbody')) {
      const header = ln(part) === 'thead';
      for (const row of kids(part, 'row')) {
        rows.push({ cells: kids(row, 'entry').map((e) => {
          const start = attr(e, 'namest');
          const end = attr(e, 'nameend');
          const colspan = start && end ? Math.max(1, Number(end.replace(/\D/g, '')) - Number(start.replace(/\D/g, '')) + 1) : 1;
          const more = Number(attr(e, 'morerows')) || 0;
          return { header, colspan, rowspan: more + 1, inlines: trimInlines(this.inlines(e)) };
        }) });
      }
    }
    const foot = [];
    for (const fn of kids(el, 'table-footnote', 'legend')) {
      for (const c of kids(fn)) if (['note-para', 'simple-para', 'para'].includes(ln(c))) foot.push(...this.paragraph(c));
    }
    const link = !rows.length ? find(el, 'link') : null;
    return {
      id: attr(el, 'id'),
      label: textOf(child(el, 'label')).replace(/[.:]\s*$/, ''),
      caption: this.caption(el),
      rows,
      foot,
      src: link ? this.imageUrl(attr(link, 'locator')) : '',
      href: '',
    };
  }

  // ---------- references ----------
  reference(el, i) {
    const id = attr(el, 'id') || `bib${i + 1}`;
    const label = textOf(child(el, 'label')).replace(/^\[|\][.]?$|\.$/g, '') || String(i + 1);
    const sb = find(el, 'reference');
    let text = [];
    let doi = textOf(find(el, 'doi'));
    if (sb) {
      const authors = findAll(sb, 'author').map((a) => [textOf(child(a, 'given-name')), textOf(child(a, 'surname'))].filter(Boolean).join(' ')).filter(Boolean);
      const etal = find(sb, 'et-al') ? ', et al.' : '';
      const contribution = child(sb, 'contribution');
      const title = contribution ? textOf(find(contribution, 'maintitle')) : '';
      const host = child(sb, 'host');
      const source = host ? textOf(find(find(host, 'series', 'edited-book', 'book') || host, 'maintitle')) : '';
      const vol = host ? textOf(find(host, 'volume-nr')) : '';
      const year = host ? textOf(find(host, 'date')) : '';
      const first = host ? textOf(find(host, 'first-page')) : '';
      const last = host ? textOf(find(host, 'last-page')) : '';
      const pages = first ? (last ? `${first}–${last}` : first) : textOf(find(host, 'article-number'));
      const parts = [];
      if (authors.length) parts.push({ t: 'text', v: `${authors.join(', ')}${etal}${year ? ` (${year})` : ''}. ` });
      if (title) parts.push({ t: 'text', v: `${title.replace(/[.]$/, '')}. ` });
      if (source) parts.push({ t: 'em', c: [{ t: 'text', v: source }] });
      const tailBits = [vol, pages].filter(Boolean).join(', ');
      if (tailBits) parts.push({ t: 'text', v: `${source ? ' ' : ''}${tailBits}` });
      text = trimInlines(parts);
      if (!doi) doi = textOf(find(sb, 'doi'));
    }
    if (!text.length) {
      const other = find(el, 'textref') || find(el, 'other-ref') || el;
      const clone = other.cloneNode(true);
      findAll(clone, 'label').forEach((x) => x.parentNode && x.parentNode.removeChild(x));
      text = trimInlines(this.inlines(clone));
    }
    return { id, label, text, doi: normalizeDoi(doi), pmid: '', url: '' };
  }

  // ---------- 主流程 ----------
  parse() {
    const meta = this.ir.meta;
    const core = find(this.root, 'coredata');
    // ln() 把名字转成小写：prism:publicationName → publicationname
    const coreText = (name) => textOf(core ? child(core, name.toLowerCase()) : null);
    meta.doi = normalizeDoi(coreText('doi'));
    meta.title = coreText('title');
    meta.journal = coreText('publicationName');
    meta.year = extractYear(coreText('coverDate') || coreText('coverDisplayDate'));
    meta.pmid = textOf(find(this.root, 'pubmed-id'));
    meta.authors = (core ? kids(core, 'creator') : []).map((c) => {
      const m = textOf(c).match(/^([^,]+),\s*(.+)$/);
      return { name: m ? `${m[2]} ${m[1]}` : textOf(c), affiliations: [] };
    });
    const oaLicense = textOf(find(core, 'openaccessuserlicense'));
    meta.license = normalizeLicense(oaLicense) || '';
    if (!this.pii) this.pii = coreText('pii').replace(/[^0-9A-Za-z]/g, '');

    for (const o of findAll(this.root, 'object')) {
      const ref = attr(o, 'ref');
      const type = attr(o, 'type');
      const url = textOf(o);
      if (!ref || !/^https:/.test(url)) continue;
      // 大图优先，其次标准图；缩略图不用
      if (type === 'IMAGE-HIGH-RES' || (type === 'IMAGE-DOWNSAMPLED' && !this.images.has(ref))) this.images.set(ref, url);
    }

    const article = find(this.root, 'article', 'converted-article', 'simple-article') || this.root;
    const head = child(article, 'head') || find(article, 'head');
    const body = child(article, 'body') || find(article, 'body');
    const tail = child(article, 'tail') || find(article, 'tail');

    // 文献 id 先收集，正文引用才能变成脚注
    const bibRefs = tail ? findAll(tail, 'bib-reference') : findAll(article, 'bib-reference');
    bibRefs.forEach((b, i) => this.refIds.add(attr(b, 'id') || `bib${i + 1}`));
    this.ir.refs = bibRefs.map((b, i) => this.reference(b, i));

    // 图表：ce:floats 里（也可能直接在正文里）
    this.placed = new Set();
    for (const f of findAll(article, 'figure')) if (attr(f, 'id')) this.floatIds.set(attr(f, 'id'), 'fig');
    for (const t of findAll(article, 'table')) if (attr(t, 'id')) this.floatIds.set(attr(t, 'id'), 'table');
    this.ir.figures = findAll(article, 'figure').filter((f) => attr(f, 'id') && !findAll(head || article, 'abstract').some((a) => a.contains(f))).map((f) => this.figure(f));
    this.ir.tables = findAll(article, 'table').filter((t) => attr(t, 'id')).map((t) => this.table(t));

    // 摘要：作者摘要和要点（Highlights）；图形摘要不要
    for (const abs of head ? kids(head, 'abstract') : []) {
      const cls = attr(abs, 'class');
      if (cls === 'graphical' || cls === 'teaser' || cls === 'editor-highlights') continue;
      const titleEl = child(abs, 'section-title');
      const title = titleEl ? trimInlines(this.inlines(titleEl)) : null;
      const blocks = [];
      for (const sec of kids(abs, 'abstract-sec')) {
        const st = child(sec, 'section-title');
        if (st) blocks.push({ type: 'paragraph', inlines: [{ t: 'strong', c: trimInlines(this.inlines(st)) }] });
        for (const c of kids(sec)) {
          if (ln(c) === 'simple-para' || ln(c) === 'para') blocks.push(...this.blocksOfPara(c));
          else if (ln(c) === 'list') blocks.push(this.list(c));
        }
      }
      // 「Abstract」「Summary」不单独成小节；「Highlights」等保留标题
      const plainTitle = inlinesToPlain(title || []).trim();
      if (blocks.length) this.ir.abstract.push({ title: /^(abstract|summary)$/i.test(plainTitle) ? null : title, blocks, children: [] });
    }
    if (!this.ir.abstract.length && core) {
      const desc = textOf(child(core, 'description')).replace(/^\s*(abstract|summary)\s*/i, '');
      if (desc) this.ir.abstract.push({ title: null, blocks: [{ type: 'paragraph', inlines: [{ t: 'text', v: desc }] }], children: [] });
    }
    const kw = head ? findAll(head, 'keyword').map(textOf).filter(Boolean) : [];
    meta.keywords = kw;

    // 正文
    const sectionsEl = body ? (child(body, 'sections') || body) : null;
    for (const s of sectionsEl ? kids(sectionsEl, 'section') : []) {
      const sec = this.section(s);
      const key = classifyBackSection(inlinesToPlain(sec.title || []), attr(s, 'role'));
      if (key) this.ir.back[key].push(...sec.blocks);
      else this.ir.sections.push(sec);
    }
    // 致谢等：body / tail 里的 ce:acknowledgment、带标题的 ce:section
    for (const ack of findAll(article, 'acknowledgment')) this.ir.back.acknowledgements.push(...this.section(ack).blocks);
    for (const s of tail ? kids(tail, 'section') : []) {
      const sec = this.section(s);
      const key = classifyBackSection(inlinesToPlain(sec.title || []), '');
      if (key) this.ir.back[key].push(...sec.blocks);
      else if (sec.blocks.length || sec.children.length) this.ir.back.other.push(sec);
    }
    // 没被段落锚点放置的图表：放到正文最后一节末尾
    const rest = [...this.floatIds].filter(([id]) => !this.placed.has(id) && (this.ir.figures.some((f) => f.id === id) || this.ir.tables.some((t) => t.id === id)));
    if (rest.length && this.ir.sections.length) {
      const last = this.ir.sections[this.ir.sections.length - 1];
      for (const [id, kind] of rest) last.blocks.push({ type: kind === 'fig' ? 'figure' : 'table', id });
    }
    this.ir.notices = [];
    return this.ir;
  }
}

/**
 * @param {string|Element} xml
 * @param {{ url?:string, pii?:string, DOMParser?:Function }} [options]
 */
export function parseElsevier(xml, options = {}) {
  const root = typeof xml === 'string' ? parseElsevierXmlText(xml, options.DOMParser) : xml;
  return new ElsevierParser(root, options).parse();
}
