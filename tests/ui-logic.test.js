import { quickCheck, emptyText, routeItems, shortcutText } from '@/ui/popup/popup-view';
import { describeResult, errorText } from '@/ui/shared/result-text';
import { t, resolveLanguage, MESSAGES } from '@config/i18n';
import { normalizeSettings, saveSettings, loadSettings, DEFAULT_SETTINGS } from '@config/settings';

describe('i18n', () => {
  test('en and zh_CN have identical keys and no empty messages (R18)', () => {
    expect(Object.keys(MESSAGES.zh).sort()).toEqual(Object.keys(MESSAGES.en).sort());
    for (const loc of ['en', 'zh']) for (const [k, v] of Object.entries(MESSAGES[loc])) expect(v.message.trim()).not.toBe(`${k}`);
  });
  test('messages contain no $ (chrome.i18n placeholder syntax)', () => {
    for (const loc of ['en', 'zh']) for (const v of Object.values(MESSAGES[loc])) expect(v.message).not.toContain('$');
  });
  test('placeholders are the same in both languages', () => {
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort();
    for (const k of Object.keys(MESSAGES.en)) expect(ph(MESSAGES.zh[k].message)).toEqual(ph(MESSAGES.en[k].message));
  });
  test('language follows the browser by default', () => {
    expect(resolveLanguage('auto', 'zh-CN')).toBe('zh');
    expect(resolveLanguage('auto', 'zh-TW')).toBe('zh');
    expect(resolveLanguage('auto', 'en-US')).toBe('en');
    expect(resolveLanguage('auto', 'de')).toBe('en');
    expect(resolveLanguage('zh', 'en-US')).toBe('zh');
  });
  test('t() substitutes only given placeholders', () => {
    expect(t('en', 'optFilenameHelp')).toContain('{title}');
    expect(t('zh', 'statusSaved', { filename: 'a.md' })).toBe('已保存 a.md');
    expect(t('en', 'missingKey')).toBe('missingKey');
  });
});

describe('settings', () => {
  test('defaults and validation', () => {
    expect(normalizeSettings(null)).toEqual({ ...DEFAULT_SETTINGS, sites: { pmc: true, europepmc: true, pubmed: true, springer: true, nature: true, frontiers: true, mdpi: true, plos: true, elife: true } });
    expect(normalizeSettings({ language: 'fr', filenameTemplate: '   ', includeImages: 'yes', sites: { pmc: false, nature: false } }))
      .toMatchObject({ language: 'auto', filenameTemplate: '{title} ({year})', includeImages: true, sites: { pmc: false, europepmc: true, pubmed: true, nature: false } });
  });
  test('save merges site toggles', async () => {
    let stored = {};
    const area = { get: async () => stored, set: async (v) => { stored = v; } };
    await saveSettings({ sites: { pubmed: false } }, area);
    await saveSettings({ includeImages: false }, area);
    expect(await loadSettings(area)).toMatchObject({ includeImages: false, sites: { pmc: true, pubmed: false } });
  });
});

describe('popup view logic', () => {
  test('quickCheck classifies tabs without touching the page', () => {
    expect(quickCheck('chrome://newtab', {})).toEqual({ ok: false, error: 'unsupported_page' });
    expect(quickCheck('https://www.tandfonline.com/doi/full/10.1080/1', {})).toEqual({ ok: false, error: 'site_planned', siteName: 'Taylor & Francis' });
    expect(quickCheck('https://www.frontiersin.org/journals/genetics', {})).toEqual({ ok: false, error: 'not_article' });
    expect(quickCheck('https://pubmed.ncbi.nlm.nih.gov/1/', { sites: { pubmed: false } })).toMatchObject({ error: 'site_disabled' });
    expect(quickCheck('https://pubmed.ncbi.nlm.nih.gov/?term=x', {})).toEqual({ ok: false, error: 'not_article' });
    expect(quickCheck('https://pubmed.ncbi.nlm.nih.gov/1/', {})).toEqual({ ok: true, siteId: 'pubmed', siteName: 'PubMed' });
  });
  test('failure messages are specific and localized', () => {
    expect(emptyText('en', { error: 'site_planned', siteName: 'MDPI' })).toBe('MDPI is not supported yet; it is planned for a later version.');
    expect(emptyText('zh', { error: 'site_planned', siteName: 'MDPI' })).toBe('暂不支持 MDPI，计划在后续版本加入。');
    expect(errorText('en', 'nonsense')).toBe(t('en', 'err_unknown'));
  });
  test('routes: JATS is only checked on export (no request when the popup opens)', () => {
    expect(routeItems('en', { jats: true, dom: true, abstract: true }).map((i) => i.text)).toEqual(['JATS: checked on export', 'Page ✓']);
    expect(routeItems('zh', { jats: true, dom: true }).map((i) => i.text)).toEqual(['JATS：导出时检查', '页面 ✓']);
    expect(routeItems('zh', { jats: false, dom: false, abstract: true }).map((i) => i.text)).toEqual(['页面 ✗', '摘要 ✓']);
  });
  test('shortcut hint', () => {
    expect(shortcutText('en', [{ name: 'export-markdown', shortcut: 'Alt+Shift+J' }, { name: 'copy-markdown', shortcut: '' }])).toBe('Shortcuts: export Alt+Shift+J · copy not set');
    expect(shortcutText('zh', [{ name: 'export-markdown', shortcut: 'Alt+Shift+J' }])).toBe('快捷键：导出 Alt+Shift+J · 复制 未设置');
  });
});

describe('describeResult', () => {
  test('download success via JATS', () => {
    expect(describeResult({ ok: true, filename: 'a.md', route: 'jats-europepmc', notices: [] }, 'en', 'download'))
      .toEqual({ status: 'Saved a.md', notes: [], route: 'Source: Europe PMC JATS (structured full text).' });
  });
  test('timeout fallback and abstract-only notes', () => {
    const r = describeResult({ ok: true, filename: 'a.md', route: 'dom-pmc', notices: [{ code: 'jats_fallback', reason: 'timeout' }] }, 'en', 'download');
    expect(r.notes).toEqual(['Europe PMC did not respond in time. Exported from this page instead.']);
    const a = describeResult({ ok: true, abstractOnly: true, markdown: 'abc', route: 'dom-pubmed', notices: [{ code: 'jats_fallback', reason: 'not_available' }, { code: 'abstract_only' }] }, 'zh', 'copy');
    expect(a.status).toBe('已复制 3 个字符到剪贴板。');
    expect(a.notes).toEqual(['Europe PMC 上没有这篇文章的开放获取全文。', '仅摘要：没有找到可公开获取的全文。']);
  });
  test('errors', () => {
    expect(describeResult({ ok: false, error: 'download_failed' }, 'en', 'download').status).toBe(t('en', 'err_download_failed'));
  });
});

test('fix2b-2: options CSS gives #pdfKeyLink a 24px minimum target (WCAG 2.5.8)', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '../src/ui/options/options.css'), 'utf8');
  const rule = css.match(/#pdfKeyLink\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/min-height:24px/);
  expect(rule[1]).toMatch(/min-width:24px/);
  expect(rule[1]).toMatch(/display:inline-flex/);
});
