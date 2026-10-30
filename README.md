<div align="center">

# Journal to Markdown

**把正在阅读的期刊论文全文页保存为干净的 Markdown。**

[![License: MIT](https://img.shields.io/badge/License-MIT-black?style=flat-square)](./LICENSE)

[English](./README.en.md)

</div>

扩展中文名「期刊全文转 Markdown」。[arXiv to Markdown](https://github.com/Tendo33/arxiv-md) 的姊妹项目：在 PubMed Central、Nature、Frontiers 等期刊的文章页一键导出 Markdown，保留标题、作者、摘要、章节、公式（TeX）、表格、图注和参考文献脚注，适合放进 Obsidian、Zotero，或交给 AI 阅读。

## 支持的网站

| 网站 | 优先使用的结构化全文 | 兜底 |
| --- | --- | --- |
| PubMed Central（pmc.ncbi.nlm.nih.gov） | Europe PMC JATS（按 PMCID） | 当前页面 |
| Europe PMC（europepmc.org） | Europe PMC JATS（按 PMCID） | 当前页面（没有全文时只导出摘要，并标记 `abstract_only`） |
| PubMed（pubmed.ncbi.nlm.nih.gov） | 有 PMCID 且开放获取时取全文 | 题录 + 摘要 + MeSH，标记「仅摘要」 |
| Springer Link / BMC / SpringerOpen | Europe PMC JATS（按 DOI 查找，开放获取时） | 当前页面 |
| Nature / Scientific Reports | Europe PMC JATS（按 DOI） | 当前页面 |
| Frontiers | Frontiers 自己的 XML | Europe PMC JATS → 当前页面 |
| MDPI | Europe PMC JATS（按 DOI） | 当前页面 |
| PLOS | Europe PMC JATS（按 DOI） | 当前页面 |
| eLife | Europe PMC JATS（按 DOI） | 当前页面 |

只转换你本来就能看到的页面：不绕过付费墙，不批量抓取。订阅文章在你有权限时也能从当前页面导出。

## 功能

- **四个入口**：页面右下角的 **M↓ 悬浮按钮**（菜单：下载 .md、下载 ZIP、复制）、工具栏弹窗、右键菜单、快捷键 `Alt+Shift+J`（导出）。悬浮按钮可以用键盘操作、读屏可读，跟随系统深色模式，可在设置里或按钮菜单里隐藏。
- **输出**：YAML front matter（title、authors、journal、year、doi、pmid、pmcid、license、url、`source_route`、exported）；公式写成 `$…$` / `$$…$$`；没有合并单元格的表格写成 GFM 表格，有合并单元格的保留 HTML；正文引用变成 `[^n]` 脚注，参考文献带 DOI 链接；数据可用性、基金、利益冲突、致谢各自成节；补充材料列出文件名和链接。
- **下载 ZIP**：`article.md` + `images/`，正文里的图片链接改成包内路径。图片服务器不允许扩展下载的（例如 Springer 的图片 CDN）保留原网址，并提示打包了几张。
- **PDF 解析（可选，默认关闭）**：页面上没有可用全文时，可以用你自己的 Token 让 **PaddleOCR**（默认）或 **MinerU** 解析文章 PDF，结果下载为 ZIP。只有开放获取的 PDF 会直接发送；其他文章每次都会先弹出确认：「这篇不是开放获取文章，上传给 {后端} 可能违反出版商条款，是否继续？」，没有「总是允许」。Token 只存在本浏览器（`chrome.storage.local`）。
- **中英文界面**，跟随浏览器语言，也可在设置里切换。

## 隐私

打开弹窗、加载页面时不发任何请求。导出时才会向 Europe PMC 请求开放获取全文（只发 PMCID 或 DOI，不带 Cookie 和页面地址）。PDF 解析只有在你开启后、并且只发给你选的那一个服务。详见 [PRIVACY.md](./PRIVACY.md)，权限说明见 [docs/permissions.md](./docs/permissions.md)。

## 安装

- **Chrome / Edge**：在 [Releases](https://github.com/Tendo33/journal-md/releases) 下载 `journal-md-v<版本>-chrome.zip`，解压后在 `chrome://extensions`（Edge 为 `edge://extensions`）打开开发者模式，「加载已解压的扩展程序」选择解压出来的文件夹。
- **Firefox**（140 及以上）：同一页面下载 `journal-md-v<版本>-firefox.zip`；正式签名版本上架 AMO 后再更新这里。
- 商店上架（Chrome Web Store、Edge 加载项）准备中。

## 已知限制

- Springer Link / Nature 页面上的表格只有表题和「完整表格」链接（表格内容在单独页面）；能从 Europe PMC 取到 JATS 时表格是完整的。
- PLOS 的 JATS 下载链接会跳转到没有跨域许可的存储域名，所以 PLOS 走 Europe PMC 或页面；MDPI 的 XML 下载有人机验证，同样不用。
- eLife 页面会把较长的图注折叠成「see more」，只从页面导出时图注可能不完整（走 Europe PMC 时完整）。
- PDF 解析把 PDF 链接交给第三方服务自己下载；需要登录或订阅才能下载的 PDF 通常会失败。

## 开发

需要 Node 22（见 `.nvmrc`）。

```bash
npm ci
npm run lint && npm test          # 单元测试只用 tests/fixtures，不访问网络
npm run build                     # Chrome / Edge → dist/
npm run build:firefox             # Firefox → dist-firefox/
npm run verify:dist               # 权限白名单、gecko id、locales、无 source map / Key
npm run package                   # build/*.zip
```

端到端冒烟见 `scripts/e2e-smoke.js`（Playwright 装在仓库外，经 `E2E_PLAYWRIGHT_DIR` 传入）。PDF 解析内核来自 arxiv-md，见 `vendor/pdf-parse-core/README.md`。

发布：推送 `v*` 标签后，GitHub Actions 的 Release 工作流构建、校验并创建 Release（见 `.github/workflows/release.yml`）。

## License

[MIT](./LICENSE)
