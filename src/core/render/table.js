// 表格：没有合并单元格 → GFM；有 rowspan/colspan → 原样 HTML <table>（PRD §2.3）。
import { renderInlines, renderInlinesHtml } from './inline';

export function needsHtml(table) {
  return table.rows.some((r) => r.cells.some((c) => (c.colspan || 1) > 1 || (c.rowspan || 1) > 1));
}

function gfmCell(inlines, ctx) {
  return renderInlines(inlines, ctx)
    .replace(/\n+/g, '<br>')
    .replace(/\|/g, '\\|')
    .trim();
}

export function renderGfmTable(table, ctx) {
  const rows = table.rows.filter((r) => r.cells.length);
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.cells.length));
  // 表头：开头连续的全 th 行合并成一行（GFM 只支持一行表头）；没有 th 就用第一行
  let headerCount = 0;
  while (headerCount < rows.length - 1 && rows[headerCount].cells.every((c) => c.header)) headerCount += 1;
  if (headerCount === 0) headerCount = 1;
  const cellsOf = (r) => {
    const cells = r.cells.map((c) => gfmCell(c.inlines, ctx));
    while (cells.length < width) cells.push('');
    return cells;
  };
  const header = rows.slice(0, headerCount).map(cellsOf)
    .reduce((acc, cells) => acc.map((v, i) => [v, cells[i]].filter(Boolean).join(' / ')));
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [
    line(header),
    line(header.map(() => '---')),
    ...rows.slice(headerCount).map((r) => line(cellsOf(r))),
  ].join('\n');
}

export function renderHtmlTable(table, ctx) {
  const out = ['<table>'];
  for (const r of table.rows) {
    const cells = r.cells.map((c) => {
      const tag = c.header ? 'th' : 'td';
      const attrs = `${(c.colspan || 1) > 1 ? ` colspan="${c.colspan}"` : ''}${(c.rowspan || 1) > 1 ? ` rowspan="${c.rowspan}"` : ''}`;
      return `<${tag}${attrs}>${renderInlinesHtml(c.inlines, ctx).trim()}</${tag}>`;
    });
    out.push(`<tr>${cells.join('')}</tr>`);
  }
  out.push('</table>');
  return out.join('\n');
}

export function renderTableBody(table, ctx) {
  if (!table.rows || !table.rows.length) return '';
  return needsHtml(table) ? renderHtmlTable(table, ctx) : renderGfmTable(table, ctx);
}
