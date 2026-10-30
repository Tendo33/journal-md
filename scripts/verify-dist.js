#!/usr/bin/env node
// 校验构建产物：
//  1. background 字段按目标浏览器（Chrome/Edge 只有 service_worker，Firefox 只有 scripts）
//  2. permissions / host_permissions 只在 M1 白名单内，没有 optional_*、<all_urls>、localhost
//  3. Firefox 包有 gecko id 和 data_collection_permissions；Chrome 包没有 browser_specific_settings
//  4. manifest 引用的文件都在；_locales en / zh_CN 的键一致，manifest 用到的 __MSG_*__ 都有
//  5. 不带 source map，没有字面量 Key
// 用法：node scripts/verify-dist.js [distDir] [--target=chrome|firefox]（不给参数时校验 dist 和 dist-firefox）
const fs = require('fs');
const path = require('path');
const { parseVerifyArgs, verifyBackground, normalizeTarget } = require('./manifest-target');
const { ALLOWED_PERMISSIONS, ALLOWED_HOST_PERMISSIONS, FORBIDDEN_HOST_PATTERNS, GECKO_ID } = require('./permission-allowlist');
const { scanText, walk } = require('./check-no-keys');

function hostOf(pattern) {
  const m = String(pattern).match(/^[^:]+:\/\/([^/]+)(\/.*)?$/);
  return m ? m[1] : null;
}

function verifyPermissions(manifest) {
  const errors = [];
  for (const p of manifest.permissions || []) {
    if (!ALLOWED_PERMISSIONS.includes(p)) errors.push(`permission not in M1 allowlist: ${p}`);
  }
  for (const h of manifest.host_permissions || []) {
    if (!ALLOWED_HOST_PERMISSIONS.includes(h)) errors.push(`host_permission not in M1 allowlist: ${h}`);
  }
  if (manifest.optional_permissions) errors.push('optional_permissions must not be declared in M1');
  if (manifest.optional_host_permissions) errors.push('optional_host_permissions must not be declared in M1');
  const allPatterns = [
    ...(manifest.host_permissions || []),
    ...(manifest.content_scripts || []).flatMap((c) => c.matches || []),
    ...(manifest.web_accessible_resources || []).flatMap((w) => w.matches || []),
  ];
  for (const p of allPatterns) {
    for (const re of FORBIDDEN_HOST_PATTERNS) if (re.test(p)) errors.push(`forbidden host pattern: ${p}`);
  }
  // content script 只能注入到已授权的 host 上
  const allowedHosts = ALLOWED_HOST_PERMISSIONS.map(hostOf);
  for (const c of manifest.content_scripts || []) {
    for (const m of c.matches || []) {
      const h = hostOf(m);
      const ok = allowedHosts.some((a) => a === h || (a.startsWith('*.') && h.endsWith(a.slice(1))));
      if (!ok) errors.push(`content_scripts match outside host_permissions: ${m}`);
    }
  }
  return errors;
}

function verifyBrowserSettings(manifest, target) {
  const errors = [];
  const bss = manifest.browser_specific_settings;
  if (normalizeTarget(target) === 'firefox') {
    const gecko = bss && bss.gecko;
    if (!gecko || gecko.id !== GECKO_ID) errors.push(`Firefox build must set browser_specific_settings.gecko.id = ${GECKO_ID}`);
    const req = gecko && gecko.data_collection_permissions && gecko.data_collection_permissions.required;
    if (!Array.isArray(req) || !req.includes('websiteContent')) errors.push('Firefox build must declare data_collection_permissions.required ["websiteContent"]');
  } else if (bss) {
    errors.push('Chrome/Edge build must not carry browser_specific_settings');
  }
  return errors;
}

