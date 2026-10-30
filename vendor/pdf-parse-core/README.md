# pdf-parse-core（vendored）

PDF 解析内核（PaddleOCR / MinerU 两个 provider、统一错误码、输出整理、store-only ZIP、按需权限），
**原样复制**自 arxiv-md：

- 仓库：https://github.com/Tendo33/arxiv-md（MIT，作者同为 SimonSun）
- 来源提交：`b2dc3a0992c18b6d9f60b4c0169e2a5864ac2278`（`b2dc3a0`，2026-10-29）
- 路径：`packages/pdf-parse-core/`
- 取法：`git -C ../arxiv-md archive b2dc3a0 packages/pdf-parse-core | tar -x`
- 许可：MIT，版权行「Copyright (c) 2025 SimonSun」。上游许可文件在 arxiv-md 仓库根目录（不在包目录里），
  原样复制为本目录的 `LICENSE`（`git -C ../arxiv-md show b2dc3a0:LICENSE`；审查 N5）

规则：

- `src/` 下的文件不在本仓库修改。要改先改 arxiv-md，再按新的提交号重新复制，并更新上面的来源提交。
- journal-md 自己的差异放在插件代码里（`src/pdf/`），例如：MinerU 在 journal-md 里走可选权限
  （PRD §2.6：PDF 兜底是 P2，后端域名都是 optional），所以 `src/pdf/providers.js` 用
  `permissionMode: 'optional'` 重新定义了 MinerU provider，内核里的 `permissionMode: 'install'` 不变。
- 内核不能 import 插件代码（`.eslintrc.json` 的 `no-restricted-imports`，与 arxiv-md 相同）。
- 插件通过 webpack / jest 别名 `@pdf-core/*` 引用 `src/`。

上游 README 原文：

> arxiv-md 内的 npm workspace 包（Round 4 方案 B）。插件通过 `@pdf-core/*` 别名引用 `src/`。
> 规则：core 不能 import 插件代码（`@core`、`@utils`、`@config`、`@ui`、`@background`、`@/`、`src/`），由 eslint `no-restricted-imports` 保证。
