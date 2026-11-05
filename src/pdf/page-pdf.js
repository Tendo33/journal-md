// PDF 解析前先由扩展后台下载文章 PDF（带用户自己的 Cookie、走用户自己的网络），再上传给解析服务。
// 订阅文章的 PDF 只有用户（机构 IP、登录状态）能下载，解析服务自己按链接去取一定失败。
// 只下载已支持站点上的 https 地址（这些域名本来就在 host_permissions 里）；不是 PDF（登录页、人机验证页）就放弃，由调用方退回只发链接。
import { isSupportedHost } from '../core/sites/registry';
import { PADDLEOCR_MAX_UPLOAD_BYTES } from '@pdf-core/providers/paddleocr.js';

export const PAGE_PDF_TIMEOUT_MS = 120000;

/** 只下载已支持站点上的 https 地址 */
export function pagePdfAllowed(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && isSupportedHost(u.hostname);
  } catch (_) {
    return false;
  }
}

/** 边读边数，超过上限就停（没有 Content-Length 时也不会把大文件整个读进内存） */
async function readCapped(res, max) {
  const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
  if (!reader) {
    const b = new Uint8Array(await res.arrayBuffer());
    return b.length > max ? null : b;
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      try { await reader.cancel(); } catch (_) { /* 忽略 */ }
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

/**
 * @returns {Promise<{ok:true, blob:Blob} | {ok:false, reason:'not_allowed'|'http'|'too_large'|'not_pdf'|'timeout'|'network', status?:number}>}
 */
export async function downloadPagePdf(url, { fetchImpl = globalThis.fetch, timeoutMs = PAGE_PDF_TIMEOUT_MS, maxBytes = PADDLEOCR_MAX_UPLOAD_BYTES } = {}) {
  if (!pagePdfAllowed(url)) return { ok: false, reason: 'not_allowed' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { credentials: 'include', redirect: 'follow', signal: controller.signal, headers: { Accept: 'application/pdf' } });
    if (!res.ok) return { ok: false, reason: 'http', status: res.status };
    const len = Number(res.headers && res.headers.get && res.headers.get('content-length'));
    if (len > maxBytes) return { ok: false, reason: 'too_large' };
    const buf = await readCapped(res, maxBytes);
    if (!buf) return { ok: false, reason: 'too_large' };
    // %PDF 魔数：没有权限时出版商常返回 200 的登录页或预览页
    if (!(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) return { ok: false, reason: 'not_pdf' };
    return { ok: true, blob: new Blob([buf], { type: 'application/pdf' }) };
  } catch (_) {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
