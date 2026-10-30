// 已渲染页面 DOM → ArticleIR 的通用转换（L2）。站点差异放在各 adapter 的选择器配置里（PRD §2.2）。
import { normalizeInlines, trimInlines } from '../article-ir';
import { mathmlToLatex, isDisplayMath } from '../math/mathml-to-latex';
import { stripTexDocument } from '../math/clean-latex';
import { normalizeDoi, normalizePmid } from '../ids';
import { ln, resolveUrl, textOf } from './dom-utils';
import { rewriteAssetUrl } from '../assets';

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const FLOAT_LABEL = /^((?:Table|Figure|Fig\.?|Box|Scheme|Chart)\s+[A-Z]?\d+[A-Za-z]?)(?:[.:|]\s*|\s+|$)/;
const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'ul', 'ol', 'dl', 'table',
  'figure', 'blockquote', 'pre', 'hr', 'form', 'nav', 'details', ...HEADINGS]);
const ALWAYS_SKIP = new Set(['script', 'style', 'noscript', 'template', 'button', 'svg', 'input', 'select', 'textarea', 'iframe', 'link', 'meta']);

const DEFAULTS = {
  skip: '[hidden], [aria-hidden="true"]:not(mjx-assistive-mml), .MathJax_Preview, .MathJax, .MathJax_Display, .MJX_Assistive_MathML',
  // MathJax 2 的 CHTML / SVG 输出（输入是 MathML 时没有 math/tex 脚本，公式只在辅助 MathML 或 data-mathml 里）
  mathjaxOutput: '.mjx-chtml, .MathJax_CHTML, .MathJax_SVG, [data-mathml]',
  cite: '',
  tableLink: 'a[data-test="table-link"]',
  figure: 'figure, .fig',
  table: '.table-wrap, .tw, section.tw, div.table',
  formula: '.disp-formula, .display-formula, .formula',
  label: '.obj_head, .label, .fig-label, .caption-label',
  caption: 'figcaption, .caption',
  tableFoot: '.tw-foot, .table-foot, .table-wrap-foot',
  equationImage: 'img.formula, img.equation, img[alt*="equation" i], img[alt*="formula" i], .inline-formula img, .disp-formula img',
};

export class HtmlConverter {
  /**
   * @param {object} ir ArticleIR（figures/tables 会写进去）
   * @param {{ baseUrl?:string, refIds?:Set<string>, selectors?:object }} options
   */
  /**
   * hooks（站点配置提供，都可选）：
   *   citeRid(el) → 正文引用元素（sel.cite 命中的）指向的参考文献 id
   *   tableSource(el) → 表格内容不在占位元素里时（MDPI 弹窗表）返回真正放表格的元素
   *   imageSrc(url, img) → 改写图片地址（如换成大图）
   */
  constructor(ir, { baseUrl = '', refIds = new Set(), refAlias = new Map(), selectors = {}, hooks = {} } = {}) {
    this.ir = ir;
    this.baseUrl = baseUrl;
    this.refIds = refIds;
    this.refAlias = refAlias;
    this.hooks = hooks;
    this.sel = { ...DEFAULTS, ...selectors };
    this.counter = 0;
    this.seenFig = new Set();
    this.seenTable = new Set();
  }

