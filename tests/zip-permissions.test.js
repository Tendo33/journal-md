// ZIP 图片 CDN（PLOS 图片存储桶、media.springernature.com）：Simon 2026-10-30 18:06 起安装时授予，使用时不申请任何权限。
import fs from 'fs';
import path from 'path';
import { inspectPage } from '@core/export/pipeline';
import * as popupView from '@/ui/popup/popup-view';
import * as hosts from '@core/zip-image-hosts';
import { originNeededFor, PLOS_IMAGE_ORIGIN, SPRINGER_IMAGE_ORIGIN, ZIP_IMAGE_ORIGINS } from '@core/zip-image-hosts';
import { buildArticleZip } from '@/content/zip-export';
import { describeResult } from '@/ui/shared/result-text';
const manifest = require('../src/manifest.json');
const { ALLOWED_HOST_PERMISSIONS, FORBIDDEN_HOST_PATTERNS } = require('../scripts/permission-allowlist');
const { manifestForTarget } = require('../scripts/manifest-target');
const { verifyPermissions } = require('../scripts/verify-dist');

const html = (name) => new DOMParser().parseFromString(fs.readFileSync(path.join(__dirname, 'fixtures/html', name), 'utf8'), 'text/html');

describe('which images sit on the two install-time image CDNs (background proxy allowlist)', () => {
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

describe('manifest: image CDNs granted at install, exact hosts, both browsers (Simon 10-30 18:06)', () => {
  test('the two hosts are host_permissions in Chrome and Firefox; no optional_* at all', () => {
    for (const target of ['chrome', 'firefox']) {
      const m = manifestForTarget(manifest, target);
      for (const o of ZIP_IMAGE_ORIGINS) {
        expect(m.host_permissions).toContain(o);
        expect(ALLOWED_HOST_PERMISSIONS).toContain(o);
      }
      expect(m.optional_host_permissions).toBeUndefined();
      expect(verifyPermissions(m, target)).toEqual([]);
    }
  });

  test('no broad wildcard was added', () => {
    for (const o of manifest.host_permissions) {
      expect(o).not.toMatch(/^\*:|:\/\/\*\/|<all_urls>|:\/\/\*\.r2\.cloudflarestorage\.com|:\/\/\*\.springernature\.com/);
      for (const re of FORBIDDEN_HOST_PATTERNS) expect(re.test(o)).toBe(false);
    }
  });

  test('verify:dist rejects a wildcard bucket host', () => {
    expect(verifyPermissions({ permissions: ['declarativeNetRequestWithHostAccess'], host_permissions: ['https://*.r2.cloudflarestorage.com/*'] })).toContain('host_permission not in allowlist: https://*.r2.cloudflarestorage.com/*');
  });
});

describe('fix2c: nothing asks for a permission at use time', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const sources = walk(path.join(__dirname, '../src')).filter((f) => /\.(js|html)$/.test(f));
  const rel = (f) => path.relative(path.join(__dirname, '..'), f);

  test('no source file calls permissions.request (popup, options, content, background)', () => {
    const offenders = sources.filter((f) => /permissions\s*\.\s*request\s*\(|\.request\(\s*\{\s*origins/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map(rel)).toEqual([]);
  });

  test("nothing uses the vendored core's permission helpers (kept unchanged from arxiv-md, never called here)", () => {
    const helpers = /\b(requestProviderPermission|ensureProviderPermission|withRequiredPermissions|hasProviderPermission|removeProviderPermission)\b|pdf-core\/permissions/;
    expect(sources.filter((f) => helpers.test(fs.readFileSync(f, 'utf8'))).map(rel)).toEqual([]);
  });

  test('the request helpers and per-page origin lists are gone', () => {
    expect(popupView.requestZipImagePermission).toBeUndefined();
    expect(hosts.originsNeededFor).toBeUndefined();
    expect(hosts.originLabel).toBeUndefined();
    expect(inspectPage(html('springer-deseq2.html'), 'https://link.springer.com/article/10.1186/s13059-014-0550-8').zipOrigins).toBeUndefined();
    expect(inspectPage(html('plos-pmed-0020124.html'), 'https://journals.plos.org/plosmedicine/article?id=10.1371/journal.pmed.0020124').zipOrigins).toBeUndefined();
  });

  test('no permission wording left in either locale', () => {
    for (const loc of ['en', 'zh_CN']) {
      const msgs = require(`../src/_locales/${loc}/messages.json`);
      expect(msgs.noticeZipNeedsPermission).toBeUndefined();
      expect(msgs.noticeZipPartial.message + msgs.noticeZipNone.message).not.toMatch(/permission|does not let extensions|授权|不允许扩展/);
    }
  });
});

describe('ZIP: background fetch succeeds or fails, ZIP is always built', () => {
  const result = {
    markdown: '![F1](images/01-a.jpg)\n\n![F2](images/02-b.jpg)\n\n![F3](images/03-c.jpg)',
    assets: [
      { url: 'https://journals.plos.org/plosone/article/figure/image?size=large&id=g001', path: 'images/01-a.jpg', alts: [] },
      { url: 'https://media.springernature.com/lw685/b.jpg', path: 'images/02-b.jpg', alts: [] },
      { url: 'https://iiif.elifesciences.org/c.jpg', path: 'images/03-c.jpg', alts: [] },
    ],
  };
  const inPage = async (u) => (u.includes('iiif') ? new Uint8Array([3]) : null); // 两个 CDN 都没有 CORS

  test('background fetch works (host permission granted at install) → everything packed, no notice about permissions', async () => {
    const send = jest.fn(async () => ({ ok: true, base64: 'AQ==' }));
    const z = await buildArticleZip(result, { fetchInPage: inPage, sendMessage: send });
    expect(z).toMatchObject({ packed: 3, total: 3, failedHosts: [] });
    expect(z.needsPermission).toBeUndefined();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://media.springernature.com/lw685/b.jpg' }));
    const notes = describeResult({ ok: true, saved: true, filename: 'a.zip', markdown: '', zip: z }, 'en', 'zip').notes;
    expect(notes).toEqual(['All 3 images are in the ZIP; links point to images/.']);
  });

  test('background fetch fails: ZIP still built, remote links kept, neutral notice naming the hosts', async () => {
    const z = await buildArticleZip(result, { fetchInPage: inPage, sendMessage: async () => ({ ok: false, error: 'network' }) });
    expect(z).toMatchObject({ packed: 1, total: 3, failedHosts: ['journals.plos.org', 'media.springernature.com'] });
    expect(z.bytes.length).toBeGreaterThan(0);
    const files = new TextDecoder().decode(z.bytes);
    expect(files).toContain('![F1](https://journals.plos.org/plosone/article/figure/image?size=large&id=g001)');
    expect(files).toContain('![F2](https://media.springernature.com/lw685/b.jpg)');
    expect(files).toContain('![F3](images/03-c.jpg)');
    const r = { ok: true, saved: true, filename: 'a.zip', markdown: '', zip: z };
    expect(describeResult(r, 'en', 'zip').notes).toEqual(['1 of 3 images are in the ZIP. The other 2 could not be downloaded from journals.plos.org, media.springernature.com; they keep their web links in article.md.']);
    expect(describeResult(r, 'zh', 'zip').notes).toEqual(['已打包 1/3 张图片。其余 2 张没能从 journals.plos.org, media.springernature.com 下载，article.md 里保留网络链接。']);
  });
});
