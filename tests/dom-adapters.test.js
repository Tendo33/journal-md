import fs from 'fs';
import path from 'path';
import { extractPmc } from '@core/adapters/pmc';
import { extractEuropePmc } from '@core/adapters/europepmc';
import { extractPubmed } from '@core/adapters/pubmed';
import { parseJats } from '@core/parsers/jats';
import { renderMarkdown } from '@core/render/markdown';
import { inlinesToPlain } from '@core/article-ir';

const EXPORTED = '2026-10-30T10:00+08:00';
const loadHtml = (name) => new DOMParser().parseFromString(fs.readFileSync(path.join(__dirname, 'fixtures/html', name), 'utf8'), 'text/html');

describe('PMC DOM adapter (dom-pmc)', () => {
  const url = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11000001/';
  const ir = extractPmc(loadHtml('pmc-article.html'), url, { pmcid: 'PMC11000001' });
  const md = renderMarkdown(ir, { exported: EXPORTED });

  test('metadata from citation_* tags and page', () => {
    expect(ir.sourceRoute).toBe('dom-pmc');
    expect(ir.meta).toMatchObject({
      title: 'Genomic heritability of egg weight in Gallus gallus: a GBLUP study',
      journal: 'Genetics Selection Evolution', year: 2025, doi: '10.1186/s12711-025-00001-2',
      pmid: '40000001', pmcid: 'PMC11000001', license: 'CC-BY-4.0', url,
      keywords: ['GBLUP', 'Egg weight', 'Heritability'],
    });
    expect(ir.meta.authors.map((a) => a.name)).toEqual(['Wei Li', 'Jane A. Smith']);
  });

  test('abstract headings, body sections and no page chrome', () => {
    expect(ir.abstract.map((s) => inlinesToPlain(s.title))).toEqual(['Background', 'Results', 'Conclusions']);
    expect(ir.sections.map((s) => inlinesToPlain(s.title))).toEqual(['Introduction', 'Methods', 'Results']);
    for (const noise of ['PMC home', 'Open in a new tab', 'Author information', 'Associated Data', 'Follow NCBI', 'Copyright and License']) {
      expect(md).not.toContain(noise);
    }
  });

  test('citations, formulas, figures and tables', () => {
    expect(md).toContain('Egg weight has been studied extensively [^1], [^2]. Earlier work used pedigree BLUP [^3].');
    expect(md).toContain('heritability $h^2$ reported');
    expect(md).toContain('$$\nh^2=\\frac{\\sigma_u^2}{\\sigma_u^2+\\sigma_e^2}\n$$');
    expect(md).toContain('![equation](https://cdn.ncbi.nlm.nih.gov/pmc/blobs/a1b2/11000001/eq2.gif)');
    expect(md).toContain('![Fig. 1 Manhattan plot for egg weight.](https://cdn.ncbi.nlm.nih.gov/pmc/blobs/a1b2/11000001/12711_2025_1_Fig1_HTML.jpg)');
    expect(md).toContain('| Trait | h<sup>2</sup> (SE) |\n| --- | --- |\n| EW | 0.45 (0.02) |');
    expect(md).toContain('> <sup>a</sup>Egg number until 72 weeks.');
    expect(md).toContain('<tr><th rowspan="2">Model</th><th colspan="2">Accuracy</th></tr>');
  });

  test('back matter, supplementary and references', () => {
    expect(md).toContain('## Data availability\n\nGenotypes are available at [Zenodo](https://zenodo.org/record/1).');
    expect(md).toContain('## Funding\n\nThis work was funded by NSFC (32000001).');
    expect(md).toContain('## Competing interests');
    expect(md).toContain('- [Additional file 1](https://pmc.ncbi.nlm.nih.gov/articles/instance/11000001/bin/12711_2025_1_MOESM1_ESM.xlsx) — Genotype quality control summary.');
    expect(md).toContain('[^1]: Wang L, Zhang HM. Genomic selection in layers. Poult Sci. 2020;99:100–110. https://doi.org/10.1016/j.psj.2019.12.001');
    expect(md).toContain('[^2]: Smith J, Brown K. Pedigree BLUP revisited. J Anim Sci. 2018;96:1–9. https://pubmed.ncbi.nlm.nih.gov/29000001/');
    expect(md).not.toContain('Google Scholar');
  });

  test('DOM and JATS routes agree on the shared article (PRD §1.3 #3)', () => {
    const jats = parseJats(fs.readFileSync(path.join(__dirname, 'fixtures/jats/europepmc-full.xml'), 'utf8'));
    for (const key of ['title', 'journal', 'year', 'doi', 'pmid', 'pmcid', 'license']) expect(ir.meta[key]).toEqual(jats.meta[key]);
    expect(ir.abstract.length).toBe(jats.abstract.length);
    expect(ir.figures.length).toBe(jats.figures.length);
    expect(ir.tables.length).toBe(jats.tables.length);
  });
});

