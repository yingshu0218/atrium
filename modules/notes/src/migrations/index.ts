/**
 * @atrium/notes migrations — 顺序迁移(AGENTS.md §7:安装即允许迁移,幂等)。
 * 表名以模块 id 为前缀(notes_notes);包含 AGENTS.md §9 要求的全部标准字段。
 */
import type { ModuleMigration } from "@atrium/contracts";

export const notesMigrations: readonly ModuleMigration[] = [
  {
    id: "notes-0001",
    up(sql) {
      sql(`CREATE TABLE IF NOT EXISTS notes_notes (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        pinned INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        idempotency_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );`);
      sql(`CREATE INDEX IF NOT EXISTS idx_notes_notes_profile
        ON notes_notes(profile_id, deleted_at);`);
      sql(`CREATE INDEX IF NOT EXISTS idx_notes_notes_idem
        ON notes_notes(idempotency_key) WHERE idempotency_key IS NOT NULL;`);
    },
  },
];
