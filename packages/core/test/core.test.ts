/**
 * @atrium/core 测试(:memory: SQLite)。
 * 覆盖:uuidV7、nextSeq、ScopedDb(scope/时间戳/隔离/软删/游标分页/幂等/事务)、
 * MigrationRunner、tags/relations/audit/config、registry、search、capture、requireAdmin。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ERROR_CODES, UUID_V7_PATTERN } from "@atrium/contracts";
import { CoreError } from "../src/errors.js";
import { IdServiceImpl, uuidV7 } from "../src/ids.js";
import { MigrationRunner } from "../src/migrations.js";
import { createCoreRuntime } from "../src/runtime.js";
import type { CoreRuntime } from "../src/runtime.js";
import { ScopedDbImpl } from "../src/scoped-db.js";
import { openDatabase } from "../src/sqlite.js";
import type { SqliteDatabase } from "../src/sqlite.js";

function createNotesTable(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      title TEXT,
      body TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      idempotency_key TEXT
    )
  `);
}

describe("ids", () => {
  it("uuidV7 produces RFC 9562 compliant lowercase ids", () => {
    const id = uuidV7();
    expect(id).toMatch(UUID_V7_PATTERN);
    // 版本位(第 13 个字符)。
    expect(id[14]).toBe("7");
    // 变体位(第 17 个字符,8/9/a/b)。
    expect("89ab").toContain(id[19]);
    expect(id).toBe(id.toLowerCase());
  });

  it("uuidV7 is unique across many calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = uuidV7();
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it("nextSeq increments per resourceType independently", () => {
    const db = openDatabase(":memory:");
    const runtime = createCoreRuntime(db);
    const ids = new IdServiceImpl(db);
    expect(ids.nextSeq("note")).toBe(1);
    expect(ids.nextSeq("note")).toBe(2);
    expect(ids.nextSeq("note")).toBe(3);
    expect(ids.nextSeq("todo")).toBe(1);
    expect(ids.nextSeq("todo")).toBe(2);
    expect(ids.nextSeq("note")).toBe(4);
    expect(ids.shortId("note", 4)).toBe("note-4");
    runtime.close();
  });
});

describe("scoped db", () => {
  let db: SqliteDatabase;
  let runtime: CoreRuntime;

  beforeEach(() => {
    db = openDatabase(":memory:");
    runtime = createCoreRuntime(db);
    createNotesTable(db);
  });

  it("create injects profile_id, seq and timestamps, returning camelCase row", async () => {
    const scoped = runtime.scopedDbFor("profile-1");
    const row = await scoped.create("notes", {
      id: "n1",
      resourceType: "note",
      values: { title: "hello" },
    });
    expect(row.id).toBe("n1");
    expect(row.profileId).toBe("profile-1");
    expect(row.seq).toBe(1);
    expect(row.title).toBe("hello");
    expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(row.updatedAt).toBe(row.createdAt);
  });

  it("isolates data between profiles", async () => {
    const s1 = runtime.scopedDbFor("p1");
    const s2 = runtime.scopedDbFor("p2");
    await s1.create("notes", { id: "a", resourceType: "note", values: { title: "A" } });
    await s2.create("notes", { id: "b", resourceType: "note", values: { title: "B" } });
    expect(await s1.findById("notes", "b")).toBeNull();
    expect(await s2.findById("notes", "a")).toBeNull();
    expect((await s1.list("notes")).items).toHaveLength(1);
    expect((await s2.list("notes")).items).toHaveLength(1);
    expect(await s1.count("notes")).toBe(1);
  });

  it("update modifies values and bumps updated_at", async () => {
    let tick = 1_000;
    const now = () => new Date(tick++).toISOString();
    const ids = new IdServiceImpl(db);
    const scoped = new ScopedDbImpl(db, "p1", ids, now);
    const created = await scoped.create("notes", {
      id: "n1",
      resourceType: "note",
      values: { title: "v1" },
    });
    const updated = await scoped.update("notes", "n1", { title: "v2" });
    expect(updated.title).toBe("v2");
    expect(updated.updatedAt).not.toBe(created.updatedAt);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      new Date(created.updatedAt).getTime(),
    );
  });

  it("update throws NOT_FOUND for missing row", async () => {
    const scoped = runtime.scopedDbFor("p1");
    await expect(scoped.update("notes", "nope", { title: "x" })).rejects.toThrow(
      CoreError,
    );
    await expect(
      scoped.update("notes", "nope", { title: "x" }),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it("softDelete hides rows unless includeDeleted", async () => {
    const scoped = runtime.scopedDbFor("p1");
    await scoped.create("notes", { id: "n1", resourceType: "note", values: {} });
    await scoped.create("notes", { id: "n2", resourceType: "note", values: {} });

    await scoped.softDelete("notes", "n1");

    expect(await scoped.findById("notes", "n1")).toBeNull();
    const page = await scoped.list("notes");
    expect(page.items.map((row) => row.id)).toEqual(["n2"]);
    const withDeleted = await scoped.list("notes", { includeDeleted: true });
    expect(withDeleted.items).toHaveLength(2);
    expect(await scoped.count("notes")).toBe(1);
  });

  it("count supports equality filters", async () => {
    const scoped = runtime.scopedDbFor("p1");
    await scoped.create("notes", {
      id: "a",
      resourceType: "note",
      values: { title: "x" },
    });
    await scoped.create("notes", {
      id: "b",
      resourceType: "note",
      values: { title: "y" },
    });
    expect(await scoped.count("notes", { title: "x" })).toBe(1);
    expect(await scoped.count("notes", { title: "z" })).toBe(0);
  });

  it("list filters by where equality and paginates by cursor", async () => {
    let tick = 1_000;
    const now = () => new Date(tick++).toISOString();
    const ids = new IdServiceImpl(db);
    const scoped = new ScopedDbImpl(db, "p1", ids, now);
    for (let i = 1; i <= 5; i++) {
      await scoped.create("notes", {
        id: `n${i}`,
        resourceType: "note",
        values: { title: `t${i}` },
      });
    }

    // 默认 created_at desc:最新(n5)在前。
    const page1 = await scoped.list("notes", { limit: 2 });
    expect(page1.items.map((row) => row.id)).toEqual(["n5", "n4"]);
    expect(page1.nextCursor).toBeDefined();

    const page2 = await scoped.list("notes", {
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items.map((row) => row.id)).toEqual(["n3", "n2"]);
    expect(page2.nextCursor).toBeDefined();

    const page3 = await scoped.list("notes", {
      limit: 2,
      cursor: page2.nextCursor,
    });
    expect(page3.items.map((row) => row.id)).toEqual(["n1"]);
    expect(page3.nextCursor).toBeUndefined();

    // where 过滤叠加 scope。
    const filtered = await scoped.list("notes", { where: { title: "t3" } });
    expect(filtered.items.map((row) => row.id)).toEqual(["n3"]);
  });

  it("omits nextCursor when the last page exactly fills the limit", async () => {
    const scoped = runtime.scopedDbFor("p1");
    await scoped.create("notes", { id: "a", resourceType: "note", values: {} });
    await scoped.create("notes", { id: "b", resourceType: "note", values: {} });
    const page = await scoped.list("notes", { limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeUndefined();
  });

  it("create replays on idempotency key", async () => {
    const scoped = runtime.scopedDbFor("p1");
    const first = await scoped.create("notes", {
      id: "n1",
      resourceType: "note",
      values: { title: "v1" },
      idempotencyKey: "key-1",
    });
    const second = await scoped.create("notes", {
      id: "n2",
      resourceType: "note",
      values: { title: "v2" },
      idempotencyKey: "key-1",
    });
    expect(second.id).toBe(first.id);
    expect(second.title).toBe("v1");
    expect(await scoped.count("notes")).toBe(1);
  });

  it("transaction commits and rolls back", async () => {
    const scoped = runtime.scopedDbFor("p1");

    await scoped.transaction(async (tx) => {
      await tx.create("notes", { id: "a", resourceType: "note", values: {} });
    });
    expect(await scoped.count("notes")).toBe(1);

    await expect(
      scoped.transaction(async (tx) => {
        await tx.create("notes", { id: "b", resourceType: "note", values: {} });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await scoped.count("notes")).toBe(1);
  });

  it("supports nested transactions", async () => {
    const scoped = runtime.scopedDbFor("p1");
    await scoped.transaction(async (tx) => {
      await tx.create("notes", { id: "a", resourceType: "note", values: {} });
      await tx.transaction(async (inner) => {
        await inner.create("notes", { id: "b", resourceType: "note", values: {} });
      });
    });
    expect(await scoped.count("notes")).toBe(2);
  });
});

describe("migrations", () => {
  it("runs migrations in order and is idempotent", () => {
    const db = openDatabase(":memory:");
    const runtime = createCoreRuntime(db);
    const calls: string[] = [];
    const m1 = {
      id: "001",
      up: (sql: (statement: string) => void) => {
        sql("CREATE TABLE IF NOT EXISTS t_mig1 (x TEXT)");
        calls.push("001");
      },
    };
    const m2 = {
      id: "002",
      up: (sql: (statement: string) => void) => {
        sql("CREATE TABLE IF NOT EXISTS t_mig2 (x TEXT)");
        calls.push("002");
      },
    };
    runtime.runMigrations("mod", [m1, m2]);
    runtime.runMigrations("mod", [m1, m2]);

    expect(calls).toEqual(["001", "002"]);
    const applied = db
      .prepare("SELECT id FROM schema_migrations WHERE module_id = ? ORDER BY id")
      .all("mod") as { id: string }[];
    expect(applied.map((row) => row.id)).toEqual(["001", "002"]);
    runtime.close();
  });

  it("MigrationRunner records applied_at", () => {
    const db = openDatabase(":memory:");
    const runner = new MigrationRunner(db);
    runner.run("mod", [
      { id: "m1", up: (sql) => sql("CREATE TABLE IF NOT EXISTS t_ma (x TEXT)") },
    ]);
    const row = db
      .prepare("SELECT * FROM schema_migrations WHERE module_id = ? AND id = ?")
      .get("mod", "m1") as { applied_at: string } | undefined;
    expect(row).toBeDefined();
    expect(row?.applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    db.close();
  });
});

describe("services", () => {
  let db: SqliteDatabase;
  let runtime: CoreRuntime;

  beforeEach(() => {
    db = openDatabase(":memory:");
    runtime = createCoreRuntime(db);
    createNotesTable(db);
  });

  it("tags add/remove/listForResource (deduplicated)", async () => {
    const host = runtime.hostFor("p1");
    await host.tags.add("note", "n1", "work");
    await host.tags.add("note", "n1", "personal");
    await host.tags.add("note", "n1", "work");

    expect(await host.tags.listForResource("note", "n1")).toEqual(
      expect.arrayContaining(["work", "personal"]),
    );
    expect(await host.tags.listForResource("note", "n1")).toHaveLength(2);

    await host.tags.remove("note", "n1", "work");
    expect(await host.tags.listForResource("note", "n1")).toEqual(["personal"]);
    expect(await host.tags.listForResource("note", "n2")).toEqual([]);
  });

  it("relations create/listBySource/remove", async () => {
    const host = runtime.hostFor("p1");
    await host.relations.create({
      relationType: "links-to",
      sourceResourceType: "note",
      sourceResourceId: "n1",
      targetResourceType: "note",
      targetResourceId: "n2",
    });

    const rels = await host.relations.listBySource("note", "n1");
    expect(rels).toHaveLength(1);
    expect(rels[0].relationType).toBe("links-to");
    expect(rels[0].sourceResourceId).toBe("n1");
    expect(rels[0].targetResourceId).toBe("n2");
    expect(rels[0].profileId).toBe("p1");
    expect(rels[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    await host.relations.remove(rels[0].id);
    expect(await host.relations.listBySource("note", "n1")).toHaveLength(0);
  });

  it("attachments create/listForResource", async () => {
    const host = runtime.hostFor("p1");
    const created = await host.attachments.create({
      resourceType: "note",
      resourceId: "n1",
      filename: "a.png",
      mimeType: "image/png",
      sizeBytes: 42,
      storageKey: "store/a.png",
    });
    expect(created.id).toMatch(UUID_V7_PATTERN);
    expect(created.filename).toBe("a.png");
    expect(created.sizeBytes).toBe(42);
    expect(created.profileId).toBe("p1");

    const list = await host.attachments.listForResource("note", "n1");
    expect(list.map((row) => row.filename)).toEqual(["a.png"]);
  });

  it("audit record writes profile-scoped log with JSON meta", async () => {
    const host = runtime.hostFor("p1");
    await host.audit.record({
      action: "note.create",
      source: "api",
      targetResourceType: "note",
      targetResourceId: "n1",
      meta: { count: 1, tags: ["a"] },
    });

    const rows = db
      .prepare("SELECT * FROM audit_log ORDER BY created_at")
      .all() as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.profile_id).toBe("p1");
    expect(rows[0]?.action).toBe("note.create");
    expect(rows[0]?.source).toBe("api");
    expect(JSON.parse(rows[0]?.meta_json as string)).toEqual({ count: 1, tags: ["a"] });
  });

  it("config get/set stores JSON values", async () => {
    await runtime.config.set("theme", { dark: true });
    expect(runtime.config.get<{ dark: boolean }>("theme")).toEqual({ dark: true });
    await runtime.config.set("theme", { dark: false });
    expect(runtime.config.get<{ dark: boolean }>("theme")).toEqual({ dark: false });
    expect(runtime.config.get("missing")).toBeUndefined();
  });

  it("resource registry rejects duplicate types", () => {
    const descriptor = {
      type: "note",
      label: "Note",
      moduleId: "notes",
      fields: [],
    };
    runtime.resources.register(descriptor);
    expect(runtime.resources.get("note")).toBe(descriptor);
    expect(runtime.resources.all()).toHaveLength(1);
    expect(() => runtime.resources.register(descriptor)).toThrow(CoreError);
    expect(() => runtime.resources.register(descriptor)).toThrow(/already registered/);
    let caught: unknown;
    try {
      runtime.resources.register(descriptor);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CoreError);
    expect((caught as CoreError).code).toBe(ERROR_CODES.CONFLICT);
  });

  it("search aggregates providers in registration order and truncates", async () => {
    const seen: string[] = [];
    runtime.search.register({
      resourceType: "note",
      search: async (profileId, query) => {
        seen.push(`note:${profileId}:${query}`);
        return [{ resourceType: "note", resourceId: "n1", shortId: "note-1", title: "A" }];
      },
    });
    runtime.search.register({
      resourceType: "todo",
      search: async (profileId, query) => {
        seen.push(`todo:${profileId}:${query}`);
        return [
          { resourceType: "todo", resourceId: "t1", shortId: "todo-1", title: "B" },
          { resourceType: "todo", resourceId: "t2", shortId: "todo-2", title: "C" },
        ];
      },
    });

    const hits = await runtime.search.search("p1", "milk", 2);
    expect(hits.map((hit) => hit.resourceType)).toEqual(["note", "todo"]);
    expect(hits).toHaveLength(2);
    expect(seen).toEqual(["note:p1:milk", "todo:p1:milk"]);
  });

  it("search rejects duplicate providers per resourceType", () => {
    const provider = { resourceType: "note", search: async () => [] };
    runtime.search.register(provider);
    expect(() => runtime.search.register(provider)).toThrow(CoreError);
  });

  it("capture tries handlers in registration order", async () => {
    let attempts = 0;
    runtime.capture.register({
      resourceType: "note",
      capture: async () => {
        attempts++;
        throw new Error("cannot handle");
      },
    });
    runtime.capture.register({
      resourceType: "todo",
      capture: async () => {
        attempts++;
        return { resourceId: "t1", shortId: "todo-1" };
      },
    });

    const result = await runtime.capture.capture("p1", { text: "buy milk" });
    expect(result).toEqual({ resourceType: "todo", resourceId: "t1", shortId: "todo-1" });
    expect(attempts).toBe(2);
  });

  it("capture throws when every handler fails", async () => {
    runtime.capture.register({
      resourceType: "note",
      capture: async () => {
        throw new Error("nope");
      },
    });
    await expect(runtime.capture.capture("p1", { text: "x" })).rejects.toThrow(
      CoreError,
    );
  });

  it("requireAdmin throws unless adminVerified", async () => {
    await expect(runtime.hostFor("p1").requireAdmin()).rejects.toMatchObject({
      code: ERROR_CODES.ADMIN_CHALLENGE_REQUIRED,
    });
    await expect(
      runtime.hostFor("p1", { adminVerified: true }).requireAdmin(),
    ).resolves.toBeUndefined();
  });
});
