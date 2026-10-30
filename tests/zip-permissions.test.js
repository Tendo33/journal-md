// ZIP 图片的可选主机权限（Simon 2026-10-30 批准）：PLOS 图片存储桶、media.springernature.com。
import fs from 'fs';
import path from 'path';
import { inspectPage } from '@core/export/pipeline';
import { originNeededFor, PLOS_IMAGE_ORIGIN, SPRINGER_IMAGE_ORIGIN, ZIP_IMAGE_ORIGINS } from '@core/zip-image-hosts';
import { buildArticleZip } from '@/content/zip-export';
import { describeResult } from '@/ui/shared/result-text';
import { requestZipImagePermission } from '@/ui/popup/popup-view';
const manifest = require('../src/manifest.json');
const { OPTIONAL_HOST_PERMISSIONS, FORBIDDEN_HOST_PATTERNS } = require('../scripts/permission-allowlist');
const { manifestForTarget } = require('../scripts/manifest-target');
const { verifyPermissions } = require('../scripts/verify-dist');

const html = (name) => new DOMParser().parseFromString(fs.readFileSync(path.join(__dirname, 'fixtures/html', name), 'utf8'), 'text/html');

describe('which images need an optional permission', () => {
  test.each([
    ['https://journals.plos.org/ploscompbiol/article/figure/image?size=large&id=10.1371/journal.pcbi.1012733.g001', PLOS_IMAGE_ORIGIN],
    ['https://journals.plos.org/ploscompbiol/article/file?type=thumbnail&id=10.1371/journal.pcbi.1012733.e001', PLOS_IMAGE_ORIGIN],
    ['https://corpus-prod.f505aadad1e46610c8f8563037eb3c4b.r2.cloudflarestorage.com/10.1371/x.PNG_L', PLOS_IMAGE_ORIGIN],
    ['https://media.springernature.com/lw685/springer-static/image/a.jpg', SPRINGER_IMAGE_ORIGIN],
    ['https://iiif.elifesciences.org/lax/09560%2Ff1.tif/full/617,/0/default.jpg', ''],
    ['https://cdn.ncbi.nlm.nih.gov/pmc/blobs/a/b.jpg', ''],
    ['https://journals.plos.org/plosone/article?id=10.1371/journal.pone.1', ''],
    ['http://media.springernature.com/a.jpg', ''],
    ['https://other.r2.cloudflarestorage.com/a.png', ''],
  ])('%s', (url, origin) => expect(originNeededFor(url)).toBe(origin));
});

describe('manifest: optional only, exact hosts, both browsers', () => {
  test('the two hosts are optional_host_permissions in Chrome and Firefox and nowhere else', () => {
    for (const target of ['chrome', 'firefox']) {
      const m = manifestForTarget(manifest, target);
      for (const o of ZIP_IMAGE_ORIGINS) {
        expect(m.optional_host_permissions).toContain(o);
        expect(m.host_permissions).not.toContain(o);
        expect(OPTIONAL_HOST_PERMISSIONS).toContain(o);
      }
      expect(verifyPermissions(m, target)).toEqual([]);
    }
  });

  test('no broad wildcard was added', () => {
    for (const o of manifest.optional_host_permissions) {
      expect(o).not.toMatch(/^\*:|:\/\/\*\/|<all_urls>|:\/\/\*\.r2\.cloudflarestorage\.com|:\/\/\*\.springernature\.com/);
      for (const re of FORBIDDEN_HOST_PATTERNS) expect(re.test(o)).toBe(false);
    }
  });

  test('verify:dist rejects any other optional host', () => {
    expect(verifyPermissions({ optional_permissions: ['declarativeNetRequestWithHostAccess'], optional_host_permissions: ['https://*.r2.cloudflarestorage.com/*'] })).toContain('optional_host_permission not in allowlist: https://*.r2.cloudflarestorage.com/*');
  });
});

