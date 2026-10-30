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
