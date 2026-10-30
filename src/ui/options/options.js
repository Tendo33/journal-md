// 设置页：改动即时保存（无保存按钮），保存后在页脚播报「已保存」。
import { loadSettings, saveSettings } from '../../config/settings';
import { applyI18n, resolveLanguage, t } from '../../config/i18n';
import { SITES, SITE_STATUS } from '../../core/sites/registry';
import { buildFilename } from '../../core/filename';

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
let lang = 'en';
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
  for (const site of SITES) {
    const li = document.createElement('li');
    const id = `site-${site.id}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = site.name;
    li.append(label);
    if (site.status === SITE_STATUS.SUPPORTED) {
      const sw = document.createElement('input');
      sw.type = 'checkbox';
      sw.id = id;
      sw.className = 'switch';
      sw.setAttribute('role', 'switch');
      sw.checked = settings.sites[site.id] !== false;
      sw.addEventListener('change', () => update({ sites: { [site.id]: sw.checked } }));
      li.append(sw);
    } else {
      const span = document.createElement('span');
      span.className = 'planned';
      span.id = id;
      span.textContent = t(lang, 'optSitePlanned');
      li.append(span);
    }
    ul.append(li);
  }
}

function render() {
  lang = resolveLanguage(settings.language);
  applyI18n(document, lang);
  $('version').textContent = t(lang, 'optVersion', { version: chrome.runtime.getManifest().version });
  renderPreview();
  renderSites();
}

async function main() {
  settings = await loadSettings();
  $('welcome').hidden = new URLSearchParams(location.search).get('welcome') !== '1';
  $('filename').value = settings.filenameTemplate;
  $('includeImages').checked = settings.includeImages;
  $('preferJats').checked = settings.preferJats;
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
  document.querySelectorAll('input[name="language"]').forEach((r) => r.addEventListener('change', async () => {
    await update({ language: r.value });
    render();
  }));
}

main();
