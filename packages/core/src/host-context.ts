/**
 * HostContext(AGENTS.md §8):模块可获得的全部受限能力。
 * 模块不得获得裸数据库连接;这里只暴露 scopedDb 与受限服务。
 */
import { ERROR_CODES } from "@atrium/contracts";
import type {
  AuditService,
  AttachmentService,
  CaptureService,
  ConfigService,
  HostContext,
  IdService,
  Logger,
  RelationService,
  ResourceRegistry,
  ScopedDb,
  SearchService,
  TagService,
} from "@atrium/contracts";
import { CoreError } from "./errors.js";

/** 按 profile 实例化的服务集合,由 runtime 组装。 */
export interface HostServiceBundle {
  ids: IdService;
  resources: ResourceRegistry;
  search: SearchService;
  capture: CaptureService;
  config: ConfigService;
  scopedDbFor(profileId: string): ScopedDb;
  tagsFor(profileId: string): TagService;
  relationsFor(profileId: string): RelationService;
  attachmentsFor(profileId: string): AttachmentService;
  auditFor(profileId: string): AuditService;
}

/** console 的简单 Logger 实现。 */
export function createConsoleLogger(): Logger {
  return {
    debug: (message, meta) => console.debug(message, meta),
    info: (message, meta) => console.info(message, meta),
    warn: (message, meta) => console.warn(message, meta),
    error: (message, meta) => console.error(message, meta),
  };
}

export function createHostContext(
  services: HostServiceBundle,
  profileId: string,
  opts?: { adminVerified?: boolean },
): HostContext {
  const adminVerified = opts?.adminVerified ?? false;
  return {
    profileId,
    scopedDb: services.scopedDbFor(profileId),
    ids: services.ids,
    resources: services.resources,
    tags: services.tagsFor(profileId),
    relations: services.relationsFor(profileId),
    attachments: services.attachmentsFor(profileId),
    audit: services.auditFor(profileId),
    search: services.search,
    capture: services.capture,
    config: services.config,
    log: createConsoleLogger(),
    async requireAdmin(): Promise<void> {
      if (!adminVerified) {
        throw new CoreError(
          ERROR_CODES.ADMIN_CHALLENGE_REQUIRED,
          "Admin challenge required",
        );
      }
    },
  };
}
