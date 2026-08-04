Atrium 工作台框架 产品需求文档
项	内容
文档版本	v1.3
状态	待开发
文档定位	需求、数据模型、契约的唯一事实来源
关联文档	AGENTS.md（技术约束与协作规范，冲突时以其为准）、docs/ROADMAP.md（长期规划，非开发依据）
0. 修订记录
版本	变更摘要
v1.0	初版，个人工作台需求
v1.1	明确框架/实例分层；新增 Agent 通道章节
v1.2	重写认证章节（双密码 + 档案模式）；删除 users、trusted_devices 表，新增 instance_settings、profiles；网络策略改为在线优先 + 离线只读 + 白名单写队列；ModuleManifest 增加 offlineOps；阶段拆分为 8 期
v1.3	新增第 12 章「界面框架」；布局尺寸纳入 token；ModuleManifest 增加 menu、badge、layout、actions、widget.size；数据表统一字段 user_id 更名为 profile_id
1. 项目定位
Atrium 是一个可复用的工作台框架。框架本身不包含任何业务逻辑，业务全部以模块形式存在。一个"工作台实例" = 同一套框架 + 一份实例配置 + 一组启用的模块。

本次交付的个人工作台是第一个实例。后续将基于同一框架开发家庭工作台（围绕孩子与家庭生活）等实例。

框架是否成立的判断标准只有一条：开发第二个实例时，不需要改动框架层代码，只需要新增模块和修改配置。

1.1 分层
框架层：packages/contracts、packages/core、packages/ui、packages/theme，以及 apps/server、apps/web、apps/desktop、apps/mcp 中的宿主壳。此层不得出现任何业务模块名称或概念。

实例层：config/ 下的配置文件，包含实例名称、logo、默认主题、实例模式、启用模块列表、首页默认布局、时区与语言。

模块层：modules/ 下各业务模块，通过 manifest 向宿主声明自身能力。

1.2 成功指标
上线后连续两周每日实际使用；旧的便签、书签、记账数据完成迁移且不再打开原工具；新增模块无需改动宿主代码；发布全流程由 CI/CD 完成，不需要手动登录 VPS 编译部署。

2. 名词表
名词	含义
实例 (Instance)	一次独立部署的工作台，拥有独立容器、独立数据库文件、独立子域名
实例模式	single（单档案）或 profiles（多档案共用一个使用密码）
档案 (Profile)	实例内的一个使用身份，含昵称、头像、颜色；数据按档案隔离
使用密码	进入实例所需的密码，全实例共用一个
管理员密码	执行敏感操作时逐次校验的密码，与使用密码必须不同
模块 (Module)	一个业务功能单元，位于 modules/<id>/
宿主 (Host)	负责加载模块、渲染外壳、提供公共能力的框架部分
短 ID	面向人与 agent 的可读标识，形如 note-142
离线白名单	允许在断网时写入并进入队列的操作集合
派生数据	由原始记录计算得出的统计结果，一律由服务端计算
3. 用户与场景
单人使用（个人实例）或家庭成员共用（家庭实例）。无注册流程，无外部访客。

典型场景：在电脑前用快捷键随手记一条想法；在手机上勾掉一条已完成的待办；在地铁弱网环境下查看今天的待办清单；核对孩子作业完成情况后，家人在自己设备上打开能看到最新状态；把一条便签一键转成待办并保留来源引用；通过外部 AI agent 用自然语言批量创建待办或查询本月支出。

4. 范围边界
4.1 本项目包含
框架层能力（模块注册、主题、认证、搜索、标签、关联、附件、Agent 通道、离线队列）；六个业务模块（便签、待办、链接收藏、信息收集、记账、客户联系）；Web、PWA、Tauri 桌面三种终端；single 与 profiles 两种实例模式。

4.2 本项目不包含
真正的多用户系统（每人独立密码、注册、角色权限矩阵）；协作与共享编辑；原生移动 App；AI 自动总结与自动分类（该类需求由外部 agent 经 Agent 通道完成）；CRDT 级别的离线冲突合并；Postgres 迁移。

