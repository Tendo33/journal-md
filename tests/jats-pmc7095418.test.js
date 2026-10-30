// 真实 fixture：Europe PMC fullTextXML PMC7095418（Zhou et al., Nature 2020，CC BY 许可，2026-10-30 取回）。
import fs from 'fs';
import path from 'path';
import { parseJats } from '@core/parsers/jats';
import { renderMarkdown } from '@core/render/markdown';

const xml = fs.readFileSync(path.join(__dirname, 'fixtures/jats/europepmc-PMC7095418.xml'), 'utf8');
const md = renderMarkdown(parseJats(xml, { pmcid: 'PMC7095418' }), { now: new Date(0) });

describe('QA JM-09 (PMC7095418)', () => {
  test('no dangling "is available for this paper" sentence; DOI becomes a link', () => {
    expect(md).not.toMatch(/^is available for this paper/m);
    expect(md).toContain('## Extended data\n\nExtended data is available for this paper at <https://doi.org/10.1038/s41586-020-2012-7>.');
    expect(md).toContain('Supplementary information is available for this paper at <https://doi.org/10.1038/s41586-020-2012-7>.');
  });

  test('MOESM1 is listed once', () => {
    expect(md.match(/^- .*MOESM1_ESM\.pdf/gm)).toHaveLength(1);
  });

  test('16 references stay one footnote each', () => {
    expect(md.match(/^\[\^\d+\]: /gm)).toHaveLength(16);
  });
});
