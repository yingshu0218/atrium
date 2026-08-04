/**
 * @atrium/notes agent 测试(:memory: SQLite + 直接调用 AgentModule handlers)。
 * 验证 create/list/get/update/delete/search 行为与 audit(source=agent)。
 */
import { describe, expect, it } from "vitest";
import { UUID_V7_PATTERN } from "@atrium/contracts";
import type { AgentOperationContext } from "@atrium/contracts";
import { createCoreRuntime, openDatabase } from "@atrium/core";
import type { CoreRuntime, SqliteDatabase } from "@atrium/core";
import { notesAgentModule } from "../src/agent/index.js";
import { notesMigrations } from "../src/migrations/index.js";

interface AgentTestContext {
  db: SqliteDatabase;
  runtime: CoreRuntime;
  host: AgentOperationContext["host"];
}

function setup(): AgentTestContext {
  const db = openDatabase(":memory:");
  const runtime = createCoreRuntime(db);
  runtime.runMigrations("notes", notesMigrations);
  return { db, runtime, host: runtime.hostFor("profile-1") };
}

function run(
  ctx: AgentTestContext,
  operation: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const handler = notesAgentModule.handlers[operation];
  if (handler === undefined) {
    throw new Error(`no agent handler for ${operation}`);
  }
  return handler({
    profileId: ctx.host.profileId,
    resourceType: "note",
    operation,
    args,
    host: ctx.host,
  });
}

describe("notes agent module", () => {
  it("声明 note 资源与全部标准操作", () => {
    expect(notesAgentModule.resources).toEqual([
      {
        type: "note",
        label: "便签",
        operations: ["list", "get", "create", "update", "delete", "search"],
      },
    ]);
    for (const operation of ["list", "get", "create", "update", "delete", "search"]) {
      expect(notesAgentModule.handlers[`${operation}:note`]).toBeTypeOf("function");
    }
  });

  it("create 创建便签并返回行 + 短 ID;审计由 AgentService 层负责,模块层不重复记录", async () => {
    const ctx = setup();
    const created = (await run(ctx, "create:note", {
      input: { title: "agent note", body: "from mcp", tags: ["x"] },
    })) as Record<string, unknown>;

    expect(created).toMatchObject({
      title: "agent note",
      body: "from mcp",
      tags: ["x"],
      seq: 1,
      shortId: "note-1",
      profileId: "profile-1",
      pinned: false,
      archived: false,
    });
    expect(created.id).toMatch(UUID_V7_PATTERN);

    // AgentService(@atrium/mcp-host)统一记录 agent 审计并脱敏;
    // 模块层直接调用 handlers 时不产生审计,避免双重记录。
    const auditRows = ctx.db
      .prepare("SELECT * FROM audit_log")
      .all() as Record<string, unknown>[];
    expect(auditRows).toHaveLength(0);
  });

  it("list 返回 items(默认未归档,limit 生效)", async () => {
    const ctx = setup();
    await run(ctx, "create:note", { input: { title: "one" } });
    await run(ctx, "create:note", { input: { title: "two" } });
    await run(ctx, "create:note", { input: { title: "three" } });
    await run(ctx, "create:note", {
      input: { title: "archived", archived: true },
    });

    const list = (await run(ctx, "list:note", {
      limit: 2,
    })) as { items: unknown[]; nextCursor?: string };
    expect(list.items).toHaveLength(2);
    expect(list.nextCursor).toBeTypeOf("string");
    // 全部条目均未归档。
    for (const item of list.items) {
      expect((item as { archived: boolean }).archived).toBe(false);
    }
  });

  it("get 返回便签;未找到返回 { error: { code: not_found } }", async () => {
    const ctx = setup();
    const created = (await run(ctx, "create:note", {
      input: { title: "fetch me" },
    })) as Record<string, unknown>;

    const got = (await run(ctx, "get:note", {
      id: created.id,
    })) as Record<string, unknown>;
    expect(got.title).toBe("fetch me");

    const missing = (await run(ctx, "get:note", {
      id: "nope",
    })) as { error: { code: string } };
    expect(missing.error.code).toBe("not_found");
  });

  it("update 修改字段并替换 tags", async () => {
    const ctx = setup();
    const created = (await run(ctx, "create:note", {
      input: { title: "before", tags: ["a"] },
    })) as Record<string, unknown>;

    const updated = (await run(ctx, "update:note", {
      id: created.id,
      patch: { title: "after", tags: ["b", "c"] },
    })) as Record<string, unknown>;
    expect(updated.title).toBe("after");
    expect(updated.tags).toEqual(["b", "c"]);
  });

  it("delete 软删除后 get 不可见", async () => {
    const ctx = setup();
    const created = (await run(ctx, "create:note", {
      input: { title: "bye" },
    })) as Record<string, unknown>;

    const result = (await run(ctx, "delete:note", {
      id: created.id,
    })) as Record<string, unknown>;
    expect(result.deleted).toBe(true);

    const missing = (await run(ctx, "get:note", {
      id: created.id,
    })) as { error: { code: string } };
    expect(missing.error.code).toBe("not_found");
  });

  it("search 返回命中(标题/正文,含短 ID)", async () => {
    const ctx = setup();
    const created = (await run(ctx, "create:note", {
      input: { title: "roadmap", body: "quarterly plan" },
    })) as Record<string, unknown>;
    await run(ctx, "create:note", { input: { title: "grocery" } });

    const hits = (await run(ctx, "search:note", {
      query: "quarterly",
      limit: 10,
    })) as Array<Record<string, unknown>>;
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      resourceType: "note",
      resourceId: created.id,
      title: "roadmap",
    });
    expect(hits[0]?.shortId).toMatch(/^note-\d+$/);
  });
});
