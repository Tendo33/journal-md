import { detectSite, SITES, SUPPORTED_SITE_IDS, SUPPORTED_PAGE_PATTERNS } from '@core/sites/registry';
const manifest = require('../src/manifest.json');

describe('detectSite', () => {
  test.each([
    ['https://pmc.ncbi.nlm.nih.gov/articles/PMC11000001/', 'pmc', true, { pmcid: 'PMC11000001' }],
    ['https://pmc.ncbi.nlm.nih.gov/articles/PMC11000001', 'pmc', true, { pmcid: 'PMC11000001' }],
    ['https://pmc.ncbi.nlm.nih.gov/search/?term=chicken', 'pmc', false, {}],
    ['https://pubmed.ncbi.nlm.nih.gov/31768545/', 'pubmed', true, { pmid: '31768545' }],
    ['https://pubmed.ncbi.nlm.nih.gov/?term=duck', 'pubmed', false, {}],
    ['https://europepmc.org/article/MED/31768545', 'europepmc', true, { pmid: '31768545', source: 'MED' }],
    ['https://europepmc.org/article/PMC/PMC7000002', 'europepmc', true, { pmcid: 'PMC7000002', source: 'PMC' }],
    ['https://europepmc.org/abstract/MED/123#abstract', 'europepmc', true, { pmid: '123', source: 'MED' }],
    ['https://europepmc.org/articles/PMC7000002', 'europepmc', true, { pmcid: 'PMC7000002', source: 'PMC' }],
    ['https://europepmc.org/search?query=duck', 'europepmc', false, {}],
  ])('%s', (url, id, isArticle, ids) => {
    const r = detectSite(url);
    expect(r.site.id).toBe(id);
    expect(r.supported).toBe(true);
    expect(r.isArticle).toBe(isArticle);
    expect(r.ids).toEqual(ids);
  });

  test.each([
    ['https://gsejournal.biomedcentral.com/articles/10.1186/s12711-020-00531-3', 'springer'],
    ['https://link.springer.com/article/10.1007/x', 'springer'],
    ['https://www.nature.com/articles/s41598-020-1', 'nature'],
    ['https://www.frontiersin.org/articles/10.3389/fgene.2021.1/full', 'frontiers'],
    ['https://www.mdpi.com/2076-2615/11/5/1300', 'mdpi'],
    ['https://journals.plos.org/plosone/article?id=10.1371/journal.pone.1', 'plos'],
    ['https://elifesciences.org/articles/12345', 'elife'],
  ])('planned P0 site %s → %s (not yet supported)', (url, id) => {
    const r = detectSite(url);
    expect(r.site.id).toBe(id);
    expect(r.supported).toBe(false);
  });

  test('unknown, malformed and non-http URLs', () => {
    expect(detectSite('https://www.sciencedirect.com/science/article/pii/1').site).toBeNull();
    expect(detectSite('chrome://extensions').site).toBeNull();
    expect(detectSite('not a url').site).toBeNull();
    expect(detectSite('https://evilbiomedcentral.com/x').site).toBeNull();
  });

  test('every registry host is covered by a manifest host permission', () => {
    const hostPerms = manifest.host_permissions.map((h) => h.replace(/^https:\/\//, '').replace(/\/.*$/, ''));
    for (const s of SITES) for (const h of s.hosts) expect(hostPerms).toContain(h);
  });

  test('content scripts only run on M1 supported sites', () => {
    expect(SUPPORTED_SITE_IDS).toEqual(['pmc', 'europepmc', 'pubmed']);
    expect(manifest.content_scripts[0].matches).toEqual(SUPPORTED_PAGE_PATTERNS);
  });
});
