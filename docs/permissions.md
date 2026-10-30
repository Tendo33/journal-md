# 权限说明

## M1（当前）

- permissions：`activeTab`、`storage`、`downloads`、`contextMenus`、`clipboardWrite`、`scripting`
- host_permissions（只有 M1 实际用到的 4 个）：

| host | 用途 |
|---|---|
| `https://pmc.ncbi.nlm.nih.gov/*` | PMC 文章页：注入 content script，解析当前页 |
| `https://pubmed.ncbi.nlm.nih.gov/*` | PubMed 文章页：注入 content script，解析题录和摘要 |
| `https://europepmc.org/*` | Europe PMC 文章页：注入 content script |
| `https://www.ebi.ac.uk/europepmc/*` | Europe PMC REST `fullTextXML`：只在用户导出或复制时请求，只带 PMCID，不带 Cookie |

前三个 host 主要服务于 `content_scripts`（在文章页注入脚本、读取当前页 DOM，审查 N-E）；只有 `www.ebi.ac.uk/europepmc` 是扩展主动请求的接口。

打开弹窗、加载页面时不发任何请求。其余 P0 站点在 M1 只是「计划中」提示：弹窗靠点击工具栏图标时的 `activeTab` 读到当前标签页地址来识别站点，不需要这些站点的 host 权限。

图片链接（`https://pmc.ncbi.nlm.nih.gov/articles/instance/{id}/bin/{file}`）只写进 Markdown，扩展本身不去下载。

## M2 加回的 host

PRD §2.6 的其余 P0 出版商域名 **在 M2 随各自的 DOM 适配器一起加回**（审查 M-3：没有功能就不提前申请）：

- `https://*.biomedcentral.com/*`、`https://*.springeropen.com/*`、`https://link.springer.com/*`
- `https://www.nature.com/*`
- `https://www.frontiersin.org/*`
- `https://www.mdpi.com/*`
- `https://journals.plos.org/*`
- `https://elifesciences.org/*`

加回时同步修改 `scripts/permission-allowlist.js`、`tests/site-registry.test.js` 和本文件。
