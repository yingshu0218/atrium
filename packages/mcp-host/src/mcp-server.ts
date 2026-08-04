/**
 * MCP Server 宿主(AGENTS.md §15 / PRD §18)。
 * 极简 JSON-RPC 2.0 over stdio,不依赖外部 MCP SDK:
 * - initialize / notifications/initialized 握手;
 * - tools/list 暴露 9 个通用工具(资源类型作为参数传入);
 * - tools/call 按工具名分发到 AgentService;
 * - 参数错误 → JSON-RPC error -32602;内部错误 → -32603。
 *
 * 日志一律写 stderr,stdout 只输出协议响应(换行分隔)。
 */
import { AGENT_TOOLS } from "@atrium/contracts";
import type { AgentToolName } from "@atrium/contracts";
import * as readline from "node:readline";
import {
  stderr as processStderr,
  stdin as processStdin,
  stdout as processStdout,
} from "node:process";
import type { AgentService } from "./agent-service.js";
import {
  errorResponse,
  parseMessage,
  serialize,
  successResponse,
} from "./protocol.js";
import type { ErrorObject } from "./protocol.js";

/** 对外声明:与 MCP 客户端协商的协议版本。 */
export const PROTOCOL_VERSION = "2024-11-05";
/** 服务器信息版本(与 packages/mcp-host/package.json 保持同步)。 */
export const SERVER_VERSION = "0.1.0";

/** 工具定义(MCP tools/list 的 schema 形状)。 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: readonly string[];
  };
}

const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "list",
    description: "分页列出指定资源类型的记录,默认 limit 10,返回最小字段集。",
    inputSchema: {
      type: "object",
      properties: {
        resourceType: { type: "string", description: "资源类型,如 \"note\"" },
        limit: { type: "integer", minimum: 1, description: "最大条数,默认 10" },
        cursor: { type: "string", description: "分页游标(上一页返回的 nextCursor)" },
      },
      required: ["resourceType"],
    },
  },
  {
    name: "get",
    description: "按短 ID 获取单条资源。",
    inputSchema: {
      type: "object",
      properties: {
        resourceType: { type: "string", description: "资源类型,如 \"note\"" },
        id: { type: "string", description: "资源 ID(短 ID 或 UUID)" },
      },
      required: ["resourceType", "id"],
    },
  },
  {
    name: "create",
    description: "创建资源(幂等,写入进入 audit log)。",
    inputSchema: {
      type: "object",
      properties: {
        resourceType: { type: "string", description: "资源类型,如 \"note\"" },
        input: { type: "object", description: "创建字段(input)键值对" },
      },
      required: ["resourceType", "input"],
    },
  },
  {
    name: "update",
    description: "部分更新资源(幂等,写入进入 audit log)。",
    inputSchema: {
      type: "object",
      properties: {
        resourceType: { type: "string", description: "资源类型,如 \"note\"" },
        id: { type: "string", description: "资源 ID" },
        patch: { type: "object", description: "待更新的字段(patch)键值对" },
      },
      required: ["resourceType", "id", "patch"],
    },
  },
  {
    name: "delete",
    description: "软删除资源(写入进入 audit log)。",
    inputSchema: {
      type: "object",
      properties: {
        resourceType: { type: "string", description: "资源类型,如 \"note\"" },
        id: { type: "string", description: "资源 ID" },
      },
      required: ["resourceType", "id"],
    },
  },
  {
    name: "search",
    description: "跨资源搜索(可按 resourceType 限定范围)。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索关键字" },
        resourceType: { type: "string", description: "可选的资源类型过滤" },
        limit: { type: "integer", minimum: 1, description: "最大条数,默认 10" },
      },
      required: ["query"],
    },
  },
  {
    name: "relate",
    description: "建立跨模块资源关联(写入进入 audit log)。",
    inputSchema: {
      type: "object",
      properties: {
        relationType: { type: "string", description: "关系类型,如 \"mentions\"" },
        sourceResourceType: { type: "string" },
        sourceResourceId: { type: "string" },
        targetResourceType: { type: "string" },
        targetResourceId: { type: "string" },
      },
      required: [
        "relationType",
        "sourceResourceType",
        "sourceResourceId",
        "targetResourceType",
        "targetResourceId",
      ],
    },
  },
  {
    name: "capture",
    description: "快速输入一段文本,由模块捕获为资源(写入进入 audit log)。",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "待捕获的文本内容" },
      },
      required: ["text"],
    },
  },
  {
    name: "describe",
    description: "返回当前可用资源目录(资源类型、标签与支持的操作)。",
    inputSchema: { type: "object", properties: {} },
  },
];

/** 协议层错误(转成 JSON-RPC 错误码)。 */
class JsonRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "JsonRpcError";
  }
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new JsonRpcError(-32602, `invalid params: "${key}" must be a non-empty string`);
  }
  return value;
}

