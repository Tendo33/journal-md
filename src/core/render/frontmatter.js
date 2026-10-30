// YAML front matter（PRD §2.3）。字段顺序固定；空的可选字段不输出。

const PLAIN_SAFE = /^[\p{L}\p{N}][\p{L}\p{N} .'()\-–/]*$/u;
const RESERVED = /^(true|false|yes|no|on|off|null|~|y|n)$/i;

/** YAML 标量：安全的纯文本原样输出，其余用 JSON 双引号（JSON 字符串是合法 YAML） */
export function yamlScalar(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const s = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '""';
  if (PLAIN_SAFE.test(s) && !RESERVED.test(s) && !/^[\d.+-]/.test(s) && !/[:#]/.test(s)) return s;
  return JSON.stringify(s);
}

export function yamlList(values) {
  return `[${(values || []).map(yamlScalar).join(', ')}]`;
}

const pad = (n) => String(n).padStart(2, '0');

/** 本地时间 + 时区偏移，精确到分：2026-10-28T21:40+08:00 */
export function formatExported(date = new Date(), offsetMinutes = -date.getTimezoneOffset()) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
    + `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * @param {object} meta ArticleIR.meta
 * @param {{sourceRoute:string, exported:string, tags?:string[]}} extra
 */
export function renderFrontMatter(meta, { sourceRoute, exported, tags = ['paper'] }) {
  const lines = ['---'];
  const add = (key, val) => { lines.push(`${key}: ${val}`); };
  add('title', yamlScalar(meta.title));
  if (meta.authors && meta.authors.length) add('authors', yamlList(meta.authors.map((a) => a.name)));
  if (meta.journal) add('journal', yamlScalar(meta.journal));
  if (meta.year) add('year', yamlScalar(Number(meta.year)));
  if (meta.doi) add('doi', yamlScalar(meta.doi));
  if (meta.pmid) add('pmid', JSON.stringify(String(meta.pmid)));
  if (meta.pmcid) add('pmcid', yamlScalar(meta.pmcid));
  if (meta.license) add('license', yamlScalar(meta.license));
  if (meta.url) add('url', yamlScalar(meta.url));
  add('source_route', yamlScalar(sourceRoute));
  if (meta.abstractOnly) add('abstract_only', 'true');
  add('exported', exported);
  add('tags', yamlList(tags));
  lines.push('---');
  return lines.join('\n');
}
