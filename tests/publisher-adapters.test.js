// 六个出版商站点的适配器测试。fixture 是 2026-10-30 抓取的真实页面（裁剪过，见各文件开头的注释）。
import fs from 'fs';
import path from 'path';
import { exportArticle, inspectPage, siteXmlUrl, domAssetResolver } from '@core/export/pipeline';
import { lookupPmcidByDoi, searchByDoiUrl, createDoiLookupService } from '@core/europepmc/client';

const NOW = new Date(Date.UTC(2026, 9, 30, 2, 0));
const read = (p) => fs.readFileSync(path.join(__dirname, 'fixtures', p), 'utf8');
const html = (name) => new DOMParser().parseFromString(read(`html/${name}`), 'text/html');
const noJats = jest.fn(async () => ({ ok: false, reason: 'not_available' }));
const noLookup = jest.fn(async () => ({ ok: false, reason: 'not_found' }));
const dom = (name, url, extra = {}) => exportArticle({ doc: html(name), url, fetchJats: noJats, services: { lookupDoi: noLookup }, now: NOW, ...extra });

beforeEach(() => jest.clearAllMocks());

describe('Springer Link / BMC (DESeq2, Genome Biology)', () => {
  const URL = 'https://link.springer.com/article/10.1186/s13059-014-0550-8';
  let r;
  beforeAll(async () => { r = await dom('springer-deseq2.html', URL); });

  test('metadata', () => {
    expect(r).toMatchObject({ ok: true, route: 'dom-springer', abstractOnly: false, meta: { doi: '10.1186/s13059-014-0550-8', license: 'CC-BY-4.0' } });
    expect(r.markdown).toContain('authors: [Michael I Love, Wolfgang Huber, Simon Anders]');
    expect(r.markdown).toContain('journal: Genome Biology');
    expect(r.markdown).toContain('year: 2014');
    expect(r.markdown).toContain('**Keywords:** Read Count; Differential Expression Analysis');
  });

  test('body sections, no site chrome', () => {
    for (const h of ['## Abstract', '## Background', '## Results and discussion', '### Model and normalization', '## Conclusions', '## Materials and methods', '## Abbreviations', '## Acknowledgements', '## Competing interests']) {
      expect(r.markdown).toContain(`\n${h}\n`);
    }
    for (const junk of ['Author information', 'Rights and permissions', 'About this article', 'Similar content being viewed', 'Full size image', 'Cite this article']) {
      expect(r.markdown).not.toContain(junk);
    }
    expect(r.markdown).toContain('- **FDR**: False discovery rate');
  });

  test('formulas: inline and display MathML → TeX', () => {
    expect(r.markdown).toContain('$\\underset{2}{\\log}q_{\\text{ij}}=\\sum_r x_{\\text{jr}}\\beta_{\\text{ir}}$');
    expect(r.markdown).toMatch(/\$\$\n\\begin\{array\}\{cc\} K_\{\\text\{ij\}\} & \\sim\\text\{NB\}/);
    expect(r.markdown.match(/^\$\$$/gm).length).toBeGreaterThanOrEqual(8);
    expect(r.markdown).toContain('*K* <sub>*ij*</sub>');
  });

  test('figures: image, label, caption; same-page figure links become text', () => {
    expect(r.markdown).toContain('![Figure 1 Shrinkage estimation of dispersion.](https://media.springernature.com/lw685/springer-static/image/art%3A10.1186%2Fs13059-014-0550-8/MediaObjects/13059_2014_Article_550_Fig1_HTML.jpg)');
    expect(r.markdown).toContain('> **Figure 1** **Shrinkage estimation of dispersion.** Plot of dispersion estimates');
    expect(r.markdown).toContain('(black dots in Figure 1)');
    expect(r.markdown).not.toContain('#Fig1)');
  });

  test('references: one footnote each, DOI as link, citations linked', () => {
    expect(r.markdown.match(/^\[\^\d+\]: /gm)).toHaveLength(66);
    expect(r.markdown).toContain('[^2]: Robinson MD, Smyth GK: Moderated statistical tests for assessing differences in tag abundance . Bioinformatics. 2007, 23: 2881-2887. https://doi.org/10.1093/bioinformatics/btm453.');
    expect(r.markdown).toContain('*edgeR* [^2],[^3] moderates');
  });

  test('supplementary file listed once with a clean label', () => {
    expect(r.markdown).toContain('- [Additional file 1: Supplementary methods, tables and figures. (PDF 1 MB)](https://media.springernature.com/original/springer-static/esm/');
  });
});

