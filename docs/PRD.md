# Atrium 工作台框架产品需求文档

| 项 | 内容 |
|---|---|
| 文档版本 | v2.2 |
| 状态 | 待开发 |
| 文档定位 | Atrium 框架、官方通用模块和应用集成模型的产品与架构事实来源 |
| 工程规范 | `AGENTS.md` |

## 0. 修订记录

| 版本 | 变更摘要 |
|---|---|
| v1.0 | 初版，以个人工作台为主要交付对象 |
| v1.1-v1.3 | 增加框架分层、认证、离线、Agent、界面框架和 profile scope |
| v2.0 | 将 Atrium 重新定义为独立框架仓库；区分框架、应用、部署实例和客户端；明确个人工作台与家庭工作台是独立应用仓库；保留便签为第一个官方通用模块；修正模块契约、数据 scope、离线 ID、版本和 SQLite 部署模型 |
| v2.1 | 明确工作台界面外壳、统一导航、视觉主题包、语义图标包、响应式和可访问性要求 |
| v2.2 | 增加服务端可读数据镜像、模块 exporter、通用 Git 目的地、管理员配置、凭证安全和第一版范围 |

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
| 视觉主题包 Theme Pack | 控制颜色、字体、图标、组件质感、密度和装饰效果的受控视觉契约 |
| 主题图标包 Theme Icon Pack | 将语义图标 key 映射为实际图标实现的主题组成部分 |
| 语义图标 key Semantic Icon Key | 描述图标用途而非具体图形实现的稳定标识，例如 `notes`、`settings` |
| 导航项 Navigation Item | 模块或框架向统一导航注册的菜单定义 |
| 可读数据镜像 Readable Data Mirror | 服务端把业务数据定期导出为普通文件并单向推送到远程 Git 仓库的能力 |
| Data Mirror Engine | 编排 exporter、文件校验、完整重建、Git 推送、调度、锁和执行历史的服务端组件 |
| Data Mirror Exporter | 模块提供的可读和结构化数据导出契约 |
| Exported File | exporter 生成的相对路径、内容、格式和元数据描述 |
| Git Destination | 数据镜像使用的单一标准远程 Git 仓库和目标分支 |
| Mirror Run | 一次完整的数据导出、比较、提交和推送执行 |

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
- 桌面侧栏、移动抽屉、统一菜单 registry、视觉主题包、语义图标解析和通用工作台 UI；
- 服务端可读数据镜像、模块 exporter、通用 Git 目的地、调度、任务锁、重试和执行历史；
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
- 将多个工作台应用打包为一个共同部署；
- 使用数据镜像备份应用源码、SQLite 文件、Docker 或部署配置；
- 从数据镜像导入或恢复 Atrium；
- 数据镜像双向同步；
- 客户端本地 Git 推送；
- 多个数据镜像远端；
- Git LFS 和独立附件仓库；
- GitHub、Gitee 或 Gitea 的平台专用数据镜像实现。

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
| 图标 | 语义 `iconKey` + Theme Icon Pack；默认图标包使用 Lucide |
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
    /admin-data-mirror-api
  /web-host
    /admin-settings
      /data-mirror
  /desktop-host
  /mcp-host
  /data-mirror
    /exporters
    /git
    /scheduler
    /history
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
- 错误码与 capability 名称；
- `ThemePack`、`ThemeIconPack` 和 `NavigationItem`；
- 语义图标 key 与框架基础图标集合；
- `DataMirrorExporter`、`ExportContext` 和 `ExportedFile`；
- 数据镜像的非敏感配置、状态和执行结果契约。

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
- `web-host`：React 外壳、路由、桌面侧栏、移动抽屉、菜单合并与活动状态、主题切换、图标解析、首页和同步状态；
- `desktop-host`：Tauri 壳、系统 keychain、更新和全局快捷键；
- `mcp-host`：通用 Agent 工具和 token 验证。
- `data-mirror`：服务端 exporter 编排、完整镜像生成、路径校验、Git 操作、调度、任务锁、重试和执行历史；

