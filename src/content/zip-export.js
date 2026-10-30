// ZIP 导出：article.md + images/（链接改成包内路径，思路同 arxiv-md 的 ZIP 输出）。
// 图片先在页面里按 CORS 请求；被 CORS 拦下、而图片在本扩展已有权限的站点上时，再请后台代取。
// 两条路都拿不到的图片（例如 media.springernature.com 不给 CORS 头）保留原网址，并在结果里说明，不新增任何权限。
import { createZip } from '@pdf-core/output/zip.js';
import { restoreRemoteImages } from '../core/export/zip-plan';
import { MSG } from '../utils/messages';
import { originsNeededFor } from '../core/zip-image-hosts';

export const IMAGE_TIMEOUT_MS = 15000;
export const MAX_IMAGE_BYTES = 20 * 1000 * 1000;
// 消息通道有大小上限（Chrome 64 MiB，base64 再大 1/3）：总量超过就不再打包后面的图
export const MAX_ZIP_BYTES = 40 * 1000 * 1000;

export function base64FromBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function bytesFromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** 页面里直接取（CORS）；不是图片（如 PMC 的防爬验证页）就算失败 */
export async function fetchImageInPage(url, { fetchImpl = globalThis.fetch, timeoutMs = IMAGE_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { mode: 'cors', credentials: 'omit', signal: controller.signal });
    const type = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    if (!res.ok || !/^image\//i.test(type)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length && bytes.length <= MAX_IMAGE_BYTES ? bytes : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchImageViaBackground(url, sendMessage) {
  try {
    const r = await sendMessage({ type: MSG.FETCH_ASSET, url });
    return r && r.ok && r.base64 ? bytesFromBase64(r.base64) : null;
  } catch (_) {
    return null;
  }
}

/**
 * @param {{markdown:string, assets:{url:string,path:string}[]}} result exportArticle(format:'zip') 的结果
 * @returns {Promise<{bytes:Uint8Array, packed:number, total:number, failed:{url:string,path:string}[]}>}
 */
export async function buildArticleZip(result, { fetchInPage = fetchImageInPage, sendMessage = (m) => chrome.runtime.sendMessage(m), concurrency = 4 } = {}) {
  const assets = result.assets || [];
  const files = new Array(assets.length).fill(null);
  let total = 0;
  let next = 0;
  async function worker() {
    while (next < assets.length) {
      const i = next++;
      const { url, alts = [] } = assets[i];
      let bytes = null;
      // 先试页面上的地址，再试备选（PMC）；每个地址先在页面里按 CORS 取，再请后台代取
      for (const u of [url, ...alts]) {
        bytes = (await fetchInPage(u)) || (await fetchImageViaBackground(u, sendMessage));
        if (bytes) break;
      }
      if (bytes && total + bytes.length <= MAX_ZIP_BYTES) {
        total += bytes.length;
        files[i] = bytes;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, assets.length) }, worker));
  const failed = assets.filter((_, i) => !files[i]);
  const markdown = restoreRemoteImages(result.markdown, failed);
  const entries = [{ name: 'article.md', data: markdown }];
  assets.forEach((a, i) => { if (files[i]) entries.push({ name: a.path, data: files[i] }); });
  const failedHosts = [...new Set(failed.map((a) => { try { return new URL(a.url).hostname; } catch (_) { return ''; } }).filter(Boolean))];
  // 失败的图片里有没有「授予可选权限后就能取到」的（PLOS 存储桶 / media.springernature.com）
  const needsPermission = originsNeededFor(failed.flatMap((a) => [a.url, ...(a.alts || [])]));
  const permissionCount = failed.filter((a) => [a.url, ...(a.alts || [])].some((u) => originsNeededFor([u]).length)).length;
  return { bytes: createZip(entries), packed: assets.length - failed.length, total: assets.length, failed, failedHosts, needsPermission, permissionCount };
}

export function zipFilename(mdFilename) {
  return String(mdFilename || 'article.md').replace(/\.md$/i, '') + '.zip';
}
