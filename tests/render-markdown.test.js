import { createArticle, text, paragraph } from '@core/article-ir';
import { renderMarkdown, ABSTRACT_ONLY_MARKER } from '@core/render/markdown';
import { escapeMarkdown } from '@core/render/inline';

const EXPORTED = '2026-10-28T21:40+08:00';

function sampleIr() {
  return createArticle({
    sourceRoute: 'jats-europepmc',
    meta: {
      title: 'Heritability of egg weight: a GBLUP study',
      authors: [{ name: 'Li, Wei' }, { name: 'Smith J' }],
      journal: 'Genetics Selection Evolution',
      year: 2025,
      doi: '10.1186/s12711-025-00001-2',
      pmid: '40000001',
      pmcid: 'PMC11000001',
      license: 'CC-BY-4.0',
      url: 'https://europepmc.org/article/PMC/PMC11000001',
      keywords: ['GBLUP', 'egg weight'],
    },
    abstract: [
      { title: [text('Background')], blocks: [paragraph([text('Egg weight matters.')])], children: [] },
      { title: [text('Results')], blocks: [paragraph([text('We estimated '), { t: 'math', tex: 'h^2 = 0.45' }, text('.')])], children: [] },
    ],
    sections: [{
      title: [text('Methods')],
      blocks: [
        paragraph([text('As shown previously '), { t: 'cite', rid: 'B2', c: [text('2')] }, text(' and by Wang et al. '), { t: 'cite', rid: 'B1', c: [text('(Wang et al., 2020)')] }, text('.')]),
        { type: 'math', tex: '\\documentclass{minimal}\\begin{document}$$y = X\\beta + Zu + e$$\\end{document}' },
        { type: 'mathImage', src: 'https://europepmc.org/articles/PMC11000001/bin/eq2.jpg' },
        { type: 'figure', id: 'F1' },
        { type: 'table', id: 'T1' },
        { type: 'list', ordered: false, items: [[paragraph([text('first')])], [paragraph([text('second '), { t: 'em', c: [text('item')] }])]] },
      ],
      children: [{ title: [text('Statistical model')], blocks: [{ type: 'table', id: 'T2' }], children: [] }],
    }],
    figures: [{ id: 'F1', label: 'Figure 1.', caption: [paragraph([text('Manhattan plot. Peaks on GGA4.')])], src: 'https://europepmc.org/articles/PMC11000001/bin/f1.jpg' }],
    tables: [
      {
        id: 'T1', label: 'Table 1', caption: [paragraph([text('Variance components')])],
        rows: [
          { cells: [{ header: true, inlines: [text('Trait')] }, { header: true, inlines: [text('h2 | SE')] }] },
          { cells: [{ header: false, inlines: [text('EW')] }, { header: false, inlines: [{ t: 'math', tex: '0.45 \\pm 0.02' }] }] },
        ],
        foot: [paragraph([text('SE: standard error.')])],
      },
      {
        id: 'T2', label: 'Table 2', caption: [],
        rows: [
          { cells: [{ header: true, colspan: 2, inlines: [text('Model <A>')] }] },
          { cells: [{ header: false, inlines: [text('a')] }, { header: false, inlines: [{ t: 'cite', rid: 'B1', c: [text('1')] }] }] },
        ],
        foot: [],
      },
      { id: 'T3', label: 'Table 3', caption: [paragraph([text('Unplaced table')])], rows: [], foot: [], src: 'https://x.org/t3.jpg' },
    ],
    refs: [
      { id: 'B1', text: [text('Wang L, et al. Genomic selection in chickens. Poult Sci. 2020;99:1-10.')], doi: '10.1016/j.psj.2020.01.001' },
      { id: 'B2', text: [text('Smith J. A note. J Anim Sci. 2019.')], pmid: '30000000' },
      { id: 'B3', text: [text('Uncited ref.')], doi: '', url: 'https://example.org/r3' },
    ],
    supp: [{ id: 'S1', label: 'Additional file 1', caption: [paragraph([text('Genotype data.')])], href: 'https://europepmc.org/articles/PMC11000001/bin/s1.xlsx' }],
    back: {
      acknowledgements: [paragraph([text('We thank the farm.')])],
      dataAvailability: [paragraph([text('Data are on Zenodo.')])],
      funding: [paragraph([text('NSFC 123.')])],
      competingInterests: [paragraph([text('None.')])],
      other: [{ title: [text('Author contributions')], blocks: [paragraph([text('LW wrote it.')])], children: [] }],
    },
  });
}

