# AGENTS.md

本文档定义 Atrium 仓库中 AI 编码 Agent 和开发者必须遵守的工程约束。

完整产品与架构需求见 `docs/PRD.md`。本文档侧重实施纪律、代码边界和交付流程。两份文档出现冲突时，不得静默选择其一；必须指出冲突、说明影响，并在用户确认后同步修正文档和实现。

## 1. 仓库定位

Atrium 是“通用工作台框架 + 官方通用模块”的 monorepo。

本仓库不是个人工作台或家庭工作台的应用仓库。正式应用必须作为独立项目存在，并通过版本化依赖消费 Atrium。

必须始终区分：

- **框架（Framework）**：通用基础设施与宿主；
- **官方模块（First-party Module）**：可选、可独立版本化的通用业务模块；
- **应用（Application）**：独立仓库中的产品组合；
- **部署实例（Deployment Instance）**：应用的一次独立部署；
- **客户端（Client）**：Web、PWA、桌面、移动端或 Agent。

个人工作台和家庭工作台是两个独立应用，不是同一个仓库中的两份配置。

## 2. 决策原则

任何能力准备进入 `packages/*` 前，必须回答：

> 该能力是否不依赖具体业务，并且能被多个不同工作台应用以相同语义复用？

任何模块准备进入 `modules/*` 前，必须回答：

> 该模块是否至少适用于两类不同工作台，且不要求宿主或 core 为其增加特例？

不满足条件的内容必须放在具体应用仓库。

禁止为了加快第一个应用的开发，把个人工作台特有逻辑塞入 Atrium。

## 3. 固定技术栈

未经用户明确批准，不得替换以下选型，也不得引入功能重叠的大型依赖。

| 层 | 选型 |
|---|---|
| 运行时 | Node.js 22 |
| 服务端 | Fastify + TypeScript |
| 数据库 | SQLite + better-sqlite3 + Drizzle ORM |
| 前端 | React 19 + Vite + TypeScript + React Router |
| 样式 | Tailwind CSS v4 + shadcn/ui |
| 数据请求 | TanStack Query |
| 表单与校验 | react-hook-form + Zod |
| 图标 | 语义 `iconKey` + Theme Icon Pack；默认图标包使用 Lucide |
| 桌面 | Tauri v2 |
| 移动 | PWA；原生移动端不属于初期范围 |
| 包管理 | pnpm workspace |
| 单元测试 | Vitest |
| 端到端测试 | Playwright |
| 部署 | Docker Compose + Caddy |
| 备份 | Litestream |

引入第三方依赖前，计划中必须说明用途、体积、维护状态、替代方案和退出成本。

## 4. 目标目录

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
```

新增包和模块不得自创顶层布局。确需调整目录，必须先修改计划和架构文档。

## 5. 依赖方向

允许的依赖方向：

```text
application repository
  ├── Atrium host packages
  ├── Atrium official modules
  └── application-specific modules

