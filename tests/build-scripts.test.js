const path = require('path');
const fs = require('fs');
const os = require('os');
const { manifestForTarget, verifyBackground, parseVerifyArgs, normalizeTarget } = require('../scripts/manifest-target');
const { verifyPermissions, verifyBrowserSettings, verifyDist } = require('../scripts/verify-dist');
const { scanText } = require('../scripts/check-no-keys');
const { ALLOWED_PERMISSIONS, ALLOWED_HOST_PERMISSIONS } = require('../scripts/permission-allowlist');
const { png } = require('../scripts/generate-icons');
const manifest = require('../src/manifest.json');

describe('source manifest', () => {
  test('permissions are exactly the M1 allowlist', () => {
    expect([...manifest.permissions].sort()).toEqual([...ALLOWED_PERMISSIONS].sort());
    expect([...manifest.host_permissions].sort()).toEqual([...ALLOWED_HOST_PERMISSIONS].sort());
    expect(manifest.optional_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(verifyPermissions(manifest)).toEqual([]);
  });
  test('name, description and commands are localized', () => {
    expect(manifest.name).toBe('__MSG_extName__');
    expect(manifest.description).toBe('__MSG_extDescription__');
    expect(manifest.default_locale).toBe('en');
  });
});

describe('manifestForTarget', () => {
  test('chrome: service_worker only, no gecko settings', () => {
    const m = manifestForTarget(manifest, 'chrome');
    expect(m.background).toEqual({ service_worker: 'background.js' });
    expect(m.browser_specific_settings).toBeUndefined();
    expect(verifyBackground(m, 'chrome')).toEqual([]);
    expect(verifyBrowserSettings(m, 'chrome')).toEqual([]);
  });
  test('firefox: scripts only, gecko id and data collection', () => {
    const m = manifestForTarget(manifest, 'firefox');
    expect(m.background).toEqual({ scripts: ['background.js'] });
    expect(m.browser_specific_settings.gecko).toMatchObject({ id: 'journal-md@tendo33', data_collection_permissions: { required: ['websiteContent'] } });
    expect(verifyBackground(m, 'firefox')).toEqual([]);
    expect(verifyBrowserSettings(m, 'firefox')).toEqual([]);
  });
  test('target parsing', () => {
    expect(normalizeTarget(undefined)).toBe('chrome');
    expect(() => normalizeTarget('')).toThrow();
    expect(() => normalizeTarget('safari')).toThrow();
    expect(parseVerifyArgs([])).toEqual([{ target: 'chrome', dist: 'dist' }, { target: 'firefox', dist: 'dist-firefox' }]);
    expect(parseVerifyArgs(['--target=firefox'])).toEqual([{ target: 'firefox', dist: 'dist-firefox' }]);
    expect(() => parseVerifyArgs(['--target', 'firefox'])).toThrow();
  });
});

describe('verifyPermissions rejects anything outside the allowlist', () => {
  test.each([
    [{ permissions: ['tabs'] }, 'permission not in M1 allowlist: tabs'],
    [{ host_permissions: ['<all_urls>'] }, 'forbidden host pattern: <all_urls>'],
    [{ host_permissions: ['https://www.ncbi.nlm.nih.gov/pmc/*'] }, 'host_permission not in M1 allowlist: https://www.ncbi.nlm.nih.gov/pmc/*'],
    [{ host_permissions: ['http://localhost/*'] }, 'forbidden host pattern: http://localhost/*'],
    [{ optional_host_permissions: ['https://paddleocr.aistudio-app.com/*'] }, 'optional_host_permissions must not be declared in M1'],
    [{ content_scripts: [{ matches: ['https://www.sciencedirect.com/*'] }] }, 'content_scripts match outside host_permissions: https://www.sciencedirect.com/*'],
  ])('%j', (m, msg) => {
    expect(verifyPermissions(m)).toContain(msg);
  });
});

describe('verifyDist on a temp directory', () => {
  function makeDist(extra) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jmd-dist-'));
    const m = manifestForTarget(manifest, 'chrome');
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m));
    for (const f of ['background.js', 'content.js', 'popup.html', 'options.html']) fs.writeFileSync(path.join(dir, f), '// ok\n');
    fs.mkdirSync(path.join(dir, 'assets'));
    for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(dir, `assets/icon-${s}.png`), png(s));
    for (const loc of ['en', 'zh_CN']) {
      fs.mkdirSync(path.join(dir, '_locales', loc), { recursive: true });
      fs.copyFileSync(path.join(__dirname, `../src/_locales/${loc}/messages.json`), path.join(dir, `_locales/${loc}/messages.json`));
    }
    if (extra) extra(dir);
    return dir;
  }
  test('clean dist passes', () => {
    expect(verifyDist(makeDist(), 'chrome')).toEqual([]);
  });
  test('source maps and keys fail', () => {
    const dir = makeDist((d) => {
      fs.writeFileSync(path.join(d, 'content.js.map'), '{}');
      fs.writeFileSync(path.join(d, 'popup.js'), 'x\n//# sourceMappingURL=popup.js.map\nconst k="sk-abcdefghijklmnopqrstu";');
    });
    const errors = verifyDist(dir, 'chrome');
    expect(errors).toEqual(expect.arrayContaining([
      'source map shipped: content.js.map',
      'sourceMappingURL comment shipped: popup.js',
      expect.stringMatching(/^popup\.js: sk- key/),
    ]));
  });
});

test('check-no-keys detects common key formats', () => {
  expect(scanText('const a = "AKIAABCDEFGHIJKLMNOP";').map((h) => h.name)).toEqual(['AWS access key']);
  expect(scanText('Bearer ${token}')).toEqual([]);
});

test('icon generator writes valid PNG signatures', () => {
  expect(png(16).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
});
