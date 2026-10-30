# 方案：在 M2+ 复用 arxiv-md 的 pdf-parse-core（L3 PDF 兜底）

> 状态：**提案，未实施**。M1 不含任何 PDF 代码、PDF 后端域名或相关权限（PRD §2.7 把 PDF 兜底列为 P2）。
> 涉及新权限和向第三方发送 PDF，实施前需要 Simon 确认（PRD §2.11、§4 第 2、4 条）。

## 1. 复用什么

- 来源：`Tendo33/arxiv-md` 仓库 `packages/pdf-parse-core/`，**固定在 commit `b2dc3a0`**（`CORE_VERSION = '0.1.0'`）。
- 内容：provider 接口（`provider.js` / `registry.js`）、PaddleOCR 与 MinerU provider、错误分类（`errors.js`）、
  HTTP 超时与 keep-alive（`http.js` / `keepalive.js`）、Markdown 规整（`normalize/*`：公式、表格、图片、frontmatter）、
  输出（`output/save.js` 的 data URL / blob URL 下载适配、`output/zip.js`）、按需权限（`permissions.js`）。
- 该包本身已按「core 不反向依赖插件代码」设计（arxiv-md `.eslintrc.json` 的 `no-restricted-imports` 规则），
  `package.json` 的描述就写明是「shared by arxiv-md and journal-md」。

## 2. 怎么引入（vendor，而不是 npm 依赖）

1. 把 `b2dc3a0` 时的 `packages/pdf-parse-core/` 原样复制到 journal-md 的 `packages/pdf-parse-core/`，
   根 `package.json` 加 `"workspaces": ["packages/*"]`，webpack / jest 加 `@pdf-core/*` 别名（与 arxiv-md 相同）。
2. 在包内加 `VENDORED.md`：记录来源仓库、commit、复制日期，以及 journal-md 对它的任何本地改动（原则上为零）。
3. 照搬 arxiv-md 的 ESLint override，禁止 `packages/pdf-parse-core/**` import `src/**`。
4. 照搬 `tests/pdf-core` 的单测（fixture 化，无网络），CI 增加 `test:core-coverage`（行覆盖 ≥85%，与 arxiv-md 一致）。
5. 升级流程：只能整包对齐到 arxiv-md 的某个新 commit，PR 里附 `git diff b2dc3a0..<new> -- packages/pdf-parse-core`。
   长期是否抽成独立的 `paper-core` 仓库，等 PRD §2.4 / §4 第 3 条由 Simon 决定。

## 3. journal-md 侧的规则

| 项 | 规则 |
|---|---|
| 默认后端 | **PaddleOCR**（星河 API，用户自己填 Token）。MinerU 作为可选后端。失败时**不**自动切到付费后端（PRD §2.11）。 |
| 开关 | 默认关闭；设置页里显式开启后，popup 才出现「解析 PDF」入口。 |
| 上传前确认 | **开放获取（OA）的 PDF 直接上传，不弹确认**；非 OA 或拿不准的，每次都先弹窗：「这篇不是开放获取文章，上传给 {后端} 可能违反出版商条款，是否继续？」，本轮不提供「总是允许」。 |
| OA 判定 | 只认确定的信号：Europe PMC JATS / 页面上的 CC 许可（`license` 字段为 `CC-*` / `CC0-*`），或 Europe PMC `isOpenAccess=Y`。缺字段、解析失败一律按非 OA（与 arxiv-md `src/background/oa-gate.js`「拿不准就按非 OA」一致）。 |
| 凭据 | Token / API Key **只存 `chrome.storage.local`**（不用 `storage.sync`，避免同步到其他设备），不写日志、不进导出文件、不进错误上报；`scripts/check-no-keys.js` 在 CI 扫描源码和产物。 |
| 权限 | PDF 后端域名全部走 `optional_host_permissions`，在设置页的用户手势里申请（`permissions.js` 的 `requestProviderPermission`），可撤销。PaddleOCR：`https://paddleocr.aistudio-app.com/*`、结果域名 `https://*.bj.bcebos.com/*`（待 QA 实测）。MinerU 在 journal-md 里也走 optional（PRD §2.6，与 arxiv-md 的安装时权限不同）。**不申请 localhost。** |
| PDF 来源 | 只处理用户当前打开、本来就有权限阅读的文章的 PDF；P0 站点的 PDF 在已授权域名上，由后台下载后 multipart 上传（PaddleOCR 拒收部分外链，见 arxiv-md `providers/paddleocr.js`）。上限 50 MB。 |
| 输出 | provider 返回的 Markdown 经 `normalize` 规整后，用 journal-md 的 frontmatter（PRD §2.3）覆盖；`source_route` 记为 `pdf-paddleocr` / `pdf-mineru`。页面上已有的元数据（DOI、PMCID、许可证）优先于 PDF 里识别出的。 |

## 4. 需要新增的东西（M2+ 工作项，估计）

| 工作项 | 估计 |
|---|---|
| vendor + workspace + 别名 + lint 规则 + 移植单测 | 0.5 天 |
| 设置页：后端选择（自绘分段控件，不用原生 select）、Token 输入与测试连接、授权 / 撤销 | 1 天 |
| OA 判定 + 非 OA 确认弹窗（含 a11y、i18n） | 0.5–1 天 |
| popup 入口、异步任务进度（≤3s 提示已提交，≥10s 可取消）、结果下载 | 1–1.5 天 |
| frontmatter 合并、`source_route`、失败原因文案 | 0.5 天 |
| PRIVACY.md 更新（向第三方发送 PDF 的说明，参考 `pdf-parser-privacy-draft.md`） | 0.5 天 |

## 5. 风险

- 星河 API 从海外上传慢（arxiv-md 实测 2.2 MB 用了 137 s），国内外速度差异大，需要进度和取消。
- `*.bj.bcebos.com` 是宽泛的通配域名，商店审核可能追问用途；需要在商店页和 PRIVACY 里逐条说明。
- vendor 之后两边容易漂移：升级必须整包对齐、附 diff，不在 journal-md 里单独打补丁。
