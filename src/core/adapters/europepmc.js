// Europe PMC 文章页（europepmc.org/article/{SRC}/{ID}）L2 适配器 → source_route: dom-europepmc。
// Europe PMC 是前端渲染页面；L1（REST fullTextXML）优先，这里只在 L1 不可用或超时时兜底。
// 选择器为【经验】值，M2 spike 时需要对照真实页面复核。
import { SOURCE_ROUTES } from '../article-ir';
import { extractDomArticle } from './dom-article';

export const EUROPEPMC_CONFIG = {
  route: SOURCE_ROUTES.DOM_EUROPEPMC,
  root: ['#article--main-content', '.article--main-content', 'main', 'article', '#app'],
  title: ['h1#article--title', 'h1.article--title', 'h1'],
  authors: '#article--author-list .author-name, .article--author-list .author-name, .authors-list .author-name',
  journal: '#article--journal-title, .article--journal-title, .publication-title',
  date: '#article--publication-date, .article--publication-date',
  doi: 'a[href*="doi.org/10."]',
  license: 'a[href*="creativecommons.org/licenses"], a[href*="creativecommons.org/publicdomain"]',
  abstract: '#abstract, #article--abstract, .abstract',
  keywords: '.keywords, .kwd-group',
  refList: '#references, #article--references, .ref-list',
  refItems: '#references li, #article--references li, .ref-list li',
  refText: '.citation, cite',
  refLabel: '.label, .ref-label',
  supp: '.supplementary-material, .supplementary-file',
  suppCaption: '.caption, .supp-caption',
  remove: [
    'h1',
    'header',
    'nav',
    'aside',
    '.article--meta',
    '#article--meta',
    '.article--toolbar',
    '.article--sidebar',
    '.feedback',
  ],
  selectors: {
    figure: 'figure, .fig',
    table: '.table-wrap, .tw',
  },
};

export function extractEuropePmc(doc, url, ids = {}) {
  return extractDomArticle(doc, url, EUROPEPMC_CONFIG, ids);
}
