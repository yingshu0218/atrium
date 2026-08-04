/**
 * @atrium/notes server 测试(:memory: SQLite + 最小 RouteRegistrar harness)。
 * 直接调用 notesServerModule.register 收集路由,按 method+path 匹配后
 * 调用 handler,验证 CRUD / 幂等 / 分页过滤 / 搜索 / capture / 标签 / 关联 /
 * 附件 / 审计全链路。
 */
import { describe, expect, it } from "vitest";
import { ERROR_CODES, UUID_V7_PATTERN } from "@atrium/contracts";
import type {
  RouteDefinition,
  RouteRegistrar,
  RouteRequest,
} from "@atrium/contracts";
import { createCoreRuntime, openDatabase } from "@atrium/core";
import type { CoreRuntime, SqliteDatabase } from "@atrium/core";
import { notesServerModule } from "../src/server/index.js";
import { notesMigrations } from "../src/migrations/index.js";

/** 收集路由定义的最小 RouteRegistrar(测试 harness)。 */
class CollectingRegistrar implements RouteRegistrar {
  readonly routes: RouteDefinition[] = [];
  register(definition: RouteDefinition): void {
    this.routes.push(definition);
  }
}

/** 把 "/:id/relations" 之类的 pattern 与真实 path 匹配并提取 params。 */
function matchRoute(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const part = patternParts[index]!;
    if (part.startsWith(":")) {
      params[part.slice(1)] = decodeURIComponent(pathParts[index]!);
    } else if (part !== pathParts[index]) {
      return null;
    }
  }
  return params;
}

interface TestContext {
  db: SqliteDatabase;
  runtime: CoreRuntime;
  registrar: CollectingRegistrar;
}

function setup(): TestContext {
  const db = openDatabase(":memory:");
  const runtime = createCoreRuntime(db);
  runtime.runMigrations("notes", notesMigrations);
  const registrar = new CollectingRegistrar();
  notesServerModule.register({
    host: runtime.hostFor("default"),
    routes: registrar,
  });
  return { db, runtime, registrar };
}

interface CallOptions {
  body?: unknown;
  query?: Record<string, unknown>;
}

async function call(
  ctx: TestContext,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  options: CallOptions = {},
): Promise<unknown> {
  const definition = ctx.registrar.routes.find(
    (route) =>
      route.method === method && matchRoute(route.path, path) !== null,
  );
  if (definition === undefined) {
    throw new Error(`no route for ${method} ${path}`);
  }
  const params = matchRoute(definition.path, path)!;
  const req: RouteRequest = {
    params,
    query: options.query ?? {},
    body: options.body,
    headers: {},
    profileId: "default",
  };
  return definition.handler(req, ctx.runtime.hostFor("default"));
}

async function createNote(
  ctx: TestContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await call(ctx, "POST", "/", { body });
  return result as Record<string, unknown>;
}

