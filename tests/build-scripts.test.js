const path = require('path');
const fs = require('fs');
const os = require('os');
const { manifestForTarget, verifyBackground, parseVerifyArgs, normalizeTarget } = require('../scripts/manifest-target');
const { verifyPermissions, verifyBrowserSettings, verifyDist } = require('../scripts/verify-dist');
const { scanText } = require('../scripts/check-no-keys');
const { ALLOWED_PERMISSIONS, ALLOWED_HOST_PERMISSIONS, OPTIONAL_HOST_PERMISSIONS } = require('../scripts/permission-allowlist');
const manifest = require('../src/manifest.json');

describe('source manifest', () => {
  test('permissions are exactly the allowlist; PDF backends only optional', () => {
    expect([...manifest.permissions].sort()).toEqual([...ALLOWED_PERMISSIONS].sort());
    expect([...manifest.host_permissions].sort()).toEqual([...ALLOWED_HOST_PERMISSIONS].sort());
    expect(manifest.optional_permissions).toEqual(['declarativeNetRequestWithHostAccess']);
    expect([...manifest.optional_host_permissions].sort()).toEqual([...OPTIONAL_HOST_PERMISSIONS].sort());
    expect(verifyPermissions(manifest)).toEqual([]);
  });
  test('Firefox build requires DNR (as arxiv-md), Chrome keeps it optional; nothing else changes', () => {
    const ff = manifestForTarget(manifest, 'firefox');
    const cr = manifestForTarget(manifest, 'chrome');
    expect(ff.permissions).toEqual([...manifest.permissions, 'declarativeNetRequestWithHostAccess']);
    expect(ff.optional_permissions).toBeUndefined();
    expect(ff.optional_host_permissions).toEqual(manifest.optional_host_permissions);
    expect(cr.permissions).toEqual(manifest.permissions);
    expect(cr.optional_permissions).toEqual(['declarativeNetRequestWithHostAccess']);
    expect(verifyPermissions(ff, 'firefox')).toEqual([]);
    expect(verifyPermissions(cr, 'chrome')).toEqual([]);
    expect(verifyPermissions(ff, 'chrome')).toContain('permission not in allowlist: declarativeNetRequestWithHostAccess');
  });
  test('shortcuts: export Alt+Shift+J (no clash with arxiv-md Alt+Shift+M / zhihu-md Alt+Shift+K), copy unassigned', () => {
    expect(manifest.commands['export-markdown'].suggested_key).toEqual({ default: 'Alt+Shift+J' });
    expect(manifest.commands['copy-markdown'].suggested_key).toBeUndefined();
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
    [{ permissions: ['tabs'] }, 'permission not in allowlist: tabs'],
    [{ host_permissions: ['<all_urls>'] }, 'forbidden host pattern: <all_urls>'],
    [{ host_permissions: ['https://www.ncbi.nlm.nih.gov/pmc/*'] }, 'host_permission not in allowlist: https://www.ncbi.nlm.nih.gov/pmc/*'],
    [{ host_permissions: ['http://localhost/*'] }, 'forbidden host pattern: http://localhost/*'],
    [{ optional_host_permissions: ['https://api.example.com/*'] }, 'optional_host_permission not in allowlist: https://api.example.com/*'],
    [{ optional_permissions: ['tabs'] }, 'optional_permission not in allowlist: tabs'],
    [{ optional_permissions: [] }, 'Chrome build must keep declarativeNetRequestWithHostAccess optional'],
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
    for (const s of [16, 32, 48, 128]) fs.copyFileSync(path.join(__dirname, `../assets/icon-${s}.png`), path.join(dir, `assets/icon-${s}.png`));
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
      fs.writeFileSync(path.join(d, 'popup.js'), `x\n//# sourceMappingURL=popup.js.map\nconst k="${'sk'}-abcdefghijklmnopqrstu";`);
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
  expect(scanText(`const a = "${'AKIA'}ABCDEFGHIJKLMNOP";`).map((h) => h.name)).toEqual(['AWS access key']);
  expect(scanText('Bearer ${token}')).toEqual([]);
});

test('icons: icon A (open journal, teal) PNGs at their declared sizes, same set for manifest and toolbar', () => {
  const sizes = { 16: 'assets/icon-16.png', 32: 'assets/icon-32.png', 48: 'assets/icon-48.png', 128: 'assets/icon-128.png' };
  expect(manifest.icons).toEqual(sizes);
  expect(manifest.action.default_icon).toEqual(sizes);
  for (const [size, file] of Object.entries(sizes)) {
    const buf = fs.readFileSync(path.join(__dirname, '..', file));
    expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    // IHDR：宽高在第 16–23 字节
    expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([Number(size), Number(size)]);
  }
  const svg = fs.readFileSync(path.join(__dirname, '../assets/icon.svg'), 'utf8');
  expect(svg).toContain('fill="#0f766e"');
  for (const page of ['src/ui/popup/popup.html', 'src/ui/options/options.html']) {
    expect(fs.readFileSync(path.join(__dirname, '..', page), 'utf8')).toContain('src="assets/icon.svg"');
  }
});

test('review N4: Firefox data collection declaration mirrors arxiv-md (required websiteContent only)', () => {
  const ff = manifestForTarget(manifest, 'firefox');
  expect(ff.browser_specific_settings.gecko.data_collection_permissions).toEqual({ required: ['websiteContent'] });
});

test('review N5: the vendored pdf-parse-core carries the upstream MIT licence', () => {
  const lic = fs.readFileSync(path.join(__dirname, '../vendor/pdf-parse-core/LICENSE'), 'utf8');
  expect(lic).toMatch(/^MIT License/);
  expect(lic).toContain('Copyright (c) 2025 SimonSun');
});
