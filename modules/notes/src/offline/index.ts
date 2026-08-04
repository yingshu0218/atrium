/**
 * @atrium/notes offline 入口 — OfflineModule(AGENTS.md §14)。
 * 在线优先:默认离线只读;仅白名单操作允许进入 outbox。
 * notes 的写操作采用 server-wins 冲突策略(不实现 CRDT)。
 */
import type { OfflineModule } from "@atrium/contracts";
import { notesManifest } from "../manifest.js";

export const notesOfflineModule: OfflineModule = {
  metadata: notesManifest,
  offlineOperations: [
    { operation: "notes.create", conflictStrategy: "server-wins" },
    { operation: "notes.update", conflictStrategy: "server-wins" },
    { operation: "notes.delete", conflictStrategy: "server-wins" },
  ],
};
