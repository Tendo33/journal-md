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

// 安装时授予的 host：PRD §2.6 的 P0 列表里、代码真正用到的（M1 的 4 个 + M2 随出版商适配器加回的 8 个），见 docs/permissions.md。
const ALLOWED_HOST_PERMISSIONS = [
  'https://pmc.ncbi.nlm.nih.gov/*',
  'https://pubmed.ncbi.nlm.nih.gov/*',
  'https://europepmc.org/*',
  'https://www.ebi.ac.uk/europepmc/*',
  'https://link.springer.com/*',
  'https://*.biomedcentral.com/*',
  'https://*.springeropen.com/*',
  'https://www.nature.com/*',
  'https://www.frontiersin.org/*',
  'https://www.mdpi.com/*',
  'https://journals.plos.org/*',
  'https://elifesciences.org/*',
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
