/**
 * @jest-environment node
 */
// PDF 文字层快速解析的版面算法。输入是构造的文字片段（不用真实 PDF），覆盖单栏、双栏、页眉页脚、标题、断词、图注、参考文献。
import { segmentsOfPage, orderSegments, layoutPdfText, bodySize } from '@/pdf/text-layout';
import { extractPages } from '@/pdf/text-extract';

const W = 600;
const H = 800;
// 一行文字：按字符数估算宽度（每字 0.5 个字号）
const item = (str, x, y, size = 10, bold = false) => ({ str, x, y, w: str.length * size * 0.5, size, bold });
const page = (items) => ({ width: W, height: H, items });

describe('segments and reading order', () => {
  test('items on one line join; a wide gap across the middle splits two columns even when narrow', () => {
    const segs = segmentsOfPage(page([item('Left column', 50, 500), item('text', 110, 500), item('Right column', 315, 500)]));
    expect(segs.map((s) => s.text)).toEqual(['Left column text', 'Right column']);
  });

  test('two-column page: left column top to bottom, then right column; full-width lines split the bands', () => {
    const items = [item('Full width title line that spans both columns of the page', 50, 760, 10)];
    for (let i = 0; i < 6; i++) {
      items.push(item(`L${i} left text`, 50, 700 - i * 12));
      items.push(item(`R${i} right text`, 320, 700 - i * 12));
    }
    const { segs, twoCol } = orderSegments(segmentsOfPage(page(items)), W);
    expect(twoCol).toBe(true);
    expect(segs.map((s) => s.text.slice(0, 2))).toEqual(['Fu', 'L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'R0', 'R1', 'R2', 'R3', 'R4', 'R5']);
  });

  test('single-column page stays top to bottom', () => {
    const items = [0, 1, 2, 3].map((i) => item(`Line ${i} of a single wide column that crosses the middle`, 50, 700 - i * 12));
    const { twoCol, segs } = orderSegments(segmentsOfPage(page(items)), W);
    expect(twoCol).toBe(false);
    expect(segs.map((s) => s.text.slice(0, 6))).toEqual(['Line 0', 'Line 1', 'Line 2', 'Line 3']);
  });

  test('body size is the most common size by characters', () => {
    expect(bodySize([{ size: 10, chars: 500 }, { size: 14, chars: 30 }, { size: 8, chars: 100 }])).toBe(10);
  });
});

describe('layoutPdfText', () => {
  // 三页单栏：每页有页眉、页码；第一页有大字号标题、作者、Abstract
  const pages = [
    page([
      item('Widget Journal 2024', 50, 780, 8), item('1', 300, 20, 8),
      item('Folding Widgets Quickly', 50, 700, 18),
      item('Ada Example, Ben Sample', 50, 670, 11),
      item('Abstract', 50, 640, 10, true),
      item('We fold widgets and count creases in a simple', 50, 625),
      item('way that anyone can repeat.', 50, 613),
      item('1. Introduction', 50, 580, 12, true),
      item('Widgets are common. Their creases are not well under-', 50, 560),
      item('stood, so we count them.', 50, 548),
      item('A second paragraph starts after a gap.', 50, 520),
    ]),
    page([
      item('Widget Journal 2024', 50, 780, 8), item('2', 300, 20, 8),
      item('1.1. Crease Counting', 50, 700, 10.8),
      item('We counted twelve widgets.', 50, 680),
      item('Figure 1. Two folding modes.', 50, 640, 9),
      item('References', 50, 600, 12, true),
      item('[1] A. Example. Widgets in the wild. Widget J,', 50, 580, 9),
      item('3:12-20, 2019.', 62, 569, 9),
      item('[2] B. Sample. Creases. Crease Lett, 2020.', 50, 556, 9),
    ]),
    page([
      item('Widget Journal 2024', 50, 780, 8), item('3', 300, 20, 8),
      item('Rotated or not, this page has one line.', 50, 700),
    ]),
  ];

  const r = layoutPdfText(pages);
  const md = r.markdown;

  test('title and author lines are dropped (the page citation has them); running headers and page numbers too', () => {
    expect(md).not.toContain('Folding Widgets Quickly');
    expect(md).not.toContain('Ada Example, Ben Sample');
    expect(md).not.toContain('Widget Journal 2024');
    expect(md).not.toMatch(/^\d$/m);
  });

  test('headings: known names and numbered sections, levels from the numbering', () => {
    expect(md).toContain('## Abstract\n\nWe fold widgets and count creases in a simple way that anyone can repeat.');
    expect(md).toContain('## 1. Introduction');
    expect(md).toContain('### 1.1. Crease Counting');
    expect(r.headings).toBe(4);
  });

  test('hyphenated line breaks are joined; a vertical gap starts a new paragraph', () => {
    expect(md).toContain('Their creases are not well understood, so we count them.\n\nA second paragraph starts after a gap.');
  });

  test('figure captions get a bold label; references become a list with hanging lines joined', () => {
    expect(md).toContain('> **Figure 1** Two folding modes.');
    expect(md).toContain('## References\n\n- A. Example. Widgets in the wild. Widget J, 3:12-20, 2019.\n- B. Sample. Creases. Crease Lett, 2020.');
    expect(r.refs).toBe(2);
  });

  test('stats', () => {
    expect(r).toMatchObject({ pages: 3, twoColumn: false });
    expect(r.chars).toBeGreaterThan(200);
  });
});

describe('extractPages (pdf.js wrapper)', () => {
  test('reads positions, sizes and bold fonts; skips rotated text', async () => {
    const fonts = { f1: { name: 'NimbusRomNo9L-Regu' }, f2: { name: 'NimbusRomNo9L-Medi' } };
    const pdf = {
      numPages: 1,
      getPage: async () => ({
        getViewport: () => ({ width: 612, height: 792 }),
        getTextContent: async () => ({ items: [
          { str: '3.1. Residual Learning', transform: [11, 0, 0, 11, 50, 600], width: 120, fontName: 'f2' },
          { str: 'Body text', transform: [10, 0, 0, 10, 50, 580], width: 45, fontName: 'f1' },
          { str: 'arXiv:0000.00000v1', transform: [0, 20, -20, 0, 10, 300], width: 200, fontName: 'f1' },
        ] }),
        getOperatorList: async () => ({}),
        commonObjs: { get: (n) => fonts[n] },
        cleanup: () => {},
      }),
    };
    const [p] = await extractPages(pdf);
    expect(p).toMatchObject({ width: 612, height: 792 });
    expect(p.items).toEqual([
      { str: '3.1. Residual Learning', x: 50, y: 600, w: 120, size: 11, bold: true },
      { str: 'Body text', x: 50, y: 580, w: 45, size: 10, bold: false },
    ]);
  });
});
