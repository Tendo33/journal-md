// M1 权限白名单（PRD §2.6 P0）。manifest、verify:dist 和测试都以这里为准；
// 想加新权限先写进 .task/REPORT.md 等 Simon 决定，不要直接改这里。
const ALLOWED_PERMISSIONS = [
  'activeTab',
  'storage',
  'downloads',
  'contextMenus',
  'clipboardWrite',
  'scripting',
];

// M1 只保留实际用到的 4 个 host（审查 M-3）。PRD §2.6 的其余 P0 出版商域名（biomedcentral、springeropen、
// link.springer、nature、frontiersin、mdpi、plos、elife）在 M2 随对应适配器一起加回，见 docs/permissions.md。
const ALLOWED_HOST_PERMISSIONS = [
  'https://pmc.ncbi.nlm.nih.gov/*',
  'https://pubmed.ncbi.nlm.nih.gov/*',
  'https://europepmc.org/*',
  'https://www.ebi.ac.uk/europepmc/*',
];

// 明确禁止的写法（任何字段里出现都算失败）
const FORBIDDEN_HOST_PATTERNS = [
  /<all_urls>/,
  /^\*:\/\/\*\//,
  /^https?:\/\/\*\/\*/,
  /localhost/,
  /127\.0\.0\.1/,
  /www\.ncbi\.nlm\.nih\.gov\/pmc/, // 旧 PMC 地址，待实测后再定
];

const GECKO_ID = 'journal-md@tendo33';

module.exports = { ALLOWED_PERMISSIONS, ALLOWED_HOST_PERMISSIONS, FORBIDDEN_HOST_PATTERNS, GECKO_ID };
