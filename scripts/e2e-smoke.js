#!/usr/bin/env node
/* global document */
// 扩展冒烟（有界面的 Chromium，加载 dist/）：所有网络请求都被 route 到 tests/fixtures 或直接中止，不访问真实站点。
// 覆盖：content script 注入、popup（支持 / 不支持页面）、JATS 探测、导出下载、复制、options 即时保存、控制台无报错。
// 本仓库不依赖 playwright：和 arxiv-md 一样装到仓库外，经 E2E_PLAYWRIGHT_DIR 传进来；CHROME_PATH 可指定浏览器。
//   E2E_PLAYWRIGHT_DIR=/tmp/e2e node scripts/e2e-smoke.js
const path = require('path');
const fs = require('fs');
const os = require('os');

const pwDir = process.env.E2E_PLAYWRIGHT_DIR;
const { chromium } = require(pwDir ? path.join(pwDir, 'node_modules', 'playwright') : 'playwright');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const fixture = (p) => fs.readFileSync(path.join(root, 'tests/fixtures', p), 'utf8');

const PMC_URL = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11000001/';
const PUBMED_URL = 'https://pubmed.ncbi.nlm.nih.gov/31768545/';
const ROUTES = {
  [PMC_URL]: { type: 'text/html', body: fixture('html/pmc-article.html') },
  [PUBMED_URL]: { type: 'text/html', body: fixture('html/pubmed-abstract-only.html') },
  'https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11000001/fullTextXML': { type: 'application/xml', body: fixture('jats/europepmc-full.xml') },
};

let failures = 0;
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${!cond && detail ? ` — ${detail}` : ''}`);
  if (!cond) failures += 1;
}

async function main() {
  if (!fs.existsSync(path.join(dist, 'manifest.json'))) throw new Error('dist/ missing: run npm run build first');
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jmd-e2e-'));
  const downloadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jmd-dl-'));
  const ctx = await chromium.launchPersistentContext(userDir, {
    headless: false,
    executablePath: process.env.CHROME_PATH || undefined,
    acceptDownloads: true,
    downloadsPath: downloadsDir,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--no-first-run'],
  });
  const consoleErrors = [];
  const external = [];
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('chrome-extension://') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    const hit = ROUTES[url];
    if (hit) return route.fulfill({ status: 200, contentType: hit.type, body: hit.body });
    // 页面自己的图片等资源直接中止；扩展发出的 fetch/xhr 必须全部命中 fixture
    if (['fetch', 'xhr'].includes(route.request().resourceType())) external.push(url);
    return route.abort();
  });

  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  const extId = new URL(sw.url()).host;
  check('service worker started', !!extId);

  // 安装后打开引导页
  await new Promise((r) => setTimeout(r, 1000));
  check('welcome page opened on install', ctx.pages().some((p) => p.url().includes('options.html?welcome=1')));

  const page = await ctx.newPage();
  // fixture 页里的图片被故意中止，忽略「Failed to load resource」
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(`page: ${m.text()}`); });
  await page.goto(PMC_URL);
  await page.waitForTimeout(800);
  const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, PMC_URL);

  // content script → 导出（JATS 由 route 提供）
  const res = await sw.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'JMD_EXPORT', action: 'none' }), tabId);
  check('export via JATS route', res && res.ok && res.route === 'jats-europepmc', JSON.stringify(res && { ok: res.ok, route: res.route, error: res.error }));
  check('markdown has front matter and footnotes', res && /^---\ntitle:/.test(res.markdown) && res.markdown.includes('[^1]:'));

  // popup：把 chrome.tabs.query 指到 fixture 标签页（独立打开的 popup 自己才是活动标签页）
  const popup = await ctx.newPage();
  popup.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`popup: ${m.text()}`); });
  await popup.addInitScript(({ id, url }) => {
    const orig = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = async (q) => (q && q.active ? [{ id, url }] : orig(q));
  }, { id: tabId, url: PMC_URL });
  await popup.setViewportSize({ width: 360, height: 600 });
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForSelector('#info:not([hidden])', { timeout: 5000 });
  check('popup shows platform', (await popup.textContent('#platform')) === 'PubMed Central');
  check('popup shows PMCID', (await popup.textContent('#pmcid')) === 'PMC11000001');
  await popup.waitForFunction(() => document.querySelector('#routes').textContent.includes('JATS ✓'), null, { timeout: 5000 }).catch(() => {});
  check('popup routes read JATS ✓ / Page ✓', /JATS ✓.*✓/.test(await popup.textContent('#routes')), await popup.textContent('#routes'));
  const rowBefore = await popup.locator('#actions').boundingBox();
  await popup.click('#export');
  await popup.waitForSelector('#status .ok', { timeout: 8000 }).catch(() => {});
  const status = await popup.textContent('#status');
  check('export button saves .md', /(Saved|已保存) .*\(2025\)\.md/.test(status), status);
  const rowAfter = await popup.locator('#actions').boundingBox();
  check('R05: button row does not move after status', Math.abs(rowBefore.y - rowAfter.y) <= 1 && Math.abs(rowBefore.height - rowAfter.height) <= 1);
  const dl = await sw.evaluate(() => new Promise((r) => setTimeout(() => chrome.downloads.search({}).then(r), 1000)));
  // Playwright 接管下载时会把文件改名成 GUID，所以检查内容而不是文件名
  const done = dl.filter((d) => d.state === 'complete');
  const body = done.length ? fs.readFileSync(done[0].filename, 'utf8') : '';
  check('download completed with Markdown content', /^---\ntitle: /.test(body) && body.includes('source_route: jats-europepmc'), JSON.stringify(dl.map((d) => [d.filename, d.state, d.error])));
  const noHScroll = await popup.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  check('R08: popup has no horizontal scroll', noHScroll);
  const selects = await popup.locator('select').count();
  check('R01: no native select in popup', selects === 0);

  // 不支持的页面：popup 直接给出原因
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => { chrome.tabs.query = async () => [{ id: -1, url: 'https://www.mdpi.com/2076-2615/11/5/1300' }]; });
  await p2.goto(`chrome-extension://${extId}/popup.html`);
  await p2.waitForSelector('#empty:not([hidden])');
  check('popup explains planned site', (await p2.textContent('#empty')).includes('MDPI'));

  // PubMed 无 PMCID：仅摘要
  const pub = await ctx.newPage();
  await pub.goto(PUBMED_URL);
  await pub.waitForTimeout(500);
  const pubTab = await sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, PUBMED_URL);
  const pr = await sw.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'JMD_EXPORT', action: 'none' }), pubTab);
  check('PubMed abstract-only export', pr && pr.ok && pr.abstractOnly && pr.markdown.includes('Abstract only / 仅摘要'));

  // options：语言切换即时生效，设置写入 storage
  const opt = await ctx.newPage();
  opt.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`options: ${m.text()}`); });
  await opt.goto(`chrome-extension://${extId}/options.html`);
  await opt.click('input[name="language"][value="zh"]', { force: true });
  await opt.waitForFunction(() => document.querySelector('h1').textContent.includes('设置'));
  check('options switches to Chinese immediately', true);
  await opt.click('#includeImages', { force: true });
  await opt.waitForTimeout(300);
  const stored = await sw.evaluate(() => chrome.storage.sync.get('settings'));
  check('options instant-save', stored.settings && stored.settings.language === 'zh' && stored.settings.includeImages === false, JSON.stringify(stored));
  check('options has no native select', (await opt.locator('select').count()) === 0);

  check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('no real network requests left the browser', external.length === 0, external.slice(0, 5).join(', '));

  await ctx.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall smoke checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
