# Chrome 应用商店上架文案

「to Markdown」系列三款插件（arXiv to Markdown / Zhihu to Markdown / Journal to Markdown）用同一套结构写商店文案：名称 → 简短说明 → 详细说明（一句话、能做什么、怎么用、隐私、同系列）。改动时三份一起改。

- 名称、简短说明和扩展包里的 `src/_locales/*/messages.json`（`extDescription`）保持一致，简短说明不超过 132 个字符（`npm run verify:dist` 会检查）。
- 详细说明只写扩展实际做到的事；隐私段与 [PRIVACY.md](../PRIVACY.md) 一致。
- 不在简短说明、详细说明里罗列网站、出版商或其他产品的名字（2026-11-04 首次提交因「关键字垃圾内容」被拒，违规参考 ID Yellow Argon）。只保留说清楚功能或隐私必需的名字，完整站点列表放 README。
- 尚未上架；Edge 加载项、Firefox AMO 可直接复用这份文案。

## 基本信息

| 项 | 内容 |
| --- | --- |
| 名称 | Journal to Markdown（所有语言相同，不翻译） |
| 类别 | 工具（Tools） |
| 语言 | 中文（简体）、English |
| 主页 | https://github.com/Tendo33/journal-md |
| 支持 | https://github.com/Tendo33/journal-md/issues |
| 隐私政策 | https://github.com/Tendo33/journal-md/blob/main/PRIVACY.md |

## 简短说明

**中文**

> 一键把正在阅读的期刊论文全文存为干净的 Markdown：公式、表格、图注和参考文献原样保留，可连同图片打包下载。

**English**

> Save the journal article you're reading as clean Markdown: math, tables, figure captions and references intact, images in a ZIP.

## 详细说明（中文）

```text
把正在阅读的期刊论文全文一键存为干净的 Markdown，方便放进笔记软件、文献管理工具，或交给 AI 阅读。

适用范围
PubMed Central、PubMed 以及多家主流出版商的开放获取文章页面。完整的网站列表见项目主页。

能做什么
• 结构化全文优先：开放获取文章优先取出版方提供的结构化全文（JATS XML），取不到时转换当前页面。
• 内容完整：标题、作者、摘要、章节、公式（$…$ / $$…$$）、表格、图注、参考文献脚注，数据可用性、基金、利益冲突各自成节。
• 元数据：YAML 头信息包含标题、作者、期刊、年份、DOI、PMID、PMCID 和许可协议。
• 下载 ZIP：article.md + images/，正文图片链接改成包内路径。
• 文件名模板：按 {title} {year} {journal} {doi} 等变量命名。
• PDF 解析（可选）：页面没有可用全文时，用你自己的 OCR 服务 Key 解析文章 PDF。
• 四个入口：文章页右下角 M↓ 按钮、工具栏弹窗、右键菜单、快捷键 Alt+Shift+J。
• 中英文界面，跟随系统浅色 / 深色。

怎么用
1. 打开支持网站上的一篇文章。
2. 点右下角的 M↓ 按钮，或点工具栏图标后选「导出 Markdown」。
3. 需要图片一起保存时选「下载 ZIP」。

隐私
• 没有自己的服务器，不收集数据，没有统计或埋点。
• 打开弹窗、加载页面时不发任何请求；只有在你导出时才会向公开的开放获取全文库（Europe PMC）请求全文，只发 PMCID 或 DOI，不带 Cookie 和页面地址。
• PDF 解析只在你填了 Key 并点击解析时发生，只发给你选的那一个服务。Key 只保存在本浏览器。
• 只转换你本来就能看到的页面：不绕过付费墙，不批量抓取。

同系列
• arXiv to Markdown：arXiv 论文存为 Markdown。
• Zhihu to Markdown：知乎内容存为 Markdown。

需要 Chrome 121 或更高版本。

开源（MIT）：github.com/Tendo33/journal-md
```

## 详细说明（English）

```text
Save the journal article you're reading as clean Markdown in one click, ready for your notes app, reference manager or AI assistant.

Where it works
Article pages on PubMed Central, PubMed and several major open-access publishers. The full list of sites is on the project homepage.

What it does
• Structured full text first: for open-access articles it uses the structured full text (JATS XML) made available by the publisher or archive, and converts the current page when that isn't available.
• Complete content: title, authors, abstract, sections, math ($…$ / $$…$$), tables, figure captions and reference footnotes; data availability, funding and competing interests each get their own section.
• Metadata: YAML front matter with title, authors, journal, year, DOI, PMID, PMCID and license.
• Download as ZIP: article.md + images/, with image links rewritten to the bundled files.
• Filename template: name files with {title}, {year}, {journal}, {doi} and more.
• PDF parsing (optional): when the page has no usable full text, parse the article PDF with your own OCR service key.
• Four ways in: the M↓ button on article pages, the toolbar popup, the right-click menu, and Alt+Shift+J.
• English and Chinese interface; follows your light or dark theme.

How to use
1. Open an article on a supported site.
2. Click the M↓ button in the corner, or click the toolbar icon and choose Export Markdown.
3. Choose Download ZIP to keep the images too.

Privacy
• No servers of our own, no data collection, no analytics.
• Opening the popup or loading a page sends nothing. Only when you export does the extension ask a public open-access archive (Europe PMC) for the full text, sending just the PMCID or DOI — never cookies or the page address.
• PDF parsing happens only after you add a key and click Parse, and goes only to the provider you chose. Keys stay in this browser.
• Only pages you can already read are converted: no paywall bypassing, no bulk scraping.

Also in the series
• arXiv to Markdown — save arXiv papers as Markdown.
• Zhihu to Markdown — save Zhihu content as Markdown.

Requires Chrome 121 or later.

Open source (MIT): github.com/Tendo33/journal-md
```

## 图片素材（中文，可直接上传）

全部由真实扩展界面截取后合成，三款插件同一版式。生成方式：无界面 Chromium 加载 `dist/`，截取弹窗、设置页和页面内元素，导出的 Markdown 来自真实导出结果。

| 文件 | 尺寸 | 内容 |
| --- | --- | --- |
| `docs/store/screenshot-1.png` | 1280×800 | 一键把期刊论文全文存为 Markdown（PMC 文章页 + 弹窗） |
| `docs/store/screenshot-2.png` | 1280×800 | 公式、表格、参考文献原样保留（导出的 Markdown） |
| `docs/store/screenshot-3.png` | 1280×800 | 文章页右下角的 M↓ 按钮（菜单） |
| `docs/store/screenshot-4.png` | 1280×800 | 文件名、站点、PDF 解析都能设置（设置页） |
| `docs/store/screenshot-5.png` | 1280×800 | 浅色、深色都顺眼（深色模式） |
| `docs/store/promo-small-440x280.png` | 440×280 | 小型宣传图块（必填） |
| `docs/store/promo-marquee-1400x560.png` | 1400×560 | 顶部宣传图块（可选） |
| `docs/store/description.zh.txt` | — | 中文详细说明，粘贴到「说明」 |
| `docs/store/description.en.txt` | — | English detailed description |

## 单一用途说明

> 把用户正在阅读的期刊论文页面转换为 Markdown（或含图片的 ZIP），下载到本地或复制到剪贴板。

Converts the journal article page the user is reading into Markdown (or a ZIP with images), saved locally or copied to the clipboard.

## 权限理由

各权限的用途见 [docs/permissions.md](./permissions.md)。提交审核时按该文档逐项填写。
