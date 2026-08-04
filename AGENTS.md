AGENTS.md
本文档定义 Atrium（中文名「天井」）项目的技术约束与协作规范。

完整需求、数据模型与契约定义见 docs/PRD.md（v1.3）。本文档定义技术约束与协作规范，两者冲突时以本文档为准。docs/ROADMAP.md 为长期规划备忘，不作为开发依据，无需读取。

1. 项目定位
Atrium 是一个可复用的工作台框架，框架本身不包含任何业务逻辑。业务全部以模块形式存在，一个"工作台实例" = 同一套框架 + 一份实例配置 + 一组启用的模块。

当前交付的个人工作台只是第一个实例，后续会基于同一框架开发家庭工作台（围绕孩子与家庭生活）等实例。因此判断任何设计是否可接受的标准是：开发第二个实例时，是否只需要新增模块和修改配置，而不必改动框架层代码。

框架层包括 packages/contracts、packages/core、packages/ui、packages/theme，以及 apps/* 中的宿主壳。实例层是 config/ 下的配置（实例名称、logo、默认主题、实例模式、启用模块列表、首页默认布局、时区、语言）。模块层是 modules/ 下的各业务模块。

后续可能把 packages/* 拆成独立的私有包，因此现在就要严守包边界，不要出现跨层的隐式依赖。

2. 技术栈
以下选型固定，不得替换。引入任何新的第三方依赖需事先获得批准，说明用途、体积与替代方案。

层	选型
运行时	Node 22
服务端	Fastify + TypeScript
数据库	SQLite（better-sqlite3）+ Drizzle ORM
前端	React 19 + Vite + TypeScript + React Router
样式	Tailwind CSS v4 + shadcn/ui
数据请求	TanStack Query
表单与校验	react-hook-form + Zod
图标	lucide（唯一来源，模块不得自带 SVG）
桌面	Tauri v2
移动	PWA
包管理	pnpm workspace
测试	Vitest（单元）+ Playwright（端到端）
部署	Docker Compose + Caddy
备份	Litestream
体积敏感，禁止引入大型 UI 框架、状态管理库、图表库的重型方案。前端首屏 gzip 需控制在 250KB 以内，单模块 chunk 不超过 100KB。

3. 目录结构
Copy/apps
  server/          宿主服务端
  web/             宿主前端（含 PWA）
  desktop/         Tauri 壳
  mcp/             Agent 通道（MCP server）
/packages
  contracts/       共享类型、ModuleManifest、HostContext、API schema
  core/            数据库连接、scope 层、迁移执行器、认证、日志
  ui/              共享组件库、布局外壳
  theme/           主题定义、颜色与布局 token
/modules
  <moduleId>/
    manifest.ts
    server/  web/  shared/  migrations/
/config
  instance.ts      实例配置
/docs
  PRD.md  ROADMAP.md  CHANGELOG.md
新增模块必须遵循同样的子目录结构，不得自创布局。

4. 依赖方向
模块只能依赖 contracts、core、ui、theme。宿主不得依赖任何具体模块。模块之间不得互相 import。

由 ESLint no-restricted-imports 强制，CI 必须拦截违规。规则写好后需立刻用一次故意违规的 import 验证其真的会报错，验证完删除该行。

模块之间的关联只能通过 relations 表与 HostContext 提供的服务完成，不允许类型层面的耦合。

5. 数据层约定
主键为 UUID v7，由客户端生成（为离线写入与幂等重放留出空间）。

所有业务表必须包含 profile_id、created_at、updated_at、deleted_at（软删除）。所有数据访问必须经过 core 的 scope 层，由其自动注入档案条件与 deleted_at IS NULL；禁止裸查询。

所有业务表包含 seq INTEGER，短 ID 形如 note-142，由 id_counters 表分配。短 ID 用于面向人与 agent 的场景，UUID 不对外暴露。

时间统一存储为 ISO-8601 UTC 字符串。金额一律以整数「分」存储，禁止浮点运算。模块表以模块 id 为前缀（如 notes_note）。

联系方式一类的一对多数据用独立表，不要用 JSON 字段——SQLite 的 JSON 索引能力弱。

SQLite 必须启用：journal_mode=WAL、busy_timeout=5000、foreign_keys=ON、synchronous=NORMAL。数据库文件放在 Docker volume，不得放在容器可写层或 NFS 上。

迁移文件放在模块自己的 migrations/ 目录，文件名带序号与模块前缀。宿主的迁移执行器只扫描已启用模块，执行前必须自动备份数据库文件。SQLite 的 ALTER TABLE 能力有限，涉及改表结构时要预期 ORM 会走新建表—拷数据—删旧表的路径，务必先备份。

所有派生数据必须由服务端计算（余额、月度合计、分类占比、统计图表等）。数据库中不存储任何可推导的汇总字段。客户端与 agent 只做渲染与消费，不得自行推算。统计接口只接受时间范围与维度参数，不信任客户端传入的中间结果。计数类字段（如链接点击次数）采用增量语义（+1），不采用绝对值覆盖。

6. 样式与布局纪律
采用两层 token：原始色板仅存在于 packages/theme，业务代码只能引用语义 token（background、foreground、card、primary、muted、border、destructive 等）。

禁止在 UI 代码中出现十六进制色值、rgb()、Tailwind 具名颜色（如 bg-blue-500）。

布局尺寸同样不得硬编码，必须使用 packages/theme 提供的布局 token：侧栏展开宽度、侧栏收纳宽度、页头高度、内容区留白、列表项行高、列表栏宽度、内容最大宽度。圆角只能用 radius token。

主题只能覆盖 token，不得携带自定义 CSS 选择器。一旦允许主题写选择器，主题就变成第二套布局代码。

断点沿用 Tailwind 默认的 md（768）与 xl（1280），不得自定义。

CI 以正则检查硬编码颜色与像素值。该规则写好后需用一次故意违规的 bg-blue-500 验证其生效，验证完删除。

7. 界面框架约束
布局属于框架层。 主题只能改变颜色、圆角、字体、密度；模块只能通过 manifest 声明放什么内容，不得决定怎么摆放。

三档布局按可用宽度判断，不按设备类型：Full（≥1280px，侧栏展开常驻 260px）、Compact（768–1279px，侧栏收纳为 64px 图标条，点击以浮层展开）、Mobile（<768px，侧栏为左侧抽屉）。侧栏展开状态是设备级偏好，存 localStorage，不跨设备同步。

侧栏固定三段：顶部身份区（实例名称与 logo 来自配置，其下为档案切换器）、中段模块菜单（由 manifest 生成，首项固定为"首页"）、底部状态区（搜索、待同步数、网络状态、主题、设置）。角标计数由宿主统一轮询模块声明的 badgeCount，模块不得自行发请求。

列表—详情形态由宿主统一实现，模块只通过 WebRoute.layout: 'list-detail' 声明并提供列表项与详情两个组件。同一模块页面在三档宽度下不得存在三套组件，差异只由容器承担。

页面级操作按钮通过 WebRoute.actions 声明，模块不得直接向顶栏插入 DOM。

首页 widget 网格在 Mobile 档禁用拖拽。离线通栏位于页头之上、挤压内容，不使用浮层覆盖。

8. 模块契约
模块通过 manifest.ts 向宿主声明能力，宿主在构建时以 import.meta.glob 扫描注册。未在实例配置中启用的模块不加载，其路由、菜单、agent 工具全部不存在。

manifest 必填字段包括 id、name、description、icon（lucide 图标名）、version、agentTools。可选字段包括 server（routes、migrations、searchProvider、captureHandler、cron、badgeCount）、web（routes、menu、widgets、settings）、offlineOps。

完整类型定义见 docs/PRD.md 第 8 章，以 packages/contracts 中的实际类型为准，两者不一致时以 PRD 为准并同步修正代码。

模块所有能力都通过 HostContext 获取（db、profileId、requireAdmin、log、shortId、tags、relations、attachments、config），不得绕过它直接访问底层。

9. API 约定
模块 API 位于 /api/m/{moduleId}/{resource}，宿主 API 位于 /api/core/。

响应统一包裹为 { data: ... } 或 { error: { code, message } }。列表接口使用游标分页。请求与响应 schema 用 Zod 定义在模块的 shared/ 目录，前后端共享，前端不得重复定义类型。

更新请求必须携带 updated_at，服务端检测到不一致返回 409。所有写请求必须携带幂等键。

客户端禁止硬编码接口路径与字段名，一律从共享包读取。

10. 认证与敏感操作
实例模式为 single（单档案）或 profiles（多档案共用一个使用密码），存于 instance_settings 表，不依赖环境变量长期存在。

双密码机制：使用密码用于进入实例，校验通过后签发长期 cookie（1 年），该 cookie 同时承担"已登录"与"信任设备"职责，不再区分设备令牌与会话令牌。管理员密码用于敏感操作，与使用密码必须不同，每次操作随请求现场校验，不维护提权会话，不在任何客户端存储。两者均用 argon2id 哈希。

Web/PWA 用 HttpOnly + Secure + SameSite=Lax cookie，Tauri 用系统 keychain。

档案切换完全在客户端完成：当前档案 id 存 localStorage，随请求头发送，服务端据此过滤。切换时不重新签发凭证，但必须清空 TanStack Query 全部缓存并记入审计。

敏感操作清单：创建/删除档案、修改任一密码、切换实例模式、调整实例级模块开关、轮换 cookie secret、导出全部数据、数据库恢复、签发或吊销 Agent Token。模块内的敏感操作必须通过 HostContext.requireAdmin() 接入，不得自行实现校验。

登录接口必须实现 IP 限流、失败计数、指数退避三项。管理员密码失败阈值更严格。

不提供在线密码找回。需提供仅能在 VPS 本地经 SSH 执行的 CLI 命令重置管理员密码哈希，并在 README 中说明用法。

11. 网络与离线约定
服务端是唯一事实来源。所有终端只通过统一 API 访问，禁止任何客户端直连数据库或客户端之间直接同步。

在线优先。数据新鲜度依靠窗口获焦时强制重新拉取、较短的 staleTime、30–60 秒低频轮询，以及 /api/core/timestamps 时间戳比对。不引入 WebSocket/SSE。

离线只读：Service Worker 对应用外壳用 stale-while-revalidate，TanStack Query 结果持久化到 IndexedDB，只缓存近期访问过的列表与详情，不做全量预加载。离线时搜索降级为本地简易匹配并提示结果不完整，附件展示占位符，页面展示数据新鲜度。

离线写入采用白名单，默认全部不支持。仅允许状态翻转（toggle）与简单追加（append）两类，由模块在 offlineOps 中声明。明确禁止离线的操作：拖拽排序、批量操作、编辑或删除已有记录、记账的转账与账户/分类增删改、客户资料编辑、一切管理类操作。离线时这些入口置灰并提示。

队列与重放逻辑由框架统一提供，模块只做声明，不得自行实现队列。队列规则：同一实体同一字段的重复操作去重只留最后一次；恢复网络后按序重放、指数退避重试；超过阈值移入"同步失败"列表供人工处理；目标记录已删除则跳过并记录原因；409 冲突以服务端较新版本为准并将被覆盖内容写入 overwrite_history。

网络状态三态：完全离线（顶部通栏 + 写入置灰）、弱网（提示但按钮可用）、请求失败（就地可重试错误，保留用户已输入内容，回滚乐观更新）。真实在线状态以每 30 秒探测 /api/core/health 为准，不单独依赖 navigator.onLine。

请求超时 10 秒，自动重试 2–3 次并指数退避。

12. Agent 通道
以 MCP server（apps/mcp）形式提供，不让 agent 直接调用 HTTP API。

工具收敛为一组通用工具，总数不超过 10 个，资源类型作为参数：list、get、create、update、delete、search、relate、capture、describe。describe 用于按需发现 schema，禁止一次性加载全部模块字段。

Agent 接口以最小 token 消耗为第一优先级。 列表默认只返回最小字段集，支持 fields 投影，默认 limit 为 10，省略空字段，结构扁平，提供紧凑行文本格式。对外一律使用短 ID。工具定义本身的描述文字也要精简，禁止冗余说明。宁可减少往返次数，也不返回冗余内容。

写操作支持批量与组合操作，必须携带幂等键；删除与批量更新为软删除并支持撤销；所有 agent 发起的变更以 source=agent 记入 audit_log。

Agent 使用独立签发的长期 Token，绑定到具体档案，携带 scope。Agent 不得执行任何敏感操作，不存在绕过管理员密码的入口。

MCP 层不得包含任何模块相关逻辑，工具列表由 core 的注册表依据各模块的 agentTools 声明生成。模块被禁用时其工具自动消失。

13. 新增模块检查清单
新增一个模块时，以下每项都必须完成，缺一不可：目录结构符合第 3 节；manifest.ts 声明了 icon 与 agentTools；表名带模块前缀且包含 profile_id 与三个时间字段；迁移文件放在模块自己的 migrations/；Zod schema 定义在 shared/ 且前后端共享；侧栏菜单项通过 menu 声明；列表页使用 layout: 'list-detail'（若为该形态）；未声明的操作默认离线禁用；宿主与其他模块代码零改动。

如果新增模块时发现必须改动宿主代码，说明契约有缺口，应先提出契约修改建议，不要在宿主里加特例分支。

14. 提交前检查
提交前必须全部通过：

Copypnpm typecheck
pnpm lint
pnpm test
每完成一个小步就提交一次，commit message 说明改动意图，便于 diff 审查与回滚。不要把多个不相关的改动堆在一个 commit 里。

15. 硬性规则
以下八条为硬性约束，违反即需修正，不接受任何理由的例外：

任何 API 变更必须同步更新共享 Zod schema 与 docs/PRD.md。
模块之间不得互相 import；宿主不得依赖任何具体模块。
UI 代码不得硬编码颜色值、Tailwind 具名颜色或固定像素圆角与尺寸，只能使用语义 token 与布局 token。
框架层（core / 宿主 / ui / mcp）代码中不得出现任何业务模块名称或概念（note、todo、ledger、contact 等），也不得为特定模块加分支；模块只能通过 manifest 声明的标准机制接入。
所有实例特定内容（名称、logo、默认模块、默认主题、时区、语言）必须来自配置，不得硬编码。
所有业务表必须包含 profile_id；所有数据访问必须经过 scope 层注入档案条件，禁止裸查询。
新增模块必须声明 agentTools，否则该模块对 agent 不可见。
只适用于特定工作台场景的业务逻辑必须完整留在模块内部，不得上浮到 core 或宿主。
16. 部署与发布纪律
VPS 上以 Docker Compose 编排应用服务与 Caddy，服务仅监听本机，对外经反向代理。禁止在 VPS 上构建前端，镜像一律由 GitHub Actions 产出。

CI 流程：push tag 触发 → typecheck → lint（含依赖方向与硬编码检查）→ 单元测试 → 端到端冒烟测试 → 构建镜像并推送 → VPS 经 Watchtower 拉取滚动重启。必须保留上一个镜像 tag 以便一键回滚。

Docker 日志必须配置轮转与大小上限。需定期清理镜像缓存。

Litestream 持续复制数据库，附件目录定期同步。恢复流程必须实际演练过一次——未验证的备份等于没有备份。

版本采用语义化版本，CHANGELOG 按模块分组。

17. 协作方式
接到任务后，先输出实施计划待我确认，确认后再开始编码。计划需说明涉及哪些包与文件、实施顺序、预期产出、以及存在疑问的地方。

按 docs/PRD.md 第 18 章的阶段划分增量交付，不得一次性交付全部范围。每个阶段内部若可继续拆分，优先拆小，便于逐步验证。

每次任务完成后，如发现文档约定缺失、含糊或与实现冲突，主动指出并提出修改建议，不得静默绕过或自行发明约定。文档修正后需在 PRD 修订记录中登记。

不确定某个设计选择时，先问，不要默认选一个继续往下写。
