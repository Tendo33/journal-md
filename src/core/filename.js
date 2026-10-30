// 文件名模板：{title} {year} {journal} {firstAuthor} {doi} {pmid} {pmcid}。
// 只去掉文件系统非法字符，不把中文/重音字母换成下划线（修 arxiv-md downloadBlob 的 ASCII 化问题，见 cross-browser-plan §5 #3）。

export const DEFAULT_FILENAME_TEMPLATE = '{title} ({year})';
export const FILENAME_TOKENS = ['title', 'year', 'journal', 'firstAuthor', 'doi', 'pmid', 'pmcid'];

export function sanitizeFilename(name, maxLength = 150) {
  const cleaned = Array.from(String(name || ''), (ch) => (ch.charCodeAt(0) < 32 ? ' ' : ch)).join('')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  const chars = Array.from(cleaned);
  return (chars.length > maxLength ? chars.slice(0, maxLength).join('') : cleaned).replace(/[\s.]+$/, '');
}

function tokenValues(meta) {
  const first = meta.authors && meta.authors[0] ? meta.authors[0].name : '';
  return {
    title: meta.title || '',
    year: meta.year ? String(meta.year) : '',
    journal: meta.journal || '',
    firstAuthor: first,
    doi: (meta.doi || '').replace(/\//g, '_'),
    pmid: meta.pmid || '',
    pmcid: meta.pmcid || '',
  };
}

/** 按模板生成 .md 文件名；空 token 连同紧挨着的空括号一起去掉 */
export function buildFilename(meta, template = DEFAULT_FILENAME_TEMPLATE, extension = 'md') {
  const values = tokenValues(meta || {});
  const tpl = String(template || '').trim() || DEFAULT_FILENAME_TEMPLATE;
  let name = tpl.replace(/\{(\w+)\}/g, (m, key) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : m));
  name = name.replace(/\(\s*\)|\[\s*\]/g, '').replace(/\s*[-_–]\s*$/g, '');
  name = sanitizeFilename(name);
  if (!name) name = sanitizeFilename(values.pmcid || values.pmid || values.doi || 'article');
  return `${name}.${extension}`;
}
