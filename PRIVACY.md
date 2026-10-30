# Privacy Policy

**Last updated: 2026-10-30 (fix round 2: all permissions granted at install, no confirmations)** · applies to Journal to Markdown（期刊全文转 Markdown）1.0.0

## Overview

`Journal to Markdown` is a browser extension that turns the journal article you are reading (PubMed Central, Europe PMC, PubMed, Springer Link / BMC / SpringerOpen, Nature, Frontiers, MDPI, PLOS, eLife) into Markdown. The project runs no server of its own. Conversion happens inside your browser; the extension only contacts the services listed below, and only when you export, copy or parse an article.

## What the extension stores

### `chrome.storage.sync`

Settings only: interface language, file name template, whether to include images, whether to prefer structured full text, whether to show the in-page Markdown button, and which supported sites are switched on. If you use browser account sync, your browser vendor syncs these through your account.

### `chrome.storage.local` (never synced)

- **PDF parsing settings**: which service you chose (PaddleOCR or MinerU) and **the tokens you entered**. Tokens are stored only in this browser profile and are sent only to the service they belong to.
- **The last PDF parsing task**: service, article title and page address, state and progress, the job ID returned by the service, an error code if it failed, and the saved file name. It is overwritten by the next task.

Copying an article writes its Markdown to your clipboard. Downloads go to your browser's download folder.

## Network requests

Nothing is requested when a page loads or when you open the popup. The in-page button only reads the extension's own settings.

### When you export, copy or download a ZIP

| Where | When | What is sent |
| --- | --- | --- |
| `https://www.ebi.ac.uk/europepmc/` (Europe PMC, EMBL-EBI) | On PMC and Europe PMC article pages, and on PubMed pages that show a PMCID | The article's PMCID, to fetch its open-access full text (`fullTextXML`) |
| `https://www.ebi.ac.uk/europepmc/` | On Springer/BMC, Nature, Frontiers, MDPI, PLOS and eLife pages, when "Prefer structured full text" is on (default) | The article's DOI, to look up its PMCID; then the PMCID if the article is open access |
| `https://www.frontiersin.org/` | On Frontiers pages, when "Prefer structured full text" is on | A request for the article's own XML file, made from the page itself like any other request the page makes |
| `https://www.mdpi.com/` | On MDPI pages | One request for the article page you are viewing (same address), made from the page itself like a reload, because the site re-renders its formulas after loading; nothing else is sent |
| The sites hosting the article's images | Only for "Download ZIP" with images included | Requests for the images shown on the page, without cookies. Images on hosts the extension has access to (the supported sites and the two image servers below) may be fetched by the extension's background page when the image server does not allow it otherwise |
| `media.springernature.com`, PLOS's image storage (`corpus-prod.…r2.cloudflarestorage.com`) | Only for "Download ZIP" on Springer / BMC / Nature / PLOS articles | Requests for the article's images, without cookies. Access to these two hosts is granted when you install the extension; nothing is asked when you export. If an image still cannot be downloaded, the ZIP is saved anyway, that image keeps its web link in article.md, and a message names the host |

Requests to Europe PMC carry no cookies and no page address. When Europe PMC cannot be reached, is slow, or has no open-access copy, the extension uses the page you are viewing instead. Turning off "Prefer structured full text" stops all Europe PMC requests except the PubMed full-text lookup for articles that show a PMCID.

### PDF parsing (optional, used only when you set it up)

PDF parsing is used only after you choose a service in Settings and enter your own token for it, and then click "Parse PDF" in the popup. Without a token the button is not shown and nothing is sent. The extension contacts **only the service you chose** and never switches to another one on failure. Access to the services' hosts is granted when you install the extension; nothing is asked when you parse.

**No confirmation.** Clicking "Parse PDF" sends the request straight away, whatever the article's licence. The extension still notes internally whether an article looks open access (CC BY / CC0, or a fully open-access site without a stricter licence), but this never blocks or delays the request. Only send PDFs you are allowed to share with a third party; the publisher's terms may forbid uploading subscription articles. Only the popup can start PDF parsing; web pages cannot.

What is sent:

- **PaddleOCR (default)**, operated by Baidu (AI Studio): your access token, the model name and **the link to the PDF** are sent to `paddleocr.aistudio-app.com`. The extension does not upload the PDF file; the service downloads it from the link. The result (text and figure images) is downloaded from Baidu's storage domain `*.bj.bcebos.com`. To make AI Studio accept the request, the extension removes the `Origin` header on requests to `paddleocr.aistudio-app.com` only (a `declarativeNetRequest` rule).
- **MinerU**, operated by 上海人工智能创新中心（上海人工智能实验室）(Shanghai AI Laboratory, OpenDataLab): your token, **the link to the PDF**, and the model and language options are sent to `mineru.net`. The service downloads the PDF itself and returns a ZIP result on `cdn-mineru.openxlab.org.cn`, which your browser downloads.

