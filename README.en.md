<div align="center">

# Journal to Markdown

**Save the journal article you are reading as clean Markdown.**

[![License: MIT](https://img.shields.io/badge/License-MIT-black?style=flat-square)](./LICENSE)

[中文说明](./README.md)

</div>

A sibling of [arXiv to Markdown](https://github.com/Tendo33/arxiv-md) for journal sites: export a full-text article page from PubMed Central, Nature, Frontiers and others to Markdown with title, authors, abstract, sections, math (TeX), tables, figure captions and footnoted references — ready for Obsidian, Zotero or an AI assistant.

## Supported sites

| Site | Structured full text tried first | Fallback |
| --- | --- | --- |
| PubMed Central (pmc.ncbi.nlm.nih.gov) | Europe PMC JATS (by PMCID) | the page |
| Europe PMC (europepmc.org) | Europe PMC JATS (by PMCID) | the page (abstract only, marked `abstract_only`, when there is no full text) |
| PubMed (pubmed.ncbi.nlm.nih.gov) | full text when the article has an open-access PMCID | citation + abstract + MeSH, marked "Abstract only" |
| Springer Link / BMC / SpringerOpen | Europe PMC JATS (looked up by DOI, open access only) | the page |
| Nature / Scientific Reports | Europe PMC JATS (by DOI) | the page |
| Frontiers | Frontiers' own XML | Europe PMC JATS → the page |
| MDPI | Europe PMC JATS (by DOI) | the page |
| PLOS | Europe PMC JATS (by DOI) | the page |
| eLife | Europe PMC JATS (by DOI) | the page |

It converts only pages you can already read: no paywall bypassing, no bulk crawling. Subscription articles you have access to can be exported from the page.

## Features

- **Four ways in**: the **M↓ button** at the bottom right of article pages (menu: Download .md, Download ZIP, Copy), the toolbar popup, the right-click menu, and `Alt+Shift+J` (export). The button works with the keyboard and screen readers, follows dark mode, and can be hidden from its menu or in Settings.
- **Output**: YAML front matter (title, authors, journal, year, doi, pmid, pmcid, license, url, `source_route`, exported); math as `$…$` / `$$…$$`; simple tables as GFM, tables with merged cells kept as HTML; in-text citations as `[^n]` footnotes with DOI links; data availability, funding, competing interests and acknowledgements as their own sections; supplementary files listed with links.
- **Download ZIP**: `article.md` + `images/`, with image links rewritten to the local files. Images whose server does not let the extension download them (for example Springer's image CDN) keep their web link, and the result says how many were packed.
- **PDF parsing (optional, off by default)**: when a page has no usable full text, the article PDF can be parsed by **PaddleOCR** (default) or **MinerU** with your own token; the result downloads as a ZIP. Only PDFs under CC BY / CC0 (or on a fully open-access site whose page states no stricter licence), hosted on the article's own site, are sent without asking; CC BY-NC / ND / SA and anything uncertain get the popup question every time ("This article is not open access. Uploading it to {service} may violate the publisher's terms. Continue?"), with no "always allow". Tokens stay in this browser (`chrome.storage.local`).
- **English and Chinese interface**, following the browser language or set in Settings.

## Privacy

Nothing is requested when a page loads or the popup opens. On export the extension asks Europe PMC for open-access full text, sending only a PMCID or DOI (no cookies, no page address). PDF parsing contacts only the one service you turned on. See [PRIVACY.md](./PRIVACY.md) and [docs/permissions.md](./docs/permissions.md).

## Install

- **Chrome / Edge**: download `journal-md-v<version>-chrome.zip` from [Releases](https://github.com/Tendo33/journal-md/releases), unzip it, enable developer mode in `chrome://extensions` (`edge://extensions`) and choose "Load unpacked".
- **Firefox** (140+): download `journal-md-v<version>-firefox.zip` from the same page; this section will point to AMO once the signed add-on is listed.
- Chrome Web Store and Edge Add-ons listings are in preparation.

## Known limitations

- On Springer Link / Nature pages tables show only their caption and a "full table" link (the table lives on a separate page); with Europe PMC JATS the tables are complete.
- PLOS's JATS download redirects to a storage host without CORS, and MDPI's XML download sits behind a bot check, so those sites use Europe PMC or the page.
- eLife folds long figure captions behind "see more"; a page-only export may carry the shortened caption (Europe PMC JATS has the full one).
- PDF parsing gives the PDF link to the third-party service, which downloads it itself; PDFs that need a login or subscription usually fail.

## Development

Node 22 (see `.nvmrc`).

```bash
npm ci
npm run lint && npm test          # unit tests use tests/fixtures only, no network
npm run build                     # Chrome / Edge → dist/
npm run build:firefox             # Firefox → dist-firefox/
npm run verify:dist               # permission allowlist, gecko id, locales, no source maps / keys
npm run package                   # build/*.zip
```

End-to-end smoke test: `scripts/e2e-smoke.js` (Playwright is installed outside the repo and passed in through `E2E_PLAYWRIGHT_DIR`). The PDF parsing core comes from arxiv-md, see `vendor/pdf-parse-core/README.md`.

Releases: pushing a `v*` tag runs the Release workflow, which builds, verifies and creates the GitHub Release (`.github/workflows/release.yml`).

## License

[MIT](./LICENSE)