5. 总体架构
Copy                 ┌─────────────────────────────┐
   Web / PWA ───▶│                             │
   Tauri     ───▶│   apps/server  (Fastify)    │──▶ SQLite (WAL)
   外部 Agent ──▶│   apps/mcp     (MCP)        │──▶ uploads/
                 └──────────┬──────────────────┘
                            │ HostContext
                 ┌──────────▼──────────────────┐
                 │  modules/*  (manifest 注册) │
                 └─────────────────────────────┘
服务端是唯一事实来源。所有终端只通过统一 HTTP API 访问，任何客户端都不得直接连接数据库，也不得在客户端之间直接同步数据。

模块通过编译期扫描（import.meta.glob）被宿主收集并注册。宿主只认识 manifest 描述的标准结构，不认识任何具体模块。

6. 技术栈约束
以下选型固定，不得替换；引入任何新的第三方依赖需事先批准。

层	选型
运行时	Node 22
服务端框架	Fastify + TypeScript
数据库	SQLite（better-sqlite3）+ Drizzle ORM
前端	React 19 + Vite + TypeScript + React Router
样式	Tailwind CSS v4 + shadcn/ui
数据请求	TanStack Query
表单与校验	react-hook-form + Zod
图标	lucide（唯一图标来源，模块不得自带 SVG）
桌面	Tauri v2
移动	PWA
包管理	pnpm workspace
测试	Vitest（单元）+ Playwright（端到端）
部署	Docker Compose + Caddy
备份	Litestream
7. 仓库结构
Copy/apps
  server/          宿主服务端
  web/             宿主前端（含 PWA）
  desktop/         Tauri 壳
  mcp/             Agent 通道（MCP server）
/packages
  contracts/       共享类型、ModuleManifest、HostContext、API schema
  core/            数据库连接、scope 层、迁移执行器、认证、日志
  ui/              共享组件库、布局外壳
  theme/          主题定义与 token
/modules
  notes/  todos/  links/  inbox/  ledger/  contacts/
    manifest.ts
    server/  web/  shared/  migrations/
/config
  instance.ts      实例配置
/docs
  PRD.md  ROADMAP.md  CHANGELOG.md
7.1 依赖方向
模块只能依赖 contracts、core、ui、theme。宿主不得依赖任何具体模块。模块之间不得互相 import。由 ESLint no-restricted-imports 强制，CI 拦截违规。

8. 模块契约
Copyinterface ModuleManifest {
  id: string;                    // 'notes'，同时作为表前缀与 API 前缀
  name: string;                  // 显示名，支持 i18n key
  description: string;
  icon: LucideIconName;          // 必填，收纳态下是唯一可辨识信息
  version: string;               // 语义化版本

  server?: {
    routes: RouteDefinition[];
    migrations: Migration[];
    searchProvider?: SearchProvider;
    captureHandler?: CaptureHandler;
    cron?: CronJob[];
    badgeCount?: (ctx: HostContext) => Promise<number>;
  };

  web?: {
    routes: WebRoute[];
    menu: MenuItem[];            // 侧栏菜单项
    widgets?: WidgetDefinition[];
    settings?: SettingsPanel;
  };

  agentTools: AgentToolDeclaration[];   // 必填，未声明则 agent 不可见
  offlineOps?: OfflineOpDeclaration[];  // 未声明则该模块全部操作离线禁用
}

interface MenuItem {
  path: string;
  label: string;
  icon: LucideIconName;
  order: number;
  group?: string;                // 可选分组，如 '工作' / '生活'
  badge?: boolean;               // 是否展示角标，数据来自 server.badgeCount
}

interface WebRoute {
  path: string;
  component: LazyComponent;
  layout: 'plain' | 'list-detail';   // 列表—详情形态由宿主统一处理
  actions?: PageAction[];            // 页头右侧操作按钮声明
}

interface WidgetDefinition {
  id: string;
  title: string;
  component: LazyComponent;
  size: { cols: 1 | 2 | 3; rows: 1 | 2 };   // 首页网格默认占位
}

interface OfflineOpDeclaration {
  op: string;                    // 'todos.toggle' / 'notes.create'
  kind: 'toggle' | 'append';     // 仅这两类允许离线
  entity: string;
}

interface HostContext {
  db: Database;                  // 已注入 profile scope
  profileId: string;
  requireAdmin(): Promise<void>; // 敏感操作前调用，未通过则抛 403
  log: Logger;
  shortId: ShortIdService;
  tags: TagService;
  relations: RelationService;
  attachments: AttachmentService;
  config: InstanceConfig;
}
Copy
宿主在构建时扫描 modules/*/manifest.ts 完成注册；未在实例配置中启用的模块不加载，其路由、菜单、agent 工具全部不存在。

