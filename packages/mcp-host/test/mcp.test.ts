/**
 * @atrium/mcp-host 测试。
 * 不 spawn 进程,直接调用 server.handleMessage 验证 JSON-RPC 2.0 行为:
 * initialize、tools/list(9 个通用工具)、tools/call(含未知 resourceType)、
 * 写操作 audit(使用 :memory: core runtime)。
 */
import { describe, expect, it } from "vitest";
import type { AgentModule, AgentOperationHandler } from "@atrium/contracts";
import { createCoreRuntime, openDatabase } from "@atrium/core";
import type { CoreRuntime, SqliteDatabase } from "@atrium/core";
import { AgentService } from "../src/agent-service.js";
import { createMcpServer } from "../src/mcp-server.js";
import type { McpServer } from "../src/mcp-server.js";
import { PROTOCOL_VERSION, SERVER_VERSION } from "../src/mcp-server.js";

interface FakeNote {
  id: string;
  seq: number;
  shortId: string;
  title?: string;
  body?: string;
}

interface FakeNotesModule {
  module: AgentModule;
  notes: FakeNote[];
}

/**
 * 仅测试内使用的 fake AgentModule:
 * resource type "note",按 `${operation}:${resourceType}` 约定注册 handler。
 */
function createFakeNotesModule(): FakeNotesModule {
  const notes: FakeNote[] = [];
  let seq = 0;

  const handlers: Record<string, AgentOperationHandler> = {
    "create:note": async (ctx) => {
      const input = (ctx.args.input ?? {}) as Record<string, unknown>;
      seq += 1;
      const note: FakeNote = {
        id: `fake-${seq}`,
        seq,
        shortId: `note-${seq}`,
        ...input,
      };
      notes.push(note);
      return note;
    },
    "list:note": async (ctx) => {
      const limit = (ctx.args.limit as number | undefined) ?? 10;
      return notes.slice(0, limit);
    },
    "get:note": async (ctx) => {
      const found = notes.find((note) => note.id === ctx.args.id);
      if (!found) {
        return { error: { code: "not_found", message: "note not found" } };
      }
      return found;
    },
    "update:note": async (ctx) => {
      const found = notes.find((note) => note.id === ctx.args.id);
      if (!found) {
        return { error: { code: "not_found", message: "note not found" } };
      }
      Object.assign(found, ctx.args.patch ?? {});
      return found;
    },
    "delete:note": async (ctx) => {
      const index = notes.findIndex((note) => note.id === ctx.args.id);
      if (index < 0) {
        return { error: { code: "not_found", message: "note not found" } };
      }
      const [removed] = notes.splice(index, 1);
      return removed;
    },
    "search:note": async (ctx) => {
      const query = String(ctx.args.query ?? "");
      return notes.filter(
        (note) =>
          note.title?.includes(query) || note.body?.includes(query),
      );
    },
  };

  const module: AgentModule = {
    metadata: {
      id: "fake-notes",
      name: "Fake Notes",
      version: "0.0.1",
      capabilities: ["agent"],
    },
    resources: [
      {
        type: "note",
        label: "Note",
        operations: ["list", "get", "create", "update", "delete", "search"],
      },
    ],
    handlers,
  };

  return { module, notes };
}

interface TestContext {
  db: SqliteDatabase;
  runtime: CoreRuntime;
  notes: FakeNote[];
  server: McpServer;
}

function setup(): TestContext {
  const db = openDatabase(":memory:");
  const runtime = createCoreRuntime(db);
  const { module, notes } = createFakeNotesModule();
  const service = new AgentService({
    runtime,
    modules: [module],
    profileId: "profile-1",
  });
  const server = createMcpServer(service);
  return { db, runtime, notes, server };
}

/** 从成功响应中取出 result;若响应带 error 直接断言失败。 */
function resultOf(response: unknown): unknown {
  const record = response as {
    jsonrpc?: string;
    result?: unknown;
    error?: { code?: number; message?: string };
  };
  expect(record.jsonrpc).toBe("2.0");
  expect(record.error).toBeUndefined();
  return record.result;
}

/** 从响应中取出 JSON-RPC error。 */
function errorOf(response: unknown): { code: number; message: string } {
  const record = response as {
    jsonrpc?: string;
    result?: unknown;
    error?: { code?: number; message?: string };
  };
  expect(record.jsonrpc).toBe("2.0");
  expect(record.error).toBeDefined();
  return { code: record.error?.code ?? 0, message: record.error?.message ?? "" };
}

function callTool(
  server: McpServer,
  id: number,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return server.handleMessage(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  );
}

function callContent(response: unknown): { type: string; text: string }[] {
  const result = resultOf(response) as {
    content: { type: string; text: string }[];
  };
  expect(Array.isArray(result.content)).toBe(true);
  return result.content;
}

