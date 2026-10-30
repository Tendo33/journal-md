import { mountFab, fabMounted } from '@/content/fab';

const labels = { button: 'Export as Markdown (menu)', menu: 'Journal to Markdown', download: 'Download .md', zip: 'Download ZIP (with images)', copy: 'Copy Markdown', hide: 'Hide this button', run: 'Converting', ok: 'Done', err: 'Failed' };
const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true }));
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('in-page floating button', () => {
  let fab;
  let onAction;
  let onHide;
  beforeEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '<p>article</p>';
    onAction = jest.fn(async () => ({ ok: true }));
    onHide = jest.fn();
    fab = mountFab(document, { labels, onAction, onHide });
  });
  afterEach(() => fab.remove());

  test('one button with menu semantics, mounted once', () => {
    expect(fabMounted(document)).toBe(true);
    expect(mountFab(document, { labels, onAction, onHide })).toBe(fab);
    expect(document.querySelectorAll('journal-md-fab')).toHaveLength(1);
    const b = fab.button;
    expect(b.tagName).toBe('BUTTON');
    expect(b.getAttribute('aria-label')).toBe('Export as Markdown (menu)');
    expect(b.getAttribute('aria-haspopup')).toBe('menu');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(fab.menu.getAttribute('role')).toBe('menu');
    expect(Array.from(fab.menu.querySelectorAll('[role=menuitem]')).map((i) => i.textContent)).toEqual(['Download .md', 'Download ZIP (with images)', 'Copy Markdown', 'Hide this button']);
    // 菜单项不在 Tab 顺序里（菜单内用方向键）
    expect(Array.from(fab.menu.querySelectorAll('[role=menuitem]')).every((i) => i.tabIndex === -1)).toBe(true);
  });

  test('keyboard: ArrowDown opens on the first item, arrows wrap, Escape returns focus', () => {
    const root = fab.host.shadowRoot;
    key(fab.button, 'ArrowDown');
    expect(fab.menu.hidden).toBe(false);
    expect(fab.button.getAttribute('aria-expanded')).toBe('true');
    expect(root.activeElement.textContent).toBe('Download .md');
    key(root.activeElement, 'ArrowUp');
    expect(root.activeElement.textContent).toBe('Hide this button');
    key(root.activeElement, 'ArrowDown');
    expect(root.activeElement.textContent).toBe('Download .md');
    key(root.activeElement, 'End');
    expect(root.activeElement.textContent).toBe('Hide this button');
    key(root.activeElement, 'Escape');
    expect(fab.menu.hidden).toBe(true);
    expect(root.activeElement).toBe(fab.button);
  });

  test('choosing an item runs it; busy → done states update aria-label / aria-busy', async () => {
    let finish;
    onAction.mockImplementation(() => new Promise((r) => { finish = r; }));
    fab.button.click();
    fab.menu.querySelector('[data-action="zip"]').click();
    expect(onAction).toHaveBeenCalledWith('zip');
    expect(fab.menu.hidden).toBe(true);
    expect(fab.getState()).toBe('run');
    expect(fab.button.getAttribute('aria-busy')).toBe('true');
    // 运行中再点不会打开菜单，也不会重复导出
    fab.button.click();
    expect(fab.menu.hidden).toBe(true);
    finish({ ok: true });
    await flush();
    expect(fab.getState()).toBe('ok');
    expect(fab.button.hasAttribute('aria-busy')).toBe(false);
    expect(fab.button.getAttribute('aria-label')).toBe('Done');
  });

  test('failure state and hide', async () => {
    onAction.mockResolvedValue({ ok: false });
    await fab.run('copy');
    expect(fab.getState()).toBe('err');
    expect(fab.button.getAttribute('aria-label')).toBe('Failed');
    await fab.run('hide');
    expect(onHide).toHaveBeenCalled();
  });

  test('clicking outside closes the menu', () => {
    fab.button.click();
    expect(fab.menu.hidden).toBe(false);
    document.body.querySelector('p').dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(fab.menu.hidden).toBe(true);
  });

  test('styles: dark mode, focus ring token, reduced motion', () => {
    const css = fab.host.shadowRoot.querySelector('style').textContent;
    expect(css).toContain('prefers-color-scheme: dark');
    expect(css).toContain('.fab:focus-visible { outline: 2px solid var(--focus)');
    expect(css).toContain('prefers-reduced-motion: reduce');
  });
});

