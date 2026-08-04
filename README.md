# Atrium（天井）

Atrium 是一个面向多个独立工作台应用的通用框架，以及一组可选的官方通用模块。

> 当前状态：架构与需求设计阶段，尚未进入正式代码实现。

## 项目目标

Atrium 解决的是“如何构建工作台”，而不是某一个具体工作台的业务需求。

基于 Atrium 可以开发多个彼此独立的应用，例如：

- 个人工作台；
- 家庭工作台；
- 未来的团队、学习、创作或其他工作台。

这些应用共享 Atrium 的框架能力，但拥有独立的：

- 应用仓库；
- 业务模块与产品需求；
- 版本和发布节奏；
- Docker 镜像与部署配置；
- 数据库、附件和备份；
- 域名、凭证与密钥。

## 四层模型

Atrium 使用四个明确概念：

1. **框架（Framework）**：模块系统、宿主、数据访问、认证、同步、UI 外壳、主题、Agent 通道等通用能力。
2. **应用（Application）**：基于 Atrium 组合配置和模块形成的独立项目，例如个人工作台。
3. **部署实例（Deployment Instance）**：某个应用的一次实际部署，拥有独立运行环境和数据。
4. **客户端（Client）**：连接部署实例的浏览器、PWA、桌面端、移动端或 Agent。

```text
Atrium 框架
├── 个人工作台应用
│   └── 个人工作台部署实例
├── 家庭工作台应用
│   └── 家庭工作台部署实例
└── 未来其他工作台应用
```

应用与部署实例不是同一个概念。同一个应用将来可以部署多份；不同应用也可以使用不同版本的 Atrium。

## 数据中枢模型

每个工作台应用都必须提供可部署到服务器的 Web 系统，包括服务端 API 和浏览器前端。

服务端是部署实例的唯一数据权威：

```text
浏览器 Web ─────┐
PWA / 移动端 ───┤
Tauri 桌面端 ───┼──▶ 应用服务端 ──▶ 独立数据库
Agent / MCP ────┘          └──────▶ 独立附件存储
```

所有客户端通过统一 API 连接服务端。客户端之间不直接同步，也不得直接访问数据库。

## 可读数据镜像

Atrium 规划提供可读数据镜像（Readable Data Mirror）：部署实例的服务端定期调用已启用模块的数据导出器，把业务数据生成 Markdown、JSON、CSV 等普通文件，再提交并推送到用户配置的私有 Git 仓库。

```text
Atrium 服务端数据库
        ↓
各业务模块导出可读文件
        ↓
Data Mirror Engine
        ↓
Git commit / push
        ↓
GitHub、Gitee、Gitea 或其他标准 Git 仓库
```

数据镜像是 **Server-only capability**，Web 仅提供 **Admin-only configuration UI**。PWA、桌面端、移动端、普通浏览器和 Agent 不保存 Git 凭证，也不执行 Git 操作。关闭所有客户端后，服务端仍可按计划自动推送。

镜像严格单向从 Atrium 服务端流向远程 Git 仓库。远程仓库用于直接查看和留档，不是数据权威；第一阶段不支持从 Git 导入、恢复或双向同步。可读数据镜像也不备份应用源码、SQLite 文件、Docker 配置或部署环境，不能替代 Litestream 和数据库恢复流程。由于导出内容可直接阅读，必须使用私有 Git 仓库。

## 界面外壳与视觉主题包

Atrium 提供统一的工作台界面外壳。桌面端采用“左侧功能菜单 + 右侧功能区域”的布局：左侧菜单可以展开或折叠，展开时显示图标和文字，折叠时只显示图标并通过 tooltip 提供名称；右侧区域显示当前模块的页面标题、搜索、筛选、主要操作和内容。移动端不保留固定侧栏，而是根据同一份菜单定义生成抽屉式导航。

模块只向框架注册菜单项、路由和页面内容，不创建独立导航系统。每个菜单项使用语义 `iconKey` 描述图标含义，由当前主题决定最终图标，并支持活动页面高亮。

Atrium 将主题定义为**视觉主题包（Theme Pack）**，而不只是配色方案：

- 基础主题主要调整浅色、深色、主题色、圆角、阴影和密度；
- 风格主题可以形成像素风、可爱风、科技风等明显不同的整体画风；
- 主题包可以控制颜色、字体、图标风格、组件质感、间距、背景纹理和装饰效果；
- 主题可以改变视觉表现，但不能改变菜单层级、路由、信息结构和核心操作方式。

默认主题的图标包使用 Lucide。其他风格主题可以提供不同的图标实现；缺失的语义图标统一回退到默认图标包。

## 仓库定位

本仓库包含两类代码：

### 框架基础设施

规划中的框架包包括：

