// ZIP 打包时页面里被 CORS 拦下的图片，由后台代取。只取 https、并且主机属于已支持站点（manifest 已授权）的图片，
// 不带 Cookie，只收 image/*，单张不超过 20 MB。不为此新增任何权限。
import { isSupportedHost } from '../core/sites/registry';

export const ASSET_TIMEOUT_MS = 15000;
export const MAX_ASSET_BYTES = 20 * 1000 * 1000;

export function assetAllowed(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && isSupportedHost(u.hostname);
  } catch (_) {
    return false;
  }
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** @returns {Promise<{ok:true, base64:string, type:string} | {ok:false, error:string}>} */
export async function fetchAsset(url, { fetchImpl = globalThis.fetch, timeoutMs = ASSET_TIMEOUT_MS } = {}) {
  if (!assetAllowed(url)) return { ok: false, error: 'not_allowed' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { credentials: 'omit', signal: controller.signal });
    const type = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    if (!res.ok || !/^image\//i.test(type)) return { ok: false, error: 'not_image' };
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_ASSET_BYTES) return { ok: false, error: 'too_large' };
    return { ok: true, base64: toBase64(bytes), type };
  } catch (_) {
    return { ok: false, error: 'network' };
  } finally {
    clearTimeout(timer);
  }
}
