// 导出失败原因代码（界面文案见 _locales 的 err_* 键）。
export const ERR = Object.freeze({
  UNSUPPORTED_PAGE: 'unsupported_page',
  SITE_PLANNED: 'site_planned',
  SITE_DISABLED: 'site_disabled',
  NOT_ARTICLE: 'not_article',
  NO_CONTENT: 'no_content',
  ABSTRACT_ONLY: 'abstract_only', // 页面上只有摘要（多半是没有订阅权限），默认不导出
  PAGE_CHANGED: 'page_changed',
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
  ELSEVIER_FULLTEXT: 'elsevier_fulltext', // 全文来自 Elsevier 全文接口（用户的 Key + 机构网络）
  ELSEVIER_FALLBACK: 'elsevier_fallback', // Elsevier 接口没给全文；reason: auth / not_entitled / not_found / quota / mismatch / parse / timeout / network / http
  OPEN_VERSION: 'open_version', // 本页只有摘要，全文来自别处的免费版本；kind / version / server / url
});

export function errorCode(e) {
  if (e && typeof e.code === 'string' && Object.values(ERR).includes(e.code)) return e.code;
  return ERR.UNKNOWN;
}
