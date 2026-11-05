// pdf.js 文档 → text-layout 需要的文字片段。pdf.js 由调用方传入（扩展里是按需注入的 pdf-fast.js，测试里是 mock）。
export const MAX_FAST_PAGES = 300;

// TeX 的粗体：NimbusRomNo9L-Medi、CMBX10、*-Bd；其他：Bold / Black / Heavy / Semibold / Demi
const BOLD_FONT = /bold|black|heavy|semibold|demi|-medi\b|medium|cmbx|\bbx\d|-bd\b|,bd\b/i;

/**
 * @param {object} pdf pdf.js 的 PDFDocumentProxy
 * @returns {Promise<{width:number, height:number, items:object[]}[]>}
 */
export async function extractPages(pdf, { maxPages = MAX_FAST_PAGES } = {}) {
  const n = Math.min(pdf.numPages, maxPages);
  const pages = [];
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    // 字体真名（判断粗体）要等操作列表解析完才在 commonObjs 里；拿不到就不判断粗体
    let fontsReady = false;
    try { await page.getOperatorList(); fontsReady = true; } catch (_) { /* 忽略 */ }
    const bold = new Map();
    const isBold = (fontName) => {
      if (!fontsReady || !fontName) return false;
      if (!bold.has(fontName)) {
        let name = '';
        try { const f = page.commonObjs.get(fontName); name = (f && (f.name || f.loadedName)) || ''; } catch (_) { name = ''; }
        bold.set(fontName, BOLD_FONT.test(name));
      }
      return bold.get(fontName);
    };
    const items = [];
    for (const it of tc.items || []) {
      if (!it || typeof it.str !== 'string' || !it.transform) continue;
      const [a, b, c, d, e, f] = it.transform;
      // 旋转的文字（页边的 arXiv 编号、水印、竖排表头）不是正文
      if (Math.abs(b) > Math.abs(a) * 0.2 || Math.abs(c) > Math.abs(d) * 0.2) continue;
      const size = Math.hypot(c, d) || it.height || 0;
      items.push({ str: it.str, x: e, y: f, w: it.width || 0, size, bold: isBold(it.fontName) });
    }
    pages.push({ width: viewport.width, height: viewport.height, items });
    if (page.cleanup) page.cleanup();
  }
  return pages;
}
