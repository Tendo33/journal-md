/**
 * @jest-environment node
 */
// L3 PDF 解析：只用 mock 的后端，不访问 PaddleOCR / MinerU。
import { createPdfRunner, PDF_SOURCE_ROUTE } from '@/background/pdf-task';
import { createPdfRegistry, journalMineruProvider } from '@/pdf/providers';
import { normalizePdfSettings, savePdfSettings, loadPdfSettings, PDF_SETTINGS_KEY, PDF_TASK_KEY } from '@/pdf/settings';
import { isOpenAccessPdf, uploadAllowed } from '@/pdf/oa';
import { pdfErrorText, pdfStatusText } from '@/ui/shared/pdf-text';
import { defineProvider } from '@pdf-core/provider.js';
import { permissionsFor } from '@pdf-core/permissions.js';
import { paddleocrProvider } from '@pdf-core/providers/paddleocr.js';
import { mineruProvider } from '@pdf-core/providers/mineru.js';
const manifest = require('../src/manifest.json');

function memoryArea(init = {}) {
  const data = { ...init };
  return { data, get: async (k) => (k in data ? { [k]: data[k] } : {}), set: async (o) => Object.assign(data, o) };
}

const NATURE = 'https://www.nature.com/articles/s41586-021-03819-2';
const PLOS = 'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.1';

describe('OA gate (PRD §2.11)', () => {
  test.each([
    [{ pageUrl: PLOS, pdfUrl: 'https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.1&type=printable' }, true],
    [{ pageUrl: 'https://www.frontiersin.org/journals/x/articles/10.3389/a/full', pdfUrl: 'https://www.frontiersin.org/journals/x/articles/10.3389/a/pdf' }, true],
    [{ pageUrl: 'https://link.springer.com/article/10.1186/s1', pdfUrl: 'https://link.springer.com/content/pdf/10.1186/s1.pdf', license: 'CC-BY-4.0' }, true],
    [{ pageUrl: 'https://link.springer.com/article/10.1007/s1', pdfUrl: 'https://link.springer.com/content/pdf/10.1007/s1.pdf', license: '' }, false],
    [{ pageUrl: NATURE, pdfUrl: `${NATURE}.pdf` }, false],
    [{ pageUrl: PLOS, pdfUrl: 'https://evil.example/x.pdf' }, false],
    [{ pageUrl: PLOS, pdfUrl: 'http://journals.plos.org/x.pdf' }, false],
    [{ pageUrl: 'not a url', pdfUrl: 'https://journals.plos.org/x.pdf' }, false],
    [null, false],
    // 审查 N7：只有 CC BY / CC0 免确认
    [{ pageUrl: NATURE, pdfUrl: `${NATURE}.pdf`, license: 'CC-BY-4.0' }, true],
    [{ pageUrl: NATURE, pdfUrl: `${NATURE}.pdf`, license: 'CC0-1.0' }, true],
    [{ pageUrl: NATURE, pdfUrl: `${NATURE}.pdf`, license: 'CC-BY-NC-4.0' }, false],
    [{ pageUrl: NATURE, pdfUrl: `${NATURE}.pdf`, license: 'CC-BY-ND-4.0' }, false],
    [{ pageUrl: NATURE, pdfUrl: `${NATURE}.pdf`, license: 'CC-BY-NC-SA-4.0' }, false],
    [{ pageUrl: NATURE, pdfUrl: `${NATURE}.pdf`, license: 'CC-BY-SA-4.0' }, false],
    // 整站 OA 的出版商，但页面写了更严的许可
    [{ pageUrl: PLOS, pdfUrl: 'https://journals.plos.org/x.pdf', license: 'CC-BY-NC-ND-4.0' }, false],
    // 审查 N2：CC BY 但 PDF 在别的站点
    [{ pageUrl: NATURE, pdfUrl: 'https://files.example.org/x.pdf?sig=1', license: 'CC-BY-4.0' }, false],
  ])('%j → %s', (info, oa) => {
    expect(isOpenAccessPdf(info)).toBe(oa);
  });

  test('non-OA needs this request\'s explicit consent; there is no "always allow"', () => {
    const info = { pageUrl: NATURE, pdfUrl: `${NATURE}.pdf` };
    expect(uploadAllowed(info, false)).toBe(false);
    expect(uploadAllowed(info, 'yes')).toBe(false);
    expect(uploadAllowed(info, true)).toBe(true);
  });
});

