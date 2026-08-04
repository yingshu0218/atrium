/**
 * AgentService(AGENTS.md §15 / PRD §18)。
 *
 * 职责:
 * - 聚合各 AgentModule 的资源目录(describe);
 * - 按 `handler 键 = ${operation}:${resourceType}` 的约定分发标准操作
 *   (list/get/create/update/delete/search),例如 "create:note";
 * - relate/capture 是框架通用能力,直接走 core 的 relation / capture 服务;
 * - 所有写操作(create/update/delete/relate/capture)自动记录 audit(source=agent);
 * - 所有操作绑定构造时传入的 profileId,token scope 与 profile 由服务端强制执行。
 *
 * 注:各模块按同一 handler 键约定实现其 agent 入口(如 notes 模块注册
 * `handlers["create:note"]`),模块禁用后不会出现在 modules 数组里,
 * 对应资源自然从 describe 与操作分发中消失。
 */
import { ERROR_CODES } from "@atrium/contracts";
import type {
  AgentModule,
  AgentOperationContext,
  AgentOperationHandler,
  AgentOperationName,
  AgentResourceDescriptor,
  HostContext,
} from "@atrium/contracts";
import type { CoreRuntime } from "@atrium/core";

/** 默认分页条数(AGENTS.md §15:默认 limit 10)。 */
export const DEFAULT_LIMIT = 10;
/** Agent 单次返回上限(AGENTS §15:默认 limit 10,防客户端无限拉取)。 */
export const MAX_LIMIT = 100;

/** 业务错误对象形状(与 contracts 的 ApiErrorBody 对齐)。 */
export interface AgentError {
  code: string;
  message: string;
}

export interface AgentServiceOptions {
  runtime: CoreRuntime;
  modules: readonly AgentModule[];
  profileId: string;
}

export interface ListArgs {
  resourceType: string;
  limit?: number;
  cursor?: string;
}

export interface GetArgs {
  resourceType: string;
  id: string;
}

export interface CreateArgs {
  resourceType: string;
  input: Record<string, unknown>;
}

export interface UpdateArgs {
  resourceType: string;
  id: string;
  patch: Record<string, unknown>;
}

export interface DeleteArgs {
  resourceType: string;
  id: string;
}

export interface SearchArgs {
  resourceType?: string;
  query: string;
  limit?: number;
}

export interface CaptureArgs {
  text: string;
}

export interface RelateArgs {
  relationType: string;
  sourceResourceType: string;
  sourceResourceId: string;
  targetResourceType: string;
  targetResourceId: string;
}

function isErrorResult(value: unknown): value is { error: AgentError } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "object" &&
    (value as { error: unknown }).error !== null
  );
}

/** 从 handler 返回结果中尽力提取 id(用于 audit 的 targetResourceId)。 */
function extractId(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null) {
    return undefined;
  }
  const id = (result as Record<string, unknown>).id;
  return typeof id === "string" ? id : undefined;
}

/** 敏感键匹配模式(值会被整体脱敏)。 */
const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|api[_-]?key|authorization|credential)/i;

/** 长字符串截断上限,避免超大参数写入 audit。 */
const MAX_META_STRING_LENGTH = 500;

/** audit meta 脱敏:递归隐藏敏感键、截断长字符串。 */
function sanitize(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_META_STRING_LENGTH
      ? `${value.slice(0, MAX_META_STRING_LENGTH)}…`
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? "[redacted]"
      : sanitize(item);
  }
  return out;
}

export class AgentService {
  private readonly runtime: CoreRuntime;
  private readonly modules: readonly AgentModule[];
  readonly profileId: string;
  /** 缓存的 profile 绑定 HostContext(所有操作共享同一 scope)。 */
  private readonly host: HostContext;

  constructor(options: AgentServiceOptions) {
    this.runtime = options.runtime;
    this.modules = options.modules;
    this.profileId = options.profileId;
    this.host = this.runtime.hostFor(this.profileId);
  }

  /** 资源目录:聚合所有模块声明的 AgentResourceDescriptor。 */
  describe(): readonly AgentResourceDescriptor[] {
    return this.modules.flatMap((module) => [...module.resources]);
  }