describe('Europe PMC DOM adapter (dom-europepmc)', () => {
  const url = 'https://europepmc.org/article/PMC/PMC7000002';
  const ir = extractEuropePmc(loadHtml('europepmc-article.html'), url, { pmcid: 'PMC7000002' });
  const md = renderMarkdown(ir, { exported: EXPORTED });

  test('metadata with selector fallbacks', () => {
    expect(ir.sourceRoute).toBe('dom-europepmc');
    expect(ir.meta).toMatchObject({
      title: 'Short communication on duck plumage', journal: 'Animals (Basel)', year: 2021,
      doi: '10.3390/ani11051300', pmcid: 'PMC7000002', license: 'CC-BY-4.0', keywords: ['duck', 'plumage', 'MC1R'],
    });
    expect(ir.meta.authors.map((a) => a.name)).toEqual(['Min Zhao', 'Qiang Li']);
  });

  test('body, figure, COI and references', () => {
    expect(md).toContain('## 1. Introduction\n\nPlumage colour varies (Zhao and Li, 2019[^1]).');
    expect(md).toContain('### 2.1. Genotypes\n\nAllele frequency $p=0.3$.');
    expect(md).toContain('![Figure 1 Two plumage types.](https://europepmc.org/articles/PMC7000002/bin/animals-11-01300-g001.jpg)');
    expect(md).toContain('## Competing interests\n\nThe authors declare no conflict of interest.');
    expect(md).toContain('[^1]: Zhao M, Li Q. Duck genetics. Poult Sci. 2019;98:1. https://doi.org/10.3382/ps/pey001');
    expect(md).not.toContain('Cite');
  });
});

describe('PubMed adapter (dom-pubmed)', () => {
  test('nine bibliographic fields, MeSH and structured abstract (with PMCID)', () => {
    const ir = extractPubmed(loadHtml('pubmed-with-pmcid.html'), 'https://pubmed.ncbi.nlm.nih.gov/40000001/', { pmid: '40000001' });
    expect(ir.meta).toMatchObject({
      title: 'Genomic heritability of egg weight in Gallus gallus: a GBLUP study',
      journal: 'Genetics Selection Evolution', year: 2025, doi: '10.1186/s12711-025-00001-2',
      pmid: '40000001', pmcid: 'PMC11000001', keywords: ['GBLUP', 'Egg weight', 'Heritability'],
      mesh: ['Animals', 'Chickens / genetics*', 'Eggs*', 'Female'],
      abstractOnly: true, fullTextUrl: 'https://doi.org/10.1186/s12711-025-00001-2',
    });
    expect(ir.meta.authors).toEqual([
      { name: 'Wei Li', affiliations: ['College of Animal Science, Example University, Beijing, China.'] },
      { name: 'Jane A Smith', affiliations: ['College of Animal Science, Example University, Beijing, China.', 'Roslin Institute, Edinburgh, UK.'] },
    ]);
    expect(ir.abstract.map((s) => inlinesToPlain(s.title))).toEqual(['Background', 'Results', 'Conclusions']);
    const md = renderMarkdown(ir, { exported: EXPORTED });
    expect(md).toContain('### Results\n\nUsing 12,000 SNPs we estimated *h*<sup>2</sup> = 0.45.');
    expect(md).toContain('**MeSH terms:** Animals; Chickens / genetics\\*; Eggs\\*; Female');
    expect(md).not.toContain('© 2025');
  });

  test('abstract-only record: marker and doi.org link at the top', () => {
    const ir = extractPubmed(loadHtml('pubmed-abstract-only.html'), 'https://pubmed.ncbi.nlm.nih.gov/31768545/', { pmid: '31768545' });
    expect(ir.meta).toMatchObject({ pmid: '31768545', pmcid: '', doi: '10.1093/jas/skz370', year: 2020, journal: 'Journal of animal science' });
    const md = renderMarkdown(ir, { exported: EXPORTED });
    const body = md.split('---\n')[2].trim();
    expect(body.split('\n')[0]).toBe('> **Abstract only / 仅摘要** — Full text: <https://doi.org/10.1093/jas/skz370>');
    expect(md).toContain('source_route: dom-pubmed');
    expect(md).toContain('Residual feed intake was estimated in 2,000 ducks; heritability was 0.3.');
  });

  test('no DOI: falls back to the LinkOut link; empty abstract is fine', () => {
    const ir = extractPubmed(loadHtml('pubmed-no-doi.html'), 'https://pubmed.ncbi.nlm.nih.gov/9999999/', { pmid: '9999999' });
    expect(ir.meta).toMatchObject({ doi: '', pmid: '9999999', year: 1998, fullTextUrl: 'https://example-publisher.cn/article/123' });
    expect(ir.abstract).toEqual([]);
    expect(renderMarkdown(ir, { exported: EXPORTED })).toContain('— Full text: <https://example-publisher.cn/article/123>');
  });
});
