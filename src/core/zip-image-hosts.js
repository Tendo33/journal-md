// ZIP 打包图片用到的两个图片 CDN（Simon 2026-10-30 18:06：安装时授予，写在 host_permissions 里，使用时不再申请，见 docs/permissions.md）。
// 这两个 CDN 不发 CORS 头，页面里取不到，由扩展后台凭主机权限代取：
//   - PLOS：journals.plos.org/<journal>/article/figure/image?…（图）和 /article/file?type=thumbnail…（公式图）一律 302 到下面这个
//     Cloudflare R2 存储桶（2026-10-30 实测：plosone / ploscompbiol / plosmedicine，各种 size、download 地址都一样）
//   - Springer Link / BMC / Nature：图片在 media.springernature.com
// 其他图片（eLife iiif、PMC CDN、Frontiers、MDPI）不需要额外权限。

export const PLOS_IMAGE_ORIGIN = 'https://corpus-prod.f505aadad1e46610c8f8563037eb3c4b.r2.cloudflarestorage.com/*';
export const SPRINGER_IMAGE_ORIGIN = 'https://media.springernature.com/*';
export const ZIP_IMAGE_ORIGINS = [PLOS_IMAGE_ORIGIN, SPRINGER_IMAGE_ORIGIN];

const R2_HOST = 'corpus-prod.f505aadad1e46610c8f8563037eb3c4b.r2.cloudflarestorage.com';

/** 一个图片地址落在哪个图片 CDN 的主机权限下（match pattern）；不是这两个 CDN 时返回 '' */
export function originNeededFor(url) {
  let u;
  try { u = new URL(url); } catch (_) { return ''; }
  if (u.protocol !== 'https:') return '';
  // 图（/article/figure/image）和公式缩略图（/article/file?type=thumbnail）都 302 到同一个存储桶
  if (u.hostname === 'journals.plos.org' && /\/article\/(figure\/image|file)$/.test(u.pathname)) return PLOS_IMAGE_ORIGIN;
  if (u.hostname === R2_HOST) return PLOS_IMAGE_ORIGIN;
  if (u.hostname === 'media.springernature.com') return SPRINGER_IMAGE_ORIGIN;
  return '';
}
