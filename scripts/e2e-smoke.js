#!/usr/bin/env node
/* global document, getComputedStyle */
// 扩展冒烟（有界面的 Chromium，加载 dist/）：所有网络请求都被 route 到 tests/fixtures 或直接中止，不访问真实站点。
// 覆盖：content script 注入、popup（支持 / 不支持页面）、JATS 探测、导出下载、复制、options 即时保存、控制台无报错；
// 1.0.0 新增：出版商页面（Nature、eLife 真实页面 fixture）、页内悬浮按钮（键盘、深色）、ZIP 内容、PDF 解析的 OA 确认（不访问真实后端）。
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
const NATURE_URL = 'https://www.nature.com/articles/s41586-021-03819-2';
const ELIFE_URL = 'https://elifesciences.org/articles/09560';
// 同一篇 Nature 文章去掉 CC 许可：当作非开放获取（PDF 解析要先确认）
const NATURE_CLOSED_URL = `${NATURE_URL}?e2e=closed`;
const ROUTES = {
  [PMC_URL]: { type: 'text/html', body: fixture('html/pmc-article.html') },
  [PUBMED_URL]: { type: 'text/html', body: fixture('html/pubmed-abstract-only.html') },
  [NATURE_URL]: { type: 'text/html', body: fixture('html/nature-alphafold.html') },
  [ELIFE_URL]: { type: 'text/html', body: fixture('html/elife-09560.html') },
  [NATURE_CLOSED_URL]: { type: 'text/html', body: fixture('html/nature-alphafold.html').replace(/creativecommons\.org/g, 'example.org').replace(/<meta name="dc\.rights"[^>]*>/g, '') },
  'https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11000001/fullTextXML': { type: 'application/xml', body: fixture('jats/europepmc-full.xml') },
};
// 1×1 PNG：eLife 的 iiif 图片（真实服务器带 Access-Control-Allow-Origin: *）
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const NO_HITS = JSON.stringify({ hitCount: 0, resultList: { result: [] } });