function referencedFiles(manifest) {
  const files = new Set();
  Object.values(manifest.icons || {}).forEach((f) => files.add(f));
  Object.values((manifest.action && manifest.action.default_icon) || {}).forEach((f) => files.add(f));
  if (manifest.action && manifest.action.default_popup) files.add(manifest.action.default_popup);
  if (manifest.options_ui && manifest.options_ui.page) files.add(manifest.options_ui.page);
  if (manifest.background) {
    if (manifest.background.service_worker) files.add(manifest.background.service_worker);
    (manifest.background.scripts || []).forEach((f) => files.add(f));
  }
  (manifest.content_scripts || []).forEach((c) => [...(c.js || []), ...(c.css || [])].forEach((f) => files.add(f)));
  return [...files];
}

function msgKeys(text) {
  return [...String(text).matchAll(/__MSG_([A-Za-z0-9_@]+)__/g)].map((m) => m[1]);
}

function verifyLocales(dist, manifest) {
  const errors = [];
  const read = (loc) => {
    const p = path.join(dist, '_locales', loc, 'messages.json');
    if (!fs.existsSync(p)) { errors.push(`missing _locales/${loc}/messages.json`); return null; }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  };
  const en = read('en');
  const zh = read('zh_CN');
  if (!en || !zh) return errors;
  const ek = Object.keys(en);
  const zk = Object.keys(zh);
  ek.filter((k) => !zk.includes(k)).forEach((k) => errors.push(`zh_CN is missing key ${k}`));
  zk.filter((k) => !ek.includes(k)).forEach((k) => errors.push(`en is missing key ${k}`));
  for (const k of msgKeys(JSON.stringify(manifest))) {
    if (!en[k] || !zh[k]) errors.push(`manifest uses __MSG_${k}__ but a locale lacks it`);
  }
  if (manifest.default_locale !== 'en') errors.push('default_locale must be en');
  return errors;
}

function verifyNoSourceMapsOrKeys(dist) {
  const errors = [];
  const all = [];
  (function collect(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) collect(p); else all.push(p);
    }
  })(dist);
  for (const f of all) {
    const rel = path.relative(dist, f);
    if (/\.map$/.test(f)) errors.push(`source map shipped: ${rel}`);
    if (/\.(js|css)$/.test(f) && /[#@]\s*sourceMappingURL=/.test(fs.readFileSync(f, 'utf8'))) {
      errors.push(`sourceMappingURL comment shipped: ${rel}`);
    }
    if (/\.(env|pem|key)$/.test(f) || /(^|[\\/])\.env/.test(rel)) errors.push(`secret-like file shipped: ${rel}`);
  }
  for (const f of walk(dist, [])) {
    for (const h of scanText(fs.readFileSync(f, 'utf8'))) errors.push(`${path.relative(dist, f)}: ${h.name} ${h.sample}`);
  }
  return errors;
}

function verifyDist(distDir, target) {
  const dist = path.resolve(distDir);
  const manifestPath = path.join(dist, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return [`cannot find ${manifestPath}; build first`];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errors = [
    ...verifyBackground(manifest, target),
    ...verifyPermissions(manifest),
    ...verifyBrowserSettings(manifest, target),
    ...referencedFiles(manifest).filter((f) => !fs.existsSync(path.join(dist, f))).map((f) => `manifest references missing file: ${f}`),
    ...verifyLocales(dist, manifest),
    ...verifyNoSourceMapsOrKeys(dist),
  ];
  if (manifest.manifest_version !== 3) errors.push('manifest_version must be 3');
  return errors;
}

module.exports = { verifyDist, verifyPermissions, verifyBrowserSettings, verifyLocales, verifyNoSourceMapsOrKeys, referencedFiles };

if (require.main === module) {
  let jobs;
  try {
    jobs = parseVerifyArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`verify:dist failed: ${e.message}`);
    process.exit(1);
  }
  let failed = false;
  for (const { dist, target } of jobs) {
    const errors = verifyDist(dist, target);
    if (errors.length) {
      failed = true;
      console.error(`verify:dist failed for ${dist} (target: ${target}), ${errors.length} problem(s):`);
      errors.forEach((m) => console.error('  - ' + m));
    } else {
      console.log(`verify:dist passed (target: ${target}): ${path.resolve(dist)}`);
    }
  }
  if (failed) process.exit(1);
}
