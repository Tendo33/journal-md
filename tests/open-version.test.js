/**
 * @jest-environment node
 */
// 页面上只有摘要时找合法的免费全文：Unpaywall、bioRxiv / medRxiv。只用 fixtures 和 mock 的 fetch，不访问网络。
import { classifyLocation, parseUnpaywall, lookupUnpaywall, unpaywallUrl } from '@/core/oa/unpaywall';
import { findPreprint, fetchPreprintXml, preprintXmlUrl } from '@/core/oa/biorxiv';
import { findOpenVersion, createOpenVersionService, OPEN_ROUTES } from '@/core/oa/open-version';

const fs = require('fs');
const path = require('path');
const fixture = (p) => fs.readFileSync(path.join(__dirname, 'fixtures', p), 'utf8');
const UPW = JSON.parse(fixture('json/unpaywall-mixed.json'));
const DOI = '10.1016/j.example.2024.01.001';
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

describe('Unpaywall', () => {
  test('request carries only the DOI and the contact email', () => {
    expect(unpaywallUrl(`https://doi.org/${DOI}`)).toBe('https://api.unpaywall.org/v2/10.1016/j.example.2024.01.001?email=Tendo33%40users.noreply.github.com');
  });

  test('locations are classified, de-duplicated (PMC via NCBI and Europe PMC) and ordered by usefulness', () => {
    const locs = parseUnpaywall(UPW);
    expect(locs.map((l) => l.kind)).toEqual(['pmc', 'arxiv', 'pdf']);
    expect(locs[0]).toMatchObject({ pmcid: 'PMC9000001', version: 'acceptedVersion' });
    expect(locs[1]).toMatchObject({ arxivId: '2401.01234', url: 'https://arxiv.org/abs/2401.01234' });
    expect(locs[2]).toMatchObject({ pdfUrl: 'https://repository.example.edu/bitstream/123/paper.pdf', repository: 'Example University', license: 'cc-by-nc' });
  });

  test('real Unpaywall shapes: PMC link without the PMC prefix, bioRxiv copy given as a doi.org link', () => {
    expect(classifyLocation({ url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/7095418', url_for_landing_page: 'https://www.ncbi.nlm.nih.gov/pmc/articles/7095418' })).toMatchObject({ kind: 'pmc', pmcid: 'PMC7095418' });
    expect(classifyLocation({ url: 'https://www.biorxiv.org/content/biorxiv/early/2020/01/23/2020.01.22.914952.1.full.pdf', url_for_landing_page: 'https://doi.org/10.1101/2020.01.22.914952', url_for_pdf: 'https://www.biorxiv.org/content/biorxiv/early/2020/01/23/2020.01.22.914952.1.full.pdf' }).kind).toBe('preprint');
    expect(classifyLocation({ url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/7095418x' }).kind).not.toBe('pmc');
  });

  test('bioRxiv and plain landing pages', () => {
    expect(classifyLocation({ url: 'https://www.biorxiv.org/content/10.1101/2024.01.01.000001v1' }).kind).toBe('preprint');
    expect(classifyLocation({ url_for_landing_page: 'https://example.org/paper' }).kind).toBe('html');
    expect(classifyLocation({ url: 'http://example.org/a.pdf', url_for_pdf: 'http://example.org/a.pdf' })).toMatchObject({ kind: 'pdf', pdfUrl: 'https://example.org/a.pdf' });
  });

  test('lookup: found, 404, wrong DOI, network', async () => {
    const fetchImpl = jest.fn(async () => json(UPW));
    const r = await lookupUnpaywall(DOI, { fetchImpl });
    expect(r.ok).toBe(true);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ credentials: 'omit' });
    await expect(lookupUnpaywall(DOI, { fetchImpl: async () => json({}, 404) })).resolves.toMatchObject({ ok: false, reason: 'not_found' });
    await expect(lookupUnpaywall(DOI, { fetchImpl: async () => json({ ...UPW, doi: '10.1/other' }) })).resolves.toMatchObject({ ok: false, reason: 'not_found' });
    await expect(lookupUnpaywall(DOI, { fetchImpl: async () => { throw new TypeError('x'); } })).resolves.toEqual({ ok: false, reason: 'network' });
    await expect(lookupUnpaywall('not a doi')).resolves.toEqual({ ok: false, reason: 'invalid_id' });
  });
});

describe('bioRxiv / medRxiv', () => {
  const PUB = { collection: [{ preprint_doi: '10.1101/2024.01.01.000001', published_doi: DOI, preprint_title: 'A synthetic preprint' }] };
  const DETAILS = { collection: [
    { doi: '10.1101/2024.01.01.000001', version: '1', date: '2024-01-01', title: 'A synthetic preprint', jatsxml: 'https://www.biorxiv.org/content/early/2024/01/01/2024.01.01.000001.source.xml' },
    { doi: '10.1101/2024.01.01.000001', version: '2', date: '2024-02-01', title: 'A synthetic preprint', jatsxml: 'https://www.biorxiv.org/content/early/2024/02/01/2024.01.01.000001.source.xml' },
  ] };

  test('published DOI → latest preprint version with its JATS address', async () => {
    const fetchImpl = jest.fn(async (url) => json(url.includes('/pubs/') ? PUB : DETAILS));
    const r = await findPreprint(DOI, { fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.biorxiv.org/pubs/biorxiv/10.1016/j.example.2024.01.001');
    expect(r).toEqual({ ok: true, server: 'biorxiv', doi: '10.1101/2024.01.01.000001', version: '2', date: '2024-02-01', title: 'A synthetic preprint', xmlUrl: DETAILS.collection[1].jatsxml, url: 'https://www.biorxiv.org/content/10.1101/2024.01.01.000001v2' });
  });

  test('falls through to medRxiv; nothing found; mismatched published DOI ignored', async () => {
    const med = jest.fn(async (url) => {
      if (url.includes('/pubs/biorxiv/')) return json({ collection: [] });
      if (url.includes('/pubs/medrxiv/')) return json(PUB);
      return json(DETAILS);
    });
    await expect(findPreprint(DOI, { fetchImpl: med })).resolves.toMatchObject({ ok: true, server: 'medrxiv' });
    await expect(findPreprint(DOI, { fetchImpl: async () => json({ collection: [] }) })).resolves.toEqual({ ok: false, reason: 'not_found' });
    const other = { collection: [{ preprint_doi: '10.1101/x', published_doi: '10.1/other' }] };
    await expect(findPreprint(DOI, { fetchImpl: async () => json(other) })).resolves.toEqual({ ok: false, reason: 'not_found' });
  });

  test('JATS only from the two preprint hosts; Cloudflare refusal is an http failure', async () => {
    expect(preprintXmlUrl('https://evil.example/x.xml')).toBe('');
    expect(preprintXmlUrl('http://www.medrxiv.org/x.source.xml')).toBe('https://www.medrxiv.org/x.source.xml');
    await expect(fetchPreprintXml('https://evil.example/x.xml', { fetchImpl: jest.fn() })).resolves.toEqual({ ok: false, reason: 'invalid_id' });
    await expect(fetchPreprintXml(DETAILS.collection[1].jatsxml, { fetchImpl: async () => ({ ok: false, status: 429 }) })).resolves.toEqual({ ok: false, reason: 'http', status: 429 });
    const xml = fixture('jats/preprint-synthetic.xml');
    await expect(fetchPreprintXml(DETAILS.collection[1].jatsxml, { fetchImpl: async () => ({ ok: true, status: 200, text: async () => xml }) })).resolves.toEqual({ ok: true, xml });
  });
});

describe('findOpenVersion', () => {
  const locs = parseUnpaywall(UPW);
  const PRE = { ok: true, server: 'biorxiv', doi: '10.1101/2024.01.01.000001', version: '2', date: '2024-02-01', xmlUrl: 'https://www.biorxiv.org/x.source.xml', url: 'https://www.biorxiv.org/content/10.1101/2024.01.01.000001v2' };
  const deps = (o = {}) => ({
    unpaywall: jest.fn(async () => ({ ok: true, locations: locs })),
    preprint: jest.fn(async () => ({ ok: false, reason: 'not_found' })),
    fetchJats: jest.fn(async () => ({ ok: true, xml: '<article/>' })),
    fetchPreprintXml: jest.fn(async () => ({ ok: true, xml: '<article>pre</article>' })),
    ...o,
  });

  test('PMC copy first (Europe PMC JATS); the other locations come back as links', async () => {
    const d = deps();
    const r = await findOpenVersion(DOI, d);
    expect(d.fetchJats).toHaveBeenCalledWith('PMC9000001');
    expect(r).toMatchObject({ ok: true, route: OPEN_ROUTES.PMC, source: { kind: 'pmc', pmcid: 'PMC9000001', version: 'acceptedVersion' } });
    expect(r.links.map((l) => l.kind)).toEqual(['arxiv', 'pdf']);
  });

  test('PMC copy not in the open subset → bioRxiv preprint JATS', async () => {
    const d = deps({ fetchJats: jest.fn(async () => ({ ok: false, reason: 'not_available' })), preprint: jest.fn(async () => PRE) });
    const r = await findOpenVersion(DOI, d);
    expect(d.fetchPreprintXml).toHaveBeenCalledWith(PRE.xmlUrl);
    expect(r).toMatchObject({ ok: true, route: OPEN_ROUTES.PREPRINT, xml: '<article>pre</article>', source: { kind: 'preprint', server: 'biorxiv', version: '2' } });
  });

  test('preprint XML refused → links only, the preprint listed first', async () => {
    const d = deps({ fetchJats: jest.fn(async () => ({ ok: false })), preprint: jest.fn(async () => PRE), fetchPreprintXml: jest.fn(async () => ({ ok: false, reason: 'http' })) });
    const r = await findOpenVersion(DOI, d);
    expect(r).toMatchObject({ ok: false, reason: 'links_only' });
    expect(r.links.map((l) => l.kind)).toEqual(['preprint', 'arxiv', 'pdf']);
    expect(r.links[0]).toMatchObject({ url: PRE.url, repository: 'bioRxiv' });
  });

  test('nothing anywhere; network trouble is not cached', async () => {
    const none = deps({ unpaywall: jest.fn(async () => ({ ok: false, reason: 'not_found' })) });
    await expect(findOpenVersion(DOI, none)).resolves.toEqual({ ok: false, reason: 'not_found', links: [] });
    const down = deps({ unpaywall: jest.fn(async () => ({ ok: false, reason: 'timeout' })) });
    await expect(findOpenVersion(DOI, down)).resolves.toEqual({ ok: false, reason: 'network', links: [] });
  });

  test('service caches definite answers by DOI and retries after network errors', async () => {
    let n = 0;
    const fetchImpl = jest.fn(async (url) => {
      n += 1;
      if (url.includes('unpaywall')) return n <= 2 ? Promise.reject(new TypeError('offline')) : json({ doi: DOI, oa_locations: [] });
      return json({ collection: [] });
    });
    const svc = createOpenVersionService({ fetchImpl, fetchJats: jest.fn() });
    await expect(svc.get(DOI)).resolves.toMatchObject({ reason: 'network' });
    await expect(svc.get(DOI)).resolves.toMatchObject({ reason: 'not_found' });
    const calls = fetchImpl.mock.calls.length;
    await svc.get(DOI.toUpperCase());
    expect(fetchImpl.mock.calls.length).toBe(calls);
  });
});
