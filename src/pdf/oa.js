// 开放获取判定（PRD §2.11）：默认只把 OA 的 PDF 发给第三方解析；非 OA 或拿不准的，要用户在弹窗里逐次确认。
// 免确认只有两种情况，并且 PDF 必须和文章页在同一个站点（审查 N2）：
//   ①文章许可是 CC BY（任何版本）或 CC0（审查 N7：CC BY-NC / BY-ND / BY-SA / BY-NC-SA 等仍然要确认）；
//   ②整站开放获取的出版商（BMC、SpringerOpen、Frontiers、MDPI、PLOS、eLife），页面上没有写出更严的许可。
// 其余（包括地址解析失败、缺字段）一律按非 OA。
import { detectSite, isOpenAccessHost } from '../core/sites/registry';

/** 只认 CC BY 和 CC0（normalizeLicense 的输出，或 creativecommons.org 地址） */
export function isPermissiveLicense(license) {
  const s = String(license || '').trim();
  if (/^CC-BY(-\d\.\d)?$/i.test(s) || /^CC0(-1\.0)?$/i.test(s)) return true;
  return /creativecommons\.org\/(licenses\/by\/|publicdomain\/zero\/)/i.test(s);
}

/** 写出了许可、但不是 CC BY / CC0（例如 CC-BY-NC-4.0、出版商自己的条款） */
function restrictiveLicense(license) {
  return !!String(license || '').trim() && !isPermissiveLicense(license);
}

/** @param {{pageUrl:string, pdfUrl:string, license?:string}} info */
export function isOpenAccessPdf(info) {
  try {
    if (!info) return false;
    const page = new URL(info.pageUrl);
    const pdf = new URL(info.pdfUrl);
    if (pdf.protocol !== 'https:' || pdf.username || pdf.password) return false;
    const det = detectSite(page.href);
    const sameSite = pdf.hostname === page.hostname || !!(det.site && det.site.hosts.some((h) => (h.startsWith('*.') ? pdf.hostname.endsWith(h.slice(1)) : pdf.hostname === h)));
    if (!sameSite) return false;
    if (isPermissiveLicense(info.license)) return true;
    if (restrictiveLicense(info.license)) return false;
    return !!(det.site && isOpenAccessHost(det.site, page.hostname) && isOpenAccessHost(det.site, pdf.hostname));
  } catch (_) {
    return false;
  }
}

/** PDF 可以发送：OA，或用户在弹窗里对这一篇确认过（不提供「总是允许」） */
export function uploadAllowed(info, consent) {
  return consent === true || isOpenAccessPdf(info);
}
