<div align="center">

# Journal to Markdown · 期刊全文转 Markdown

**把开放获取期刊论文的全文页保存为干净的 Markdown。**

![状态：开发中](https://img.shields.io/badge/状态-开发中-orange?style=flat-square)
[![License: MIT](https://img.shields.io/badge/License-MIT-black?style=flat-square)](./LICENSE)

[English](./README.en.md)

</div>

> **⚠️ 开发中**：本项目还没有可用版本，也没有上架 Chrome 应用商店。下面是计划内容，不是已有功能，细节可能调整。

## 这是什么

[arXiv to Markdown](https://github.com/Tendo33/arxiv-md) 的姊妹项目，面向 PubMed Central、Nature、Frontiers 等期刊网站：在论文全文页一键导出 Markdown，保留标题、作者、摘要、章节、公式、图表说明和参考文献，适合放进 Obsidian、Zotero 或交给 AI 阅读。

## 计划的转换方式

1. **L1 结构化全文（JATS XML）**：出版方或 PMC 提供 JATS 时优先使用，结构最完整。
2. **L2 网页适配器**：没有 JATS 时，按站点读取你浏览器里已显示的全文页面。
3. **L3 PDF 解析（可选）**：前两层都不行时才考虑，需要你自己的解析服务 Token，默认不开启。

## 路线图

| 阶段 | 站点 |
| --- | --- |
| P0（首个版本） | PubMed Central (PMC)、PubMed、Europe PMC、BMC / SpringerOpen、Nature / Scientific Reports、Frontiers、MDPI、PLOS、eLife |
| P1 | bioRxiv / medRxiv、ScienceDirect、Cell Press、Wiley、Oxford Academic、Taylor & Francis |
| P2 | SciEngine、中文期刊、PDF 兜底 |

## 原则

- **默认只解析开放获取 PDF**。非开放获取的 PDF 会先提示，由你确认后才处理。
- 不绕过付费墙，只处理你本来就有权限看到的内容。
- 不内置任何 API Key；需要外部服务时用你自己的 Token。
- 不做翻译。
- 不依赖本地服务（localhost）。

## 浏览器

计划先支持 Chrome，Edge / Firefox 计划中。

## License

[MIT](./LICENSE)