9. 数据模型
9.1 通用约定
主键为 UUID v7，由客户端生成（为离线写入与幂等重放留出空间）。所有业务表包含 profile_id、created_at、updated_at、deleted_at（软删除）。时间统一存储为 ISO-8601 UTC 字符串。金额一律以整数「分」存储，禁止浮点。模块表以模块 id 为前缀。所有业务表包含 seq INTEGER，短 ID = <模块前缀>-<seq>，由 id_counters 表分配。

所有数据访问必须经过 core 的 scope 层，自动注入 profile_id 与 deleted_at IS NULL 条件；禁止裸查询。

SQLite 必须启用：journal_mode=WAL、busy_timeout=5000、foreign_keys=ON、synchronous=NORMAL。

9.2 核心表
instance_settings（单行）：id、mode（single / profiles）、instance_password_hash、admin_password_hash、cookie_secret、name、logo_path、default_theme、timezone、locale、initialized_at、updated_at。

profiles：id、seq、nickname、avatar_path、color、is_default、order、created_at、updated_at、deleted_at。（single 模式下仅一条记录，仍使用真实 id，不使用魔法值。）

profile_prefs：profile_id、key、value（JSON）。存放跨设备同步的档案级偏好：主题、首页 widget 布局、模块的档案级开关。

module_settings：id、module_id、profile_id（可空，为空表示实例级）、enabled、config（JSON）。实例级开关由管理员控制，档案级开关在实例允许范围内自行调整。

tags：id、profile_id、name、color、created_at。 entity_tags：tag_id、entity_type、entity_id。

relations：id、profile_id、from_type、from_id、to_type、to_id、relation_type、created_at。模块间零耦合的唯一关联手段。

attachments：id、profile_id、entity_type、entity_id、filename、mime、size、path、created_at。文件存文件系统 uploads/，库中只存路径，读取需经鉴权接口。

audit_log：id、profile_id、source（web / desktop / agent）、action、entity_type、entity_id、detail（JSON）、created_at。agent 发起的所有变更必须记录。

overwrite_history：id、entity_type、entity_id、overwritten_payload（JSON）、reason、created_at。离线队列重放发生覆盖时留存旧值。

id_counters：scope、next_value。 migrations：id、module_id、name、applied_at。

9.3 模块表
notes_note：标题（空则取正文首行）、正文（Markdown）、置顶、颜色。

todos_project：名称、颜色、排序、归档标记。 todos_task：标题、描述、状态（todo / doing / done / archived）、优先级、截止时间、project_id、排序位、重复规则（RRULE 子集）、提醒时间。

ledger_account：名称、类型、初始余额（分）、币种、排序。 ledger_category：名称、父分类、收支方向、图标。 ledger_transaction：类型（income / expense / transfer）、金额（分）、币种、account_id、to_account_id（转账用）、category_id、发生日期、备注、counterparty_ref（可选指向联系人）。转账记为配对流水。不存储任何余额或汇总字段。

contacts_contact：姓名、公司、职位、来源渠道、备注、最后联系时间、下次跟进时间。 contacts_channel：contact_id、类型、值、是否主要。（独立成表，不用 JSON。） contacts_interaction：contact_id、时间、方式、内容摘要。

inbox_item：URL、标题、摘录/快照、来源、类型（文章 / 图片 / 想法 / 文件）、阅读状态、归档时间。

links_group：名称、排序。 links_link：标题、URL、group_id、图标路径、点击次数、最近访问时间。点击次数采用增量语义（+1），不采用绝对值覆盖。

10. 认证与权限
10.1 实例模式
single：只有一个档案，登录后直接进入，无档案切换器。 profiles：多个档案共用一个使用密码，进入后可随时自由切换档案。家庭场景下不强调档案间隐私，共享是常态。

模式存于 instance_settings，首次启动时从环境变量或初始化向导写入，此后不受 compose 变更影响。允许 single 升级为 profiles（原有数据归属默认档案），不允许降级。

