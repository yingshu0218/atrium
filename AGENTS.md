AGENTS.md

本文档定义 Atrium 仓库中 AI 编码 Agent 和开发者必须遵守的工程约束。

完整产品与架构需求见 docs/PRD.md。本文档侧重实施纪律、代码边界和交付流程。两份文档出现冲突时，不得静默选择其一；必须指出冲突、说明影响，并在用户确认后同步修正文档和实现。

1. 仓库定位

Atrium 是“通用工作台框架 + 官方通用模块”的 monorepo。

本仓库不是个人工作台或家庭工作台的应用仓库。正式应用必须作为独立项目存在，并通过版本化依赖消费 Atrium。

必须始终区分：

框架（Framework）：通用基础设施与宿主；

官方模块（First-party Module）：可选、可独立版本化的通用业务模块；

应用（Application）：独立仓库中的产品组合；

部署实例（Deployment Instance）：应用的一次独立部署；

客户端（Client）：Web、PWA、桌面、移动端或 Agent。

个人工作台和家庭工作台是两个独立应用，不是同一个仓库中的两份配置。

2. 决策原则

任何能力准备进入 packages/* 前，必须回答：

该能力是否不依赖具体业务，并且能被多个不同工作台应用以相同语义复用？

任何模块准备进入 modules/* 前，必须回答：

该模块是否至少适用于两类不同工作台，且不要求宿主或 core 为其增加特例？

不满足条件的内容必须放在具体应用仓库。

禁止为了加快第一个应用的开发，把个人工作台特有逻辑塞入 Atrium。

3. 固定技术栈

未经用户明确批准，不得替换以下选型，也不得引入功能重叠的大型依赖。

层

选型

运行时

Node.js 22

服务端

Fastify + TypeScript

数据库

SQLite + better-sqlite3 + Drizzle ORM

前端

React 19 + Vite + TypeScript + React Router

样式

Tailwind CSS v4 + shadcn/ui

数据请求

TanStack Query

表单与校验

react-hook-form + Zod

图标

lucide，唯一图标来源

桌面

Tauri v2

移动

PWA；原生移动端不属于初期范围

包管理

pnpm workspace

单元测试

Vitest

端到端测试

Playwright

部署

Docker Compose + Caddy

备份

Litestream

引入第三方依赖前，计划中必须说明用途、体积、维护状态、替代方案和退出成本。

4. 目标目录

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

新增包和模块不得自创顶层布局。确需调整目录，必须先修改计划和架构文档。

5. 依赖方向

允许的依赖方向：

application repository
  ├── Atrium host packages
  ├── Atrium official modules
  └── application-specific modules

host packages ──▶ contracts/core/ui/theme
modules       ──▶ contracts，以及按需依赖受公开导出的 core/ui/theme API
core          ──▶ contracts

硬性规则：

宿主不得 import 任何具体模块；

模块之间不得直接 import；

框架包中不得出现 notes、ledger、homework 等具体业务判断；

应用专有模块不得进入 Atrium 仓库；

不得通过相对路径绕过 package exports；

core 的内部实现不得被模块直接访问；

依赖方向必须由 ESLint 和架构测试共同验证。

建立规则后，必须临时加入一次故意违规 import，确认 CI 能拦截，再删除违规代码。

6. 模块契约

不得使用一个跨运行时的巨型 ModuleManifest 同时承载 React、Fastify、迁移和 Agent 实现。

模块必须拆分为：

manifest.ts       仅含运行时无关元数据
shared/           schema、类型、资源描述
server/index.ts   路由、服务、搜索、迁移注册
web/index.ts      页面、菜单、widget、actions
agent/index.ts    Agent resource 与 capability
offline/index.ts  可离线操作声明与重放策略
migrations/       顺序迁移文件

推荐的契约概念：

ModuleMetadata：id、name、version、description、capabilities；

ServerModule：routes、resources、migrations、search、capture；

WebModule：routes、menu、widgets、actions；

AgentModule：resources、operations、projections；

OfflineModule：允许的离线操作和冲突策略。

manifest.ts 不得 import React、Fastify、数据库实例或 Node 专用实现。

应用构建阶段生成模块 registry。不得让 Node 运行时依赖 Vite 专用的 import.meta.glob。

7. 已安装与已启用模块

必须区分：

installedModules：应用构建时包含的模块；

enabledModules：某个部署实例当前启用的模块，必须是 installed 的子集。

约束：

未安装模块不进入产物；

已安装但未启用模块不得注册 API、菜单、widget、搜索 provider 或 Agent resource；

前端按模块拆分动态 chunk；

模块禁用不得删除其数据；

重新启用后应恢复访问；

migrations 只对已安装模块执行，是否随启用状态执行必须由迁移策略明确决定，不能临时猜测。

初期推荐：安装即允许迁移，启用只控制能力暴露，避免因临时禁用导致数据库版本停滞。

8. HostContext 与数据访问

模块不得获得裸数据库连接。

HostContext 应提供受限能力，例如：

scopedDb；

profileId；

requireAdmin()；

log；

ids；

tags；

relations；

attachments；

audit；

config；

resources。

ScopedDb 必须自动处理：

profile_id 条件；

deleted_at IS NULL；

创建和更新时间；

审计上下文；

允许的事务边界。

只有 packages/core 内部和迁移执行器可以访问 raw database。

禁止模块手工拼接 profile 条件作为主要防线。

9. 数据约定

主键使用客户端可生成的 UUID v7；

UUID 是内部标识，默认不暴露给人和 Agent；

每个资源由服务端分配递增 seq；

短 ID 形如 note-142；

id_counters 按部署实例和资源类型计数，短 ID 在部署实例内唯一；

离线创建时客户端先持有 UUID，服务端接收后返回 UUID 到短 ID 的映射；

所有业务表包含 profile_id、created_at、updated_at、deleted_at、seq；

时间存储为 ISO-8601 UTC；

金额使用整数最小货币单位，禁止浮点；

模块表以模块 id 为前缀；

可索引的一对多数据使用独立表，不以 JSON 代替关系模型。

SQLite 必须启用：

journal_mode=WAL；

busy_timeout=5000；

foreign_keys=ON；

synchronous=NORMAL。

数据库文件必须位于持久化本地卷，不得放在容器可写层或 NFS。

10. 跨模块关联

模块之间不允许通过外键或共享业务类型直接耦合。

跨模块关系统一通过 core 的：

resource registry；

relations；

entity_tags；

attachments。

例如“流水的交易对手是联系人”不得在 ledger 表中增加 contact_id 或 counterparty_ref 指向 contacts。应通过标准 relation 表达，或保留普通文本快照。

resource registry 必须验证资源类型和目标是否存在，并处理软删除后的关联可见性。

11. 派生数据

余额、月度合计、分类占比、统计图表、聚合计数等派生结果必须由服务端计算。

客户端和 Agent 只能提交原始事实并消费结果，不能成为权威计算来源。

不得把可推导汇总字段作为长期真相存入业务表。确需缓存时，必须明确缓存失效策略并可由原始数据重建。

12. HTTP API

框架 API 位于 /api/core/*；

模块 API 位于 /api/m/{moduleId}/*；

请求与响应 schema 用 Zod 定义并共享；

响应统一为 { data } 或 { error: { code, message, details? } }；

列表默认游标分页；

写操作支持幂等键；

API 错误码必须稳定且可测试；

上传接口必须校验大小、MIME、扩展名和文件名；

附件读取必须经过鉴权，不能暴露静态目录。

API 变更必须同步更新 contracts、测试和文档。

13. 认证与 Profile

框架支持：

single：单档案；

profiles：一个部署实例中的多个档案。

使用密码用于进入部署实例；管理员密码用于敏感操作，两者必须不同。

安全要求：

密码只存强哈希；

Cookie 使用 HttpOnly、Secure、SameSite；

改变状态的浏览器请求需要 CSRF 防护；

支持逐设备会话撤销和全局退出；

Agent token 只存哈希和可识别前缀；

Agent token 绑定 profile、scope、创建时间、过期时间、最后使用时间和撤销状态；

Tauri 凭证存系统 keychain。

客户端提交的 profile 标识不能绕过服务端授权。

14. 离线与同步

采用在线优先：

默认离线只读；

仅白名单操作允许进入 outbox；

不实现 CRDT；

排序和复杂聚合修改默认不离线；

每个离线写入携带客户端 UUID、幂等键、基础版本和时间；

重放响应返回短 ID 映射和冲突结果；

冲突不得静默覆盖，应保留审计信息。

缓存和同步状态应统一通过 heartbeat/sync-state 机制管理，避免多个页面各自轮询健康、版本和更新时间。

15. Agent 通道

Agent 通过 @atrium/mcp-host 使用标准能力，不直接访问数据库，也不包含具体模块逻辑。

通用工具总数控制在 10 个以内，推荐：

list；

get；

create；

update；

delete；

search；

relate；

capture；

describe。

资源类型作为参数传入。模块通过 Agent 契约声明自身资源和操作。

要求：

默认返回最小字段集；

支持 fields 投影；

默认 limit 为 10；

省略空字段；

对外使用短 ID；

写入支持批量和幂等；

删除使用软删除；

所有 Agent 写入进入 audit log；

token scope 和 profile 必须在服务端强制执行；

模块禁用后相关资源自动消失。

16. Web、主题与布局

框架提供统一工作台外壳，但不得包含具体模块页面。

要求：

同一模块页面跨桌面、紧凑和移动宽度复用同一组件树；

响应差异由布局容器承担；

颜色和尺寸全部使用语义 token；

业务代码禁止十六进制色值和 Tailwind 具名颜色；

禁止硬编码框架布局尺寸；

图标只使用 lucide；

模块页面只能使用公开 UI primitives；

主题只能覆盖 token，不得注入任意 CSS 选择器。

首屏 gzip 目标不超过 250KB；单模块前端 chunk 目标不超过 100KB。

正则只能作为基础检查。关键样式规则应通过 ESLint AST 规则和组件测试共同保证。

17. 官方便签模块

modules/notes 是第一个官方通用模块和框架基准模块。

它必须：

完全通过标准模块契约接入；

可被应用启用或禁用；

不要求 core、host 或 UI 外壳增加任何便签特例；

覆盖迁移、CRUD、搜索、capture、标签、关联、附件、Web 页面、Agent 和离线白名单等主链路；

使用通用资源注册和 scoped data access；

作为 reference app 的端到端验证模块。

便签模块可以与框架同仓，但必须作为独立包发布和版本化。

18. 应用模板

templates/workbench-app 应生成独立应用仓库所需的最小结构：

apps/server
apps/web
apps/desktop
apps/mcp
modules/
config/application.ts
deploy/
docs/PRD.md
AGENTS.md

应用配置描述应用品牌、已安装模块、默认启用模块、默认主题、首页布局、语言和时区默认值。

域名、数据库路径、密钥、备份位置等部署信息不得写入应用源码配置。

19. 部署约束

每个应用独立构建和部署：

独立镜像；

独立 Compose project；

独立数据库；

独立附件目录；

独立密钥；

独立域名；

独立备份和恢复流程。

SQLite 部署不使用两个应用容器同时写同一数据库的滚动更新。

推荐升级流程：

停止旧应用写入；

checkpoint 并备份 SQLite；

启动新版本执行兼容检查和迁移；

启动服务并通过健康检查；

失败时恢复旧镜像和备份。

迁移必须单实例执行。恢复流程必须实际演练。

20. 版本与兼容

框架包和官方模块使用语义化版本；

各包可以独立发布；

应用锁定精确版本或受控范围；

Atrium 发布新版本不自动升级应用；

个人工作台和家庭工作台可在不同时间升级；

breaking change 必须提供迁移说明；

禁止应用复制框架源码后长期维护私有分叉；

应用发现通用缺口时，应先在 Atrium 修复并发布，再升级应用依赖。

21. 测试与 CI

最低检查：

pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build

仓库骨架尚未提供命令前，不得声称这些检查已通过。

测试至少覆盖：

package exports；

禁止依赖方向；

模块注册和禁用；

profile scope；

soft delete；

migrations；

UUID/短 ID 映射；

幂等重放；

Agent scope；

reference app 端到端流程；

官方 notes 模块不依赖宿主特例。

22. Agent 工作流程

接到实现任务后：

阅读 AGENTS.md、docs/PRD.md 和任务涉及的 contracts；

输出实施计划，列出文件、步骤、验证方式和潜在冲突；

等待用户确认后再修改代码；

以最小垂直切片交付；

每个 commit 只包含一个清晰意图；

完成后运行适用检查；

报告实际执行结果，不得虚构；

发现文档缺失或冲突时主动提出修改。

不得一次性生成整个框架和所有应用。

优先顺序：

规格澄清；

工程骨架和架构守卫；

contracts；

core 最小能力；

host；

notes 垂直切片；

reference app；

发布与应用模板。

23. 文档纪律

README 说明仓库定位和入口；

PRD 记录产品与架构需求；

AGENTS 记录工程执行约束；

contracts 是可执行接口，但不得以现有代码为理由忽略已确认文档；

API、配置、模块契约或部署模型变更必须同步修改文档；

不得保留 Copy、损坏代码块或粘贴工具产生的格式残留；

不得引用尚不存在的文件而不注明“规划中”。

24. 硬性禁止项

在框架 core 中加入具体业务逻辑；

宿主 import 具体模块；

模块互相 import；

模块访问 raw database；

客户端直接访问数据库；

Agent 直接访问数据库；

用应用配置承载部署密钥；

多个应用共享同一个数据库文件；

SQLite 更新时双写同一数据库；

把个人工作台和家庭工作台作为同仓的两份实例配置；

未经验证声称测试或部署成功；

未经确认替换固定技术栈。
