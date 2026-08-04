/**
 * @atrium/server-host — 错误映射。
 *
 * 把 CoreError(携带 contracts 的稳定错误码)与 zod 校验错误转换为
 * `{ error: { code, message, details? } }` 的统一 envelope(AGENTS.md §12)。
 * 未知错误一律映射为 internal_error,不向客户端泄漏内部细节。
 */
import { z } from "zod";
import { ERROR_CODES } from "@atrium/contracts";
import type { ApiErrorBody, ErrorCode } from "@atrium/contracts";
import { CoreError } from "@atrium/core";

/** HTTP 状态码与稳定错误码的映射。 */
const STATUS_BY_CODE: Record<ErrorCode, number> = {
  [ERROR_CODES.VALIDATION]: 400,
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.CONFLICT]: 409,
  [ERROR_CODES.IDEMPOTENCY_REPLAY]: 409,
  [ERROR_CODES.ADMIN_CHALLENGE_REQUIRED]: 403,
  [ERROR_CODES.INTERNAL]: 500,
};

/** 把任意抛出的错误转成 API envelope 的错误体。 */
export function toEnvelopeError(err: unknown): ApiErrorBody {
  if (err instanceof CoreError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof z.ZodError) {
    return {
      code: ERROR_CODES.VALIDATION,
      message: "Invalid request",
      details: err.flatten(),
    };
  }
  return {
    code: ERROR_CODES.INTERNAL,
    message: "Internal server error",
  };
}

/** 稳定错误码 → HTTP 状态码(未知回退 500)。 */
export function errorStatusCode(code: ErrorCode): number {
  return STATUS_BY_CODE[code] ?? 500;
}
