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

## 仓库定位

本仓库包含两类代码：

### 框架基础设施

规划中的框架包包括：

- `@atrium/contracts`：运行时无关的共享契约；
- `@atrium/core`：数据库、scope、认证、迁移、日志、审计等核心能力；
- `@atrium/ui`：工作台外壳与共享组件；
- `@atrium/theme`：主题与布局 token；
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
│   └── mcp-host/
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
4. 应用模板；
5. 官方便签模块；
6. reference app 集成验证；
7. 包发布与应用版本锁定。

完成后，个人工作台将作为第一个独立应用仓库接入 Atrium。
