/**
 * @jest-environment jsdom
 */
// Elsevier 全文接口：XML 解析（合成样例，文字是占位）、客户端、导出流程里的这一步、ScienceDirect 地址识别。不访问网络。
import fs from 'fs';
import path from 'path';
import { parseElsevier } from '@core/parsers/elsevier';
import { renderMarkdown } from '@core/render/markdown';
import { elsevierUrl, fetchElsevierXml, isElsevierDoi, testElsevierKey, loadPublisherKeys, savePublisherKeys, normalizePii } from '@core/elsevier/client';
import { exportArticle } from '@core/export/pipeline';
import { detectSite } from '@core/sites/registry';

const XML = fs.readFileSync(path.join(__dirname, 'fixtures/xml/elsevier-synthetic.xml'), 'utf8');
const NOW = new Date(Date.UTC(2026, 10, 5, 2, 0));
const SD_URL = 'https://www.sciencedirect.com/science/article/pii/S000000002100001X';

describe('Elsevier XML → Markdown', () => {
  const ir = parseElsevier(XML, { url: SD_URL });
  const md = renderMarkdown(ir, { includeImages: true, now: NOW });

  test('citation from coredata', () => {
    expect(ir.meta).toMatchObject({ doi: '10.1016/j.widget.2021.100001', title: 'Widgets fold along two hinges', journal: 'Journal of Widgets', year: 2021, pmid: '33000001', license: 'CC-BY-4.0' });
    expect(ir.meta.authors.map((a) => a.name)).toEqual(['Ada Example', 'Ben Sample']);
    expect(ir.sourceRoute).toBe('xml-elsevier');
  });

  test('highlights and abstract; graphical abstract dropped; keywords', () => {
    expect(md).toContain('### Highlights\n\n- Two hinges\n- One clip\n\nWe fold widgets and count the creases.');
    expect(md).not.toContain('Graphical abstract');
    expect(md).toContain('**Keywords:** widget; hinge');
  });

  test('numbered sections, citations as footnotes, figure placed at its anchor with the high-res image', () => {
    expect(md).toContain('## 1 Introduction\n\nWidgets have hinges [^1][^2], see Fig. 1.');
    expect(md).toContain('(https://ars.els-cdn.com/content/image/1-s2.0-S000000002100001X-gr1_lrg.jpg)');
    expect(md).toContain('> **Figure 1** Two hinges of a widget.');
    expect(md).toContain('### 2.1 Counting');
  });

  test('inline and display MathML, italics, subscripts; a CALS table with a spanning header and its footnote', () => {
    expect(md).toContain('The count $n=12$ is small *in vitro* and H<sub>2</sub>O:');
    expect(md).toContain('$$\nc=2n\n$$');
    expect(md).toContain('<th colspan="2">Creases</th>');
    expect(md).toContain('> Counted by hand.');
  });

  test('back matter and references (structured and free text)', () => {
    expect(md).toContain('## Acknowledgements\n\nWe thank the hinge lab.');
    expect(md).toContain('## Competing interests\n\nNone.');
    expect(md).toContain('[^1]: A. Example, B. Sample, et al. (2019). Hinges in widgets. *Widget J.* 3, 12–20. https://doi.org/10.1000/widget.1');
    expect(md).toContain('[^2]: C. Placeholder, Crease notes, unpublished, 2020.');
  });

  test('image address built from the PII when objects are missing', () => {
    const noObjects = XML.replace(/<objects>[\s\S]*?<\/objects>/, '');
    expect(parseElsevier(noObjects, { url: SD_URL }).figures[0].src).toBe('https://ars.els-cdn.com/content/image/1-s2.0-S000000002100001X-gr1.jpg');
  });

  test('broken XML throws', () => {
    expect(() => parseElsevier('<not-closed')).toThrow();
  });
});