describe('renderMarkdown', () => {
  const md = renderMarkdown(sampleIr(), { exported: EXPORTED });

  test('front matter follows PRD §2.3 field order', () => {
    const fm = md.split('---')[1];
    expect(fm.trim().split('\n')).toEqual([
      'title: "Heritability of egg weight: a GBLUP study"',
      'authors: ["Li, Wei", Smith J]',
      'journal: Genetics Selection Evolution',
      'year: 2025',
      'doi: "10.1186/s12711-025-00001-2"',
      'pmid: "40000001"',
      'pmcid: PMC11000001',
      'license: CC-BY-4.0',
      'url: "https://europepmc.org/article/PMC/PMC11000001"',
      'source_route: jats-europepmc',
      `exported: ${EXPORTED}`,
      'tags: [paper]',
    ]);
  });

  test('title, structured abstract and keywords', () => {
    expect(md).toContain('# Heritability of egg weight: a GBLUP study');
    expect(md).toContain('## Abstract\n\n### Background\n\nEgg weight matters.\n\n### Results\n\nWe estimated $h^2 = 0.45$.');
    expect(md).toContain('**Keywords:** GBLUP; egg weight');
  });

  test('formulas: inline $, display $$ with TeX shell stripped, image fallback noted', () => {
    expect(md).toContain('$$\ny = X\\beta + Zu + e\n$$');
    expect(md).toContain('![equation](https://europepmc.org/articles/PMC11000001/bin/eq2.jpg)\n\n*Equation shown as image (no TeX source available).*');
  });

  test('citations become footnotes; author-year text is kept', () => {
    expect(md).toContain('As shown previously [^2] and by Wang et al. (Wang et al., 2020)[^1].');
    expect(md).toContain('[^1]: Wang L, et al. Genomic selection in chickens. Poult Sci. 2020;99:1-10. https://doi.org/10.1016/j.psj.2020.01.001');
    expect(md).toContain('[^2]: Smith J. A note. J Anim Sci. 2019. https://pubmed.ncbi.nlm.nih.gov/30000000/');
    expect(md).toContain('[^3]: Uncited ref. <https://example.org/r3>');
  });

  test('figure: image plus caption blockquote', () => {
    expect(md).toContain('![Figure 1. Manhattan plot.](https://europepmc.org/articles/PMC11000001/bin/f1.jpg)\n\n> **Figure 1.** Manhattan plot. Peaks on GGA4.');
  });

  test('simple table → GFM with escaped pipe; footnote below', () => {
    expect(md).toContain('**Table 1** Variance components\n\n| Trait | h2 \\| SE |\n| --- | --- |\n| EW | $0.45 \\pm 0.02$ |\n\n> SE: standard error.');
  });

  test('merged cells → raw HTML table', () => {
    expect(md).toContain('### Statistical model\n\n**Table 2**\n\n<table>\n<tr><th colspan="2">Model &lt;A&gt;</th></tr>\n<tr><td>a</td><td>[1]</td></tr>\n</table>');
  });

  test('unplaced floats, back matter, supplementary in order', () => {
    const order = ['## Figures and tables', '![Table 3 Unplaced table](https://x.org/t3.jpg)', '## Acknowledgements', '## Data availability', '## Funding',
      '## Competing interests', '## Author contributions', '## Supplementary material', '## References'];
    const idx = order.map((s) => md.indexOf(s));
    idx.forEach((i) => expect(i).toBeGreaterThan(-1));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(md).toContain('- [Additional file 1](https://europepmc.org/articles/PMC11000001/bin/s1.xlsx) — Genotype data.');
  });

  test('lists render with markers', () => {
    expect(md).toContain('- first\n- second *item*');
  });

  test('includeImages=false keeps captions only', () => {
    const noImg = renderMarkdown(sampleIr(), { exported: EXPORTED, includeImages: false });
    expect(noImg).not.toContain('![Figure 1.');
    expect(noImg).toContain('> **Figure 1.** Manhattan plot.');
    expect(noImg).toContain('*(Figure image omitted.)*');
  });

  test('abstract-only marker at the top with a full-text link', () => {
    const ir = createArticle({
      sourceRoute: 'dom-pubmed',
      meta: { title: 'Only abstract', abstractOnly: true, fullTextUrl: 'https://doi.org/10.1/x', mesh: ['Animals', 'Chickens / genetics*'] },
      abstract: [{ title: null, blocks: [paragraph([text('Short.')])], children: [] }],
    });
    const out = renderMarkdown(ir, { exported: EXPORTED });
    const body = out.split('---\n')[2].trim();
    expect(body.startsWith(`> **${ABSTRACT_ONLY_MARKER}** — Full text: <https://doi.org/10.1/x>`)).toBe(true);
    expect(out).toContain('abstract_only: true');
    expect(out).toContain('**MeSH terms:** Animals; Chickens / genetics\\*');
  });

  test('references without in-text citations become an ordered list', () => {
    const ir = createArticle({ meta: { title: 'T' }, refs: [{ id: 'r1', text: [text('Ref one')], doi: '10.1/a' }] });
    expect(renderMarkdown(ir, { exported: EXPORTED })).toContain('## References\n\n1. Ref one. https://doi.org/10.1/a');
  });
});

describe('escapeMarkdown', () => {
  test('escapes markdown syntax but keeps intraword underscores', () => {
    expect(escapeMarkdown('a*b [c] $5 snake_case _x_ <div>')).toBe('a\\*b \\[c\\] \\$5 snake_case \\_x\\_ \\<div>');
  });
});
