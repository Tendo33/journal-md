// JATS（Europe PMC fullTextXML）→ ArticleIR。转换规则参考 litdown 的 JATS 处理思路（PRD §2.4），代码为新写。
import { createArticle, SOURCE_ROUTES, normalizeInlines, trimInlines, inlinesToPlain } from '../article-ir';
import { mathmlToLatex } from '../math/mathml-to-latex';
import { stripTexDocument } from '../math/clean-latex';
import { normalizeDoi, normalizePmcid, normalizePmid, extractYear } from '../ids';
import { normalizeLicense } from '../license';
import { classifyBackSection } from './back-matter';
import { ln, kids, child, find, findAll, attr, textOf } from './dom-utils';

const CITATION_TAGS = ['element-citation', 'mixed-citation', 'citation', 'nlm-citation'];
const SKIP_ABSTRACT_TYPES = new Set(['graphical', 'teaser', 'author-highlights', 'precis', 'editor-summary', 'web-summary', 'toc']);

/** Europe PMC 上图片和附件的地址 */
export function europePmcAssetUrl(pmcid, href, kind = 'image') {
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;
  if (!pmcid) return '';
  const file = kind === 'image' && !/\.[a-z0-9]{2,4}$/i.test(href) ? `${href}.jpg` : href;
  return `https://europepmc.org/articles/${pmcid}/bin/${encodeURI(file)}`;
}

/** 解析 XML 文本；格式错误时抛出 code=jats_parse 的错误 */
export function parseJatsXml(xmlText, DOMParserImpl = globalThis.DOMParser) {
  const doc = new DOMParserImpl().parseFromString(String(xmlText || ''), 'application/xml');
  const article = doc.documentElement && ln(doc.documentElement) === 'article' ? doc.documentElement : find(doc, 'article');
  if (!article || doc.getElementsByTagName('parsererror').length) {
    const e = new Error('Invalid JATS XML');
    e.code = 'jats_parse';
    throw e;
  }
  return article;
}

class JatsParser {
  constructor(article, { pmcid, url } = {}) {
    this.article = article;
    this.ir = createArticle({ sourceRoute: SOURCE_ROUTES.JATS_EUROPEPMC });
    this.ir.meta.url = url || '';
    this.pmcidHint = pmcid || '';
    this.figIds = new Set();
    this.tableIds = new Set();
    this.suppIds = new Set();
    this.counter = 0;
  }

