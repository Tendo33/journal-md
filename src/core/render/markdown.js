// ArticleIR → Markdown（PRD §2.3）。JATS 和 DOM 两条路共用这一个渲染器。
import { inlinesToPlain, blocksToPlain } from '../article-ir';
import { renderFrontMatter, formatExported } from './frontmatter';
import { renderInlines, escapeLineStart, texForMarkdown, unwrapFootnoteGroups } from './inline';
import { renderTableBody } from './table';

export const ABSTRACT_ONLY_MARKER = 'Abstract only / 仅摘要';

const HEADINGS = {
  abstract: 'Abstract',
  keywords: 'Keywords',
  mesh: 'MeSH terms',
  floats: 'Figures and tables',
  acknowledgements: 'Acknowledgements',
  dataAvailability: 'Data availability',
  funding: 'Funding',
  competingInterests: 'Competing interests',
  supp: 'Supplementary material',
  refs: 'References',
};

function heading(level, textMd) {
  return `${'#'.repeat(Math.min(6, Math.max(1, level)))} ${textMd}`;
}

function oneLine(md) {
  return md.replace(/\s*\n+\s*/g, ' ').trim();
}

function prefixLines(md, prefix) {
  return md.split('\n').map((l) => (l ? `${prefix}${l}` : prefix.trimEnd())).join('\n');
}

function shortCaption(label, caption) {
  const plain = blocksToPlain(caption).replace(/\s+/g, ' ').trim();
  const first = plain.split(/(?<=\.)\s/)[0] || '';
  const alt = [label, first].filter(Boolean).join(' ').replace(/[[\]]/g, '').trim();
  return alt.length > 120 ? `${alt.slice(0, 117)}…` : alt;
}

class Renderer {
  constructor(ir, opts) {
    this.ir = ir;
    this.opts = opts;
    this.figures = new Map(ir.figures.map((f) => [f.id, f]));
    this.tables = new Map(ir.tables.map((t) => [t.id, t]));
    this.placed = new Set();
    this.refIndex = new Map();
    ir.refs.forEach((r, i) => { if (r.id) this.refIndex.set(r.id, i + 1); });
    this.cited = new Set();
    this.ctx = {
      citeNumber: (rid) => this.refIndex.get(rid) || null,
      cited: this.cited,
    };
  }

  inl(inlines) {
    return renderInlines(inlines, this.ctx);
  }

  blocks(blocks) {
    return (blocks || []).map((b) => this.block(b)).filter((s) => s && s.trim()).join('\n\n');
  }

  block(b) {
    switch (b.type) {
    case 'paragraph': {
      const md = unwrapFootnoteGroups(this.inl(b.inlines).trim());
      return md.split('\n').map(escapeLineStart).join('\n');
    }
    case 'list':
      return b.items.map((item, i) => {
        const marker = b.ordered ? `${i + 1}. ` : '- ';
        const body = this.blocks(item) || '';
        const indent = ' '.repeat(marker.length);
        return marker + body.split('\n').map((l, j) => (j === 0 || !l ? l : indent + l)).join('\n');
      }).join('\n');
    case 'math': {
      const tex = texForMarkdown(b.tex);
      return tex ? `$$\n${tex}\n$$` : '';
    }
    case 'mathImage':
      return b.src ? `![equation](${b.src})\n\n*Equation shown as image (no TeX source available).*` : '';
    case 'figure':
      return this.figure(this.figures.get(b.id));
    case 'table':
      return this.table(this.tables.get(b.id));
    case 'quote':
      return prefixLines(this.blocks(b.blocks), '> ');
    case 'code':
      return `\`\`\`\n${b.text.replace(/\n+$/, '')}\n\`\`\``;
    default:
      return '';
    }
  }

  figure(f) {
    if (!f || this.placed.has(`f:${f.id}`)) return '';
    this.placed.add(`f:${f.id}`);
    const parts = [];
    if (this.opts.includeImages && f.src) parts.push(`![${shortCaption(f.label, f.caption) || 'Figure'}](${f.src})`);
    const caption = this.blocks(f.caption);
    const label = f.label ? `**${this.inl([{ t: 'text', v: f.label }])}**` : '';
    const quote = [label, caption].filter(Boolean).join(' ');
    if (quote) parts.push(prefixLines(quote, '> '));
    if (!this.opts.includeImages && f.src) parts.push('*(Figure image omitted.)*');
    return parts.join('\n\n');
  }

  table(t) {
    if (!t || this.placed.has(`t:${t.id}`)) return '';
    this.placed.add(`t:${t.id}`);
    const parts = [];
    const label = t.label ? `**${this.inl([{ t: 'text', v: t.label }])}**` : '';
    const caption = this.blocks(t.caption);
    const head = [label, caption].filter(Boolean).join(' ');
    if (head) parts.push(head);
    const body = renderTableBody(t, this.ctx);
    if (body) parts.push(body);
    else if (t.src) parts.push(`![${shortCaption(t.label, t.caption) || 'Table'}](${t.src})`);
    const foot = this.blocks(t.foot);
    if (foot) parts.push(prefixLines(foot, '> '));
    return parts.join('\n\n');
  }

  section(s, level) {
    const parts = [];
    const title = s.title && s.title.length ? this.inl(s.title).trim() : '';
    if (title) parts.push(heading(level, oneLine(title)));
    const body = this.blocks(s.blocks);
    if (body) parts.push(body);
    for (const c of s.children || []) {
      const child = this.section(c, title ? level + 1 : level);
      if (child) parts.push(child);
    }
    return parts.join('\n\n');
  }

