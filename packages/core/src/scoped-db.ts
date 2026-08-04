/**
 * ScopedDb(AGENTS.md §8):模块唯一数据访问入口。
 * - 自动注入 WHERE profile_id = ? AND deleted_at IS NULL(includeDeleted 可放宽);
 * - snake_case 列 → camelCase 对象返回;
 * - 自动分配 seq、created_at / updated_at(ISO-8601 UTC);
 * - 幂等键重放、软删除、游标分页与受限事务。
 */
import { ERROR_CODES } from "@atrium/contracts";
import type {
  CreateInput,
  CursorPage,
  IdService,
  ListOptions,
  ScopedDb,
} from "@atrium/contracts";
import { CoreError, notFound } from "./errors.js";
import type { SqliteDatabase } from "./sqlite.js";

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function camelCase(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** 行转换:snake_case 列名 → camelCase 键。 */
export function camelizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[camelCase(key)] = value;
  }
  return out;
}

/** 默认当前时间(ISO-8601 UTC);可注入便于测试。 */
export function defaultNow(): string {
  return new Date().toISOString();
}

/** 游标负载:排序列值 + 行 id。 */
interface CursorPayload {
  t: unknown;
  i: string;
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): CursorPayload {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) throw new Error("invalid cursor");
    const payload = parsed as Partial<CursorPayload>;
    if (typeof payload.i !== "string") throw new Error("invalid cursor");
    return { t: payload.t, i: payload.i };
  } catch {
    throw new CoreError(ERROR_CODES.VALIDATION, `invalid cursor: ${cursor}`);
  }
}

/** savepoint 名必须跨嵌套事务全局唯一。 */
let savepointSeq = 0;

export class ScopedDbImpl implements ScopedDb {
  private readonly columnsCache = new Map<string, Set<string>>();

  constructor(
    private readonly db: SqliteDatabase,
    private readonly profileId: string,
    private readonly ids: IdService,
    private readonly now: () => string = defaultNow,
  ) {}

