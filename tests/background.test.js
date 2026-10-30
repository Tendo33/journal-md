/**
 * @jest-environment node
 */
import { downloadMarkdown, markdownDownloadUrl, canUseBlobUrl } from '@/background/download';
import { buildMenuItems, menuAction, createMenuBuilder, MENU } from '@/background/context-menu';
import { createActionRunner } from '@/background/run-action';
import { SUPPORTED_PAGE_PATTERNS } from '@core/sites/registry';

describe('download adapter (Chrome SW data URL vs Firefox blob URL)', () => {
  test('no createObjectURL → UTF-8 base64 data URL', () => {
    const { url, kind } = markdownDownloadUrl('# 标题 é', {});
    expect(kind).toBe('data');
    const b64 = url.replace('data:text/markdown;charset=utf-8;base64,', '');
    expect(Buffer.from(b64, 'base64').toString('utf8')).toBe('# 标题 é');
  });

  test('createObjectURL available → blob URL', () => {
    const env = { URL: { createObjectURL: jest.fn(() => 'blob:x'), revokeObjectURL: jest.fn() }, Blob };
    expect(canUseBlobUrl(env)).toBe(true);
    expect(markdownDownloadUrl('x', env)).toMatchObject({ url: 'blob:x', kind: 'blob' });
  });

  test('downloadMarkdown keeps the Unicode file name and reports success', async () => {
    const downloads = { download: jest.fn((opts, cb) => cb(7)) };
    const r = await downloadMarkdown({ markdown: '# x', filename: '鸡 基因组 (2025).md' }, { downloads, env: {}, runtime: {} });
    expect(r).toEqual({ ok: true, id: 7 });
    expect(downloads.download.mock.calls[0][0]).toMatchObject({ filename: '鸡 基因组 (2025).md', saveAs: false, conflictAction: 'uniquify' });
  });

  test('downloadMarkdown reports lastError and empty input', async () => {
    const runtime = { lastError: { message: 'Invalid filename' } };
    const downloads = { download: jest.fn((opts, cb) => cb(undefined)) };
    await expect(downloadMarkdown({ markdown: '# x', filename: 'a.md' }, { downloads, env: {}, runtime })).resolves.toEqual({ ok: false, error: 'Invalid filename' });
    await expect(downloadMarkdown({ markdown: '', filename: 'a.md' }, { downloads, env: {}, runtime })).resolves.toEqual({ ok: false, error: 'empty' });
  });
});

describe('context menu', () => {
  test('two page items in each language, only on supported sites', () => {
    const en = buildMenuItems('en');
    expect(en.map((i) => i.title)).toEqual(['Export this article as Markdown', 'Copy full-text Markdown']);
    expect(buildMenuItems('zh').map((i) => i.title)).toEqual(['导出本文为 Markdown', '复制全文 Markdown']);
    for (const item of en) {
      expect(item.contexts).toEqual(['page']);
      expect(item.documentUrlPatterns).toEqual(SUPPORTED_PAGE_PATTERNS);
      expect(item.documentUrlPatterns).toContain('https://www.nature.com/articles/*');
    }
  });

  test('menu ids map to actions', () => {
    expect(menuAction(MENU.EXPORT)).toBe('download');
    expect(menuAction(MENU.COPY)).toBe('copy');
    expect(menuAction('other')).toBeNull();
  });

  test('rebuild removes old items before creating new ones', async () => {
    const calls = [];
    const menus = { removeAll: (cb) => { calls.push('removeAll'); cb(); }, create: (item, cb) => { calls.push(item.id); cb(); } };
    const builder = createMenuBuilder({ menus, runtime: {}, getLanguage: async () => 'zh' });
    await Promise.all([builder.refresh(), builder.refresh()]);
    expect(calls).toEqual(['removeAll', MENU.EXPORT, MENU.COPY, 'removeAll', MENU.EXPORT, MENU.COPY]);
  });
});

describe('action runner (context menu / shortcuts)', () => {
  const timers = { setTimeout: () => 0 };
  const action = { setBadgeText: jest.fn(), setBadgeBackgroundColor: jest.fn() };

  test('sends EXPORT with toast and shows a success badge', async () => {
    const tabs = { sendMessage: jest.fn(async () => ({ ok: true })) };
    const runner = createActionRunner({ tabs, scripting: {}, action, timers });
    await expect(runner.run({ id: 1, url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1/' }, 'copy')).resolves.toEqual({ ok: true });
    expect(tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'JMD_EXPORT', action: 'copy', toast: true });
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 1, text: '✓' });
  });

  test('injects the content script when no receiver exists, then retries', async () => {
    const tabs = { sendMessage: jest.fn().mockRejectedValueOnce(new Error('Receiving end does not exist')).mockResolvedValueOnce({ ok: true }) };
    const scripting = { executeScript: jest.fn(async () => []) };
    const runner = createActionRunner({ tabs, scripting, action, timers });
    await runner.run({ id: 2, url: 'https://pubmed.ncbi.nlm.nih.gov/1/' }, 'download');
    expect(scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 2 }, files: ['content.js'] });
    expect(tabs.sendMessage).toHaveBeenCalledTimes(2);
  });

  test('unsupported tab never messages the page', async () => {
    const tabs = { sendMessage: jest.fn() };
    const runner = createActionRunner({ tabs, scripting: {}, action, timers });
    await expect(runner.run({ id: 3, url: 'https://onlinelibrary.wiley.com/doi/10.1111/x' }, 'download')).resolves.toEqual({ ok: false, error: 'site_planned' });
    expect(tabs.sendMessage).not.toHaveBeenCalled();
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 3, text: '!' });
  });
});

describe('background message router', () => {
  let handleMessage;
  const listeners = {};
  beforeAll(async () => {
    const ev = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
    global.chrome = {
      runtime: { id: 'self', onMessage: ev('message'), onInstalled: ev('installed'), onStartup: ev('startup'), getURL: (p) => `chrome-extension://self/${p}` },
      storage: { onChanged: ev('storage'), sync: { get: async () => ({}) } },
      contextMenus: { onClicked: ev('menu'), removeAll: (cb) => cb(), create: () => {} },
      commands: { onCommand: ev('command') },
      tabs: { create: jest.fn(), query: jest.fn(async () => []) },
      scripting: {}, action: {}, downloads: { download: jest.fn((o, cb) => cb(1)) }, i18n: { getUILanguage: () => 'en' },
    };
    global.fetch = jest.fn(async () => ({ status: 404, ok: false, text: async () => '' }));
    ({ handleMessage } = await import('@/background/index'));
  });
  afterAll(() => { delete global.chrome; delete global.fetch; });

  test('ignores messages from other extensions', () => {
    expect(handleMessage({ type: 'JMD_FETCH_JATS', pmcid: 'PMC1' }, { id: 'evil' })).toBeNull();
  });

  test('FETCH_JATS goes to Europe PMC only; the removed probe message is ignored', async () => {
    expect(handleMessage({ type: 'JMD_PROBE_JATS', pmcid: 'PMC1' }, { id: 'self' })).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
    await expect(handleMessage({ type: 'JMD_FETCH_JATS', pmcid: 'PMC1' }, { id: 'self' })).resolves.toEqual({ ok: false, reason: 'not_available', status: 404 });
    expect(global.fetch.mock.calls[0][0]).toBe('https://www.ebi.ac.uk/europepmc/webservices/rest/PMC1/fullTextXML');
  });

  test('opens the welcome page on first install only', () => {
    listeners.installed({ reason: 'install' });
    listeners.installed({ reason: 'update' });
    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome-extension://self/options.html?welcome=1' });
  });
});
