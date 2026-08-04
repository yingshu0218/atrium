/**
 * @atrium/server-host — Fastify 宿主公共 API。
 *
 * 依赖方向:server-host ──▶ contracts/core(AGENTS.md §5)。
 * 本阶段不组合 Data Mirror Engine(data-mirror 下一阶段实现)。
 */
export { createServer } from "./app.js";
export type { ServerOptions } from "./app.js";

export {
  SESSION_COOKIE_NAME,
  createSessionStore,
  generateSessionToken,
  hashPassword,
  verifyPassword,
} from "./auth.js";
export type { Session, SessionStore } from "./auth.js";

export {
  createCsrfGuard,
  isSameOrigin,
  isWriteMethod,
} from "./csrf.js";
export type {
  CsrfGuardRequest,
  CsrfOptions,
  CsrfVerdict,
} from "./csrf.js";

export { toEnvelopeError, errorStatusCode } from "./errors.js";

export { FastifyRouteRegistrar, assertValidModuleId } from "./route-registrar.js";

export { registerModule } from "./module-loader.js";

export { registerAdminMirrorApi } from "./admin-mirror.js";
export type { AdminMirrorDeps } from "./admin-mirror.js";