  async findById<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    id: string,
  ): Promise<T | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM ${quoteIdent(table)} WHERE "id" = ? AND "profile_id" = ? AND "deleted_at" IS NULL`,
      )
      .get(id, this.profileId) as Record<string, unknown> | undefined;
    return row ? (camelizeRow(row) as T) : null;
  }

  async list<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    options: ListOptions = {},
  ): Promise<CursorPage<T>> {
    const limit = options.limit ?? 20;
    const orderBy = options.orderBy ?? { column: "created_at", direction: "desc" };
    const where = options.where ?? {};
    const includeDeleted = options.includeDeleted ?? false;

    const conditions: string[] = [`"profile_id" = ?`];
    const params: unknown[] = [this.profileId];
    if (!includeDeleted) conditions.push(`"deleted_at" IS NULL`);
    for (const [column, value] of Object.entries(where)) {
      conditions.push(`${quoteIdent(column)} = ?`);
      params.push(value);
    }

    const direction = orderBy.direction === "asc" ? "ASC" : "DESC";
    const orderColumn = quoteIdent(orderBy.column);

    if (options.cursor !== undefined) {
      const cursor = decodeCursor(options.cursor);
      const op = orderBy.direction === "asc" ? ">" : "<";
      conditions.push(
        `(${orderColumn} ${op} ? OR (${orderColumn} = ? AND "id" ${op} ?))`,
      );
      params.push(cursor.t, cursor.t, cursor.i);
    }

    const rows = this.db
      .prepare(
        `SELECT * FROM ${quoteIdent(table)} WHERE ${conditions.join(" AND ")} ORDER BY ${orderColumn} ${direction}, "id" ${direction} LIMIT ?`,
      )
      .all(...params, limit + 1) as Record<string, unknown>[];

    // limit+1 探测:只有确认还有更多时才返回 nextCursor。
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items = page.map((row) => camelizeRow(row)) as readonly T[];

    let nextCursor: string | undefined;
    if (hasMore && page.length === limit) {
      const last = page[page.length - 1]!;
      nextCursor = encodeCursor({ t: last[orderBy.column], i: String(last.id) });
    }
    return nextCursor === undefined ? { items } : { items, nextCursor };
  }

  async create<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    input: CreateInput,
  ): Promise<T> {
    const now = this.now();

    // 幂等重放:表含 idempotency_key 列且调用方提供了键时,命中则直接返回已有行。
    if (input.idempotencyKey !== undefined && this.hasIdempotencyKeyColumn(table)) {
      const existing = this.db
        .prepare(
          `SELECT * FROM ${quoteIdent(table)} WHERE "idempotency_key" = ? AND "profile_id" = ?`,
        )
        .get(input.idempotencyKey, this.profileId) as Record<string, unknown> | undefined;
      if (existing) return camelizeRow(existing) as T;
    }

    const seq = this.ids.nextSeq(input.resourceType);
    // 固定字段置于展开值之后,防止输入覆盖 profile_id 等管理字段(范围越权防护)。
    const values: Record<string, unknown> = {
      ...input.values,
      id: input.id,
      profile_id: this.profileId,
      seq,
      created_at: now,
      updated_at: now,
    };
    // 幂等键需持久化到 idempotency_key 列,后续重放才能命中。
    if (input.idempotencyKey !== undefined && this.hasIdempotencyKeyColumn(table)) {
      values.idempotency_key = input.idempotencyKey;
    }
    const columns = Object.keys(values);
    const columnList = columns.map(quoteIdent).join(", ");
    const placeholders = columns.map(() => "?").join(", ");
    this.db
      .prepare(`INSERT INTO ${quoteIdent(table)} (${columnList}) VALUES (${placeholders})`)
      .run(...columns.map((column) => values[column]));

    const row = this.db
      .prepare(`SELECT * FROM ${quoteIdent(table)} WHERE "id" = ?`)
      .get(input.id) as Record<string, unknown>;
    return camelizeRow(row) as T;
  }

  async update<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    id: string,
    patch: Readonly<Record<string, unknown>>,
  ): Promise<T> {
    const existing = this.db
      .prepare(
        `SELECT * FROM ${quoteIdent(table)} WHERE "id" = ? AND "profile_id" = ? AND "deleted_at" IS NULL`,
      )
      .get(id, this.profileId);
    if (!existing) throw notFound(table, id);

    const now = this.now();
    // 管理字段由 ScopedDb 负责,不接受调用方修改。
    const protectedKeys = new Set(["id", "profile_id", "seq", "created_at", "deleted_at"]);
    const changes = Object.entries(patch).filter(([key]) => !protectedKeys.has(key));
    if (changes.length > 0) {
      const assignments = changes.map(([column]) => `${quoteIdent(column)} = ?`).join(", ");
      this.db
        .prepare(
          `UPDATE ${quoteIdent(table)} SET ${assignments}, "updated_at" = ? WHERE "id" = ?`,
        )
        .run(...changes.map(([, value]) => value), now, id);
    } else {
      this.db
        .prepare(`UPDATE ${quoteIdent(table)} SET "updated_at" = ? WHERE "id" = ?`)
        .run(now, id);
    }

    const row = this.db
      .prepare(`SELECT * FROM ${quoteIdent(table)} WHERE "id" = ?`)
      .get(id) as Record<string, unknown>;
    return camelizeRow(row) as T;
  }

  async softDelete(table: string, id: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE ${quoteIdent(table)} SET "deleted_at" = ? WHERE "id" = ? AND "profile_id" = ? AND "deleted_at" IS NULL`,
      )
      .run(this.now(), id, this.profileId);
  }

  async count(
    table: string,
    where?: Readonly<Record<string, unknown>>,
  ): Promise<number> {
    const conditions: string[] = [`"profile_id" = ?`, `"deleted_at" IS NULL`];
    const params: unknown[] = [this.profileId];
    if (where) {
      for (const [column, value] of Object.entries(where)) {
        conditions.push(`${quoteIdent(column)} = ?`);
        params.push(value);
      }
    }
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS "count" FROM ${quoteIdent(table)} WHERE ${conditions.join(" AND ")}`,
      )
      .get(...params) as { count: number };
    return row.count;
  }

  /**
   * 受限事务:内部所有访问保持同一 profile scope。
   *
   * 说明:better-sqlite3 的 db.transaction 拒绝 async 回调
   * ("Transaction function cannot return a promise"),而 ScopedDb 契约要求
   * Promise;因此这里用显式 BEGIN IMMEDIATE / COMMIT / ROLLBACK,并支持
   * 嵌套事务(savepoint)。
   */
  async transaction<T>(fn: (db: ScopedDb) => Promise<T>): Promise<T> {
    const scoped = new ScopedDbImpl(this.db, this.profileId, this.ids, this.now);
    if (this.db.inTransaction) {
      const name = `atrium_tx_${savepointSeq++}`;
      this.db.exec(`SAVEPOINT ${name}`);
      try {
        const result = await fn(scoped);
        this.db.exec(`RELEASE ${name}`);
        return result;
      } catch (err) {
        this.db.exec(`ROLLBACK TO ${name}`);
        this.db.exec(`RELEASE ${name}`);
        throw err;
      }
    }

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn(scoped);
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  private hasIdempotencyKeyColumn(table: string): boolean {
    let columns = this.columnsCache.get(table);
    if (!columns) {
      const info = this.db
        .prepare(`PRAGMA table_info(${quoteIdent(table)})`)
        .all() as { name: string }[];
      columns = new Set(info.map((entry) => entry.name));
      this.columnsCache.set(table, columns);
    }
    return columns.has("idempotency_key");
  }
}
