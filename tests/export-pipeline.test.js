import fs from 'fs';
import path from 'path';
import { exportArticle, inspectPage, jatsMatchesPage } from '@core/export/pipeline';

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
    const r = await exportArticle({ doc: html('pubmed-with-pmcid.html'), url: PUBMED_URL, fetchJats: notOa, now: NOW, allowAbstract: true });
    expect(r).toMatchObject({ ok: true, route: 'dom-pubmed', abstractOnly: true });
    expect(r.notices).toEqual([{ code: 'jats_fallback', reason: 'not_available' }, { code: 'abstract_only', fullTextUrl: 'https://doi.org/10.1186/s12711-025-00001-2' }]);
    expect(r.markdown.split('---\n')[2].trim().startsWith('> **Abstract only / 仅摘要**')).toBe(true);
  });

  test('no PMCID → abstract only without any network request', async () => {
    const r = await exportArticle({ doc: html('pubmed-abstract-only.html'), url: 'https://pubmed.ncbi.nlm.nih.gov/31768545/', fetchJats: ok, now: NOW, allowAbstract: true });
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

  test('without allowAbstract an abstract-only page creates no file and says where the full text is', async () => {
    const doc = html('europepmc-article.html');
    doc.getElementById('fulltextcontent').remove();
    const r = await exportArticle({ doc, url: 'https://europepmc.org/article/MED/33900001', fetchJats: notOa, now: NOW });
    expect(r).toMatchObject({ ok: false, error: 'abstract_only' });
    expect(r.markdown).toBeUndefined();
    expect(r.notices).toEqual([{ code: 'jats_fallback', reason: 'not_available' }]);
    const pm = await exportArticle({ doc: html('pubmed-with-pmcid.html'), url: PUBMED_URL, fetchJats: notOa, now: NOW });
    expect(pm).toMatchObject({ ok: false, error: 'abstract_only', fullTextUrl: 'https://doi.org/10.1186/s12711-025-00001-2' });
  });

  test('page without a body becomes abstract only', async () => {
    const doc = html('europepmc-article.html');
    doc.getElementById('fulltextcontent').remove();
    const r = await exportArticle({ doc, url: 'https://europepmc.org/article/MED/33900001', fetchJats: notOa, now: NOW, allowAbstract: true });
    expect(r).toMatchObject({ ok: true, route: 'dom-europepmc', abstractOnly: true });
  });
});

describe('JATS must belong to the page article (QA JM-01)', () => {
  const MED_URL = 'https://europepmc.org/article/MED/31862249';

  test('PMCIDs in citation lists are never used; MED page without full text → abstract only, no request', async () => {
    const doc = html('europepmc-med-no-fulltext.html');
    const info = inspectPage(doc, MED_URL);
    expect(info.ids).toEqual({ doi: '10.1016/S0140-6736(19)32500-0', pmid: '31862249', pmcid: '' });
    expect(info.routes.jats).toBe(false);
    const r = await exportArticle({ doc, url: MED_URL, fetchJats: ok, now: NOW, allowAbstract: true });
    expect(ok).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, route: 'dom-europepmc', abstractOnly: true, meta: { pmid: '31862249', pmcid: '' } });
    expect(r.markdown).not.toContain('PMC7756901');
  });

  test('fetched JATS for another article is rejected → abstract only with reason mismatch', async () => {
    const doc = html('pubmed-abstract-only.html');
    // 页面上的 PMCID 指错了（JATS fixture 是 PMID 40000001 / 另一个 DOI）
    const ids = doc.querySelector('#full-view-identifiers');
    ids.insertAdjacentHTML('beforeend', '<li><span class="identifier pmc"><a class="id-link">PMC11000001</a></span></li>');
    const r = await exportArticle({ doc, url: 'https://pubmed.ncbi.nlm.nih.gov/31768545/', fetchJats: ok, now: NOW, allowAbstract: true });
    expect(ok).toHaveBeenCalledWith('PMC11000001');
    expect(r).toMatchObject({ ok: true, route: 'dom-pubmed', abstractOnly: true, meta: { pmid: '31768545' } });
    expect(r.notices).toContainEqual({ code: 'jats_fallback', reason: 'mismatch' });
    expect(r.markdown).not.toContain('Genomic heritability');
  });

  test('jatsMatchesPage rules', () => {
    expect(jatsMatchesPage({ pmid: '1', doi: '10.1/a' }, { pmid: '1' })).toBe(true);
    expect(jatsMatchesPage({ pmid: '1', doi: '10.1/A' }, { pmid: '', doi: '10.1/a' })).toBe(true);
    expect(jatsMatchesPage({ pmid: '2', doi: '10.1/a' }, { pmid: '1', doi: '' })).toBe(false);
    expect(jatsMatchesPage({ pmid: '', doi: '', pmcid: 'PMC5' }, { pmid: '', doi: '' }, { pmcid: 'PMC5' })).toBe(true);
    expect(jatsMatchesPage({ pmid: '', doi: '', pmcid: 'PMC5' }, { pmid: '', doi: '' }, {})).toBe(false);
  });
});

