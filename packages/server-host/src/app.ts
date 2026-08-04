/**
 * @atrium/server-host — Fastify 应用组装。
 *
 * createServer 返回配置好的 Fastify 实例:
 * - /api/core/health、/api/core/version;
 * - /api/core/auth/*(login / logout / me / admin-challenge);
 * - 统一响应 envelope { data } 或 { error };
 * - 会话解析(cookie)挂在每个请求的 request.session;
 * - 写操作 CSRF 防护;
 * - 全局错误处理把 CoreError / zod 错误转成稳定错误码。
 */
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { z } from "zod";
import { ERROR_CODES } from "@atrium/contracts";
import type { AuthMode } from "@atrium/contracts";
import { CoreError } from "@atrium/core";
import type { CoreRuntime } from "@atrium/core";
import {
  SESSION_COOKIE_NAME,
  createSessionStore,
  verifyPassword,
} from "./auth.js";
import type { Session, SessionStore } from "./auth.js";
import { registerAdminMirrorApi } from "./admin-mirror.js";
import type { AdminMirrorDeps } from "./admin-mirror.js";
import { errorStatusCode, toEnvelopeError } from "./errors.js";
import { createCsrfGuard } from "./csrf.js";

export interface ServerOptions {
  runtime: CoreRuntime;
  applicationId: string;
  name: string;
  version: string;
  authMode: AuthMode;
  passwordHash: string;
  adminPasswordHash: string;
  /** Agent token 的存储哈希;提供时启用 POST /api/core/auth/agent-login(AGENTS §13)。 */
  agentTokenHash?: string;
  /** CSRF 配置:无 Origin 头的写请求是否放行(非浏览器客户端)。 */
  csrf?: { skipWhenNoOrigin?: boolean };
  /** 会话 cookie 是否带 Secure 标记(生产由 env 配置传入,如 ATRIUM_COOKIE_SECURE)。 */
  cookieSecure?: boolean;
  /** 数据镜像管理员能力(提供后启用 /api/core/admin/data-mirror/*,AGENTS §5.8)。 */
  adminMirror?: AdminMirrorDeps;
}

const loginSchema = z.object({
  password: z.string().min(1),
  profileId: z.string().min(1).optional(),
});

const adminChallengeSchema = z.object({
  password: z.string().min(1),
});

const agentLoginSchema = z.object({
  token: z.string().min(1),
});

const DEFAULT_PROFILE = "default";

function registerCoreApi(
  app: FastifyInstance,
  options: ServerOptions,
  store: SessionStore,
): void {
  app.get("/api/core/health", async () => ({
    data: { status: "ok", time: new Date().toISOString() },
  }));

  app.get("/api/core/version", async () => ({
    data: {
      applicationId: options.applicationId,
      name: options.name,
      version: options.version,
    },
  }));

  app.post("/api/core/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const passwordOk = await verifyPassword(
      parsed.data.password,
      options.passwordHash,
    );
    if (!passwordOk) {
      throw new CoreError(ERROR_CODES.UNAUTHORIZED, "Invalid password");
    }
    const profileId =
      options.authMode === "single"
        ? DEFAULT_PROFILE
        : (parsed.data.profileId ?? DEFAULT_PROFILE);
    const session = store.create(profileId);
    reply.setCookie(SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: options.cookieSecure ?? false,
      path: "/",
    });
    return { data: { profileId } };
  });

  app.post("/api/core/auth/logout", async (request, reply) => {
    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (token !== undefined) {
      store.revoke(token);
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return { data: { ok: true } };
  });

  app.get("/api/core/auth/me", async (request) => {
    const session = request.session;
    if (session === null) {
      return { data: { authenticated: false, profileId: null } };
    }
    return {
      data: { authenticated: true, profileId: session.profileId },
    };
  });

  app.post("/api/core/auth/admin-challenge", async (request) => {
    const session = request.session;
    if (session === null) {
      throw new CoreError(ERROR_CODES.UNAUTHORIZED, "Authentication required");
    }
    const parsed = adminChallengeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const adminOk = await verifyPassword(
      parsed.data.password,
      options.adminPasswordHash,
    );
    if (!adminOk) {
      throw new CoreError(ERROR_CODES.UNAUTHORIZED, "Invalid admin password");
    }
    store.markAdminVerified(session.token);
    return { data: { verified: true } };
  });

  // Agent token 登录(AGENTS §13):token 只存哈希;换取普通会话(非 admin)。
  // 未配置 agentTokenHash 时该端点不可用。
  app.post("/api/core/auth/agent-login", async (request, reply) => {
    if (options.agentTokenHash === undefined) {
      throw new CoreError(
        ERROR_CODES.FORBIDDEN,
        "Agent token authentication is not enabled",
      );
    }
    const parsed = agentLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const tokenOk = await verifyPassword(
      parsed.data.token,
      options.agentTokenHash,
    );
    if (!tokenOk) {
      throw new CoreError(ERROR_CODES.UNAUTHORIZED, "Invalid agent token");
    }
    const session = store.create(DEFAULT_PROFILE);
    reply.setCookie(SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: options.cookieSecure ?? false,
      path: "/",
    });
    return { data: { profileId: DEFAULT_PROFILE } };
  });
}

export async function createServer(
  options: ServerOptions,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie);

  const store = createSessionStore();
  app.decorateRequest("session", null as Session | null);

  // 每个请求解析会话 cookie。
  app.addHook("onRequest", async (request) => {
    const token = request.cookies?.[SESSION_COOKIE_NAME];
    request.session = token === undefined ? null : (store.get(token) ?? null);
  });

  // CSRF:写操作校验 Origin 与 Host 同源(无 Origin 默认拒绝)。
  const csrfGuard = createCsrfGuard(options.csrf);
  app.addHook("onRequest", async (request) => {
    const verdict = csrfGuard(request);
    if (!verdict.ok) {
      throw new CoreError(verdict.code, verdict.message);
    }
  });

  // 统一 envelope 错误响应。
  app.setErrorHandler((err, _request, reply) => {
    const body = toEnvelopeError(err);
    reply.status(errorStatusCode(body.code)).send({ error: body });
  });

  // 未知路由统一 envelope。
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });

  registerCoreApi(app, options, store);
  if (options.adminMirror !== undefined) {
    registerAdminMirrorApi(app, options.adminMirror);
  }
  return app;
}