  uid(prefix) {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  // ---------- inline ----------
  inlines(el) {
    const out = [];
    for (const node of Array.from(el.childNodes || [])) out.push(...this.inlineNode(node));
    return normalizeInlines(out);
  }

  inlineNode(node) {
    if (node.nodeType === 3) return [{ t: 'text', v: node.nodeValue }];
    if (node.nodeType !== 1) return [];
    const tag = ln(node);
    switch (tag) {
    case 'italic': case 'i': case 'em':
      return [{ t: 'em', c: this.inlines(node) }];
    case 'bold': case 'b': case 'strong':
      return [{ t: 'strong', c: this.inlines(node) }];
    case 'sup':
      return [{ t: 'sup', c: this.inlines(node) }];
    case 'sub':
      return [{ t: 'sub', c: this.inlines(node) }];
    case 'underline':
      return [{ t: 'underline', c: this.inlines(node) }];
    case 'monospace': case 'code':
      return [{ t: 'code', v: node.textContent }];
    case 'break':
      return [{ t: 'br' }];
    case 'xref':
      return this.xref(node);
    case 'ext-link': case 'uri': {
      const href = attr(node, 'href') || textOf(node);
      const type = attr(node, 'ext-link-type');
      const url = type === 'doi' && !/^https?:/i.test(href) ? `https://doi.org/${normalizeDoi(href)}` : href;
      return [{ t: 'link', href: url, c: this.inlines(node) }];
    }
    case 'email':
      return [{ t: 'link', href: `mailto:${textOf(node)}`, c: [{ t: 'text', v: textOf(node) }] }];
    case 'inline-formula': case 'disp-formula':
      return [this.formula(node, false)].filter(Boolean);
    case 'math':
      return [{ t: 'math', tex: mathmlToLatex(node) }];
    case 'tex-math':
      return [{ t: 'math', tex: stripTexDocument(node.textContent) }];
    case 'inline-graphic':
      return [{ t: 'mathImage', src: this.asset(attr(node, 'href'), 'image') }];
    case 'fn': case 'label': case 'object-id': case 'alt-text': case 'target': case 'fig': case 'table-wrap':
    case 'supplementary-material':
      return [];
    default:
      return this.inlines(node);
    }
  }

  xref(node) {
    const type = attr(node, 'ref-type');
    const label = this.inlines(node);
    if (type !== 'bibr') return label;
    const rids = attr(node, 'rid').split(/\s+/).filter(Boolean);
    if (!rids.length) return label;
    return rids.map((rid, i) => ({ t: 'cite', rid, c: i === 0 ? label : [] }));
  }

  /** 公式：TeX 源码 > MathML > 图片（PRD §2.3） */
  formula(node, display) {
    const alts = child(node, 'alternatives') || node;
    const tex = child(alts, 'tex-math');
    const math = child(alts, 'math');
    const graphic = child(alts, 'graphic', 'inline-graphic');
    let latex = '';
    if (tex && tex.textContent.trim()) latex = stripTexDocument(tex.textContent);
    if (!latex && math) latex = mathmlToLatex(math);
    if (!latex && !graphic) {
      const nested = find(node, 'math');
      if (nested) latex = mathmlToLatex(nested);
    }
    if (latex) return display ? { type: 'math', tex: latex } : { t: 'math', tex: latex };
    if (graphic) {
      const src = this.asset(attr(graphic, 'href'), 'image');
      this.ir.notices.push('equation_image');
      return display ? { type: 'mathImage', src } : { t: 'mathImage', src };
    }
    return null;
  }

  asset(href, kind) {
    return europePmcAssetUrl(this.ir.meta.pmcid || this.pmcidHint, href, kind);
  }

  // ---------- blocks ----------
  /** <p> 里可能嵌着独立公式、图、表、列表：拆成多个块 */
  paragraphBlocks(p) {
    const blocks = [];
    let buf = [];
    const flush = () => {
      const inl = trimInlines(buf);
      if (inl.length) blocks.push({ type: 'paragraph', inlines: inl });
      buf = [];
    };
    for (const node of Array.from(p.childNodes || [])) {
      const tag = node.nodeType === 1 ? ln(node) : '';
      if (['disp-formula', 'fig', 'fig-group', 'table-wrap', 'table-wrap-group', 'list', 'disp-quote', 'preformat', 'boxed-text', 'def-list', 'supplementary-material'].includes(tag)) {
        flush();
        blocks.push(...this.blockNode(node));
      } else {
        buf.push(...this.inlineNode(node));
      }
    }
    flush();
    return blocks;
  }

  blocks(nodes) {
    const out = [];
    for (const n of nodes) out.push(...this.blockNode(n));
    return out;
  }

  blockNode(node) {
    if (node.nodeType === 3) {
      return node.nodeValue.trim() ? [{ type: 'paragraph', inlines: [{ t: 'text', v: node.nodeValue.trim() }] }] : [];
    }
    if (node.nodeType !== 1) return [];
    const tag = ln(node);
    switch (tag) {
    case 'p': case 'statement-p':
      return this.paragraphBlocks(node);
    case 'list':
      return [this.list(node)];
    case 'def-list':
      return [{
        type: 'list', ordered: false,
        items: kids(node, 'def-item').map((di) => {
          const term = child(di, 'term');
          const def = child(di, 'def');
          return [{ type: 'paragraph', inlines: trimInlines([{ t: 'strong', c: term ? this.inlines(term) : [] }, { t: 'text', v: ': ' }, ...(def ? this.inlines(def) : [])]) }];
        }),
      }];
    case 'disp-formula':
      return [this.formula(node, true)].filter(Boolean);
    case 'disp-formula-group':
      return this.blocks(kids(node, 'disp-formula'));
    case 'fig':
      return [{ type: 'figure', id: this.figure(node) }];
    case 'fig-group':
      return kids(node, 'fig').map((f) => ({ type: 'figure', id: this.figure(f) }));
    case 'table-wrap':
      return [{ type: 'table', id: this.table(node) }];
    case 'table-wrap-group':
      return kids(node, 'table-wrap').map((t) => ({ type: 'table', id: this.table(t) }));
    case 'disp-quote': case 'statement':
      return [{ type: 'quote', blocks: this.blocks(kids(node).filter((k) => ln(k) !== 'label')) }];
    case 'boxed-text': {
      const inner = [];
      const cap = child(node, 'caption');
      const title = cap && child(cap, 'title');
      if (title) inner.push({ type: 'paragraph', inlines: [{ t: 'strong', c: trimInlines(this.inlines(title)) }] });
      for (const k of kids(node)) {
        if (['caption', 'label'].includes(ln(k))) continue;
        if (ln(k) === 'sec') inner.push(...this.flattenSection(k));
        else inner.push(...this.blockNode(k));
      }
      return [{ type: 'quote', blocks: inner }];
    }
    case 'preformat': case 'code':
      return [{ type: 'code', text: node.textContent }];
    case 'supplementary-material':
      this.supp(node);
      return [];
    case 'graphic': {
      const src = this.asset(attr(node, 'href'), 'image');
      return src ? [{ type: 'paragraph', inlines: [{ t: 'mathImage', src }] }] : [];
    }
    case 'title': case 'label': case 'sec-meta': case 'object-id': case 'alt-text':
      return [];
    case 'sec':
      return this.flattenSection(node);
    default: {
      const inl = trimInlines(this.inlines(node));
      return inl.length ? [{ type: 'paragraph', inlines: inl }] : [];
    }
    }
  }

  /** 块级容器里出现 sec 时（如 boxed-text）把小节压平成加粗标题段 */
  flattenSection(sec) {
    const s = this.section(sec);
    const out = [];
    const walk = (x) => {
      if (x.title && x.title.length) out.push({ type: 'paragraph', inlines: [{ t: 'strong', c: x.title }] });
      out.push(...x.blocks);
      x.children.forEach(walk);
    };
    walk(s);
    return out;
  }

  list(node) {
    const type = attr(node, 'list-type');
    const ordered = /order|alpha|roman|arabic/.test(type);
    const items = kids(node, 'list-item').map((li) => {
      const blocks = this.blocks(kids(li).filter((k) => ln(k) !== 'label'));
      return blocks.length ? blocks : [{ type: 'paragraph', inlines: [] }];
    });
    return { type: 'list', ordered, items };
  }

  sectionTitle(sec) {
    const title = child(sec, 'title');
    const label = child(sec, 'label');
    const inl = [];
    if (label && textOf(label)) inl.push({ t: 'text', v: `${textOf(label).replace(/\.$/, '')} ` });
    if (title) inl.push(...this.inlines(title));
    const t = trimInlines(inl);
    return t.length ? t : null;
  }

  section(sec) {
    const blocks = [];
    const children = [];
    for (const k of kids(sec)) {
      const tag = ln(k);
      if (tag === 'sec') children.push(this.section(k));
      else blocks.push(...this.blockNode(k));
    }
    return { title: this.sectionTitle(sec), blocks, children, type: attr(sec, 'sec-type') };
  }

  // ---------- floats ----------
  caption(node) {
    const cap = child(node, 'caption');
    if (!cap) return [];
    const out = [];
    for (const k of kids(cap)) {
      if (ln(k) === 'title') {
        const inl = trimInlines(this.inlines(k));
        if (inl.length) out.push({ type: 'paragraph', inlines: [{ t: 'strong', c: inl }] });
      } else {
        out.push(...this.blockNode(k));
      }
    }
    // caption 里的标题和第一段合并成一段，读起来更像原文
    if (out.length > 1 && out[0].inlines && out[0].inlines.length === 1 && out[0].inlines[0].t === 'strong' && out[1].type === 'paragraph') {
      out.splice(0, 2, { type: 'paragraph', inlines: [...out[0].inlines, { t: 'text', v: ' ' }, ...out[1].inlines] });
    }
    return out;
  }

  figure(node) {
    const id = attr(node, 'id') || this.uid('fig');
    if (this.figIds.has(id)) return id;
    this.figIds.add(id);
    const graphic = find(node, 'graphic');
    this.ir.figures.push({
      id,
      label: textOf(child(node, 'label')),
      caption: this.caption(node),
      src: graphic ? this.asset(attr(graphic, 'href'), 'image') : '',
      alt: textOf(child(node, 'alt-text')),
    });
    return id;
  }

  table(node) {
    const id = attr(node, 'id') || this.uid('table');
    if (this.tableIds.has(id)) return id;
    this.tableIds.add(id);
    const tableEl = find(node, 'table');
    const rows = [];
    if (tableEl) {
      for (const tr of findAll(tableEl, 'tr')) {
        const inHead = ln(tr.parentNode) === 'thead';
        rows.push({
          cells: kids(tr, 'th', 'td').map((c) => ({
            header: inHead || ln(c) === 'th',
            colspan: parseInt(attr(c, 'colspan'), 10) || 1,
            rowspan: parseInt(attr(c, 'rowspan'), 10) || 1,
            inlines: trimInlines(this.cellInlines(c)),
          })),
        });
      }
    }
    const graphic = !tableEl ? find(node, 'graphic') : null;
    const foot = child(node, 'table-wrap-foot');
    this.ir.tables.push({
      id,
      label: textOf(child(node, 'label')),
      caption: this.caption(node),
      rows,
      foot: foot ? this.footBlocks(foot) : [],
      src: graphic ? this.asset(attr(graphic, 'href'), 'image') : '',
    });
    return id;
  }

  cellInlines(cell) {
    const out = [];
    for (const n of Array.from(cell.childNodes || [])) {
      if (n.nodeType === 1 && ln(n) === 'disp-formula') out.push(this.formula(n, false));
      else if (n.nodeType === 1 && ln(n) === 'p') {
        if (out.length) out.push({ t: 'br' });
        out.push(...this.inlines(n));
      } else out.push(...this.inlineNode(n));
    }
    return out.filter(Boolean);
  }

  footBlocks(foot) {
    const out = [];
    for (const k of kids(foot)) {
      if (ln(k) === 'fn-group') {
        for (const fn of kids(k, 'fn')) out.push(...this.fnBlocks(fn));
      } else if (ln(k) === 'fn') {
        out.push(...this.fnBlocks(k));
      } else {
        out.push(...this.blockNode(k));
      }
    }
    return out;
  }

  fnBlocks(fn) {
    const label = textOf(child(fn, 'label'));
    const blocks = this.blocks(kids(fn).filter((k) => ln(k) !== 'label'));
    if (label && blocks[0] && blocks[0].type === 'paragraph') {
      blocks[0] = { type: 'paragraph', inlines: [{ t: 'sup', c: [{ t: 'text', v: label }] }, { t: 'text', v: ' ' }, ...blocks[0].inlines] };
    }
    return blocks;
  }

  supp(node) {
    const id = attr(node, 'id') || this.uid('supp');
    if (this.suppIds.has(id)) return;
    this.suppIds.add(id);
    const media = find(node, 'media');
    const href = attr(node, 'href') || (media ? attr(media, 'href') : '');
    let caption = this.caption(node);
    if (!caption.length && media) caption = this.caption(media);
    let label = textOf(child(node, 'label'));
    if (!label && caption[0] && caption[0].inlines && caption[0].inlines[0] && caption[0].inlines[0].t === 'strong') {
      label = inlinesToPlain(caption[0].inlines[0].c);
      caption = [{ ...caption[0], inlines: trimInlines(caption[0].inlines.slice(1)) }, ...caption.slice(1)].filter((b) => !b.inlines || b.inlines.length);
    }
    this.ir.supp.push({ id, label: label.replace(/[.:]\s*$/, '') || href.split('/').pop() || 'Supplementary file', caption, href: this.asset(href, 'file') });
  }

  // ---------- metadata ----------
  meta() {
    const front = child(this.article, 'front') || this.article;
    const am = find(front, 'article-meta');
    const jm = find(front, 'journal-meta');
    const meta = this.ir.meta;
    if (!am) return;

    for (const id of kids(am, 'article-id')) {
      const type = attr(id, 'pub-id-type');
      const v = textOf(id);
      if (type === 'doi') meta.doi = normalizeDoi(v);
      else if (type === 'pmid') meta.pmid = normalizePmid(v);
      else if ((type === 'pmcid' || type === 'pmc') && !meta.pmcid) meta.pmcid = normalizePmcid(v);
    }
    if (!meta.pmcid && this.pmcidHint) meta.pmcid = normalizePmcid(this.pmcidHint);

    const titleGroup = child(am, 'title-group');
    const title = titleGroup && child(titleGroup, 'article-title');
    meta.title = title ? inlinesToPlain(this.inlines(title)).replace(/\s+/g, ' ').trim() : '';
    const subtitle = titleGroup && child(titleGroup, 'subtitle');
    if (subtitle && textOf(subtitle)) meta.title = `${meta.title}: ${textOf(subtitle)}`;

    const affs = new Map(findAll(front, 'aff').map((a) => [attr(a, 'id'), this.affText(a)]));
    for (const group of kids(am, 'contrib-group')) {
      for (const c of kids(group, 'contrib')) {
        if (attr(c, 'contrib-type') && attr(c, 'contrib-type') !== 'author') continue;
        const name = child(c, 'name') || find(c, 'name');
        const collab = child(c, 'collab');
        let display = '';
        if (name) display = [textOf(child(name, 'given-names')), textOf(child(name, 'surname')), textOf(child(name, 'suffix'))].filter(Boolean).join(' ');
        else if (collab) display = textOf(collab);
        else display = textOf(find(c, 'string-name'));
        if (!display) continue;
        const affiliations = kids(c, 'xref').filter((x) => attr(x, 'ref-type') === 'aff')
          .flatMap((x) => attr(x, 'rid').split(/\s+/)).map((rid) => affs.get(rid)).filter(Boolean);
        kids(c, 'aff').forEach((a) => affiliations.push(this.affText(a)));
        meta.authors.push({ name: display, affiliations });
      }
    }

    if (jm) {
      const jt = find(jm, 'journal-title') || find(jm, 'abbrev-journal-title');
      meta.journal = textOf(jt);
    }

    const dates = kids(am, 'pub-date');
    const rank = (d) => {
      const t = attr(d, 'pub-type') || attr(d, 'date-type');
      return ({ epub: 0, pub: 0, ppub: 1, 'epub-ppub': 1, collection: 2 }[t] ?? 3);
    };
    const best = dates.filter((d) => child(d, 'year')).sort((a, b) => rank(a) - rank(b))[0];
    meta.year = best ? extractYear(textOf(child(best, 'year'))) : null;

    const perms = child(am, 'permissions');
    if (perms) {
      const lic = find(perms, 'license');
      const ref = find(perms, 'license_ref');
      meta.license = normalizeLicense((ref && textOf(ref)) || (lic && attr(lic, 'href')) || (lic && textOf(lic)) || '');
    }

    for (const g of kids(am, 'kwd-group')) {
      if (/abbrev/i.test(attr(g, 'kwd-group-type'))) continue;
      for (const k of kids(g, 'kwd')) {
        const v = textOf(k);
        if (v && !meta.keywords.includes(v)) meta.keywords.push(v);
      }
    }

    this.abstract(am);
    this.frontBack(am);
  }

  affText(aff) {
    const clone = aff.cloneNode(true);
    kids(clone, 'label').forEach((l) => l.parentNode.removeChild(l));
    return textOf(clone).replace(/^[,;\s]+/, '');
  }

  abstract(am) {
    const abs = kids(am, 'abstract');
    const main = abs.find((a) => !attr(a, 'abstract-type')) || abs.find((a) => !SKIP_ABSTRACT_TYPES.has(attr(a, 'abstract-type'))) || null;
    if (!main) return;
    const secs = kids(main, 'sec');
    if (secs.length) {
      for (const s of secs) {
        const sec = this.section(s);
        this.ir.abstract.push({ title: sec.title, blocks: [...sec.blocks, ...sec.children.flatMap((c) => this.flattenSection(c))], children: [] });
      }
    }
    const loose = this.blocks(kids(main).filter((k) => !['sec', 'title'].includes(ln(k))));
    if (loose.length) this.ir.abstract.unshift({ title: null, blocks: loose, children: [] });
  }

  /** article-meta 里的基金、利益冲突、数据可用性 */
  frontBack(am) {
    const back = this.ir.back;
    for (const fg of kids(am, 'funding-group')) {
      const stmt = findAll(fg, 'funding-statement');
      if (stmt.length) stmt.forEach((s) => back.funding.push(...this.paragraphBlocks(s)));
      else {
        const awards = kids(fg, 'award-group').map((a) => textOf(a)).filter(Boolean);
        if (awards.length) back.funding.push({ type: 'list', ordered: false, items: awards.map((a) => [{ type: 'paragraph', inlines: [{ t: 'text', v: a }] }]) });
      }
    }
    const notes = child(am, 'author-notes');
    if (notes) {
      for (const fn of findAll(notes, 'fn')) {
        const key = classifyBackSection(textOf(child(fn, 'title')) || textOf(find(fn, 'bold')), attr(fn, 'fn-type'));
        if (key) back[key].push(...this.blocks(kids(fn).filter((k) => !['label', 'title'].includes(ln(k)))));
      }
    }
    for (const cm of findAll(am, 'custom-meta')) {
      const name = textOf(child(cm, 'meta-name'));
      const value = child(cm, 'meta-value');
      const key = classifyBackSection(name, '');
      if (key && value && textOf(value)) back[key].push(...this.paragraphBlocks(value));
    }
  }

  // ---------- body / back ----------
  body() {
    const body = child(this.article, 'body');
    if (!body) return;
    const loose = [];
    for (const k of kids(body)) {
      if (ln(k) === 'sec') {
        const s = this.section(k);
        const key = classifyBackSection(inlinesToPlain(s.title || []), s.type);
        if (key && key !== 'acknowledgements' && !s.children.length) this.ir.back[key].push(...s.blocks);
        else this.ir.sections.push(s);
      } else {
        loose.push(...this.blockNode(k));
      }
    }
    if (loose.length) this.ir.sections.unshift({ title: null, blocks: loose, children: [] });
  }

  back() {
    const back = child(this.article, 'back');
    if (!back) return;
    for (const k of kids(back)) {
      const tag = ln(k);
      if (tag === 'ref-list') this.refList(k);
      else if (tag === 'ack') this.ir.back.acknowledgements.push(...this.section(k).blocks, ...this.section(k).children.flatMap((c) => this.flattenSection(c)));
      else if (tag === 'fn-group') this.fnGroup(k);
      else if (tag === 'sec' || tag === 'notes' || tag === 'app' || tag === 'glossary') this.backSec(k);
      else if (tag === 'app-group') kids(k, 'app').forEach((a) => this.backSec(a));
      else if (tag === 'supplementary-material') this.supp(k);
    }
  }

  backSec(node) {
    const s = this.section(node);
    const key = classifyBackSection(inlinesToPlain(s.title || []), attr(node, 'sec-type') || attr(node, 'notes-type'));
    if (key) {
      this.ir.back[key].push(...s.blocks, ...s.children.flatMap((c) => this.flattenSection(c)));
    } else if (s.blocks.length || s.children.length) {
      if (!s.title) s.title = [{ t: 'text', v: 'Notes' }];
      this.ir.back.other.push(s);
    }
  }

  fnGroup(group) {
    const misc = [];
    for (const fn of kids(group, 'fn')) {
      const key = classifyBackSection(textOf(child(fn, 'title')) || textOf(find(fn, 'bold')), attr(fn, 'fn-type'));
      const blocks = this.blocks(kids(fn).filter((k) => !['label', 'title'].includes(ln(k))));
      if (key) this.ir.back[key].push(...blocks);
      else misc.push(...blocks);
    }
    if (misc.length) this.ir.back.other.push({ title: [{ t: 'text', v: 'Notes' }], blocks: misc, children: [] });
  }

  refList(list) {
    for (const k of kids(list)) {
      if (ln(k) === 'ref-list') this.refList(k);
      if (ln(k) !== 'ref') continue;
      const cit = find(k, ...CITATION_TAGS);
      const ref = { id: attr(k, 'id'), label: textOf(child(k, 'label')), text: [], doi: '', pmid: '', url: '' };
      if (cit) {
        for (const pid of findAll(cit, 'pub-id')) {
          const type = attr(pid, 'pub-id-type');
          if (type === 'doi' && !ref.doi) ref.doi = normalizeDoi(textOf(pid));
          if (type === 'pmid' && !ref.pmid) ref.pmid = normalizePmid(textOf(pid));
        }
        for (const link of findAll(cit, 'ext-link', 'uri')) {
          const href = attr(link, 'href') || textOf(link);
          if (!ref.doi && (/doi\.org\//i.test(href) || attr(link, 'ext-link-type') === 'doi')) ref.doi = normalizeDoi(href);
          else if (!ref.url && /^https?:\/\//i.test(href)) ref.url = href;
        }
        ref.text = ln(cit) === 'element-citation' ? this.elementCitation(cit) : this.mixedCitation(cit);
      } else {
        ref.text = trimInlines(this.inlines(k).filter((n) => n.t !== 'text' || n.v.trim() !== ref.label));
      }
      this.ir.refs.push(ref);
    }
  }

  mixedCitation(cit) {
    const clone = cit.cloneNode(true);
    findAll(clone, 'pub-id', 'comment').forEach((n) => n.parentNode && n.parentNode.removeChild(n));
    const inl = trimInlines(this.inlines(clone));
    const last = inl[inl.length - 1];
    if (last && last.t === 'text') last.v = last.v.replace(/[\s.;,]*(doi:?|pmid:?|\[pubmed\]|pubmed)?[\s.;,]*$/i, '');
    return trimInlines(inl);
  }

  elementCitation(cit) {
    const names = findAll(cit, 'name', 'collab', 'string-name').filter((n) => ln(n.parentNode) !== 'name');
    const people = names.map((n) => {
      if (ln(n) === 'name') {
        const given = textOf(child(n, 'given-names'));
        const initials = given.split(/[\s.-]+/).filter(Boolean).map((g) => g[0]).join('');
        return [textOf(child(n, 'surname')), initials].filter(Boolean).join(' ');
      }
      return textOf(n);
    }).filter(Boolean);
    const etal = find(cit, 'etal') || people.length > 6;
    const authors = people.slice(0, 6).join(', ') + (etal ? ', et al' : '');
    const title = child(cit, 'article-title') || child(cit, 'chapter-title');
    const source = child(cit, 'source');
    const year = textOf(child(cit, 'year'));
    const volume = textOf(child(cit, 'volume'));
    const issue = textOf(child(cit, 'issue'));
    const fpage = textOf(child(cit, 'fpage'));
    const lpage = textOf(child(cit, 'lpage'));
    const elocation = textOf(child(cit, 'elocation-id'));
    const out = [];
    const add = (inl, sep = ' ') => { if (inl.length) { if (out.length) out.push({ t: 'text', v: sep }); out.push(...inl); } };
    if (authors) add([{ t: 'text', v: `${authors}.` }]);
    if (title) add([...trimInlines(this.inlines(title)), { t: 'text', v: '.' }]);
    if (source) add([...trimInlines(this.inlines(source)), { t: 'text', v: '.' }]);
    let tail = year;
    if (volume) tail += `${tail ? ';' : ''}${volume}${issue ? `(${issue})` : ''}`;
    if (fpage) tail += `:${fpage}${lpage ? `-${lpage}` : ''}`;
    else if (elocation) tail += `:${elocation}`;
    if (tail) add([{ t: 'text', v: `${tail}.` }]);
    return normalizeInlines(out.map((n) => (n.t === 'text' ? { ...n, v: n.v.replace(/\.\.$/, '.') } : n)));
  }

  floatsGroup() {
    const fg = child(this.article, 'floats-group');
    if (!fg) return;
    for (const k of kids(fg)) {
      if (ln(k) === 'fig') this.figure(k);
      else if (ln(k) === 'table-wrap') this.table(k);
      else if (ln(k) === 'fig-group') kids(k, 'fig').forEach((f) => this.figure(f));
      else if (ln(k) === 'supplementary-material') this.supp(k);
    }
  }

  parse() {
    this.meta();
    this.body();
    this.back();
    this.floatsGroup();
    // body 里没被放进块的附件（例如 sec 内的 supplementary-material 已注册）在这里补全
    findAll(this.article, 'supplementary-material').forEach((s) => this.supp(s));
    this.ir.notices = [...new Set(this.ir.notices)];
    return this.ir;
  }
}

/**
 * @param {string|Element} xml fullTextXML 文本或已解析的 <article>
 * @param {{ pmcid?:string, url?:string, DOMParser?:any }} [options]
 */
export function parseJats(xml, options = {}) {
  const article = typeof xml === 'string' ? parseJatsXml(xml, options.DOMParser) : xml;
  return new JatsParser(article, options).parse();
}
