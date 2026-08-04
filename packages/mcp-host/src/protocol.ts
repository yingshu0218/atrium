/**
 * 极简 JSON-RPC 2.0 消息工具(AGENTS.md §15:不依赖外部 MCP SDK)。
 * 覆盖 MCP stdio 传输所需的子集:请求 / 通知 / 响应 / 错误对象。
 */

/** JSON-RPC 请求/响应 id(string / number / null)。 */
export type JsonRpcId = string | number | null;

/** 带 id 的请求(需要响应)。 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

/** 通知(无 id,不需要响应)。 */
export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

/** JSON-RPC 错误对象(负数保留给协议层)。 */
export interface ErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

/** 成功响应 */
export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

/** 错误响应 */
export interface JsonRpcError {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: ErrorObject;
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

/** 解析结果:请求(带 id)、通知(无 id)或无效消息。 */
export type ParsedMessage =
  | { kind: "request"; message: JsonRpcRequest }
  | { kind: "notification"; message: JsonRpcNotification }
  | { kind: "invalid"; error: ErrorObject };

/**
 * 解析一行 JSON-RPC 消息。
 * 解析失败返回 -32700(Parse error);结构非法返回 -32600(Invalid Request)。
 */
export function parseMessage(json: string): ParsedMessage {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { kind: "invalid", error: { code: -32700, message: "Parse error" } };
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { kind: "invalid", error: { code: -32600, message: "Invalid Request" } };
  }
  const record = raw as Record<string, unknown>;
  if (record.jsonrpc !== "2.0" || typeof record.method !== "string") {
    return { kind: "invalid", error: { code: -32600, message: "Invalid Request" } };
  }

  const hasId = "id" in record;
  const id = record.id as JsonRpcId;
  if (hasId && typeof id !== "string" && typeof id !== "number" && id !== null) {
    return { kind: "invalid", error: { code: -32600, message: "Invalid Request" } };
  }
  if (hasId) {
    const message: JsonRpcRequest = { jsonrpc: "2.0", id, method: record.method };
    if ("params" in record) {
      message.params = record.params;
    }
    return { kind: "request", message };
  }
  const message: JsonRpcNotification = { jsonrpc: "2.0", method: record.method };
  if ("params" in record) {
    message.params = record.params;
  }
  return { kind: "notification", message };
}

/** 序列化任意值为一行 JSON(供 stdout 输出)。 */
export function serialize(value: unknown): string {
  return JSON.stringify(value);
}

export function successResponse(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

export function errorResponse(id: JsonRpcId, error: ErrorObject): JsonRpcError {
  return { jsonrpc: "2.0", id, error };
}
