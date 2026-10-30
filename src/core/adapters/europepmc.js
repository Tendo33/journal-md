// Europe PMC 文章页（europepmc.org/article/{SRC}/{ID}）L2 适配器 → source_route: dom-europepmc。
// Europe PMC 是前端渲染页面；L1（REST fullTextXML）优先，这里只在 L1 不可用或超时时兜底。
// 选择器为【经验】值，M2 spike 时需要对照真实页面复核。
import { SOURCE_ROUTES } from '../article-ir';
import { extractDomArticle } from './dom-article';

export const EUROPEPMC_CONFIG = {
  route: SOURCE_ROUTES.DOM_EUROPEPMC,
  // 2026-10 的页面（tests/fixtures/html/europepmc-*.html，真实页面裁剪）：#article-mid-col 下是元数据 + 各个 .content-section
  root: ['#article-mid-col', '#article--main-content', '.article--main-content', 'main', 'article', '#app'],
  title: ['#article--current--title', 'h1#article--title', 'h1.article--title', 'h1'],
  // 只取姓名，不带后面的单位编号 <sup> 1 </sup>（QA JM-10）
  authors: '.metadata--author-name, #article--author-list .author-name, .article--author-list .author-name',
  journal: '.metadata--source-title, #article--journal-title, .article--journal-title',
  date: '.metadata--citation [itemprop="datepublished"], #article--publication-date, .article--publication-date',
  // 只在文章元数据区里找 DOI / PMID / PMCID；正文、参考文献、「被引」「相似文章」里的都不算（QA JM-01）
  metaArea: ['.metadata--citation', '#article--meta', '.article--meta'],
  doi: 'a[href*="doi.org/10."]',
  // 只看元数据区和 <head> 里的 link rel="license"（审查 M-1、复审 N1）
  license: '#article--meta a[href*="creativecommons.org"], .article--meta a[href*="creativecommons.org"], .metadata--citation a[href*="creativecommons.org"], head link[rel="license"]',
  abstract: '#article--abstract--content, #abstract:not(.content-section), #article--abstract, .abstract',
  keywords: '.keywords, .kwd-group',
  // 正文只认全文容器（白名单）：MED 无全文页上的「Author information / Full text links / References / Citations /
  // Similar Articles / Funding / Share」都不是正文（QA JM-10）。全文是懒加载的，没展开时这里为空 → 仅摘要
  body: '#free-full-text .section-content, #fulltextcontent, #article--fulltext',
  refList: '#references, #article--references, .ref-list',
  refItems: '#fulltextcontent ~ #references li, #free-full-text .ref-list li',
  refText: '.citation, cite',
  refLabel: '.label, .ref-label',
  supp: '#free-full-text .supplementary-material, #fulltextcontent .supplementary-material',
  suppCaption: '.caption, .supp-caption',
  remove: [],
  selectors: {
    figure: 'figure, .fig',
    table: '.table-wrap, .tw',
  },
};

export function extractEuropePmc(doc, url, ids = {}) {
  return extractDomArticle(doc, url, EUROPEPMC_CONFIG, ids);
}
