/**
 * Data Mirror Engine(PRD §20 / AGENTS §19)。
 *
 * 职责:调用已启用模块的 exporter 生成完整镜像 → 校验 → 在临时目录重建 →
 * 与远程 Git 仓库同步(无变化不提交、分歧停止、不 force push)→ 记录历史。
 * 模块 exporter 不得访问 Git 凭证、执行 Git 或自行调度;全部由本引擎负责。
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize, sep } from "node:path";
import type { CoreRuntime } from "@atrium/core";
import { CoreError } from "@atrium/core";
import { ERROR_CODES } from "@atrium/contracts";
import type {
  ExportedFile,
  ExportContext,
  Logger,
  MirrorRunRecord,
  ServerModule,
} from "@atrium/contracts";import type { MirrorConfig } from "./config.js";
import { MirrorConfigStore } from "./config.js";
import type { MirrorHistory } from "./history.js";
import { GitClient } from "./git.js";
import type { GitClientOptions } from "./git.js";

/** 镜像根目录名(与 PRD §20.4 一致)。 */
export const DATA_ROOT = "atrium-data";

const COMMIT_PREFIX = "data: mirror ";
const MANIFEST_VERSION = 1;

export interface DataMirrorEngineOptions {
  runtime: CoreRuntime;
  /** 已启用模块(仅这些模块参与导出;AGENTS §19.3:只调用已启用模块的 exporter) */
  modules: readonly ServerModule[];
  configStore: MirrorConfigStore;
  history: MirrorHistory;
  /** 持久化 Git 工作目录(部署配置,不写入应用源码) */
  workDir: string;
  logger?: Logger;
  /** 单条 git 命令超时(默认 60s) */
  gitTimeoutMs?: number;
}

interface SnapshotFile {
  /** 相对镜像根的路径,如 "profiles/default/notes/note-1.md" */
  relativePath: string;
  content: string;
}

export class DataMirrorEngine {
  private readonly runtime: CoreRuntime;
  private readonly modules: readonly ServerModule[];
  private readonly configStore: MirrorConfigStore;
  private readonly history: MirrorHistory;
  private readonly workDir: string;
  private readonly logger: Logger;
  private readonly gitTimeoutMs: number;
  /** 进程内互斥:同一实例同时最多一个 Mirror Run(AGENTS §23 非功能要求)。 */
  private running = false;

  constructor(options: DataMirrorEngineOptions) {
    this.runtime = options.runtime;
    this.modules = options.modules;
    this.configStore = options.configStore;
    this.history = options.history;
    this.workDir = options.workDir;
    this.gitTimeoutMs = options.gitTimeoutMs ?? 60_000;
    this.logger = options.logger ?? consoleLogger;
  }

  /** 立即执行一次镜像(手动触发或调度器调用)。 */
  async runOnce(): Promise<MirrorRunRecord> {
    if (this.running) {
      return {
        id: this.runtime.ids.newUuid(),
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        status: "skipped",
        commitCount: 0,
      };
    }
    this.running = true;
    const id = this.runtime.ids.newUuid();
    const startedAt = new Date().toISOString();
    try {
      const config = await this.configStore.get();
      if (config === null || !config.enabled) {
        const record: MirrorRunRecord = {
          id,
          startedAt,
          finishedAt: new Date().toISOString(),
          status: "skipped",
          commitCount: 0,
        };
        await this.history.append(record);
        return record;
      }
      this.logger.info("data-mirror: run started", { id });

      const stagingDir = await mkdtemp(join(tmpdir(), "atrium-mirror-"));
      try {
        const snapshot = await this.collectSnapshot();
        await this.writeSnapshot(stagingDir, config, snapshot);
        const commitCount = await this.syncToRemote(config, stagingDir, id);
        const finishedAt = new Date().toISOString();
        const record: MirrorRunRecord = {
          id,
          startedAt,
          finishedAt,
          status: "success",
          commitCount,
        };
        await this.history.append(record);
        await this.updateConfig((cfg) => {
          cfg.lastSuccessAt = finishedAt;
          delete cfg.lastError;
        });
        this.logger.info("data-mirror: run finished", {
          id,
          commitCount,
        });
        return record;
      } finally {
        await rm(stagingDir, { recursive: true, force: true });
      }
    } catch (err) {
      const message = this.sanitizeMessage(err);
      this.logger.error("data-mirror: run failed", { id, error: message });
      const record: MirrorRunRecord = {
        id,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "failed",
        commitCount: 0,
        ...(message ? { error: message } : {}),
      };
      await this.history.append(record);
      await this.updateConfig((cfg) => {
        cfg.lastError = message;
      });
      return record;
    } finally {
      this.running = false;
    }
  }