describe('providers and permissions', () => {
  test('PaddleOCR is the default; both backends ask for optional permissions only', () => {
    const r = createPdfRegistry();
    expect(r.ids()).toEqual(['paddleocr', 'mineru']);
    expect(normalizePdfSettings(null)).toEqual({ enabled: false, provider: 'paddleocr', tokens: {} });
    expect(permissionsFor(r.get('paddleocr'))).toEqual({ origins: ['https://paddleocr.aistudio-app.com/*', 'https://*.bj.bcebos.com/*'], permissions: ['declarativeNetRequestWithHostAccess'] });
    expect(permissionsFor(journalMineruProvider)).toEqual({ origins: ['https://mineru.net/*', 'https://cdn-mineru.openxlab.org.cn/*'], permissions: [] });
    // vendored core unchanged: MinerU stays install-mode there
    expect(mineruProvider.permissionMode).toBe('install');
    const optional = manifest.optional_host_permissions;
    for (const o of [...paddleocrProvider.hosts, ...mineruProvider.hosts]) {
      expect(optional).toContain(o);
      expect(manifest.host_permissions).not.toContain(o);
    }
  });

  test('settings live in storage.local; tokens are trimmed and never synced', async () => {
    const local = memoryArea();
    await savePdfSettings({ enabled: true, tokens: { paddleocr: '  t-1  ' } }, local);
    expect(local.data[PDF_SETTINGS_KEY]).toEqual({ enabled: true, provider: 'paddleocr', tokens: { paddleocr: 't-1' } });
    await savePdfSettings({ provider: 'mineru', tokens: { paddleocr: '' } }, local);
    expect(await loadPdfSettings(local)).toEqual({ enabled: true, provider: 'mineru', tokens: {} });
  });
});

function fakeProvider(id, overrides = {}) {
  return defineProvider({
    id, label: id, hosts: [`https://${id}.example/*`], credentialFields: [], mode: 'async', input: 'url', cost: 'free',
    permissionMode: 'optional', pollIntervalMs: 1, timeoutMs: 1000,
    submit: jest.fn(async () => ({ jobId: 'job-1' })),
    poll: jest.fn(async () => ({ state: 'done', result: { jsonUrl: 'x' } })),
    fetchResult: jest.fn(async () => ({ markdown: '# Parsed\n\nBody text from the PDF.', images: [], jsonUrl: 'x' })),
    mapError: (e) => e,
    ...overrides,
  });
}

function setup({ settings = { enabled: true, provider: 'paddleocr', tokens: { paddleocr: 'tok' } }, granted = true, provider } = {}) {
  const p = provider || fakeProvider('paddleocr');
  const registry = { get: (id) => (id === p.id ? p : null) };
  const storage = memoryArea({ [PDF_SETTINGS_KEY]: settings });
  const permissions = { contains: jest.fn(async () => granted), request: jest.fn(), remove: jest.fn() };
  const saveDeliverable = jest.fn(async (result, base) => ({ id: 1, filename: `${base}.zip` }));
  const downloadUrl = jest.fn(async () => 2);
  const ensureRule = jest.fn(async () => {});
  const runner = createPdfRunner({ registry, storage, permissions, runtime: { getManifest: () => ({ permissions: [] }) }, saveDeliverable, downloadUrl, ensureRule, keepAlive: (fn) => fn(), sleep: async () => {}, now: () => 1000, getFilenameTemplate: async () => '{title} ({year})' });
  return { runner, provider: p, storage, permissions, saveDeliverable, downloadUrl, ensureRule };
}

const REQ = { pdfUrl: `${NATURE}.pdf`, pageUrl: NATURE, meta: { title: 'AlphaFold', year: 2021, authors: [{ name: 'J' }] }, license: '' };

