/**
 * core 统一的错误类型。
 * code 使用 contracts 的稳定错误码(ERROR_CODES),便于 API 层映射为
 * { error: { code, message } } 响应(AGENTS.md §12)。
 */
import { ERROR_CODES } from "@atrium/contracts";
import type { ErrorCode } from "@atrium/contracts";

export class CoreError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "CoreError";
    this.code = code;
  }
}

/** 构造标准 NOT_FOUND 错误(ScopedDb 未命中时使用)。 */
export function notFound(table: string, id: string): CoreError {
  return new CoreError(
    ERROR_CODES.NOT_FOUND,
    `record "${id}" not found in table "${table}"`,
  );
}
