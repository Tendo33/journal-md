// PDF 解析后端（PRD §2.11）：PaddleOCR 默认，MinerU 可选。实现来自 vendored pdf-parse-core（arxiv-md b2dc3a0）。
// 和 arxiv-md 的唯一差别：journal-md 里 PDF 兜底是 P2，两个后端的域名都是可选权限（PRD §2.6），
// 所以 MinerU 用 permissionMode: 'optional' 重新定义一次（内核文件不改，见 vendor/pdf-parse-core/README.md）。
import { createRegistry } from '@pdf-core/registry.js';
import { paddleocrProvider } from '@pdf-core/providers/paddleocr.js';
import { mineruProvider } from '@pdf-core/providers/mineru.js';

export const DEFAULT_PDF_PROVIDER = 'paddleocr';

export const journalMineruProvider = { ...mineruProvider, permissionMode: 'optional' };

export function createPdfRegistry() {
  const r = createRegistry();
  r.register(paddleocrProvider);
  r.register(journalMineruProvider);
  return r;
}

export const PDF_PROVIDER_IDS = ['paddleocr', 'mineru'];
