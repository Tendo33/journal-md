// 出版商页面的 L2 DOM 适配器（PRD §2.7 P0）：Springer Link / BMC / SpringerOpen、Nature、Frontiers、MDPI、PLOS、eLife。
// 选择器按 2026-10-30 抓取的真实页面写（tests/fixtures/html/<site>-*.html，裁剪过）；页面改版后要对照新页面更新。
// 这些站点优先走结构化全文（同站 XML 或 Europe PMC），DOM 只在拿不到时兜底，见 export/pipeline.js。
import { SOURCE_ROUTES } from '../article-ir';
import { extractDomArticle } from './dom-article';

// Springer Link（含已迁到 link.springer.com 的 BMC 期刊）和 Nature 是同一套页面（c-article-*）
const SPRINGER_NATURE = {
  root: ['article', 'main', '#main-content'],
  title: ['h1.c-article-title', 'h1'],
  authors: '.c-article-author-list__item a[data-test="author-name"]',
  journal: '.c-article-info-details [data-test="journal-title"]',
  date: 'time',
  metaArea: ['.c-article-header', '.c-bibliographic-information'],
  doi: 'a[href*="doi.org/10."]',
  // 许可只认「Rights and permissions」框里的链接（含框里的 rel="license"）和 <head> 里的 link rel="license"
  // （审查 M-1、复审 N1：正文 / 参考文献里的 CC 链接或 rel="license" 都不能算文章许可）
  license: '#rightslink-content a[href*="creativecommons.org"], #rightslink-content a[rel="license"], head link[rel="license"]',
  abstract: 'section[data-title="Abstract"] .c-article-section__content, #Abs1-content',
  keywords: '',
  keywordItems: 'section[data-title="About this article"] h3 + .c-article-subject-list li',
  // 正文 + 文末各节；「Author information / Rights and permissions / About this article」等不在白名单里
  body: [
    '.main-content',
    'section[data-title="Abbreviations"]',
    'section[data-title="Data availability"]',
    'section[data-title="Code availability"]',
    'section[data-title="Availability of data and materials"]',
    'section[data-title="Acknowledgements"]',
    'section[data-title="Funding"]',
    'section[data-title="Ethics declarations"]',
    'section[data-title="Additional information"]',
  ].join(', '),
  refList: 'section[data-title="References"]',
  refItems: '.c-article-references__item',
  refText: '.c-article-references__text',
  refLabel: '',
  supp: '.c-article-supplementary__item',
  suppCaption: '.c-article-supplementary__description',
  remove: ['.c-article-section__figure-link', '.c-article-recommendations', '.app-explore-related-subjects', '.c-article-equation__number'],
  selectors: {
    figure: 'figure:not(.c-article-table figure)',
    table: '.c-article-table',
    formula: '.c-article-equation',
    label: 'b[data-test="figure-caption-text"]',
    caption: '.c-article-section__figure-description, .c-article-table__figcaption',
  },
};

export const SPRINGER_CONFIG = { ...SPRINGER_NATURE, route: SOURCE_ROUTES.DOM_SPRINGER };
export const NATURE_CONFIG = { ...SPRINGER_NATURE, route: SOURCE_ROUTES.DOM_NATURE };

