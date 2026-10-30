#!/usr/bin/env node
/* global document, getComputedStyle, window */
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
    if (/paddleocr\.aistudio-app\.com|bcebos\.com|mineru\.net|openxlab\.org\.cn/.test(url)) {
      pdfBackendHits.push(url);
      // 模拟的后端（从不访问真实 PaddleOCR / MinerU）：一律回 401，任务以「Token 无效」结束
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 401, msg: 'e2e mock: unauthorized' }) });
    }
    if (hit) return route.fulfill({ status: 200, contentType: hit.type, body: hit.body });
    if (url.startsWith('https://www.ebi.ac.uk/europepmc/webservices/rest/search?')) {
      searchHits.push(url);
      return route.fulfill({ status: 200, contentType: 'application/json', body: NO_HITS });
    }
    if (url.startsWith('https://iiif.elifesciences.org/') && ['fetch', 'xhr'].includes(route.request().resourceType())) {
      return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: PNG });
    }
    // media.springernature.com 现在是安装时授予的主机权限，后台本可以取到；这里让它以网络错误失败，
    // 验证「图片取不到时照样出 ZIP、保留原网址、给出提示」这条路（e2e 不访问真实 CDN）
    if (url.startsWith('https://media.springernature.com/') && ['fetch', 'xhr'].includes(route.request().resourceType())) {
      return route.abort('failed');
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
  check('icon: popup header logo (assets/icon.svg) loads', await popup.$eval('.hd .logo img', (img) => img.complete && img.naturalWidth > 0 && img.getAttribute('src') === 'assets/icon.svg'));
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
  // 不用 force：点开关本身（ui-v2 结构里轨道 span 不能挡住 input）
  await opt.locator('#includeImages').locator('xpath=..').click();
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
  const keyLink = await opt.locator('#pdfKeyLink').boundingBox();
  check('fix2b-2: #pdfKeyLink target is at least 24×24 (WCAG 2.5.8)', !!keyLink && keyLink.height >= 24 && keyLink.width >= 24, JSON.stringify(keyLink));
  check('options: PaddleOCR preselected; no PDF enable switch or permission step', (await opt.isChecked('input[name="pdfProvider"][value="paddleocr"]')) && (await opt.locator('#pdfEnabled').count()) === 0);

  // ---------- 1.0.0：设计 nit、悬浮按钮、出版商页面、ZIP、PDF 确认 ----------
  const deferredColor = await popup.$eval('.route[data-state="deferred"]', (el) => getComputedStyle(el).color);
  const mutedColor = await popup.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim());
  const toRgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  check('design: "JATS: checked on export" is muted', deferredColor === toRgb(mutedColor), `${deferredColor} vs ${mutedColor}`);
  const btnBoxes = await Promise.all(['#export', '#copy', '#zip'].map((id) => popup.locator(id).boundingBox()));
  // 系列 ui-v2：主按钮独占一行、40 高；同一行的复制 / ZIP 必须同高同顶（R04 只比较同一行）
  check('popup: ZIP button shown; same-row buttons share one height (R04)', btnBoxes.every(Boolean) && Math.abs(btnBoxes[1].height - btnBoxes[2].height) < 0.5 && Math.abs(btnBoxes[1].y - btnBoxes[2].y) < 0.5 && btnBoxes[0].y < btnBoxes[1].y, JSON.stringify(btnBoxes));
  // 系列一致性审计 §4.3 验收清单（ui-v2 迁移）
  const geo = await popup.evaluate(() => {
    const r = (sel) => document.querySelector(sel).getBoundingClientRect();
    const cs = (sel, p) => getComputedStyle(document.querySelector(sel))[p];
    return { hd: r('.hd').height, ft: r('.ft').height, w: document.documentElement.clientWidth, card: cs('.card', 'borderTopLeftRadius'),
      bodyBg: cs('body', 'backgroundColor'), cardBg: cs('.card', 'backgroundColor'), cardImg: cs('.card', 'backgroundImage'), font: cs('#export', 'fontFamily'),
      focus: getComputedStyle(document.documentElement).getPropertyValue('--focus').trim() };
  });
  check('series ui: popup 360 wide, 48px header, 36px footer, 12px cards', geo.w === 360 && Math.round(geo.hd) === 48 && Math.round(geo.ft) === 36 && geo.card === '12px', JSON.stringify(geo));
  check('series ui: page grey, cards white (surface hierarchy)', geo.bodyBg === 'rgb(244, 245, 247)' && (geo.cardBg === 'rgb(255, 255, 255)' || /gradient/.test(geo.cardImg)), JSON.stringify(geo));
  check('series ui: neutral focus colour #0969da, buttons use the system font', geo.focus === '#0969da' && /system-ui/.test(geo.font), JSON.stringify(geo));
  check('series ui: primary button is the full-width 40px row (ui-v2 .acts)', Math.abs(btnBoxes[0].height - 40) < 0.5 && btnBoxes[0].width > btnBoxes[1].width * 1.8, JSON.stringify(btnBoxes[0]));

  // 页内悬浮按钮（PMC fixture 页）：键盘打开菜单、方向键、Esc 回到按钮
  const fabBtn = page.locator('journal-md-fab button.fab');
  check('FAB shown on an article page', await fabBtn.isVisible());
  // fix2b-1：悬浮按钮的语言跟设置走（浏览器是英文时设成中文），并且切换后原地生效
  const prevSettings = (await sw.evaluate(() => chrome.storage.sync.get('settings'))).settings || {};
  await sw.evaluate((st) => chrome.storage.sync.set({ settings: { ...st, language: 'zh' } }), prevSettings);
  await page.waitForTimeout(600);
  const fabItems = () => page.evaluate(() => [...document.querySelector('journal-md-fab').shadowRoot.querySelectorAll('.item')].map((i) => i.textContent).join('|'));
  check('fix2b-1: FAB menu follows the settings language (zh)', (await fabItems()) === '下载 .md|下载 ZIP（含图片）|复制 Markdown|隐藏此按钮' && (await fabBtn.getAttribute('aria-label')) === '导出为 Markdown（菜单）', await fabItems());
  await sw.evaluate((st) => chrome.storage.sync.set({ settings: { ...st, language: 'en' } }), prevSettings);
  await page.waitForTimeout(600);
  check('fix2b-1: switching the setting updates the FAB live (en)', (await fabItems()) === 'Download .md|Download ZIP (with images)|Copy Markdown|Hide this button', await fabItems());
  await sw.evaluate((st) => chrome.storage.sync.set({ settings: st }), prevSettings);
  await page.waitForTimeout(300);
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
  // 复审 N6：后台标签页里 CSS 过渡会停住，计算样式还是旧值；先把文章页切到前台再看颜色和投影
  await page.bringToFront();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(4500); // ok 状态 4 秒后回到空闲
  check('FAB follows dark mode', (await fabBtn.evaluate((b) => getComputedStyle(b).backgroundColor)) === 'rgb(20, 184, 166)', await fabBtn.evaluate((b) => getComputedStyle(b).backgroundColor));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.bringToFront();
  await page.waitForTimeout(400); // box-shadow 有 .2s 过渡
  const fabGeo = await fabBtn.evaluate((b) => { const c = getComputedStyle(b); const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, right: document.documentElement.clientWidth - r.right, shadow: c.boxShadow, font: c.fontFamily }; });
  check('series ui: FAB 44px at right 24, zhihu ball shadow, system font', fabGeo.w === 44 && fabGeo.h === 44 && Math.round(fabGeo.right) === 24 && /rgba\(0, 0, 0, 0\.12\) 0px 4px 12px/.test(fabGeo.shadow) && /system-ui/.test(fabGeo.font), JSON.stringify(fabGeo));

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
      // fix2c：使用时不应申请任何权限。万一有调用就记下来（并按「拒绝」返回），检查里要求一次都没有
      window.__permCalls = [];
      chrome.permissions.request = (q) => { window.__permCalls.push(q); return Promise.resolve(false); };
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
  check('fix2c: eLife ZIP — nothing called permissions.request', (await ep.evaluate(() => window.__permCalls.length)) === 0);
  check('ZIP contains article.md with local image links and the images', zmd.includes('](images/01-elife-09560-fig1-v1.jpg)') && !!zfiles['images/01-elife-09560-fig1-v1.jpg'] && !zmd.includes('iiif.elifesciences.org'), Object.keys(zfiles).slice(0, 4).join(','));

  // Nature 的图在 media.springernature.com（Simon 10-30 18:06 起安装时授予，点「下载 ZIP」时不申请）；
  // 上面的路由让这些图片取不到：照样出 ZIP、保留原网址、给出提示
  const zp = await openPopup(natTab, NATURE_URL);
  const zipBefore = (await sw.evaluate(() => chrome.downloads.search({}))).filter((d) => /application\/zip/.test(d.mime || d.url || '')).length;
  await zp.click('#zip');
  await zp.waitForSelector('#status .ok, #status .err', { timeout: 15000 }).catch(() => {});
  await zp.waitForTimeout(500);
  const permCalls = await zp.evaluate(() => window.__permCalls);
  check('fix2c: Nature ZIP — nothing called permissions.request', permCalls.length === 0, JSON.stringify(permCalls));
  const zpStatus = await zp.textContent('#status');
  const zipAfter = (await sw.evaluate(() => chrome.downloads.search({}))).filter((d) => d.state === 'complete' && /application\/zip/.test(d.mime || d.url || ''));
  check('ZIP images unavailable: ZIP still saved, notice names the host, no permission wording', zipAfter.length === zipBefore + 1 && /\.zip/.test(zpStatus) && /could not be downloaded from media\.springernature\.com|downloading from media\.springernature\.com failed|没能从 media\.springernature\.com 下载|从 media\.springernature\.com 下载失败/.test(zpStatus) && !/permission|授权/.test(zpStatus), zpStatus);
  // downloads.search 不按时间排序：取最新开始的那一个
  const newestZip = zipAfter.slice().sort((x, y) => String(x.startTime).localeCompare(String(y.startTime))).pop();
  const nmd = newestZip ? (unzip(fs.readFileSync(newestZip.filename))['article.md'] || '').toString('utf8') : '';
  check('ZIP images unavailable: they keep their remote links in article.md', /\]\(https:\/\/media\.springernature\.com\//.test(nmd) && !/\]\(images\//.test(nmd));

  // PDF 解析（Simon 10-30 18:06）：没有启用开关、没有确认、不申请权限——给所选后端填了 Token 就有按钮，点了直接发（发给上面模拟的后端）
  await sw.evaluate(() => chrome.storage.local.set({ pdfSettings: { provider: 'paddleocr', tokens: { paddleocr: 'e2e-placeholder' } } }));
  const closed = await ctx.newPage();
  await closed.goto(NATURE_CLOSED_URL);
  await closed.waitForTimeout(500);
  const closedTab = await sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, NATURE_CLOSED_URL);
  const np = await openPopup(closedTab, NATURE_CLOSED_URL);
  await np.waitForSelector('#pdf-row:not([hidden])', { timeout: 3000 }).catch(() => {});
  check('PDF: button offered once the selected backend has a token', (await np.textContent('#pdf')) === 'Parse PDF with PaddleOCR', await np.textContent('#pdf'));
  check('PDF: no confirmation UI exists any more', (await np.locator('#pdf-confirm, #pdf-continue, #pdf-cancel').count()) === 0);
  // 第二道保险：ctx.route 不一定拦得到 service worker 的请求，这里在后台里直接替换 fetch，PDF 后端一律回同样的 401，
  // 保证无论如何都不会访问真实的 PaddleOCR / MinerU（vendored http.js 每次调用时才读 globalThis.fetch）
  await sw.evaluate(() => {
    const orig = self.fetch.bind(self);
    self.__jmdPdfHits = [];
    self.__jmdOrigFetch = orig;
    self.fetch = (input, init) => {
      const u = String((input && input.url) || input);
      if (/paddleocr\.aistudio-app\.com|bcebos\.com|mineru\.net|openxlab\.org\.cn/.test(u)) {
        self.__jmdPdfHits.push(u);
        return Promise.resolve(new Response(JSON.stringify({ code: 401, msg: 'e2e mock: unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
      }
      return orig(input, init);
    };
  });
  await np.click('#pdf');
  await np.waitForSelector('#pdf-status[data-state="failed"], #pdf-status[data-state="done"]', { timeout: 15000 }).catch(() => {});
  const swPdfHits = await sw.evaluate(() => { self.fetch = self.__jmdOrigFetch; return self.__jmdPdfHits; });
  const allPdfHits = [...swPdfHits, ...pdfBackendHits];
  check('PDF: non-OA article is sent straight away to the (mocked) backend', allPdfHits.length >= 1 && /paddleocr\.aistudio-app\.com/.test(allPdfHits[0]), JSON.stringify(allPdfHits.slice(0, 2)));
  check('PDF: backend refusal is shown clearly', /PaddleOCR rejected the token/.test(await np.textContent('#pdf-status')), await np.textContent('#pdf-status'));
  check('fix2c: nothing called permissions.request in the popup', (await np.evaluate(() => window.__permCalls.length)) === 0);
  const npNoToken = await (async () => {
    await sw.evaluate(() => chrome.storage.local.set({ pdfSettings: { provider: 'paddleocr', tokens: {} } }));
    return openPopup(closedTab, NATURE_CLOSED_URL);
  })();
  await npNoToken.waitForTimeout(500);
  check('PDF: no token → no PDF button', !(await npNoToken.isVisible('#pdf')));
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
