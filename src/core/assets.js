// 图片和附件链接。Europe PMC 的 /articles/{PMCID}/bin/{file} 现在返回 403/520（QA JM-02），
// 改用 PMC 的 instance 地址：2026-10-30 实测
//   https://pmc.ncbi.nlm.nih.gov/articles/instance/7095418/bin/41586_2020_2012_Fig1_HTML.jpg
//   → 302 → cdn.ncbi.nlm.nih.gov/pmc/blobs/…，200 image/jpeg。
// 去掉扩展名的同一地址返回 404，所以无扩展名的图片补 .jpg。
// 这些链接只写进 Markdown，扩展从不下载它们。
import { normalizePmcid } from './ids';

export function pmcAssetUrl(pmcid, href, kind = 'image') {
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return rewriteAssetUrl(href);
  const id = normalizePmcid(pmcid);
  if (!id) return '';
  const file = kind === 'image' && !/\.[a-z0-9]{2,4}$/i.test(href) ? `${href}.jpg` : href;
  return `https://pmc.ncbi.nlm.nih.gov/articles/instance/${id.slice(3)}/bin/${encodeURI(file).replace(/\(/g, '%28').replace(/\)/g, '%29')}`;
}

/** 把已知打不开的 Europe PMC bin 地址改写成 PMC instance 地址；其他地址原样返回 */
export function rewriteAssetUrl(url) {
  const m = String(url || '').match(/^https?:\/\/(?:www\.)?europepmc\.org\/articles\/(PMC\d+)\/bin\/([^?#]+)$/i);
  if (!m) return url;
  return `https://pmc.ncbi.nlm.nih.gov/articles/instance/${m[1].slice(3)}/bin/${m[2]}`;
}
