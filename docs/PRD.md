# Atrium 工作台框架产品需求文档

| 项 | 内容 |
|---|---|
| 文档版本 | v2.0 |
| 状态 | 待开发 |
| 文档定位 | Atrium 框架、官方通用模块和应用集成模型的产品与架构事实来源 |
| 工程规范 | `AGENTS.md` |

## 0. 修订记录

| 版本 | 变更摘要 |
|---|---|
| v1.0 | 初版，以个人工作台为主要交付对象 |
| v1.1-v1.3 | 增加框架分层、认证、离线、Agent、界面框架和 profile scope |
| v2.0 | 将 Atrium 重新定义为独立框架仓库；区分框架、应用、部署实例和客户端；明确个人工作台与家庭工作台是独立应用仓库；保留便签为第一个官方通用模块；修正模块契约、数据 scope、离线 ID、版本和 SQLite 部署模型 |

## 1. 产品愿景

Atrium 是一个用于开发多个独立工作台应用的通用框架。

Atrium 提供：

- 可组合的模块系统；
- Web、PWA、桌面和 Agent 宿主；
- 数据、认证、同步、搜索、附件、标签、关联和审计能力；
- 一致的 UI 外壳与主题系统；
- 应用模板和部署约定；
- 可选的官方通用模块。

Atrium 不等同于个人工作台，也不等同于家庭工作台。

个人工作台、家庭工作台以及未来其他工作台，是基于 Atrium 创建的独立应用项目。

## 2. 核心成功标准

框架是否成立，以以下标准判断：

1. 创建第二个工作台应用时，不修改 Atrium 的框架代码；
2. 应用只通过公开契约、配置和版本化包接入；
3. 每个应用可以独立开发、升级、发布、部署和回滚；
4. 应用之间不共享数据库、附件或运行密钥；
5. 一个官方模块可以在至少两个不同应用中不加特例地复用；
6. 新增或禁用模块不需要修改宿主导航、路由、Agent 工具或搜索代码；
7. Web、PWA、桌面端和 Agent 使用同一服务端数据权威；
8. 框架升级不会强制所有应用同时升级。

## 3. 名词表

| 名词 | 定义 |
|---|---|
| 框架 Framework | Atrium 的通用基础设施、契约和宿主能力 |
| 官方模块 First-party Module | Atrium 仓库维护的可选通用业务模块，例如 notes |
| 应用 Application | 独立仓库中的工作台产品，由 Atrium、应用配置和模块组成 |
| 部署实例 Deployment Instance | 某个应用的一次实际部署，拥有独立容器、数据库、附件、密钥和域名 |
| 客户端 Client | 浏览器、PWA、Tauri、未来移动端或 Agent |
| Profile | 一个部署实例内的数据身份和 scope |
| 已安装模块 Installed Module | 构建时被应用包含的模块 |
| 已启用模块 Enabled Module | 部署实例当前公开能力的模块，必须是 installed 的子集 |
| 宿主 Host | 加载标准模块并提供运行环境的框架部分 |
| Resource | 模块向 core、API、搜索和 Agent 注册的数据资源类型 |
| 短 ID | 面向人与 Agent 的标识，例如 `note-142` |

## 4. 产品关系

```text
Atrium 框架与官方模块
├── 个人工作台应用仓库
│   └── 一个或多个独立部署实例
├── 家庭工作台应用仓库
│   └── 一个或多个独立部署实例
└── 未来其他工作台应用仓库
```

### 4.1 应用组成

```text
工作台应用
= 明确版本的 Atrium 包
+ 应用配置
+ 一组已安装模块
+ 应用自己的业务模块
+ 应用级品牌与资源
+ 独立构建和部署配置
```

### 4.2 部署实例组成

```text
部署实例
= 某个应用版本
+ 独立容器
+ 独立数据库
+ 独立附件目录
+ 独立密钥和凭证
+ 独立域名
+ 独立备份
+ 运行期启用模块配置
```

应用配置和部署配置必须分离。

## 5. 用户与使用者

Atrium 面向三类使用者：

### 5.1 框架维护者

负责 contracts、core、host、UI、主题、官方模块、兼容策略和发布。

