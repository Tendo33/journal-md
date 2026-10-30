// L3 PDF 解析（PRD §2.2 / §2.11）：把当前文章的 PDF 地址交给用户自选的后端（PaddleOCR 默认，MinerU 可选），
// 轮询到完成后下载结果。一次只跑一个任务；进度写在 chrome.storage.local 的 pdfTask 里，弹窗关掉也会继续。
// 不申请 alarms：轮询期间用内核的 withKeepAlive 保活 service worker（每 20 秒一次扩展 API 调用）。
// 规则：
// - 默认只发开放获取的 PDF；非 OA 或拿不准的，必须由弹窗（扩展页面）带着本次确认发起，不提供「总是允许」；
// - 发请求前确认已授予该后端的可选权限，没有就失败（PERMISSION_MISSING），不自动换后端；
// - Token 只从 chrome.storage.local 读，只发给该后端。
import { ParseError, isParseError, ERROR_REASONS } from '@pdf-core/errors.js';
import { ensureProviderPermission, withRequiredPermissions, requiredPermissionsOf } from '@pdf-core/permissions.js';
import { buildMineruLayout } from '@pdf-core/output/mineru-layout.js';
import { assertSavableMarkdown } from '@pdf-core/output/pre-save.js';
import { withKeepAlive } from '@pdf-core/keepalive.js';
import { renderFrontMatter, formatExported } from '../core/render/frontmatter';
import { buildFilename } from '../core/filename';
import { loadPdfSettings, PDF_TASK_KEY } from '../pdf/settings';
import { uploadAllowed } from '../pdf/oa';

export const PDF_SOURCE_ROUTE = { paddleocr: 'pdf-paddleocr', mineru: 'pdf-mineru' };
const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

function httpsUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && !x.username && !x.password ? x.href : '';
  } catch (_) {
    return '';
  }
}

/**
 * @param {object} deps
 * @param {{get:(id:string)=>object|null}} deps.registry
 * @param {object} deps.storage chrome.storage.local
 * @param {object} deps.permissions chrome.permissions
 * @param {object} deps.runtime chrome.runtime（Firefox 的必需权限从 manifest 读）
 * @param {(opts:{url:string, filename:string})=>Promise<number>} deps.downloadUrl MinerU 原始 ZIP
 * @param {(result:object, baseName:string)=>Promise<{id:number, filename:string}>} deps.saveDeliverable PaddleOCR 整理后的 ZIP
 * @param {(providerId:string)=>Promise<void>} [deps.ensureRule] PaddleOCR 提交前确认 DNR 规则（去 Origin 头）
 * @param {(state:'run'|'ok'|'err')=>void} [deps.badge]
 */
