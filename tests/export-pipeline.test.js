import fs from 'fs';
import path from 'path';
import { exportArticle, inspectPage } from '@core/export/pipeline';

const NOW = new Date(Date.UTC(2026, 9, 30, 2, 0));
const html = (name) => new DOMParser().parseFromString(fs.readFileSync(path.join(__dirname, 'fixtures/html', name), 'utf8'), 'text/html');
const JATS = fs.readFileSync(path.join(__dirname, 'fixtures/jats/europepmc-full.xml'), 'utf8');
const ok = jest.fn(async () => ({ ok: true, xml: JATS }));
const timeout = jest.fn(async () => ({ ok: false, reason: 'timeout' }));
const notOa = jest.fn(async () => ({ ok: false, reason: 'not_available' }));

const PMC_URL = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11000001/';
const PUBMED_URL = 'https://pubmed.ncbi.nlm.nih.gov/40000001/';

beforeEach(() => jest.clearAllMocks());

describe('PMC page', () => {
  test('L1 JATS when available', async () => {
    const r = await exportArticle({ doc: html('pmc-article.html'), url: PMC_URL, fetchJats: ok, now: NOW });
    expect(ok).toHaveBeenCalledWith('PMC11000001');
    expect(r).toMatchObject({ ok: true, route: 'jats-europepmc', abstractOnly: false, notices: [{ code: 'equation_image' }] });
    expect(r.markdown).toContain('source_route: jats-europepmc');
    expect(r.markdown).toContain(`url: "${PMC_URL}"`);
    expect(r.filename).toBe('Genomic heritability of egg weight in Gallus gallus a GBLUP study (2025).md');
  });

  test('L1 timeout → falls back to page DOM with a notice', async () => {
    const r = await exportArticle({ doc: html('pmc-article.html'), url: PMC_URL, fetchJats: timeout, now: NOW });
    expect(r).toMatchObject({ ok: true, route: 'dom-pmc' });
    expect(r.notices).toContainEqual({ code: 'jats_fallback', reason: 'timeout' });
    expect(r.markdown).toContain('source_route: dom-pmc');
  });

  test('broken XML → DOM fallback with reason parse', async () => {
    const r = await exportArticle({ doc: html('pmc-article.html'), url: PMC_URL, fetchJats: async () => ({ ok: true, xml: '<oops' }), now: NOW });
    expect(r.route).toBe('dom-pmc');
    expect(r.notices).toContainEqual({ code: 'jats_fallback', reason: 'parse' });
  });

  test('fetchJats throwing is treated as a network failure', async () => {
    const r = await exportArticle({ doc: html('pmc-article.html'), url: PMC_URL, fetchJats: async () => { throw new Error('no receiver'); }, now: NOW });
    expect(r.notices).toContainEqual({ code: 'jats_fallback', reason: 'network' });
  });

  test('preferJats=false skips the network entirely', async () => {
    const r = await exportArticle({ doc: html('pmc-article.html'), url: PMC_URL, fetchJats: ok, settings: { preferJats: false }, now: NOW });
    expect(ok).not.toHaveBeenCalled();
    expect(r.route).toBe('dom-pmc');
  });

  test('settings: includeImages and filename template are applied', async () => {
    const r = await exportArticle({ doc: html('pmc-article.html'), url: PMC_URL, fetchJats: timeout, settings: { includeImages: false, filenameTemplate: '{pmcid} - {firstAuthor}' }, now: NOW });
    expect(r.filename).toBe('PMC11000001 - Wei Li.md');
    expect(r.markdown).not.toContain('![Fig. 1');
  });
});

