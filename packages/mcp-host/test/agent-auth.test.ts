/**
 * @atrium/mcp-host — Agent token 校验测试。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyAgentToken } from "../src/index.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("verifyAgentToken", () => {
  it("服务端返回 profileId 时校验通过", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { profileId: "default" } }),
    }) as unknown as typeof fetch;

    const result = await verifyAgentToken({
      token: "valid-token",
      serverBaseUrl: "http://127.0.0.1:9910",
    });
    expect(result.profileId).toBe("default");

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:9910/api/core/auth/agent-login");
    expect(JSON.parse(String(init.body))).toEqual({ token: "valid-token" });
  });

  it("服务端拒绝时抛错(含状态码与原因)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: "unauthorized", message: "Invalid agent token" } }),
    }) as unknown as typeof fetch;

    await expect(
      verifyAgentToken({ token: "bad", serverBaseUrl: "http://x:1" }),
    ).rejects.toThrow(/401.*Invalid agent token/);
  });

  it("网络错误时抛错", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(
      verifyAgentToken({ token: "t", serverBaseUrl: "http://x:1" }),
    ).rejects.toThrow();
  });

  it("baseUrl 末尾斜杠被归一化", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { profileId: "default" } }),
    }) as unknown as typeof fetch;
    await verifyAgentToken({
      token: "t",
      serverBaseUrl: "http://127.0.0.1:9910/",
    });
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).not.toContain("//api/");
  });
});