function requireObject(
  args: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = args[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new JsonRpcError(-32602, `invalid params: "${key}" must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new JsonRpcError(-32602, `invalid params: "${key}" must be a string`);
  }
  return value;
}

function optionalInt(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new JsonRpcError(-32602, `invalid params: "${key}" must be a positive integer`);
  }
  return value;
}

/** 校验 tools/call 参数:name 必须是 9 个通用工具之一,arguments 必须是对象。 */
function validateCallParams(params: unknown): {
  name: AgentToolName;
  arguments: Record<string, unknown>;
} {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new JsonRpcError(-32602, "invalid params: tools/call requires an object params");
  }
  const record = params as Record<string, unknown>;
  const name = record.name;
  if (
    typeof name !== "string" ||
    !(AGENT_TOOLS as readonly string[]).includes(name)
  ) {
    throw new JsonRpcError(-32602, `invalid params: unknown tool "${String(name)}"`);
  }
  const args = record.arguments;
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw new JsonRpcError(-32602, 'invalid params: tools/call "arguments" must be an object');
  }
  return { name: name as AgentToolName, arguments: args as Record<string, unknown> };
}

/** 分发 tools/call 到 AgentService;参数形状错误抛 -32602。 */
function callTool(
  agentService: AgentService,
  name: AgentToolName,
  args: Record<string, unknown>,
): unknown {
  switch (name) {
    case "describe":
      return agentService.describe();
    case "list": {
      const limit = optionalInt(args, "limit");
      const cursor = optionalString(args, "cursor");
      return agentService.list({
        resourceType: requireString(args, "resourceType"),
        ...(limit !== undefined ? { limit } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
      });
    }
    case "get":
      return agentService.get({
        resourceType: requireString(args, "resourceType"),
        id: requireString(args, "id"),
      });
    case "create":
      return agentService.create({
        resourceType: requireString(args, "resourceType"),
        input: requireObject(args, "input"),
      });
    case "update":
      return agentService.update({
        resourceType: requireString(args, "resourceType"),
        id: requireString(args, "id"),
        patch: requireObject(args, "patch"),
      });
    case "delete":
      return agentService.delete({
        resourceType: requireString(args, "resourceType"),
        id: requireString(args, "id"),
      });
    case "search": {
      const resourceType = optionalString(args, "resourceType");
      const limit = optionalInt(args, "limit");
      return agentService.search({
        query: requireString(args, "query"),
        ...(resourceType !== undefined ? { resourceType } : {}),
        ...(limit !== undefined ? { limit } : {}),
      });
    }
    case "relate":
      return agentService.relate({
        relationType: requireString(args, "relationType"),
        sourceResourceType: requireString(args, "sourceResourceType"),
        sourceResourceId: requireString(args, "sourceResourceId"),
        targetResourceType: requireString(args, "targetResourceType"),
        targetResourceId: requireString(args, "targetResourceId"),
      });
    case "capture":
      return agentService.capture({
        text: requireString(args, "text"),
      });
  }
}

/** 方法分发(不抛出的业务失败由模块返回 { error } 对象,包装进 result)。 */
async function dispatch(
  agentService: AgentService,
  method: string,
  params: unknown,
): Promise<unknown> {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "atrium-mcp", version: SERVER_VERSION },
      };
    case "notifications/initialized":
      return null;
    case "tools/list":
      return { tools: TOOL_DEFINITIONS };
    case "tools/call": {
      const { name, arguments: args } = validateCallParams(params);
      const callResult = await callTool(agentService, name, args);
      return {
        content: [{ type: "text", text: JSON.stringify(callResult) }],
      };
    }
    default:
      throw new JsonRpcError(-32601, `method not found: ${method}`);
  }
}

export interface McpServer {
  /** 处理一行 JSON 消息;通知返回 null,请求返回响应对象。 */
  handleMessage(json: string): Promise<unknown>;
  /** 启动 stdio 传输(逐行 JSON)。 */
  runStdio(options?: RunStdioOptions): void;
}

/** runStdio 选项;默认绑定 process.stdin/stdout,日志写 process.stderr。 */
export interface RunStdioOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  log?: (message: string) => void;
}

/**
 * 创建 MCP Server。
 * 注意:handleMessage 对 notification 返回 null(无响应),对 request 返回
 * { jsonrpc, id, result | error } 响应对象。
 */
export function createMcpServer(agentService: AgentService): McpServer {
  const handleMessage = async (json: string): Promise<unknown> => {
    const parsed = parseMessage(json);
    if (parsed.kind === "invalid") {
      return errorResponse(null, parsed.error);
    }
    if (parsed.kind === "notification") {
      return null;
    }
    const { id, method, params } = parsed.message;
    try {
      const result = await dispatch(agentService, method, params);
      return successResponse(id, result);
    } catch (err) {
      if (err instanceof JsonRpcError) {
        return errorResponse(id, { code: err.code, message: err.message } satisfies ErrorObject);
      }
      return errorResponse(id, { code: -32603, message: "internal error" });
    }
  };

  return {
    handleMessage,
    runStdio: (options) => runStdio(handleMessage, options),
  };
}

/**
 * stdio 传输:逐行读取 input,每行视为一条 JSON-RPC 消息,响应以换行写入
 * output;日志写 stderr(避免污染协议)。支持 SIGINT 优雅退出。
 */
export function runStdio(
  handleMessage: (json: string) => unknown | Promise<unknown>,
  options: RunStdioOptions = {},
): void {
  const input = options.input ?? processStdin;
  const output = options.output ?? processStdout;
  const log =
    options.log ??
    ((message: string) => {
      processStderr.write(`${message}\n`);
    });

  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return;
    }
    Promise.resolve(handleMessage(trimmed))
      .then((response) => {
        if (response !== null && response !== undefined) {
          output.write(`${serialize(response)}\n`);
        }
      })
      .catch((err: unknown) => {
        log(`mcp-host error: ${err instanceof Error ? err.message : String(err)}`);
      });
  });

  const onSigint = () => {
    log("SIGINT received, shutting down");
    rl.close();
    output.end();
    process.off("SIGINT", onSigint);
    process.exit(0);
  };
  process.on("SIGINT", onSigint);
}
