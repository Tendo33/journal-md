// 系列统一：tokens 来自 ui-v2.css（arxiv-md / zhihu-md 同源），journal-md 只换品牌色（#0f766e，Simon 决定）。
// 深浅色下品牌色的每一组搭配都要满足 WCAG AA（4.5:1）。
import fs from 'fs';
import path from 'path';

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const brandCss = read('src/ui/shared/tokens.css');
const uiV2 = read('src/ui/shared/ui-v2.css');
const fab = read('src/content/fab.js');

function lum(hex) {
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const token = (block, name) => (block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{3,6})\\b`, 'i')) || [])[1];

const lightBrand = brandCss.match(/\[data-brand=journal\]\{[^}]*\}/)[0];
const darkBrand = brandCss.match(/\[data-theme=dark\]\[data-brand=journal\]\{[^}]*\}/)[0];
const lightRoot = uiV2.match(/:root\{[\s\S]*?\n\}/)[0];
const darkRoot = uiV2.match(/\[data-theme=dark\]\{[\s\S]*?\}/)[0];

describe('teal brand on the shared ui-v2 tokens', () => {
  test('ui-v2.css is the series file (copied from arxiv-md bdf0175)', () => {
    expect(uiV2).toContain('ui-v2.css — Round 3 C-1 共用骨架');
    expect(uiV2).toContain('arxiv-md bdf0175');
  });

  test('light: brand #0f766e, white text, links on page background, brand text on soft fill', () => {
    expect(token(lightBrand, 'brand')).toBe('#0f766e');
    for (const t of ['brand', 'brand-hover', 'brand-press']) expect(ratio(token(lightBrand, t), token(lightBrand, 'brand-on'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(lightBrand, 'brand-text'), token(lightRoot, 'bg'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(lightBrand, 'brand-text'), token(lightRoot, 'surface'))).toBeGreaterThanOrEqual(4.5);
  });

  test('only the five --brand* variables and the neutral focus colour are overridden (series audit §4.1)', () => {
    for (const block of [lightBrand, darkBrand]) {
      const names = [...block.matchAll(/--([a-z-]+):/g)].map((m) => m[1]).sort();
      expect(names).toEqual(['brand', 'brand-hover', 'brand-on', 'brand-press', 'brand-text', 'focus']);
    }
    expect(token(lightBrand, 'focus')).toBe('#0969da');
    expect(token(darkBrand, 'focus')).toBe('#79c0ff');
    expect(ratio('#0969da', token(lightRoot, 'bg'))).toBeGreaterThanOrEqual(3);
    expect(ratio('#79c0ff', token(darkRoot, 'bg'))).toBeGreaterThanOrEqual(3);
  });

  test('dark: teal with dark text, links on dark page and surface', () => {
    for (const t of ['brand', 'brand-hover', 'brand-press']) expect(ratio(token(darkBrand, t), token(darkBrand, 'brand-on'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(darkBrand, 'brand-text'), token(darkRoot, 'bg'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(darkBrand, 'brand-text'), token(darkRoot, 'surface'))).toBeGreaterThanOrEqual(4.5);
    // 媒体查询里的深色品牌和 data-theme=dark 一致
    expect(brandCss).toMatch(/prefers-color-scheme:dark[\s\S]*--brand:#14b8a6/);
  });

  test('floating button uses the same brand values and keeps AA for its glyph', () => {
    const [fabLight, fabDark] = fab.split('@media (prefers-color-scheme: dark)');
    expect(token(fabLight, 'brand')).toBe(token(lightBrand, 'brand'));
    expect(token(fabDark, 'brand')).toBe(token(darkBrand, 'brand'));
    expect(ratio(token(fabLight, 'brand'), token(fabLight, 'brand-on'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(fabDark, 'brand'), token(fabDark, 'brand-on'))).toBeGreaterThanOrEqual(4.5);
    expect(token(fabLight, 'focus')).toBe('#0969da');
    expect(token(fabDark, 'focus')).toBe('#79c0ff');
    expect(brandCss + fab).not.toMatch(/#1d4e89|#4c8fd6/i);
  });
});