describe('popup asks only when the page needs it', () => {
  test('PLOS / Springer / Nature pages report the origin; eLife and MDPI need nothing', () => {
    expect(inspectPage(html('plos-pmed-0020124.html'), 'https://journals.plos.org/plosmedicine/article?id=10.1371/journal.pmed.0020124').zipOrigins).toEqual([PLOS_IMAGE_ORIGIN]);
    expect(inspectPage(html('springer-deseq2.html'), 'https://link.springer.com/article/10.1186/s13059-014-0550-8').zipOrigins).toEqual([SPRINGER_IMAGE_ORIGIN]);
    expect(inspectPage(html('nature-alphafold.html'), 'https://www.nature.com/articles/s41586-021-03819-2').zipOrigins).toEqual([SPRINGER_IMAGE_ORIGIN]);
    expect(inspectPage(html('elife-09560.html'), 'https://elifesciences.org/articles/09560').zipOrigins).toEqual([]);
    expect(inspectPage(html('mdpi-animals-11-01300.html'), 'https://www.mdpi.com/2076-2615/11/5/1300').zipOrigins).toEqual([]);
    expect(inspectPage(html('springer-deseq2.html'), 'https://link.springer.com/article/10.1186/s13059-014-0550-8', { includeImages: false }).zipOrigins).toEqual([]);
  });

  test('request is called synchronously with exactly those origins; granted / denied / error / not needed', async () => {
    const granted = { request: jest.fn(() => Promise.resolve(true)) };
    const p = requestZipImagePermission(granted, [SPRINGER_IMAGE_ORIGIN]);
    expect(granted.request).toHaveBeenCalledWith({ origins: [SPRINGER_IMAGE_ORIGIN] }); // 调用发生在返回之前（同一调用栈）
    await expect(p).resolves.toBe(true);
    await expect(requestZipImagePermission({ request: () => Promise.resolve(false) }, [PLOS_IMAGE_ORIGIN])).resolves.toBe(false);
    await expect(requestZipImagePermission({ request: () => Promise.reject(new Error('gesture')) }, [PLOS_IMAGE_ORIGIN])).resolves.toBe(false);
    await expect(requestZipImagePermission({ request: () => { throw new Error('x'); } }, [PLOS_IMAGE_ORIGIN])).resolves.toBe(false);
    const notNeeded = { request: jest.fn() };
    await expect(requestZipImagePermission(notNeeded, [])).resolves.toBe(true);
    expect(notNeeded.request).not.toHaveBeenCalled();
  });
});

describe('ZIP with and without the permission', () => {
  const result = {
    markdown: '![F1](images/01-a.jpg)\n\n![F2](images/02-b.jpg)\n\n![F3](images/03-c.jpg)',
    assets: [
      { url: 'https://journals.plos.org/plosone/article/figure/image?size=large&id=g001', path: 'images/01-a.jpg', alts: [] },
      { url: 'https://media.springernature.com/lw685/b.jpg', path: 'images/02-b.jpg', alts: [] },
      { url: 'https://iiif.elifesciences.org/c.jpg', path: 'images/03-c.jpg', alts: [] },
    ],
  };
  const inPage = async (u) => (u.includes('iiif') ? new Uint8Array([3]) : null); // 两个 CDN 都没有 CORS

  test('granted: the background can fetch them → everything packed, no permission notice', async () => {
    const z = await buildArticleZip(result, { fetchInPage: inPage, sendMessage: async () => ({ ok: true, base64: 'AQ==' }) });
    expect(z).toMatchObject({ packed: 3, total: 3, needsPermission: [], permissionCount: 0 });
    const notes = describeResult({ ok: true, saved: true, filename: 'a.zip', markdown: '', zip: z }, 'en', 'zip').notes;
    expect(notes.join(' ')).not.toContain('permission');
  });

  test('denied: ZIP still built, remote links kept, visible notice naming the hosts', async () => {
    const z = await buildArticleZip(result, { fetchInPage: inPage, sendMessage: async () => ({ ok: false, error: 'network' }) });
    expect(z).toMatchObject({ packed: 1, total: 3, permissionCount: 2, needsPermission: [PLOS_IMAGE_ORIGIN, SPRINGER_IMAGE_ORIGIN] });
    expect(z.bytes.length).toBeGreaterThan(0);
    const files = new TextDecoder().decode(z.bytes);
    expect(files).toContain('![F1](https://journals.plos.org/plosone/article/figure/image?size=large&id=g001)');
    expect(files).toContain('![F2](https://media.springernature.com/lw685/b.jpg)');
    expect(files).toContain('![F3](images/03-c.jpg)');
    const r = { ok: true, saved: true, filename: 'a.zip', markdown: '', zip: z };
    expect(describeResult(r, 'en', 'zip').notes).toContain('2 image(s) are stored on PLOS image storage (r2.cloudflarestorage.com), media.springernature.com, which needs your permission. They keep their web links in article.md. To include them, click Download ZIP in the toolbar popup and choose Allow.');
    expect(describeResult(r, 'zh', 'zip').notes.join('')).toContain('需要你授权才能打包');
  });

  test('not needed: eLife-only images never mention permissions', async () => {
    const z = await buildArticleZip({ markdown: '![x](images/01-c.jpg)', assets: [{ url: 'https://iiif.elifesciences.org/c.jpg', path: 'images/01-c.jpg' }] }, { fetchInPage: async () => null, sendMessage: async () => null });
    expect(z.needsPermission).toEqual([]);
    expect(describeResult({ ok: true, saved: true, filename: 'a.zip', markdown: '', zip: z }, 'en', 'zip').notes.join(' ')).not.toContain('permission');
  });
});