10.2 双密码
使用密码用于进入实例。校验通过后签发一个长期 cookie（有效期 1 年），该 cookie 同时承担"已登录"与"信任设备"两个职责，不再区分设备令牌与会话令牌。Web/PWA 使用 HttpOnly + Secure + SameSite=Lax cookie，Tauri 使用系统 keychain。

管理员密码用于敏感操作，与使用密码必须不同，初始化时校验。每次敏感操作随请求携带，服务端现场校验，失败返回 403。不维护提权会话，不在任何客户端存储，不跨设备信任。

两者均使用 argon2id 哈希。

10.3 敏感操作清单
创建/删除档案；修改使用密码或管理员密码；切换实例模式；调整实例级模块开关；轮换 cookie secret（等同全部设备下线）；导出全部数据；数据库恢复；签发或吊销 Agent Token。

模块内如有敏感操作，通过 HostContext.requireAdmin() 接入，不得自行实现校验。

10.4 档案切换
完全在客户端完成：当前档案 id 存 localStorage，随请求头发送，服务端据此过滤数据。切换时不重新签发凭证，只需清空 TanStack Query 全部缓存并记录审计。顶栏/侧栏顶部提供切换器。

10.5 暴力破解防护
登录接口按 IP 限流、失败计数、指数退避三项必备。管理员密码的失败阈值更严格（连续失败 5 次后锁定 15 分钟）。

10.6 密码找回
不提供在线找回。提供仅可在 VPS 本地经 SSH 执行的 CLI 命令重置管理员密码哈希，README 中说明用法。

10.7 Agent Token
独立签发的长期 Token，绑定到具体档案，携带 scope。Agent 不得执行任何敏感操作，不存在绕过管理员密码的入口。Token 可在设置中列出与吊销。

11. 网络与数据策略
11.1 总原则
服务端是唯一事实来源。在线优先。所有派生数据（余额、月度合计、分类占比、统计图表）一律由服务端计算，客户端与 agent 只做渲染与消费，不得自行推算。统计接口只接受时间范围与维度参数，不信任客户端传入的中间结果。

11.2 数据新鲜度
窗口获焦时强制重新拉取，staleTime 设置较短；辅以 30–60 秒一次的低频轮询。提供轻量接口返回各模块最新修改时间戳，据此决定是否真正拉取。不引入 WebSocket/SSE。

更新请求携带 updated_at，服务端检测到不一致返回 409，前端提示重新加载，避免静默覆盖。

11.3 离线只读
Service Worker 对应用外壳（HTML/JS/CSS）采用 stale-while-revalidate；TanStack Query 结果持久化到 IndexedDB，每次成功请求覆盖写入。只缓存近期访问过的列表与详情，不做全量预加载。

离线时全文搜索降级为本地缓存的简易匹配，并明确提示结果不完整；附件与图片展示占位符。页面需展示数据新鲜度（"数据更新于 X 分钟前"）。

11.4 离线写入白名单
允许离线写入的操作仅限状态翻转（如勾选待办、标记已读）与简单追加（新建便签、新建待办、新增记账流水、加标签）。这些操作写入 IndexedDB 的 outbox 队列，字段包括操作类型、目标实体、payload、幂等键、时间戳、重试次数。

明确禁止离线的操作（离线时置灰并提示）：拖拽排序、批量操作、编辑或删除已有记录、记账的转账与账户/分类增删改、客户资料编辑、一切管理类操作。

队列处理规则：同一实体同一字段的重复操作去重，只保留最后一次；恢复网络后按序重放，指数退避重试；超过阈值移入"同步失败"列表供人工处理。目标记录已被删除则跳过并记录原因；返回 409 时以服务端较新版本为准并提示用户，被覆盖内容写入 overwrite_history。

模块通过 manifest 的 offlineOps 声明支持范围，默认全部不支持。队列与重放逻辑由框架统一提供，模块只做声明。

11.5 网络状态三态
完全离线：顶部通栏提示（挤压内容而非浮层覆盖），写入按钮置灰。 弱网：提示"网络较慢"，按钮保持可用。 请求失败：就地展示可重试的错误信息，保留用户已输入内容，回滚乐观更新并说明原因。

真实在线状态以每 30 秒探测 /api/core/health 为准，不单独依赖 navigator.onLine。恢复后自动刷新数据并将通栏替换为"已恢复"后消失。