  /** 测试连接:验证仓库地址可访问与认证可用(不修改本地数据)。 */
  async testConnection(): Promise<{ ok: boolean; message?: string }> {
    const config = await this.configStore.get();
    if (config === null) {
      return { ok: false, message: "镜像未配置" };
    }
    const gitOptions = await this.buildGitOptions(config);
    const probeDir = await mkdtemp(join(tmpdir(), "atrium-git-probe-"));
    try {
      const git = new GitClient(probeDir, {
        ...gitOptions.options,
        timeoutMs: this.gitTimeoutMs,
      });
      await git.init();
      await git.addRemote("origin", config.repoUrl);
      await git.fetch("origin", config.branch);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message: this.sanitizeMessage(err),
      };
    } finally {
      await rm(probeDir, { recursive: true, force: true });
      await gitOptions.cleanup();
    }
  }

  /** 收集所有已启用模块 exporter 的输出(按 profile 隔离)。 */
  private async collectSnapshot(): Promise<SnapshotFile[]> {
    const profiles = await this.listProfiles();
    const files: SnapshotFile[] = [];
    for (const profileId of profiles) {
      for (const module of this.modules) {
        const exporter = module.dataMirrorExporter;
        if (exporter === undefined) {
          continue;
        }
        const dataDir = join("profiles", profileId, module.metadata.id);
        const host = this.runtime.hostFor(profileId);
        const context: ExportContext = {
          profileId,
          dataDir,
          scopedDb: host.scopedDb,
          ids: host.ids,
          tags: host.tags,
          log: this.logger,
        };
        const readable = await exporter.exportReadable(context);
        const structured = await exporter.exportStructured(context);
        for (const file of [...readable, ...structured]) {
          files.push({
            relativePath: validateAndJoin(dataDir, file),
            content: file.content,
          });
        }
      }
    }
    return files;
  }

  /** 当前阶段支持 single profile("default");多 profile 在此扩展。 */
  private async listProfiles(): Promise<string[]> {
    return ["default"];
  }

  /** 在临时目录生成完整镜像(根 README、manifest、profile/module 目录)。 */
  private async writeSnapshot(
    stagingDir: string,
    config: MirrorConfig,
    files: SnapshotFile[],
  ): Promise<void> {
    const rootDir = join(stagingDir, DATA_ROOT);
    await mkdir(rootDir, { recursive: true });

    const manifest = {
      version: MANIFEST_VERSION,
      // 注意:不含生成时间戳,保证"同一一致数据视图生成稳定文件"
      // (PRD §23 镜像确定性;时间戳会破坏无变化不提交)。
      application: this.applicationName(),
      profiles: [...new Set(files.map((f) => f.relativePath.split(sep)[1]))],
      modules: this.modules
        .filter((m) => m.dataMirrorExporter !== undefined)
        .map((m) => m.metadata.id),
      includeAttachments: config.includeAttachments,
      files: files.map((f) => f.relativePath),
    };
    await writeFile(
      join(rootDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    await writeFile(
      join(rootDir, "README.md"),
      [
        "# Atrium 数据镜像",
        "",
        "> 本仓库由 Atrium 服务端自动生成并单向推送,仅用于阅读与留档,",
        "> 不是数据权威。请勿手动修改镜像目录;人工提交与 Atrium 冲突时推送会停止。",
        "",
        `- 包含附件:${config.includeAttachments ? "是" : "否"}`,
        `- 目录:profiles/{profile}/{module}/`,
        "",
        "## 隐私警告",
        "",
        "镜像包含可直接阅读的个人数据,请确保仓库为私有仓库。",
        "",
      ].join("\n"),
    );

    for (const file of files) {
      const target = join(rootDir, file.relativePath);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, file.content);
    }
  }

  /**
   * 把快照同步到远程仓库:
   * 1. 准备/更新工作仓库(fetch、分支对齐、分歧检测);
   * 2. 用快照替换数据目录;
   * 3. 无变化不创建 commit;有变化 commit + push;
   * 4. push 失败或分支分歧时停止,绝不 force push。
   */
  private async syncToRemote(
    config: MirrorConfig,
    stagingDir: string,
    runId: string,
  ): Promise<number> {
    const gitOptions = await this.buildGitOptions(config);
    try {
      if (!existsSync(join(this.workDir, ".git"))) {
        await mkdir(this.workDir, { recursive: true });
        const gitInit = new GitClient(this.workDir, gitOptions.options);
        await gitInit.init();
        await gitInit.addRemote("origin", config.repoUrl);
      }
      const git = new GitClient(this.workDir, {
        ...gitOptions,
        timeoutMs: this.gitTimeoutMs,
      });

      try {
        await git.fetch("origin", config.branch);
      } catch (err) {
        // 首次运行时远端可能为空或不可达;由后续 push 暴露真实错误。
        this.logger.warn("data-mirror: initial fetch failed", {
          error: this.sanitizeMessage(err),
        });
      }

      const branch = config.branch;
      if (await git.hasLocalBranch(branch)) {
        const divergence = await git.divergence("origin", branch);
        if (divergence === null) {
          throw new CoreError(
            ERROR_CODES.CONFLICT,
            "远端分支与本地历史分叉,停止推送以避免覆盖人工提交;请人工处理后重试",
          );
        }
        await git.checkout(branch);
        if (divergence === "behind") {
          await git.fastForward(branch);
        }
      } else if (await git.hasRemoteBranch("origin", branch)) {
        await git.checkoutStart(branch, `refs/remotes/origin/${branch}`);
      } else {
        await git.checkoutOrphan(branch);
      }

      // 用快照替换远程仓库内的数据目录(不动数据目录外的文件)。
      const dataDir = config.dataDirPrefix || DATA_ROOT;
      const targetDir = join(this.workDir, dataDir);
      const sourceDir = join(stagingDir, DATA_ROOT);
      await rm(targetDir, { recursive: true, force: true });
      await cp(sourceDir, targetDir, { recursive: true });

      if (!(await git.hasChanges())) {
        this.logger.info("data-mirror: no changes, skip commit", { runId });
        return 0;
      }
      await git.add([dataDir]);
      await git.commit(`${COMMIT_PREFIX}${formatTimestamp(new Date())}`);
      await git.push("origin", branch);
      this.logger.info("data-mirror: pushed", { runId });
      return 1;
    } finally {
      await gitOptions.cleanup();
    }
  }

  /** 构造 git 认证选项(SSH key / PAT 临时文件,用完清理)。 */
  private async buildGitOptions(config: MirrorConfig): Promise<{
    options: GitClientOptions;
    cleanup(): Promise<void>;
  }> {
    const tempFiles: string[] = [];
    const options: GitClientOptions = { timeoutMs: this.gitTimeoutMs };

    if (config.authType === "ssh-deploy-key" && config.sshPrivateKey) {
      const keyPath = join(tmpdir(), `atrium-ssh-${randomUUID()}`);
      await writeFile(keyPath, config.sshPrivateKey, { mode: 0o600 });
      tempFiles.push(keyPath);
      options.sshPrivateKeyPath = keyPath;
    }
    if (config.authType === "pat" && config.pat) {
      const askPassPath = join(tmpdir(), `atrium-askpass-${randomUUID()}`);
      await writeFile(
        askPassPath,
        "#!/bin/sh\nprintf '%s\\n' \"$ATRIUM_GIT_PAT\"\n",
        { mode: 0o700 },
      );
      tempFiles.push(askPassPath);
      options.askPassPath = askPassPath;
      options.patEnv = config.pat;
    }

    return {
      options,
      cleanup: async () => {
        for (const file of tempFiles) {
          await rm(file, { force: true });
        }
      },
    };
  }

  /** 更新配置(保留 secret 与其他字段)。 */
  private async updateConfig(
    mutate: (config: MirrorConfig) => void,
  ): Promise<void> {
    const config = await this.configStore.get();
    if (config === null) {
      return;
    }
    mutate(config);
    await this.configStore.set(config);
  }

  /** 从异常提取安全的错误消息(去除 PAT/私钥等 secret)。 */
  private sanitizeMessage(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    const stored = this.configStore.getSync();
    let message = raw;
    if (stored?.pat) {
      message = message.split(stored.pat).join("[redacted]");
    }
    return message;
  }

  private applicationName(): string {
    return "atrium";
  }
}

/** 校验 exporter 输出路径:拒绝绝对路径、跨模块逃逸(AGENTS §19.3)。 */
function validateAndJoin(dataDir: string, file: ExportedFile): string {
  if (file.path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(file.path)) {
    throw new CoreError(
      ERROR_CODES.VALIDATION,
      `exporter 输出了绝对路径: ${file.path}`,
    );
  }
  const joined = normalize(join(dataDir, file.path));
  const dataDirPrefix = `${normalize(dataDir)}${sep}`;
  if (joined !== normalize(dataDir) && !joined.startsWith(dataDirPrefix)) {
    throw new CoreError(
      ERROR_CODES.VALIDATION,
      `exporter 输出逃逸出模块命名空间: ${file.path}`,
    );
  }
  return joined;
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

const consoleLogger: Logger = {
  debug: (message, meta) => console.debug(`[data-mirror] ${message}`, meta ?? ""),
  info: (message, meta) => console.info(`[data-mirror] ${message}`, meta ?? ""),
  warn: (message, meta) => console.warn(`[data-mirror] ${message}`, meta ?? ""),
  error: (message, meta) => console.error(`[data-mirror] ${message}`, meta ?? ""),
};
