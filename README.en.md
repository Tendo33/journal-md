<div align="center">

# Journal to Markdown

**Save open-access journal articles as clean Markdown.**

![Status: in development](https://img.shields.io/badge/status-in%20development-orange?style=flat-square)
[![License: MIT](https://img.shields.io/badge/License-MIT-black?style=flat-square)](./LICENSE)

[中文说明](./README.md)

</div>

> **⚠️ In development**: there is no usable release yet and it is not on the Chrome Web Store. Everything below is planned, not shipped, and may change.

## What it is

A sibling of [arXiv to Markdown](https://github.com/Tendo33/arxiv-md) for journal sites such as PubMed Central, Nature and Frontiers: export a full-text article page to Markdown with title, authors, abstract, sections, math, figure captions and references, ready for Obsidian, Zotero or an AI assistant.

## Planned conversion

1. **L1 structured full text (JATS XML)**: used first when the publisher or PMC provides it.
2. **L2 page adapters**: per-site readers for the full-text page already shown in your browser.
3. **L3 PDF parsing (optional)**: last resort, off by default, using your own parsing-service token.

## Roadmap

| Phase | Sites |
| --- | --- |
| P0 (first release) | PubMed Central (PMC), PubMed, Europe PMC, BMC / SpringerOpen, Nature / Scientific Reports, Frontiers, MDPI, PLOS, eLife |
| P1 | bioRxiv / medRxiv, ScienceDirect, Cell Press, Wiley, Oxford Academic, Taylor & Francis |
| P2 | SciEngine, Chinese journals, PDF fallback |

## Principles

- **Only open-access PDFs are parsed by default.** For anything else you get a prompt and must confirm.
- No paywall bypass; only content you can already access.
- No built-in API keys; external services use your own token.
- No translation.
- No localhost services.

## Browsers

Chrome first; Edge / Firefox planned.

## License

[MIT](./LICENSE)
