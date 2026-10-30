# 权限说明（1.0.0）

白名单以 `scripts/permission-allowlist.js` 为准，`npm run verify:dist` 和测试都按它校验构建产物。

## 安装时授予

- permissions：`activeTab`、`storage`、`downloads`、`contextMenus`、`clipboardWrite`、`scripting`
  （Firefox 包另加 `declarativeNetRequestWithHostAccess`，见下文）
- host_permissions（PRD §2.6 P0 列表里、代码实际用到的 12 个）：

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

前三个和出版商域名主要服务于 `content_scripts`（在文章页注入脚本、读取当前页 DOM，审查 N-E）。content script 的 matches 尽量收窄到文章路径（`/articles/*`、`/article/*` 等），MDPI、PLOS 的文章地址没有固定前缀，只能整站匹配；脚本加载时只读扩展自己的设置，不发请求，也不读页面内容。

ZIP 打包时，页面里按 CORS 取不到的图片，如果图片在上表的站点上，后台会代取（只取 https 的 `image/*`，不带 Cookie）。Springer / Nature 和 PLOS 的图片走下面的可选权限（「ZIP 图片」）；其他图片域名不申请权限，取不到时图片保留原网址。

打开弹窗、加载页面时不发任何请求。

## 可选权限（PDF 解析，PRD §2.11）

PDF 解析默认关闭。用户在设置页打开 PDF 解析或切换后端时，才在点击手势里申请该后端的权限；拒绝则保持关闭。

| 权限 | 申请时机 | 用途 |
|---|---|---|
| `https://paddleocr.aistudio-app.com/*` | 选 PaddleOCR（默认）并打开 | 提交任务、轮询 |
| `https://*.bj.bcebos.com/*` | 同上，一起申请 | 下载 PaddleOCR 的结果 JSONL 和图片 |
| `declarativeNetRequestWithHostAccess` | 同上，一起申请（仅 Chrome / Edge 包） | 只对本扩展发往 `paddleocr.aistudio-app.com` 的请求去掉 `Origin` 头（星河网关对扩展 Origin 返回空 403） |
| `https://mineru.net/*` | 选 MinerU 并打开 | 提交任务、轮询 |
| `https://cdn-mineru.openxlab.org.cn/*` | 同上，一起申请 | MinerU 结果 ZIP 所在域名 |

与 arxiv-md b2dc3a0 的差别：arxiv-md 里 MinerU 的两个域名是安装时授予；journal-md 里 PDF 兜底是 P2，两个后端都走可选权限（`src/pdf/providers.js` 把 MinerU 重新定义为 `permissionMode: 'optional'`，vendored 内核不改）。

### 可选权限：ZIP 图片（Simon 2026-10-30 17:52 批准）

| 权限 | 申请时机 | 用途 |
|---|---|---|
| `https://media.springernature.com/*` | 在 Springer Link / BMC / Nature 文章上、在工具栏弹窗里点「下载 ZIP」，并且页面图片在这个 CDN 上 | 后台下载文章图片打进 ZIP（这个 CDN 不发 CORS 头，页面里取不到） |
| `https://corpus-prod.f505aadad1e46610c8f8563037eb3c4b.r2.cloudflarestorage.com/*` | 在 PLOS 文章上、在弹窗里点「下载 ZIP」 | PLOS 的 `/article/figure/image` 和 `/article/file?type=thumbnail` 一律 302 到这个 R2 存储桶，它不发 CORS 头；只取这个确切主机，不用 `*.r2.cloudflarestorage.com` |

- 申请在弹窗按钮的点击回调里**同步**调用 `permissions.request`（Firefox 要求在用户手势同一调用栈）；已授权时浏览器直接返回、不再弹窗。
- 悬浮按钮、快捷键、右键菜单不能申请（content script 没有 permissions API，后台消息不算用户手势），缺权限时 ZIP 照样生成，提示用户到弹窗里点「下载 ZIP」授权。
- 拒绝：ZIP 照样生成，这些图片在 article.md 里保留原网址，结果里有提示。

### Firefox

和 arxiv-md 一样（FF-01 方案 A）：Firefox 包把 `declarativeNetRequestWithHostAccess` 从 `optional_permissions` 移到 `permissions`（安装时授予），其余可选权限不变。申请时用内核的 `withRequiredPermissions` 去掉已是必需的权限。`browser_specific_settings.gecko.data_collection_permissions.required` 为 `["websiteContent"]`。

## 与 M1（e59b310）相比的变化

| 字段 | Chrome / Edge 包 | Firefox 包 |
|---|---|---|
| permissions | 不变 | **+ `declarativeNetRequestWithHostAccess`** |
| host_permissions | **+ 8**：`link.springer.com`、`*.biomedcentral.com`、`*.springeropen.com`、`www.nature.com`、`www.frontiersin.org`、`www.mdpi.com`、`journals.plos.org`、`elifesciences.org` | 同左 |
| optional_permissions | **新增** `declarativeNetRequestWithHostAccess` | 无 |
| optional_host_permissions | **新增** `paddleocr.aistudio-app.com`、`*.bj.bcebos.com`、`mineru.net`、`cdn-mineru.openxlab.org.cn`；fix2 再加 `media.springernature.com`、`corpus-prod.f505aadad1e46610c8f8563037eb3c4b.r2.cloudflarestorage.com`（ZIP 图片） | 同左 |
| content_scripts.matches | **+ 9**：`link.springer.com/article/*`、`*.biomedcentral.com/articles/*`、`*.springeropen.com/articles/*`、`www.nature.com/articles/*`、`www.frontiersin.org/journals/*`、`www.frontiersin.org/articles/*`、`www.mdpi.com/*`、`journals.plos.org/*`、`elifesciences.org/articles/*` | 同左 |

没有申请 `<all_urls>`、localhost、`alarms`、`notifications`、`tabs`，也没有 `web_accessible_resources`。