describe('PDF task runner', () => {
  test('non-OA without consent: refused before any request', async () => {
    const s = setup();
    await expect(s.runner.start(REQ)).resolves.toEqual({ ok: false, code: 'CONSENT_REQUIRED' });
    expect(s.provider.submit).not.toHaveBeenCalled();
    expect(s.permissions.contains).not.toHaveBeenCalled();
  });

  test('disabled, bad URLs, missing token, missing permission', async () => {
    await expect(setup({ settings: { enabled: false } }).runner.start({ ...REQ, consent: true })).resolves.toEqual({ ok: false, code: 'PDF_DISABLED' });
    await expect(setup().runner.start({ ...REQ, pdfUrl: 'javascript:alert(1)', consent: true })).resolves.toEqual({ ok: false, code: 'FILE_UNSUPPORTED' });
    const noKey = setup({ settings: { enabled: true, provider: 'paddleocr', tokens: {} } });
    await expect(noKey.runner.start({ ...REQ, consent: true })).resolves.toEqual({ ok: false, code: 'AUTH_INVALID' });
    expect(noKey.storage.data[PDF_TASK_KEY]).toMatchObject({ state: 'failed', errorReason: 'key_not_on_device' });
    const noPerm = setup({ granted: false });
    await expect(noPerm.runner.start({ ...REQ, consent: true })).resolves.toEqual({ ok: false, code: 'PERMISSION_MISSING' });
    expect(noPerm.provider.submit).not.toHaveBeenCalled();
  });

  test('confirmed: submit → poll → ZIP with our front matter (source_route pdf-paddleocr)', async () => {
    const s = setup();
    await expect(s.runner.start({ ...REQ, consent: true })).resolves.toEqual({ ok: true, state: 'done' });
    expect(s.ensureRule).toHaveBeenCalledWith('paddleocr');
    expect(s.provider.submit).toHaveBeenCalledWith({ url: `${NATURE}.pdf` }, { token: 'tok' }, {});
    const [result, base] = s.saveDeliverable.mock.calls[0];
    expect(base).toBe('AlphaFold (2021) (PDF)');
    expect(result.layout).toBe('mineru');
    expect(result.markdown).toMatch(/^---\ntitle: AlphaFold\nauthors: \[J\]\nyear: 2021\nurl: "https:\/\/www\.nature\.com\/articles\/s41586-021-03819-2"\nsource_route: pdf-paddleocr\n/);
    expect(result.markdown).toContain('Body text from the PDF.');
    expect(s.storage.data[PDF_TASK_KEY]).toMatchObject({ state: 'done', progress: 100, filename: 'AlphaFold (2021) (PDF).zip' });
  });

  test('OA page needs no consent; MinerU result ZIP is downloaded as is', async () => {
    const p = fakeProvider('mineru', { fetchResult: jest.fn(async () => ({ zipUrl: 'https://cdn-mineru.openxlab.org.cn/r.zip' })) });
    const s = setup({ provider: p, settings: { enabled: true, provider: 'mineru', tokens: { mineru: 'm' } } });
    await expect(s.runner.start({ ...REQ, pdfUrl: 'https://journals.plos.org/plosone/article/file?id=1', pageUrl: PLOS })).resolves.toEqual({ ok: true, state: 'done' });
    expect(s.downloadUrl).toHaveBeenCalledWith({ url: 'https://cdn-mineru.openxlab.org.cn/r.zip', filename: 'AlphaFold (2021) (PDF).zip' });
    expect(s.ensureRule).toHaveBeenCalledWith('mineru');
  });

  test('empty result is not saved; provider failure is recorded; one task at a time', async () => {
    const empty = setup({ provider: fakeProvider('paddleocr', { fetchResult: jest.fn(async () => ({ markdown: '   ', images: [], jsonUrl: 'x' })) }) });
    await expect(empty.runner.start({ ...REQ, consent: true })).resolves.toEqual({ ok: false, code: 'PROVIDER_FAILED' });
    expect(empty.saveDeliverable).not.toHaveBeenCalled();
    expect(empty.storage.data[PDF_TASK_KEY]).toMatchObject({ state: 'failed', errorReason: 'empty_result' });

    let release;
    const slow = setup({ provider: fakeProvider('paddleocr', { submit: jest.fn(() => new Promise((r) => { release = r; })) }) });
    const first = slow.runner.start({ ...REQ, consent: true });
    await new Promise((r) => setTimeout(r, 0));
    await expect(slow.runner.start({ ...REQ, consent: true })).resolves.toEqual({ ok: false, code: 'BUSY' });
    release({ jobId: 'j' });
    await expect(first).resolves.toEqual({ ok: true, state: 'done' });
  });

  test('a task interrupted by a service-worker restart is marked failed, not resent', async () => {
    const s = setup();
    s.storage.data[PDF_TASK_KEY] = { state: 'running', provider: 'paddleocr' };
    await s.runner.recover();
    expect(s.storage.data[PDF_TASK_KEY]).toMatchObject({ state: 'failed', errorReason: 'interrupted_submit' });
    expect(s.provider.submit).not.toHaveBeenCalled();
  });

  test('source routes', () => {
    expect(PDF_SOURCE_ROUTE).toEqual({ paddleocr: 'pdf-paddleocr', mineru: 'pdf-mineru' });
  });
});

describe('PDF texts', () => {
  test('PRD §2.11 confirmation wording and error texts', () => {
    const { t } = require('@/config/i18n');
    expect(t('zh', 'pdfConfirmText', { provider: 'PaddleOCR' })).toBe('这篇不是开放获取文章，上传给 PaddleOCR 可能违反出版商条款，是否继续？');
    expect(t('en', 'pdfConfirmText', { provider: 'MinerU' })).toBe("This article is not open access. Uploading it to MinerU may violate the publisher's terms. Continue?");
    expect(pdfErrorText('en', { errorCode: 'PERMISSION_MISSING', provider: 'paddleocr' })).toContain('paddleocr.aistudio-app.com');
    expect(pdfErrorText('zh', { errorCode: 'PROVIDER_FAILED', errorReason: 'dnr_not_ready', provider: 'paddleocr' })).toContain('网络规则');
    expect(pdfErrorText('en', { errorCode: 'WHATEVER', provider: 'mineru' })).toBe('MinerU could not parse this PDF.');
    expect(pdfStatusText('en', { state: 'running', progress: 50, provider: 'mineru' })).toContain('(50%)');
  });
});
