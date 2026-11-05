// 订阅出版商的页面适配器：Wiley、Cell、Oxford Academic、Taylor & Francis。
// fixtures 只保留真实页面的结构（标签、class、属性），文字都是占位。
import fs from 'fs';
import path from 'path';
import { exportArticle } from '@core/export/pipeline';
import { detectSite } from '@core/sites/registry';

const NOW = new Date(Date.UTC(2026, 10, 5, 2, 0));
const html = (n) => new DOMParser().parseFromString(fs.readFileSync(path.join(__dirname, 'fixtures/html', n), 'utf8'), 'text/html');
const noJats = async () => ({ ok: false, reason: 'not_available' });
const noLookup = async () => ({ ok: false, reason: 'not_found' });
const run = (file, url) => exportArticle({ doc: html(file), url, fetchJats: noJats, services: { lookupDoi: noLookup }, now: NOW, settings: { findOpenVersions: false } });

describe('article URLs', () => {
  test.each([
    ['https://onlinelibrary.wiley.com/doi/full/10.1002/advs.202004929', 'wiley', { doi: '10.1002/advs.202004929' }],
    ['https://onlinelibrary.wiley.com/doi/10.1111/jcmm.17000', 'wiley', { doi: '10.1111/jcmm.17000' }],
    ['https://agupubs.onlinelibrary.wiley.com/doi/abs/10.1029/2020GL000001', 'wiley', { doi: '10.1029/2020GL000001' }],
    ['https://www.cell.com/cell/fulltext/S0092-8674(20)30229-4', 'cell', {}],
    ['https://www.cell.com/cell/fulltext/S0092-8674%2820%2930229-4', 'cell', {}],
    ['https://academic.oup.com/nar/article/49/D1/D480/6006196', 'oup', {}],
    ['https://www.tandfonline.com/doi/full/10.1080/22221751.2020.1719902', 'tandf', { doi: '10.1080/22221751.2020.1719902' }],
  ])('%s', (url, id, ids) => {
    const d = detectSite(url);
    expect(d).toMatchObject({ supported: true, isArticle: true, ids });
    expect(d.site.id).toBe(id);
  });

  test.each([
    'https://onlinelibrary.wiley.com/doi/epdf/10.1002/advs.202004929',
    'https://onlinelibrary.wiley.com/doi/pdf/10.1002/advs.202004929',
    'https://onlinelibrary.wiley.com/journal/21983844',
    'https://www.cell.com/cell/home',
    'https://www.cell.com/cell/pdf/S0092-8674(20)30229-4.pdf',
    'https://academic.oup.com/nar/article-pdf/49/D1/D480/35364103/gkaa1100.pdf',
    'https://academic.oup.com/nar/issue/49/D1',
    'https://www.tandfonline.com/doi/pdf/10.1080/22221751.2020.1719902',
    'https://www.tandfonline.com/toc/temi20/current',
  ])('not an article page: %s', (url) => {
    expect(detectSite(url).isArticle).toBe(false);
  });
});

describe('Wiley', () => {
  test('sections, figure, citations, references with DOI, supporting files, back matter', async () => {
    const r = await run('wiley-structure.html', 'https://onlinelibrary.wiley.com/doi/full/10.1002/advw.202100001');
    expect(r).toMatchObject({ ok: true, route: 'dom-wiley', meta: { doi: '10.1002/advw.202100001', pdfUrl: 'https://onlinelibrary.wiley.com/doi/pdf/10.1002/advw.202100001' } });
    const md = r.markdown;
    expect(md).toContain('authors: [Ada Example, Ben Sample]');
    expect(md).toContain('## 1 Introduction\n\nWidgets crease in two ways.[^1] See Figure 1.');
    expect(md).toContain('### 2.1 Crease Counts');
    expect(md).toContain('> **Figure 1** Two folding modes of a widget.');
    expect(md).not.toMatch(/Open in figure viewer|PowerPoint|Citing Literature|Web of Science/);
    expect(md).toContain('[^1]: A. Example, B. Sample, *Widget J.*, 2019, 3, 12. https://doi.org/10.1000/widget.1');
    expect(md).toContain('## Competing interests\n\nThe authors declare no conflict of interest.');
    expect(md).toContain('— Supporting Information');
  });
});