请求超时 10 秒，自动重试 2–3 次并指数退避，所有写请求携带幂等键。

12. 界面框架
布局属于框架层。主题只能改变颜色、圆角、字体、密度，不得改变布局结构；模块只能通过 manifest 声明放什么，不得决定怎么摆。

12.1 三档布局
按可用宽度而非设备类型判断，断点沿用 Tailwind 默认值。

档位	宽度	侧栏形态
Full	≥ 1280px (xl)	展开常驻，宽 260px
Compact	768–1279px (md)	收纳为 64px 图标条；点击以浮层展开覆盖内容，选中后自动收回
Mobile	< 768px	脱离文档流，左侧抽屉，顶栏按钮唤起，带遮罩，选中即关闭
CopyFull                          Compact                Mobile
┌──────┬──────────────┐      ┌─┬──────────────┐     ┌──────────────┐
│ 品牌 │  页头         │      │▣│  页头         │     │ ☰  页头   ⌕ ⊙│
│ 档案 ├──────────────┤      │▣├──────────────┤     ├──────────────┤
│      │              │      │▣│              │     │              │
│ 菜单 │   功能区      │      │▣│   功能区      │     │   功能区      │
│      │              │      │▣│              │     │           (+)│
├──────┤              │      ├─┤              │     │              │
│ 状态 │              │      │▣│              │     │              │
└──────┴──────────────┘      └─┴──────────────┘     └──────────────┘
侧栏展开/收纳状态属于设备级偏好，存 localStorage，不跨设备同步。进入 Compact 档时强制收纳，回到 Full 档时恢复用户上次的手动选择。

12.2 侧栏三段结构
上下两段吸附，中段可滚动。

顶部身份区：实例名称与 logo（来自实例配置，禁止硬编码）；其下为档案切换器，显示当前档案头像、昵称、颜色。profiles 模式下必须一次点击可达，不得藏进设置。收纳态下退化为单个头像圆点。single 模式下不渲染切换器。

中段模块菜单：完全由已启用模块的 manifest 生成。固定以"首页"入口开头。每项含图标、名称与可选角标数字，角标数据由宿主统一轮询模块声明的 badgeCount，模块不得自行发请求。模块超过 8 个时按配置分组，分组标题在收纳态下退化为分隔线。

底部状态区：全局搜索入口、待同步数量、网络状态、主题切换、设置入口。网络状态平时隐藏，仅在离线或弱网时出现。

收纳态下仅保留图标，hover 出 tooltip。由于 Compact 档触屏设备上 hover 不可靠，manifest.icon 为必填且必须来自 lucide。

12.3 功能区
顶部为页头，含页面标题、进入详情时出现的面包屑、右侧的页面级操作按钮。操作按钮由 WebRoute.actions 声明，模块不得直接向顶栏插入 DOM。

列表—详情（master-detail）是统一模式，由 WebRoute.layout: 'list-detail' 声明，宿主统一实现，模块只提供列表项与详情两个组件。三档表现：

Full 档左右并排，列表固定 320–380px，详情自适应，点击就地替换且 URL 同步；Compact 档详情从右侧滑出浮层，覆盖列表但保留左侧一段可见；Mobile 档列表与详情为两个独立路由，点击为页面前进，详情页顶栏左上角变为返回箭头。

首页 widget 网格：Full 档三列可拖拽，Compact 档两列，Mobile 档单列且禁用拖拽（与"排序操作不进离线队列"保持一致，布局调整只在桌面端进行）。widget 默认占位由 WidgetDefinition.size 声明，用户调整后的布局存入 profile_prefs，跨设备同步。

首页只展示当天需要动作的内容：今日与逾期待办、需跟进客户、最近便签、本月收支简报、待读资料、常用链接宫格。

12.4 常驻元素
全局快速输入：桌面端 Cmd/Ctrl+K 唤起居中命令面板；移动端为右下角悬浮按钮，点击从底部升起输入面板，需避开系统手势区。两者共用同一分发逻辑，仅容器不同。前缀规则：/ 命令、# 标签、纯文本默认落入便签。分发目标由模块的 captureHandler 声明。

离线通栏位于页头之上，挤压内容。待同步计数位于侧栏底部，点击进入队列详情页，支持手动重试与处理失败项。