### 5.2 应用开发者

使用应用模板创建个人、家庭或其他工作台，组合官方模块并开发应用专有模块。

### 5.3 终端用户

通过浏览器、PWA、桌面端、未来移动端或外部 Agent 使用某个独立部署实例。

## 6. 范围

### 6.1 本项目包含

- 工作台模块契约和注册机制；
- Server、Web/PWA、Desktop、MCP 宿主；
- 数据访问 scope、迁移、认证、profile、日志和审计；
- 标签、关联、附件、搜索、capture 和资源注册；
- 在线优先缓存和受控离线写队列；
- 主题、布局 token 和通用工作台 UI；
- 应用模板；
- 包版本与兼容约定；
- reference app；
- 官方便签模块。

### 6.2 本项目不包含

- 个人工作台完整产品需求；
- 家庭工作台完整产品需求；
- 记账、客户、孩子、作业等应用专有模块；
- SaaS 多租户平台；
- 用户注册、组织、复杂角色权限矩阵；
- 客户端之间的点对点同步；
- CRDT 协同编辑；
- 原生移动 App；
- Postgres 迁移；
- 将多个工作台应用打包为一个共同部署。

## 7. 技术栈

| 层 | 选型 |
|---|---|
| 运行时 | Node.js 22 |
| 服务端 | Fastify + TypeScript |
| 数据库 | SQLite + better-sqlite3 + Drizzle ORM |
| 前端 | React 19 + Vite + TypeScript + React Router |
| 样式 | Tailwind CSS v4 + shadcn/ui |
| 请求与缓存 | TanStack Query |
| 表单与校验 | react-hook-form + Zod |
| 图标 | lucide |
| 桌面 | Tauri v2 |
| 移动 | PWA |
| 包管理 | pnpm workspace |
| 测试 | Vitest + Playwright |
| 部署 | Docker Compose + Caddy |
| 备份 | Litestream |

## 8. 目标仓库结构

```text
/packages
  /contracts
  /core
  /ui
  /theme
  /server-host
  /web-host
  /desktop-host
  /mcp-host
/modules
  /notes
    manifest.ts
    /shared
    /server
    /web
    /agent
    /offline
    /migrations
    /tests
/templates
  /workbench-app
/examples
  /reference-app
/tooling
/docs
  PRD.md
  ARCHITECTURE.md
  MODULE_CONTRACT.md
  VERSIONING.md
  CHANGELOG.md
```

框架包和官方模块同仓开发，但独立发布。

## 9. 框架包职责

### 9.1 `@atrium/contracts`

必须保持运行时轻量和跨环境可用，包含：

- 应用配置类型；
- 模块元数据；
- Server/Web/Agent/Offline 模块接口；
- ResourceDescriptor；
- API envelope；
- cursor pagination；
- short ID 和 idempotency 契约；
- HostContext 的公开能力接口；
- 错误码与 capability 名称。

不得依赖 React、Fastify、SQLite 实例或 Node 专用实现。

### 9.2 `@atrium/core`

负责：

- 数据库连接和 SQLite 设置；
- scoped data access；
- 迁移编排；
- UUID/seq/短 ID；
- 认证、session、profile 和 admin challenge；
- resource registry；
- 标签、关系、附件；
- 搜索与 capture 聚合；
- audit log；
- outbox 重放；
- 模块生命周期。

### 9.3 Host packages

- `server-host`：Fastify 启动、API 注册、健康和版本接口；
- `web-host`：React 外壳、路由、菜单、首页、主题和同步状态；
- `desktop-host`：Tauri 壳、系统 keychain、更新和全局快捷键；
- `mcp-host`：通用 Agent 工具和 token 验证。

Host 只读取标准 registry，不认识任何具体模块。

### 9.4 UI 与主题

`ui` 提供通用组件和布局容器；`theme` 提供语义颜色、圆角、字体、密度和布局尺寸 token。

## 10. 应用仓库模型

每个应用使用独立仓库，推荐结构：

```text
/apps
  /server
  /web
  /desktop
  /mcp
/modules
/config
  application.ts
/deploy
/docs
  PRD.md
AGENTS.md
```

