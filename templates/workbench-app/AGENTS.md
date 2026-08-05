# AGENTS.md(应用仓库)

本仓库是基于 Atrium 框架的工作台应用仓库。

- 框架与模块契约见 Atrium 仓库的 `AGENTS.md` 与 `docs/PRD.md`;
- 本仓库**不得修改或复制 Atrium 源码**;通用缺口先修 Atrium 再升级依赖;
- 部署信息(域名、数据库路径、密钥、备份位置)一律经环境变量注入,
  **禁止**写入 `config/application.ts` 或任何源码;
- 应用专有模块放在 `modules/`,遵守 Atrium 模块契约(manifest / shared / server /
  web / agent / offline / migrations);
- 依赖 `@atrium/*` 必须锁定精确版本(见 `docs/versioning.md`),升级由本仓库显式发起;
- 客户端(web/desktop/mcp)不得执行 Git 操作或保存 Git 凭证(Atrium §19.2)。