describe('Elsevier client', () => {
  const res = (status, body = '') => ({ ok: status < 400, status, text: async () => body });

  test('URLs by DOI or PII; Elsevier DOIs', () => {
    expect(elsevierUrl({ doi: '10.1016/j.cell.2020.02.052' })).toBe('https://api.elsevier.com/content/article/doi/10.1016/j.cell.2020.02.052?view=FULL&httpAccept=text%2Fxml');
    expect(elsevierUrl({ pii: 'S0092-8674(20)30229-4' })).toBe('https://api.elsevier.com/content/article/pii/S0092867420302294?view=FULL&httpAccept=text%2Fxml');
    expect(elsevierUrl({})).toBe('');
    expect(isElsevierDoi('https://doi.org/10.1016/j.cell.2020.02.052')).toBe(true);
    expect(isElsevierDoi('10.1038/x')).toBe(false);
    expect(normalizePii('S0092-8674(20)30229-4')).toBe('S0092867420302294');
  });

  test('the key goes in a header, no cookies; errors are mapped', async () => {
    const fetchImpl = jest.fn(async () => res(200, '<xml/>'));
    await expect(fetchElsevierXml({ doi: '10.1016/x' }, 'K', { fetchImpl })).resolves.toEqual({ ok: true, xml: '<xml/>' });
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ credentials: 'omit', headers: { 'X-ELS-APIKey': 'K' } });
    await expect(fetchElsevierXml({ doi: '10.1016/x' }, '', { fetchImpl })).resolves.toEqual({ ok: false, reason: 'no_key' });
    await expect(fetchElsevierXml({ doi: '10.1016/x' }, 'K', { fetchImpl: async () => res(401) })).resolves.toMatchObject({ reason: 'auth' });
    await expect(fetchElsevierXml({ doi: '10.1016/x' }, 'K', { fetchImpl: async () => res(404) })).resolves.toMatchObject({ reason: 'not_found' });
    await expect(fetchElsevierXml({ doi: '10.1016/x' }, 'K', { fetchImpl: async () => res(429) })).resolves.toMatchObject({ reason: 'quota' });
    // 格式不对的 Key 也是 503
    await expect(fetchElsevierXml({ doi: '10.1016/x' }, 'K', { fetchImpl: async () => res(503) })).resolves.toMatchObject({ reason: 'unavailable' });
    await expect(fetchElsevierXml({ doi: '10.1016/x' }, 'K', { fetchImpl: async () => { throw new TypeError('x'); } })).resolves.toEqual({ ok: false, reason: 'network' });
  });

  test('key test only asks for metadata', async () => {
    const fetchImpl = jest.fn(async () => res(200, '<xml/>'));
    await expect(testElsevierKey(' K ', { fetchImpl })).resolves.toEqual({ ok: true });
    expect(fetchImpl.mock.calls[0][0]).toContain('view=META');
  });

  test('keys live in storage.local and are trimmed', async () => {
    const data = {};
    const area = { get: async (k) => ({ [k]: data[k] }), set: async (o) => Object.assign(data, o) };
    await savePublisherKeys({ elsevier: '  abc  ' }, area);
    await expect(loadPublisherKeys(area)).resolves.toEqual({ elsevier: 'abc' });
  });
});

describe('ScienceDirect pages', () => {
  test.each([
    ['https://www.sciencedirect.com/science/article/pii/S0092867420302294', { pii: 'S0092867420302294' }],
    ['https://www.sciencedirect.com/science/article/abs/pii/S000000002100001X', { pii: 'S000000002100001X' }],
  ])('%s', (url, ids) => {
    expect(detectSite(url)).toMatchObject({ supported: true, isArticle: true, ids });
  });

  test('not article pages', () => {
    expect(detectSite('https://www.sciencedirect.com/journal/cell').isArticle).toBe(false);
    expect(detectSite('https://www.sciencedirect.com/search?qs=x').isArticle).toBe(false);
  });
});

