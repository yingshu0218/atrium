# Workbench App Template(Atrium 应用模板)

本模板是**独立应用仓库**的最小结构(AGENTS.md §18)。复制本目录为一个新仓库,
按步骤替换占位内容后,即可基于 Atrium 框架组装一个工作台应用(如个人工作台、家庭工作台)。

## 使用步骤

1. 复制本目录到新仓库(保留目录结构,`git init` 开始版本管理);
2. 编辑 `config/application.ts` 的应用品牌与模块组合;
3. 在根目录 `pnpm install`(依赖 `@atrium/*` 版本:发布前可使用 workspace/本地路径,
   发布后锁定精确版本,见 `docs/versioning.md`);
4. 复制 `.env.example` 为 `.env` 并填写部署配置(密码、数据库路径、cookie secure 等);
5. 在 `apps/web` 构建前端,`apps/server` 启动服务端,`apps/mcp` 启动 Agent 通道;
6. 把应用专有模块放入 `modules/`(参考 Atrium 的 `modules/notes` 结构);
7. 部署参考 `deploy/`(Docker Compose + Caddy + Litestream)与 `docs/backup-restore.md`。

## 结构与 Atrium 的对应关系

| 模板目录 | 说明 |
|---|---|
| `apps/server` | 服务端入口:core + server-host + 模块 + 数据镜像 |
| `apps/web` | Web/PWA 前端入口:web-host 外壳 + 模块 + 主题 |
| `apps/mcp` | Agent MCP 入口:mcp-host + 模块 agent 能力 |
| `apps/desktop` | 桌面端占位(Tauri v2,待桌面工具链,当前为说明文档) |
| `modules/` | 应用专有模块(与官方模块同结构,见 Atrium §6) |
| `config/application.ts` | 应用配置(品牌、已安装/默认启用模块、默认主题) |
| `deploy/` | Docker Compose、Caddy、Litestream 部署模板 |
| `docs/` | 备份恢复等运维文档 |

## 关键约束

- 部署信息(域名、数据库路径、密钥、备份位置)**不得**写入应用源码配置;
  一律通过环境变量/部署配置注入;
- 应用仓库**不得复制或修改 Atrium 源码**;发现通用缺口时先修复 Atrium 并发布,
  再升级本应用的依赖版本;
- 本仓库的 AGENTS.md 描述应用仓库自身的工程约束,Atrium 框架约束见 Atrium 仓库。