Host 只读取标准 registry，不认识任何具体模块。

`server-host` 提供 `/api/core/admin/data-mirror/*` 管理员 API。`web-host` 只提供管理员配置和状态界面，不包含 Git 执行实现。`desktop-host`、PWA 和 `mcp-host` 不得依赖 `data-mirror` 的 Git、scheduler 或 secret 实现。

### 9.4 UI 与主题

`ui` 提供工作台外壳、导航、可访问组件和布局容器；`theme` 提供视觉主题包、语义 token、组件 token、布局 token、图标包和受控装饰能力。

Theme Pack 不持有业务状态或业务逻辑。模块只能消费公开 UI primitives 和语义 token，不能依赖具体主题实现。

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
- 数据镜像是否启用、仓库地址、目标分支、目录前缀、周期和附件选项。

部署秘密不得提交到应用配置源码。

数据镜像 SSH Deploy Key 和 Personal Access Token 属于服务端 secret，不属于应用配置或可读部署配置。客户端只能接收认证类型、脱敏仓库信息和密钥指纹。

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

### 11.5 导航注册

Web 模块通过标准契约注册页面路由和导航项。建议的契约概念为：

```ts
interface NavigationItem {
  id: string;
  label: string;
  iconKey: string;
  route: string;
  order?: number;
}
```

- 模块只能声明语义 `iconKey`，不能控制最终图标实现；
- 菜单合并、排序、冲突验证和活动路由状态由应用 registry 与 Web host 负责；
- 导航项只在所属模块启用时出现；
- 模块禁用后，其菜单和页面路由必须同时消失；
- 模块不得创建脱离框架外壳的独立导航系统。

### 11.6 数据镜像 exporter

模块可以在服务端入口提供可选的 `DataMirrorExporter`：

```ts
interface DataMirrorExporter {
  moduleId: string;

  exportReadable(
    context: ExportContext
  ): Promise<ExportedFile[]>;

  exportStructured(
    context: ExportContext
  ): Promise<ExportedFile[]>;
}
```

- exporter 只运行在服务端；
- exporter 通过受限、只读且带 profile scope 的 `ExportContext` 读取一致数据视图；
- exporter 不得获得 raw database、修改业务数据或跨模块读取；
- 模块负责自身字段含义及 Markdown、JSON、CSV 等输出；
- exporter 只能写入自身模块和当前 profile 的命名空间；
- exporter 不得访问 Git 凭证、执行 Git 或创建定时任务；
- Data Mirror Engine 负责路径安全、汇总、manifest、完整重建和 Git 推送；
- 只调用已启用模块的 exporter；
- exporter 输出必须稳定、可重复，且不得包含 secret。

第一版 Notes 必须提供 Markdown 和 JSON。接口字段、文件排序和确定性序列化规则在实现前通过 ADR 固化。

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

可读数据镜像不改变这一事实来源模型：

```text
Server DB
  └──▶ Module Exporters
         └──▶ Data Mirror Engine
                └──▶ Git commit / push
                       └──▶ Private remote repository
```

远程仓库是单向生成的可读副本，不参与客户端同步，不是服务端数据库的替代品。第一版不从 Git 导入或恢复数据。

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
- audit 查询（受权限限制）；
- data mirror 脱敏配置和状态（管理员）；
- data mirror 测试连接和立即推送（管理员）；
- data mirror 执行历史（管理员）。

数据镜像管理员 API 位于：

```text
/api/core/admin/data-mirror/*
```

所有数据镜像管理接口必须验证 admin challenge。读取接口不得返回 Git token、SSH 私钥或其他完整 secret；普通 profile 和 Agent token 不得获得这些权限。

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
- 管理接口必须验证 admin challenge；
- 数据镜像 SSH Deploy Key 和 PAT 只存放在服务端 secret 存储；
- 数据镜像 secret 不得进入应用源码、普通配置、导出文件、镜像仓库、日志或客户端响应；
- Git 命令参数、错误信息和审计事件必须脱敏；
- Web 管理端只能显示认证类型、脱敏仓库信息和密钥指纹；
- 数据镜像敏感配置变更、测试连接和立即推送必须重新验证管理员权限；
- 每个 profile 的镜像目录和导出上下文必须隔离。

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