- `@atrium/contracts`：运行时无关的共享契约；
- `@atrium/core`：数据库、scope、认证、迁移、日志、审计等核心能力；
- `@atrium/ui`：工作台外壳与共享组件；
- `@atrium/theme`：视觉主题包、语义 token、布局 token 与图标包映射；
- `@atrium/data-mirror`：服务端数据导出编排、Git 推送、调度、锁和执行历史；
- `@atrium/server-host`：Fastify 宿主；
- `@atrium/web-host`：React Web/PWA 宿主；
- `@atrium/desktop-host`：Tauri 桌面宿主；
- `@atrium/mcp-host`：Agent MCP 宿主。

### 官方通用模块

官方模块与框架同仓开发，但不是框架核心，也不是强制功能。

第一个官方模块是：

- `@atrium/notes`：便签。

任何应用都可以选择启用或不启用官方模块。宿主和 core 不得对 `notes` 或任何其他模块编写特殊分支。

## 计划目录

```text
atrium/
├── packages/
│   ├── contracts/
│   ├── core/
│   ├── ui/
│   ├── theme/
│   ├── server-host/
│   ├── web-host/
│   ├── desktop-host/
│   ├── mcp-host/
│   └── data-mirror/
├── modules/
│   └── notes/
│       ├── manifest.ts
│       ├── shared/
│       ├── server/
│       ├── web/
│       ├── agent/
│       ├── offline/
│       ├── migrations/
│       └── tests/
├── templates/
│   └── workbench-app/
├── examples/
│   └── reference-app/
├── tooling/
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── MODULE_CONTRACT.md
│   ├── VERSIONING.md
│   └── CHANGELOG.md
├── AGENTS.md
└── README.md
```

目录会随实现逐步建立；当前仓库仍处于文档阶段。

## 应用如何使用 Atrium

个人工作台和家庭工作台应分别建立独立仓库，并锁定明确的 Atrium 版本：

```json
{
  "dependencies": {
    "@atrium/contracts": "0.1.0",
    "@atrium/core": "0.1.0",
    "@atrium/ui": "0.1.0",
    "@atrium/theme": "0.1.0",
    "@atrium/server-host": "0.1.0",
    "@atrium/web-host": "0.1.0",
    "@atrium/mcp-host": "0.1.0",
    "@atrium/notes": "0.1.0"
  }
}
```

应用必须通过版本化依赖使用框架，禁止复制 Atrium 源码后在应用仓库中长期分叉维护。

## 官方模块准入标准

模块进入本仓库的 `modules/` 前，应满足：

- 至少适用于两类不同工作台应用；
- 不依赖某个应用的品牌、流程或专有领域概念；
- 不依赖其他具体业务模块；
- 能通过标准模块契约完整接入；
- 可被应用独立启用、禁用和升级；
- 不要求宿主或 core 增加模块特例。

“多个应用可能会用到”只是必要条件，不是充分条件。

## 核心技术方向

- Node.js 22；
- Fastify + TypeScript；
- SQLite + better-sqlite3 + Drizzle ORM；
- React 19 + Vite + React Router；
- Tailwind CSS v4 + shadcn/ui；
- TanStack Query；
- react-hook-form + Zod；
- Tauri v2；
- PWA；
- pnpm workspace；
- Vitest + Playwright；
- Docker Compose + Caddy；
- Litestream。

## 设计原则

- 框架不知道具体业务模块；
- 模块之间不直接 import；
- 应用是组合边界，部署实例是运行边界；
- 服务端是唯一事实来源；
- 可读数据镜像是服务端单向导出能力，不是备份、恢复或双向同步；
- 模块负责自身数据的可读和结构化导出格式，框架负责调度、汇总与 Git 推送；
- PWA、桌面端、移动端和 Agent 不持有 Git 凭证或执行 Git 操作；
- 所有数据访问默认带 profile scope；
- 派生数据由服务端计算；
- Agent 是受约束的正式客户端，不直接访问数据库；
- 离线能力采用在线优先和受控写队列，不引入 CRDT；
- SQLite 部署遵守单写者和迁移维护窗口；
- 应用升级框架必须显式、可回滚、互不影响。

## 文档

- [产品与架构需求](docs/PRD.md)
- [Agent 与工程协作规范](AGENTS.md)

后续实现时，架构说明、模块契约、版本兼容和变更记录会拆分为独立文档。

## 当前第一阶段

第一阶段不追求一次性交付完整工作台，目标是建立可验证的最小闭环：

1. monorepo 与工程守卫；
2. 共享契约和受限数据访问；
3. Server/Web/MCP 宿主；
4. 官方便签模块；
5. 服务端可读数据镜像垂直切片；
6. 应用模板；
7. reference app 集成验证；
8. 包发布与应用版本锁定。

完成后，个人工作台将作为第一个独立应用仓库接入 Atrium。
