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
