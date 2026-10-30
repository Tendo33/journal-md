// 站点识别与注册表：PRD §2.7 的 P0 站点（PMC、Europe PMC、PubMed + 六个出版商）。
// publisher：出版商页面，走「同站 XML → Europe PMC（按 DOI）→ DOM」；openAccess：整站开放获取（PDF 解析不用逐篇确认）。
import { normalizeDoi, normalizePmcid, normalizePmid } from '../ids';

export const SITE_STATUS = Object.freeze({ SUPPORTED: 'supported', PLANNED: 'planned' });

export const SITES = [
  {
    id: 'pmc',
    name: 'PubMed Central',
    status: SITE_STATUS.SUPPORTED,
    hosts: ['pmc.ncbi.nlm.nih.gov'],
    article: (u) => {
      const m = u.pathname.match(/^\/articles\/(PMC\d+)\/?$/i);
      return m ? { pmcid: normalizePmcid(m[1]) } : null;
    },
    routes: ['jats', 'dom'],
  },
  {
    id: 'europepmc',
    name: 'Europe PMC',
    status: SITE_STATUS.SUPPORTED,
    hosts: ['europepmc.org'],
    article: (u) => {
      const m = u.pathname.match(/^\/(?:article|abstract|articles)\/(?:([A-Z]{3})\/)?([A-Za-z]*\d+)\/?/i);
      if (!m) return null;
      const source = (m[1] || (/^PMC/i.test(m[2]) ? 'PMC' : '')).toUpperCase();
      const id = m[2];
      if (source === 'PMC' || /^PMC\d+$/i.test(id)) return { pmcid: normalizePmcid(id), source: 'PMC' };
      if (source === 'MED') return { pmid: normalizePmid(id), source: 'MED' };
      return { source, extId: id };
    },
    routes: ['jats', 'dom'],
  },
  {
    id: 'pubmed',
    name: 'PubMed',
    status: SITE_STATUS.SUPPORTED,
    hosts: ['pubmed.ncbi.nlm.nih.gov'],
    article: (u) => {
      const m = u.pathname.match(/^\/(\d{1,9})\/?$/);
      return m ? { pmid: m[1] } : null;
    },
    routes: ['jats', 'dom'],
  },
  {
    id: 'springer',
    name: 'Springer Link / BMC / SpringerOpen',
    status: SITE_STATUS.SUPPORTED,
    publisher: true,
    hosts: ['link.springer.com', '*.biomedcentral.com', '*.springeropen.com'],
    // BMC、SpringerOpen 整站开放获取；link.springer.com 上是混合的，按页面许可判断
    openAccessHosts: ['*.biomedcentral.com', '*.springeropen.com'],
    article: (u) => {
      const m = u.pathname.match(/^\/(?:article|articles)\/(10\.\d{4,9}\/[^?#]+?)\/?$/);
      if (!m || /\/(figures|tables)\/\d+$/.test(m[1])) return null;
      return { doi: normalizeDoi(m[1]) };
    },
    routes: ['jats', 'dom'],
  },
  {
    id: 'nature',
    name: 'Nature / Scientific Reports',
    status: SITE_STATUS.SUPPORTED,
    publisher: true,
    hosts: ['www.nature.com'],
    article: (u) => {
      const m = u.pathname.match(/^\/articles\/([a-z][\w.-]*\d[\w.-]*?)\/?$/i);
      if (!m || /\.pdf$/i.test(m[1])) return null;
      return { doi: `10.1038/${m[1]}` };
    },
    routes: ['jats', 'dom'],
  },
  {
    id: 'frontiers',
    name: 'Frontiers',
    status: SITE_STATUS.SUPPORTED,
    publisher: true,
    openAccessHosts: ['www.frontiersin.org'],
    siteXml: true,
    xmlRoute: 'jats-frontiers',
    hosts: ['www.frontiersin.org'],
    article: (u) => {
      const m = u.pathname.match(/^\/(?:journals\/[^/]+\/)?articles\/(10\.3389\/[^/]+)(?:\/(?:full|abstract))?\/?$/i);
      return m ? { doi: normalizeDoi(m[1]) } : null;
    },
    routes: ['jats', 'dom'],
  },
  {
    id: 'mdpi',
    name: 'MDPI',
    status: SITE_STATUS.SUPPORTED,
    publisher: true,
    openAccessHosts: ['www.mdpi.com'],
    hosts: ['www.mdpi.com'],
    // /2076-2615/11/5/1300（可带 /htm）；DOI 不在地址里
    article: (u) => (/^\/\d{4}-\d{3}[\dX]\/\d+\/\d+\/\d+(?:\/htm)?\/?$/i.test(u.pathname) ? {} : null),
    routes: ['jats', 'dom'],
  },
  {
    id: 'plos',
    name: 'PLOS',
    status: SITE_STATUS.SUPPORTED,
    publisher: true,
    openAccessHosts: ['journals.plos.org'],
    hosts: ['journals.plos.org'],
    article: (u) => {
      if (!/^\/[a-z]+\/article\/?$/.test(u.pathname)) return null;
      const doi = normalizeDoi(u.searchParams.get('id') || '');
      return doi ? { doi } : null;
    },
    routes: ['jats', 'dom'],
  },
  {
    id: 'elife',
    name: 'eLife',
    status: SITE_STATUS.SUPPORTED,
    publisher: true,
    openAccessHosts: ['elifesciences.org'],
    hosts: ['elifesciences.org'],
    article: (u) => {
      const m = u.pathname.match(/^\/articles\/(\d+)\/?$/);
      return m ? { doi: `10.7554/eLife.${m[1]}` } : null;
    },
    routes: ['jats', 'dom'],
  },
  // PRD §1.1 P1：只用来在弹窗里说明「计划支持」，不申请任何权限（识别靠点击图标时的 activeTab）
  { id: 'biorxiv', name: 'bioRxiv / medRxiv', status: SITE_STATUS.PLANNED, hosts: ['www.biorxiv.org', 'www.medrxiv.org'] },
  { id: 'sciencedirect', name: 'ScienceDirect', status: SITE_STATUS.PLANNED, hosts: ['www.sciencedirect.com'] },
  { id: 'cell', name: 'Cell Press', status: SITE_STATUS.PLANNED, hosts: ['www.cell.com'] },
  { id: 'wiley', name: 'Wiley', status: SITE_STATUS.PLANNED, hosts: ['onlinelibrary.wiley.com'] },
  { id: 'oup', name: 'Oxford Academic', status: SITE_STATUS.PLANNED, hosts: ['academic.oup.com'] },
  { id: 'tandf', name: 'Taylor & Francis', status: SITE_STATUS.PLANNED, hosts: ['www.tandfonline.com'] },
];

export const SUPPORTED_SITE_IDS = SITES.filter((s) => s.status === SITE_STATUS.SUPPORTED).map((s) => s.id);

function hostMatches(host, pattern) {
  if (pattern.startsWith('*.')) return host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1;
  return host === pattern;
}

/** 主机名属于某个已支持站点（后台校验消息来源用） */
export function isSupportedHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return SITES.some((s) => s.status === SITE_STATUS.SUPPORTED && s.hosts.some((h) => hostMatches(host, h)));
}

export function getSite(id) {
  return SITES.find((s) => s.id === id) || null;
}

/**
 * @param {string} url
 * @returns {{ site: object|null, supported: boolean, isArticle: boolean, ids: object }}
 */
export function detectSite(url) {
  let u;
  try {
    u = new URL(url);
  } catch (_) {
    return { site: null, supported: false, isArticle: false, ids: {} };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { site: null, supported: false, isArticle: false, ids: {} };
  const host = u.hostname.toLowerCase();
  const site = SITES.find((s) => s.hosts.some((h) => hostMatches(host, h))) || null;
  if (!site) return { site: null, supported: false, isArticle: false, ids: {} };
  const supported = site.status === SITE_STATUS.SUPPORTED;
  const ids = supported && site.article ? site.article(u) : null;
  return { site, supported, isArticle: !!ids, ids: ids || {} };
}

/** 站点整体开放获取（PDF 解析默认只发 OA 的，见 PRD §2.11） */
export function isOpenAccessHost(site, hostname) {
  const host = String(hostname || '').toLowerCase();
  return !!(site && (site.openAccessHosts || []).some((h) => hostMatches(host, h)));
}

/** content script / 右键菜单用的 URL 模式；必须和 manifest content_scripts.matches 一致（测试会比对） */
export const SUPPORTED_PAGE_PATTERNS = [
  'https://pmc.ncbi.nlm.nih.gov/articles/*',
  'https://pubmed.ncbi.nlm.nih.gov/*',
  'https://europepmc.org/*',
  'https://link.springer.com/article/*',
  'https://*.biomedcentral.com/articles/*',
  'https://*.springeropen.com/articles/*',
  'https://www.nature.com/articles/*',
  'https://www.frontiersin.org/journals/*',
  'https://www.frontiersin.org/articles/*',
  'https://www.mdpi.com/*',
  'https://journals.plos.org/*',
  'https://elifesciences.org/articles/*',
];
