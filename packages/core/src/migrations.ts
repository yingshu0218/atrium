/**
 * 迁移编排(PRD §9.2 / AGENTS.md §7)。
 * - schema_migrations(module_id, id, applied_at)记录已应用迁移;
 * - 按声明顺序执行未应用的迁移,每个迁移一个事务;
 * - up 收到 sql 执行函数,可收集并执行任意 SQL 语句;
 * - 重复调用幂等。
 */
import type { SqliteDatabase } from "./sqlite.js";

export interface CoreMigration {
  id: string;
  up: (sql: (statement: string) => void) => void;
}

export class MigrationRunner {
  constructor(private readonly db: SqliteDatabase) {}

  run(moduleId: string, migrations: readonly CoreMigration[]): void {
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS "schema_migrations" (
        "module_id" TEXT NOT NULL,
        "id" TEXT NOT NULL,
        "applied_at" TEXT NOT NULL,
        PRIMARY KEY ("module_id", "id")
      )`,
    );

    const appliedRows = this.db
      .prepare(`SELECT "id" FROM "schema_migrations" WHERE "module_id" = ?`)
      .all(moduleId) as { id: string }[];
    const applied = new Set(appliedRows.map((row) => row.id));

    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;

      const statements: string[] = [];
      migration.up((statement) => statements.push(statement));

      // 每个迁移一个事务,应用 SQL 后记录。
      const runMigration = this.db.transaction(() => {
        for (const statement of statements) {
          this.db.exec(statement);
        }
        this.db
          .prepare(
            `INSERT INTO "schema_migrations" ("module_id", "id", "applied_at") VALUES (?, ?, ?)`,
          )
          .run(moduleId, migration.id, new Date().toISOString());
      });
      runMigration();
      applied.add(migration.id);
    }
  }
}