### 10.1 应用配置

应用配置包含：

- application id；
- 名称、logo、品牌资源；
- 版本；
- installed modules；
- 默认 enabled modules；
- 默认主题；
- 默认首页布局；
- 默认语言和时区；
- 支持的客户端能力。

### 10.2 部署配置

通过环境变量、secret 和部署文件提供：

- 域名；
- 数据库路径；
- 附件目录；
- Cookie secret；
- 密码哈希；
- Agent token 加密/哈希配置；
- 备份目标；
- 实际语言和时区覆盖；
- 运行环境。

部署秘密不得提交到应用配置源码。

## 11. 模块系统

### 11.1 运行时拆分

模块使用多个入口，而不是巨型 manifest：

```text
manifest.ts       运行时无关元数据
shared/           schema、类型、resource 描述
server/index.ts   服务端实现
web/index.ts      前端实现
agent/index.ts    Agent 能力
offline/index.ts  离线策略
migrations/       数据库迁移
```

### 11.2 模块发现

应用构建阶段生成静态 registry：

- Node 侧不得依赖 Vite 的 `import.meta.glob`；
- Web 侧可以使用生成结果映射到动态 import；
- registry 是应用构建产物，不是框架对具体模块的硬编码；
- 构建时验证 module id、版本、资源和路由冲突。

### 11.3 已安装和已启用

- installed 决定产物和可用代码；
- enabled 决定部署实例当前暴露能力；
- disabled 模块没有菜单、路由、搜索、capture、widget 或 Agent resource；
- disabled 不删除数据；
- migrations 与已安装模块版本保持一致。

### 11.4 依赖边界

- host 不依赖具体模块；
- 模块不互相 import；
- 模块只使用公开 framework APIs；
- 跨模块业务联系通过 resource registry 和 relations 表达。

## 12. 官方通用模块

### 12.1 准入条件

官方模块必须：

1. 至少适用于两类独立工作台；
2. 不依赖应用品牌或专有流程；
3. 不依赖其他具体模块；
4. 不要求框架增加特例；
5. 可选择启用和禁用；
6. 可独立发布和升级；
7. 有完整契约、测试和迁移。

### 12.2 Notes 便签模块

Notes 是第一个官方模块，也是框架垂直切片的基准。

初期资源字段：

- UUID；
- seq 与短 ID；
- profile scope；
- title；
- body；
- pinned；
- archived；
- created_at；
- updated_at；
- deleted_at。

标签、关联和附件通过 core 通用能力提供，不在 notes 中复制实现。

Notes 必须声明：

- CRUD API；
- 列表、详情和编辑 Web 页面；
- 搜索 provider；
- capture handler；
- 首页 widget；
- Agent resource；
- 允许的离线操作；
- migrations；
- 单元、契约和端到端测试。

Notes 被禁用时，上述能力全部不可见，框架其他能力仍正常运行。

## 13. 数据模型与 scope

### 13.1 标准字段

所有业务资源表包含：

- `id`：UUID v7；
- `profile_id`；
- `seq`；
- `created_at`；
- `updated_at`；
- `deleted_at`。

### 13.2 数据访问

模块只能通过 `ScopedDb` 或更高层 repository API 访问数据。

Scope 自动处理：

- profile；
- soft delete；
- timestamp；
- audit context；
- transaction。

### 13.3 短 ID

- UUID 可由客户端生成；
- seq 由服务端事务分配；
- short ID 由 resource prefix 和 seq 组成；
- counter 按部署实例和 resource type 隔离；
- API 创建和离线重放返回客户端 UUID 到 short ID 映射。

### 13.4 跨模块数据

relations 至少包含：

- source resource/type/id；
- target resource/type/id；
- relation type；
- profile_id；
- timestamps；
- soft delete。

业务模块不得加入指向其他具体模块表的列。

## 14. 服务端是唯一事实来源

所有终端只通过统一 API 使用部署实例：

```text
Web / PWA ───────┐
Desktop ─────────┤
Future Mobile ───┼──▶ Server API ──▶ SQLite / uploads
Agent / MCP ─────┘
```

客户端不得：

