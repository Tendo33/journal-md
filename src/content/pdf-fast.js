// PDF 快速解析（文字层）：弹窗点「快速解析 PDF」时才注入到文章页（pdf.js 约 1 MB，不随 content script 加载）。
// 在页面里下载 PDF（和用户点开 PDF 一样，带用户自己的登录状态），用 pdf.js 读文字层，不发给任何第三方服务。
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
import { extractPages } from '../pdf/text-extract';
import { layoutPdfText } from '../pdf/text-layout';
import { renderFrontMatter, formatExported } from '../core/render/frontmatter';
import { buildFilename } from '../core/filename';
import { loadSettings } from '../config/settings';
import { MSG } from '../utils/messages';

// 不另开 worker（content script 不能从扩展地址创建 worker）：pdf.js 发现 globalThis.pdfjsWorker 就在当前线程里运行
globalThis.pdfjsWorker = pdfjsWorker;

export const PDF_FAST_MAX_BYTES = 80 * 1000 * 1000;
export const PDF_FAST_TIMEOUT_MS = 120000;
export const PDF_TEXT_ROUTE = 'pdf-text';

async function downloadPdf(url) {
  const target = new URL(url, location.href);
  if (target.protocol !== 'https:') return { ok: false, error: 'pdf_not_https' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDF_FAST_TIMEOUT_MS);
  try {
    // 同站的 PDF 带 Cookie（和用户点开 PDF 一样）；别的站点的 PDF 要对方允许跨站读取
    const res = await fetch(target.href, { credentials: target.origin === location.origin ? 'include' : 'omit', signal: controller.signal });
    if (!res.ok) return { ok: false, error: 'pdf_http', status: res.status };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > PDF_FAST_MAX_BYTES) return { ok: false, error: 'pdf_too_large' };
    if (!(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) return { ok: false, error: 'pdf_not_pdf' };
    return { ok: true, data: buf };
  } catch (_) {
    return { ok: false, error: controller.signal.aborted ? 'pdf_timeout' : 'pdf_network' };
  } finally {
    clearTimeout(timer);
  }
}

/** @param {{pdfUrl:string, meta:object}} req */
export async function runFastPdf(req) {
  const got = await downloadPdf(req.pdfUrl);
  if (!got.ok) return got;
  let pages;
  try {
    // 不执行 PDF 里的脚本、不用 eval 编译字体
    const task = pdfjs.getDocument({ data: got.data, isEvalSupported: false, enableScripting: false, disableFontFace: true, verbosity: 0 });
    try {
      pages = await extractPages(await task.promise);
    } finally {
      task.destroy();
    }
  } catch (e) {
    // detail 只给调试用（界面按 error 显示文案）
    return { ok: false, error: 'pdf_parse', detail: String((e && e.message) || e).slice(0, 200) };
  }
  const r = layoutPdfText(pages);
  // 扫描版 PDF 没有文字层：每页不到 100 个字就当没有
  if (r.chars < Math.max(200, r.pages * 100)) return { ok: false, error: 'pdf_no_text', pages: r.pages };
  const meta = req.meta && typeof req.meta === 'object' ? req.meta : {};
  const settings = await loadSettings();
  const fm = renderFrontMatter({ ...meta, url: location.href }, { sourceRoute: PDF_TEXT_ROUTE, exported: formatExported(new Date()) });
  const head = [`# ${meta.title || document.title}`];
  if (meta.authors && meta.authors.length) head.push(`**Authors:** ${meta.authors.map((a) => a.name || a).join(', ')}`);
  head.push('> **PDF text layer / PDF 文字层** — converted from the PDF\'s text layer without OCR: formulas, tables and figures may be incomplete.');
  const markdown = `${fm}\n\n${head.join('\n\n')}\n\n${r.markdown}\n`;
  const filename = buildFilename(meta, settings.filenameTemplate).replace(/\.md$/, ' (PDF).md');
  const dl = await chrome.runtime.sendMessage({ type: MSG.DOWNLOAD, markdown, filename });
  if (!dl || !dl.ok) return { ok: false, error: 'download_failed' };
  return { ok: true, filename, pages: r.pages, headings: r.headings, refs: r.refs, twoColumn: r.twoColumn };
}

if (!globalThis.__journalMdPdfFastLoaded) {
  globalThis.__journalMdPdfFastLoaded = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== MSG.PDF_FAST) return false;
    runFastPdf(message).then(sendResponse, () => sendResponse({ ok: false, error: 'pdf_parse' }));
    return true;
  });
}