export function createPdfRunner(deps) {
  const { registry, storage, permissions, runtime, downloadUrl, saveDeliverable, ensureRule = async () => {}, badge = () => {}, now = () => Date.now(), sleep = sleepReal, keepAlive = withKeepAlive, log = () => {}, getFilenameTemplate = async () => undefined } = deps;
  let running = null;

  async function write(patch) {
    const got = await storage.get(PDF_TASK_KEY);
    const cur = (got && got[PDF_TASK_KEY]) || {};
    const next = { ...cur, ...patch, updatedAt: now() };
    await storage.set({ [PDF_TASK_KEY]: next });
    return next;
  }

  function failure(err, provider) {
    const e = isParseError(err) ? err : (provider && provider.mapError ? provider.mapError(err) : new ParseError('PROVIDER_FAILED', { raw: String(err) }));
    return { state: 'failed', errorCode: e.code, errorReason: e.reason || null, errorHost: e.host || null, progress: null };
  }

  async function deliver(task, provider, fetched, settings) {
    const base = buildFilename(task.meta || {}, settings.filenameTemplate || '{title} ({year})').replace(/\.md$/, '');
    if (fetched.zipUrl) {
      // MinerU：交付服务端原始 ZIP（full.md + images/），和 arxiv-md 默认行为一致
      const url = httpsUrl(fetched.zipUrl);
      if (!url) throw new ParseError('PROVIDER_FAILED', { provider: provider.id, reason: 'bad result url' });
      const filename = `${base} (PDF).zip`;
      await downloadUrl({ url, filename });
      return filename;
    }
    // PaddleOCR：没有正文就失败，不写空文件（pdf-parse-core AR-02）
    assertSavableMarkdown(fetched.markdown, { provider: provider.id });
    const layout = await buildMineruLayout(fetched, { meta: null });
    const fm = renderFrontMatter({ ...(task.meta || {}), url: task.pageUrl }, { sourceRoute: PDF_SOURCE_ROUTE[provider.id], exported: formatExported(new Date(now())) });
    const saved = await saveDeliverable({ ...layout, markdown: `${fm}\n\n${layout.markdown}` }, `${base} (PDF)`);
    return saved.filename;
  }

  async function run(task, provider, token, settings) {
    const creds = { token };
    const submitAt = now();
    await write({ state: 'submitting', progress: 5, startedAt: submitAt });
    const r = await provider.submit({ url: task.pdfUrl }, creds, {});
    await write({ state: 'running', progress: 10, jobId: r.jobId || null });
    let fetched = r.result || null;
    if (!fetched) {
      const deadline = submitAt + (provider.timeoutMs || 10 * 60 * 1000);
      for (;;) {
        const s = await provider.poll(r.jobId, creds, {});
        if (s.state === 'done') { fetched = await provider.fetchResult(s.result, creds, {}); break; }
        if (s.state === 'failed') throw new ParseError('PROVIDER_FAILED', { provider: provider.id, reason: s.error });
        if (s.progress && s.progress.total) await write({ progress: Math.round(10 + (s.progress.done / s.progress.total) * 80) });
        if (now() >= deadline) throw new ParseError('TIMEOUT', { provider: provider.id });
        await sleep(provider.pollIntervalMs || 3000);
      }
    }
    await write({ progress: 95 });
    return deliver(task, provider, fetched, settings);
  }

  /**
   * @param {{pdfUrl:string, pageUrl:string, meta:object, license?:string, consent?:boolean}} req
   * @returns {Promise<{ok:boolean, code?:string, state?:string}>}
   */
  async function start(req) {
    if (running) return { ok: false, code: 'BUSY' };
    const pdfUrl = httpsUrl(req && req.pdfUrl);
    const pageUrl = httpsUrl(req && req.pageUrl);
    if (!pdfUrl || !pageUrl) return { ok: false, code: 'FILE_UNSUPPORTED' };
    const settings = await loadPdfSettings(storage);
    if (!settings.enabled) return { ok: false, code: 'PDF_DISABLED' };
    const provider = registry.get(settings.provider);
    if (!provider) return { ok: false, code: 'PROVIDER_FAILED' };
    // PRD §2.11：非 OA / 拿不准 → 必须带本次确认；确认前不发任何请求
    if (!uploadAllowed({ pageUrl, pdfUrl, license: req.license }, req.consent === true)) return { ok: false, code: 'CONSENT_REQUIRED' };
    const meta = req.meta && typeof req.meta === 'object' ? req.meta : {};
    const task = { id: `pdf-${now()}`, provider: provider.id, pdfUrl, pageUrl, meta: { title: String(meta.title || ''), year: meta.year || null, doi: String(meta.doi || ''), pmid: String(meta.pmid || ''), pmcid: String(meta.pmcid || ''), journal: String(meta.journal || ''), authors: Array.isArray(meta.authors) ? meta.authors.slice(0, 50).map((a) => ({ name: String((a && a.name) || a || '') })) : [], license: String(req.license || '') } };
    await storage.set({ [PDF_TASK_KEY]: { id: task.id, provider: provider.id, title: task.meta.title, pageUrl, state: 'checking', progress: 0, errorCode: null, errorReason: null, filename: null, updatedAt: now() } });
    running = task;
    badge('run');
    try {
      const token = settings.tokens[provider.id];
      if (!token) throw new ParseError('AUTH_INVALID', { provider: provider.id, reason: ERROR_REASONS.KEY_NOT_ON_DEVICE });
      await ensureProviderPermission(withRequiredPermissions(permissions, requiredPermissionsOf(runtime)), provider);
      await ensureRule(provider.id);
      const filenameTemplate = await getFilenameTemplate();
      const filename = await keepAlive(() => run(task, provider, token, { filenameTemplate }));
      await write({ state: 'done', progress: 100, filename });
      badge('ok');
      return { ok: true, state: 'done' };
    } catch (e) {
      const f = failure(e, provider);
      log(`PDF task failed: ${f.errorCode}${f.errorReason ? ` (${f.errorReason})` : ''}`);
      await write(f);
      badge('err');
      return { ok: false, code: f.errorCode };
    } finally {
      running = null;
    }
  }

  /** service worker 重启后发现还停在进行中的任务：上一次被打断了，标成失败（不自动重新提交，避免重复扣额度） */
  async function recover() {
    if (running) return;
    const got = await storage.get(PDF_TASK_KEY);
    const t = got && got[PDF_TASK_KEY];
    if (t && ['checking', 'submitting', 'running'].includes(t.state)) {
      await write({ state: 'failed', errorCode: 'PROVIDER_FAILED', errorReason: ERROR_REASONS.INTERRUPTED_SUBMIT, progress: null });
    }
  }

  async function test(providerId, token) {
    const provider = registry.get(providerId);
    if (!provider || !provider.testConnection) return { ok: false, code: 'PROVIDER_FAILED' };
    try {
      await ensureProviderPermission(withRequiredPermissions(permissions, requiredPermissionsOf(runtime)), provider);
      if (provider.id === 'paddleocr') await ensureRule(provider.id);
    } catch (e) {
      return { ok: false, ...failure(e, provider) };
    }
    const r = await provider.testConnection({ token: String(token || '').trim() }, {});
    return r.ok ? { ok: true } : { ok: false, ...failure(r.error, provider) };
  }

  return { start, recover, test, isRunning: () => !!running };
}
