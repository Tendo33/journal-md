# 权限说明（1.0.0）

白名单以 `scripts/permission-allowlist.js` 为准，`npm run verify:dist` 和测试都按它校验构建产物。

## 安装时授予（全部，Simon 2026-10-30 18:06）

所有权限都在安装时授予，Chrome / Edge 包和 Firefox 包相同。**没有 `optional_permissions`、`optional_host_permissions`**，扩展在使用中从不调用 `permissions.request`（单测扫描 `src/`：没有 `permissions.request`，也不引用 vendored 内核里的权限申请函数；e2e 记录弹窗里的调用次数为 0）。

- permissions：`activeTab`、`storage`、`downloads`、`contextMenus`、`clipboardWrite`、`scripting`、`declarativeNetRequestWithHostAccess`
- host_permissions（18 个）：

| host | 用途 |
|---|---|
| `https://pmc.ncbi.nlm.nih.gov/*` | PMC 文章页：注入 content script，解析当前页；ZIP 打包时代取该站图片 |
| `https://pubmed.ncbi.nlm.nih.gov/*` | PubMed 文章页：注入 content script，解析题录和摘要 |
| `https://europepmc.org/*` | Europe PMC 文章页：注入 content script |
| `https://www.ebi.ac.uk/europepmc/*` | Europe PMC REST：`fullTextXML`（按 PMCID）和 `search`（出版商页面按 DOI 查 PMCID）。只在导出 / 复制 / ZIP 时请求，不带 Cookie 和页面地址 |
| `https://link.springer.com/*`、`https://*.biomedcentral.com/*`、`https://*.springeropen.com/*` | Springer Link / BMC / SpringerOpen 文章页（BMC 期刊现在会跳转到 link.springer.com） |
| `https://www.nature.com/*` | Nature / Scientific Reports 文章页 |
| `https://www.frontiersin.org/*` | Frontiers 文章页；导出时在页面里请求同站的文章 XML |
| `https://www.mdpi.com/*` | MDPI 文章页 |
| `https://journals.plos.org/*` | PLOS 文章页 |
| `https://elifesciences.org/*` | eLife 文章页 |
| `https://paddleocr.aistudio-app.com/*` | PDF 解析（PaddleOCR）：提交任务、轮询。只在选了 PaddleOCR、填了 Token 并点「解析 PDF」时请求 |
| `https://*.bj.bcebos.com/*` | 下载 PaddleOCR 的结果 JSONL 和图片 |
| `https://mineru.net/*` | PDF 解析（MinerU）：提交任务、轮询 |
| `https://cdn-mineru.openxlab.org.cn/*` | MinerU 结果 ZIP 所在域名 |
| `https://media.springernature.com/*` | ZIP 打包 Springer Link / BMC / Nature 的图片（这个 CDN 不发 CORS 头，页面里取不到，由后台代取） |
| `https://corpus-prod.f505aadad1e46610c8f8563037eb3c4b.r2.cloudflarestorage.com/*` | ZIP 打包 PLOS 的图片：`/article/figure/image` 和 `/article/file?type=thumbnail` 一律 302 到这个 R2 存储桶，它不发 CORS 头。只用这个确切主机，不用 `*.r2.cloudflarestorage.com` |

前三个和出版商域名主要服务于 `content_scripts`（在文章页注入脚本、读取当前页 DOM，审查 N-E）。content script 的 matches 尽量收窄到文章路径（`/articles/*`、`/article/*` 等），MDPI、PLOS 的文章地址没有固定前缀，只能整站匹配；脚本加载时只读扩展自己的设置，不发请求，也不读页面内容。

ZIP 打包时，页面里按 CORS 取不到的图片，如果图片在上表的站点上（含两个图片 CDN），后台会代取（只取 https 的 `image/*`，不带 Cookie）。其他图片域名没有权限；取不到的图片（任何原因）照样生成 ZIP，在 article.md 里保留原网址，结果里有提示。

`declarativeNetRequestWithHostAccess`：只对本扩展发往 `paddleocr.aistudio-app.com` 的请求去掉 `Origin` 头（星河网关对扩展 Origin 返回空 403）。规则安装时就在，但不解析 PDF 就没有请求发往这个域名。

打开弹窗、加载页面时不发任何请求。PDF 解析不弹确认：给所选后端填了 Token，弹窗里就有按钮，点了直接发送；是否开放获取只做内部判断，不拦截。

与 arxiv-md b2dc3a0 的差别：arxiv-md 里 PaddleOCR 的域名和 DNR 是可选权限；journal-md 全部安装时授予（`src/pdf/providers.js` 把两个后端都重新定义为 `permissionMode: 'install'`，vendored 内核不改）。

### Firefox

`browser_specific_settings.gecko.data_collection_permissions.required` 为 `["websiteContent", "authenticationInfo"]`：`websiteContent` 同 arxiv-md（读文章内容生成 Markdown，解析 PDF 时把 PDF 链接发给所选后端）；`authenticationInfo` 是 arxiv-md 没有声明的——用户填的 PDF 服务 Token 随每次解析请求发给该服务。

## 与 M1（e59b310）相比的变化

| 字段 | Chrome / Edge 包 | Firefox 包 |
|---|---|---|
| permissions | **+ `declarativeNetRequestWithHostAccess`** | 同左 |
| host_permissions | **+ 14**：`link.springer.com`、`*.biomedcentral.com`、`*.springeropen.com`、`www.nature.com`、`www.frontiersin.org`、`www.mdpi.com`、`journals.plos.org`、`elifesciences.org`；PDF 后端 `paddleocr.aistudio-app.com`、`*.bj.bcebos.com`、`mineru.net`、`cdn-mineru.openxlab.org.cn`；ZIP 图片 `media.springernature.com`、`corpus-prod.f505aadad1e46610c8f8563037eb3c4b.r2.cloudflarestorage.com` | 同左 |
| optional_permissions / optional_host_permissions | 无 | 无 |
| data_collection_permissions | — | **新增** required `websiteContent`、`authenticationInfo` |
| content_scripts.matches | **+ 9**：`link.springer.com/article/*`、`*.biomedcentral.com/articles/*`、`*.springeropen.com/articles/*`、`www.nature.com/articles/*`、`www.frontiersin.org/journals/*`、`www.frontiersin.org/articles/*`、`www.mdpi.com/*`、`journals.plos.org/*`、`elifesciences.org/articles/*` | 同左 |

没有申请 `<all_urls>`、localhost、`alarms`、`notifications`、`tabs`，也没有 `web_accessible_resources`。