describe('PubMed page (PRD §1.3)', () => {
  test('PMCID → Europe PMC full text, MeSH kept, diff vs PMC export only in source fields', async () => {
    const r = await exportArticle({ doc: html('pubmed-with-pmcid.html'), url: PUBMED_URL, fetchJats: ok, now: NOW });
    expect(r).toMatchObject({ ok: true, route: 'jats-europepmc', abstractOnly: false });
    expect(r.notices).toContainEqual({ code: 'pubmed_fulltext' });
    expect(r.markdown).toContain('**MeSH terms:** Animals; Chickens / genetics\\*; Eggs\\*; Female');
    const pmc = await exportArticle({ doc: html('pmc-article.html'), url: PMC_URL, fetchJats: ok, now: NOW });
    const strip = (md) => md.replace(/^url: .*$/m, '').replace(/\n\n\*\*MeSH terms:\*\*.*\n/, '\n');
    expect(strip(r.markdown)).toBe(strip(pmc.markdown));
  });

  test('PMCID but not OA → abstract only, marked at the top', async () => {
    const r = await exportArticle({ doc: html('pubmed-with-pmcid.html'), url: PUBMED_URL, fetchJats: notOa, now: NOW });
    expect(r).toMatchObject({ ok: true, route: 'dom-pubmed', abstractOnly: true });
    expect(r.notices).toEqual([{ code: 'jats_fallback', reason: 'not_available' }, { code: 'abstract_only', fullTextUrl: 'https://doi.org/10.1186/s12711-025-00001-2' }]);
    expect(r.markdown.split('---\n')[2].trim().startsWith('> **Abstract only / 仅摘要**')).toBe(true);
  });

  test('no PMCID → abstract only without any network request', async () => {
    const r = await exportArticle({ doc: html('pubmed-abstract-only.html'), url: 'https://pubmed.ncbi.nlm.nih.gov/31768545/', fetchJats: ok, now: NOW });
    expect(ok).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, route: 'dom-pubmed', abstractOnly: true });
  });

  test('PubMed tries JATS even when preferJats is off (only way to get full text)', async () => {
    await exportArticle({ doc: html('pubmed-with-pmcid.html'), url: PUBMED_URL, fetchJats: ok, settings: { preferJats: false }, now: NOW });
    expect(ok).toHaveBeenCalled();
  });
});

describe('Europe PMC page', () => {
  test('timeout falls back to the rendered DOM', async () => {
    const r = await exportArticle({ doc: html('europepmc-article.html'), url: 'https://europepmc.org/article/PMC/PMC7000002', fetchJats: timeout, now: NOW });
    expect(timeout).toHaveBeenCalledWith('PMC7000002');
    expect(r).toMatchObject({ ok: true, route: 'dom-europepmc' });
  });

  test('page without a body becomes abstract only', async () => {
    const doc = html('europepmc-article.html');
    doc.getElementById('fulltextcontent').remove();
    const r = await exportArticle({ doc, url: 'https://europepmc.org/article/MED/33900001', fetchJats: notOa, now: NOW });
    expect(r).toMatchObject({ ok: true, route: 'dom-europepmc', abstractOnly: true });
  });
});

describe('failure reasons', () => {
  const doc = html('pmc-article.html');
  test.each([
    ['https://example.com/paper', 'unsupported_page'],
    ['https://www.nature.com/articles/s41598-020-1', 'site_planned'],
    ['https://pmc.ncbi.nlm.nih.gov/search/?term=x', 'not_article'],
  ])('%s → %s', async (url, error) => {
    const r = await exportArticle({ doc, url, fetchJats: ok });
    expect(r).toMatchObject({ ok: false, error });
  });

  test('disabled site', async () => {
    const r = await exportArticle({ doc, url: PMC_URL, fetchJats: ok, settings: { sites: { pmc: false } } });
    expect(r).toMatchObject({ ok: false, error: 'site_disabled', siteName: 'PubMed Central' });
  });

  test('empty page → no_content, never an empty file', async () => {
    const empty = new DOMParser().parseFromString('<html><body><p>Please sign in</p></body></html>', 'text/html');
    const r = await exportArticle({ doc: empty, url: PMC_URL, fetchJats: timeout });
    expect(r).toMatchObject({ ok: false, error: 'no_content' });
  });
});

describe('inspectPage', () => {
  test('PMC article: ids and routes', () => {
    expect(inspectPage(html('pmc-article.html'), PMC_URL)).toMatchObject({
      ok: true, siteId: 'pmc', siteName: 'PubMed Central', title: expect.stringContaining('Genomic heritability'),
      ids: { doi: '10.1186/s12711-025-00001-2', pmid: '40000001', pmcid: 'PMC11000001' },
      routes: { jats: true, dom: true, abstract: true },
    });
  });
  test('PubMed without PMCID: abstract only', () => {
    expect(inspectPage(html('pubmed-abstract-only.html'), 'https://pubmed.ncbi.nlm.nih.gov/31768545/'))
      .toMatchObject({ ok: true, routes: { jats: false, dom: false, abstract: true } });
  });
  test('planned site', () => {
    expect(inspectPage(html('pmc-article.html'), 'https://www.mdpi.com/2076-2615/11/5/1300')).toMatchObject({ ok: false, error: 'site_planned', siteName: 'MDPI' });
  });
});
