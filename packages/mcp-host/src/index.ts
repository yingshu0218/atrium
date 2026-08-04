/**
 * @atrium/mcp-host — Agent MCP 宿主(AGENTS.md §15 / PRD §18)。
 * 极简 JSON-RPC 2.0 over stdio,不依赖外部 MCP SDK。
 */
export { AgentService, DEFAULT_LIMIT } from "./agent-service.js";
export type {
  AgentServiceOptions,
  ListArgs,
  GetArgs,
  CreateArgs,
  UpdateArgs,
  DeleteArgs,
  SearchArgs,
  CaptureArgs,
  RelateArgs,
  AgentError,
} from "./agent-service.js";
export { createMcpServer, runStdio, PROTOCOL_VERSION, SERVER_VERSION } from "./mcp-server.js";
export type { McpServer, RunStdioOptions, ToolDefinition } from "./mcp-server.js";
export {
  parseMessage,
  serialize,
  successResponse,
  errorResponse,
} from "./protocol.js";
export type {
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcSuccess,
  JsonRpcError,
  JsonRpcResponse,
  ErrorObject,
  ParsedMessage,
} from "./protocol.js";
