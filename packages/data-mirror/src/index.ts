/**
 * @atrium/data-mirror — 服务端可读数据镜像(PRD §20 / AGENTS §19)。
 * 仅服务端使用;Web/desktop/mcp 宿主不得依赖本包(AGENTS §5.8)。
 */

export {
  DataMirrorEngine,
  DATA_ROOT,
} from "./engine.js";
export type { DataMirrorEngineOptions } from "./engine.js";

export {
  MirrorConfigStore,
  defaultMirrorConfig,
  toPublicConfig,
  redactRepoUrl,
} from "./config.js";
export type { MirrorConfig } from "./config.js";

export { MirrorHistory } from "./history.js";

export { MirrorScheduler } from "./scheduler.js";
export type { SchedulerOptions } from "./scheduler.js";

export { GitClient, runGit, GitCommandError } from "./git.js";
export type { GitClientOptions, GitRunResult } from "./git.js";
