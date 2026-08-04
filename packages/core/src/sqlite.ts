/**
 * SQLite 连接(AGENTS.md §9)。
 * 统一入口:创建 better-sqlite3 数据库并应用要求的 PRAGMA 设置。
 * 模块不得获得裸连接;只有 core 内部与迁移执行器使用。
 */
import Database from "better-sqlite3";

export type SqliteDatabase = Database.Database;

/**
 * 打开 SQLite 数据库文件并应用 PRAGMA(AGENTS.md §9):
 * - journal_mode=WAL
 * - busy_timeout=5000
 * - foreign_keys=ON
 * - synchronous=NORMAL
 *
 * `:memory:` 数据库会忽略 WAL 模式(SQLite 返回 journal_mode=memory,不报错)。
 */
export function openDatabase(filePath: string): SqliteDatabase {
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  return db;
}
