/**
 * @atrium/server-host — 模块路由适配器。
 *
 * 把 contracts 的 RouteRegistrar 适配到 Fastify:
 * - 路由挂载在 /api/m/{moduleId}{path};
 * - 解析会话 cookie 得到 profileId 与 adminVerified;
 * - 用 zod 校验 body/query/params;
 * - 构造 RouteRequest 并调用模块 handler(req, host);
 * - 响应包装为 { data }。
 *
 * 模块 API 要求已认证(未登录返回 unauthorized),与 AGENTS.md §13
 * "客户端提交的 profile 标识不能绕过服务端授权"一致。
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ERROR_CODES } from "@atrium/contracts";
import type {
  RouteDefinition,
  RouteRegistrar,
  RouteRequest,
} from "@atrium/contracts";
import { CoreError } from "@atrium/core";
import type { CoreRuntime } from "@atrium/core";

const MODULE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*$/;

/** 校验模块 id,防止路径穿越 / 注入。 */
export function assertValidModuleId(moduleId: string): void {
  if (!MODULE_ID_PATTERN.test(moduleId)) {
    throw new Error(
      `Invalid module id "${moduleId}"; must match ${MODULE_ID_PATTERN}`,
    );
  }
}

/** 用 zod 校验单个字段;未提供 schema 时原样返回。校验失败抛 ZodError。 */
function parseSchema(schema: unknown, value: unknown): unknown {
  if (schema === undefined) {
    return value;
  }
  const parsed = (schema as z.ZodType).safeParse(value);
  if (!parsed.success) {
    throw parsed.error;
  }
  return parsed.data;
}

/** 从 fastify 请求解析会话;未登录返回 null。 */
function resolveSession(
  request: FastifyRequest,
): { profileId: string; adminVerified: boolean } | null {
  const session = request.session;
  if (session === null) {
    return null;
  }
  return {
    profileId: session.profileId,
    adminVerified: session.adminVerified,
  };
}

export class FastifyRouteRegistrar implements RouteRegistrar {
  readonly #app: FastifyInstance;
  readonly #runtime: CoreRuntime;
  readonly #moduleId: string;

  constructor(app: FastifyInstance, runtime: CoreRuntime, moduleId: string) {
    assertValidModuleId(moduleId);
    this.#app = app;
    this.#runtime = runtime;
    this.#moduleId = moduleId;
  }

  register(definition: RouteDefinition): void {
    const url = this.#buildUrl(definition.path);
    this.#app.route({
      method: definition.method,
      url,
      handler: async (request) => {
        const identity = resolveSession(request);
        if (identity === null) {
          throw new CoreError(
            ERROR_CODES.UNAUTHORIZED,
            "Authentication required",
          );
        }

        const params = parseSchema(definition.schema?.params, request.params);
        const query = parseSchema(definition.schema?.query, request.query);
        const body = parseSchema(definition.schema?.body, request.body);

        const routeRequest: RouteRequest = {
          params: params as Readonly<Record<string, string>>,
          query: query as Readonly<Record<string, unknown>>,
          body,
          headers: request.headers,
          profileId: identity.profileId,
        };

        const host = this.#runtime.hostFor(identity.profileId, {
          adminVerified: identity.adminVerified,
        });
        const result = await definition.handler(routeRequest, host);
        return { data: result };
      },
    });
  }

  /** 相对 /api/m/{moduleId} 的路径拼成完整 URL。 */
  #buildUrl(path: string): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    // 模块根路径 "/" 直接挂载到 /api/m/{moduleId},避免尾斜杠歧义
    // (fastify 默认区分 /api/m/notes 与 /api/m/notes/)。
    if (normalized === "/") {
      return `/api/m/${this.#moduleId}`;
    }
    return `/api/m/${this.#moduleId}${normalized}`;
  }
}
