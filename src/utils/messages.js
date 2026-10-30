// 扩展内部消息类型（popup / content script / background）。
export const MSG = Object.freeze({
  PING: 'JMD_PING',
  INSPECT: 'JMD_INSPECT', // popup → content：页面识别结果
  EXPORT: 'JMD_EXPORT', // popup / background → content：导出；action: none | download | copy
  FETCH_JATS: 'JMD_FETCH_JATS', // content → background：取 Europe PMC fullTextXML
  LOOKUP_DOI: 'JMD_LOOKUP_DOI', // content → background：出版商页面按 DOI 查 Europe PMC 的 PMCID（只在导出时）
  DOWNLOAD: 'JMD_DOWNLOAD', // content → background：下载 .md
  DOWNLOAD_ZIP: 'JMD_DOWNLOAD_ZIP', // content → background：下载 ZIP（base64）
  FETCH_ASSET: 'JMD_FETCH_ASSET', // content → background：页面里被 CORS 拦下的图片，只限已授权的支持站点
});

export const ACTIONS = Object.freeze({ NONE: 'none', DOWNLOAD: 'download', COPY: 'copy', ZIP: 'zip' });