## 19. 界面外壳、导航与主题

### 19.1 应用外壳

Web host 提供统一工作台外壳，包括：

- 认证入口和 Profile 切换；
- 桌面侧栏和移动抽屉；
- 页面标题和 actions；
- 模块路由；
- 首页 widget；
- 全局搜索和快速输入；
- 离线和同步状态；
- 更新提示；
- 设置和主题切换入口。

桌面端采用“左侧功能菜单 + 右侧功能区域”的整体布局。框架负责外壳和导航，主题负责视觉表现，模块负责注册菜单项、路由和页面内容。

### 19.2 桌面侧栏

- 左侧菜单必须支持展开和折叠；
- 展开时显示菜单图标和文字；
- 折叠时只显示图标，并通过 tooltip 显示名称；
- 每个菜单项必须有图标，并支持当前页面高亮；
- 设置、主题切换等框架入口可以放在侧栏底部；
- 侧栏的折叠、活动状态和键盘交互由框架统一实现。

### 19.3 移动抽屉

移动端不保留固定侧栏，改用抽屉式菜单。移动抽屉必须使用与桌面侧栏相同的菜单定义、排序、权限和模块启用状态，不得维护第二套导航配置。

### 19.4 页面功能区域

右侧功能区域显示当前模块的页面内容，可以包含：

- 页面标题和说明；
- 搜索和筛选；
- 主要操作按钮；
- 状态、反馈和辅助操作；
- 模块的主要内容。

模块提供页面内容，但不得替换框架外壳或创建独立的全局导航系统。

### 19.5 导航契约

模块使用 `NavigationItem` 注册导航。框架合并框架入口和模块入口，验证重复 id、重复 route 和排序冲突，并根据当前路由计算活动状态。

已禁用模块不得保留菜单项或页面路由。所有纯图标菜单和按钮必须具有可访问名称。

### 19.6 视觉主题包

主题实现为视觉主题包（Theme Pack），而不只是配色方案。建议的契约概念为：

```ts
interface ThemePack {
  id: string;
  name: string;
  appearance: "light" | "dark" | "adaptive";
  colors: ThemeColors;
  typography: ThemeTypography;
  icons: ThemeIconPack;
  components: ThemeComponentTokens;
  layout: ThemeLayoutTokens;
  decorations?: ThemeDecorations;
}
```

Theme Pack 可以控制：

- 颜色；
- 字体；
- 图标风格；
- 圆角；
- 边框；
- 阴影；
- 按钮样式；
- 输入框样式；
- 卡片样式；
- 间距和密度；
- 背景纹理和装饰效果。

契约字段的最终结构在实现前另行确定；上述接口只表达当前已确认的职责边界。

### 19.7 主题类型

主题分为：

1. **基础主题**：主要改变浅色、深色、主题色、圆角、阴影和密度；
2. **风格主题**：可以产生像素风、可爱风、科技风等明显不同的整体画风。

主题可以改变视觉表现，但不能改变产品的信息结构。切换主题后必须保持左侧导航、右侧功能区、菜单层级、路由和核心操作位置基本一致。

主题不得包含业务逻辑，不得改变模块启用状态、权限、数据行为或页面路由。

### 19.8 语义图标与 Theme Icon Pack

- 模块声明语义 `iconKey`，例如 `notes`、`settings`、`search`；
- 当前 Theme Icon Pack 负责将语义 key 映射为实际图标；
- 默认主题的图标包使用 Lucide；
- 像素风、可爱风、科技风等主题可以提供不同图标实现；
- 所有主题必须覆盖框架规定的基础语义图标；
- 主题缺少某个图标时必须回退到默认图标包；
- 禁止业务模块直接 import Lucide 图标、具体主题图标组件或其他图标包实现。

### 19.9 响应式

