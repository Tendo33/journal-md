# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.0] - 2026-11-13

### Added
- Elsevier full-text API: with your own Elsevier API key (Settings → Publisher full-text APIs, with a key test), an Elsevier article page that shows only the abstract — ScienceDirect, Cell, or any `10.1016/` article opened on PubMed or Europe PMC — gets its structured full text from api.elsevier.com, which grants it when your network is subscribed. New parser for Elsevier's XML (sections, highlights, MathML, CALS tables, figures with ScienceDirect images, structured references); `source_route: xml-elsevier`. Tried before free versions. ScienceDirect becomes a supported site (citation and abstract from the page, body from the API). New host permissions: `www.sciencedirect.com`, `api.elsevier.com`.
- "Quick PDF parse" in the popup: downloads the article PDF on the page (with your sign-in) and converts its text layer to Markdown with pdf.js — two-column reading order, running headers and page numbers removed, headings by size and numbering, hyphenation joined, captions and references. Seconds instead of minutes, no key, nothing sent to any service (`source_route: pdf-text`). `pdf-fast.js` (pdf.js, Apache-2.0) is injected only when used. Checked on a single-column PLOS article and a two-column conference paper.
- Oxford Academic figures are packed into ZIP exports: their images come from `oup.silverchair-cdn.com`, which does not allow web pages to download them, so the background fetches them (new host permission).
- Elsevier XML: text before an inline display formula or a list inside a paragraph is no longer dropped.
- New sites: Wiley Online Library (and society journals on `*.onlinelibrary.wiley.com`), Cell Press, Oxford Academic and Taylor & Francis Online. Like the other publishers they try Europe PMC first and otherwise export the page, so a subscription article you have access to exports in full. Adapters written against the live pages (2026-11-05); fixtures keep only the page structure with placeholder text.
- When a page only shows the abstract, look up a legal free version by DOI: Unpaywall (PMC copies, repositories, arXiv) and bioRxiv / medRxiv (preprint of the published article). PMC copies and bioRxiv / medRxiv preprints are exported as structured full text, with the journal page's citation and a note naming the version (`fulltext_source`, `fulltext_version` in the front matter, `source_route: jats-preprint` for preprints). Other free versions are listed in the popup; repository PDFs can be parsed with one click, arXiv preprints link to arXiv to Markdown. New setting "Look for a free version when only the abstract is shown" (on by default). New host permissions: `api.unpaywall.org`, `api.biorxiv.org`, `www.biorxiv.org`, `www.medrxiv.org`.

