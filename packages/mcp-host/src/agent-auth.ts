/**
 * Agent 通道身份校验(AGENTS §13 / §15)。
 *
 * MCP 进程启动时必须验证自己持有合法的 Agent token,否则拒绝运行。
 * 校验委托给服务端的 /api/core/auth/agent-login(服务端强制执行
 * token scope 与 profile,AGENTS §15),避免在客户端重复实现密码学逻辑。
 */
export interface VerifyAgentTokenOptions {
  /** Agent token(部署注入,如环境变量 ATRIUM_AGENT_TOKEN) */
  token: string;
  /** server-host 的 base URL,如 http://127.0.0.1:9910 */
  serverBaseUrl: string;
  timeoutMs?: number;
}

export interface AgentTokenVerification {
  /** 服务端绑定的 profile id(当前 single 模式为 "default") */
  profileId: string;
}

/** 验证 token;失败抛错(启动时应 catch 并退出)。 */
export async function verifyAgentToken(
  options: VerifyAgentTokenOptions,
): Promise<AgentTokenVerification> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const res = await fetch(
    `${options.serverBaseUrl.replace(/\/$/, "")}/api/core/auth/agent-login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: options.token }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const body = (await res.json().catch(() => null)) as
    | { data?: { profileId?: string }; error?: { message?: string } }
    | null;
  if (!res.ok || body?.data?.profileId === undefined) {
    throw new Error(
      `Agent token 验证失败(HTTP ${res.status}): ${
        body?.error?.message ?? "unauthorized"
      }`,
    );
  }
  return { profileId: body.data.profileId };
}