  header() {
    const m = this.ir.meta;
    const parts = [];
    if (m.abstractOnly) {
      const link = m.fullTextUrl ? `Full text: <${m.fullTextUrl}>` : 'No full-text link was found on this page.';
      parts.push(`> **${ABSTRACT_ONLY_MARKER}** — ${link}`);
    }
    parts.push(heading(1, oneLine(this.inl([{ t: 'text', v: m.title || 'Untitled' }]))));
    if (m.authors.length) parts.push(`**Authors:** ${this.inl([{ t: 'text', v: m.authors.map((a) => a.name).join(', ') }])}`);
    const cite = [];
    if (m.journal) cite.push(`*${this.inl([{ t: 'text', v: m.journal }])}*`);
    if (m.year) cite.push(String(m.year));
    if (m.doi) cite.push(`DOI: [${this.inl([{ t: 'text', v: m.doi }])}](https://doi.org/${m.doi})`);
    if (m.pmid) cite.push(`PMID: [${m.pmid}](https://pubmed.ncbi.nlm.nih.gov/${m.pmid}/)`);
    if (m.pmcid) cite.push(`PMCID: [${m.pmcid}](https://pmc.ncbi.nlm.nih.gov/articles/${m.pmcid}/)`);
    if (cite.length) parts.push(cite.join(' · '));
    return parts.join('\n\n');
  }

  abstract() {
    const secs = this.ir.abstract || [];
    const parts = [];
    if (secs.length) {
      parts.push(heading(2, HEADINGS.abstract));
      for (const s of secs) {
        const title = s.title && s.title.length ? oneLine(this.inl(s.title)).replace(/:$/, '') : '';
        if (title) parts.push(heading(3, title));
        const body = this.blocks(s.blocks);
        if (body) parts.push(body);
      }
    }
    const m = this.ir.meta;
    if (m.keywords.length) parts.push(`**${HEADINGS.keywords}:** ${this.inl([{ t: 'text', v: m.keywords.join('; ') }])}`);
    if (m.mesh.length) parts.push(`**${HEADINGS.mesh}:** ${this.inl([{ t: 'text', v: m.mesh.join('; ') }])}`);
    return parts.join('\n\n');
  }

  backSection(key, blocksOrSections) {
    if (!blocksOrSections || !blocksOrSections.length) return '';
    const body = this.blocks(blocksOrSections);
    return body ? `${heading(2, HEADINGS[key])}\n\n${body}` : '';
  }

  supp() {
    const items = this.ir.supp;
    if (!items.length) return '';
    const lines = items.map((s) => {
      const label = s.label || 'Supplementary file';
      const name = s.href ? `[${this.inl([{ t: 'text', v: label }])}](${s.href})` : `**${this.inl([{ t: 'text', v: label }])}**`;
      const caption = oneLine(this.blocks(s.caption));
      return `- ${name}${caption ? ` — ${caption}` : ''}`;
    });
    return `${heading(2, HEADINGS.supp)}\n\n${lines.join('\n')}`;
  }

  refText(r) {
    let md = oneLine(this.inl(r.text));
    if (r.doi && !md.toLowerCase().includes(`doi.org/${r.doi.toLowerCase()}`)) {
      md = `${md.replace(/\s*\.?$/, '.')} https://doi.org/${r.doi}`;
    } else if (!r.doi && r.pmid && !md.includes('pubmed.ncbi.nlm.nih.gov')) {
      md = `${md.replace(/\s*\.?$/, '.')} https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`;
    } else if (!r.doi && !r.pmid && r.url && !md.includes(r.url)) {
      md = `${md.replace(/\s*\.?$/, '.')} <${r.url}>`;
    }
    return md;
  }

  references() {
    const refs = this.ir.refs;
    if (!refs.length) return '';
    // 正文里没有任何引用（例如 DOM 没链上）时脚注会被大多数渲染器丢掉，改成有序列表
    if (!this.cited.size) {
      return `${heading(2, HEADINGS.refs)}\n\n${refs.map((r, i) => `${i + 1}. ${this.refText(r)}`).join('\n')}`;
    }
    return `${heading(2, HEADINGS.refs)}\n\n${refs.map((r, i) => `[^${i + 1}]: ${this.refText(r)}`).join('\n')}`;
  }

  render() {
    const ir = this.ir;
    const out = [];
    out.push(renderFrontMatter(ir.meta, {
      sourceRoute: ir.sourceRoute,
      exported: this.opts.exported,
      tags: this.opts.tags,
    }));
    out.push(this.header());
    const abs = this.abstract();
    if (abs) out.push(abs);
    for (const s of ir.sections) {
      const md = this.section(s, 2);
      if (md) out.push(md);
    }
    // 正文里没放到位置上的图表（例如 JATS floats-group）
    const floats = [
      ...ir.figures.map((f) => this.figure(f)),
      ...ir.tables.map((t) => this.table(t)),
    ].filter(Boolean);
    if (floats.length) out.push(`${heading(2, HEADINGS.floats)}\n\n${floats.join('\n\n')}`);
    const back = ir.back;
    for (const key of ['acknowledgements', 'dataAvailability', 'funding', 'competingInterests']) {
      const md = this.backSection(key, back[key]);
      if (md) out.push(md);
    }
    for (const s of back.other || []) {
      const md = this.section(s, 2);
      if (md) out.push(md);
    }
    const supp = this.supp();
    if (supp) out.push(supp);
    const refs = this.references();
    if (refs) out.push(refs);
    return `${out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
  }
}

/**
 * @param {object} ir ArticleIR
 * @param {{ includeImages?:boolean, now?:Date, exported?:string, tags?:string[] }} [options]
 * @returns {string}
 */
export function renderMarkdown(ir, options = {}) {
  const opts = {
    includeImages: options.includeImages !== false,
    exported: options.exported || formatExported(options.now || new Date()),
    tags: options.tags || ['paper'],
  };
  return new Renderer(ir, opts).render();
}

export { inlinesToPlain };
