// 站点识别与注册表。M1 支持 PMC / Europe PMC / PubMed；其余 P0 站点先登记为 planned，
// popup 显示「暂不支持，计划在后续版本」。M2 新增站点时把 status 改为 supported 并挂上 adapter。
import { normalizePmcid, normalizePmid } from '../ids';

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
  { id: 'springer', name: 'BMC / SpringerOpen / Springer Link', status: SITE_STATUS.PLANNED, hosts: ['*.biomedcentral.com', '*.springeropen.com', 'link.springer.com'] },
  { id: 'nature', name: 'Nature / Scientific Reports', status: SITE_STATUS.PLANNED, hosts: ['www.nature.com'] },
  { id: 'frontiers', name: 'Frontiers', status: SITE_STATUS.PLANNED, hosts: ['www.frontiersin.org'] },
  { id: 'mdpi', name: 'MDPI', status: SITE_STATUS.PLANNED, hosts: ['www.mdpi.com'] },
  { id: 'plos', name: 'PLOS', status: SITE_STATUS.PLANNED, hosts: ['journals.plos.org'] },
  { id: 'elife', name: 'eLife', status: SITE_STATUS.PLANNED, hosts: ['elifesciences.org'] },
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

/** content script / 右键菜单用的 URL 模式（只含 M1 支持的站点） */
export const SUPPORTED_PAGE_PATTERNS = [
  'https://pmc.ncbi.nlm.nih.gov/articles/*',
  'https://pubmed.ncbi.nlm.nih.gov/*',
  'https://europepmc.org/*',
];
