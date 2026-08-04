/**
 * @atrium/server-host — 模块注册。
 *
 * registerModule 把模块服务端入口接入宿主:
 * - 调用 module.register(context),context.host 提供默认 profile 的
 *   HostContext(请求期 host 由 route-registrar 按会话动态创建),
 *   context.routes 把路由挂载到 /api/m/{moduleId};
 * - 路由的响应 envelope 由 FastifyRouteRegistrar 统一处理。
 */
import type { FastifyInstance } from "fastify";
import type { CoreRuntime } from "@atrium/core";
import type { ServerModule } from "@atrium/contracts";
import { FastifyRouteRegistrar } from "./route-registrar.js";

const DEFAULT_PROFILE = "default";

/**
 * 注册一个模块到 fastify 实例。
 * 模块路由统一挂载在 /api/m/{moduleId}{path}(AGENTS.md §12)。
 */
export async function registerModule(
  fastify: FastifyInstance,
  runtime: CoreRuntime,
  module: ServerModule,
): Promise<void> {
  const routes = new FastifyRouteRegistrar(
    fastify,
    runtime,
    module.metadata.id,
  );
  await module.register({
    host: runtime.hostFor(DEFAULT_PROFILE),
    routes,
  });
}