describe('failure reasons', () => {
  const doc = html('pmc-article.html');
  test.each([
    ['https://example.com/paper', 'unsupported_page'],
    ['https://www.biorxiv.org/content/10.1101/2024.01.01.000001v1', 'site_planned'],
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
    expect(inspectPage(html('pmc-article.html'), 'https://www.biorxiv.org/content/10.1101/2024.01.01.000001v1')).toMatchObject({ ok: false, error: 'site_planned', siteName: 'bioRxiv / medRxiv' });
  });
});

describe('review nits N-A / N-B / N-D', () => {
  test('N-A: PMID and DOI comparable and different → mismatch even when the URL PMCID equals the JATS PMCID', () => {
    expect(jatsMatchesPage({ pmid: '1', doi: '10.1/a', pmcid: 'PMC9' }, { pmid: '2', doi: '10.1/b' }, { pmcid: 'PMC9' })).toBe(false);
  });

  test('N-B: XML without its own PMCID cannot vouch for the URL PMCID', async () => {
    const xml = '<article><front><article-meta><title-group><article-title>T</article-title></title-group><abstract><p>A</p></abstract></article-meta></front><body><sec><title>S</title><p>x</p></sec></body></article>';
    const { parseJats } = await import('@core/parsers/jats');
    const ir = parseJats(xml, { pmcid: 'PMC11000001' });
    expect(ir.meta.pmcid).toBe('');
    expect(jatsMatchesPage(ir.meta, {}, { pmcid: 'PMC11000001' })).toBe(false);
  });

  test('N-D: stale single-page DOM (URL PMID ≠ page PMID) is not exported', async () => {
    const doc = html('pubmed-with-pmcid.html');
    const r = await exportArticle({ doc, url: 'https://pubmed.ncbi.nlm.nih.gov/12345/', fetchJats: ok, now: NOW });
    expect(r).toEqual({ ok: false, error: 'page_changed' });
    expect(ok).not.toHaveBeenCalled();
  });
});