- 直接连接数据库；
- 互相同步；
- 成为余额、统计或聚合结果的权威；
- 绕过 profile 和权限校验。

## 15. API

- Core API：`/api/core/*`；
- Module API：`/api/m/{moduleId}/*`；
- schema 使用 Zod；
- 响应使用 `{ data }` 或 `{ error }`；
- 列表使用 cursor pagination；
- 写入支持 idempotency key；
- error code 稳定且文档化；
- 附件必须鉴权访问。

核心能力至少包括：

- health/heartbeat；
- version；
- auth；
- profiles；
- preferences；
- modules；
- search；
- capture；
- tags；
- relations；
- attachments；
- sync replay；
- audit 查询（受权限限制）。

## 16. 认证和安全

支持 `single` 和 `profiles` 两种部署模式。

- 使用密码：进入部署实例；
- 管理员密码：敏感操作逐次验证；
- 无开放注册；
- 不实现 SaaS 用户和组织模型。

安全要求：

- 密码和 Agent token 只存哈希；
- session Cookie 使用安全属性；
- 浏览器写操作防 CSRF；
- 支持会话撤销；
- token 绑定 profile 和 scopes；
- 附件不暴露静态目录；
- 审计日志对密钥、密码和敏感字段脱敏；
- 上传验证大小、类型和名称；
- 管理接口必须验证 admin challenge。

## 17. 离线与同步

策略是在线优先：

1. Service Worker 缓存应用资源；
2. 查询结果持久化到 IndexedDB；
3. 离线默认只读；
4. 模块显式声明可离线写操作；
5. 白名单操作进入 outbox；
6. 恢复网络后经 `/api/core/sync/replay` 幂等重放；
7. 服务器返回 short ID 映射、成功、失败和冲突；
8. 不实现 CRDT。

冲突策略必须由操作类型定义，不允许统一使用“客户端覆盖服务端”。

## 18. Agent 通道

MCP host 暴露少量通用工具：

- list；
- get；
- create；
- update；
- delete；
- search；
- relate；
- capture；
- describe。

模块注册 resource 和 operation，不注册任意独立工具名。

Agent 输出要求：

- 默认最小字段；
- 支持字段投影；
- 默认 limit 10；
- 使用短 ID；
- 支持批量和幂等；
- 删除为软删除；
- 所有写入记录 `source=agent`；
- 禁用模块自动从 describe 和操作范围消失。

## 19. Web 与主题

### 19.1 外壳

Web host 提供：

- 认证入口；
- Profile 切换；
- 响应式侧栏；
- 页面标题和 actions；
- 模块路由；
- 首页 widget；
- 全局搜索；
- 快速输入；
- 离线和同步状态；
- 更新提示；
- 设置入口。

### 19.2 响应式

- Full：宽屏侧栏和多列 widget；
- Compact：收纳侧栏和两列内容；
- Mobile：单列、触控优先、禁用复杂拖拽。

模块不得为三档宽度维护三套业务组件。

### 19.3 主题

主题使用原始 token 和语义 token 两层结构。业务代码只使用语义 token。

颜色、圆角、字体、密度和布局尺寸都必须 token 化。主题不得改变信息架构和核心布局尺寸关系。

## 20. 部署模型

每个应用独立部署：

```text
应用部署实例
├── Server + Web 静态资源
├── 可选 MCP endpoint/process
├── SQLite 数据库
├── uploads
├── Compose project
├── Caddy route
└── Litestream/附件备份
```

不同应用之间不得共享 SQLite 文件。

### 20.1 更新

SQLite 使用单写者维护流程，不使用双容器同时写同一数据库的 rolling restart。

标准流程：

1. 将实例切换到维护或停止写入；
2. checkpoint；
3. 创建可验证备份；
4. 启动新版本并执行迁移；
5. 健康检查和冒烟测试；
6. 成功后恢复流量；
7. 失败则回滚镜像和数据。

## 21. 版本与发布

- 框架包和官方模块采用语义化版本；
- 包版本采用统一还是独立策略由 ADR 决定，在确认前不得预先假设；
- 应用锁定版本；
- breaking change 提供 migration guide；
- 应用升级由应用仓库显式发起；
- 不同应用可运行不同 Atrium 版本；
- 发布产物必须可复现；
- 应用不得以复制源码代替依赖管理。