  async list(args: ListArgs): Promise<unknown> {
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const handlerArgs: Record<string, unknown> = { limit };
    if (args.cursor !== undefined) {
      handlerArgs.cursor = args.cursor;
    }
    return this.runHandler("list", args.resourceType, handlerArgs);
  }

  async get(args: GetArgs): Promise<unknown> {
    return this.runHandler("get", args.resourceType, { id: args.id });
  }

  async create(args: CreateArgs): Promise<unknown> {
    const result = await this.runHandler("create", args.resourceType, {
      input: args.input,
    });
    if (isErrorResult(result)) {
      return result;
    }
    await this.recordWriteAudit("create", args.resourceType, args.input, extractId(result));
    return result;
  }

  async update(args: UpdateArgs): Promise<unknown> {
    const result = await this.runHandler("update", args.resourceType, {
      id: args.id,
      patch: args.patch,
    });
    if (isErrorResult(result)) {
      return result;
    }
    await this.recordWriteAudit("update", args.resourceType, { id: args.id, patch: args.patch }, args.id);
    return result;
  }

  async delete(args: DeleteArgs): Promise<unknown> {
    const result = await this.runHandler("delete", args.resourceType, {
      id: args.id,
    });
    if (isErrorResult(result)) {
      return result;
    }
    await this.recordWriteAudit("delete", args.resourceType, { id: args.id }, args.id);
    return result;
  }

  /** 聚合搜索:可选按 resourceType 过滤返回的命中。 */
  async search(args: SearchArgs): Promise<unknown> {
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const hits = await this.host.search.search(this.profileId, args.query, limit);
    if (args.resourceType !== undefined) {
      return hits.filter((hit) => hit.resourceType === args.resourceType);
    }
    return hits;
  }

  /** capture 快速输入(走 core 通用能力,action 使用实际捕获到的资源类型)。 */
  async capture(args: CaptureArgs): Promise<unknown> {
    const result = await this.host.capture.capture(this.profileId, {
      text: args.text,
    });
    await this.recordWriteAudit("capture", result.resourceType, { text: args.text }, result.resourceId);
    return result;
  }

  /** relate 跨模块关联(走 core 通用能力,action 的类型段取 sourceResourceType)。 */
  async relate(args: RelateArgs): Promise<unknown> {
    await this.host.relations.create(args);
    await this.recordWriteAudit("relate", args.sourceResourceType, args, undefined);
    return { ok: true };
  }

  /**
   * 按 handler 键约定查找模块 handler。键格式:`${operation}:${resourceType}`,
   * 例如 "create:note"。多个模块注册同一键时,modules 顺序靠前者生效。
   */
  private findHandler(
    operation: AgentOperationName,
    resourceType: string,
  ): AgentOperationHandler | undefined {
    const key = `${operation}:${resourceType}`;
    for (const module of this.modules) {
      const handler = module.handlers[key];
      if (handler) {
        return handler;
      }
    }
    return undefined;
  }

  /**
   * 调用模块 handler;找不到资源类型或操作时返回
   * `{ error: { code: "not_found", message } }` 风格对象(不抛异常)。
   */
  private async runHandler(
    operation: AgentOperationName,
    resourceType: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const handler = this.findHandler(operation, resourceType);
    if (!handler) {
      return {
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: `no agent handler for "${operation}:${resourceType}"`,
        },
      };
    }
    const ctx: AgentOperationContext = {
      profileId: this.profileId,
      resourceType,
      operation,
      args,
      host: this.host,
    };
    return handler(ctx);
  }

  /** 写入审计:action = `${operation}:${resourceType}`,source = "agent",meta 脱敏。 */
  private async recordWriteAudit(
    operation: string,
    resourceType: string,
    meta: unknown,
    targetResourceId: string | undefined,
  ): Promise<void> {
    const sanitizedMeta = sanitize(meta);
    const isRecord =
      typeof sanitizedMeta === "object" && sanitizedMeta !== null;
    await this.host.audit.record({
      action: `${operation}:${resourceType}`,
      source: "agent",
      targetResourceType: resourceType,
      ...(targetResourceId !== undefined ? { targetResourceId } : {}),
      ...(isRecord
        ? { meta: sanitizedMeta as Readonly<Record<string, unknown>> }
        : {}),
    });
  }
}