### Changed
- Refreshed UI, same visual language as arXiv to Markdown and Zhihu to Markdown: popup is a single white surface with a tinted current-article panel and a hairline task container; secondary buttons are borderless light fills, the primary button is flat, and switches, segmented controls and fields share 8–14px radii. Settings groups are hairline containers and radio cards show selection with a single tinted outline. In-page FAB menu and toast use the same neutral tokens and softer popover. Light and dark both re-checked for text and control contrast.
- Firefox packages are rejected by `verify:dist` when they still contain `background.service_worker`. Chrome packages already omit `browser_specific_settings`. Same split as arXiv to Markdown and Zhihu to Markdown.
- Packaging and release now match arXiv to Markdown and Zhihu to Markdown: `npm run package` builds both browsers, verifies each dist, and writes `build/journal-md-v<version>-chrome.zip`, `-firefox.zip`, and `SHA256SUMS.txt`. CI and the tag-only Release workflow use the same steps.
- A page that only shows the abstract (usually an article you don't have access to) no longer produces a file silently. The popup says why and links to the full text and to PDF parsing; "Export abstract anyway" still exports the abstract (marked `abstract_only`). The in-page button and shortcut show the same message.
- PDF parsing with PaddleOCR downloads the article PDF in your browser first and uploads the file, so subscription PDFs you have access to (campus network, institutional sign-in) can be parsed; the service could not download them from the link. If the download fails, the link is sent as before. MinerU is unchanged (link only).

## [1.1.1] - 2026-11-04

### Changed
- Store short description (`extDescription`) no longer lists site names; the first Chrome Web Store submission was rejected for keyword spam. The detailed store description drops the site list and third-party product names as well; the full list of supported sites stays in the README.

## [1.1.0] - 2026-11-03

### Changed
- "Token" is now "Key" / "API key" everywhere, the same word arXiv to Markdown uses.
- Options: the language picker sits in a "General" card as a row like arXiv to Markdown's; the six planned sites are one line under the site list instead of six rows; the PDF section is titled "PDF parsing".
- Popup: the full-text row reads "Open-access version first · This page ✓" instead of the internal route names.
- Visual: solid primary button, lighter off-state switches, segmented controls with a raised selected item, 13px help text.
- Chinese extension name unified with the series: 「Journal to Markdown」 in every language (was 「期刊全文转 Markdown」), like arXiv to Markdown and Zhihu to Markdown.
- Options page uses the shared "to Markdown" series shell (same as the other two): icon, product name, "Settings" and a version chip in the header; footer with GitHub, issue, privacy and changelog links and the other extensions in the series. New `series.css`, byte-identical across the three repositories.
- Popup: unsupported pages show the series empty state (icon, title, where to go) and keep the buttons in place, disabled; the footer shows the export shortcut as a key and the version, like the other two. The export button has the download icon.
- Store short description rewritten; new `docs/store-listing.md`.
- README restructured to the series layout (install, usage, settings, permissions, privacy, series), with a settings screenshot.

## [1.0.0] - 2026-11-01

First public release.

### Added
- Export to Markdown from PubMed Central, Europe PMC, PubMed, Springer Link / BMC / SpringerOpen, Nature / Scientific Reports, Frontiers, MDPI, PLOS and eLife article pages.
- Structured full text first: Europe PMC JATS (by PMCID, or looked up by DOI on publisher pages, open access only) and Frontiers' own XML; the page itself as fallback. `source_route` in the front matter records which one was used.
- Markdown output with YAML front matter, TeX math, GFM or HTML tables, figure captions, footnoted references with DOI links, back-matter sections and supplementary file links; PubMed and Europe PMC pages without full text are exported as abstract only and marked so.
- In-page M↓ floating button with a menu (Download .md, Download ZIP, Copy, Hide), keyboard and screen-reader support and dark mode; a setting to hide it.
- Download ZIP: `article.md` plus `images/`, links rewritten to the local files; Springer / BMC / Nature and PLOS images are fetched through their image servers (granted at install); images that cannot be downloaded keep their web links and a notice names the host.
- Optional PDF parsing with PaddleOCR (default) or MinerU using your own token, built on the pdf-parse-core shared with arXiv to Markdown. The popup offers it once the selected service has a token and sends the PDF link directly, with no confirmation.
- All permissions are granted at install (Chrome / Edge and Firefox alike); the extension declares no optional permissions and never asks for one while in use. Firefox data collection: `websiteContent`, `authenticationInfo`.
- Toolbar popup, right-click menu, `Alt+Shift+J` shortcut, options page, English and Chinese interface (extension name 「期刊全文转 Markdown」 in Chinese).
- Chrome / Edge and Firefox (140+) builds; release workflow on tag push.
- Icon: an open journal with an M↓ mark on teal (#0f766e), with a hand-tuned 16px toolbar version.

### Fixed (since the M1 preview)
- Nature JATS: "is available for this paper at 10.1038/…" sentences now keep their subject and link the DOI; a supplementary file listed twice appears once (QA JM-09).
- Europe PMC pages without full text no longer include site chrome (author information, full-text links, share panel, affiliation numbers, a second abstract) and are marked `abstract_only` (QA JM-10).
- Review nits N-A..N-E: identity check tests, no PMCID back-fill from the request, parentheses in image links, stale single-page DOM detection, permission notes; background messages are accepted only from extension pages and supported-site content scripts.
- Options title stays on one line at 320px; the "Structured full text: checked on export" hint is shown in the muted colour.
- ZIP: images on publisher pages come from the publisher's own image URLs (PMC as fallback); the message names the site that refused images (QA JM-M2-01).
- MDPI: reliable export after the page re-renders (formulas read from the page's server HTML), figure images kept; every failed export shows a message (QA JM-M2-02, M2-03).
- PLOS JATS: figures no longer point at formula images from their captions (QA JM-M2-04); placeholder "undefined" author names dropped (M2-06); JM-09 also fixed on the PMC page route.
- Licence detection: read only from the article's licence box, `<head>` `rel="license"` or licence metadata (not reference-list links); any restrictive entry (NC / ND / SA) makes the article not open access (review M-1, N7, N1, N2). It no longer gates PDF parsing.
- ZIP: Springer / BMC / Nature (media.springernature.com) and PLOS (its image storage) images are packed; the earlier optional-permission prompt was removed in favour of install-time access.
- The floating button and its in-page messages follow the language chosen in Settings, and switch in place when it changes.
- Options: the "Get a token" link is at least 24×24 px (WCAG 2.5.8).
- Brand colour is teal #0f766e (matching the icon) in light and dark mode; the floating button stays clear of cookie banners (QA JM-M2-07).

[1.0.0]: https://github.com/Tendo33/journal-md/releases/tag/v1.0.0
