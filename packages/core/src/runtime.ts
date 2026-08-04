/**
 * core 运行时组装:初始化 schema、构造全部服务,并提供按 profile 的入口。
 *
 * 说明:TagService/RelationService/AttachmentService/AuditService 的契约方法
 * 不含 profileId,实例必须在构造时确定 scope,因此 runtime 顶层返回的
 * `tags/relations/attachments/audit` 绑定到默认 profile "default"(便于部署级
 * /单 profile 使用);多 profile 场景请使用 `hostFor(profileId)` 获取绑定
 * 对应 profile 的 HostContext。
 */
import type {
  AuditService,
  AttachmentService,
  CaptureService,
  ConfigService,
  HostContext,
  IdService,
  RelationService,
  ResourceRegistry,
  ScopedDb,
  SearchService,
  TagService,
} from "@atrium/contracts";
import { createHostContext } from "./host-context.js";
import type { HostServiceBundle } from "./host-context.js";
import { IdServiceImpl } from "./ids.js";
import { MigrationRunner } from "./migrations.js";
import type { CoreMigration } from "./migrations.js";
import { ResourceRegistryImpl } from "./registry.js";
import { ScopedDbImpl } from "./scoped-db.js";
import { CaptureServiceImpl } from "./capture.js";
import {
  AttachmentServiceImpl,
  AuditServiceImpl,
  ConfigServiceImpl,
  RelationServiceImpl,
  TagServiceImpl,
} from "./services.js";
import { SearchServiceImpl } from "./search.js";
import { initCoreSchema } from "./schema.js";
import type { SqliteDatabase } from "./sqlite.js";

export interface CoreRuntime {
  /** 按 profile 创建 HostContext;模块只能通过它访问能力。 */
  hostFor(profileId: string, opts?: { adminVerified?: boolean }): HostContext;
  /** 按 profile 创建 ScopedDb。 */
  scopedDbFor(profileId: string): ScopedDb;
  ids: IdService;
  resources: ResourceRegistry;
  tags: TagService;
  relations: RelationService;
  attachments: AttachmentService;
  audit: AuditService;
  search: SearchService;
  capture: CaptureService;
  config: ConfigService;
  /** 执行模块迁移(幂等)。 */
  runMigrations(moduleId: string, migrations: readonly CoreMigration[]): void;
  /** 关闭底层数据库连接。 */
  close(): void;
}

const DEFAULT_PROFILE = "default";

export function createCoreRuntime(db: SqliteDatabase): CoreRuntime {
  initCoreSchema(db);

  const ids: IdService = new IdServiceImpl(db);
  const resources: ResourceRegistry = new ResourceRegistryImpl();
  const hostFor = (profileId: string, opts?: { adminVerified?: boolean }) =>
    createHostContext(bundle, profileId, opts);
  const search: SearchService = new SearchServiceImpl({ hostFor });
  const capture: CaptureService = new CaptureServiceImpl({ hostFor });
  const config: ConfigService = new ConfigServiceImpl(db);
  const migrations = new MigrationRunner(db);

  const bundle: HostServiceBundle = {
    ids,
    resources,
    search,
    capture,
    config,
    scopedDbFor: (profileId) => new ScopedDbImpl(db, profileId, ids),
    tagsFor: (profileId) => new TagServiceImpl(db, profileId),
    relationsFor: (profileId) => new RelationServiceImpl(db, profileId),
    attachmentsFor: (profileId) => new AttachmentServiceImpl(db, profileId),
    auditFor: (profileId) => new AuditServiceImpl(db, profileId),
  };

  return {
    hostFor,
    scopedDbFor: bundle.scopedDbFor,
    ids,
    resources,
    tags: bundle.tagsFor(DEFAULT_PROFILE),
    relations: bundle.relationsFor(DEFAULT_PROFILE),
    attachments: bundle.attachmentsFor(DEFAULT_PROFILE),
    audit: bundle.auditFor(DEFAULT_PROFILE),
    search,
    capture,
    config,
    runMigrations: (moduleId, moduleMigrations) =>
      migrations.run(moduleId, moduleMigrations),
    close: () => {
      db.close();
    },
  };
}
