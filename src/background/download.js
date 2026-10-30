// 下载适配层（思路移植自 arxiv-md pdf-parse-core/src/output/save.js，见 cross-browser-plan §1）：
// Chrome MV3 service worker 没有 URL.createObjectURL → data URL；Firefox 后台（event page）有 → blob URL。
// 文件名保留 Unicode，只在 filename.js 里去掉非法字符。

export function canUseBlobUrl(env = globalThis) {
  return !!(env.URL && typeof env.URL.createObjectURL === 'function' && typeof env.Blob === 'function');
}

function utf8Base64(text) {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** @returns {{url:string, revoke:()=>void, kind:'blob'|'data'}} */
export function markdownDownloadUrl(markdown, env = globalThis) {
  if (canUseBlobUrl(env)) {
    const url = env.URL.createObjectURL(new env.Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    return { url, kind: 'blob', revoke: () => { try { env.URL.revokeObjectURL(url); } catch (_) { /* noop */ } } };
  }
  return { url: `data:text/markdown;charset=utf-8;base64,${utf8Base64(markdown)}`, kind: 'data', revoke: () => {} };
}

/**
 * @param {{markdown:string, filename:string}} payload
 * @param {{ downloads?:object, env?:object, runtime?:object, setTimeout?:Function }} deps
 * @returns {Promise<{ok:boolean, id?:number, error?:string}>}
 */
export function downloadMarkdown({ markdown, filename }, { downloads = chrome.downloads, env = globalThis, runtime = chrome.runtime, setTimeoutFn = setTimeout } = {}) {
  if (typeof markdown !== 'string' || !markdown) return Promise.resolve({ ok: false, error: 'empty' });
  const name = typeof filename === 'string' && filename.trim() ? filename : 'article.md';
  const { url, revoke, kind } = markdownDownloadUrl(markdown, env);
  return new Promise((resolve) => {
    try {
      downloads.download({ url, filename: name, saveAs: false, conflictAction: 'uniquify' }, (id) => {
        const err = runtime && runtime.lastError;
        if (kind === 'blob') setTimeoutFn(revoke, 60000);
        if (err || id === undefined) resolve({ ok: false, error: (err && err.message) || 'download_failed' });
        else resolve({ ok: true, id });
      });
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}