describe('export: abstract-only page + Elsevier full-text API', () => {
  // ScienceDirect 页面：只有题录和摘要（结构是合成的；真实页面有人机验证，正文不从页面取）
  const page = () => new DOMParser().parseFromString(`<html><head>
    <meta name="citation_title" content="Widgets fold along two hinges">
    <meta name="citation_doi" content="10.1016/j.widget.2021.100001">
    <meta name="citation_journal_title" content="Journal of Widgets">
    <meta name="citation_publication_date" content="2021/03/01">
  </head><body><article><div id="abstracts"><div class="abstract author"><h2>Abstract</h2><p>We fold widgets.</p></div></div></article></body></html>`, 'text/html');
  const noJats = async () => ({ ok: false, reason: 'not_available' });
  const noLookup = async () => ({ ok: false, reason: 'not_found' });
  const noOpen = jest.fn(async () => ({ ok: false, reason: 'not_found', links: [] }));

  test('with a key on an entitled network: full text from the API, ahead of free versions', async () => {
    const fetchElsevier = jest.fn(async () => ({ ok: true, xml: XML }));
    const r = await exportArticle({ doc: page(), url: SD_URL, fetchJats: noJats, services: { lookupDoi: noLookup, fetchElsevier, findOpenVersion: noOpen }, now: NOW });
    expect(fetchElsevier).toHaveBeenCalledWith({ doi: '10.1016/j.widget.2021.100001', pii: 'S000000002100001X' });
    expect(noOpen).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, route: 'xml-elsevier', abstractOnly: false });
    expect(r.notices).toContainEqual({ code: 'elsevier_fulltext' });
    expect(r.markdown).toContain('## 2 Results');
  });

  test('not entitled (API gives only the abstract) → note, then free versions, then abstract-only', async () => {
    const abstractOnlyXml = XML.replace(/<ja:body>[\s\S]*?<\/ja:body>/, '');
    const fetchElsevier = jest.fn(async () => ({ ok: true, xml: abstractOnlyXml }));
    noOpen.mockClear();
    const r = await exportArticle({ doc: page(), url: SD_URL, fetchJats: noJats, services: { lookupDoi: noLookup, fetchElsevier, findOpenVersion: noOpen }, now: NOW });
    expect(noOpen).toHaveBeenCalled();
    expect(r).toMatchObject({ ok: false, error: 'abstract_only' });
    expect(r.notices).toContainEqual({ code: 'elsevier_fallback', reason: 'not_entitled' });
  });

  test('no key: silent (no note); another article returned: rejected', async () => {
    const r1 = await exportArticle({ doc: page(), url: SD_URL, fetchJats: noJats, services: { lookupDoi: noLookup, fetchElsevier: async () => ({ ok: false, reason: 'no_key' }) }, now: NOW });
    expect(r1.notices.some((n) => n.code === 'elsevier_fallback')).toBe(false);
    const other = XML.replace('<prism:doi>10.1016/j.widget.2021.100001</prism:doi>', '<prism:doi>10.1016/j.other.2020.1</prism:doi>');
    const r2 = await exportArticle({ doc: page(), url: SD_URL, fetchJats: noJats, services: { lookupDoi: noLookup, fetchElsevier: async () => ({ ok: true, xml: other }) }, now: NOW });
    expect(r2).toMatchObject({ ok: false, error: 'abstract_only' });
    expect(r2.notices).toContainEqual({ code: 'elsevier_fallback', reason: 'mismatch' });
  });

  test('non-Elsevier DOI never calls the API', async () => {
    const fetchElsevier = jest.fn();
    const doc = new DOMParser().parseFromString(fs.readFileSync(path.join(__dirname, 'fixtures/html/pubmed-with-pmcid.html'), 'utf8'), 'text/html');
    await exportArticle({ doc, url: 'https://pubmed.ncbi.nlm.nih.gov/40000001/', fetchJats: noJats, services: { fetchElsevier }, now: NOW });
    expect(fetchElsevier).not.toHaveBeenCalled();
  });
});
