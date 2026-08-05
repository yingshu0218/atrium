/**
 * Agent MCP 入口(stdio):mcp-host + 已安装模块的 Agent 能力。
 * profileId 与 token 由部署配置注入(AGENTS §15:token scope 服务端强制)。
 */
import { createCoreRuntime, openDatabase } from "@atrium/core";
import { AgentService, createMcpServer, runStdio } from "@atrium/mcp-host";
import { notesAgentModule } from "@atrium/notes/agent";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`缺少环境变量 ${name}(见 .env.example)`);
  }
  return value;
}

async function main(): Promise<void> {
  const db = openDatabase(process.env.ATRIUM_DB_PATH ?? ":memory:");
  const runtime = createCoreRuntime(db);
  const profileId = process.env.ATRIUM_MCP_PROFILE_ID ?? "default";
  // TODO: 在服务端校验 token(与 server-host 的 agentTokenHash 对应),
  // 当前为最小接入,生产必须接 token 校验。
  void requiredEnv("ATRIUM_AGENT_TOKEN");

  const agentService = new AgentService({
    runtime,
    modules: [notesAgentModule],
    profileId,
  });
  const server = createMcpServer(agentService);
  runStdio((json) => server.handleMessage(json));
}

main().catch((error: unknown) => {
  console.error("[workbench-mcp] failed:", error);
  process.exitCode = 1;
});
