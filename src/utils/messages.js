// 扩展内部消息类型（popup / content script / background）。
export const MSG = Object.freeze({
  PING: 'JMD_PING',
  INSPECT: 'JMD_INSPECT', // popup → content：页面识别结果
  EXPORT: 'JMD_EXPORT', // popup / background → content：导出；action: none | download | copy
  FETCH_JATS: 'JMD_FETCH_JATS', // content → background：取 Europe PMC fullTextXML
  LOOKUP_DOI: 'JMD_LOOKUP_DOI', // content → background：出版商页面按 DOI 查 Europe PMC 的 PMCID（只在导出时）
  FIND_OPEN_VERSION: 'JMD_FIND_OPEN_VERSION', // content → background：本页只有摘要，按 DOI 找合法的免费全文（Unpaywall、bioRxiv / medRxiv）
  DOWNLOAD: 'JMD_DOWNLOAD', // content → background：下载 .md
  DOWNLOAD_ZIP: 'JMD_DOWNLOAD_ZIP', // content → background：下载 ZIP（base64）
  PDF_START: 'JMD_PDF_START', // popup → background：开始 PDF 解析（带本次的 OA 确认）
  PDF_FAST: 'JMD_PDF_FAST', // popup → 注入的 pdf-fast.js：在文章页里用 pdf.js 读 PDF 文字层（不经过第三方）
  PDF_TEST: 'JMD_PDF_TEST', // options → background：测试后端 Token（不提交任务）
  FETCH_ASSET: 'JMD_FETCH_ASSET', // content → background：页面里被 CORS 拦下的图片，只限已授权的支持站点
});

export const ACTIONS = Object.freeze({ NONE: 'none', DOWNLOAD: 'download', COPY: 'copy', ZIP: 'zip' });