12.5 布局 token
尺寸与颜色同等对待，一律走 token，禁止硬编码像素值。至少包含：侧栏展开宽度、侧栏收纳宽度、页头高度、内容区左右留白、列表项行高、列表栏宽度、内容最大宽度。密度 token（comfortable / compact）只影响行高与留白，不影响侧栏宽度与断点。

12.6 界面验收标准
同一模块页面在三档宽度下不得存在三套组件，差异只由容器承担；新增模块只改自身 manifest，宿主与侧栏代码零改动；切换任意主题时布局结构与尺寸完全不变。

暂不实现：移动端底部标签栏。需先积累真实使用频次，后续从配置读取"置顶模块"生成。

13. 主题系统
采用两层 token：原始色板（仅存在于 packages/theme）与语义 token（background、foreground、card、primary、muted、border、destructive 等）。业务代码只能引用语义 token。

Copyinterface Theme {
  id: string;
  name: string;
  colorScheme: 'light' | 'dark' | 'both';
  tokens: Record<string, string>;
  radius: RadiusScale;
  fontFamily: FontStack;
  density: 'comfortable' | 'compact';
  layout: LayoutTokens;
}
通过 CSS 变量实现，运行时由根元素的 data-theme 与 data-mode 属性切换。主题选择存 profile_prefs（跨设备同步），亮暗跟随系统与否存 localStorage（设备级）。内置至少四套主题。

默认主题刻意保守：低饱和中性底色，主色只用于选中项、主操作按钮、角标，大面积留白，多用边框少用阴影，中等偏小圆角。

硬性规则：主题只能覆盖 token，不得携带自定义 CSS 选择器。UI 代码中禁止出现十六进制色值、Tailwind 具名颜色（如 bg-blue-500）、硬编码像素圆角。CI 以正则拦截。

14. HTTP API 规范
模块 API 位于 /api/m/{moduleId}/{resource}，宿主 API 位于 /api/core/。

响应统一包裹为 { data: ... } 或 { error: { code, message } }。列表接口使用游标分页。请求与响应 schema 用 Zod 定义于模块的 shared/ 目录，前后端共享。

核心接口：GET /api/core/health、POST /api/core/auth/login、POST /api/core/auth/logout、GET /api/core/profiles、GET|PUT /api/core/prefs、GET /api/core/modules、PUT /api/core/modules/{id}、GET /api/core/search、POST /api/core/capture、GET|POST /api/core/tags、GET|POST /api/core/relations、POST /api/core/attachments、GET /api/core/attachments/{id}、GET /api/core/version、GET /api/core/timestamps（各模块最新修改时间）、POST /api/core/sync/replay（队列重放）。

任何 API 变更必须同步更新共享 Zod schema 与本文档。

15. Agent 通道
以 MCP server（apps/mcp）形式提供，不让 agent 直接调用 HTTP API。

工具收敛为一组通用工具，总数不超过 10 个，资源类型作为参数传入：list、get、create、update、delete、search、relate、capture、describe。describe 用于按需发现 schema，避免一次性加载全部模块字段。

Token 优化要求：列表默认只返回最小字段集（短 ID、标题、状态、时间），支持 fields 投影，默认 limit 为 10，省略空字段，结构扁平，可选紧凑行文本（制表符分隔）格式。对外一律使用短 ID（note-142），不暴露 UUID，内部完成映射。宁可减少往返次数，也不返回冗余内容。工具定义本身的描述文字同样要求精简。

写操作支持批量与组合操作（如便签转待办一次完成），必须携带幂等键；删除与批量更新为软删除并支持撤销；所有 agent 发起的变更以 source=agent 记入 audit_log。

MCP 层不得包含任何模块相关逻辑，工具列表由 core 的注册表依据各模块的 agentTools 声明生成。模块被禁用时其工具自动消失。新增模块必须声明 agentTools，否则对 agent 不可见。

16. 安全与非功能需求
Caddy 负责自动 HTTPS，服务仅监听本机，对外经反向代理。附件读取必须经鉴权接口，不暴露静态目录。

指标	要求
首屏可交互	≤ 2s
前端首屏 gzip 体积	≤ 250KB
单模块 chunk	≤ 100KB
API 响应（常规读写）	≤ 200ms
服务端常驻内存	≤ 150MB
2GB VPS 总占用	≤ 30%
Docker 日志需配置轮转与大小上限。浏览器兼容最近两个版本。