A PDF that needs a login or a subscription usually cannot be downloaded by these services, so parsing fails rather than sending your session. These services are third parties and their own terms govern what you submit; neither publishes a specific retention period for files or results. See the [Baidu privacy policy (in Chinese)](https://www.baidu.com/duty/yinsiquan.html) and the [OpenDataLab privacy policy (in Chinese)](https://sso.openxlab.org.cn/protocol/privacy). Do not send PDFs you are not allowed to share with a third party.

## What the extension does not do

- No project server, no analytics, no tracking, no account.
- Its script runs only on the supported sites listed below and reads a page only when you export, copy or parse it (the in-page button only looks at the page address). It does not follow links to fetch paywalled content.
- It does not send your browsing history, cookies or page addresses to Europe PMC or to the PDF services.
- It does not include anyone's API keys; PDF parsing uses only the token you enter.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab`, `scripting` | Read the current tab's address when you click the toolbar icon, and inject the converter into an article tab that was open before the extension was installed |
| `storage` | Save settings, PDF tokens and the last PDF task (see above) |
| `downloads` | Save `.md`, `.zip` and PDF parsing results |
| `contextMenus` | "Export this page as Markdown" / "Copy this page as Markdown" on supported pages |
| `clipboardWrite` | Copy Markdown |
| `https://pmc.ncbi.nlm.nih.gov/*`, `https://pubmed.ncbi.nlm.nih.gov/*`, `https://europepmc.org/*`, `https://link.springer.com/*`, `https://*.biomedcentral.com/*`, `https://*.springeropen.com/*`, `https://www.nature.com/*`, `https://www.frontiersin.org/*`, `https://www.mdpi.com/*`, `https://journals.plos.org/*`, `https://elifesciences.org/*` | Run the converter on article pages of these sites (and fetch images from them for ZIP files) |
| `https://www.ebi.ac.uk/europepmc/*` | Europe PMC REST API (full text and DOI lookup), only on export |
| `https://paddleocr.aistudio-app.com/*`, `https://*.bj.bcebos.com/*` | PDF parsing with PaddleOCR. Contacted only when you click "Parse PDF" with PaddleOCR selected and a token entered |
| `https://mineru.net/*`, `https://cdn-mineru.openxlab.org.cn/*` | PDF parsing with MinerU. Contacted only when you click "Parse PDF" with MinerU selected and a token entered |
| `https://media.springernature.com/*` | Download the images of Springer Link / BMC / Nature articles into the ZIP (this image server does not allow web pages to download them). Contacted only for "Download ZIP" |
| `https://corpus-prod.f505aadad1e46610c8f8563037eb3c4b.r2.cloudflarestorage.com/*` | PLOS's image storage (every PLOS figure and formula image redirects to this one Cloudflare R2 bucket). Contacted only for "Download ZIP" on a PLOS article |
| `declarativeNetRequestWithHostAccess` | Remove the `Origin` header on the extension's own requests to `paddleocr.aistudio-app.com` only. The rule is present from install, but no request goes to that domain unless you parse a PDF with PaddleOCR |

All of these are granted when you install the extension, in both Chrome/Edge and Firefox. The extension declares no optional permissions and never asks for a permission while you use it.

In Firefox the extension declares two required data collection categories: `websiteContent` (as arXiv to Markdown, which shares the PDF parsing code: article content is read in your browser to build the Markdown and, when you parse a PDF, the article's PDF link is sent to the service you chose) and `authenticationInfo` (the PDF service token you enter is sent to that service with each parsing request). The token is your own credential; it is stored only in this browser and sent only to the service it belongs to.

## Your choices

- Turn off "Prefer structured full text", the in-page button or individual sites in Settings. To stop PDF parsing, delete your token.
- Delete a token in Settings; it is removed from the browser profile.
- Uninstall the extension to remove all of its local data.

## Open source

The source code is public: [https://github.com/Tendo33/journal-md](https://github.com/Tendo33/journal-md). The PDF parsing core is shared with [arXiv to Markdown](https://github.com/Tendo33/arxiv-md) (`vendor/pdf-parse-core`).

## Contact

For questions about privacy or data handling, open an issue in the repository.
