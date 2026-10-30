import { loadSettings } from '../../config/settings';
import { applyI18n, resolveLanguage, t } from '../../config/i18n';
import { MSG, ACTIONS } from '../../utils/messages';
import { describeResult, errorText } from '../shared/result-text';
import { quickCheck, emptyText, routeItems, shortcutText } from './popup-view';

const $ = (id) => document.getElementById(id);
let lang = 'en';
let tab = null;
let busy = false;

function show(id, visible) {
  $(id).hidden = !visible;
}

function setEmpty(text) {
  show('loading', false);
  show('info', false);
  show('actions', false);
  const el = $('empty');
  el.textContent = text;
  el.hidden = false;
}

/** 状态区：先清空、下一帧再写，同一句话也会被读屏重新播报（R15） */
function setStatus(lines) {
  const el = $('status');
  el.textContent = '';
  requestAnimationFrame(() => {
    for (const { text, cls, href } of lines) {
      if (!text) continue;
      const p = document.createElement('p');
      p.className = cls;
      p.textContent = text;
      if (href) {
        p.append(' ');
        const a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = t(lang, 'noticeFullTextLink');
        p.append(a);
      }
      el.append(p);
    }
  });
}

function renderRoutes(routes, jatsState) {
  const dd = $('routes');
  dd.textContent = '';
  for (const item of routeItems(lang, routes, jatsState)) {
    const span = document.createElement('span');
    span.className = 'route';
    span.dataset.state = item.state;
    span.textContent = item.text;
    span.title = item.desc;
    span.setAttribute('aria-label', item.desc);
    dd.append(span);
  }
}

function setRow(id, value) {
  $(id).textContent = value || '';
  show(`row-${id}`, !!value);
}

async function sendToTab(message) {
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (_) {
    // 安装前已打开的标签页没有 content script：注入一次再试
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

async function inspect(settings) {
  const quick = quickCheck(tab && tab.url, settings);
  if (!quick.ok) return setEmpty(emptyText(lang, quick));
  let info;
  try {
    info = await sendToTab({ type: MSG.INSPECT });
  } catch (_) {
    return setEmpty(errorText(lang, 'content_unreachable'));
  }
  if (!info || !info.ok) return setEmpty(errorText(lang, (info && info.error) || 'no_content', info || {}));
  show('loading', false);
  show('info', true);
  show('actions', true);
  $('ctx-title').textContent = info.title;
  $('ctx-title').title = info.title;
  $('platform').textContent = info.siteName;
  setRow('doi', info.ids.doi);
  setRow('pmcid', info.ids.pmcid);
  setRow('pmid', info.ids.pmid);
  renderRoutes(info.routes, info.routes.jats ? 'checking' : 'off');
  if (info.routes.jats) {
    // 探测结果会被后台缓存，随后的导出直接复用
    chrome.runtime.sendMessage({ type: MSG.PROBE_JATS, pmcid: info.ids.pmcid })
      .then((r) => renderRoutes(info.routes, r && r.ok ? 'yes' : 'no'), () => renderRoutes(info.routes, 'no'));
  }
}

async function run(action) {
  if (busy) return;
  busy = true;
  const buttons = [$('export'), $('copy')];
  buttons.forEach((b) => b.setAttribute('aria-disabled', 'true'));
  $('actions').setAttribute('aria-busy', 'true');
  setStatus([{ text: t(lang, 'statusWorking'), cls: 'note' }]);
  let result;
  try {
    result = await sendToTab({ type: MSG.EXPORT, action: action === ACTIONS.COPY ? ACTIONS.NONE : ACTIONS.DOWNLOAD });
    if (result && result.ok && action === ACTIONS.COPY) {
      // popup 有焦点和用户手势，在这里写剪贴板最稳
      await navigator.clipboard.writeText(result.markdown);
      result = { ...result, copied: true };
    }
  } catch (e) {
    result = { ok: false, error: action === ACTIONS.COPY && result && result.ok ? 'clipboard_failed' : 'content_unreachable' };
  }
  const text = describeResult(result, lang, action);
  const lines = [{ text: text.status, cls: result && result.ok ? 'ok' : 'err' }];
  if (result && result.ok) {
    lines.push({ text: text.route, cls: 'note' });
    for (const n of text.notes) lines.push({ text: n, cls: 'note' });
    const abs = (result.notices || []).find((n) => n.code === 'abstract_only');
    if (abs && abs.fullTextUrl) lines[lines.length - 1].href = abs.fullTextUrl;
  }
  setStatus(lines);
  buttons.forEach((b) => b.removeAttribute('aria-disabled'));
  $('actions').removeAttribute('aria-busy');
  busy = false;
}

async function main() {
  const settings = await loadSettings();
  lang = resolveLanguage(settings.language);
  applyI18n(document, lang);
  $('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('export').addEventListener('click', () => run(ACTIONS.DOWNLOAD));
  $('copy').addEventListener('click', () => run(ACTIONS.COPY));
  chrome.commands.getAll().then((cmds) => { $('shortcuts').textContent = shortcutText(lang, cmds); }, () => {});
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await inspect(settings);
}

main();