- Full：展开或可折叠的宽屏侧栏和多列 widget；
- Compact：折叠侧栏和两列内容；
- Mobile：抽屉导航、单列内容、触控优先、禁用复杂拖拽。

三档宽度使用同一菜单定义。模块不得为三档宽度维护三套业务组件，响应差异由框架布局容器承担。

### 19.10 Token 与模块 UI 边界

- 主题使用原始 token 和语义 token 两层结构；
- 颜色、字体、圆角、边框、阴影、密度和布局尺寸必须 token 化；
- 业务组件只使用语义 token 和公开 UI primitives；
- 业务代码不得直接写十六进制颜色、Tailwind 具名颜色、具体主题字体或主题专属样式；
- 主题通过受控契约生效，不得向模块注入任意全局 CSS 选择器；
- 主题可以调整视觉密度和装饰，但不得破坏信息结构和核心布局关系。

### 19.11 可访问性

- 所有主题必须保留正常的语义化 HTML 结构；
- 导航、抽屉、主题切换和模块页面必须支持键盘操作；
- 焦点状态必须清晰可见；
- 图标按钮必须具有可访问名称；
- 折叠菜单必须提供名称 tooltip；
- 字体、前景与背景必须保持可读性；
- 主题不得使用过小文字、过低对比度或过小触控目标；
- 像素风等特殊主题不得通过把整个页面渲染为图片或 Canvas 实现；
- 主题装饰不得改变辅助技术读取顺序或隐藏必要内容。

### 19.12 数据镜像管理员设置

管理员设置中提供：

```text
设置
└── 数据镜像
    ├── 启用自动推送
    ├── Git 仓库地址
    ├── 目标分支
    ├── 认证方式
    ├── 推送周期
    ├── 是否包含附件
    ├── 测试连接
    ├── 立即推送
    ├── 查看远程仓库
    └── 推送历史
```

页面只调用 `/api/core/admin/data-mirror/*`，不得在浏览器中执行 Git。界面只能展示脱敏配置、认证类型、密钥指纹、最后成功时间和最后失败原因，不得读取或回显完整凭证。普通 profile、PWA、移动端、桌面端和 Agent 不得获得数据镜像管理权限。

## 20. 可读数据镜像

### 20.1 目标与定位

可读数据镜像（Readable Data Mirror）让用户在 Atrium 将来无法运行时，仍能直接在 GitHub、Gitee、Gitea 或其他标准 Git 服务中阅读导出的业务数据。

它是部署实例的 **Server-only capability**，Web 仅提供 **Admin-only configuration UI**。数据流严格单向：

```text
Atrium 服务端数据库
        ↓
各业务模块导出可读文件
        ↓
Data Mirror Engine
        ↓
Git commit / push
        ↓
远程私有 Git 仓库
```

远程仓库是查看和留档位置，不是 Atrium 的数据权威。第一版不支持导入、恢复或双向同步。

### 20.2 非备份边界

可读数据镜像不备份应用源码、SQLite 数据库文件、Docker 镜像、Compose/Caddy 配置、secret、运行凭证或部署环境。

Litestream 和 SQLite 备份继续负责灾难恢复。Data Mirror 不能替代数据库备份，也不能作为应用升级或恢复流程的输入。

### 20.3 服务端与客户端边界

只有服务端可以读取业务数据、调用 exporter、生成普通文件、管理临时目录、运行调度器、执行 Git 命令、访问凭证、获取任务锁、重试和记录执行历史。

PWA、未来移动端、macOS、Windows、普通浏览器和 Agent/MCP 客户端不得保存 Git token 或 SSH 私钥、执行 Git 命令、创建独立数据镜像或在本地运行定时推送。关闭所有客户端后，服务端仍必须能够按计划自动推送。

### 20.4 镜像目录和格式

建议目录结构：

```text
atrium-data/
├── README.md
├── manifest.json
└── profiles/
    └── default/
        ├── notes/
        │   ├── note-142-atrium-design.md
        │   └── notes.json
        ├── todos/
        │   ├── todos-open.md
        │   ├── todos-completed.md
        │   └── todos.json
        └── links/
            ├── links.md
            └── links.json
```