describe('Springer Link inline tables (Kraken)', () => {
  test('table caption + link to the full table page', async () => {
    const r = await dom('springer-kraken.html', 'https://link.springer.com/article/10.1186/gb-2014-15-3-r46');
    expect(r.markdown).toContain('**Table 1** **Genus-level classification accuracy for three simulated metagenomes**\n\n*Table content is on a separate page: [full table](https://link.springer.com/article/10.1186/gb-2014-15-3-r46/tables/1)*');
    expect(r.markdown).toContain('/tables/2)*');
  });
});

describe('Nature (AlphaFold)', () => {
  let r;
  beforeAll(async () => { r = await dom('nature-alphafold.html', 'https://www.nature.com/articles/s41586-021-03819-2'); });

  test('metadata and sections', () => {
    expect(r).toMatchObject({ ok: true, route: 'dom-nature', meta: { doi: '10.1038/s41586-021-03819-2', license: 'CC-BY-4.0' } });
    expect(r.markdown).toMatch(/^authors: \[John Jumper, Richard Evans, /m);
    expect(r.markdown).toContain('journal: Nature');
    for (const h of ['## Main', '## Methods', '### Inputs and data sources', '## Data availability', '## Acknowledgements', '## Competing interests']) expect(r.markdown).toContain(`\n${h}\n`);
    expect(r.markdown).not.toContain('Peer review information');
  });

  test('figure label and title split, 84 references with DOIs', () => {
    expect(r.markdown).toContain('> **Fig. 1** **AlphaFold produces highly accurate structures**');
    expect(r.markdown.match(/^!\[Fig\. \d/gm)).toHaveLength(5);
    expect(r.markdown.match(/^\[\^\d+\]: /gm)).toHaveLength(84);
    expect(r.markdown).toContain('[^1]: Thompson, M. C., Yeates, T. O. & Rodriguez, J. A. Advances in methods for atomic resolution macromolecular structure determination. *F1000Res*. **9**, 667 (2020). https://doi.org/10.12688/f1000research.25097.1');
    expect(r.markdown).toContain('- [Supplementary Video 1](https://media.springernature.com/');
  });
});

describe('Frontiers (Lakens 2013)', () => {
  const URL = 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2013.00863/full';
  const XML = read('jats/frontiers-fpsyg-2013-00863.xml');

  test('L1: same-site XML (citation_xml_url) is preferred; Europe PMC is not asked', async () => {
    const fetchSiteXml = jest.fn(async () => ({ ok: true, xml: XML }));
    const r = await exportArticle({ doc: html('frontiers-effect-sizes.html'), url: URL, fetchJats: noJats, services: { lookupDoi: noLookup, fetchSiteXml }, now: NOW });
    expect(fetchSiteXml).toHaveBeenCalledWith('https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2013.00863/xml');
    expect(noLookup).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, route: 'jats-frontiers', meta: { doi: '10.3389/fpsyg.2013.00863', license: 'CC-BY-3.0' } });
    expect(r.markdown.match(/^\$\$$/gm).length / 2).toBe(24);
    expect(r.markdown).toContain('d_s=\\frac{{\\bar{X}}_1-{\\bar{X}}_2}{\\sqrt{');
    expect(r.markdown.match(/^\[\^\d+\]: /gm)).toHaveLength(45);
    expect(r.markdown.match(/^## Supplementary material$/gm)).toHaveLength(1);
    expect(r.markdown).toContain('| **ES** | **Standardizer** | **Use** |');
  });

  test('L2 DOM: MathJax CHTML formulas, button citations, tables, references', async () => {
    const r = await dom('frontiers-effect-sizes.html', URL, { settings: { preferJats: false } });
    expect(r).toMatchObject({ ok: true, route: 'dom-frontiers' });
    expect(r.markdown).toContain('authors: [Daniel Lakens]');
    expect(r.markdown.match(/^\$\$$/gm).length / 2).toBe(24);
    expect(r.markdown).toContain('(Cohen, 1988[^7])');
    expect(r.markdown).toContain('**Table 1** **Summary of d family effect sizes, standardizers, and their recommended use**.');
    expect(r.markdown).toContain('[^1]: Aberson C. L. (2010). *Applied Power Analysis for the Behavioral Sciences*. New York, NY: Routledge.');
    expect(r.markdown.match(/^\[\^\d+\]: /gm)).toHaveLength(45);
    expect(r.markdown.match(/^## Abstract$/gm)).toHaveLength(1);
    expect(r.markdown).toContain('1\\. ESCI can be downloaded');
  });

  test('XML from another site is never used', () => {
    const doc = new DOMParser().parseFromString('<meta name="citation_xml_url" content="https://evil.example/x.xml">', 'text/html');
    expect(siteXmlUrl(doc, URL)).toBe('');
  });

  test('XML image names resolve to images on the page', () => {
    const doc = new DOMParser().parseFromString('<img src="/files/Articles/1/fpsyg-04-00863-g001.jpg">', 'text/html');
    expect(domAssetResolver(doc, URL)('fpsyg-04-00863-g001.tif', 'image')).toBe('https://www.frontiersin.org/files/Articles/1/fpsyg-04-00863-g001.jpg');
    expect(domAssetResolver(doc, URL)('fpsyg-04-00863-g002.tif', 'image')).toBe('');
  });
});

describe('MDPI (Animals 11:1300)', () => {
  let r;
  beforeAll(async () => { r = await dom('mdpi-animals-11-01300.html', 'https://www.mdpi.com/2076-2615/11/5/1300'); });

  test('metadata from citation_* tags', () => {
    expect(r).toMatchObject({ ok: true, route: 'dom-mdpi', meta: { doi: '10.3390/ani11051300', license: 'CC-BY-4.0' } });
    expect(r.markdown).toContain('**Keywords:** cat; multi-cat environment; fecal cortisol; intestinal parasites; housing conditions');
    expect(r.markdown).toMatch(/^authors: \[Xavier Blasco, Xavier Manteca, Manel López-Béjar/m);
  });

  test('sections incl. Simple Summary; funding and conflicts go to the back', () => {
    for (const h of ['## Simple Summary', '## 1. Introduction', '### 2.1. Study Population', '#### Steroid Validation Test', '## 5. Conclusions', '## Funding', '## Competing interests']) expect(r.markdown).toContain(`\n${h}\n`);
    expect(r.markdown).toContain('*Felis catus*');
  });

  test('tables come from the hidden popup container; span citations become footnotes', () => {
    expect(r.markdown).toContain('**Table 1** Prevalence of intestinal parasites detected in samples');
    expect(r.markdown).toContain('| Cat fecal samples (*n*) | *n* = 157 | *n* = 104 | *n* = 107 | *n* = 368 |');
    expect(r.markdown).toContain('has also increased [^1],[^2].');
    expect(r.markdown.match(/^\[\^\d+\]: /gm)).toHaveLength(44);
  });
});

describe('PLOS (Ioannidis 2005)', () => {
  let r;
  beforeAll(async () => { r = await dom('plos-pmed-0020124.html', 'https://journals.plos.org/plosmedicine/article?id=10.1371/journal.pmed.0020124'); });

  test('metadata; licence from the copyright text', () => {
    expect(r).toMatchObject({ ok: true, route: 'dom-plos', meta: { doi: '10.1371/journal.pmed.0020124', license: 'CC-BY' } });
    expect(r.markdown).toContain('journal: PLOS Medicine');
  });

  test('tables shown as images, large figure images, no correction notice or carousel', () => {
    expect(r.markdown).toContain('**Table 1** Research Findings and True Relationships\n\n![Table 1 Research Findings and True Relationships](https://journals.plos.org/plosmedicine/article/figure/image?size=large&id=10.1371/journal.pmed.0020124.t001)');
    expect(r.markdown).toContain('/article/figure/image?size=large&id=10.1371/journal.pmed.0020124.g001)');
    expect(r.markdown).not.toContain('## Figures');
    expect(r.markdown).not.toContain('## Correction');
  });

  test('citation ranges expand ([1–3] links only to ref 1 on the page)', () => {
    expect(r.markdown).toContain('studies [^1][^2][^3] to the most modern');
    expect(r.markdown.match(/^\[\^\d+\]: /gm)).toHaveLength(37);
  });
});

describe('eLife (Homo naledi)', () => {
  let r;
  beforeAll(async () => { r = await dom('elife-09560.html', 'https://elifesciences.org/articles/09560'); });

  test('metadata from Dublin Core tags only', () => {
    expect(r).toMatchObject({ ok: true, route: 'dom-elife', meta: { doi: '10.7554/eLife.09560', license: 'CC-BY-4.0' } });
    // 没有 citation_pdf_url：PDF 地址来自页面上的「Article PDF」下载链接（L3 PDF 解析用）
    expect(r.meta.pdfUrl).toMatch(/^https:\/\/elifesciences\.org\/download\/.+\/elife-09560-v1\.pdf\?/);
    expect(r.markdown).toContain('journal: eLife');
    expect(r.markdown).toMatch(/^authors: \[Lee R Berger, John Hawks, /m);
  });

  test('section headings inside toggles, figures, wide tables as HTML', () => {
    for (const h of ['## eLife digest', '## Introduction', '### Etymology', '## Differential diagnosis', '## Materials and methods', '## Acknowledgements', '## Funding']) expect(r.markdown).toContain(`\n${h}\n`);
    expect(r.markdown).toContain('![Figure 1 Dinaledi skeletal specimens.](https://iiif.elifesciences.org/lax/09560%2Felife-09560-fig1-v1.tif/full/617,/0/default.jpg)');
    expect(r.markdown).toContain('**Table 1** Cranial and mandibular measurements for *H. naledi*, early hominins, and modern humans\n\n<table>');
    expect(r.markdown).not.toContain('Author details');
  });

  test('author-year citations keep their text; references are one line', () => {
    expect(r.markdown).toContain('(Dirks et al., 2015[^17])');
    expect(r.markdown).toContain('[^1]: Alemseged Z, Spoor F, Kimbel WH, Bobe R, Geraads D, Reed D, Wynn JG (2006) A juvenile early hominin skeleton from Dikika, Ethiopia. *Nature* **443**:296–301. https://doi.org/10.1038/nature05047');
  });
});

describe('publisher pages: Europe PMC by DOI', () => {
  const URL = 'https://link.springer.com/article/10.1186/s13059-014-0550-8';
  const JATS = read('jats/europepmc-full.xml');

  test('open-access hit → Europe PMC JATS, but only when the JATS DOI matches the page', async () => {
    const lookupDoi = jest.fn(async () => ({ ok: true, pmcid: 'PMC11000001' }));
    const fetchJats = jest.fn(async () => ({ ok: true, xml: JATS }));
    const r = await exportArticle({ doc: html('springer-deseq2.html'), url: URL, fetchJats, services: { lookupDoi }, now: NOW });
    expect(lookupDoi).toHaveBeenCalledWith('10.1186/s13059-014-0550-8');
    expect(fetchJats).toHaveBeenCalledWith('PMC11000001');
    // fixture JATS is a different article → refused, page DOM used
    expect(r).toMatchObject({ ok: true, route: 'dom-springer' });
    expect(r.notices).toContainEqual({ code: 'jats_fallback', reason: 'mismatch' });
  });

  test('matching DOI → jats-europepmc with the page URL and licence kept', async () => {
    const xml = JATS.replace(/<article-id pub-id-type="doi">[^<]*</, '<article-id pub-id-type="doi">10.1186/s13059-014-0550-8<');
    const r = await exportArticle({ doc: html('springer-deseq2.html'), url: URL, fetchJats: async () => ({ ok: true, xml }), services: { lookupDoi: async () => ({ ok: true, pmcid: 'PMC11000001' }) }, now: NOW });
    expect(r).toMatchObject({ ok: true, route: 'jats-europepmc', meta: { pmcid: 'PMC11000001' } });
    expect(r.markdown).toContain(`url: "${URL}"`);
  });

  test('not open access → page DOM with a notice; preferJats off → no request at all', async () => {
    const r = await exportArticle({ doc: html('nature-alphafold.html'), url: 'https://www.nature.com/articles/s41586-021-03819-2', fetchJats: noJats, services: { lookupDoi: async () => ({ ok: false, reason: 'not_available' }) }, now: NOW });
    expect(r.route).toBe('dom-nature');
    expect(r.notices).toContainEqual({ code: 'jats_fallback', reason: 'not_available' });
    const lookupDoi = jest.fn();
    await exportArticle({ doc: html('nature-alphafold.html'), url: 'https://www.nature.com/articles/s41586-021-03819-2', fetchJats: noJats, services: { lookupDoi }, settings: { preferJats: false }, now: NOW });
    expect(lookupDoi).not.toHaveBeenCalled();
  });

  test('popup inspection offers JATS (checked on export) without any request', () => {
    const info = inspectPage(html('plos-pmed-0020124.html'), 'https://journals.plos.org/plosmedicine/article?id=10.1371/journal.pmed.0020124');
    expect(info).toMatchObject({ ok: true, siteId: 'plos', routes: { jats: true, dom: true } });
    expect(noLookup).not.toHaveBeenCalled();
  });
});

describe('Europe PMC search client', () => {
  const SEARCH = JSON.parse(read('json/europepmc-search-deseq2.json'));

  test('query URL carries only the DOI', () => {
    expect(searchByDoiUrl('https://doi.org/10.1186/s13059-014-0550-8')).toBe('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI%3A%2210.1186%2Fs13059-014-0550-8%22&resultType=lite&format=json&pageSize=5');
  });

  test('OA hit → PMCID; non-OA and missing hits are distinguished', async () => {
    const res = (json) => async () => ({ ok: true, status: 200, json: async () => json });
    await expect(lookupPmcidByDoi('10.1186/s13059-014-0550-8', { fetchImpl: res(SEARCH) })).resolves.toEqual({ ok: true, pmcid: 'PMC4302049', openAccess: true });
    const closed = JSON.parse(JSON.stringify(SEARCH));
    closed.resultList.result[0].isOpenAccess = 'N';
    await expect(lookupPmcidByDoi('10.1186/s13059-014-0550-8', { fetchImpl: res(closed) })).resolves.toMatchObject({ ok: false, reason: 'not_available' });
    await expect(lookupPmcidByDoi('10.1000/other', { fetchImpl: res(SEARCH) })).resolves.toEqual({ ok: false, reason: 'not_found' });
    await expect(lookupPmcidByDoi('', { fetchImpl: res(SEARCH) })).resolves.toEqual({ ok: false, reason: 'invalid_id' });
  });

  test('cache: definite answers are cached, network errors are retried', async () => {
    const fetchImpl = jest.fn(async () => { throw new TypeError('offline'); });
    const svc = createDoiLookupService({ fetchImpl });
    await expect(svc.get('10.1000/x')).resolves.toEqual({ ok: false, reason: 'network' });
    await svc.get('10.1000/x');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const ok = jest.fn(async () => ({ ok: true, status: 200, json: async () => SEARCH }));
    const svc2 = createDoiLookupService({ fetchImpl: ok });
    await svc2.get('10.1186/S13059-014-0550-8');
    await svc2.get('10.1186/s13059-014-0550-8');
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
