// 导出结果 → 用户可读的状态和提示（popup 和页内 toast 共用，保证说法一致，R19）。
import { t } from '../../config/i18n';

export function errorText(lang, error, extra = {}) {
  const key = `err_${error || 'unknown'}`;
  const text = t(lang, key, { site: extra.siteName || '' });
  return text === key ? t(lang, 'err_unknown') : text;
}

/** @returns {{status:string, notes:string[], route?:string}} */
export function describeResult(result, lang, action) {
  if (!result || !result.ok) return { status: errorText(lang, result && result.error, result || {}), notes: [] };
  let status = '';
  if (action === 'download' || result.saved) status = t(lang, 'statusSaved', { filename: result.filename });
  else if (action === 'copy' || result.copied) status = t(lang, 'statusCopied', { count: result.markdown.length.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en') });
  const notes = [];
  for (const n of result.notices || []) {
    if (n.code === 'jats_fallback') {
      const reason = t(lang, `noticeJats_${n.reason}`);
      notes.push(result.abstractOnly ? reason : `${reason} ${t(lang, 'noticeFallbackDom')}`);
    } else if (n.code === 'pubmed_fulltext') {
      notes.push(t(lang, 'noticePubmedFulltext', { pmcid: (result.meta && result.meta.pmcid) || '' }));
    } else if (n.code === 'equation_image') {
      notes.push(t(lang, 'noticeEquationImage'));
    } else if (n.code === 'abstract_only') {
      notes.push(t(lang, 'noticeAbstractOnly'));
    }
  }
  const route = result.route === 'jats-europepmc' ? t(lang, 'routeUsedJats') : t(lang, 'routeUsedDom');
  return { status, notes, route };
}
