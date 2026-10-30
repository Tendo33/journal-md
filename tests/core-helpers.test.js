import { normalizeDoi, normalizePmcid, normalizePmid, extractYear } from '@core/ids';
import { normalizeLicense } from '@core/license';
import { buildFilename, sanitizeFilename } from '@core/filename';
import { yamlScalar, formatExported } from '@core/render/frontmatter';

describe('ids', () => {
  test('normalizeDoi strips resolvers and trailing punctuation', () => {
    expect(normalizeDoi('https://doi.org/10.1186/s12711-020-00531-3')).toBe('10.1186/s12711-020-00531-3');
    expect(normalizeDoi('doi: 10.3389/fgene.2021.123456.')).toBe('10.3389/fgene.2021.123456');
    expect(normalizeDoi('https://doi.org/10.1093%2Fjas%2Fskz370')).toBe('10.1093/jas/skz370');
    expect(normalizeDoi('no doi here')).toBe('');
  });
  test('pmcid / pmid / year', () => {
    expect(normalizePmcid('PMC6986428')).toBe('PMC6986428');
    expect(normalizePmcid('https://pmc.ncbi.nlm.nih.gov/articles/PMC123456/')).toBe('PMC123456');
    expect(normalizePmcid('123456')).toBe('PMC123456');
    expect(normalizePmid(' 31768545 ')).toBe('31768545');
    expect(extractYear('2020 Jan 1;98(1):skz370.')).toBe(2020);
    expect(extractYear('n.d.')).toBeNull();
  });
});

describe('normalizeLicense', () => {
  test.each([
    ['https://creativecommons.org/licenses/by/4.0/', 'CC-BY-4.0'],
    ['http://creativecommons.org/licenses/by-nc-nd/4.0/', 'CC-BY-NC-ND-4.0'],
    ['https://creativecommons.org/publicdomain/zero/1.0/', 'CC0-1.0'],
    ['This article is distributed under CC BY 4.0', 'CC-BY-4.0'],
    ['Creative Commons Attribution 4.0 International License', 'CC-BY-4.0'],
    ['Creative Commons Attribution-NonCommercial 3.0 License', 'CC-BY-NC-3.0'],
    ['', ''],
  ])('%s → %s', (input, out) => {
    expect(normalizeLicense(input)).toBe(out);
  });
});

describe('filename', () => {
  const meta = { title: 'Genomic prediction: a review/update', year: 2024, authors: [{ name: 'Wang L' }], doi: '10.1/x', pmcid: 'PMC1' };
  test('default template removes illegal characters but keeps Unicode', () => {
    expect(buildFilename(meta)).toBe('Genomic prediction a review update (2024).md');
    expect(buildFilename({ title: '鸡的基因组选择 — Ü' })).toBe('鸡的基因组选择 — Ü.md');
  });
  test('custom tokens and empty fallbacks', () => {
    expect(buildFilename(meta, '{firstAuthor} {year} - {pmcid}')).toBe('Wang L 2024 - PMC1.md');
    expect(buildFilename({ pmid: '42' }, '{title}')).toBe('42.md');
    expect(buildFilename(meta, '{doi}')).toBe('10.1_x.md');
  });
  test('sanitizeFilename trims length and dots', () => {
    expect(sanitizeFilename('..a\u0001b..')).toBe('a b');
    expect(Array.from(sanitizeFilename('长'.repeat(300))).length).toBe(150);
  });
});

describe('frontmatter helpers', () => {
  test('yamlScalar quotes risky strings', () => {
    expect(yamlScalar('Genetics Selection Evolution')).toBe('Genetics Selection Evolution');
    expect(yamlScalar('Title: with colon')).toBe('"Title: with colon"');
    expect(yamlScalar('yes')).toBe('"yes"');
    expect(yamlScalar('10.1186/s1')).toBe('"10.1186/s1"');
    expect(yamlScalar('He said "hi"')).toBe('"He said \\"hi\\""');
    expect(yamlScalar(2025)).toBe('2025');
  });
  test('formatExported prints local time with offset', () => {
    const d = new Date(Date.UTC(2026, 9, 28, 13, 40));
    expect(formatExported(d, 480)).toBe('2026-10-28T21:40+08:00');
    expect(formatExported(d, -300)).toBe('2026-10-28T08:40-05:00');
  });
});
