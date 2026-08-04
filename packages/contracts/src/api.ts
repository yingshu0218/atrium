/**
 * API 契约(PRD §15 / AGENTS §12)。
 * - 响应统一为 { data } 或 { error: { code, message, details? } };
 * - 列表默认游标分页;
 * - 错误码稳定且可测试。
 */
import { z } from "zod";

/** 稳定错误码集合 */
export const ERROR_CODES = {
  VALIDATION: "validation_error",
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  IDEMPOTENCY_REPLAY: "idempotency_replay",
  INTERNAL: "internal_error",
  ADMIN_CHALLENGE_REQUIRED: "admin_challenge_required",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/** 统一响应 envelope:{ data } 或 { error } */
export type ApiEnvelope<T> = { data: T } | { error: ApiErrorBody };

export function ok<T>(data: T): ApiEnvelope<T> {
  return { data };
}

export function fail(code: ErrorCode, message: string, details?: unknown): ApiEnvelope<never> {
  return { error: { code, message, details } };
}

/** 游标分页响应 */
export interface CursorPage<T> {
  items: readonly T[];
  /** 下一页游标;缺省表示没有更多 */
  nextCursor?: string;
}

/** 游标分页请求参数(由服务端校验与解析) */
export interface CursorPaginationQuery {
  limit?: number;
  cursor?: string;
}

export const cursorPaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});

/** 上传约束(AGENTS §12):大小、MIME、扩展名、文件名校验 */
export interface UploadConstraints {
  maxSizeBytes: number;
  allowedMimeTypes: readonly string[];
  allowedExtensions: readonly string[];
}