describe("mcp-server initialize", () => {
  it("responds with protocol version, capabilities and server info", async () => {
    const { server } = setup();
    const response = await server.handleMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {} },
      }),
    );
    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "atrium-mcp", version: SERVER_VERSION },
      },
    });
  });

  it("notifications/initialized returns null (no response)", async () => {
    const { server } = setup();
    const response = await server.handleMessage(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    );
    expect(response).toBeNull();
  });
});

describe("tools/list", () => {
  it("exposes exactly the 9 generic tools", async () => {
    const { server } = setup();
    const response = await server.handleMessage(
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    );
    const result = resultOf(response) as {
      tools: { name: string; description: string }[];
    };
    const tools = result.tools;
    expect(tools.map((tool) => tool.name)).toEqual([
      "list",
      "get",
      "create",
      "update",
      "delete",
      "search",
      "relate",
      "capture",
      "describe",
    ]);
    expect(tools).toHaveLength(9);
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
    }
  });
});

describe("tools/call", () => {
  it("create writes a fake note and list returns it", async () => {
    const { server, notes } = setup();

    const createResponse = await callTool(server, 1, "create", {
      resourceType: "note",
      input: { title: "hello", body: "world" },
    });
    const created = JSON.parse(
      callContent(createResponse)[0]?.text ?? "null",
    ) as FakeNote;
    expect(created.title).toBe("hello");
    expect(created.seq).toBe(1);
    expect(created.shortId).toBe("note-1");
    expect(typeof created.id).toBe("string");

    const listResponse = await callTool(server, 2, "list", {
      resourceType: "note",
    });
    const items = JSON.parse(
      callContent(listResponse)[0]?.text ?? "null",
    ) as FakeNote[];
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(created);
    expect(notes).toHaveLength(1);
  });

  it("unknown resourceType returns a not_found business error", async () => {
    const { server } = setup();
    const response = await callTool(server, 1, "list", {
      resourceType: "widget",
    });
    const body = JSON.parse(
      callContent(response)[0]?.text ?? "null",
    ) as { error?: { code: string; message: string } };
    expect(body.error?.code).toBe("not_found");
    expect(body.error?.message).toContain("list:widget");
  });

  it("missing required parameter returns JSON-RPC error -32602", async () => {
    const { server } = setup();
    const response = await callTool(server, 1, "list", {});
    const error = errorOf(response);
    expect(error.code).toBe(-32602);
  });

  it("unknown tool name returns JSON-RPC error -32602", async () => {
    const { server } = setup();
    const response = await callTool(server, 1, "explode", {
      resourceType: "note",
    });
    const error = errorOf(response);
    expect(error.code).toBe(-32602);
  });

  it("create records an audit entry with source=agent", async () => {
    const { db, server } = setup();
    const response = await callTool(server, 1, "create", {
      resourceType: "note",
      input: { title: "audited", secret: "hunter2" },
    });
    expect(resultOf(response)).toBeDefined();

    const rows = db
      .prepare("SELECT * FROM audit_log ORDER BY created_at")
      .all() as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.profile_id).toBe("profile-1");
    expect(rows[0]?.action).toBe("create:note");
    expect(rows[0]?.source).toBe("agent");
    expect(rows[0]?.target_resource_type).toBe("note");
    expect(typeof rows[0]?.target_resource_id).toBe("string");
    const meta = JSON.parse(rows[0]?.meta_json as string) as Record<string, unknown>;
    // 脱敏:敏感键被替换为 [redacted]
    expect(meta).toEqual({ title: "audited", secret: "[redacted]" });
  });

  it("delete records an audit entry for the write", async () => {
    const { db, server } = setup();
    await callTool(server, 1, "create", {
      resourceType: "note",
      input: { title: "temp" },
    });
    const createRows = db
      .prepare("SELECT * FROM audit_log")
      .all() as Record<string, unknown>[];
    expect(createRows).toHaveLength(1);
    const noteId = createRows[0]?.target_resource_id as string;

    await callTool(server, 2, "delete", { resourceType: "note", id: noteId });
    const rows = db
      .prepare("SELECT * FROM audit_log ORDER BY created_at")
      .all() as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[1]?.action).toBe("delete:note");
    expect(rows[1]?.source).toBe("agent");
  });

  it("describe returns the aggregated resource catalog", async () => {
    const { server } = setup();
    const response = await server.handleMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "describe", arguments: {} },
      }),
    );
    const body = JSON.parse(
      callContent(response)[0]?.text ?? "null",
    ) as { type: string; label: string; operations: string[] }[];
    expect(body).toEqual([
      {
        type: "note",
        label: "Note",
        operations: ["list", "get", "create", "update", "delete", "search"],
      },
    ]);
  });
});

describe("protocol edge cases", () => {
  it("unknown method returns JSON-RPC error -32601", async () => {
    const { server } = setup();
    const response = await server.handleMessage(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "prompts/list" }),
    );
    const error = errorOf(response);
    expect(error.code).toBe(-32601);
  });

  it("malformed json returns -32700 parse error with null id", async () => {
    const { server } = setup();
    const response = await server.handleMessage("{not json");
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700 },
    });
  });
});