不同模块可以选择适合自身数据的格式：

- Notes：Markdown + JSON；
- Todos：汇总 Markdown + JSON；
- Links：Markdown + JSON；
- Ledger：CSV + JSON + Markdown 汇总；
- 其他模块通过统一 exporter 契约接入。

框架不得理解具体业务字段。模块负责自身可读和结构化输出，Data Mirror Engine 负责目录边界、路径安全、根 README、manifest、汇总和 Git 推送。

### 20.5 Git 目的地与配置

第一版使用一个通用 Git 目的地，不为 GitHub、Gitee 或 Gitea 编写平台专用业务逻辑。用户配置标准 Git 仓库地址、目标分支和可选数据目录前缀。

认证方式支持 SSH Deploy Key 和 Personal Access Token，优先推荐只授权单一仓库的 SSH Deploy Key。

配置和状态包括：

- 是否启用；
- Git 仓库地址；
- 目标分支；
- 可选数据目录前缀；
- 认证方式；
- 每日或每周自动推送；
- 是否包含附件；
- 最后成功时间；
- 最后失败原因。

仓库地址、分支、周期等非敏感设置属于部署实例配置；私钥和 token 属于服务端 secret。Web 只能获得脱敏投影。

### 20.6 自动推送流程

每次 Mirror Run 必须：

1. 获取数据镜像任务锁；
2. 读取一致的数据视图；
3. 调用已启用模块的 exporter；
4. 在临时目录重新生成完整数据镜像；
5. 校验生成的文件、相对路径和模块命名空间；
6. 获取远程仓库最新状态；
7. 更新目标数据目录；
8. 检查是否存在实际数据变化；
9. 有变化时创建 Git commit；
10. push 到目标分支；
11. 记录执行结果；
12. 清理临时目录。

无变化时不得创建空提交。提交信息可以采用：

```text
data: mirror 2026-08-05 00:30 UTC
```

不得默认 force push。

### 20.7 远端冲突

远程仓库或目标分支应由 Atrium 独占写入。如果检测到分支分歧、无法安全合并的人工提交或非预期数据目录修改，必须停止推送、记录失败并通知管理员处理，不能静默覆盖或强制重写历史。

### 20.8 删除、附件和 Git 历史

数据镜像反映 Atrium 当前状态。业务数据删除后，对应文件可以从最新提交中删除；旧内容仍可通过 Git 历史查看，第一版不维护额外回收站目录。

第一版默认不推送附件，只导出正文、结构化字段、附件名称和元数据。设置可以保留“包含附件”选项，但必须警告仓库体积可能快速增长。Git LFS、独立附件仓库和大文件策略属于后续范围。

### 20.9 隐私与仓库可见性

管理员必须看到明确提示：

> 数据镜像包含可直接阅读的个人或家庭数据，请使用私有 Git 仓库。

如果服务端可以查询仓库可见性，应阻止或强烈警告推送到公开仓库；如果通用 Git 协议无法查询，必须要求管理员明确确认风险。

Git 凭证不得写入应用源码、镜像仓库、导出文件或日志，也不得返回给前端或下发到其他客户端。

### 20.10 管理 API 与权限

管理接口位于：

```text
/api/core/admin/data-mirror/*
```

接口提供脱敏配置、状态、测试连接、立即推送和执行历史。所有接口必须验证 admin challenge；普通 profile、PWA、移动端、桌面端和 Agent 不得获得权限。

测试连接和立即推送由服务端执行。浏览器只发起管理员请求，不直接运行 Git。

### 20.11 第一版范围

第一版包含：

1. 一个远程 Git 仓库；
2. 任意标准 Git 地址；
3. SSH Deploy Key 和 Personal Access Token；
4. 手动立即推送；
5. 每日或每周定时推送；
6. Notes Markdown 和 JSON 导出；
7. 模块统一 exporter 契约；
8. 无变化不提交；
9. 推送任务锁；
10. 失败记录和重试；
11. 管理员配置界面；
12. 默认不包含附件；
13. 禁止强制覆盖远程冲突；
14. 明确要求私有仓库。

