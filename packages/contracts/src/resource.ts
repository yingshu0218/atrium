/**
 * Resource 描述(PRD §11.4 / AGENTS §10)。
 * 模块通过 resource registry 注册资源类型;跨模块关联统一走
 * resource registry / relations / entity_tags / attachments。
 */

/** Agent 对资源可执行的标准操作(通用工具,见 AGENTS §15) */
export type AgentOperationName =
  | "list"
  | "get"
  | "create"
  | "update"
  | "delete"
  | "search";

export interface ResourceFieldDescriptor {
  name: string;
  label: string;
  type: "string" | "text" | "number" | "boolean" | "timestamp" | "relation" | "tags" | "attachments";
  required?: boolean;
}

export interface ResourceDescriptor {
  /** 资源类型,如 "note";短 ID 前缀与之相同 */
  type: string;
  label: string;
  /** 资源所属模块 id */
  moduleId: string;
  fields: readonly ResourceFieldDescriptor[];
  /** 允许的 Agent 操作(缺省表示全部标准操作) */
  agentOperations?: readonly AgentOperationName[];
}

/** Agent 工具能力名称(AGENTS §15,通用工具总数控制在 10 个以内) */
export const AGENT_TOOLS = [
  "list",
  "get",
  "create",
  "update",
  "delete",
  "search",
  "relate",
  "capture",
  "describe",
] as const;

export type AgentToolName = (typeof AGENT_TOOLS)[number];
