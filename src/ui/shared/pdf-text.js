// PDF 解析任务的状态 / 错误文案（弹窗和设置页共用）。错误码来自 pdf-parse-core（9 类统一错误码）+ 本扩展自己的几个。
import { t } from '../../config/i18n';

export const PROVIDER_LABELS = { paddleocr: 'PaddleOCR', mineru: 'MinerU' };
const HOSTS = { paddleocr: 'paddleocr.aistudio-app.com', mineru: 'mineru.net' };

export function providerLabel(id) {
  return PROVIDER_LABELS[id] || id || '';
}

/** 按错误码和原因选文案；原因优先（如 Key 只在别的设备上、DNR 规则没装上） */
export function pdfErrorText(lang, { errorCode, errorReason, errorHost, provider } = {}) {
  const subs = { provider: providerLabel(provider), host: errorHost || HOSTS[provider] || '' };
  const byReason = errorReason && t(lang, `pdfErr_reason_${errorReason}`, subs);
  if (byReason && byReason !== `pdfErr_reason_${errorReason}`) return byReason;
  const text = t(lang, `pdfErr_${errorCode || 'PROVIDER_FAILED'}`, subs);
  return text.startsWith('pdfErr_') ? t(lang, 'pdfErr_PROVIDER_FAILED', subs) : text;
}

/** @param {{state:string, progress?:number, filename?:string, provider?:string}} task */
export function pdfStatusText(lang, task) {
  if (!task || !task.state) return '';
  const p = { provider: providerLabel(task.provider) };
  switch (task.state) {
  case 'checking': case 'submitting':
    return t(lang, 'pdfStateSubmitting', p);
  case 'running':
    return t(lang, 'pdfStateRunning', { ...p, progress: Math.max(10, Math.min(99, Number(task.progress) || 10)) });
  case 'done':
    return t(lang, 'pdfStateDone', { ...p, filename: task.filename || '' });
  case 'failed':
    return pdfErrorText(lang, task);
  default:
    return '';
  }
}