export const FRONTIERS_CONFIG = {
  route: SOURCE_ROUTES.DOM_FRONTIERS,
  root: ['main.ArticleDetailsV4__main', 'main', '.ArticleDetails'],
  title: ['h1.ArticleDetailsV4__main__title', 'h1'],
  authors: '.PeopleList .PeopleListItem__name',
  journal: '',
  date: '',
  metaArea: ['.ArticleLayoutHeader'],
  doi: 'a[href*="doi.org/10."]',
  // 只认 <head> 里的 link rel="license"（复审 N1）；正文里没有许可链接，许可写在页面底部的版权框文字里
  license: 'head link[rel="license"]',
  licenseText: '.Summary__copyright p',
  // 摘要在 .ArticleContent 的第一个 div（<h2>Abstract</h2> 开头）里，没有专门的类名：按标题找
  abstract: '',
  abstractByHeading: true,
  keywords: '',
  body: '.ArticleContent',
  refList: '.References',
  refItems: '.References__item',
  refText: '.References__content > p',
  refLabel: '.References__label',
  supp: '',
  suppCaption: '',
  remove: ['.Summary', '.References__links', '.ArticleTable__header button', '.Footnote__anchor', '.ArticleMathFormula__label'],
  selectors: {
    figure: '.ArticleFigure, figure.ArticleFigure',
    table: '.ArticleTable',
    formula: '.ArticleMathFormula--block',
    label: '.ArticleTable__title, .ArticleFigure__title',
    caption: '.ArticleTable__description, .ArticleFigure__description, .ArticleTable__caption, .ArticleFigure__caption, figcaption',
    tableFoot: '.ArticleTable__foot',
    // 正文引用是 <button id="B7-button" class="ArticleReference">，指向 li#B7
    cite: 'button.ArticleReference',
  },
  hooks: {
    citeRid: (el) => String(el.getAttribute('id') || '').replace(/-button$/, ''),
    prepareBody: (body) => body.querySelectorAll('.Footnote__label').forEach((l) => l.after(' ')),
    // 参考文献里姓、名、作者之间没有任何分隔（<span>Aberson</span><span>C. L.</span>）：补上空格和逗号
    refPrepare: (clone) => {
      clone.querySelectorAll('.References__name').forEach((name) => {
        Array.from(name.children).slice(0, -1).forEach((part) => part.after(' '));
        const next = name.nextElementSibling;
        if (next && next.classList.contains('References__name')) name.after(', ');
      });
    },
  },
};

