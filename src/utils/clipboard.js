// 剪贴板：优先 navigator.clipboard，失败退回 execCommand('copy')（与 arxiv-md page-buttons 的做法一致）。
export async function writeClipboard(text, doc = document) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* 退回 execCommand */ }
  const ta = doc.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0;';
  (doc.body || doc.documentElement).appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = doc.execCommand('copy'); } catch (_) { ok = false; }
  ta.remove();
  return ok;
}
