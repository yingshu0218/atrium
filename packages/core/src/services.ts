/**
 * 通用能力服务(AGENTS.md §10/§11,PRD §9.2):
 * tags / relations / attachments / audit / config。
 * 查询使用 db.prepare 手写 SQL;所有行转 camelCase;时间 ISO-8601 UTC。
 * tags/relations/attachments/audit 绑定 profile(contracts 接口方法不含
 * profileId,实例必须在构造时确定 scope)。
 */
import { ERROR_CODES } from "@atrium/contracts";
import type {
  AttachmentInput,
  AttachmentRecord,
  AttachmentService,
  AuditRecordInput,
  AuditService,
  ConfigService,
  RelationInput,
  RelationRecord,
  RelationService,
  TagService,
  WriteSource,
} from "@atrium/contracts";
import { CoreError } from "./errors.js";
import { uuidV7 } from "./ids.js";
import { camelizeRow, defaultNow } from "./scoped-db.js";
import type { SqliteDatabase } from "./sqlite.js";

function isUniqueConstraint(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY";
}

/** 通用标签(去重依赖 entity_tags 的 UNIQUE 约束)。 */
export class TagServiceImpl implements TagService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly profileId: string,
    private readonly now: () => string = defaultNow,
  ) {}

  async add(resourceType: string, resourceId: string, tag: string): Promise<void> {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO "entity_tags" ("id", "profile_id", "resource_type", "resource_id", "tag", "created_at") VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(uuidV7(), this.profileId, resourceType, resourceId, tag, this.now());
  }

  async remove(resourceType: string, resourceId: string, tag: string): Promise<void> {
    this.db
      .prepare(
        `DELETE FROM "entity_tags" WHERE "profile_id" = ? AND "resource_type" = ? AND "resource_id" = ? AND "tag" = ?`,
      )
      .run(this.profileId, resourceType, resourceId, tag);
  }

  async listForResource(
    resourceType: string,
    resourceId: string,
  ): Promise<string[]> {
    const rows = this.db
      .prepare(
        `SELECT "tag" FROM "entity_tags" WHERE "profile_id" = ? AND "resource_type" = ? AND "resource_id" = ? ORDER BY "tag" ASC`,
      )
      .all(this.profileId, resourceType, resourceId) as { tag: string }[];
    return rows.map((row) => row.tag);
  }
}

/** 跨模块关联(软删除)。 */
export class RelationServiceImpl implements RelationService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly profileId: string,
    private readonly now: () => string = defaultNow,
  ) {}

  async create(input: RelationInput): Promise<void> {
    try {
      this.db
        .prepare(
          `INSERT INTO "relations" ("id", "profile_id", "relation_type", "source_resource_type", "source_resource_id", "target_resource_type", "target_resource_id", "created_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          uuidV7(),
          this.profileId,
          input.relationType,
          input.sourceResourceType,
          input.sourceResourceId,
          input.targetResourceType,
          input.targetResourceId,
          this.now(),
        );
    } catch (err) {
      // 模块可为 relations 增加唯一约束;冲突统一转换为稳定的 CONFLICT 错误码。
      if (isUniqueConstraint(err)) {
        throw new CoreError(
          ERROR_CODES.CONFLICT,
          `relation ${input.sourceResourceType}:${input.sourceResourceId} -> ${input.targetResourceType}:${input.targetResourceId} already exists`,
        );
      }
      throw err;
    }
  }

  async remove(relationId: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE "relations" SET "deleted_at" = ? WHERE "id" = ? AND "profile_id" = ? AND "deleted_at" IS NULL`,
      )
      .run(this.now(), relationId, this.profileId);
  }

  async listBySource(
    resourceType: string,
    resourceId: string,
  ): Promise<RelationRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM "relations" WHERE "profile_id" = ? AND "source_resource_type" = ? AND "source_resource_id" = ? AND "deleted_at" IS NULL ORDER BY "created_at" DESC`,
      )
      .all(this.profileId, resourceType, resourceId) as Record<string, unknown>[];
    return rows.map((row) => camelizeRow(row) as unknown as RelationRecord);
  }
}

/** 附件元数据。 */
export class AttachmentServiceImpl implements AttachmentService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly profileId: string,
    private readonly now: () => string = defaultNow,
  ) {}

  async create(input: AttachmentInput): Promise<AttachmentRecord> {
    const id = uuidV7();
    this.db
      .prepare(
        `INSERT INTO "attachments" ("id", "profile_id", "resource_type", "resource_id", "filename", "mime_type", "size_bytes", "storage_key", "created_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        this.profileId,
        input.resourceType,
        input.resourceId,
        input.filename,
        input.mimeType,
        input.sizeBytes,
        input.storageKey,
        this.now(),
      );
    const row = this.db
      .prepare(`SELECT * FROM "attachments" WHERE "id" = ?`)
      .get(id) as Record<string, unknown>;
    return camelizeRow(row) as unknown as AttachmentRecord;
  }

  async listForResource(
    resourceType: string,
    resourceId: string,
  ): Promise<AttachmentRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM "attachments" WHERE "profile_id" = ? AND "resource_type" = ? AND "resource_id" = ? AND "deleted_at" IS NULL ORDER BY "created_at" ASC`,
      )
      .all(this.profileId, resourceType, resourceId) as Record<string, unknown>[];
    return rows.map((row) => camelizeRow(row) as unknown as AttachmentRecord);
  }
}

/** 审计日志(meta 序列化为 JSON)。 */
export class AuditServiceImpl implements AuditService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly profileId: string,
    private readonly now: () => string = defaultNow,
  ) {}

  async record(input: AuditRecordInput): Promise<void> {
    const source: WriteSource = input.source;
    this.db
      .prepare(
        `INSERT INTO "audit_log" ("id", "profile_id", "action", "source", "target_resource_type", "target_resource_id", "meta_json", "created_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        uuidV7(),
        this.profileId,
        input.action,
        source,
        input.targetResourceType ?? null,
        input.targetResourceId ?? null,
        input.meta !== undefined ? JSON.stringify(input.meta) : null,
        this.now(),
      );
  }
}

/** 部署级配置(无 profile scope,value 存 JSON)。 */
export class ConfigServiceImpl implements ConfigService {
  constructor(private readonly db: SqliteDatabase) {}

  get<T>(key: string): T | undefined {
    const row = this.db
      .prepare(`SELECT "value_json" FROM "config" WHERE "key" = ?`)
      .get(key) as { value_json: string } | undefined;
    return row ? (JSON.parse(row.value_json) as T) : undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO "config" ("key", "value_json") VALUES (?, ?) ON CONFLICT("key") DO UPDATE SET "value_json" = excluded."value_json"`,
      )
      .run(key, JSON.stringify(value));
  }
}
