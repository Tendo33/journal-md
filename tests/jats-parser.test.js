import fs from 'fs';
import path from 'path';
import { parseJats } from '@core/parsers/jats';
import { pmcAssetUrl, rewriteAssetUrl } from '@core/assets';
import { renderMarkdown } from '@core/render/markdown';
import { inlinesToPlain } from '@core/article-ir';

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures/jats', name), 'utf8');
const EXPORTED = '2026-10-30T10:00+08:00';

describe('parseJats — full Europe PMC article', () => {
  const ir = parseJats(fixture('europepmc-full.xml'), { url: 'https://europepmc.org/article/PMC/PMC11000001' });
  const md = renderMarkdown(ir, { exported: EXPORTED });

  test('metadata', () => {
    expect(ir.sourceRoute).toBe('jats-europepmc');
    expect(ir.meta).toMatchObject({
      title: 'Genomic heritability of egg weight in Gallus gallus: a GBLUP study',
      journal: 'Genetics Selection Evolution',
      year: 2025,
      doi: '10.1186/s12711-025-00001-2',
      pmid: '40000001',
      pmcid: 'PMC11000001',
      license: 'CC-BY-4.0',
      keywords: ['GBLUP', 'Egg weight', 'Heritability'],
    });
    expect(ir.meta.authors.map((a) => a.name)).toEqual(['Wei Li', 'Jane A. Smith', 'Poultry Genomics Consortium']);
    expect(ir.meta.authors[1].affiliations).toEqual(['College of Animal Science, Example University, Beijing, China', 'Roslin Institute, Edinburgh, UK']);
  });

  test('structured abstract keeps headings and skips the graphical abstract', () => {
    expect(ir.abstract.map((s) => inlinesToPlain(s.title))).toEqual(['Background', 'Results', 'Conclusions']);
    expect(md).not.toContain('Graphical abstract');
    expect(md).toContain('heritability $h^2$ reported');
  });

  test('formulas: tex-math preferred, MathML converted, graphic fallback', () => {
    expect(md).toContain('$$\n\\mathbf{y}=\\mathbf{X}\\mathbf{b}+\\mathbf{Z}\\mathbf{u}+\\mathbf{e}\n$$');
    expect(md).toContain('$\\mathbf{u}\\sim N\\left( 0,\\mathbf{G}\\sigma_u^2 \\right)$');
    expect(md).toContain('$$\nh^2=\\frac{\\sigma_u^2}{\\sigma_u^2+\\sigma_e^2}\n$$');
    expect(md).toContain('![equation](https://pmc.ncbi.nlm.nih.gov/articles/instance/11000001/bin/12711_2025_1_Article_Equ3.jpg)');
    expect(ir.notices).toContain('equation_image');
  });

  test('citations and references', () => {
    expect(md).toContain('studied extensively [^1], [^2]–[^3].');
    expect(md).toContain('(Wang et al. 2020[^4])');
    expect(md).toContain('See also [^1][^2].');
    expect(ir.refs).toHaveLength(4);
    expect(ir.refs[0]).toMatchObject({ id: 'CR1', doi: '10.1016/j.psj.2019.12.001', pmid: '32000001' });
    expect(md).toContain('[^1]: Wang L, Zhang HM. Genomic selection in layers. Poult Sci. 2020;99(2):100-110. https://doi.org/10.1016/j.psj.2019.12.001');
    expect(md).toContain('[^2]: Smith J, Brown K. Pedigree BLUP revisited. *J Anim Sci*. 2018;96:1–9. https://doi.org/10.1093/jas/sky001');
    expect(md).toContain('[^3]: Falconer DS, Mackay TFC. Introduction to Quantitative Genetics. 4th ed. Harlow: Longman; 1996. https://pubmed.ncbi.nlm.nih.gov/11111111/');
  });

  test('text escaping keeps literal $ and %', () => {
    expect(md).toContain('Prices were up 5% and costs were \\$3 per hen; gene_name stays intact.');
  });

  test('sections, labels and lists', () => {
    expect(md).toContain('## 2 Methods\n\n### Statistical model');
    expect(md).toContain('- Line A: 1,200 hens\n- Line B: 800 hens');
    expect(md).toContain('1. Genotype\n2. Phenotype');
  });

  test('figures and tables', () => {
    expect(md).toContain('![Fig. 1 Manhattan plot for egg weight.](https://pmc.ncbi.nlm.nih.gov/articles/instance/11000001/bin/12711_2025_1_Fig1_HTML.jpg)');
    expect(md).toContain('> **Fig. 1** **Manhattan plot for egg weight.** The dashed line marks genome-wide significance.');
    expect(md).toContain('| Trait | σ<sub>u</sub><sup>2</sup> | h<sup>2</sup> (SE) |\n| --- | --- | --- |\n| EW | 4.12 | 0.45 (0.02) |');
    expect(md).toContain('> <sup>a</sup> Egg number until 72 weeks.');
    expect(md).toContain('<tr><th rowspan="2">Model</th><th colspan="2">Accuracy</th></tr>');
  });

  test('back matter goes into dedicated sections', () => {
    expect(md).toContain('## Acknowledgements\n\nWe thank the farm staff.');
    expect(md).toContain('## Data availability\n\nGenotypes are available at [Zenodo](https://zenodo.org/record/1).\n\nAll scripts are on GitHub.');
    expect(md).toContain('## Funding\n\nThis work was funded by NSFC (32000001).');
    expect(md).toContain('## Competing interests\n\nThe authors declare that they have no competing interests.');
    expect(md).toContain('## Author contributions');
    expect(md).toContain('- [Additional file 1](https://pmc.ncbi.nlm.nih.gov/articles/instance/11000001/bin/12711_2025_1_MOESM1_ESM.xlsx) — Genotype quality control summary.');
    // 数据可用性不能再留在正文里
    expect(md.indexOf('All scripts are on GitHub')).toBeGreaterThan(md.indexOf('## Data availability'));
  });
});

