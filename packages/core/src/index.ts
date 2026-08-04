/**
 * @atrium/core — 通用工作台框架核心(PRD §9.2 / AGENTS.md)。
 * 依赖方向:core 只依赖 contracts(AGENTS.md §5)。
 */
export { openDatabase } from "./sqlite.js";
export type { SqliteDatabase } from "./sqlite.js";

export {
  initCoreSchema,
  idCounters,
  schemaMigrations,
  entityTags,
  relationsTable,
  attachmentsTable,
  auditLogTable,
  configTable,
  coreTables,
} from "./schema.js";

export { uuidV7, IdServiceImpl } from "./ids.js";
export { CoreError, notFound } from "./errors.js";
export { ScopedDbImpl, camelizeRow, defaultNow } from "./scoped-db.js";
export { MigrationRunner } from "./migrations.js";
export type { CoreMigration } from "./migrations.js";
export { ResourceRegistryImpl } from "./registry.js";

export {
  TagServiceImpl,
  RelationServiceImpl,
  AttachmentServiceImpl,
  AuditServiceImpl,
  ConfigServiceImpl,
} from "./services.js";

export { SearchServiceImpl } from "./search.js";
export { CaptureServiceImpl } from "./capture.js";

export { createHostContext, createConsoleLogger } from "./host-context.js";
export type { HostServiceBundle } from "./host-context.js";

export { createCoreRuntime } from "./runtime.js";
export type { CoreRuntime } from "./runtime.js";
