import fs from 'fs';
import path from 'path';
import { exportArticle } from '@core/export/pipeline';
import { planAssets, restoreRemoteImages } from '@core/export/zip-plan';
import { buildArticleZip, zipFilename, base64FromBytes, bytesFromBase64 } from '@/content/zip-export';
import { downloadZip } from '@/background/download';
import { assetAllowed, fetchAsset } from '@/background/fetch-asset';

const html = (name) => new DOMParser().parseFromString(fs.readFileSync(path.join(__dirname, 'fixtures/html', name), 'utf8'), 'text/html');
const NOW = new Date(Date.UTC(2026, 9, 30, 2, 0));

/** 读 store-only ZIP 的文件名和内容（只用于测试） */
function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = {};
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const size = dv.getUint32(p + 18, true);
    const nameLen = dv.getUint16(p + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nameLen));
    files[name] = bytes.subarray(p + 30 + nameLen, p + 30 + nameLen + size);
    p += 30 + nameLen + size;
  }
  return files;
}

describe('ZIP plan', () => {
  test('eLife export: image links point into images/, one entry per remote image', async () => {
    const r = await exportArticle({ doc: html('elife-09560.html'), url: 'https://elifesciences.org/articles/09560', fetchJats: async () => ({ ok: false }), settings: { preferJats: false }, now: NOW, format: 'zip' });
    expect(r.assets.length).toBe(4);
    expect(r.assets[0]).toEqual({ url: 'https://iiif.elifesciences.org/lax/09560%2Felife-09560-fig1-v1.tif/full/617,/0/default.jpg', path: 'images/01-elife-09560-fig1-v1.jpg' });
    expect(r.markdown).toContain('![Figure 1 Dinaledi skeletal specimens.](images/01-elife-09560-fig1-v1.jpg)');
    expect(r.markdown).not.toContain('iiif.elifesciences.org');
    expect(new Set(r.assets.map((a) => a.path)).size).toBe(r.assets.length);
  });

  test('plain .md export keeps remote links and has no asset list', async () => {
    const r = await exportArticle({ doc: html('elife-09560.html'), url: 'https://elifesciences.org/articles/09560', fetchJats: async () => ({ ok: false }), settings: { preferJats: false }, now: NOW });
    expect(r.assets).toBeUndefined();
    expect(r.markdown).toContain('](https://iiif.elifesciences.org/');
  });

  test('includeImages=false → nothing to pack', async () => {
    const r = await exportArticle({ doc: html('elife-09560.html'), url: 'https://elifesciences.org/articles/09560', fetchJats: async () => ({ ok: false }), settings: { preferJats: false, includeImages: false }, now: NOW, format: 'zip' });
    expect(r.assets).toBeUndefined();
  });

  test('planAssets skips non-http sources; restoreRemoteImages puts failed images back', () => {
    const ir = { abstract: [], sections: [], figures: [{ src: 'https://x.org/a b(1).png', caption: [] }, { src: 'data:image/png;base64,AA', caption: [] }], tables: [], back: {} };
    const plan = planAssets(ir);
    expect([...plan.values()]).toEqual(['images/01-a-b-1.png']);
    expect(restoreRemoteImages('![F](images/01-a-b-1.png)', [{ url: 'https://x.org/a b(1).png', path: 'images/01-a-b-1.png' }])).toBe('![F](https://x.org/a%20b%281%29.png)');
  });
});

describe('buildArticleZip', () => {
  const result = {
    markdown: '# T\n\n![A](images/01-a.jpg)\n\n![B](images/02-b.jpg)\n',
    assets: [{ url: 'https://cors.example/a.jpg', path: 'images/01-a.jpg' }, { url: 'https://media.springernature.com/b.jpg', path: 'images/02-b.jpg' }],
  };

  test('in-page fetch, background fallback, and failures keep their web link', async () => {
    const fetchInPage = jest.fn(async (url) => (url.includes('cors.example') ? new Uint8Array([1, 2, 3]) : null));
    const sendMessage = jest.fn(async () => ({ ok: false, error: 'not_allowed' }));
    const z = await buildArticleZip(result, { fetchInPage, sendMessage });
    expect(z).toMatchObject({ packed: 1, total: 2 });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'JMD_FETCH_ASSET', url: 'https://media.springernature.com/b.jpg' });
    const files = unzip(z.bytes);
    expect(Object.keys(files)).toEqual(['article.md', 'images/01-a.jpg']);
    const md = new TextDecoder().decode(files['article.md']);
    expect(md).toContain('![A](images/01-a.jpg)');
    expect(md).toContain('![B](https://media.springernature.com/b.jpg)');
  });

  test('background copy is used when the page fetch is blocked by CORS', async () => {
    const z = await buildArticleZip(result, { fetchInPage: async () => null, sendMessage: async () => ({ ok: true, base64: base64FromBytes(new Uint8Array([9])) }) });
    expect(z).toMatchObject({ packed: 2, total: 2 });
    expect(Array.from(unzip(z.bytes)['images/02-b.jpg'])).toEqual([9]);
  });

  test('file name and base64 helpers', () => {
    expect(zipFilename('Title (2025).md')).toBe('Title (2025).zip');
    expect(Array.from(bytesFromBase64(base64FromBytes(new Uint8Array([0, 255, 7]))))).toEqual([0, 255, 7]);
  });
});

describe('background: ZIP download and asset proxy', () => {
  test('downloadZip uses a data URL in the Chrome SW and keeps the .zip name', async () => {
    const downloads = { download: jest.fn((opts, cb) => cb(3)) };
    await expect(downloadZip({ base64: 'UEsFBg==', filename: '鸡 (2025).zip' }, { downloads, env: {}, runtime: {} })).resolves.toEqual({ ok: true, id: 3 });
    expect(downloads.download.mock.calls[0][0]).toMatchObject({ url: 'data:application/zip;base64,UEsFBg==', filename: '鸡 (2025).zip' });
    await expect(downloadZip({ base64: 'not base64!', filename: 'a.zip' }, { downloads, env: {}, runtime: {} })).resolves.toEqual({ ok: false, error: 'empty' });
  });

  test('asset proxy only for https images on supported hosts', async () => {
    expect(assetAllowed('https://www.frontiersin.org/files/a.jpg')).toBe(true);
    expect(assetAllowed('https://media.springernature.com/a.jpg')).toBe(false);
    expect(assetAllowed('http://www.frontiersin.org/a.jpg')).toBe(false);
    expect(assetAllowed('https://user:pw@www.frontiersin.org/a.jpg')).toBe(false);
    const fetchImpl = jest.fn(async () => ({ ok: true, headers: { get: () => 'text/html' }, arrayBuffer: async () => new ArrayBuffer(4) }));
    await expect(fetchAsset('https://pmc.ncbi.nlm.nih.gov/articles/instance/1/bin/a.jpg', { fetchImpl })).resolves.toEqual({ ok: false, error: 'not_image' });
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ credentials: 'omit' });
    const img = jest.fn(async () => ({ ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => new Uint8Array([1, 2]).buffer }));
    await expect(fetchAsset('https://www.frontiersin.org/a.png', { fetchImpl: img })).resolves.toEqual({ ok: true, base64: 'AQI=', type: 'image/png' });
    await expect(fetchAsset('https://evil.example/a.png', { fetchImpl: img })).resolves.toEqual({ ok: false, error: 'not_allowed' });
  });
});
