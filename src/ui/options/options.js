// 设置页：改动即时保存（无保存按钮），保存后在页脚播报「已保存」。
import { loadSettings, saveSettings } from '../../config/settings';
import { applyI18n, resolveLanguage, t } from '../../config/i18n';
import { SITES, SITE_STATUS } from '../../core/sites/registry';
import { buildFilename } from '../../core/filename';
import { loadPdfSettings, savePdfSettings } from '../../pdf/settings';
import { createPdfRegistry } from '../../pdf/providers';
import { pdfErrorText, providerLabel } from '../shared/pdf-text';
import { MSG } from '../../utils/messages';

const $ = (id) => document.getElementById(id);
const SAMPLE_META = {
  title: 'Genomic prediction of egg weight in laying hens',
  year: 2025,
  journal: 'Genetics Selection Evolution',
  authors: [{ name: 'Wei Li' }],
  doi: '10.1186/s12711-025-00001-2',
  pmid: '40000001',
  pmcid: 'PMC11000001',
};

let settings;
let pdfSettings;
let lang = 'en';
const pdfRegistry = createPdfRegistry();
let savedTimer = null;

function announceSaved() {
  const el = $('saved');
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = t(lang, 'optSaved'); });
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { el.textContent = ''; }, 2500);
}

async function update(patch) {
  settings = await saveSettings(patch);
  announceSaved();
}

function renderPreview() {
  $('filename-preview').textContent = t(lang, 'optFilenamePreview', { name: buildFilename(SAMPLE_META, $('filename').value) });
}

function renderSites() {
  const ul = $('sites');
  ul.textContent = '';
  // 还不支持的站点不占开关行，在列表下面合成一行说明（设置页只放能改的东西）
  const planned = [];
  for (const site of SITES) {
    if (site.status !== SITE_STATUS.SUPPORTED) { planned.push(site.name); continue; }
    const li = document.createElement('li');
    const id = `site-${site.id}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = site.name;
    li.append(label);
    const sw = document.createElement('input');
    sw.type = 'checkbox';
    sw.id = id;
    sw.setAttribute('role', 'switch');
    sw.checked = settings.sites[site.id] !== false;
    sw.addEventListener('change', () => update({ sites: { [site.id]: sw.checked } }));
    // ui-v2 开关结构：<span class="switch"><input><span></span></span>
    const wrap = document.createElement('span');
    wrap.className = 'switch';
    const track = document.createElement('span');
    track.setAttribute('aria-hidden', 'true');
    wrap.append(sw, track);
    li.append(wrap);
    ul.append(li);
  }
  $('sites-planned').textContent = planned.length ? t(lang, 'optSitesPlanned', { sites: planned.join(lang === 'zh' ? '、' : ', ') }) : '';
}

// ---- PDF 解析 ----
function pdfStatus(text, state = '') {
  const el = $('pdf-status');
  el.dataset.state = state;
  el.textContent = '';
  if (text) requestAnimationFrame(() => { el.textContent = text; });
}

function renderPdf() {
  const id = pdfSettings.provider;
  const provider = pdfRegistry.get(id);
  document.querySelectorAll('input[name="pdfProvider"]').forEach((r) => { r.checked = r.value === id; });
  $('pdf-provider-note').textContent = t(lang, `optPdfNote_${id}`);
  $('pdfToken-label').textContent = t(lang, 'optPdfToken', { provider: providerLabel(id) });
  $('pdfToken').value = pdfSettings.tokens[id] || '';
  $('pdfKeyLink').href = provider.keyUrl;
}

// 换后端只是保存选择：两个后端的域名都在安装时授予，不再申请权限（Simon 2026-10-30 18:06）
async function onPdfProvider(e) {
  const id = e.target.value;
  pdfSettings = await savePdfSettings({ provider: id });
  renderPdf();
  pdfStatus('');
  announceSaved();
}

async function onPdfTest() {
  const id = pdfSettings.provider;
  const token = $('pdfToken').value.trim();
  if (!token) { pdfStatus(t(lang, 'optPdfNeedToken'), 'err'); return; }
  pdfStatus(t(lang, 'optPdfTesting'));
  let r;
  try {
    r = await chrome.runtime.sendMessage({ type: MSG.PDF_TEST, provider: id, token });
  } catch (_) {
    r = { ok: false, errorCode: 'NETWORK' };
  }
  if (r && r.ok) pdfStatus(t(lang, 'optPdfTestOk'), 'ok');
  else pdfStatus(pdfErrorText(lang, { ...(r || {}), provider: id }), 'err');
}

function render() {
  lang = resolveLanguage(settings.language);
  applyI18n(document, lang);
  renderPdf();
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  renderPreview();
  renderSites();
}

async function main() {
  settings = await loadSettings();
  pdfSettings = await loadPdfSettings();
  $('welcome').hidden = new URLSearchParams(location.search).get('welcome') !== '1';
  $('filename').value = settings.filenameTemplate;
  $('includeImages').checked = settings.includeImages;
  $('preferJats').checked = settings.preferJats;
  $('findOpenVersions').checked = settings.findOpenVersions;
  $('showFab').checked = settings.showFab;
  document.querySelectorAll('input[name="language"]').forEach((r) => { r.checked = r.value === settings.language; });
  render();

  let typing = null;
  $('filename').addEventListener('input', () => {
    renderPreview();
    clearTimeout(typing);
    typing = setTimeout(() => update({ filenameTemplate: $('filename').value }), 400);
  });
  $('includeImages').addEventListener('change', (e) => update({ includeImages: e.target.checked }));
  $('preferJats').addEventListener('change', (e) => update({ preferJats: e.target.checked }));
  $('findOpenVersions').addEventListener('change', (e) => update({ findOpenVersions: e.target.checked }));
  $('showFab').addEventListener('change', (e) => update({ showFab: e.target.checked }));
  document.querySelectorAll('input[name="pdfProvider"]').forEach((r) => r.addEventListener('change', onPdfProvider));
  let tokenTimer = null;
  $('pdfToken').addEventListener('input', () => {
    clearTimeout(tokenTimer);
    const id = pdfSettings.provider;
    tokenTimer = setTimeout(async () => {
      pdfSettings = await savePdfSettings({ tokens: { [id]: $('pdfToken').value } });
      announceSaved();
    }, 400);
  });
  $('pdfTest').addEventListener('click', onPdfTest);
  // 页面上点了「隐藏此按钮」时，设置页同步开关状态
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings && changes.settings.newValue) $('showFab').checked = changes.settings.newValue.showFab !== false;
  });
  document.querySelectorAll('input[name="language"]').forEach((r) => r.addEventListener('change', async () => {
    await update({ language: r.value });
    render();
  }));
}

main();