describe('Cell', () => {
  test('highlights as a list, citation popups dropped, large figure image, key resources table', async () => {
    const r = await run('cell-structure.html', 'https://www.cell.com/wcell/fulltext/S0000-0000(20)00001-1');
    expect(r).toMatchObject({ ok: true, route: 'dom-cell' });
    const md = r.markdown;
    expect(md).toContain('### Highlights\n\n- Widgets need two hinges\n- A cheap clip blocks the second hinge');
    expect(md).toContain('### Summary\n\nWe show that widgets enter boxes through two hinges.');
    expect(md).toContain('Hinges matter(Example et al., 2019)[^1], as Figure 1 shows.');
    // 再次引用同一条文献：弹层 id 带序号（sref1-1）
    expect(md).toContain('Adding the clip stopped all entries(Example et al., 2019)[^1].');
    expect(md).not.toContain('Popup copy again');
    expect(md).not.toContain('Popup copy of the reference');
    expect(md).toContain('(https://www.cell.com/cms/asset/a/gr1_lrg.jpg)');
    expect(md).not.toMatch(/Graphical abstract|Figure viewer|Show full caption/);
    expect(md).toContain('| Widget clip | Clip Co. | CC-001 |');
    expect(md).toContain('[^1]: Example, A., and Sample, B. **Hinges in widgets.** *Widget J.* 2019; **3**: 12-20. https://doi.org/10.1000/widget.1');
    expect(md).not.toContain('Google Scholar');
  });
});

describe('Oxford Academic', () => {
  test('flat headings become sections; data-open citations; back matter', async () => {
    const r = await run('oup-structure.html', 'https://academic.oup.com/wr/article/1/1/1/1');
    expect(r).toMatchObject({ ok: true, route: 'dom-oup', meta: { doi: '10.1093/wr/gkaa0001' } });
    const md = r.markdown;
    expect(md).toContain('## Abstract\n\nWidgetBase lists every known widget');
    expect(md).toContain('## INTRODUCTION\n\nWidgets are everywhere[^1].');
    expect(md).toContain('## PROGRESS AND NEW DEVELOPMENTS\n\n### More widgets');
    expect(md).toContain('> **Figure 1** Widget counts by year.');
    expect(md).not.toMatch(/Open in new tab|Download slide|^## REFERENCES/m);
    expect(md).toContain('## Funding\n\nThe Widget Foundation.');
    expect(md).toContain('[^1]: Example A., Sample B. (2019) A census of widgets. Widget J., 3, 12. https://doi.org/10.1000/widget.1');
  });

  test('the declared citation_xml_url is not used (403 for in-page requests)', async () => {
    const fetchSiteXml = jest.fn();
    await exportArticle({ doc: html('oup-structure.html'), url: 'https://academic.oup.com/wr/article/1/1/1/1', fetchJats: noJats, services: { lookupDoi: noLookup, fetchSiteXml }, now: NOW });
    expect(fetchSiteXml).not.toHaveBeenCalled();
  });
});

describe('Taylor & Francis', () => {
  test('dc.* metadata, keywords, numbered citations, table caption only', async () => {
    const r = await run('tandf-structure.html', 'https://www.tandfonline.com/doi/full/10.1080/12345678.2020.0000001');
    expect(r).toMatchObject({ ok: true, route: 'dom-tandf', meta: { doi: '10.1080/12345678.2020.0000001', pdfUrl: 'https://www.tandfonline.com/doi/pdf/10.1080/12345678.2020.0000001' } });
    const md = r.markdown;
    expect(md).toContain('authors: [Ada Example, Ben Sample]');
    expect(md).toContain('year: 2020');
    expect(md).toContain('**Keywords:** Widget; hinge');
    expect(md).toContain('Widgets were first seen long ago[^1].');
    expect(md).not.toContain('Citation1');
    expect(md).toContain('Most widgets had two hinges Table 1.');
    expect(md).toContain('**Table 1** **Hinges per widget**');
    expect(md).not.toMatch(/Display full size|CSVDisplay|Google Scholar/);
    expect(md).toContain('[^1]: Example A, Sample B. Widgets in the wild. Widget J. 2019;3:12–20.');
  });
});

test('subscription page with only the abstract still goes through the free-version lookup', async () => {
  const doc = html('tandf-structure.html');
  doc.querySelectorAll('.NLM_sec').forEach((s) => s.remove());
  const findOpenVersion = jest.fn(async () => ({ ok: false, reason: 'not_found', links: [] }));
  const r = await exportArticle({ doc, url: 'https://www.tandfonline.com/doi/full/10.1080/12345678.2020.0000001', fetchJats: noJats, services: { lookupDoi: noLookup, findOpenVersion }, now: NOW });
  expect(findOpenVersion).toHaveBeenCalledWith('10.1080/12345678.2020.0000001');
  expect(r).toMatchObject({ ok: false, error: 'abstract_only', fullTextUrl: 'https://doi.org/10.1080/12345678.2020.0000001' });
});
