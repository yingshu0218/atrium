/**
 * @atrium/server-host 数据镜像管理员 API 测试。
 * 覆盖:未登录 401、非 admin 403、admin 后可读写配置(secret 不回显)、
 * run/test 端点行为。
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createCoreRuntime, openDatabase } from "@atrium/core";
import type { CoreRuntime, SqliteDatabase } from "@atrium/core";
import {
  DataMirrorEngine,
  MirrorConfigStore,
  MirrorHistory,
} from "@atrium/data-mirror";
import { createServer, hashPassword } from "../src/index.js";

const PASSWORD = "secret-password";
const ADMIN_PASSWORD = "admin-password";
const SAME_ORIGIN = { host: "localhost", origin: "http://localhost" };

interface TestContext {
  app: FastifyInstance;
  runtime: CoreRuntime;
  db: SqliteDatabase;
  cleanup(): void;
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

async function buildAdminServer(): Promise<TestContext> {
  const root = mkdtempSync(join(tmpdir(), "atrium-admin-test-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));

  const db = openDatabase(":memory:");
  const runtime = createCoreRuntime(db);
  const configStore = new MirrorConfigStore(runtime.config);
  const history = new MirrorHistory(runtime.config);
  const engine = new DataMirrorEngine({
    runtime,
    modules: [],
    configStore,
    history,
    workDir: join(root, "work"),
  });

  const app = await createServer({
    runtime,
    applicationId: "test-app",
    name: "Test App",
    version: "0.1.0",
    authMode: "single",
    passwordHash: await hashPassword(PASSWORD),
    adminPasswordHash: await hashPassword(ADMIN_PASSWORD),
    adminMirror: { runtime, engine, configStore, history },
  });
  return {
    app,
    runtime,
    db,
    cleanup: () => {
      void app.close();
      runtime.close();
    },
  };
}

async function login(
  app: FastifyInstance,
  password = PASSWORD,
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/core/auth/login",
    headers: SAME_ORIGIN,
    payload: { password },
  });
  const setCookie = res.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return String(cookie).split(";")[0] as string;
}

async function challengeAdmin(
  app: FastifyInstance,
  cookie: string,
): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: "/api/core/auth/admin-challenge",
    headers: { ...SAME_ORIGIN, cookie },
    payload: { password: ADMIN_PASSWORD },
  });
  expect(res.statusCode).toBe(200);
}

describe("admin data mirror api", () => {
  it("未登录访问返回 unauthorized", async () => {
    const ctx = await buildAdminServer();
    try {
      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/core/admin/data-mirror/config",
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("unauthorized");
    } finally {
      ctx.cleanup();
    }
  });

  it("已登录但未通过 admin challenge 返回 admin_challenge_required", async () => {
    const ctx = await buildAdminServer();
    try {
      const cookie = await login(ctx.app);
      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/core/admin/data-mirror/config",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("admin_challenge_required");
    } finally {
      ctx.cleanup();
    }
  });

  it("admin 可更新配置;secret 不进入任何响应", async () => {
    const ctx = await buildAdminServer();
    try {
      const cookie = await login(ctx.app);
      await challengeAdmin(ctx.app, cookie);

      const put = await ctx.app.inject({
        method: "PUT",
        url: "/api/core/admin/data-mirror/config",
        headers: { ...SAME_ORIGIN, cookie },
        payload: {
          enabled: true,
          repoUrl: "https://user:token-secret@example.com/repo.git",
          branch: "main",
          authType: "pat",
          pat: "token-secret",
          schedule: "manual",
        },
      });
      expect(put.statusCode).toBe(200);
      const body = JSON.stringify(put.json());
      expect(body).not.toContain("token-secret");
      expect(put.json().data).toMatchObject({
        enabled: true,
        branch: "main",
        authType: "pat",
        schedule: "manual",
      });

      const get = await ctx.app.inject({
        method: "GET",
        url: "/api/core/admin/data-mirror/config",
        headers: { cookie },
      });
      const getBody = JSON.stringify(get.json());
      expect(getBody).not.toContain("token-secret");
    } finally {
      ctx.cleanup();
    }
  });

  it("未配置时 run 返回 skipped,test 返回失败", async () => {
    const ctx = await buildAdminServer();
    try {
      const cookie = await login(ctx.app);
      await challengeAdmin(ctx.app, cookie);

      const run = await ctx.app.inject({
        method: "POST",
        url: "/api/core/admin/data-mirror/run",
        headers: { ...SAME_ORIGIN, cookie },
        payload: {},
      });
      expect(run.statusCode).toBe(200);
      expect(run.json().data.status).toBe("skipped");

      const test = await ctx.app.inject({
        method: "POST",
        url: "/api/core/admin/data-mirror/test",
        headers: { ...SAME_ORIGIN, cookie },
        payload: {},
      });
      expect(test.statusCode).toBe(200);
      expect(test.json().data.ok).toBe(false);
    } finally {
      ctx.cleanup();
    }
  });
});
