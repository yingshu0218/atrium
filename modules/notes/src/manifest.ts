/**
 * @atrium/notes manifest — 运行时无关的模块元数据。
 * 硬性约束:不得 import React / Fastify / 数据库实例(AGENTS.md §6)。
 */
import type { ModuleMetadata } from "@atrium/contracts";

export const notesManifest: ModuleMetadata = {
  id: "notes",
  name: "便签",
  version: "0.1.0",
  description:
    "官方通用便签模块:支持 CRUD、搜索、快速捕获(capture)、标签、跨模块关联与附件元数据登记,覆盖迁移、Web 页面、Agent 与离线白名单主链路。",
  capabilities: [
    "server",
    "web",
    "agent",
    "offline",
    "data-mirror",
    "migrations",
  ],
};