describe("notes server — CRUD", () => {
  it("create 返回行含 id/seq/profileId 与短 ID note-1", async () => {
    const ctx = setup();
    const note = await createNote(ctx, { title: "hello", body: "world" });

    expect(note).toMatchObject({
      title: "hello",
      body: "world",
      pinned: false,
      archived: false,
      profileId: "default",
      seq: 1,
      shortId: "note-1",
    });
    expect(note.id).toMatch(UUID_V7_PATTERN);
    expect(typeof note.createdAt).toBe("string");
    expect(typeof note.updatedAt).toBe("string");
  });

  it("create 支持幂等键:重复创建返回同一行", async () => {
    const ctx = setup();
    const body = { title: "idem", idempotencyKey: "replay-key-1" };
    const first = await createNote(ctx, body);
    const second = await createNote(ctx, body);

    expect(second.id).toBe(first.id);
    expect(second.seq).toBe(first.seq);
    // 全库只有一行。
    const rows = ctx.db
      .prepare("SELECT * FROM notes_notes")
      .all() as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
  });

  it("get 返回便签并附带 tags;未找到抛 CoreError(not_found)", async () => {
    const ctx = setup();
    const created = await createNote(ctx, { title: "get me", tags: ["work"] });

    const got = (await call(ctx, "GET", `/${created.id}`)) as Record<
      string,
      unknown
    >;
    expect(got.title).toBe("get me");
    expect(got.tags).toEqual(["work"]);

    await expect(call(ctx, "GET", "/does-not-exist")).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
  });

  it("update 更新字段与 updated_at,tags 整体替换", async () => {
    const ctx = setup();
    const created = await createNote(ctx, {
      title: "old",
      body: "first",
      tags: ["a", "b"],
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = (await call(ctx, "PUT", `/${created.id}`, {
      body: { title: "new", tags: ["c"] },
    })) as Record<string, unknown>;

    expect(updated.title).toBe("new");
    expect(updated.body).toBe("first");
    expect(updated.tags).toEqual(["c"]);
    expect(String(updated.updatedAt) > String(created.updatedAt)).toBe(true);
  });

  it("softDelete 后 list/get 不可见", async () => {
    const ctx = setup();
    const created = await createNote(ctx, { title: "to delete" });

    const deleted = (await call(ctx, "DELETE", `/${created.id}`)) as Record<
      string,
      unknown
    >;
    expect(deleted).toEqual({ deleted: true });

    await expect(call(ctx, "GET", `/${created.id}`)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
    const list = (await call(ctx, "GET", "/")) as { items: unknown[] };
    expect(list.items).toHaveLength(0);
  });
});

describe("notes server — list 分页与过滤", () => {
  it("默认只返回未归档;支持 pinned / archived 过滤", async () => {
    const ctx = setup();
    const pinned = await createNote(ctx, { title: "pinned note", pinned: true });
    const archived = await createNote(ctx, { title: "archived note", archived: true });
    await createNote(ctx, { title: "plain note" });

    const all = (await call(ctx, "GET", "/")) as { items: unknown[] };
    expect(all.items).toHaveLength(2);
    expect(all.items.map((item) => (item as { id: string }).id)).not.toContain(
      archived.id,
    );

    const pinnedOnly = (await call(ctx, "GET", "/", {
      query: { pinned: "true" },
    })) as { items: unknown[] };
    expect(pinnedOnly.items).toHaveLength(1);
    expect((pinnedOnly.items[0] as { id: string }).id).toBe(pinned.id);

    const archivedOnly = (await call(ctx, "GET", "/", {
      query: { archived: "true" },
    })) as { items: unknown[] };
    expect(archivedOnly.items).toHaveLength(1);
    expect((archivedOnly.items[0] as { id: string }).id).toBe(archived.id);
  });

  it("q 过滤标题/正文(不区分大小写)", async () => {
    const ctx = setup();
    await createNote(ctx, { title: "Groceries", body: "milk and bread" });
    await createNote(ctx, { title: "unrelated", body: "meeting at 3pm" });

    const byTitle = (await call(ctx, "GET", "/", {
      query: { q: "grocer" },
    })) as { items: unknown[] };
    expect(byTitle.items).toHaveLength(1);
    expect((byTitle.items[0] as { title: string }).title).toBe("Groceries");

    const byBody = (await call(ctx, "GET", "/", {
      query: { q: "MEETING" },
    })) as { items: unknown[] };
    expect(byBody.items).toHaveLength(1);
  });

  it("游标分页:limit 截断并返回 nextCursor,可翻页取完", async () => {
    const ctx = setup();
    const ids: string[] = [];
    for (let index = 1; index <= 5; index += 1) {
      const note = await createNote(ctx, { title: `note ${index}` });
      ids.push(note.id as string);
    }

    const page1 = (await call(ctx, "GET", "/", {
      query: { limit: "2" },
    })) as { items: unknown[]; nextCursor?: string };
    expect(page1.items).toHaveLength(2);
    expect(typeof page1.nextCursor).toBe("string");

    const page2 = (await call(ctx, "GET", "/", {
      query: { limit: "2", cursor: page1.nextCursor },
    })) as { items: unknown[]; nextCursor?: string };
    expect(page2.items).toHaveLength(2);
    expect(typeof page2.nextCursor).toBe("string");

    const page3 = (await call(ctx, "GET", "/", {
      query: { limit: "2", cursor: page2.nextCursor },
    })) as { items: unknown[]; nextCursor?: string };
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeUndefined();

    const collected = [
      ...page1.items,
      ...page2.items,
      ...page3.items,
    ].map((item) => (item as { id: string }).id);
    expect(collected.sort()).toEqual([...ids].sort());
  });
});

describe("notes server — 标签 / 关联 / 附件", () => {
  it("create 时写入 tags 并可在列表返回", async () => {
    const ctx = setup();
    const created = await createNote(ctx, {
      title: "tagged",
      tags: ["b", "a"],
    });
    expect(created.tags).toEqual(["a", "b"]);

    const got = (await call(ctx, "GET", `/${created.id}`)) as Record<
      string,
      unknown
    >;
    expect(got.tags).toEqual(["a", "b"]);
  });

  it("relations 登记与列出", async () => {
    const ctx = setup();
    const created = await createNote(ctx, { title: "rel" });

    const result = (await call(ctx, "POST", `/${created.id}/relations`, {
      body: {
        relationType: "references",
        targetResourceType: "contact",
        targetResourceId: "contact-1",
      },
    })) as Record<string, unknown>;
    expect(result.created).toBe(true);

    const relations = (await call(
      ctx,
      "GET",
      `/${created.id}/relations`,
    )) as Array<Record<string, unknown>>;
    expect(relations).toHaveLength(1);
    expect(relations[0]?.relationType).toBe("references");
    expect(relations[0]?.targetResourceId).toBe("contact-1");
    expect(relations[0]?.sourceResourceType).toBe("note");
    expect(relations[0]?.sourceResourceId).toBe(created.id);
  });

  it("attachments 只登记元数据并列出", async () => {
    const ctx = setup();
    const created = await createNote(ctx, { title: "att" });

    const record = (await call(ctx, "POST", `/${created.id}/attachments`, {
      body: { filename: "a.txt", mimeType: "text/plain", sizeBytes: 12 },
    })) as Record<string, unknown>;
    expect(record.filename).toBe("a.txt");
    expect(record.storageKey).toBe(`notes/${created.id}/a.txt`);

    const attachments = (await call(
      ctx,
      "GET",
      `/${created.id}/attachments`,
    )) as Array<Record<string, unknown>>;
    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.resourceType).toBe("note");
    expect(attachments[0]?.resourceId).toBe(created.id);
  });
});

describe("notes server — search / capture / audit", () => {
  it("searchProvider.search 返回命中(标题与正文,含短 ID 与 snippet)", async () => {
    const ctx = setup();
    const created = await createNote(ctx, {
      title: "meeting notes",
      body: "discuss the roadmap",
    });
    await createNote(ctx, { title: "grocery", body: "milk" });

    const host = ctx.runtime.hostFor("default");
    const hits = await notesServerModule.searchProvider!.search(
      "default",
      "roadmap",
      10,
      host,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      resourceType: "note",
      resourceId: created.id,
      title: "meeting notes",
    });
    expect(hits[0]?.shortId).toMatch(/^note-\d+$/);
    expect(hits[0]?.snippet).toContain("roadmap");
  });

  it("captureHandler.capture 拆标题/正文并返回 shortId", async () => {
    const ctx = setup();
    const host = ctx.runtime.hostFor("default");
    const result = await notesServerModule.captureHandler!.capture(
      "default",
      { text: "采购清单\n牛奶\n面包" },
      host,
    );

    expect(result.resourceId).toMatch(UUID_V7_PATTERN);
    expect(result.shortId).toBe("note-1");

    const row = await host.scopedDb.findById<Record<string, unknown>>(
      "notes_notes",
      result.resourceId,
    );
    expect(row?.title).toBe("采购清单");
    expect(row?.body).toBe("牛奶\n面包");
  });

  it("写操作写入 audit log(source=api)", async () => {
    const ctx = setup();
    const created = await createNote(ctx, { title: "audited" });
    await call(ctx, "PUT", `/${created.id}`, { body: { title: "updated" } });
    await call(ctx, "DELETE", `/${created.id}`);

    const rows = ctx.db
      .prepare("SELECT * FROM audit_log ORDER BY created_at")
      .all() as Record<string, unknown>[];
    const actions = rows.map((row) => `${row.action}|${row.source}`);
    expect(actions).toContain("note.create|api");
    expect(actions).toContain("note.update|api");
    expect(actions).toContain("note.delete|api");
    expect(rows.every((row) => row.profile_id === "default")).toBe(true);
  });
});
