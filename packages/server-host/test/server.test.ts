/**
 * @atrium/server-host 测试(:memory: SQLite + fastify.inject,不发真实端口)。
 *
 * 覆盖:
 * - health / version envelope;
 * - 认证(me / login / logout / admin-challenge / requireAdmin);
 * - 模块路由注册与 envelope、path params、zod 校验、未登录拦截;
 * - CSRF(无 Origin / 跨域拒绝 / skipWhenNoOrigin 放行)。
 */
import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ERROR_CODES } from "@atrium/contracts";
import type { ServerModule } from "@atrium/contracts";
import { createCoreRuntime, openDatabase } from "@atrium/core";
import type { CoreRuntime, SqliteDatabase } from "@atrium/core";
import { createServer, hashPassword, registerModule } from "../src/index.js";
import type { ServerOptions } from "../src/index.js";

const PASSWORD = "secret-password";
const ADMIN_PASSWORD = "admin-password";
const SAME_ORIGIN = { host: "localhost", origin: "http://localhost" };

/** 从 Set-Cookie 头提取 atrium_session 值。 */
function extractSessionCookie(setCookie: unknown): string | undefined {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (header === undefined) {
    return undefined;
  }
  const match = /atrium_session=([^;]+)/.exec(String(header));
  return match?.[1];
}

/** 测试模块:hello / greet/:name / echo(POST, zod body) / admin-check(requireAdmin)。 */
function createTestModule(): ServerModule {
  return {
    metadata: {
      id: "test-mod",
      name: "Test Module",
      version: "0.1.0",
      capabilities: ["server"],
    },
    register(ctx) {
      ctx.routes.register({
        method: "GET",
        path: "/hello",
        handler: async () => ({ hello: true }),
      });
      ctx.routes.register({
        method: "GET",
        path: "/greet/:name",
        handler: async (req) => ({ name: req.params.name }),
      });
      ctx.routes.register({
        method: "POST",
        path: "/echo",
        schema: { body: z.object({ name: z.string() }) },
        handler: async (req) => ({ echo: (req.body as { name: string }).name }),
      });
      ctx.routes.register({
        method: "GET",
        path: "/admin-check",
        handler: async (req, host) => {
          await host.requireAdmin();
          return { admin: true };
        },
      });
    },
  };
}

async function buildServer(
  overrides: Partial<ServerOptions> = {},
): Promise<{ app: FastifyInstance; runtime: CoreRuntime; db: SqliteDatabase }> {
  const db = openDatabase(":memory:");
  const runtime = createCoreRuntime(db);
  const app = await createServer({
    runtime,
    applicationId: "test-app",
    name: "Test App",
    version: "0.1.0",
    authMode: "single",
    passwordHash: await hashPassword(PASSWORD),
    adminPasswordHash: await hashPassword(ADMIN_PASSWORD),
    ...overrides,
  });
  return { app, runtime, db };
}

async function login(
  app: FastifyInstance,
  password: string = PASSWORD,
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/core/auth/login",
    headers: SAME_ORIGIN,
    payload: { password },
  });
  expect(res.statusCode).toBe(200);
  const cookie = extractSessionCookie(res.headers["set-cookie"]);
  expect(cookie).toBeDefined();
  return cookie as string;
}

