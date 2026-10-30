// 权限白名单。manifest、verify:dist 和测试都以这里为准；想加新权限先写进报告等 Simon 决定，不要直接改这里。
// Simon 2026-10-30 18:06：全部改为安装时授予，不再有可选权限、也不在使用时申请（fix round 2 part 3）。
const ALLOWED_PERMISSIONS = [
  'activeTab',
  'storage',
  'downloads',
  'contextMenus',
  'clipboardWrite',
  'scripting',
  // PaddleOCR 网关拒绝带扩展 Origin 的请求：只对本扩展发往 paddleocr.aistudio-app.com 的请求去掉 Origin 头（同 arxiv-md）
  'declarativeNetRequestWithHostAccess',
];

// 安装时授予的 host：出版商和 Europe PMC（PRD §2.6 P0），加上 PDF 解析后端和 ZIP 图片 CDN（原来是可选权限，Simon 18:06 改为安装时授予）。
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
  'https://paddleocr.aistudio-app.com/*', // PaddleOCR（星河社区）任务接口
  'https://*.bj.bcebos.com/*', // PaddleOCR 结果 JSONL 和图片
  'https://mineru.net/*', // MinerU 任务接口
  'https://cdn-mineru.openxlab.org.cn/*', // MinerU 结果 ZIP
  // ZIP 打包图片：PLOS 的图片地址都 302 到这一个 R2 存储桶（只取这个确切主机），Springer / BMC / Nature 的图片 CDN；两者都不发 CORS 头
  'https://corpus-prod.f505aadad1e46610c8f8563037eb3c4b.r2.cloudflarestorage.com/*',
  'https://media.springernature.com/*',
];

// Firefox 数据收集声明（data_collection_permissions.required）：读文章内容；用户填了 PDF 服务 Token 时会把它发给该服务
const FIREFOX_DATA_COLLECTION = ['websiteContent', 'authenticationInfo'];

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

module.exports = { ALLOWED_PERMISSIONS, ALLOWED_HOST_PERMISSIONS, FIREFOX_DATA_COLLECTION, FORBIDDEN_HOST_PATTERNS, GECKO_ID };
