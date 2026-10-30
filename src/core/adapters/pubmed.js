// PubMed 文章页（pubmed.ncbi.nlm.nih.gov/{PMID}/）适配器 → source_route: dom-pubmed（PRD §1.3）。
// 只解析当前页 DOM：题录 9 个字段、MeSH、结构化摘要小标题、LinkOut。不调用 eutils。
// 有 PMCID 时由导出流程转去 Europe PMC fullTextXML；这里产出的是「仅摘要」版本。
import { createArticle, SOURCE_ROUTES, trimInlines } from '../article-ir';
import { HtmlConverter, citationMeta } from '../parsers/html-blocks';
import { normalizeDoi, normalizePmcid, normalizePmid, extractYear } from '../ids';
import { textOf, resolveUrl } from '../parsers/dom-utils';
import { splitKeywords } from './dom-article';

const HEADING = '#full-view-heading';

function q(root, sel) {
  try { return root.querySelector(sel); } catch (_) { return null; }
}

function qa(root, sel) {
  try { return Array.from(root.querySelectorAll(sel)); } catch (_) { return []; }
}

function authors(doc) {
  const scope = q(doc, HEADING) || doc;
  const items = qa(scope, '.authors-list .authors-list-item');
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const name = textOf(q(item, '.full-name')) || textOf(item).replace(/\s*\d+(,\s*\d+)*\s*$/, '');
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const affiliations = qa(item, '.affiliation-link').map((a) => (a.getAttribute('title') || '').trim()).filter(Boolean);
    out.push({ name, affiliations });
  }
  if (!out.length) citationMeta(doc, 'citation_authors').flatMap((s) => s.split(/\s*;\s*/)).filter(Boolean).forEach((name) => out.push({ name, affiliations: [] }));
  return out;
}

function identifier(doc, type) {
  const el = q(doc, `#full-view-identifiers .identifier.${type} .id-link`) || q(doc, `#full-view-identifiers .identifier.${type} .current-id`)
    || q(doc, `.identifiers .identifier.${type} .id-link`);
  return textOf(el);
}

function abstractSections(conv, absEl) {
  const sections = [];
  let current = null;
  for (const p of qa(absEl, 'p')) {
    const sub = q(p, '.sub-title');
    const clone = p.cloneNode(true);
    const subClone = q(clone, '.sub-title');
    if (subClone) subClone.remove();
    const inl = trimInlines(conv.inlines(clone));
    if (sub) {
      current = { title: [{ t: 'text', v: textOf(sub).replace(/:\s*$/, '') }], blocks: [], children: [] };
      sections.push(current);
    } else if (!current) {
      current = { title: null, blocks: [], children: [] };
      sections.push(current);
    }
    if (inl.length) current.blocks.push({ type: 'paragraph', inlines: inl });
  }
  return sections.filter((s) => s.blocks.length || s.title);
}

/**
 * @returns {object} ArticleIR（abstractOnly = true，meta.pmcid 有值时可以去取全文）
 */
export function extractPubmed(doc, url, ids = {}) {
  const ir = createArticle({ sourceRoute: SOURCE_ROUTES.DOM_PUBMED });
  const meta = ir.meta;
  const conv = new HtmlConverter(ir, { baseUrl: url });
  meta.url = url;
  meta.title = (citationMeta(doc, 'citation_title')[0] || textOf(q(doc, `${HEADING} .heading-title`)) || textOf(q(doc, 'h1'))).replace(/\s+/g, ' ').trim();
  meta.authors = authors(doc);
  const journalBtn = q(doc, '#full-view-journal-trigger');
  meta.journal = citationMeta(doc, 'citation_journal_title')[0] || (journalBtn && (journalBtn.getAttribute('title') || textOf(journalBtn))) || '';
  meta.year = extractYear(textOf(q(doc, `${HEADING} .cit`)) || citationMeta(doc, 'citation_date')[0] || citationMeta(doc, 'citation_publication_date')[0]);
  meta.doi = normalizeDoi(identifier(doc, 'doi') || citationMeta(doc, 'citation_doi')[0] || '');
  meta.pmid = normalizePmid(identifier(doc, 'pubmed') || citationMeta(doc, 'citation_pmid')[0] || ids.pmid || '');
  meta.pmcid = normalizePmcid(identifier(doc, 'pmc'));

  const absRoot = q(doc, '#abstract');
  const absEl = q(doc, '#eng-abstract') || (absRoot && q(absRoot, '.abstract-content')) || null;
  if (absEl) ir.abstract = abstractSections(conv, absEl);

  // 关键词在 #abstract 里、摘要正文之外：<p><strong class="sub-title">Keywords:</strong> a; b.</p>
  if (absRoot) {
    for (const p of qa(absRoot, 'p')) {
      if (absEl && absEl.contains(p)) continue;
      const sub = q(p, '.sub-title');
      if (sub && /key\s*words?/i.test(textOf(sub))) meta.keywords = splitKeywords(textOf(p));
    }
  }
  if (!meta.keywords.length) meta.keywords = citationMeta(doc, 'citation_keywords').flatMap(splitKeywords);

  meta.mesh = qa(doc, '#mesh-terms .keywords-list li').map((li) => textOf(q(li, '.keyword-actions-trigger') || li)).filter(Boolean);

  const linkOut = qa(doc, '.full-text-links-list a.link-item, #full-text-links-list a')
    .map((a) => resolveUrl(a.getAttribute('href'), url)).find(Boolean);
  meta.fullTextUrl = meta.doi ? `https://doi.org/${meta.doi}`
    : (linkOut || (meta.pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${meta.pmcid}/` : ''));
  meta.abstractOnly = true;
  return ir;
}
