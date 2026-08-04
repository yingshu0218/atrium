/**
 * core 基础表(全部 snake_case,时间 TEXT ISO-8601 UTC)。
 * 用 drizzle-orm/sqlite-core 定义表结构作为唯一事实来源,并由
 * initCoreSchema(db) 依据表配置生成并执行 CREATE TABLE IF NOT EXISTS。
 */
import {
  getTableConfig,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { SqliteDatabase } from "./sqlite.js";

/** 按部署实例 + 资源类型计数(PRD §13.3)。 */
export const idCounters = sqliteTable("id_counters", {
  resourceType: text("resource_type").primaryKey(),
  seq: integer("seq").notNull(),
});

/** 已应用迁移记录(module_id, id 联合主键)。 */
export const schemaMigrations = sqliteTable(
  "schema_migrations",
  {
    moduleId: text("module_id").notNull(),
    id: text("id").notNull(),
    appliedAt: text("applied_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.moduleId, t.id] })],
);

/** 通用标签(AGENTS.md §10:跨模块关联走 entity_tags)。 */
export const entityTags = sqliteTable(
  "entity_tags",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    tag: text("tag").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [unique().on(t.profileId, t.resourceType, t.resourceId, t.tag)],
);

/** 跨模块关联(AGENTS.md §10 / PRD §13.4)。 */
export const relationsTable = sqliteTable("relations", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  relationType: text("relation_type").notNull(),
  sourceResourceType: text("source_resource_type").notNull(),
  sourceResourceId: text("source_resource_id").notNull(),
  targetResourceType: text("target_resource_type").notNull(),
  targetResourceId: text("target_resource_id").notNull(),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
});

/** 附件元数据(内容存储由 core 管理,读取必须经过鉴权)。 */
export const attachmentsTable = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storageKey: text("storage_key").notNull(),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
});

/** 审计日志(AGENTS.md §11:所有 Agent 写入与敏感操作进入 audit log)。 */
export const auditLogTable = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  action: text("action").notNull(),
  source: text("source").notNull(),
  targetResourceType: text("target_resource_type"),
  targetResourceId: text("target_resource_id"),
  metaJson: text("meta_json"),
  createdAt: text("created_at").notNull(),
});

/** 部署级配置(无 profile scope,value 存 JSON)。 */
export const configTable = sqliteTable("config", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
});

/** 全部 core 基础表,按依赖顺序排列。 */
export const coreTables = [
  idCounters,
  schemaMigrations,
  entityTags,
  relationsTable,
  attachmentsTable,
  auditLogTable,
  configTable,
] as const;

function columnDefinition(column: SQLiteColumn): string {
  let definition = `"${column.name}" ${column.getSQLType()}`;
  if (column.notNull) definition += " NOT NULL";
  if (column.primary) definition += " PRIMARY KEY";
  return definition;
}

function createTableSql(table: SQLiteTable): string {
  const config = getTableConfig(table);
  const lines = config.columns.map(columnDefinition);
  for (const pk of config.primaryKeys) {
    lines.push(`PRIMARY KEY (${pk.columns.map((column) => `"${column.name}"`).join(", ")})`);
  }
  for (const constraint of config.uniqueConstraints) {
    lines.push(
      `UNIQUE (${constraint.columns.map((column) => `"${column.name}"`).join(", ")})`,
    );
  }
  return `CREATE TABLE IF NOT EXISTS "${config.name}" (\n  ${lines.join(",\n  ")}\n)`;
}

/** 初始化 core 基础表(幂等,可重复调用)。 */
export function initCoreSchema(db: SqliteDatabase): void {
  const statements = coreTables.map((table) => createTableSql(table));
  db.exec(`${statements.join(";\n")};`);
}