  uid(prefix) {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  matches(el, selector) {
    if (!selector || !el.matches) return false;
    try { return el.matches(selector); } catch (_) { return false; }
  }

  skipped(el) {
    return ALWAYS_SKIP.has(ln(el)) || this.matches(el, this.sel.skip);
  }

  url(href) {
    return resolveUrl(href, this.baseUrl);
  }

  /** 参考文献 id：本身是条目 id，或者是条目里某个锚点的 id（PLOS 的 #pmed-…-b1 在 li#ref1 里） */
  refId(x) {
    if (!x) return null;
    if (this.refIds.has(x)) return x;
    return this.refAlias.get(x) || null;
  }

  /** MathJax 2 CHTML/SVG 渲染结果 → TeX（后面紧跟 math/tex 脚本时交给脚本，避免重复） */
  mathjaxTex(node) {
    const next = node.nextElementSibling;
    if (next && ln(next) === 'script' && this.mathScript(next)) return null;
    const m = node.querySelector('math');
    if (m) return mathmlToLatex(m);
    const raw = node.getAttribute('data-mathml');
    if (raw && typeof DOMParser !== 'undefined') {
      try {
        const doc = new DOMParser().parseFromString(raw, 'application/xml');
        if (!doc.getElementsByTagName('parsererror').length) return mathmlToLatex(doc.documentElement);
      } catch (_) { /* 解析失败就当没有公式 */ }
    }
    return '';
  }

  // ---------- inline ----------
  inlines(el) {
    const out = [];
    const nodes = Array.from(el.childNodes || []);
    nodes.forEach((n, i) => {
      // 排版缩进产生的换行空白紧挨着 <sub>/<sup> 时去掉（Springer：<i>K</i>\n   <sub>ij</sub>）
      const next = nodes[i + 1];
      if (n.nodeType === 3 && /\n/.test(n.nodeValue) && !n.nodeValue.trim() && next && next.nodeType === 1 && ['sub', 'sup'].includes(ln(next))) return;
      out.push(...this.inlineNode(n));
    });
    return normalizeInlines(out);
  }

  inlineNode(node) {
    if (node.nodeType === 3) return [{ t: 'text', v: node.nodeValue }];
    if (node.nodeType !== 1) return [];
    const tag = ln(node);
    if (tag === 'script') return this.mathScript(node) ? [{ t: 'math', tex: this.mathScript(node).tex }] : [];
    // 正文引用可能是 button（Frontiers），要在跳过 button 之前认出来
    if (this.sel.cite && this.matches(node, this.sel.cite)) {
      const rid = this.refId(this.hooks.citeRid ? this.hooks.citeRid(node) : node.getAttribute('data-rid'));
      if (rid) return [{ t: 'cite', rid, c: trimInlines([{ t: 'text', v: node.textContent }]) }];
    }
    if (this.matches(node, this.sel.mathjaxOutput)) {
      const tex = this.mathjaxTex(node);
      return tex ? [{ t: 'math', tex }] : [];
    }
    if (this.skipped(node)) return [];
    switch (tag) {
    case 'em': case 'i': case 'cite': case 'var':
      return [{ t: 'em', c: this.inlines(node) }];
    case 'strong': case 'b':
      return [{ t: 'strong', c: this.inlines(node) }];
    case 'sup':
      return [{ t: 'sup', c: this.inlines(node) }];
    case 'sub':
      return [{ t: 'sub', c: this.inlines(node) }];
    case 'u':
      return [{ t: 'underline', c: this.inlines(node) }];
    case 'code': case 'kbd': case 'tt': case 'samp':
      return [{ t: 'code', v: node.textContent }];
    case 'br':
      return [{ t: 'br' }];
    case 'a':
      return this.anchor(node);
    case 'math':
      return [{ t: 'math', tex: mathmlToLatex(node) }];
    case 'mjx-container': {
      const m = node.querySelector('math');
      return m ? [{ t: 'math', tex: mathmlToLatex(m) }] : [];
    }
    case 'img':
      if (this.matches(node, this.sel.equationImage)) return [{ t: 'mathImage', src: this.url(node.getAttribute('src')) }];
      return [];
    default:
      // MDPI 用 class 表示斜体 / 粗体：<span class="html-italic">Felis catus</span>
      if (tag === 'span' && node.classList && node.classList.contains('html-italic')) return [{ t: 'em', c: this.inlines(node) }];
      if (tag === 'span' && node.classList && node.classList.contains('html-bold')) return [{ t: 'strong', c: this.inlines(node) }];
      return this.inlines(node);
    }
  }

  mathScript(node) {
    const type = (node.getAttribute('type') || '').toLowerCase();
    if (!type.startsWith('math/tex')) return null;
    return { tex: stripTexDocument(node.textContent), display: /mode=display/.test(type) };
  }

  anchor(a) {
    const href = a.getAttribute('href') || '';
    let hash = '';
    try { hash = href.includes('#') ? decodeURIComponent(href.slice(href.indexOf('#') + 1)) : ''; } catch (_) { hash = ''; }
    const rid = this.refId(hash) || this.refId(a.getAttribute('aria-describedby')) || this.refId(a.getAttribute('rid'));
    const label = this.inlines(a);
    if (rid) return [{ t: 'cite', rid, c: label }];
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return label;
    const url = this.url(href);
    // 指向本页其他位置的链接（Springer 的 /article/…#Fig1）只留文字
    if (url && this.baseUrl && url.includes('#') && url.split('#')[0] === String(this.baseUrl).split('#')[0]) return label;
    return url ? [{ t: 'link', href: url, c: label }] : label;
  }

  // ---------- blocks ----------
  isBlock(el) {
    if (el.nodeType !== 1) return false;
    const tag = ln(el);
    if (tag === 'math') return isDisplayMath(el);
    if (tag === 'mjx-container') return el.getAttribute('display') === 'true' || el.getAttribute('display') === 'block';
    if (tag === 'script') return !!(this.mathScript(el) && this.mathScript(el).display);
    if (this.matches(el, '.display-inline')) return false;
    return BLOCK_TAGS.has(tag) || this.matches(el, this.sel.figure) || this.matches(el, this.sel.table) || this.matches(el, this.sel.formula);
  }

  hasBlockChild(el) {
    return Array.from(el.children || []).some((c) => !this.skipped(c) && this.isBlock(c));
  }

  paragraphFromInline(nodes) {
    const inl = [];
    for (const n of nodes) inl.push(...this.inlineNode(n));
    const t = trimInlines(inl);
    return t.length ? [{ type: 'paragraph', inlines: t }] : [];
  }

  /** 把混合了行内和块元素的子节点切成块 */
  mixed(el) {
    const blocks = [];
    let buf = [];
    const flush = () => { blocks.push(...this.paragraphFromInline(buf)); buf = []; };
    for (const n of Array.from(el.childNodes || [])) {
      if (n.nodeType === 1 && !this.skipped(n) && this.isBlock(n)) {
        flush();
        blocks.push(...this.block(n));
      } else {
        buf.push(n);
      }
    }
    flush();
    return blocks;
  }

  block(el) {
    if (el.nodeType === 3) return el.nodeValue.trim() ? [{ type: 'paragraph', inlines: [{ t: 'text', v: el.nodeValue.trim() }] }] : [];
    if (el.nodeType !== 1 || this.skipped(el)) {
      if (el.nodeType === 1 && ln(el) === 'script' && this.mathScript(el)) return [{ type: 'math', tex: this.mathScript(el).tex }];
      return [];
    }
    const tag = ln(el);
    if (this.matches(el, this.sel.figure)) return [{ type: 'figure', id: this.figure(el) }];
    if (this.matches(el, this.sel.table) || tag === 'table') return [{ type: 'table', id: this.table(el) }];
    if (this.matches(el, this.sel.formula)) return [this.displayFormula(el)].filter(Boolean);
    switch (tag) {
    case 'math':
      return [{ type: 'math', tex: mathmlToLatex(el) }];
    case 'mjx-container': {
      const m = el.querySelector('math');
      return m ? [{ type: 'math', tex: mathmlToLatex(m) }] : [];
    }
    case 'ul': case 'ol':
      return [this.list(el)];
    case 'dl':
      return [this.defList(el)];
    case 'blockquote':
      return [{ type: 'quote', blocks: this.mixed(el) }];
    case 'pre':
      return [{ type: 'code', text: el.textContent }];
    case 'hr':
      return [];
    case 'p':
      return this.mixed(el);
    default:
      if (HEADINGS.includes(tag)) return this.paragraphFromInline([el]).map((b) => ({ ...b, inlines: [{ t: 'strong', c: b.inlines }] }));
      return this.hasBlockChild(el) ? this.mixed(el) : this.paragraphFromInline(Array.from(el.childNodes));
    }
  }

  blocks(nodes) {
    const out = [];
    for (const n of nodes) out.push(...this.block(n));
    return out;
  }

  list(el) {
    const items = Array.from(el.children).filter((c) => ln(c) === 'li').map((li) => {
      const b = this.mixed(li);
      return b.length ? b : [{ type: 'paragraph', inlines: [] }];
    });
    return { type: 'list', ordered: ln(el) === 'ol', items };
  }

  defList(el) {
    const items = [];
    let term = null;
    for (const c of Array.from(el.children)) {
      if (ln(c) === 'dt') {
        term = trimInlines(this.inlines(c));
        const last = term[term.length - 1];
        if (last && last.t === 'text') last.v = last.v.replace(/\s*:\s*$/, '');
        else if (last && last.c && last.c.length && last.c[last.c.length - 1].t === 'text') last.c[last.c.length - 1].v = last.c[last.c.length - 1].v.replace(/\s*:\s*$/, '');
      }
      else if (ln(c) === 'dd') {
        items.push([{ type: 'paragraph', inlines: trimInlines([...(term ? [{ t: 'strong', c: term }, { t: 'text', v: ': ' }] : []), ...this.inlines(c)]) }]);
        term = null;
      }
    }
    return { type: 'list', ordered: false, items };
  }

  displayFormula(el) {
    const script = Array.from(el.querySelectorAll('script')).map((s) => this.mathScript(s)).find(Boolean);
    if (script) return { type: 'math', tex: script.tex };
    const tex = el.querySelector('annotation[encoding*="tex" i]');
    if (tex && tex.textContent.trim()) return { type: 'math', tex: tex.textContent.trim() };
    const math = el.querySelector('math');
    if (math) return { type: 'math', tex: mathmlToLatex(math) };
    const img = el.querySelector('img');
    if (img && img.getAttribute('src')) {
      this.ir.notices.push('equation_image');
      return { type: 'mathImage', src: this.url(img.getAttribute('src')) };
    }
    const t = textOf(el);
    return t ? { type: 'paragraph', inlines: [{ t: 'text', v: t }] } : null;
  }

  // ---------- floats ----------
  labelAndCaption(el) {
    const labelEl = Array.from(el.querySelectorAll(this.sel.label)).find((l) => !l.closest('table'));
    const capEl = el.querySelector(this.sel.caption);
    const label = labelEl ? textOf(labelEl).replace(/[.:]\s*$/, '') : '';
    let caption = [];
    if (capEl) {
      const clone = capEl.cloneNode(true);
      if (labelEl && clone.contains && capEl.contains(labelEl)) {
        Array.from(clone.querySelectorAll(this.sel.label)).forEach((l) => l.remove());
      }
      caption = this.hasBlockChild(clone) ? this.mixed(clone) : this.paragraphFromInline(Array.from(clone.childNodes));
    }
    // 标签元素里还带着图题（Nature：「Fig. 1: AlphaFold produces…」）：拆成标签 + 加粗图题
    const lm = label.match(FLOAT_LABEL);
    if (lm && label.length > lm[0].length) {
      const title = label.slice(lm[0].length).trim();
      return { label: lm[1], caption: [{ type: 'paragraph', inlines: [{ t: 'strong', c: [{ t: 'text', v: title }] }] }, ...caption] };
    }
    // 没有单独的标签元素：「Table 1 Genus-level…」这样的开头拆成标签（Springer / Nature）
    if (!label && caption[0] && caption[0].type === 'paragraph') {
      const split = splitFloatLabel(caption[0].inlines);
      if (split) {
        caption = [{ type: 'paragraph', inlines: split.rest }, ...caption.slice(1)].filter((b) => b.type !== 'paragraph' || b.inlines.length);
        return { label: split.label, caption };
      }
    }
    return { label, caption };
  }

  imageUrl(img) {
    if (!img) return '';
    // 懒加载和大图地址优先（MDPI data-large / data-original，其他站 data-src）
    const raw = img.getAttribute('data-large') || img.getAttribute('data-original') || img.getAttribute('data-src') || img.getAttribute('src');
    const url = rewriteAssetUrl(this.url(raw));
    return this.hooks.imageSrc ? this.hooks.imageSrc(url, img) : url;
  }

  figure(el) {
    const id = el.getAttribute('id') || this.uid('fig');
    if (this.seenFig.has(id)) return id;
    this.seenFig.add(id);
    const { label, caption } = this.labelAndCaption(el);
    const img = el.querySelector('img');
    const src = this.imageUrl(img);
    this.ir.figures.push({ id, label, caption, src, alt: img ? img.getAttribute('alt') || '' : '' });
    return id;
  }

  table(el) {
    const id = el.getAttribute('id') || this.uid('table');
    if (this.seenTable.has(id)) return id;
    this.seenTable.add(id);
    const source = (this.hooks.tableSource && this.hooks.tableSource(el)) || el;
    const tableEl = ln(el) === 'table' ? el : source.querySelector('table');
    const { label, caption } = ln(el) === 'table' ? { label: '', caption: [] } : this.labelAndCaption(el);
    const rows = [];
    if (tableEl) {
      for (const tr of Array.from(tableEl.querySelectorAll('tr'))) {
        if (tr.closest('table') !== tableEl) continue;
        const inHead = !!tr.closest('thead');
        rows.push({
          cells: Array.from(tr.children).filter((c) => ['td', 'th'].includes(ln(c))).map((c) => ({
            header: inHead || ln(c) === 'th',
            colspan: parseInt(c.getAttribute('colspan'), 10) || 1,
            rowspan: parseInt(c.getAttribute('rowspan'), 10) || 1,
            inlines: trimInlines(this.cellInlines(c)),
          })),
        });
      }
    }
    const footEl = ln(el) === 'table' ? null : source.querySelector(this.sel.tableFoot);
    const img = !tableEl ? Array.from(el.querySelectorAll('img')).find((i) => !this.matches(i, '.html-media-button img, button img')) : null;
    // 页面只放了表题和「完整表格」链接（Springer / Nature 的 inline table）：记下链接，渲染时给出
    const linkEl = !tableEl && !img ? el.querySelector(this.sel.tableLink) : null;
    this.ir.tables.push({
      id, label, caption, rows,
      foot: footEl ? this.mixed(footEl) : [],
      src: img ? this.imageUrl(img) : '',
      href: linkEl ? this.url(linkEl.getAttribute('href')) : '',
    });
    return id;
  }

  cellInlines(cell) {
    const out = [];
    for (const n of Array.from(cell.childNodes)) {
      if (n.nodeType === 1 && ['p', 'div'].includes(ln(n))) {
        if (out.length) out.push({ t: 'br' });
        out.push(...this.inlines(n));
      } else {
        out.push(...this.inlineNode(n));
      }
    }
    return out;
  }

  // ---------- sections ----------
  headingLevel(el) {
    const tag = ln(el);
    return HEADINGS.includes(tag) ? Number(tag[1]) : 0;
  }

  /** 把容器压平成 [heading | block] 事件流，再按标题层级建树 */
  events(el, out = []) {
    for (const n of Array.from(el.childNodes || [])) {
      if (n.nodeType === 3) {
        if (n.nodeValue.trim()) out.push({ block: { type: 'paragraph', inlines: [{ t: 'text', v: n.nodeValue.trim() }] } });
        continue;
      }
      if (n.nodeType !== 1 || this.skipped(n)) {
        if (n.nodeType === 1 && ln(n) === 'script' && this.mathScript(n)) out.push({ block: { type: 'math', tex: this.mathScript(n).tex } });
        continue;
      }
      const level = this.headingLevel(n);
      if (level) {
        const inl = trimInlines(this.inlines(n));
        if (inl.length) out.push({ heading: inl, level, el: n });
        continue;
      }
      const tag = ln(n);
      const special = this.matches(n, this.sel.figure) || this.matches(n, this.sel.table) || this.matches(n, this.sel.formula);
      // header / a 里也可能包着节标题（eLife：<header><a class="article-section__toggle"><h2>…</h2></a></header>）
      const wrapsHeading = ['header', 'a'].includes(tag) && !!n.querySelector('h1, h2, h3, h4, h5, h6');
      if (!special && (wrapsHeading || (['section', 'div', 'article', 'main'].includes(tag) && this.hasBlockChild(n)))) {
        this.events(n, out);
      } else if (!special && !this.isBlock(n)) {
        // 容器里直接出现的行内元素：和相邻行内节点合成一段
        const last = out[out.length - 1];
        const inl = this.inlineNode(n);
        if (last && last.inline) last.inline.push(...inl);
        else out.push({ inline: inl });
      } else {
        out.push(...this.block(n).map((b) => ({ block: b })));
      }
    }
    return out.map((e) => {
      if (!e.inline) return e;
      const t = trimInlines(e.inline);
      return t.length ? { block: { type: 'paragraph', inlines: t } } : null;
    }).filter(Boolean);
  }

  /** @returns {Array} Section[] */
  sections(container, { onHeading } = {}) {
    const events = this.events(container);
    const levels = events.filter((e) => e.heading).map((e) => e.level);
    const min = levels.length ? Math.min(...levels) : 2;
    const root = { title: null, blocks: [], children: [], level: min - 1 };
    const stack = [root];
    for (const e of events) {
      if (e.heading) {
        if (onHeading && onHeading(e) === false) continue;
        while (stack.length > 1 && stack[stack.length - 1].level >= e.level) stack.pop();
        const s = { title: e.heading, blocks: [], children: [], level: e.level };
        stack[stack.length - 1].children.push(s);
        stack.push(s);
      } else {
        stack[stack.length - 1].blocks.push(e.block);
      }
    }
    const strip = (s) => ({ title: s.title, blocks: s.blocks, children: s.children.map(strip) });
    const out = root.children.map(strip);
    if (root.blocks.length) out.unshift({ title: null, blocks: root.blocks, children: [] });
    return out;
  }
}

/** 段首的「Table 1」「Fig. 2」拆成标签，其余是图注 */
export function splitFloatLabel(inlines) {
  const first = inlines[0];
  let text = first && first.t === 'text' ? first.v : '';
  let rest = inlines.slice(1);
  // 标签可能整个包在 <b> 里：<b>Table 1</b> 或 <b>Table 1 <b>标题</b></b>
  if (!text && first && first.t === 'strong' && first.c[0] && first.c[0].t === 'text') {
    text = first.c[0].v;
    rest = [...first.c.slice(1), ...inlines.slice(1)];
  }
  const m = text.replace(/^\s+/, '').match(FLOAT_LABEL);
  if (!m) return null;
  const after = text.replace(/^\s+/, '').slice(m[0].length);
  return { label: m[1], rest: trimInlines([...(after ? [{ t: 'text', v: after }] : []), ...rest]) };
}

/** 从 DOM 参考文献条目里取 DOI / PMID（链接优先，其次文本） */
export function refIdsFromElement(el) {
  let doi = '';
  let pmid = '';
  for (const a of Array.from(el.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href');
    if (!doi && /doi\.org\/10\./i.test(href)) doi = normalizeDoi(href);
    if (!pmid && /pubmed\.ncbi\.nlm\.nih\.gov\/\d+|ncbi\.nlm\.nih\.gov\/pubmed\/\d+/i.test(href)) pmid = normalizePmid(href.replace(/^.*pubmed\/?/i, ''));
  }
  if (!doi) {
    const m = textOf(el).match(/doi:?\s*(10\.\d{4,9}\/\S+)/i);
    if (m) doi = normalizeDoi(m[1]);
  }
  return { doi, pmid };
}

/** 读 <meta name="citation_*">（Highwire 标签，PMC / PubMed 都有） */
export function citationMeta(doc, name) {
  return Array.from(doc.querySelectorAll(`meta[name="${name}"]`)).map((m) => (m.getAttribute('content') || '').trim()).filter(Boolean);
}
