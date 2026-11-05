// 导出结果 → 用户可读的状态和提示（popup 和页内 toast 共用，保证说法一致，R19）。
import { t } from '../../config/i18n';

export function errorText(lang, error, extra = {}) {
  const key = `err_${error || 'unknown'}`;
  const text = t(lang, key, { site: extra.siteName || '' });
  return text === key ? t(lang, 'err_unknown') : text;
}

/** 全文来自别处的免费版本：哪个版本、可能和正式发表版本不同 */
export function openVersionText(lang, n) {
  if (n.kind === 'preprint') {
    return t(lang, 'noticeOpenPreprint', { server: n.server === 'medrxiv' ? 'medRxiv' : 'bioRxiv', version: n.version ? ` v${n.version}` : '' });
  }
  return t(lang, n.version === 'acceptedVersion' ? 'noticeOpenPmcAccepted' : 'noticeOpenPmc');
}

/** 弹窗里列出的免费版本链接文字 */
export function openLinkText(lang, l) {
  const where = l.kind === 'arxiv' ? 'arXiv' : l.kind === 'preprint' ? (l.repository || 'bioRxiv') : (l.repository || hostOf(l.url));
  const version = t(lang, `openVersion_${l.version || 'unknown'}`);
  return t(lang, l.kind === 'arxiv' ? 'openLinkArxiv' : 'openLink', { where, version: version.startsWith('openVersion_') ? '' : version });
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
}

/** @returns {{status:string, notes:string[], route?:string}} */
export function describeResult(result, lang, action) {
  if (!result || !result.ok) return { status: errorText(lang, result && result.error, result || {}), notes: [] };
  let status = '';
  if (action === 'download' || result.saved) status = t(lang, 'statusSaved', { filename: result.filename });
  else if (action === 'copy' || result.copied) status = t(lang, 'statusCopied', { count: result.markdown.length.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en') });
  const notes = [];
  if (result.zip && result.zip.total) {
    const z = result.zip;
    const hosts = (z.failedHosts || []).slice(0, 3).join(', ') || '?';
    const key = z.packed === z.total ? 'noticeZipAll' : z.packed === 0 ? 'noticeZipNone' : 'noticeZipPartial';
    notes.push(t(lang, key, { packed: z.packed, total: z.total, failed: z.total - z.packed, hosts }));
  }
  for (const n of result.notices || []) {
    if (n.code === 'jats_fallback') {
      const reason = t(lang, `noticeJats_${n.reason}`);
      notes.push(result.abstractOnly ? reason : `${reason} ${t(lang, 'noticeFallbackDom')}`);
    } else if (n.code === 'pubmed_fulltext') {
      notes.push(t(lang, 'noticePubmedFulltext', { pmcid: (result.meta && result.meta.pmcid) || '' }));
    } else if (n.code === 'equation_image') {
      notes.push(t(lang, 'noticeEquationImage'));
    } else if (n.code === 'open_version') {
      notes.push(openVersionText(lang, n));
    } else if (n.code === 'abstract_only') {
      notes.push(t(lang, 'noticeAbstractOnly'));
    }
  }
  let route = t(lang, 'routeUsedDom');
  if (result.route === 'jats-preprint') route = t(lang, 'routeUsedPreprint');
  else if (result.route === 'jats-europepmc') route = t(lang, 'routeUsedJats');
  else if (/^jats-/.test(result.route || '')) route = t(lang, 'routeUsedSiteXml');
  return { status, notes, route };
}
