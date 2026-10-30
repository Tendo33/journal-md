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
    ['https://gsejournal.biomedcentral.com/articles/10.1186/s12711-020-00531-3', 'springer', true, { doi: '10.1186/s12711-020-00531-3' }],
    ['https://link.springer.com/article/10.1186/s13059-014-0550-8', 'springer', true, { doi: '10.1186/s13059-014-0550-8' }],
    ['https://link.springer.com/article/10.1186/gb-2014-15-3-r46/tables/1', 'springer', false, {}],
    ['https://link.springer.com/search?query=x', 'springer', false, {}],
    ['https://www.nature.com/articles/s41586-021-03819-2', 'nature', true, { doi: '10.1038/s41586-021-03819-2' }],
    ['https://www.nature.com/articles/s41586-021-03819-2.pdf', 'nature', false, {}],
    ['https://www.nature.com/srep/', 'nature', false, {}],
    ['https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2013.00863/full', 'frontiers', true, { doi: '10.3389/fpsyg.2013.00863' }],
    ['https://www.frontiersin.org/articles/10.3389/fgene.2021.1/full', 'frontiers', true, { doi: '10.3389/fgene.2021.1' }],
    ['https://www.mdpi.com/2076-2615/11/5/1300', 'mdpi', true, {}],
    ['https://www.mdpi.com/2076-2615/11/5/1300/htm', 'mdpi', true, {}],
    ['https://www.mdpi.com/journal/animals', 'mdpi', false, {}],
    ['https://journals.plos.org/plosone/article?id=10.1371/journal.pone.1', 'plos', true, { doi: '10.1371/journal.pone.1' }],
    ['https://journals.plos.org/plosone/search?q=x', 'plos', false, {}],
    ['https://elifesciences.org/articles/09560', 'elife', true, { doi: '10.7554/eLife.09560' }],
    ['https://elifesciences.org/subjects/neuroscience', 'elife', false, {}],
  ])('publisher page %s → %s', (url, id, isArticle, ids) => {
    const r = detectSite(url);
    expect(r.site.id).toBe(id);
    expect(r.site.publisher).toBe(true);
    expect(r.supported).toBe(true);
    expect(r.isArticle).toBe(isArticle);
    expect(r.ids).toEqual(ids);
  });

  test('P1 sites are recognised as planned and request no permission', () => {
    const r = detectSite('https://www.sciencedirect.com/science/article/pii/1');
    expect(r.site.id).toBe('sciencedirect');
    expect(r.supported).toBe(false);
  });

  test('unknown, malformed and non-http URLs', () => {
    expect(detectSite('https://example.org/article/1').site).toBeNull();
    expect(detectSite('chrome://extensions').site).toBeNull();
    expect(detectSite('not a url').site).toBeNull();
    expect(detectSite('https://evilbiomedcentral.com/x').site).toBeNull();
  });

  test('supported sites are covered by host permissions; planned sites request none', () => {
    const hostPerms = manifest.host_permissions.map((h) => h.replace(/^https:\/\//, '').replace(/\/.*$/, ''));
    for (const s of SITES) {
      for (const h of s.hosts) {
        if (s.status === 'supported') expect(hostPerms).toContain(h);
        else expect(hostPerms).not.toContain(h);
      }
    }
  });

  test('content scripts only run on supported sites', () => {
    expect(SUPPORTED_SITE_IDS).toEqual(['pmc', 'europepmc', 'pubmed', 'springer', 'nature', 'frontiers', 'mdpi', 'plos', 'elife']);
    expect(manifest.content_scripts[0].matches).toEqual(SUPPORTED_PAGE_PATTERNS);
  });
});
