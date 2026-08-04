/**
 * 可读数据镜像契约(PRD §20 / AGENTS §19)。
 * exporter 只存在于模块服务端入口;Data Mirror Engine 只调用已启用模块的 exporter。
 */
import type { ScopedDb, Logger } from "./host.js";

/** exporter 输出文件格式 */
export type ExportedFileFormat = "markdown" | "json" | "csv" | "text";

export interface ExportedFile {
  /** 相对路径,必须位于模块命名空间内(框架负责路径校验) */
  path: string;
  content: string;
  format: ExportedFileFormat;
}

/**
 * ExportContext:受限、只读、带 profile scope 的一致数据视图(AGENTS §19.3)。
 * exporter 不得获得 raw database、修改业务数据或跨模块读取。
 */
export interface ExportContext {
  profileId: string;
  /** 模块命名空间下的目标目录(框架已限定) */
  dataDir: string;
  /** 受限只读访问(自动 profile scope + soft delete) */
  scopedDb: ScopedDb;
  log: Logger;
}

/**
 * 模块数据镜像 exporter(PRD §11.6 / AGENTS §6)。
 * 约束:只存在于服务端入口;不得访问 Git 凭证、执行 Git 或创建定时任务;
 * 输出必须稳定、可重复且不含 secret。
 */
export interface DataMirrorExporter {
  moduleId: string;
  /** 可读格式(如 Markdown) */
  exportReadable(context: ExportContext): Promise<ExportedFile[]>;
  /** 结构化格式(如 JSON/CSV) */
  exportStructured(context: ExportContext): Promise<ExportedFile[]>;
}

/** 数据镜像非敏感配置投影(PRD §20.5 / AGENTS §19.4;完整凭证只存服务端 secret 存储) */
export interface MirrorConfigPublic {
  enabled: boolean;
  /** 脱敏仓库地址,不得包含 token/私钥 */
  repoUrlRedacted: string;
  branch: string;
  dataDirPrefix?: string;
  authType: "ssh-deploy-key" | "pat" | "none";
  schedule: "daily" | "weekly" | "manual";
  includeAttachments: boolean;
  lastSuccessAt?: string;
  lastError?: string;
}

/** 一次 Mirror Run 的执行记录 */
export interface MirrorRunRecord {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: "success" | "failed" | "skipped";
  commitCount: number;
  error?: string;
}
