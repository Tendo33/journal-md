// PDF 解析后端（PRD §2.11）：PaddleOCR 默认，MinerU 可选。实现来自 vendored pdf-parse-core（arxiv-md b2dc3a0）。
// Simon 2026-10-30 18:06：两个后端的域名都在安装时授予（host_permissions），使用时不再申请权限，
// 所以 PaddleOCR 也按 permissionMode: 'install' 重新定义一次（内核文件不改，见 vendor/pdf-parse-core/README.md）。
import { createRegistry } from '@pdf-core/registry.js';
import { paddleocrProvider } from '@pdf-core/providers/paddleocr.js';
import { mineruProvider } from '@pdf-core/providers/mineru.js';

export const DEFAULT_PDF_PROVIDER = 'paddleocr';

export const journalPaddleProvider = { ...paddleocrProvider, permissionMode: 'install', optionalPermissions: [] };
export const journalMineruProvider = { ...mineruProvider, permissionMode: 'install' };

export function createPdfRegistry() {
  const r = createRegistry();
  r.register(journalPaddleProvider);
  r.register(journalMineruProvider);
  return r;
}

export const PDF_PROVIDER_IDS = ['paddleocr', 'mineru'];
