// PMC 文章页（pmc.ncbi.nlm.nih.gov/articles/PMCxxxx/）L2 适配器 → source_route: dom-pmc。
// 选择器按 2024 年改版后的页面结构写（【经验】），M2 spike 时需要对照真实页面复核。
import { SOURCE_ROUTES } from '../article-ir';
import { extractDomArticle } from './dom-article';

export const PMC_CONFIG = {
  route: SOURCE_ROUTES.DOM_PMC,
  root: ['main article', 'article', 'main'],
  title: ['hgroup h1', 'h1'],
  authors: '.cg .name',
  journal: '.pmc-layout__citation button',
  date: '.pmc-layout__citation',
  metaArea: ['section[aria-label="Article citation and metadata"]', '.front-matter'],
  doi: 'a[href*="doi.org"]',
  license: 'a[href*="creativecommons.org/licenses"], a[href*="creativecommons.org/publicdomain"]',
  abstract: 'section.abstract',
  keywords: '.kwd-group',
  refList: 'section.ref-list',
  refItems: '.ref-list li',
  refText: 'cite',
  refLabel: '.label',
  supp: 'section.sm, .supplementary-material',
  suppCaption: '.caption',
  remove: [
    'section[aria-label="Article citation and metadata"]',
    '.front-matter',
    'hgroup',
    'h1',
    '.associated-data',
    '.d-buttons',
    '.d-panels',
    'nav',
    '.goto',
    '.p.text-right.font-secondary',
  ],
  selectors: {},
};

export function extractPmc(doc, url, ids = {}) {
  return extractDomArticle(doc, url, PMC_CONFIG, ids);
}