describe('QA JM-M2-07: cookie banners do not cover the button', () => {
  const { clearBottom } = require('@/content/fab');
  const win = (pos) => ({ innerWidth: 1280, innerHeight: 800, getComputedStyle: () => ({ position: pos }) });
  const host = { contains: () => false };

  test('a fixed banner at the bottom lifts the button above it (16px gap)', () => {
    const banner = { getBoundingClientRect: () => ({ top: 700 }) };
    const doc = { elementsFromPoint: () => [banner, {}] };
    expect(clearBottom(doc, host, win('fixed'))).toBe(116);
  });

  test('nothing fixed on top, a full-screen overlay, or no API → stays at 24px', () => {
    expect(clearBottom({ elementsFromPoint: () => [host] }, host, win('fixed'))).toBe(24);
    expect(clearBottom({ elementsFromPoint: () => [{ getBoundingClientRect: () => ({ top: 700 }) }] }, host, win('static'))).toBe(24);
    expect(clearBottom({ elementsFromPoint: () => [{ getBoundingClientRect: () => ({ top: 0 }) }] }, host, win('fixed'))).toBe(24);
    expect(clearBottom({}, host, win('fixed'))).toBe(24);
  });

  test('the button sits on the top layer', () => {
    const fab = mountFab(document, { labels, onAction: async () => ({ ok: true }), onHide: () => {} });
    expect(fab.host.parentNode).toBe(document.documentElement);
    expect(fab.host.shadowRoot.querySelector('style').textContent).toContain('z-index: 2147483647');
    fab.remove();
  });
});

test('QA JM-M2-07: a modal cookie <dialog> (top layer) does not move the button', () => {
  const { clearBottom } = require('@/content/fab');
  const dialog = { tagName: 'DIALOG', open: true, matches: () => true, getBoundingClientRect: () => ({ top: 400 }) };
  expect(clearBottom({ elementsFromPoint: () => [dialog] }, { contains: () => false }, { innerWidth: 1280, innerHeight: 800, getComputedStyle: () => ({ position: 'fixed' }) })).toBe(24);
});

test('series ui-v2: ball geometry and shadow as zhihu-md, menu per audit §4.2', () => {
  const { mountFab: mount } = require('@/content/fab');
  const f = mount(document, { labels, onAction: async () => ({ ok: true }), onHide: () => {} });
  const css = f.host.shadowRoot.querySelector('style').textContent;
  expect(css).toContain('width: 44px; height: 44px; border-radius: 50%');
  expect(css).toContain('--ball-shadow: 0 4px 12px rgba(0, 0, 0, .12)');
  expect(css).toContain('--ball-shadow-hover: 0 12px 32px rgba(0, 0, 0, .2), 0 4px 12px rgba(0, 0, 0, .1)');
  expect(css).toMatch(/\.menu \{[^}]*border-radius: 8px/);
  expect(css).toMatch(/\.item \{[^}]*min-height: 32px; padding: 6px 12px; border-radius: 6px/);
  f.remove();
});

describe('fix2b-1: floating button language follows the settings language', () => {
  const { mountFab: mount, fabLabels } = require('@/content/fab');

  test('labels come from the chosen language, not the page or browser', () => {
    expect(fabLabels('zh')).toMatchObject({ button: '导出为 Markdown（菜单）', download: '下载 .md', zip: '下载 ZIP（含图片）', copy: '复制 Markdown', hide: '隐藏此按钮', menu: '期刊全文转 Markdown' });
    expect(fabLabels('en')).toMatchObject({ button: 'Export as Markdown (menu)', download: 'Download .md', hide: 'Hide this button' });
  });

  test('setLabels switches the language in place (menu open, state kept)', () => {
    document.documentElement.lang = 'en';
    const f = mount(document, { labels: fabLabels('en'), onAction: async () => ({ ok: true }), onHide: () => {} });
    f.button.click();
    f.setLabels(fabLabels('zh'));
    expect(f.menu.hidden).toBe(false);
    expect(f.menu.getAttribute('aria-label')).toBe('期刊全文转 Markdown');
    expect(Array.from(f.menu.querySelectorAll('[role=menuitem]')).map((i) => i.textContent)).toEqual(['下载 .md', '下载 ZIP（含图片）', '复制 Markdown', '隐藏此按钮']);
    expect(f.button.getAttribute('aria-label')).toBe('导出为 Markdown（菜单）');
    f.setState('err', 'x');
    f.setLabels(fabLabels('en'));
    expect(f.getState()).toBe('err');
    expect(f.button.getAttribute('aria-label')).toBe('Failed: x');
    f.remove();
  });
});