describe("core api", () => {
  it("GET /api/core/health returns envelope", async () => {
    const { app, runtime } = await buildServer();
    try {
      const res = await app.inject({ method: "GET", url: "/api/core/health" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("data");
      expect(body.data.status).toBe("ok");
      expect(typeof body.data.time).toBe("string");
    } finally {
      await app.close();
      runtime.close();
    }
  });

  it("GET /api/core/version returns envelope", async () => {
    const { app, runtime } = await buildServer();
    try {
      const res = await app.inject({ method: "GET", url: "/api/core/version" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        data: {
          applicationId: "test-app",
          name: "Test App",
          version: "0.1.0",
        },
      });
    } finally {
      await app.close();
      runtime.close();
    }
  });

  it("unauthenticated /api/core/auth/me reports authenticated=false", async () => {
    const { app, runtime } = await buildServer();
    try {
      const res = await app.inject({
        method: "GET",
        url: "/api/core/auth/me",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        data: { authenticated: false, profileId: null },
      });
    } finally {
      await app.close();
      runtime.close();
    }
  });

  it("login with wrong password is unauthorized", async () => {
    const { app, runtime } = await buildServer();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/core/auth/login",
        headers: SAME_ORIGIN,
        payload: { password: "wrong-password" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({
        error: { code: ERROR_CODES.UNAUTHORIZED },
      });
    } finally {
      await app.close();
      runtime.close();
    }
  });

  it("login sets httpOnly session cookie and me turns authenticated", async () => {
    const { app, runtime } = await buildServer();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/core/auth/login",
        headers: SAME_ORIGIN,
        payload: { password: PASSWORD },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: { profileId: "default" } });
      const setCookie = String(res.headers["set-cookie"] ?? "");
      expect(setCookie).toContain("atrium_session=");
      expect(setCookie.toLowerCase()).toContain("httponly");
      expect(setCookie.toLowerCase()).toContain("samesite=lax");

      const cookie = extractSessionCookie(res.headers["set-cookie"]);
      const me = await app.inject({
        method: "GET",
        url: "/api/core/auth/me",
        headers: { ...SAME_ORIGIN, cookie: `atrium_session=${cookie}` },
      });
      expect(me.statusCode).toBe(200);
      expect(me.json()).toEqual({
        data: { authenticated: true, profileId: "default" },
      });
    } finally {
      await app.close();
      runtime.close();
    }
  });

  it("logout revokes the session", async () => {
    const { app, runtime } = await buildServer();
    try {
      const cookie = await login(app);
      const res = await app.inject({
        method: "POST",
        url: "/api/core/auth/logout",
        headers: { ...SAME_ORIGIN, cookie: `atrium_session=${cookie}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: { ok: true } });
      const me = await app.inject({
        method: "GET",
        url: "/api/core/auth/me",
        headers: { ...SAME_ORIGIN, cookie: `atrium_session=${cookie}` },
      });
      expect(me.json()).toEqual({
        data: { authenticated: false, profileId: null },
      });
    } finally {
      await app.close();
      runtime.close();
    }
  });

  it("admin-challenge gates requireAdmin routes", async () => {
    const { app, runtime } = await buildServer();
    try {
      await registerModule(app, runtime, createTestModule());
      const cookie = await login(app);
      const authed = { ...SAME_ORIGIN, cookie: `atrium_session=${cookie}` };

      // admin 前:requireAdmin 抛 admin_challenge_required。
      const before = await app.inject({
        method: "GET",
        url: "/api/m/test-mod/admin-check",
        headers: authed,
      });
      expect(before.statusCode).toBe(403);
      expect(before.json()).toMatchObject({
        error: { code: ERROR_CODES.ADMIN_CHALLENGE_REQUIRED },
      });

      // 错误 admin 密码 → unauthorized/forbidden。
      const wrong = await app.inject({
        method: "POST",
        url: "/api/core/auth/admin-challenge",
        headers: authed,
        payload: { password: "wrong-admin" },
      });
      expect([401, 403]).toContain(wrong.statusCode);
      expect([
        ERROR_CODES.UNAUTHORIZED,
        ERROR_CODES.FORBIDDEN,
      ]).toContain(wrong.json().error.code);

      // 正确 admin 密码 → verified。
      const ok = await app.inject({
        method: "POST",
        url: "/api/core/auth/admin-challenge",
        headers: authed,
        payload: { password: ADMIN_PASSWORD },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toEqual({ data: { verified: true } });

      // admin 后:requireAdmin 通过。
      const after = await app.inject({
        method: "GET",
        url: "/api/m/test-mod/admin-check",
        headers: authed,
      });
      expect(after.statusCode).toBe(200);
      expect(after.json()).toEqual({ data: { admin: true } });
    } finally {
      await app.close();
      runtime.close();
    }
  });

  it("admin-challenge without login is unauthorized", async () => {
    const { app, runtime } = await buildServer();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/core/auth/admin-challenge",
        headers: SAME_ORIGIN,
        payload: { password: ADMIN_PASSWORD },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({
        error: { code: ERROR_CODES.UNAUTHORIZED },
      });
    } finally {
      await app.close();
      runtime.close();
    }
  });
});

describe("module routes", () => {
  it("registers module routes under /api/m/{moduleId} with envelope", async () => {
    const { app, runtime } = await buildServer();
    try {
      await registerModule(app, runtime, createTestModule());
      const cookie = await login(app);
      const authed = { ...SAME_ORIGIN, cookie: `atrium_session=${cookie}` };

      const res = await app.inject({
        method: "GET",
        url: "/api/m/test-mod/hello",
        headers: authed,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: { hello: true } });

      const greet = await app.inject({
        method: "GET",
        url: "/api/m/test-mod/greet/world",
        headers: authed,
      });
      expect(greet.json()).toEqual({ data: { name: "world" } });
    } finally {
      await app.close();
      runtime.close();
    }
  });

  it("rejects unauthenticated module requests", async () => {
    const { app, runtime } = await buildServer();
    try {
      await registerModule(app, runtime, createTestModule());
      const res = await app.inject({
        method: "GET",
        url: "/api/m/test-mod/hello",
        headers: SAME_ORIGIN,
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({
        error: { code: ERROR_CODES.UNAUTHORIZED },
      });
    } finally {
      await app.close();
      runtime.close();
    }
  });

  it("returns validation_error for zod schema failures", async () => {
    const { app, runtime } = await buildServer();
    try {
      await registerModule(app, runtime, createTestModule());
      const cookie = await login(app);
      const authed = { ...SAME_ORIGIN, cookie: `atrium_session=${cookie}` };

      const bad = await app.inject({
        method: "POST",
        url: "/api/m/test-mod/echo",
        headers: authed,
        payload: { name: 123 },
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json()).toMatchObject({
        error: { code: ERROR_CODES.VALIDATION },
      });

      const ok = await app.inject({
        method: "POST",
        url: "/api/m/test-mod/echo",
        headers: authed,
        payload: { name: "alice" },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toEqual({ data: { echo: "alice" } });
    } finally {
      await app.close();
      runtime.close();
    }
  });
});

describe("csrf", () => {
  it("rejects state-changing requests without Origin header", async () => {
    const { app, runtime } = await buildServer();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/core/auth/login",
        payload: { password: PASSWORD },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({
        error: { code: ERROR_CODES.FORBIDDEN },
      });
    } finally {
      await app.close();
      runtime.close();
    }
  });

  it("rejects cross-origin state-changing requests", async () => {
    const { app, runtime } = await buildServer();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/core/auth/login",
        headers: { host: "localhost", origin: "http://evil.example" },
        payload: { password: PASSWORD },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({
        error: { code: ERROR_CODES.FORBIDDEN },
      });
    } finally {
      await app.close();
      runtime.close();
    }
  });

  it("does not block GET requests with a foreign origin", async () => {
    const { app, runtime } = await buildServer();
    try {
      const res = await app.inject({
        method: "GET",
        url: "/api/core/health",
        headers: { host: "localhost", origin: "http://evil.example" },
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
      runtime.close();
    }
  });

  it("skipWhenNoOrigin allows non-browser clients", async () => {
    const { app, runtime } = await buildServer({ csrf: { skipWhenNoOrigin: true } });
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/core/auth/login",
        payload: { password: PASSWORD },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: { profileId: "default" } });
    } finally {
      await app.close();
      runtime.close();
    }
  });
});
