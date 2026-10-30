import { fetchFullTextXml, fullTextXmlUrl, createJatsService } from '@core/europepmc/client';

const XML = '<?xml version="1.0"?><article><front/></article>';
const response = (status, body = '') => Promise.resolve({ status, ok: status >= 200 && status < 300, text: () => Promise.resolve(body) });

describe('fetchFullTextXml (mocked fetch, no network)', () => {
  test('builds the REST URL from a PMCID', () => {
    expect(fullTextXmlUrl('pmc123')).toBe('https://www.ebi.ac.uk/europepmc/webservices/rest/PMC123/fullTextXML');
  });

  test('200 with <article> → ok', async () => {
    const fetchImpl = jest.fn(() => response(200, XML));
    await expect(fetchFullTextXml('PMC1000', { fetchImpl })).resolves.toEqual({ ok: true, xml: XML });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://www.ebi.ac.uk/europepmc/webservices/rest/PMC1000/fullTextXML');
    expect(fetchImpl.mock.calls[0][1].credentials).toBe('omit');
  });

  test('404 → not_available (not open access)', async () => {
    await expect(fetchFullTextXml('PMC1000', { fetchImpl: () => response(404) })).resolves.toEqual({ ok: false, reason: 'not_available', status: 404 });
  });

  test('200 without an article element → not_available', async () => {
    await expect(fetchFullTextXml('PMC1000', { fetchImpl: () => response(200, '<html>maintenance</html>') }))
      .resolves.toMatchObject({ ok: false, reason: 'not_available' });
  });

  test('5xx → http', async () => {
    await expect(fetchFullTextXml('PMC1000', { fetchImpl: () => response(503) })).resolves.toEqual({ ok: false, reason: 'http', status: 503 });
  });

  test('network error → network', async () => {
    await expect(fetchFullTextXml('PMC1000', { fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')) }))
      .resolves.toEqual({ ok: false, reason: 'network' });
  });

  test('slow response is aborted → timeout', async () => {
    jest.useFakeTimers();
    const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    const p = fetchFullTextXml('PMC1000', { fetchImpl, timeoutMs: 6000 });
    jest.advanceTimersByTime(6000);
    await expect(p).resolves.toEqual({ ok: false, reason: 'timeout' });
    jest.useRealTimers();
  });

  test('invalid id never calls fetch', async () => {
    const fetchImpl = jest.fn();
    await expect(fetchFullTextXml('abc', { fetchImpl })).resolves.toEqual({ ok: false, reason: 'invalid_id' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createJatsService', () => {
  test('coalesces concurrent requests and caches success', async () => {
    const fetchImpl = jest.fn(() => response(200, XML));
    const svc = createJatsService({ fetchImpl });
    const [a, b] = await Promise.all([svc.get('PMC1'), svc.get('pmc1')]);
    expect(a).toBe(b);
    await svc.get('PMC1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('does not cache transient failures; expires after TTL', async () => {
    let t = 0;
    const fetchImpl = jest.fn()
      .mockImplementationOnce(() => Promise.reject(new Error('down')))
      .mockImplementation(() => response(200, XML));
    const svc = createJatsService({ fetchImpl, now: () => t, ttlMs: 1000 });
    expect((await svc.get('PMC1')).ok).toBe(false);
    expect((await svc.get('PMC1')).ok).toBe(true);
    t = 2000;
    await svc.get('PMC1');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test('evicts old entries beyond maxEntries', async () => {
    const svc = createJatsService({ fetchImpl: () => response(200, XML), maxEntries: 2 });
    await svc.get('PMC1');
    await svc.get('PMC2');
    await svc.get('PMC3');
    expect([...svc._cache.keys()]).toEqual(['PMC2', 'PMC3']);
  });
});