describe('parseJats — sparse article', () => {
  const ir = parseJats(fixture('europepmc-minimal.xml'));
  const md = renderMarkdown(ir, { exported: EXPORTED });

  test('pmc id without prefix, ali:license_ref, ppub year', () => {
    expect(ir.meta).toMatchObject({ pmcid: 'PMC7000002', doi: '', license: 'CC-BY-NC-4.0', year: 2021, journal: 'Animals (Basel)' });
    expect(md).not.toMatch(/^doi:/m);
  });

  test('loose body paragraphs, author-year cite with ext-link DOI', () => {
    expect(md).toContain('Plumage colour varies (Zhao and Li, 2019[^1]); see Figure 1.');
    expect(md).toContain('[^1]: Zhao M, Li Q (2019) Duck genetics. Poult Sci 98:1. [10.3382/ps/pey001](https://doi.org/10.3382/ps/pey001)');
  });

  test('floats-group figures are rendered, fn-group and body COI classified', () => {
    expect(md).toContain('## Figures and tables\n\n![Figure 1 Two plumage types.](https://pmc.ncbi.nlm.nih.gov/articles/instance/7000002/bin/animals-11-00002-g001.jpg)');
    expect(md).toContain('## Funding\n\nFunded by a provincial grant.');
    expect(md).toContain('## Competing interests\n\nNone declared.');
    expect(md).toContain('## Notes\n\nPublished as part of a special issue.');
  });
});

describe('parseJats errors and helpers', () => {
  test('malformed XML throws jats_parse', () => {
    expect(() => parseJats('<article><front>')).toThrow(expect.objectContaining({ code: 'jats_parse' }));
    expect(() => parseJats('<html><body>Not found</body></html>')).toThrow(expect.objectContaining({ code: 'jats_parse' }));
  });
  test('pmcAssetUrl uses the verified PMC instance pattern and adds .jpg only for extension-less images (QA JM-02)', () => {
    expect(pmcAssetUrl('PMC7095418', '41586_2020_2012_Fig1_HTML.jpg')).toBe('https://pmc.ncbi.nlm.nih.gov/articles/instance/7095418/bin/41586_2020_2012_Fig1_HTML.jpg');
    expect(pmcAssetUrl('PMC1', 'fig1', 'image')).toBe('https://pmc.ncbi.nlm.nih.gov/articles/instance/1/bin/fig1.jpg');
    expect(pmcAssetUrl('PMC1', 'fig1.gif', 'image')).toBe('https://pmc.ncbi.nlm.nih.gov/articles/instance/1/bin/fig1.gif');
    expect(pmcAssetUrl('PMC1', 'data.xlsx', 'file')).toBe('https://pmc.ncbi.nlm.nih.gov/articles/instance/1/bin/data.xlsx');
    expect(pmcAssetUrl('', 'x', 'image')).toBe('');
    expect(rewriteAssetUrl('https://europepmc.org/articles/PMC7095418/bin/f1.jpg')).toBe('https://pmc.ncbi.nlm.nih.gov/articles/instance/7095418/bin/f1.jpg');
    expect(rewriteAssetUrl('https://cdn.ncbi.nlm.nih.gov/pmc/blobs/a/1/b/f.jpg')).toBe('https://cdn.ncbi.nlm.nih.gov/pmc/blobs/a/1/b/f.jpg');
  });
});
