/**
 * @atrium/web-host API 客户端(PRD §15 / AGENTS §12)。
 * 统一处理服务端 { data } / { error } envelope:
 * - envelope 中带 error 时抛出 ApiError(code/message/details 透传);
 * - 非 2xx 且无 envelope 时抛出 ApiError(http_error);
 * - 网络层失败抛出 ApiError(network_error)。
 */
import type { ApiErrorBody } from "@atrium/contracts";

/** API 错误:携带稳定错误码、HTTP 状态与可选的 details。 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number | undefined;
  readonly details: unknown | undefined;

  constructor(
    code: string,
    message: string,
    options: { status?: number; details?: unknown; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = options.status;
    this.details = options.details;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/** 最小 API 客户端接口:get/post,data 已解包。 */
export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ApiErrorBody).code === "string" &&
    typeof (value as ApiErrorBody).message === "string"
  );
}

function isErrorEnvelope(value: unknown): value is { error: ApiErrorBody } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    isApiErrorBody((value as { error: unknown }).error)
  );
}

function isDataEnvelope(value: unknown): value is { data: unknown } {
  return typeof value === "object" && value !== null && "data" in value;
}

/**
 * 创建 API 客户端。
 * @param baseUrl API 根路径,如 ""(同源)或 "https://host/api";尾部斜杠会被去除。
 * @param fetchImpl 可注入 fetch 实现(测试用);缺省在每次请求时读取全局 fetch。
 */
export function createApiClient(
  baseUrl: string,
  fetchImpl?: typeof fetch
): ApiClient {
  const root = baseUrl.replace(/\/+$/, "");

  async function request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${root}${path.startsWith("/") ? path : `/${path}`}`;
    const doFetch = fetchImpl ?? globalThis.fetch;
    const init: RequestInit = { method, headers: {} };
    if (body !== undefined) {
      init.headers = { ...init.headers, "content-type": "application/json" };
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await doFetch(url, init);
    } catch (cause) {
      throw new ApiError("network_error", "无法连接服务器", { cause });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    if (isErrorEnvelope(payload)) {
      throw new ApiError(payload.error.code, payload.error.message, {
        status: response.status,
        details: payload.error.details,
      });
    }
    if (!response.ok) {
      const message =
        response.statusText !== "" ? response.statusText : `HTTP ${response.status}`;
      throw new ApiError("http_error", message, { status: response.status });
    }
    if (isDataEnvelope(payload)) {
      return payload.data as T;
    }
    return payload as T;
  }

  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  };
}
