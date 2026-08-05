/**
 * Agent MCP 入口(stdio):mcp-host + 已安装模块的 Agent 能力。
 * 启动前必须通过服务端验证 Agent token(AGENTS §13/§15:token scope 与
 * profile 在服务端强制执行);验证失败拒绝运行。
 */
import { createCoreRuntime, openDatabase } from "@atrium/core";
import { AgentService, createMcpServer, runStdio, verifyAgentToken } from "@atrium/mcp-host";
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

  // 启动前验证 Agent token(server-host 需配置相同的 agentTokenHash)。
  const agentToken = requiredEnv("ATRIUM_AGENT_TOKEN");
  const serverBaseUrl = requiredEnv("ATRIUM_SERVER_URL");
  const verified = await verifyAgentToken({
    token: agentToken,
    serverBaseUrl,
  });
  console.log(`[workbench-mcp] agent token 验证通过(profile=${verified.profileId})`);

  const agentService = new AgentService({
    runtime,
    modules: [notesAgentModule],
    profileId: verified.profileId,
  });
  const server = createMcpServer(agentService);
  runStdio((json) => server.handleMessage(json));
}

main().catch((error: unknown) => {
  console.error("[workbench-mcp] failed:", error);
  process.exitCode = 1;
});
