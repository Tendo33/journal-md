# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-30

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
- Options title stays on one line at 320px; the "JATS: checked on export" hint is shown in the muted colour.
- ZIP: images on publisher pages come from the publisher's own image URLs (PMC as fallback); the message names the site that refused images (QA JM-M2-01).
- MDPI: reliable export after the page re-renders (formulas read from the page's server HTML), figure images kept; every failed export shows a message (QA JM-M2-02, M2-03).
- PLOS JATS: figures no longer point at formula images from their captions (QA JM-M2-04); placeholder "undefined" author names dropped (M2-06); JM-09 also fixed on the PMC page route.
- Licence detection: read only from the article's licence box, `<head>` `rel="license"` or licence metadata (not reference-list links); any restrictive entry (NC / ND / SA) makes the article not open access (review M-1, N7, N1, N2). It no longer gates PDF parsing.
- ZIP: Springer / BMC / Nature (media.springernature.com) and PLOS (its image storage) images are packed; the earlier optional-permission prompt was removed in favour of install-time access.
- The floating button and its in-page messages follow the language chosen in Settings, and switch in place when it changes.
- Options: the "Get a token" link is at least 24×24 px (WCAG 2.5.8).
- Brand colour is teal #0f766e (matching the icon) in light and dark mode; the floating button stays clear of cookie banners (QA JM-M2-07).

[1.0.0]: https://github.com/Tendo33/journal-md/releases/tag/v1.0.0