export const MDPI_CONFIG = {
  route: SOURCE_ROUTES.DOM_MDPI,
  root: ['article', 'main', 'body'],
  title: ['h1'],
  authors: '',
  journal: '',
  date: '',
  metaArea: ['.bib-identity'],
  doi: 'a[href*="doi.org/10."]',
  license: '#html-copyright a[href*="creativecommons.org"], head link[rel="license"]',
  abstract: 'section#Abstract',
  keywords: '#html-keywords',
  keywordItems: '#html-keywords .html-keywords-link',
  // 正文在 .prose-article 里（和摘要、关键词、参考文献同一层）；「Simple Summary」留在正文开头
  body: '.prose-article',
  refList: '#html-references_list',
  // 参考文献 li 没有 id，正文引用写的是 reference-link="#B1-animals-11-01300"：按序号对应
  refItems: '#html-references_list ol > li',
  refId: (_li, i) => `ref-${i + 1}`,
  refText: '',
  refLabel: '',
  supp: '',
  suppCaption: '',
  // .html-figpopup 里包着图片本身（<button><img data-large=…></button>），不能删（QA JM-M2-03）；
  // 文末的 #FiguresandTables（旧版 #Figures / #Tables）是重复的图表汇总
  remove: ['#html-keywords', '#html-graphical', '#html-copyright', '.html-fn_group', '#Tables', '#Figures', '#FiguresandTables', '.html-table_show', '.html-fig_show',
    '.html-media-expand'],
  selectors: {
    figure: '.html-fig-wrap, .html-fig_wrap',
    table: '.html-table-wrap, .html-table_wrap',
    formula: '.html-disp-formula-info, .html-disp-formula',
    label: '.html-table_wrap_discription > b, .html-fig_description > b, .html-caption > b',
    caption: '.html-table_wrap_discription, .html-fig_description, .html-caption',
    tableFoot: '.html-table_foot',
    cite: 'span.html-reference[reference-link], a.html-bibr',
  },
  hooks: {
    citeRid: (el) => {
      const m = String(el.getAttribute('reference-link') || el.getAttribute('href') || '').match(/#B(\d+)-/);
      return m ? `ref-${m[1]}` : '';
    },
    // 表格正文放在页面别处的弹窗容器里：#table_body_display_<id>
    tableSource: (el) => (el.id && el.ownerDocument.getElementById(`table_body_display_${el.id}`)) || null,
  },
};

export const PLOS_CONFIG = {
  route: SOURCE_ROUTES.DOM_PLOS,
  root: ['.article-content', '#artText', 'article'],
  title: ['#artTitle', 'h1'],
  authors: '.author-list .author-name',
  journal: '',
  date: '',
  metaArea: ['.articleinfo'],
  doi: 'a[href*="doi.org/10."]',
  license: '.articleinfo a[href*="creativecommons.org"]',
  abstract: '.abstract',
  keywords: '',
  refList: '.references',
  refItems: 'ol.references > li',
  refText: '',
  refLabel: '.order',
  supp: '.supplementary-material',
  suppCaption: '.caption, p',
  licenseText: '.articleinfo p',
  remove: ['.amendment', '#figure-carousel-section', 'ul.reflinks', '.figure-inline-download', '.caption_object', '.articleinfo', '.related-articles-container'],
  selectors: {
    // PLOS 的表常常是图片（.figure[data-doi$=".t001"]）：当表处理，其余 .figure 是图
    figure: '.figure:not([data-doi*=".t0"])',
    table: '.table-wrap, .figure[data-doi*=".t0"]',
    label: '.figcaption > span:first-child',
    caption: '.figcaption',
    equationImage: 'img.inline-graphic, .inline-formula img, .equation img',
    formula: '.equation',
  },
  hooks: {
    // 页面上是缩略图（size=inline），换成大图
    imageSrc: (url) => url.replace(/([?&]size=)inline\b/, '$1large'),
  },
};

export const ELIFE_CONFIG = {
  route: SOURCE_ROUTES.DOM_ELIFE,
  root: ['main', '#maincontent', 'body'],
  title: ['h1.content-header__title', 'h1'],
  authors: '.content-header .author_list .author_link',
  journal: '',
  journalName: 'eLife',
  date: '',
  metaArea: ['.content-header'],
  doi: 'a[href*="doi.org/10.7554"]',
  license: '#copyright a[href*="creativecommons.org"]',
  abstract: 'section#abstract .article-section__body',
  keywords: '',
  keywordItems: '.keyword-list a, #keywords .keyword',
  body: '.main-content-grid',
  refList: '#references',
  refItems: '#references .reference',
  refText: '',
  refLabel: '',
  supp: '',
  suppCaption: '',
  remove: ['#abstract', '#metrics', '#share', '.article-meta', '.speech-bubble', '.visuallyhidden', '.authors-details__heading',
    '.doi--asset', '.caption-text__toggle', 'hypothesis-highlight[hidden]'],
  pdfLink: 'a[href$=".pdf"], a[href*=".pdf?"]',
  hooks: {
    // 参考文献是好几个块：作者列表（每人一个 li）、年份、标题链接、出处。拼成一行：「A, B, C (2006) 标题. 出处」
    refPrepare: (clone) => {
      const doc = clone.ownerDocument;
      const line = doc.createElement('span');
      const authors = Array.from(clone.querySelectorAll('.reference__author')).map((a) => a.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const suffix = clone.querySelector('.reference__authors_list_suffix');
      const title = clone.querySelector('.reference__title');
      const origin = clone.querySelector('.reference__origin');
      line.append(`${authors.join(', ')}${suffix ? ` ${suffix.textContent.trim()}` : ''} `);
      if (title) line.append(title.textContent.trim().replace(/[.]?$/, '. '));
      if (origin) line.append(...Array.from(origin.childNodes));
      clone.textContent = '';
      clone.append(line);
    },
  },
  selectors: {
    figure: '.asset-viewer-inline:not(.asset-viewer-inline--table)',
    table: '.asset-viewer-inline--table',
    label: '.asset-viewer-inline__header_text__prominent',
    caption: 'figcaption',
  },
};

export const PUBLISHER_CONFIGS = {
  springer: SPRINGER_CONFIG,
  nature: NATURE_CONFIG,
  frontiers: FRONTIERS_CONFIG,
  mdpi: MDPI_CONFIG,
  plos: PLOS_CONFIG,
  elife: ELIFE_CONFIG,
};

export const PUBLISHER_ADAPTERS = Object.fromEntries(Object.entries(PUBLISHER_CONFIGS)
  .map(([id, cfg]) => [id, (doc, url, ids = {}) => extractDomArticle(doc, url, cfg, ids)]));
