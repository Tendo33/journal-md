// 真实 fixture：Europe PMC fullTextXML（2026-10-30 取回），PLOS Comput Biol 两篇（QA JM-M2-04 / M2-05）。
import fs from 'fs';
import path from 'path';
import { parseJats, floatGraphic } from '@core/parsers/jats';
import { parseJatsXml } from '@core/parsers/jats';
import { renderMarkdown } from '@core/render/markdown';

const read = (f) => fs.readFileSync(path.join(__dirname, 'fixtures/jats', f), 'utf8');

describe('QA JM-M2-04: figure images are the figure graphic, not a formula graphic from the caption (PMC12258584)', () => {
  const ir = parseJats(read('europepmc-PMC12258584.xml'), { pmcid: 'PMC12258584' });
  const md = renderMarkdown(ir, { now: new Date(0) });

  test('every figure points at its own gNNN image', () => {
    expect(ir.figures.length).toBeGreaterThanOrEqual(4);
    for (const f of ir.figures) expect(f.src).toMatch(/pcbi\.1012733\.g\d{3}\.jpg$/);
    const fig2 = ir.figures.find((f) => /^Fig 2\b/.test(f.label));
    expect(fig2.src).toBe('https://pmc.ncbi.nlm.nih.gov/articles/instance/12258584/bin/pcbi.1012733.g002.jpg');
    expect(md).not.toMatch(/!\[Fig \d[^\]]*\]\([^)]*\.e\d{3}\.jpg\)/);
  });

  test('floatGraphic skips graphics inside the caption', () => {
    const fig = parseJatsXml('<article><fig id="f"><label>Fig 2</label><caption><p>x <inline-formula><alternatives><graphic xlink:href="e1.jpg" xmlns:xlink="http://www.w3.org/1999/xlink"/></alternatives></inline-formula></p></caption><graphic xlink:href="g2.jpg" xmlns:xlink="http://www.w3.org/1999/xlink"/></fig></article>').getElementsByTagName('fig')[0];
    expect(floatGraphic(fig).getAttribute('xlink:href')).toBe('g2.jpg');
  });
});

describe('QA JM-M2-05: PLOS 1008248 has no figures — 0 images is correct (PMC7665633)', () => {
  const ir = parseJats(read('europepmc-PMC7665633-norefs.xml'), { pmcid: 'PMC7665633' });
  const md = renderMarkdown(ir, { now: new Date(0) });
  test('three real tables, no figures, formulas as TeX', () => {
    expect(ir.figures).toHaveLength(0);
    expect(ir.tables).toHaveLength(3);
    expect(ir.tables.every((t) => t.rows.length > 0 && !t.src)).toBe(true);
    expect((md.match(/^\$\$$/gm) || []).length).toBeGreaterThan(10);
    expect(md).not.toContain('![');
  });
});
