// DOI / PMID / PMCID 识别与规范化。

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>]+)/i;

export function normalizeDoi(value) {
  if (!value) return '';
  let s = String(value).trim();
  try { s = decodeURIComponent(s); } catch (_) { /* 保留原文 */ }
  s = s.replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  const m = s.match(DOI_RE);
  if (!m) return '';
  return m[1].replace(/[.,;:)\]]+$/, '');
}

export function normalizePmcid(value) {
  const m = String(value || '').match(/\bPMC\s*(\d{1,10})\b/i) || String(value || '').match(/^\s*(\d{1,10})\s*$/);
  return m ? `PMC${m[1]}` : '';
}

export function normalizePmid(value) {
  const m = String(value || '').match(/\b(\d{1,9})\b/);
  return m ? m[1] : '';
}

export function extractYear(value) {
  const m = String(value || '').match(/\b(1[89]\d\d|20\d\d)\b/);
  return m ? Number(m[1]) : null;
}
