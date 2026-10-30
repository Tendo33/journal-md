// 导出失败原因代码（界面文案见 _locales 的 err_* 键）。
export const ERR = Object.freeze({
  UNSUPPORTED_PAGE: 'unsupported_page',
  SITE_PLANNED: 'site_planned',
  SITE_DISABLED: 'site_disabled',
  NOT_ARTICLE: 'not_article',
  NO_CONTENT: 'no_content',
  CONTENT_UNREACHABLE: 'content_unreachable',
  DOWNLOAD_FAILED: 'download_failed',
  CLIPBOARD_FAILED: 'clipboard_failed',
  UNKNOWN: 'unknown',
});

// 导出成功但需要告诉用户的情况
export const NOTICE = Object.freeze({
  JATS_FALLBACK: 'jats_fallback', // L1 失败，回退到页面 DOM；reason: timeout / not_available / network / http / parse / mismatch
  ABSTRACT_ONLY: 'abstract_only',
  PUBMED_FULLTEXT: 'pubmed_fulltext', // PubMed 页通过 Europe PMC 拿到了全文
  EQUATION_IMAGE: 'equation_image',
});

export function errorCode(e) {
  if (e && typeof e.code === 'string' && Object.values(ERR).includes(e.code)) return e.code;
  return ERR.UNKNOWN;
}
