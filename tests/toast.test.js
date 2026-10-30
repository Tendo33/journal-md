import { showToast } from '@/content/toast';

test('toast builds its DOM without innerHTML and announces via role=status', () => {
  const spy = jest.spyOn(Element.prototype, 'innerHTML', 'set');
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(); return 1; });
  showToast('<img src=x onerror=alert(1)> Saved', 'success', { closeLabel: 'Close' });
  const root = document.getElementById('journal-md-toast-host').shadowRoot;
  expect(spy).not.toHaveBeenCalled();
  expect(root.querySelector('[role="status"]').getAttribute('aria-live')).toBe('polite');
  expect(root.querySelector('.msg').textContent).toBe('<img src=x onerror=alert(1)> Saved');
  expect(root.querySelector('img')).toBeNull();
  expect(root.querySelector('button').getAttribute('aria-label')).toBe('Close');
});

describe('series ui-v2 (zhihu ball tooltip style)', () => {
  const { showToast } = require('@/content/toast');
  beforeEach(() => { document.body.innerHTML = ''; global.requestAnimationFrame = (f) => f(); });

  test('beside the floating button: left of it, centred on it; failures are alerts', () => {
    showToast('Saved', 'success', { beside: 116 });
    const box = document.getElementById('journal-md-toast-host').shadowRoot.querySelector('.toast');
    expect(box.hasAttribute('data-beside')).toBe(true);
    expect(box.style.getPropertyValue('--fab-bottom')).toBe('116px');
    expect(box.getAttribute('role')).toBe('status');
    showToast('Failed', 'error', {});
    expect(box.hasAttribute('data-beside')).toBe(false);
    expect(box.getAttribute('role')).toBe('alert');
  });

  test('geometry and colours follow the zhihu tooltip and the neutral focus colour', () => {
    showToast('x', 'info');
    const css = document.getElementById('journal-md-toast-host').shadowRoot.querySelector('style').textContent;
    expect(css).toContain('font: 500 12px/18px');
    expect(css).toContain('border-radius: 6px');
    expect(css).toContain('box-shadow: 0 4px 12px rgba(0, 0, 0, .06)');
    expect(css).toContain('right: 84px');
    expect(css).toContain('--focus: #0969da');
    expect(css).toContain('--focus: #79c0ff');
  });
});

describe('fix2b-1: toast language follows the settings language', () => {
  const { showToast: show } = require('@/content/toast');
  beforeEach(() => { document.body.innerHTML = ''; global.requestAnimationFrame = (f) => f(); });

  test('the working toast has a Chinese close label when the setting is zh (no English default)', () => {
    show('正在转换…', 'working', { lang: 'zh' });
    const btn = document.getElementById('journal-md-toast-host').shadowRoot.querySelector('button');
    expect(btn.getAttribute('aria-label')).toBe('关闭');
    show('Done', 'success', { lang: 'en' });
    expect(btn.getAttribute('aria-label')).toBe('Close');
  });
});