17. 部署与更新
VPS 上以 Docker Compose 编排应用服务与 Caddy。禁止在 VPS 上构建前端，镜像由 GitHub Actions 产出。

CI 流程：push tag 触发 → typecheck → lint（含依赖方向与硬编码颜色检查）→ 单元测试 → 端到端冒烟测试 → 构建镜像并推送 → VPS 经 Watchtower 拉取并滚动重启。保留上一个镜像 tag 以便一键回滚。

数据库迁移由宿主统一执行，只扫描已启用模块的迁移文件，执行前自动备份 SQLite 文件。Litestream 持续复制到对象存储，附件目录定期同步。恢复流程必须实际演练过一次。

版本采用语义化版本，CHANGELOG 按模块分组。前端轮询 /api/core/version 发现新版本后提示刷新，配合 Service Worker 更新缓存；Tauri 使用内置 updater 经 latest.json 静默更新。

提供 /api/core/health 健康检查与掉线告警。

18. 分阶段实施与验收
阶段 1 — 框架奠基 + 便签 交付 monorepo 骨架、contracts 类型、core 数据层与 scope 层、迁移执行器、认证（single 模式）、界面外壳三档布局、主题系统、便签模块、CI/CD 与 VPS 部署。 验收：浏览器可登录，切换主题布局不变，三档宽度下侧栏行为正确，便签可增删改查并在刷新后保持，push tag 后自动部署成功。

阶段 2 — 待办 + 链接收藏 + 聚合层 交付两个模块、relations、全局搜索（FTS5）、快速输入、首页 widget 网格。 验收：便签可一键转待办并保留反向引用，全局搜索可跨模块命中，首页只展示当天需动作内容。

阶段 3 — PWA 与离线只读 交付 Service Worker、IndexedDB 查询缓存、网络三态提示、数据新鲜度展示。 验收：断网后可查看近期访问过的列表与详情，写入按钮置灰，恢复网络后自动刷新。

阶段 4 — 离线写队列 交付 outbox 队列、去重、重放、失败列表、待同步角标；便签与待办声明 offlineOps。 验收：断网勾选待办后恢复网络自动提交成功，重复重放不产生重复记录，冲突时保留服务端较新版本并留存覆盖历史。

阶段 5 — 信息收集 + 记账 交付两模块与浏览器书签小工具；所有统计由服务端计算。 验收：记账仅支持离线新增流水，统计数字与手工核算一致，离线时统计区域明确标注为过期。

阶段 6 — 客户联系 验收：下次跟进时间可在首页与待办视图中呈现。

阶段 7 — Tauri 桌面客户端 验收：全局快捷键唤起快速输入，凭证存于系统 keychain，自动更新可用。

阶段 8 — profiles 模式 交付多档案、档案切换器、管理员密码敏感操作校验、cookie secret 轮换。 验收：切换档案后数据完全隔离且前端缓存被清空，敏感操作在无管理员密码时被拒绝，轮换 secret 后所有设备需重新输入使用密码。

19. 与 AI 编码 Agent 的协作约定
接到任务后先输出实施计划待确认，确认后再编码；按本章阶段划分增量交付，不得一次性交付全部范围；每次任务完成后，如发现文档约定缺失或与实现冲突，主动指出并提出修改建议，不得静默绕过。

技术约束、依赖方向、样式纪律、提交前检查命令以 AGENTS.md 为准。

20. 需同步到 AGENTS.md 的变更
本版将数据表统一字段 user_id 更名为 profile_id，与 profiles 表命名保持一致。AGENTS.md 第 5 节（数据层约定）与硬性规则第 6 条中的 user_id 需一并更名，措辞改为：

所有业务表必须包含 profile_id；所有数据访问必须经过 scope 层注入档案条件，禁止裸查询。

同时在 AGENTS.md 中新增一条样式纪律：布局尺寸同样不得硬编码，必须使用 packages/theme 提供的布局 token。

改完这两处，两份文档就一致了。建议先让 agent 读 AGENTS.md 与 docs/PRD.md，输出阶段 1 的实施计划（再往下拆成"骨架 + ESLint 规则验证"和"contracts + core 数据层"两小步）供你确认，然后再动第一行代码。