第一版不包含应用代码、SQLite 文件或部署环境备份，也不包含从 Git 恢复、双向同步、客户端本地推送、多远端、Git LFS 或平台专用实现。

## 21. 部署模型

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

### 21.1 更新

SQLite 使用单写者维护流程，不使用双容器同时写同一数据库的 rolling restart。

标准流程：

1. 将实例切换到维护或停止写入；
2. checkpoint；
3. 创建可验证备份；
4. 启动新版本并执行迁移；
5. 健康检查和冒烟测试；
6. 成功后恢复流量；
7. 失败则回滚镜像和数据。

Litestream 和 SQLite 备份负责灾难恢复；可读数据镜像负责普通文件留档。镜像失败不得影响数据库权威状态，应用更新和恢复流程不得依赖镜像仓库。

## 22. 版本与发布

- 框架包和官方模块采用语义化版本；
- 包版本采用统一还是独立策略由 ADR 决定，在确认前不得预先假设；
- 应用锁定版本；
- breaking change 提供 migration guide；
- 应用升级由应用仓库显式发起；
- 不同应用可运行不同 Atrium 版本；
- 发布产物必须可复现；
- 应用不得以复制源码代替依赖管理。

引导阶段可以使用不可变 Git tag 依赖，稳定后应发布到受控 npm registry，例如 GitHub Packages。

## 23. 非功能要求

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
| 主题一致性 | 切换主题不改变菜单语义、路由或核心操作 |
| 导航一致性 | 桌面侧栏和移动抽屉使用同一菜单定义 |
| 图标回退 | Theme Icon Pack 缺少映射时使用默认图标 |
| 可访问性 | 所有主题保持键盘可操作、焦点可见和文字可读 |
| 镜像确定性 | 同一一致数据视图生成稳定、可重复的文件 |
| 空提交 | 无实际数据变化时不创建 commit |
| 凭证安全 | secret 不进入导出、日志、Git 仓库或客户端 |
| 任务互斥 | 同一部署实例同时最多运行一个 Mirror Run |
| Profile 隔离 | 不同 profile 的目录和数据不互相泄漏 |
| 远端安全 | 分支冲突停止推送，不静默覆盖或 force push |
| 可观察性 | 最后成功、失败原因、历史和重试状态可查询 |

## 24. 分阶段实施

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
- audit 基础；
- navigation、Theme Pack 和 Theme Icon Pack 契约；
- 框架基础语义图标集合；
- Data Mirror exporter、配置和执行结果契约。

验收：scope、soft delete、ID 和 migrations 有自动化测试。

### 阶段 3：最小宿主

交付：

- server host；
- web host；
- theme/ui；
- registry 生成；
- single auth；
- health/heartbeat；
- 桌面侧栏、移动抽屉和活动路由状态；
- Theme Pack 切换和默认图标回退。

验收：reference app 可登录并加载一个空模块壳；桌面侧栏可折叠，移动抽屉复用相同菜单定义，主题切换不改变路由。

### 阶段 4：官方 Notes 垂直切片

交付：

- notes migration；
- CRUD；
- Web 列表/详情/编辑；
- 搜索和 capture；
- 标签、关联、附件接入；
- Agent describe/list/get/create/update/delete；
- 审计；
- 基础离线队列；
- 标准 `NavigationItem` 和语义 `iconKey` 接入。

验收：notes 全链路运行，host 没有任何 notes 特例。

### 阶段 5：可读数据镜像垂直切片

交付：

- `@atrium/data-mirror` 服务端引擎；
- Notes Markdown 和 JSON exporter；
- 根 README、manifest 和 profile/module 目录；
- 通用 Git destination；
- SSH Deploy Key 和 PAT secret 接入；
- 管理员 API 和设置界面；
- 手动立即推送；
- 每日和每周调度；
- 任务锁、无变化跳过、失败历史和重试；
- 默认不包含附件；
- 远端冲突保护和私有仓库警告。

