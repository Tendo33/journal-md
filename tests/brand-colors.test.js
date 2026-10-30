// Simon 决定：主按钮和悬浮按钮用图标 A 的青绿（#0f766e），深浅色都要满足 WCAG AA。
import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, '../src/ui/shared/tokens.css'), 'utf8');
const fab = fs.readFileSync(path.join(__dirname, '../src/content/fab.js'), 'utf8');

function lum(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const token = (block, name) => (block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i')) || [])[1];

describe('teal brand tokens', () => {
  const [light, dark] = css.split('@media (prefers-color-scheme: dark)');
  const [fabLight, fabDark] = fab.split('@media (prefers-color-scheme: dark)');

  test('light: #0f766e with white text, links and hover meet AA', () => {
    expect(token(light, 'brand')).toBe('#0f766e');
    expect(ratio(token(light, 'brand'), token(light, 'on-brand'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(light, 'brand-hover'), token(light, 'on-brand'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(light, 'brand'), token(light, 'bg'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(light, 'brand'), token(light, 'surface'))).toBeGreaterThanOrEqual(4.5);
  });

  test('dark: teal with dark text, links and hover meet AA', () => {
    expect(ratio(token(dark, 'brand'), token(dark, 'on-brand'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(dark, 'brand-hover'), token(dark, 'on-brand'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(dark, 'brand'), token(dark, 'bg'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(dark, 'brand'), token(dark, 'surface'))).toBeGreaterThanOrEqual(4.5);
  });

  test('floating button uses the same teal, AA for its glyph in both schemes', () => {
    expect(token(fabLight, 'brand')).toBe(token(light, 'brand'));
    expect(token(fabDark, 'brand')).toBe(token(dark, 'brand'));
    expect(ratio(token(fabLight, 'brand'), token(fabLight, 'brand-on'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(fabDark, 'brand'), token(fabDark, 'brand-on'))).toBeGreaterThanOrEqual(4.5);
    expect(css + fab).not.toMatch(/#1d4e89|#4c8fd6/i);
  });
});
