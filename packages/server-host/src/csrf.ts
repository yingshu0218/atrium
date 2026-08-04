/**
 * @atrium/server-host — CSRF 防护(PRD §16 / AGENTS.md §13)。
 *
 * 对改变状态的方法(POST/PUT/PATCH/DELETE):
 * - 请求带 Origin 头时,校验 Origin 与请求 Host 同源(host 含端口),同源放行;
 * - 请求无 Origin 头时默认拒绝(浏览器以外且无 token 认证的客户端
 *   可通过 `skipWhenNoOrigin` 配置放行)。
 */
import { ERROR_CODES } from "@atrium/contracts";
import type { ErrorCode } from "@atrium/contracts";

const WRITE_METHODS: ReadonlySet<string> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

/** 是否为会改变状态的 HTTP 方法。 */
export function isWriteMethod(method: string): boolean {
  return WRITE_METHODS.has(method);
}

/**
 * 判断 Origin 与 Host 是否同源。
 * Origin 形式如 `https://example.com:8443`,Host 形式如 `example.com:8443`。
 */
export function isSameOrigin(
  origin: string | undefined,
  host: string | undefined,
): boolean {
  if (origin === undefined || origin === "" || host === undefined) {
    return false;
  }
  try {
    const url = new URL(origin);
    return url.host === host;
  } catch {
    return false;
  }
}

export interface CsrfGuardRequest {
  method: string;
  headers: {
    origin?: string | string[] | undefined;
    host?: string | string[] | undefined;
  };
}

export type CsrfVerdict =
  | { ok: true }
  | { ok: false; code: ErrorCode; message: string };

export interface CsrfOptions {
  /** 无 Origin 头时放行(非浏览器客户端,如脚本 / MCP / 未来 agent token 场景)。 */
  skipWhenNoOrigin?: boolean;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? (value[0] ?? undefined) : value;
}

/** 创建 CSRF 守卫:输入 fastify request,输出裁决。 */
export function createCsrfGuard(
  options: CsrfOptions = {},
): (request: CsrfGuardRequest) => CsrfVerdict {
  return (request: CsrfGuardRequest): CsrfVerdict => {
    if (!isWriteMethod(request.method)) {
      return { ok: true };
    }
    const origin = firstHeader(request.headers.origin);
    const host = firstHeader(request.headers.host);
    if (origin === undefined) {
      if (options.skipWhenNoOrigin) {
        return { ok: true };
      }
      return {
        ok: false,
        code: ERROR_CODES.FORBIDDEN,
        message: "Missing Origin header",
      };
    }
    if (!isSameOrigin(origin, host)) {
      return {
        ok: false,
        code: ERROR_CODES.FORBIDDEN,
        message: "Cross-origin request rejected",
      };
    }
    return { ok: true };
  };
}
