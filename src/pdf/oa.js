// 开放获取判定（PRD §2.11）：默认只把 OA 的 PDF 发给第三方解析；非 OA 或拿不准的，要用户在弹窗里逐次确认。
// 判为 OA 的只有两种：①整站开放获取的出版商（BMC、SpringerOpen、Frontiers、MDPI、PLOS、eLife），
// PDF 也在同一个站点上；②页面声明了 Creative Commons 许可或 CC0。其余（包括地址解析失败、缺字段）一律按非 OA。
import { detectSite, isOpenAccessHost } from '../core/sites/registry';

export function isCreativeCommons(license) {
  return /^CC(0|-BY)\b/i.test(String(license || '').trim()) || /creativecommons\.org\/(licenses|publicdomain)\//i.test(String(license || ''));
}

/** @param {{pageUrl:string, pdfUrl:string, license?:string}} info */
export function isOpenAccessPdf(info) {
  try {
    if (!info) return false;
    const page = new URL(info.pageUrl);
    const pdf = new URL(info.pdfUrl);
    if (pdf.protocol !== 'https:' || pdf.username || pdf.password) return false;
    if (isCreativeCommons(info.license)) return true;
    const det = detectSite(page.href);
    return !!(det.site && isOpenAccessHost(det.site, page.hostname) && isOpenAccessHost(det.site, pdf.hostname));
  } catch (_) {
    return false;
  }
}

/** PDF 可以发送：OA，或用户在弹窗里对这一篇确认过（不提供「总是允许」） */
export function uploadAllowed(info, consent) {
  return consent === true || isOpenAccessPdf(info);
}