/** 读 store-only ZIP 里的文件名和内容 */
function unzip(buf) {
  const files = {};
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const name = buf.toString('utf8', p + 30, p + 30 + nameLen);
    files[name] = buf.subarray(p + 30 + nameLen, p + 30 + nameLen + size);
    p += 30 + nameLen + size;
  }
  return files;
}

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
  const jatsHits = [];
  const searchHits = [];
  const pdfBackendHits = [];
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('chrome-extension://') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    const hit = ROUTES[url];
    if (url.includes('/fullTextXML')) jatsHits.push(url);
    if (/paddleocr\.aistudio-app\.com|bcebos\.com|mineru\.net|openxlab\.org\.cn/.test(url)) pdfBackendHits.push(url);
    if (hit) return route.fulfill({ status: 200, contentType: hit.type, body: hit.body });
    if (url.startsWith('https://www.ebi.ac.uk/europepmc/webservices/rest/search?')) {
      searchHits.push(url);
      return route.fulfill({ status: 200, contentType: 'application/json', body: NO_HITS });
    }
    if (url.startsWith('https://iiif.elifesciences.org/') && ['fetch', 'xhr'].includes(route.request().resourceType())) {
      return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: PNG });
    }
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
  await popup.waitForTimeout(1000);
  check('popup shows platform', (await popup.textContent('#platform')) === 'PubMed Central');
  check('icon: popup header logo (assets/icon.svg) loads', await popup.$eval('.head img', (img) => img.complete && img.naturalWidth > 0 && img.getAttribute('src') === 'assets/icon.svg'));
  check('popup shows PMCID', (await popup.textContent('#pmcid')) === 'PMC11000001');
  check('popup routes: JATS checked on export / Page ✓', /JATS.*(export|导出时检查).*✓/.test(await popup.textContent('#routes')), await popup.textContent('#routes'));
  check('shortcut hint shows Alt+Shift+J', /Alt\+Shift\+J|⌥⇧J/.test(await popup.textContent('#shortcuts')), await popup.textContent('#shortcuts'));
  check('M-1: opening the popup sends no request', jatsHits.length === 0 && external.length === 0, jatsHits.concat(external).join(', '));
  const rowBefore = await popup.locator('#actions').boundingBox();
  await popup.click('#export');
  await popup.waitForSelector('#status .ok', { timeout: 8000 }).catch(() => {});
  await popup.waitForTimeout(300);
  const status = await popup.textContent('#status');
  check('export button saves .md', /(Saved|已保存) .*\(2025\)\.md/.test(status), status);
  check('MF3: no stale "Converting…" line after export', !/Converting|正在转换/.test(status), status);
  check('M-1: export sends exactly one Europe PMC request', jatsHits.length === 1, jatsHits.join(', '));
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

  // content script → 导出（后台缓存命中，不再请求）
  const res = await sw.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'JMD_EXPORT', action: 'none' }), tabId);
  check('export via JATS route', res && res.ok && res.route === 'jats-europepmc', JSON.stringify(res && { ok: res.ok, route: res.route, error: res.error }));
  check('markdown has front matter and footnotes', res && /^---\ntitle:/.test(res.markdown) && res.markdown.includes('[^1]:'));

  // 不支持的页面：popup 直接给出原因，按钮不显示、不能被 Tab 聚焦（MF1 / JM-04）
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => { chrome.tabs.query = async () => [{ id: -1, url: 'https://www.sciencedirect.com/science/article/pii/S0032579120300001' }]; });
  await p2.goto(`chrome-extension://${extId}/popup.html`);
  await p2.waitForSelector('#empty:not([hidden])');
  check('popup explains planned site', (await p2.textContent('#empty')).includes('ScienceDirect'), await p2.textContent('#empty'));
  check('MF1: export/copy hidden on unsupported page', !(await p2.isVisible('#export')) && !(await p2.isVisible('#copy')));
  const focusIds = [];
  for (let i = 0; i < 6; i += 1) {
    await p2.keyboard.press('Tab');
    focusIds.push(await p2.evaluate(() => document.activeElement && document.activeElement.id));
  }
  check('MF1: hidden buttons take no Tab focus', !focusIds.includes('export') && !focusIds.includes('copy'), focusIds.join(','));

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
  check('MF2: welcome card hidden without ?welcome=1', !(await opt.isVisible('#welcome')));
  check('icon: options header logo (assets/icon.svg) loads', await opt.$eval('.head img', (img) => img.complete && img.naturalWidth > 0 && img.getAttribute('src') === 'assets/icon.svg'));
  await opt.click('input[name="language"][value="zh"]', { force: true });
  await opt.waitForFunction(() => document.querySelector('h1').textContent.includes('设置'));
  check('options switches to Chinese immediately', true);
  await opt.click('#includeImages', { force: true });
  await opt.waitForTimeout(300);
  const stored = await sw.evaluate(() => chrome.storage.sync.get('settings'));
  check('options instant-save', stored.settings && stored.settings.language === 'zh' && stored.settings.includeImages === false, JSON.stringify(stored));
  // 后面的检查用英文界面
  await sw.evaluate(() => chrome.storage.sync.get('settings').then(({ settings }) => chrome.storage.sync.set({ settings: { ...settings, includeImages: true } })));
  check('options has no native select', (await opt.locator('select').count()) === 0);
  for (const lang of ['zh', 'en']) {
    await opt.click(`input[name="language"][value="${lang}"]`, { force: true });
    await opt.waitForTimeout(300);
    await opt.setViewportSize({ width: 320, height: 800 });
    const h = await opt.locator('h1').boundingBox();
    check(`design: options title on one line at 320px (${lang})`, h && h.height <= 26, JSON.stringify(h));
    const noScroll = await opt.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    check(`R08: options has no horizontal scroll at 320px (${lang})`, noScroll);
  }
  await opt.setViewportSize({ width: 1280, height: 800 });
  check('options: PDF parsing off by default, PaddleOCR preselected', !(await opt.isChecked('#pdfEnabled')) && (await opt.isChecked('input[name="pdfProvider"][value="paddleocr"]')));

  // ---------- 1.0.0：设计 nit、悬浮按钮、出版商页面、ZIP、PDF 确认 ----------
  const deferredColor = await popup.$eval('.route[data-state="deferred"]', (el) => getComputedStyle(el).color);
  const mutedColor = await popup.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muted').trim());
  const toRgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  check('design: "JATS: checked on export" is muted', deferredColor === toRgb(mutedColor), `${deferredColor} vs ${mutedColor}`);
  const btnBoxes = await Promise.all(['#export', '#copy', '#zip'].map((id) => popup.locator(id).boundingBox()));
  check('popup: ZIP button shown; buttons share one height (R04)', btnBoxes.every((b) => b && Math.abs(b.height - btnBoxes[0].height) < 0.5), JSON.stringify(btnBoxes));

  // 页内悬浮按钮（PMC fixture 页）：键盘打开菜单、方向键、Esc 回到按钮
  const fabBtn = page.locator('journal-md-fab button.fab');
  check('FAB shown on an article page', await fabBtn.isVisible());
  check('FAB has an accessible name and menu semantics', /Markdown/.test(await fabBtn.getAttribute('aria-label')) && (await fabBtn.getAttribute('aria-haspopup')) === 'menu');
  const fabFocus = () => page.evaluate(() => {
    const a = document.querySelector('journal-md-fab').shadowRoot.activeElement;
    return a ? (a.dataset.action || a.className) : null;
  });
  await fabBtn.focus();
  await page.keyboard.press('Enter');
  check('FAB: Enter opens the menu on "Download .md"', (await fabFocus()) === 'download', await fabFocus());
  await page.keyboard.press('ArrowDown');
  check('FAB: ArrowDown moves to "Download ZIP"', (await fabFocus()) === 'zip', await fabFocus());
  await page.keyboard.press('Escape');
  check('FAB: Escape closes and returns focus to the button', (await fabFocus()) === 'fab' && (await fabBtn.getAttribute('aria-expanded')) === 'false', await fabFocus());
  const dlCount = async () => (await sw.evaluate(() => chrome.downloads.search({}))).filter((d) => d.state === 'complete').length;
  const before = await dlCount();
  await fabBtn.click();
  await page.locator('journal-md-fab [data-action="download"]').click();
  await page.waitForFunction(() => document.querySelector('journal-md-fab').shadowRoot.querySelector('.fab.ok, .fab.err'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  check('FAB: Download .md saves a file and shows the done state', (await dlCount()) === before + 1 && /\bok\b/.test(await fabBtn.getAttribute('class')), await fabBtn.getAttribute('class'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(4500); // ok 状态 4 秒后回到空闲
  check('FAB follows dark mode', (await fabBtn.evaluate((b) => getComputedStyle(b).backgroundColor)) === 'rgb(20, 184, 166)', await fabBtn.evaluate((b) => getComputedStyle(b).backgroundColor));
  await page.emulateMedia({ colorScheme: 'light' });

  // 出版商页面（Nature 真实页面 fixture）：按 DOI 查 Europe PMC（无结果）→ 页面 DOM
  const nat = await ctx.newPage();
  await nat.goto(NATURE_URL);
  await nat.waitForTimeout(800);
  const natTab = await sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, NATURE_URL);
  check('publisher page: no request on load', searchHits.length === 0, searchHits.join(', '));
  const nr = await sw.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'JMD_EXPORT', action: 'none' }), natTab);
  check('Nature export: DOI looked up once, page DOM used', nr && nr.ok && nr.route === 'dom-nature' && searchHits.length === 1 && /doi%3A%2210.1038%2Fs41586-021-03819-2/i.test(searchHits[0]), JSON.stringify(nr && { ok: nr.ok, route: nr.route, error: nr.error }));
  check('Nature export: figures and footnotes', nr && nr.markdown.includes('> **Fig. 1** **AlphaFold produces highly accurate structures**') && (nr.markdown.match(/^\[\^\d+\]: /gm) || []).length === 84);
  check('FAB shown on the publisher page', await nat.locator('journal-md-fab button.fab').isVisible());

  // eLife：弹窗「下载 ZIP」→ article.md + images/
  const eli = await ctx.newPage();
  await eli.goto(ELIFE_URL);
  await eli.waitForTimeout(800);
  const eliTab = await sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, ELIFE_URL);
  const openPopup = async (id, url) => {
    const pp = await ctx.newPage();
    pp.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`popup: ${m.text()}`); });
    await pp.addInitScript(({ tid, turl }) => {
      const orig = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = async (q) => (q && q.active ? [{ id: tid, url: turl }] : orig(q));
    }, { tid: id, turl: url });
    await pp.setViewportSize({ width: 360, height: 640 });
    await pp.goto(`chrome-extension://${extId}/popup.html`);
    await pp.waitForSelector('#info:not([hidden])', { timeout: 5000 });
    return pp;
  };
  const ep = await openPopup(eliTab, ELIFE_URL);
  check('eLife popup: platform', (await ep.textContent('#platform')) === 'eLife');
  await ep.click('#zip');
  await ep.waitForSelector('#status .ok, #status .err', { timeout: 15000 }).catch(() => {});
  await ep.waitForTimeout(500);
  const zipStatus = await ep.textContent('#status');
  check('ZIP: saved with all images packed', /\.zip/.test(zipStatus) && /images are in the ZIP|张图片都已打包/.test(zipStatus), zipStatus);
  const zipItem = (await sw.evaluate(() => chrome.downloads.search({}))).filter((d) => d.state === 'complete' && /application\/zip/.test(d.mime || d.url || '')).pop();
  const zfiles = zipItem ? unzip(fs.readFileSync(zipItem.filename)) : {};
  const zmd = zfiles['article.md'] ? zfiles['article.md'].toString('utf8') : '';
  check('ZIP contains article.md with local image links and the images', zmd.includes('](images/01-elife-09560-fig1-v1.jpg)') && !!zfiles['images/01-elife-09560-fig1-v1.jpg'] && !zmd.includes('iiif.elifesciences.org'), Object.keys(zfiles).slice(0, 4).join(','));

  // PDF 解析：打开（直接写 storage.local，不经过浏览器权限弹窗）后，非 OA 文章先确认；拒绝 / 缺权限时不访问后端
  await sw.evaluate(() => chrome.storage.local.set({ pdfSettings: { enabled: true, provider: 'paddleocr', tokens: { paddleocr: 'e2e-placeholder' } } }));
  const closed = await ctx.newPage();
  await closed.goto(NATURE_CLOSED_URL);
  await closed.waitForTimeout(500);
  const closedTab = await sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, NATURE_CLOSED_URL);
  const np = await openPopup(closedTab, NATURE_CLOSED_URL);
  await np.waitForSelector('#pdf-row:not([hidden])', { timeout: 3000 }).catch(() => {});
  check('PDF: button offered when enabled and the page has a PDF', (await np.textContent('#pdf')) === 'Parse PDF with PaddleOCR', await np.textContent('#pdf'));
  await np.click('#pdf');
  check('PDF: non-OA article asks first (PRD §2.11 wording)', (await np.isVisible('#pdf-confirm')) && (await np.textContent('#pdf-confirm-text')) === "This article is not open access. Uploading it to PaddleOCR may violate the publisher's terms. Continue?", await np.textContent('#pdf-confirm-text'));
  check('PDF: focus moves to the confirmation', await np.evaluate(() => document.activeElement && document.activeElement.id === 'pdf-continue'));
  await np.click('#pdf-cancel');
  check('PDF: cancel sends nothing', pdfBackendHits.length === 0 && /Nothing was uploaded/.test(await np.textContent('#pdf-status')));
  await np.click('#pdf');
  await np.click('#pdf-continue');
  await np.waitForSelector('#pdf-status[data-state="failed"]', { timeout: 5000 }).catch(() => {});
  check('PDF: confirmed but permission not granted → clear error, no request to the backend', /Permission for paddleocr\.aistudio-app\.com is missing/.test(await np.textContent('#pdf-status')) && pdfBackendHits.length === 0, await np.textContent('#pdf-status'));
  const op = await openPopup(eliTab, ELIFE_URL);
  await op.waitForSelector('#pdf-row:not([hidden])', { timeout: 3000 }).catch(() => {});
  await op.click('#pdf');
  await op.waitForSelector('#pdf-status[data-state="failed"]', { timeout: 5000 }).catch(() => {});
  check('PDF: open-access article (eLife) needs no confirmation', !(await op.isVisible('#pdf-confirm')) && pdfBackendHits.length === 0, await op.textContent('#pdf-status'));
  await sw.evaluate(() => chrome.storage.local.remove(['pdfSettings', 'pdfTask']));

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
