// Inline[] → Markdown / HTML。
import { cleanLatexFormula, stripTexDocument } from '../math/clean-latex';

/** 转义会被 Markdown 误解析的字符；词内下划线（snake_case）不转义 */
export function escapeMarkdown(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/([`*[\]$])/g, '\\$1')
    .replace(/(^|[^\p{L}\p{N}])_|_(?=[^\p{L}\p{N}]|$)/gu, (m) => m.replace('_', '\\_'))
    .replace(/<(?=[A-Za-z/!?])/g, '\\<')
    .replace(/~~/g, '\\~\\~');
}

/** 行首会变成标题、引用、列表的字符 */
export function escapeLineStart(line) {
  return line
    .replace(/^(\s*)(#{1,6}\s)/, '$1\\$2')
    .replace(/^(\s*)>/, '$1\\>')
    .replace(/^(\s*)([-+]\s)/, '$1\\$2')
    .replace(/^(\s*)(\d+)([.)]\s)/, '$1$2\\$3');
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function texForMarkdown(tex) {
  return cleanLatexFormula(stripTexDocument(tex)).replace(/\$/g, '\\$');
}

function wrap(marker, inner) {
  // 强调符号不能紧贴空白：把首尾空白移到外面
  const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m[2]) return inner;
  return `${m[1]}${marker}${m[2]}${marker}${m[3]}`;
}

function safeUrl(href) {
  const u = String(href || '').trim();
  if (!/^(https?:|mailto:|ftp:)/i.test(u)) return '';
  return u.replace(/[()\s]/g, (c) => encodeURIComponent(c));
}

/**
 * @param {Array} inlines
 * @param {{ citeNumber:(rid:string)=>number|null, includeImages?:boolean }} ctx
 */
export function renderInlines(inlines, ctx) {
  let out = '';
  for (const n of inlines || []) out += renderInline(n, ctx);
  return out;
}

function renderInline(n, ctx) {
  switch (n.t) {
  case 'text':
    return escapeMarkdown(n.v.replace(/\s+/g, ' '));
  case 'em':
    return wrap('*', renderInlines(n.c, ctx));
  case 'strong':
    return wrap('**', renderInlines(n.c, ctx));
  case 'underline':
    return renderInlines(n.c, ctx);
  case 'sup': {
    const inner = renderInlines(n.c, ctx);
    // 上标里只有引用标记时直接输出 [^n]，不再包 <sup>
    if (/^(\[\^\d+\][\s,–-]*)+$/.test(inner.trim())) return inner.trim();
    return inner.trim() ? `<sup>${inner}</sup>` : '';
  }
  case 'sub': {
    const inner = renderInlines(n.c, ctx);
    return inner.trim() ? `<sub>${inner}</sub>` : '';
  }
  case 'code':
    return n.v.includes('`') ? `\`\` ${n.v} \`\`` : `\`${n.v}\``;
  case 'br':
    return '<br>';
  case 'math': {
    const tex = texForMarkdown(n.tex);
    return tex ? `$${tex}$` : '';
  }
  case 'mathImage':
    return n.src ? `![equation (image)](${safeUrl(n.src)})` : '';
  case 'link': {
    const label = renderInlines(n.c, ctx).trim();
    const url = safeUrl(n.href);
    if (!url) return label;
    if (!label || label === url) return `<${url}>`;
    return `[${label}](${url})`;
  }
  case 'cite': {
    const num = ctx.citeNumber ? ctx.citeNumber(n.rid) : null;
    const label = renderInlines(n.c, ctx).trim();
    if (!num) return label;
    ctx.cited && ctx.cited.add(num);
    // 纯数字引用（"12"、"[12]"、"(12)"）直接换成脚注；作者-年份格式保留原文再加脚注
    if (!label || /^[[(]?\d+[\])]?$/.test(label.replace(/\\/g, ''))) return `[^${num}]`;
    return `${label}[^${num}]`;
  }
  default:
    return renderInlines(n.c || [], ctx);
  }
}

/** HTML 表格单元格内的行内内容（原样 HTML 表格里 Markdown 不会被解析） */
export function renderInlinesHtml(inlines, ctx) {
  return (inlines || []).map((n) => {
    switch (n.t) {
    case 'text': return escapeHtml(n.v.replace(/\s+/g, ' '));
    case 'em': return `<em>${renderInlinesHtml(n.c, ctx)}</em>`;
    case 'strong': return `<strong>${renderInlinesHtml(n.c, ctx)}</strong>`;
    case 'sup': return `<sup>${renderInlinesHtml(n.c, ctx)}</sup>`;
    case 'sub': return `<sub>${renderInlinesHtml(n.c, ctx)}</sub>`;
    case 'code': return `<code>${escapeHtml(n.v)}</code>`;
    case 'br': return '<br>';
    case 'math': return escapeHtml(`$${texForMarkdown(n.tex)}$`);
    case 'mathImage': return n.src ? `<img src="${escapeHtml(safeUrl(n.src))}" alt="equation (image)">` : '';
    case 'link': {
      const url = safeUrl(n.href);
      const label = renderInlinesHtml(n.c, ctx);
      return url ? `<a href="${escapeHtml(url)}">${label || escapeHtml(url)}</a>` : label;
    }
    case 'cite': {
      const num = ctx.citeNumber ? ctx.citeNumber(n.rid) : null;
      if (num && ctx.cited) ctx.cited.add(num);
      const label = renderInlinesHtml(n.c, ctx);
      return num && !/^\[?\d+\]?$/.test(label.trim()) ? `${label} [${num}]` : (num ? `[${num}]` : label);
    }
    default: return renderInlinesHtml(n.c || [], ctx);
    }
  }).join('');
}