host packages ──▶ contracts/core/ui/theme
modules       ──▶ contracts，以及按需依赖受公开导出的 core/ui/theme API
core          ──▶ contracts
data-mirror   ──▶ contracts，以及公开的 core 服务端能力
```

硬性规则：

1. 宿主不得 import 任何具体模块；
2. 模块之间不得直接 import；
3. 框架包中不得出现 `notes`、`ledger`、`homework` 等具体业务判断；
4. 应用专有模块不得进入 Atrium 仓库；
5. 不得通过相对路径绕过 package exports；
6. `core` 的内部实现不得被模块直接访问；
7. 依赖方向必须由 ESLint 和架构测试共同验证；
8. `server-host` 可以组合 Data Mirror Engine，但 Web、desktop 和 MCP host 不得依赖 Git 执行实现；
9. 模块 exporter 不得依赖 Git、调度器、凭证存储或数据镜像管理界面。

建立规则后，必须临时加入一次故意违规 import，确认 CI 能拦截，再删除违规代码。

## 6. 模块契约

不得使用一个跨运行时的巨型 `ModuleManifest` 同时承载 React、Fastify、迁移和 Agent 实现。

模块必须拆分为：

```text
manifest.ts       仅含运行时无关元数据
shared/           schema、类型、资源描述
server/index.ts   路由、服务、搜索、迁移注册
web/index.ts      页面、菜单、widget、actions
agent/index.ts    Agent resource 与 capability
offline/index.ts  可离线操作声明与重放策略
migrations/       顺序迁移文件
```

推荐的契约概念：

- `ModuleMetadata`：id、name、version、description、capabilities；
- `ServerModule`：routes、resources、migrations、search、capture；
- `WebModule`：routes、menu、widgets、actions；
- `AgentModule`：resources、operations、projections；
- `OfflineModule`：允许的离线操作和冲突策略；
- `DataMirrorExporter`：模块服务端的可读和结构化数据导出能力。

`manifest.ts` 不得 import React、Fastify、数据库实例或 Node 专用实现。

应用构建阶段生成模块 registry。不得让 Node 运行时依赖 Vite 专用的 `import.meta.glob`。

Web 模块通过标准导航契约注册菜单项和页面。建议的契约概念为：

```ts
interface NavigationItem {
  id: string;
  label: string;
  iconKey: string;
  route: string;
  order?: number;
}
```

模块只声明语义 `iconKey`，不得 import Lucide 图标、具体主题图标组件或其他图标包实现。菜单合并、排序、冲突验证、活动路由状态和最终图标解析由应用 registry 与框架宿主负责。

模块可以在服务端入口提供可选的数据镜像 exporter。规划中的契约概念为：

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

约束：

- exporter 只能存在于模块服务端入口，不得放入 Web、offline 或 Agent 入口；
- exporter 通过受限、只读的 `ExportContext` 读取一致数据视图，不得获得 raw database；
- exporter 只能输出自身模块和当前 profile 的命名空间；
- 模块负责自身字段含义、可读格式和结构化格式；
- 框架负责路径校验、汇总、根 manifest、临时目录、调度、Git commit 和 push；
- exporter 不得读取 Git 凭证、执行 Git 命令或自行创建定时任务；
- exporter 不得修改业务数据，也不得输出密码、token、密钥或其他 secret；
- Data Mirror Engine 只调用已启用模块的 exporter。

`ExportContext`、`ExportedFile` 和 manifest 的最终字段需要在实现前通过 ADR 确定。

## 7. 已安装与已启用模块

必须区分：

- `installedModules`：应用构建时包含的模块；
- `enabledModules`：某个部署实例当前启用的模块，必须是 installed 的子集。

约束：

- 未安装模块不进入产物；
- 已安装但未启用模块不得注册 API、菜单、widget、搜索 provider 或 Agent resource；
- 前端按模块拆分动态 chunk；
- 模块禁用不得删除其数据；
- 重新启用后应恢复访问；
- migrations 只对已安装模块执行，是否随启用状态执行必须由迁移策略明确决定，不能临时猜测。

初期推荐：安装即允许迁移，启用只控制能力暴露，避免因临时禁用导致数据库版本停滞。

## 8. HostContext 与数据访问

模块不得获得裸数据库连接。

`HostContext` 应提供受限能力，例如：

- `scopedDb`；
- `profileId`；
- `requireAdmin()`；
- `log`；
- `ids`；
- `tags`；
- `relations`；
- `attachments`；
- `audit`；
- `config`；
- `resources`。

`ScopedDb` 必须自动处理：

- `profile_id` 条件；
- `deleted_at IS NULL`；
- 创建和更新时间；
- 审计上下文；
- 允许的事务边界。

只有 `packages/core` 内部和迁移执行器可以访问 raw database。

禁止模块手工拼接 profile 条件作为主要防线。

数据镜像导出必须使用受控的只读上下文，并遵守 profile scope。Data Mirror Engine 可以编排跨模块导出，但不得把 raw database 暴露给 exporter。一次镜像任务必须基于一致的数据视图，且导出过程不得修改业务数据。

## 9. 数据约定

- 主键使用客户端可生成的 UUID v7；
- UUID 是内部标识，默认不暴露给人和 Agent；
- 每个资源由服务端分配递增 `seq`；
- 短 ID 形如 `note-142`；
- `id_counters` 按部署实例和资源类型计数，短 ID 在部署实例内唯一；
- 离线创建时客户端先持有 UUID，服务端接收后返回 UUID 到短 ID 的映射；
- 所有业务表包含 `profile_id`、`created_at`、`updated_at`、`deleted_at`、`seq`；
- 时间存储为 ISO-8601 UTC；
- 金额使用整数最小货币单位，禁止浮点；
- 模块表以模块 id 为前缀；
- 可索引的一对多数据使用独立表，不以 JSON 代替关系模型。

SQLite 必须启用：

- `journal_mode=WAL`；
- `busy_timeout=5000`；
- `foreign_keys=ON`；
- `synchronous=NORMAL`。

数据库文件必须位于持久化本地卷，不得放在容器可写层或 NFS。

## 10. 跨模块关联

模块之间不允许通过外键或共享业务类型直接耦合。

跨模块关系统一通过 core 的：

- resource registry；
- `relations`；
- `entity_tags`；
- `attachments`。

例如“流水的交易对手是联系人”不得在 ledger 表中增加 `contact_id` 或 `counterparty_ref` 指向 contacts。应通过标准 relation 表达，或保留普通文本快照。

resource registry 必须验证资源类型和目标是否存在，并处理软删除后的关联可见性。

## 11. 派生数据

余额、月度合计、分类占比、统计图表、聚合计数等派生结果必须由服务端计算。

客户端和 Agent 只能提交原始事实并消费结果，不能成为权威计算来源。

不得把可推导汇总字段作为长期真相存入业务表。确需缓存时，必须明确缓存失效策略并可由原始数据重建。

## 12. HTTP API

- 框架 API 位于 `/api/core/*`；
- 模块 API 位于 `/api/m/{moduleId}/*`；
- 请求与响应 schema 用 Zod 定义并共享；
- 响应统一为 `{ data }` 或 `{ error: { code, message, details? } }`；
- 列表默认游标分页；
- 写操作支持幂等键；
- API 错误码必须稳定且可测试；
- 上传接口必须校验大小、MIME、扩展名和文件名；
- 附件读取必须经过鉴权，不能暴露静态目录。
- 数据镜像管理员 API 位于 `/api/core/admin/data-mirror/*`，必须验证 admin challenge；
- 数据镜像 API 可以提供脱敏配置、状态、测试连接、立即推送和执行历史；
- API 不得返回 Git token、SSH 私钥或其他完整 secret；
- 普通 profile、客户端和 Agent scope 不得获得数据镜像管理权限。

API 变更必须同步更新 contracts、测试和文档。

## 13. 认证与 Profile

框架支持：

- `single`：单档案；
- `profiles`：一个部署实例中的多个档案。

使用密码用于进入部署实例；管理员密码用于敏感操作，两者必须不同。

安全要求：

- 密码只存强哈希；
- Cookie 使用 HttpOnly、Secure、SameSite；
- 改变状态的浏览器请求需要 CSRF 防护；
- 支持逐设备会话撤销和全局退出；
- Agent token 只存哈希和可识别前缀；
- Agent token 绑定 profile、scope、创建时间、过期时间、最后使用时间和撤销状态；
- Tauri 凭证存系统 keychain。

客户端提交的 profile 标识不能绕过服务端授权。

数据镜像的 SSH Deploy Key 和 Personal Access Token 只能存放在服务端 secret 存储中，不得写入应用源码、普通配置、数据镜像仓库、导出文件、日志或客户端响应。Web 管理端只能显示认证类型、脱敏仓库信息和密钥指纹。敏感配置变更、测试连接和立即推送必须要求管理员验证并记录审计事件。

## 14. 离线与同步

采用在线优先：

- 默认离线只读；
- 仅白名单操作允许进入 outbox；
- 不实现 CRDT；
- 排序和复杂聚合修改默认不离线；
- 每个离线写入携带客户端 UUID、幂等键、基础版本和时间；
- 重放响应返回短 ID 映射和冲突结果；
- 冲突不得静默覆盖，应保留审计信息。

缓存和同步状态应统一通过 heartbeat/sync-state 机制管理，避免多个页面各自轮询健康、版本和更新时间。

## 15. Agent 通道

Agent 通过 `@atrium/mcp-host` 使用标准能力，不直接访问数据库，也不包含具体模块逻辑。

通用工具总数控制在 10 个以内，推荐：

- `list`；
- `get`；
- `create`；
- `update`；
- `delete`；
- `search`；
- `relate`；
- `capture`；
- `describe`。

资源类型作为参数传入。模块通过 Agent 契约声明自身资源和操作。

要求：

- 默认返回最小字段集；
- 支持 fields 投影；
- 默认 limit 为 10；
- 省略空字段；
- 对外使用短 ID；
- 写入支持批量和幂等；
- 删除使用软删除；
- 所有 Agent 写入进入 audit log；
- token scope 和 profile 必须在服务端强制执行；
- 模块禁用后相关资源自动消失。

## 16. Web、主题与布局

框架提供统一工作台外壳，但不得包含具体模块页面。

### 16.1 应用外壳与导航

桌面端采用“左侧功能菜单 + 右侧功能区域”的整体布局。

- 框架负责侧栏、菜单折叠状态、移动抽屉、页面功能区和主题切换；
- 左侧菜单展开时显示图标和文字；
- 左侧菜单折叠时只显示图标，并通过 tooltip 显示名称；
- 每个菜单项必须包含语义 `iconKey`，并支持当前页面高亮；
- 设置、主题切换等框架入口可以位于侧栏底部；
- 右侧区域用于显示当前模块页面，可包含页面标题、搜索、筛选、主要操作和模块内容；
- 移动端不保留固定侧栏，改用基于同一菜单定义生成的抽屉式导航；
- 模块只能注册菜单项、路由和页面，不得创建脱离框架外壳的独立导航系统。

### 16.2 视觉主题包

主题必须实现为受控的视觉主题包（Theme Pack），而不只是颜色集合。规划中的契约概念为：

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

- 颜色和明暗外观；
- 字体；
- 图标风格；
- 圆角、边框和阴影；
- 按钮、输入框和卡片样式；
- 间距和视觉密度；
- 背景纹理和装饰效果。

主题分为：

- **基础主题**：主要改变浅色、深色、主题色、圆角、阴影和密度；
- **风格主题**：可以产生像素风、可爱风、科技风等明显不同的整体画风。

主题可以改变视觉表现，但不得改变产品的信息结构、菜单层级、路由、核心操作位置或业务逻辑。

### 16.3 语义图标

- 模块只能声明语义 `iconKey`，不得决定最终图标实现；
- 当前 Theme Icon Pack 负责把 `iconKey` 映射为实际图标；
- 默认主题的图标包使用 Lucide；
- 风格主题可以提供其他图标实现；
- 所有主题必须覆盖框架规定的基础语义图标；
- 主题缺少某个图标时必须回退到默认图标包；
- 禁止业务模块直接 import 某个具体主题的图标组件。

### 16.4 模块 UI 边界

- 同一模块页面跨桌面、紧凑和移动宽度复用同一组件树；
- 响应差异由框架布局容器承担；
- 颜色、字体和尺寸全部使用语义 token；
- 业务代码禁止十六进制色值、Tailwind 具名颜色和主题专属样式；
- 禁止硬编码框架布局尺寸；
- 模块页面只能使用公开 UI primitives；
- 主题通过受控契约和 token 生效，不得向模块注入任意全局 CSS 选择器；
- 主题负责视觉表现，不得包含业务逻辑。

### 16.5 可访问性

- 所有主题必须保留语义化 HTML、键盘操作、清晰焦点和文字可读性；
- 纯图标交互必须具有可访问名称；折叠菜单必须提供 tooltip；
- 主题不得通过低对比度、过小字号或过小触控目标牺牲可访问性；
- 像素风等特殊主题不得把整个页面渲染为图片或 Canvas；
- 主题可以调整视觉密度和装饰，但不得破坏内容阅读顺序和辅助技术语义。

首屏 gzip 目标不超过 250KB；单模块前端 chunk 目标不超过 100KB。

正则只能作为基础检查。关键样式规则应通过 ESLint AST 规则和组件测试共同保证。

## 17. 官方便签模块

`modules/notes` 是第一个官方通用模块和框架基准模块。

它必须：

- 完全通过标准模块契约接入；
- 可被应用启用或禁用；
- 不要求 core、host 或 UI 外壳增加任何便签特例；
- 覆盖迁移、CRUD、搜索、capture、标签、关联、附件、Web 页面、Agent 和离线白名单等主链路；
- 使用通用资源注册和 scoped data access；
- 作为 reference app 的端到端验证模块。

便签模块可以与框架同仓，但必须作为独立包发布和版本化。

## 18. 应用模板

`templates/workbench-app` 应生成独立应用仓库所需的最小结构：

```text
apps/server
apps/web
apps/desktop
apps/mcp
modules/
config/application.ts
deploy/
docs/PRD.md
AGENTS.md
```

应用配置描述应用品牌、已安装模块、默认启用模块、默认主题、首页布局、语言和时区默认值。

域名、数据库路径、密钥、备份位置等部署信息不得写入应用源码配置。

## 19. 可读数据镜像

### 19.1 能力定位

可读数据镜像（Readable Data Mirror）是部署实例的 **Server-only capability**，Web 仅提供 **Admin-only configuration UI**。

```text
Atrium 服务端数据库
        ↓
已启用模块的 DataMirrorExporter
        ↓
Data Mirror Engine
        ↓
Git commit / push
        ↓
私有远程 Git 仓库
```

数据只允许单向从 Atrium 服务端流向远程仓库。服务端数据库仍是唯一事实来源；远程仓库只用于阅读和留档，不参与运行时同步。第一版不支持从 Git 导入、恢复或双向同步。

### 19.2 服务端与客户端边界

只有服务端可以：

- 读取数据库并调用 exporter；
- 生成 Markdown、JSON、CSV 和附件元数据；
- 管理临时导出目录；
- 执行定时任务和任务锁；
- 执行 Git clone、fetch、pull、commit 和 push；
- 访问 Git 凭证；
- 管理重试和执行历史。

PWA、移动端、macOS、Windows、普通浏览器、desktop-host 和 Agent/MCP 客户端不得保存 Git token 或 SSH 私钥、执行 Git 命令、创建独立镜像或在本地定时推送。关闭所有客户端后，服务端仍必须能够按计划运行。

### 19.3 文件格式与模块边界

远程仓库应同时包含便于人阅读的文件和便于未来迁移的结构化文件。Notes 第一版导出 Markdown 和 JSON；其他模块可以选择适合自身数据的 Markdown、JSON 或 CSV。

框架不得理解 notes、todos、ledger 等具体字段。模块 exporter 负责业务内容，Data Mirror Engine 负责调度、路径安全、完整重建、manifest 和 Git 操作。

删除业务数据后，最新镜像可以删除对应文件；历史内容由 Git 历史保留，第一版不维护额外回收站目录。

### 19.4 Git 目的地与凭证

第一版只支持一个通用 Git 目的地，以标准仓库地址连接 GitHub、Gitee、Gitea 或其他 Git 服务，不编写平台专用业务逻辑。

配置包括：

- 是否启用；
- 仓库地址；
- 目标分支；
- 可选数据目录前缀；
- SSH Deploy Key 或 Personal Access Token；
- 每日或每周推送周期；
- 是否包含附件；
- 最后成功时间；
- 最后失败原因。

优先推荐只授权单一仓库的 SSH Deploy Key。凭证只进入服务端 secret 存储；前端只能看到脱敏信息和指纹。

### 19.5 推送流程

每次任务必须：

1. 获取数据镜像任务锁；
2. 读取一致的数据视图；
3. 调用已启用模块的 exporter；
4. 在临时目录重新生成完整镜像；
5. 校验文件内容、相对路径和命名空间；
6. 获取远程仓库最新状态；
7. 更新目标数据目录；
8. 检查是否存在实际变化；
9. 有变化时创建 commit；
10. push 到目标分支；
11. 记录执行结果；
12. 清理临时目录。

无变化不得创建空提交。提交信息可以使用 `data: mirror YYYY-MM-DD HH:mm UTC`。不得默认 force push。

远程仓库或目标分支应由 Atrium 独占写入。检测到无法安全合并的人工提交或分支分歧时，必须停止推送并提示管理员，不得静默覆盖。

### 19.6 附件、隐私与管理界面

第一版默认不推送附件，只导出正文、结构化字段、附件名称和元数据。可以保留“包含附件”设置，但必须警告仓库体积可能快速增长。Git LFS、独立附件仓库和大文件策略不属于第一版。

管理员必须看到明确警告：

> 数据镜像包含可直接阅读的个人或家庭数据，请使用私有 Git 仓库。

能够查询仓库可见性时，应阻止或强烈警告公开仓库；无法查询时，必须要求管理员明确确认风险。

Web 管理端可以提供启用、仓库、分支、认证类型、周期、附件选项、测试连接、立即推送、查看仓库和推送历史。页面只能调用管理员 API，不得直接执行 Git 或获取完整凭证。

### 19.7 第一版范围

第一版包含：

- 一个通用远程 Git 仓库；
- 任意标准 Git 地址；
- SSH Deploy Key 和 Personal Access Token；
- 手动立即推送；
- 每日或每周自动推送；
- Notes Markdown 和 JSON exporter；
- 统一 exporter 契约；
- 无变化不提交；
- 任务锁、失败记录和重试；
- 管理员配置界面；
- 默认不包含附件；
- 冲突停止和私有仓库要求。

第一版不包含应用源码、SQLite 文件或部署环境备份，也不包含 Git 导入、恢复、双向同步、客户端推送、多远端、Git LFS 或平台专用实现。

## 20. 部署约束

每个应用独立构建和部署：

- 独立镜像；
- 独立 Compose project；
- 独立数据库；
- 独立附件目录；
- 独立密钥；
- 独立域名；
- 独立备份和恢复流程。

SQLite 部署不使用两个应用容器同时写同一数据库的滚动更新。

推荐升级流程：

1. 停止旧应用写入；
2. checkpoint 并备份 SQLite；
3. 启动新版本执行兼容检查和迁移；
4. 启动服务并通过健康检查；
5. 失败时恢复旧镜像和备份。

迁移必须单实例执行。恢复流程必须实际演练。

Litestream 和 SQLite 备份负责灾难恢复；可读数据镜像负责普通文件留档。二者不得混淆，应用升级和数据库恢复流程不得依赖数据镜像仓库。

## 21. 版本与兼容

- 框架包和官方模块使用语义化版本；
- 各包可以独立发布；
- 应用锁定精确版本或受控范围；
- Atrium 发布新版本不自动升级应用；
- 个人工作台和家庭工作台可在不同时间升级；
- breaking change 必须提供迁移说明；
- 禁止应用复制框架源码后长期维护私有分叉；
- 应用发现通用缺口时，应先在 Atrium 修复并发布，再升级应用依赖。

## 22. 测试与 CI

最低检查：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

仓库骨架尚未提供命令前，不得声称这些检查已通过。

测试至少覆盖：

- package exports；
- 禁止依赖方向；
- 模块注册和禁用；
- profile scope；
- soft delete；
- migrations；
- UUID/短 ID 映射；
- 幂等重放；
- Agent scope；
- reference app 端到端流程；
- 官方 notes 模块不依赖宿主特例；
- 展开和折叠菜单行为；
- 桌面侧栏与移动抽屉共享同一菜单定义；
- 活动路由高亮；
- 语义图标映射和默认图标回退；
- 主题切换不改变路由和信息结构；
- 键盘导航、焦点和基础可访问性；
- 模块不直接依赖具体主题或图标实现；
- Data Mirror Engine 和 Git 执行实现只存在于服务端；
- exporter 路径穿越、绝对路径和跨模块命名空间被拒绝；
- exporter 遵守 profile scope 且不修改业务数据；
- secret 不进入导出文件、Git 仓库、日志或 API 响应；
- disabled 模块不参与导出；
- 无变化不创建 commit；
- 任务锁阻止并发推送；
- 远端冲突停止推送且不 force push；
- 失败历史和重试状态可查询；
- 默认不导出附件；
- 管理 API 要求 admin challenge；
- 客户端包不包含 Git 执行实现或凭证。

## 23. Agent 工作流程

接到实现任务后：

1. 阅读 `AGENTS.md`、`docs/PRD.md` 和任务涉及的 contracts；
2. 输出实施计划，列出文件、步骤、验证方式和潜在冲突；
3. 等待用户确认后再修改代码；
4. 以最小垂直切片交付；
5. 每个 commit 只包含一个清晰意图；
6. 完成后运行适用检查；
7. 报告实际执行结果，不得虚构；
8. 发现文档缺失或冲突时主动提出修改。

不得一次性生成整个框架和所有应用。

优先顺序：

1. 规格澄清；
2. 工程骨架和架构守卫；
3. contracts；
4. core 最小能力；
5. host；
6. notes 垂直切片；
7. reference app；
8. 发布与应用模板。

## 24. 文档纪律

- README 说明仓库定位和入口；
- PRD 记录产品与架构需求；
- AGENTS 记录工程执行约束；
- contracts 是可执行接口，但不得以现有代码为理由忽略已确认文档；
- API、配置、模块契约或部署模型变更必须同步修改文档；
- 不得保留 `Copy`、损坏代码块或粘贴工具产生的格式残留；
- 不得引用尚不存在的文件而不注明“规划中”。

## 25. 硬性禁止项

- 在框架 core 中加入具体业务逻辑；
- 宿主 import 具体模块；
- 模块互相 import；
- 模块访问 raw database；
- 客户端直接访问数据库；
- Agent 直接访问数据库；
- 用应用配置承载部署密钥；
- 多个应用共享同一个数据库文件；
- SQLite 更新时双写同一数据库；
- 把个人工作台和家庭工作台作为同仓的两份实例配置；
- 模块创建脱离框架外壳的独立导航系统；
- 模块直接 import 具体主题或图标包的组件；
- 业务代码写死主题颜色、字体或主题专属样式；
- 主题改变业务逻辑、菜单层级、路由或产品信息结构；
- 通过整页图片或 Canvas 实现主题；
- 主题破坏键盘操作、焦点可见性或文字可读性；
- 在 PWA、浏览器、桌面、移动端或 Agent/MCP 客户端执行数据镜像 Git 操作；
- 客户端保存数据镜像 Git token 或 SSH 私钥；
- 模块 exporter 管理 Git 凭证、执行 Git 或自行调度；
- 把远程镜像仓库作为数据权威或运行时同步源；
- 第一版从 Git 自动导入、恢复或执行双向同步；
- 默认 force push 或静默覆盖远程人工提交；
- 把应用源码、SQLite 文件、Docker 或部署配置当作可读数据镜像；
- 将 secret 写入导出文件、日志、Git 仓库或客户端响应；
- 未经验证声称测试或部署成功；
- 未经确认替换固定技术栈。
