// PDF 解析后端（PRD §2.11）：PaddleOCR 默认，MinerU 可选。实现来自 vendored pdf-parse-core（arxiv-md b2dc3a0）。
// Simon 2026-10-30 18:06：两个后端的域名都在安装时授予（host_permissions），使用时不再申请权限，
// 所以 PaddleOCR 也按 permissionMode: 'install' 重新定义一次（内核文件不改，见 vendor/pdf-parse-core/README.md）。
// PaddleOCR 另外支持直接上传浏览器下载好的 PDF（input.file，见 src/pdf/page-pdf.js）：订阅文章的 PDF 星河自己下载不到。
// 内核的 submit 只给 arXiv 上传，所以这里补一条上传路径；没有 file 时仍走内核（传链接）。
// MinerU 的文件上传要另一个存储域名的权限，暂不支持，仍只传链接。
import { createRegistry } from '@pdf-core/registry.js';
import { paddleocrProvider, mapPaddleError, PADDLEOCR_JOBS_URL, PADDLEOCR_DEFAULT_MODEL, PADDLEOCR_UPLOAD_TIMEOUT_MS } from '@pdf-core/providers/paddleocr.js';
import { mineruProvider } from '@pdf-core/providers/mineru.js';
import { ParseError, readErrorResponse } from '@pdf-core/errors.js';
import { fetchWithTimeout } from '@pdf-core/http.js';
import { withKeepAlive } from '@pdf-core/keepalive.js';

export const DEFAULT_PDF_PROVIDER = 'paddleocr';

function pdfFileName(url) {
  const last = (String(url).split(/[?#]/)[0].split('/').pop() || 'paper').replace(/[^\w.-]/g, '_');
  return /\.pdf$/i.test(last) ? last : `${last}.pdf`;
}

/** 把浏览器下载好的 PDF 以 multipart 上传给星河（上传可能要几分钟：期间保活 service worker） */
async function submitPaddleFile(input, creds, ctx = {}) {
  if (!creds || !creds.token) throw new ParseError('AUTH_INVALID', { provider: 'paddleocr' });
  const body = new FormData();
  body.append('model', (input.options && input.options.model) || PADDLEOCR_DEFAULT_MODEL);
  body.append('optionalPayload', '{}');
  body.append('file', input.file, pdfFileName(input.url));
  const json = await withKeepAlive(async () => {
    const res = await fetchWithTimeout(PADDLEOCR_JOBS_URL, { method: 'POST', body, headers: { Authorization: `Bearer ${creds.token}` } },
      { ctx, provider: 'paddleocr', timeoutMs: ctx.uploadTimeoutMs || PADDLEOCR_UPLOAD_TIMEOUT_MS });
    if (!res.ok) throw mapPaddleError(await readErrorResponse(res));
    const out = await res.json();
    // 业务码非 0：交给内核的映射（鉴权类 / 额度类）
    if (out && out.code != null && Number(out.code) !== 0) throw mapPaddleError({ msg: '', ...out });
    return out;
  }, ctx.keepAlive);
  const jobId = json && json.data && json.data.jobId;
  if (!jobId) throw new ParseError('PROVIDER_FAILED', { provider: 'paddleocr', raw: json, reason: 'missing jobId' });
  return { jobId };
}

export const journalPaddleProvider = {
  ...paddleocrProvider,
  permissionMode: 'install',
  optionalPermissions: [],
  acceptsFile: true,
  submit(input, creds, ctx) {
    return input && typeof Blob !== 'undefined' && input.file instanceof Blob ? submitPaddleFile(input, creds, ctx) : paddleocrProvider.submit(input, creds, ctx);
  },
};
export const journalMineruProvider = { ...mineruProvider, permissionMode: 'install' };

export function createPdfRegistry() {
  const r = createRegistry();
  r.register(journalPaddleProvider);
  r.register(journalMineruProvider);
  return r;
}

export const PDF_PROVIDER_IDS = ['paddleocr', 'mineru'];
