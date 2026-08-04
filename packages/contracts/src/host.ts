/**
 * HostContext 与受限数据访问契约(PRD §9.2 / AGENTS §8)。
 * 模块不得获得裸数据库连接;只能使用 ScopedDb 与受限服务。
 */
import type { CursorPage } from "./api.js";
import type { ResourceDescriptor } from "./resource.js";

/** 日志接口 */
export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

/** ID 服务:UUID v7 / seq / 短 ID(PRD §13.3) */
export interface IdService {
  newUuid(): string;
  /** 按部署实例 + 资源类型分配递增 seq */
  nextSeq(resourceType: string): number;
  shortId(resourceType: string, seq: number): string;
}

/** 列表查询选项 */
export interface ListOptions {
  cursor?: string;
  limit?: number;
  /** 等值过滤(自动叠加 profile scope 与 soft delete) */
  where?: Readonly<Record<string, unknown>>;
  orderBy?: { column: string; direction: "asc" | "desc" };
  /** 默认 false;仅特殊用途可包含已删除行 */
  includeDeleted?: boolean;
}

/** 写入来源(审计上下文) */
export type WriteSource = "api" | "web" | "agent" | "offline" | "system";

/** 创建输入:客户端生成 UUID v7,服务端分配 seq */
export interface CreateInput {
  id: string;
  /** 资源类型(短 ID 前缀),如 "note";seq 按部署实例 + 资源类型计数 */
  resourceType: string;
  values: Readonly<Record<string, unknown>>;
  idempotencyKey?: string;
  source?: WriteSource;
}

/**
 * ScopedDb:模块唯一数据访问入口(AGENTS §8)。
 * 自动处理 profile_id 条件、deleted_at IS NULL、创建/更新时间、审计上下文与事务。
 * 表名由模块决定(业务表以模块 id 为前缀)。
 */
export interface ScopedDb {
  findById<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    id: string
  ): Promise<T | null>;

  list<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    options?: ListOptions
  ): Promise<CursorPage<T>>;

  /** 创建:分配 seq 与时间戳,返回完整行 */
  create<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    input: CreateInput
  ): Promise<T>;

  update<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    id: string,
    patch: Readonly<Record<string, unknown>>
  ): Promise<T>;

  /** 软删除:置 deleted_at,不物理删除 */
  softDelete(table: string, id: string): Promise<void>;

  count(table: string, where?: Readonly<Record<string, unknown>>): Promise<number>;

  /** 受限事务:内部所有访问自动保持 scope */
  transaction<T>(fn: (db: ScopedDb) => Promise<T>): Promise<T>;
}

/** 路由定义(server-host 适配到 Fastify;contracts 保持运行时无关) */
export interface RouteDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** 相对 /api/m/{moduleId} 的路径,如 "/"、"/:id" */
  path: string;
  handler: RouteHandler;
  /** zod schema:{ body?, query?, params? } */
  schema?: { body?: unknown; query?: unknown; params?: unknown };
}

export interface RouteRequest {
  params: Readonly<Record<string, string>>;
  query: Readonly<Record<string, unknown>>;
  body: unknown;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  /** 已认证 profile 的 id;未认证为 null */
  profileId: string | null;
}

export type RouteHandler = (
  req: RouteRequest,
  host: HostContext
) => Promise<unknown>;

export interface RouteRegistrar {
  register(definition: RouteDefinition): void;
}

/** Resource 注册表(AGENTS §10) */
export interface ResourceRegistry {
  register(descriptor: ResourceDescriptor): void;
  get(type: string): ResourceDescriptor | undefined;
  all(): ResourceDescriptor[];
}

/** 标签(通用能力,模块不复制实现) */
export interface TagService {
  add(resourceType: string, resourceId: string, tag: string): Promise<void>;
  remove(resourceType: string, resourceId: string, tag: string): Promise<void>;
  listForResource(resourceType: string, resourceId: string): Promise<string[]>;
}

/** 跨模块关联(AGENTS §10:不允许模块间外键直接耦合) */
export interface RelationInput {
  relationType: string;
  sourceResourceType: string;
  sourceResourceId: string;
  targetResourceType: string;
  targetResourceId: string;
}

export interface RelationRecord extends RelationInput {
  id: string;
  profileId: string;
  createdAt: string;
}

export interface RelationService {
  create(input: RelationInput): Promise<void>;
  remove(relationId: string): Promise<void>;
  listBySource(
    resourceType: string,
    resourceId: string
  ): Promise<RelationRecord[]>;
}

/** 附件元数据(内容存储由 core 管理;读取必须经过鉴权) */
export interface AttachmentInput {
  resourceType: string;
  resourceId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
}

export interface AttachmentRecord extends AttachmentInput {
  id: string;
  profileId: string;
  createdAt: string;
}

export interface AttachmentService {
  create(input: AttachmentInput): Promise<AttachmentRecord>;
  listForResource(
    resourceType: string,
    resourceId: string
  ): Promise<AttachmentRecord[]>;
}

/** 审计(AGENTS §11 / §15:所有 Agent 写入与敏感操作进入 audit log) */
export interface AuditRecordInput {
  action: string;
  source: WriteSource;
  targetResourceType?: string;
  targetResourceId?: string;
  meta?: Readonly<Record<string, unknown>>;
}

export interface AuditService {
  record(input: AuditRecordInput): Promise<void>;
}

/** 搜索 provider:模块向框架注册,由 SearchService 聚合(PRD §12.2) */
export interface SearchProvider {
  resourceType: string;
  search(
    profileId: string,
    query: string,
    limit: number,
    /** 绑定该 profile 的受限访问上下文 */
    host: HostContext,
  ): Promise<SearchHit[]>;
}

export interface SearchHit {
  resourceType: string;
  resourceId: string;
  shortId: string;
  title: string;
  snippet?: string;
}

export interface SearchService {
  register(provider: SearchProvider): void;
  search(
    profileId: string,
    query: string,
    limit?: number
  ): Promise<SearchHit[]>;
}

/** capture:快速输入能力(PRD §12.2) */
export interface CaptureHandler {
  resourceType: string;
  capture(
    profileId: string,
    input: { text: string; meta?: Readonly<Record<string, unknown>> },
    /** 绑定该 profile 的受限访问上下文 */
    host: HostContext,
  ): Promise<{ resourceId: string; shortId: string }>;
}

export interface CaptureService {
  register(handler: CaptureHandler): void;
  capture(
    profileId: string,
    input: { text: string; meta?: Readonly<Record<string, unknown>> }
  ): Promise<{ resourceType: string; resourceId: string; shortId: string }>;
}

/** 实例配置(部署级,非敏感) */
export interface ConfigService {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): Promise<void>;
}

/**
 * HostContext:模块可获得的全部能力(AGENTS §8)。
 * 不包含裸数据库连接;raw database 仅 core 内部与迁移执行器可访问。
 */
export interface HostContext {
  profileId: string;
  scopedDb: ScopedDb;
  ids: IdService;
  resources: ResourceRegistry;
  tags: TagService;
  relations: RelationService;
  attachments: AttachmentService;
  audit: AuditService;
  search: SearchService;
  capture: CaptureService;
  config: ConfigService;
  log: Logger;
  /** 敏感操作必须通过管理员验证,否则抛错 */
  requireAdmin(): Promise<void>;
}