引导阶段可以使用不可变 Git tag 依赖，稳定后应发布到受控 npm registry，例如 GitHub Packages。

## 22. 非功能要求

| 指标 | 目标 |
|---|---|
| Web 首屏可交互 | 常规网络下不超过 2 秒 |
| Web 首屏 gzip | 不超过 250KB |
| 单模块前端 chunk | 不超过 100KB |
| 常规 API 响应 | 本地/VPS 正常负载下不超过 200ms |
| 服务端常驻内存 | 目标不超过 150MB |
| 数据恢复 | 有文档并实际演练 |
| 模块边界 | CI 自动验证 |
| 应用隔离 | 不共享数据库、附件、密钥和发布流程 |

## 23. 分阶段实施

### 阶段 0：规格重构

交付：

- README、AGENTS、PRD；
- 四层模型；
- 框架与应用边界；
- 模块契约拆分；
- installed/enabled 定义；
- UUID/短 ID 生命周期；
- SQLite 部署模型。

验收：文档无相互矛盾，无个人工作台专有需求混入框架 PRD。

### 阶段 1：工程骨架和守卫

交付：

- pnpm monorepo；
- TypeScript、ESLint、Vitest；
- package exports；
- 架构依赖规则；
- CI；
- 空包骨架。

验收：故意违规依赖会被 CI 拦截；所有空包可 typecheck/build。

### 阶段 2：Contracts 和 Core 基础

交付：

- application config；
- module contracts；
- resource registry；
- ScopedDb；
- migration runner；
- UUID/seq/short ID；
- API envelope；
- audit 基础。

验收：scope、soft delete、ID 和 migrations 有自动化测试。

### 阶段 3：最小宿主

交付：

- server host；
- web host；
- theme/ui；
- registry 生成；
- single auth；
- health/heartbeat。

验收：reference app 可登录并加载一个空模块壳。

### 阶段 4：官方 Notes 垂直切片

交付：

- notes migration；
- CRUD；
- Web 列表/详情/编辑；
- 搜索和 capture；
- 标签、关联、附件接入；
- Agent describe/list/get/create/update/delete；
- 审计；
- 基础离线队列。

验收：notes 全链路运行，host 没有任何 notes 特例。

### 阶段 5：应用模板和包发布

交付：

- workbench app template；
- 包构建和发布；
- 版本锁定；
- Docker/Caddy 模板；
- 备份和恢复文档。

验收：可在新仓库中生成应用，安装 Atrium 与 notes，独立部署。

### 阶段 6：第一个独立应用接入

在个人工作台独立仓库中完成，不把个人业务 PRD 加回 Atrium。

验收：个人工作台通过版本化 Atrium 依赖运行；框架升级通过发布版本完成。

### 阶段 7：第二个独立应用验证

在家庭工作台独立仓库中完成。

验收：家庭工作台在不修改框架业务边界的情况下使用 Atrium 和 notes，证明复用模型成立。

## 24. 框架验收标准

Atrium 的首个可用版本必须证明：

- reference app 可独立启动；
- notes 可选启用和禁用；
- host 不 import notes；
- modules 不互相 import；
- API、Web、Agent 使用同一资源契约；
- profile scope 和 soft delete 默认生效；
- 离线创建后可获得 short ID；
- 模块禁用后 routes/menu/search/agent 全部消失；
- 应用可固定 Atrium 版本；
- 两个不同应用可独立部署且数据完全隔离；
- SQLite 更新和恢复流程可演练。

## 25. 开放项

以下内容在进入对应实现阶段前需要形成独立 ADR，但不阻塞阶段 0：

- 包 registry 的最终选择；
- package version 采用统一版本还是独立版本；
- migrations 对 installed/disabled 模块的长期策略；
- application template 的生成器形式；
- Tauri 更新分发渠道；
- profile 模式是否在框架首版或后续版本交付。

Agent 不得自行把开放项当作已确认决策。实施到相关阶段时必须提出方案、权衡和推荐结论。
