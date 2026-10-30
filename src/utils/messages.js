// 扩展内部消息类型（popup / content script / background）。
export const MSG = Object.freeze({
  PING: 'JMD_PING',
  INSPECT: 'JMD_INSPECT', // popup → content：页面识别结果
  EXPORT: 'JMD_EXPORT', // popup / background → content：导出；action: none | download | copy
  FETCH_JATS: 'JMD_FETCH_JATS', // content → background：取 Europe PMC fullTextXML
  PROBE_JATS: 'JMD_PROBE_JATS', // popup → background：只问 JATS 是否可用
  DOWNLOAD: 'JMD_DOWNLOAD', // content → background：下载 .md
});

export const ACTIONS = Object.freeze({ NONE: 'none', DOWNLOAD: 'download', COPY: 'copy' });