验收：关闭所有客户端后服务端仍可按计划推送；无变化不提交；secret 不进入文件、日志、API 或仓库；远端分歧停止推送且不 force push。

### 阶段 6：应用模板和包发布

交付：

- workbench app template；
- 包构建和发布；
- 版本锁定；
- Docker/Caddy 模板；
- 备份和恢复文档。

验收：可在新仓库中生成应用，安装 Atrium 与 notes，独立部署。

### 阶段 7：第一个独立应用接入

在个人工作台独立仓库中完成，不把个人业务 PRD 加回 Atrium。

验收：个人工作台通过版本化 Atrium 依赖运行；框架升级通过发布版本完成。

### 阶段 8：第二个独立应用验证

在家庭工作台独立仓库中完成。

验收：家庭工作台在不修改框架业务边界的情况下使用 Atrium 和 notes，证明复用模型成立。

## 25. 框架验收标准

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
- SQLite 更新和恢复流程可演练；
- 桌面侧栏可以展开和折叠，折叠菜单具有名称 tooltip；
- 移动抽屉复用桌面侧栏的菜单定义；
- 菜单项具有语义图标和活动路由高亮；
- 模块只通过标准导航契约接入，不创建独立导航系统；
- 至少验证默认主题和一种风格主题；
- Theme Icon Pack 缺少映射时回退到默认图标；
- 主题切换不改变菜单层级、路由和核心操作；
- 特殊画风仍使用可访问的语义化 HTML；
- 数据镜像只在服务端执行，客户端包不包含 Git 实现或凭证；
- 关闭浏览器和客户端后，服务端仍可定时推送；
- Notes 生成可读 Markdown 和结构化 JSON；
- 根 manifest、profile 目录和模块目录正确；
- disabled 模块不参与导出；
- 无数据变化不创建 commit；
- 任务锁阻止并发 Mirror Run；
- secret 不出现在导出、日志、API 或 Git 历史；
- 远端分歧停止推送，不静默覆盖或 force push；
- 删除后的文件仍可通过 Git 历史查看；
- 默认只导出附件名称和元数据，不推送附件内容；
- 管理界面只显示脱敏信息并要求 admin challenge；
- 文档和产品不得声称第一版支持 Git 导入、恢复或双向同步。

## 26. 开放项

以下内容在进入对应实现阶段前需要形成独立 ADR，但不阻塞阶段 0：

- 包 registry 的最终选择；
- package version 采用统一版本还是独立版本；
- migrations 对 installed/disabled 模块的长期策略；
- application template 的生成器形式；
- Tauri 更新分发渠道；
- profile 模式是否在框架首版或后续版本交付；
- Theme Pack 的发布、发现和版本兼容方式；
- 框架基础语义图标 key 的命名、扩展和弃用策略；
- 第三方主题是否允许注册额外语义图标；
- 字体、纹理和图标资产的体积预算、授权与加载策略；
- 用户主题选择保存在应用默认、部署实例、Profile 还是设备层级；
- Theme Pack 可调整的布局 token 上下限；
- 可访问性遵循的具体 WCAG 版本和等级；
- 风格主题是否允许提供受控组件 variant 及其范围；
- Git 执行采用系统 Git 还是库实现；
- 服务端 secret backend；
- 一致数据视图和长事务策略；
- `manifest.json` schema 与版本策略；
- 文件命名、slug、排序和碰撞规则；
- exporter 输出大小和单文件限制；
- scheduler、重试次数和退避策略；
- Git author/committer 身份；
- 新仓库和空分支初始化策略；
- 远端人工提交检测与安全合并判定；
- 仓库可见性检测能力；
- 管理员公开仓库风险确认的持久化方式；
- Git LFS、独立附件仓库和大文件策略；
- 多远端、Git 导入和恢复能力的未来设计。

Agent 不得自行把开放项当作已确认决策。实施到相关阶段时必须提出方案、权衡和推荐结论。