describe('QA JM-10: real Europe PMC pages (2026-10 layout)', () => {
  test('MED page without full text: abstract only, no site chrome, no affiliation numbers', async () => {
    const r = await exportArticle({ doc: html('europepmc-med-31862249.html'), url: 'https://europepmc.org/article/MED/31862249', fetchJats: ok, now: NOW, allowAbstract: true });
    expect(ok).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, route: 'dom-europepmc', abstractOnly: true, meta: { pmid: '31862249', pmcid: '', doi: '10.1016/s0140-6736(19)32500-0' } });
    const md = r.markdown;
    expect(md).toContain('abstract_only: true');
    expect(md.match(/^## Abstract$/gm)).toHaveLength(1);
    expect(md).toContain('### Background');
    for (const chrome of ['Author information', 'Full text links', 'Partnerships', 'Share this article', 'Similar Articles', 'Citations & impact', '<sup>']) {
      expect(md).not.toContain(chrome);
    }
    expect(md).toMatch(/^authors: \[Lagae L, Sullivan J, /m);
    expect(md).toContain('journal: "Lancet (London, England)"');
  });

  test('PMC page: IDs come from the citation line; JATS is preferred', async () => {
    const doc = html('europepmc-pmc-7095418.html');
    const xml = fs.readFileSync(path.join(__dirname, 'fixtures/jats/europepmc-PMC7095418.xml'), 'utf8');
    const fetchJats = jest.fn(async () => ({ ok: true, xml }));
    const r = await exportArticle({ doc, url: 'https://europepmc.org/article/PMC/PMC7095418', fetchJats, now: NOW });
    expect(fetchJats).toHaveBeenCalledWith('PMC7095418');
    expect(r).toMatchObject({ ok: true, route: 'jats-europepmc', meta: { pmid: '32015507', pmcid: 'PMC7095418' } });
  });
});

test('N-D does not compare DOIs guessed from publisher URLs', async () => {
  const doc = new DOMParser().parseFromString('<meta name="citation_title" content="T"><meta name="citation_doi" content="10.1038/nature12373"><article><div class="main-content"><section><h2>Intro</h2><p>Body.</p></section></div></article>', 'text/html');
  const r = await exportArticle({ doc, url: 'https://www.nature.com/articles/s99999-000-00000-0', fetchJats: ok, settings: { preferJats: false }, now: NOW });
  expect(r).toMatchObject({ ok: true, route: 'dom-nature' });
});

test('QA JM-M2-06: a placeholder "undefined" author name from the page is dropped', async () => {
  const doc = html('europepmc-med-31862249.html');
  const names = doc.querySelectorAll('.metadata--author-name');
  names[names.length - 1].textContent = 'undefined';
  const r = await exportArticle({ doc, url: 'https://europepmc.org/article/MED/31862249', fetchJats: ok, now: NOW, allowAbstract: true });
  expect(r.markdown).toMatch(/^authors: \[Lagae L, .*Ceulemans B\]$/m);
  expect(r.markdown).not.toContain('undefined');
});

describe('only an abstract on the page → legal free version elsewhere', () => {
  const PREPRINT = fs.readFileSync(path.join(__dirname, 'fixtures/jats/preprint-synthetic.xml'), 'utf8');
  const source = { kind: 'preprint', server: 'biorxiv', doi: '10.1101/2024.01.01.000001', url: 'https://www.biorxiv.org/content/10.1101/2024.01.01.000001v2', version: '2', date: '2024-02-01' };

  test('PubMed page: bioRxiv preprint JATS becomes the body; citation stays the published article', async () => {
    const findOpenVersion = jest.fn(async () => ({ ok: true, xml: PREPRINT, route: 'jats-preprint', source, links: [] }));
    const r = await exportArticle({ doc: html('pubmed-with-pmcid.html'), url: PUBMED_URL, fetchJats: notOa, services: { findOpenVersion }, now: NOW });
    expect(findOpenVersion).toHaveBeenCalledWith('10.1186/s12711-025-00001-2');
    expect(r).toMatchObject({ ok: true, route: 'jats-preprint', abstractOnly: false, meta: { doi: '10.1186/s12711-025-00001-2' } });
    expect(r.notices).toContainEqual({ code: 'open_version', ...source });
    expect(r.markdown).toContain('fulltext_source: "https://www.biorxiv.org/content/10.1101/2024.01.01.000001v2"');
    expect(r.markdown).toContain('> **Full text from another version / 全文来自其他版本** — bioRxiv preprint v2 (2024-02-01)');
    expect(r.markdown).toContain('## Methods');
    expect(r.markdown).not.toMatch(/^abstract_only:/m);
    expect(r.markdown).not.toContain('000001v1_fig1.tif');
  });

  test('a PMC copy must be the same article (DOI)', async () => {
    const other = JATS.replace('10.1186/s12711-025-00001-2', '10.1/someone-else');
    const findOpenVersion = jest.fn(async () => ({ ok: true, xml: other, route: 'jats-europepmc', source: { kind: 'pmc', pmcid: 'PMC9', url: 'https://x', version: 'acceptedVersion' }, links: [] }));
    const r = await exportArticle({ doc: html('pubmed-with-pmcid.html'), url: PUBMED_URL, fetchJats: notOa, services: { findOpenVersion }, now: NOW });
    expect(r).toMatchObject({ ok: false, error: 'abstract_only' });
  });

  test('links only → abstract-only failure carries them for the popup', async () => {
    const links = [{ kind: 'arxiv', url: 'https://arxiv.org/abs/2401.01234', pdfUrl: '', version: 'submittedVersion', repository: '', license: '' }];
    const findOpenVersion = jest.fn(async () => ({ ok: false, reason: 'links_only', links }));
    const doc = html('europepmc-article.html');
    doc.getElementById('fulltextcontent').remove();
    const r = await exportArticle({ doc, url: 'https://europepmc.org/article/MED/33900001', fetchJats: notOa, services: { findOpenVersion }, now: NOW });
    expect(r).toMatchObject({ ok: false, error: 'abstract_only', openVersions: links });
  });

  test('turned off in settings, or exporting the abstract on purpose: no lookup', async () => {
    const findOpenVersion = jest.fn();
    await exportArticle({ doc: html('pubmed-with-pmcid.html'), url: PUBMED_URL, fetchJats: notOa, services: { findOpenVersion }, settings: { findOpenVersions: false }, now: NOW });
    await exportArticle({ doc: html('pubmed-with-pmcid.html'), url: PUBMED_URL, fetchJats: notOa, services: { findOpenVersion }, now: NOW, allowAbstract: true });
    expect(findOpenVersion).not.toHaveBeenCalled();
  });
});
