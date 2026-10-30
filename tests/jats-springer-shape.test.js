import fs from 'fs';
import path from 'path';
import { parseJats } from '@core/parsers/jats';
import { renderMarkdown } from '@core/render/markdown';

const xml = fs.readFileSync(path.join(__dirname, 'fixtures/jats/springer-nature-shape.xml'), 'utf8');
const ir = parseJats(xml);
const md = renderMarkdown(ir, { exported: '2026-10-30T10:00+08:00' });
const count = (s) => md.split(s).length - 1;

describe('Springer Nature-shaped JATS (QA JM-03/05/06)', () => {
  test('JM-03: references inside a back <sec> become separate footnotes and in-text cites link up', () => {
    expect(ir.refs.map((r) => r.id)).toEqual(['CR1', 'CR2', 'CR3']);
    expect(md).toContain('Earlier outbreaks were described[^1],[^2].');
    expect(md).toContain('Samples were sequenced[^3].');
    expect(md).toContain('[^1]: Zhu N, et al. A novel coronavirus from patients with pneumonia in China, 2019. N. Engl. J. Med. 2020;382:727-733. https://doi.org/10.1056/NEJMoa2001017');
    expect(count('## References')).toBe(1);
  });

  test('JM-05: surname and given names are separated in mixed-citations', () => {
    expect(md).toContain('[^2]: Roche D. G., Kruuk L. E. B.. Public data archiving in ecology. PLoS Biol. 2015.');
    expect(md).toContain('[^3]: Esfahani K, Roudaia L. A review of cancer immunotherapy. Curr. Oncol. 2020;27:87.');
  });

  test('JM-06: boxes in floats-group are kept (referenced one after its paragraph, the other at the end)', () => {
    expect(md).toContain('> **Box 1. Terms and abbreviations**\n>\n> - FAIR: findable, accessible, interoperable, reusable');
    expect(md.indexOf('Box 1. Terms')).toBeGreaterThan(md.indexOf('Key terms are listed in Box 1.'));
    expect(md).toContain('## Box 2');
    expect(md).toContain('F1. (meta)data are assigned a globally unique identifier.');
  });

  test('JM-06: nested Data availability moves to the back once; no empty or duplicate supplementary sections', () => {
    expect(count('Data availability')).toBe(1);
    expect(count('Sequences are deposited in GISAID.')).toBe(1);
    expect(md).not.toContain('## Supplementary information');
    expect(count('- [41586_2020_0003_MOESM1_ESM.pdf]')).toBe(1);
    expect(ir.supp).toHaveLength(1);
  });

  test('JM-06: a <label> inside a paragraph is kept, so the sentence is not truncated', () => {
    expect(md).toContain('Extended data is available for this paper at');
  });
});
