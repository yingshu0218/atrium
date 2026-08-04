/**
 * @atrium/notes agent 入口 — AgentModule。
 * handler 键按 `${operation}:${resourceType}` 约定(mcp-host 分发,如 "create:note")。
 * 写操作记录 audit(source="agent");模块自身记录以保证不经过 AgentService
 * 直接调用时也有审计(AgentService 对 create/update/delete 也会补记一条)。
 */
import type { AgentModule, AgentOperationContext } from "@atrium/contracts";
import {
  noteInputSchema,
  noteUpdateSchema,
} from "../shared/schema.js";
import {
  noteMatchesQuery,
  noteRowToNote,
  truncate,
  type NoteRow,
} from "../shared/note.js";
import { notesManifest } from "../manifest.js";

const NOTES_TABLE = "notes_notes";

async function createNote(ctx: AgentOperationContext): Promise<unknown> {
  const input = noteInputSchema.parse(ctx.args.input);
  const host = ctx.host;
  const row = await host.scopedDb.create<NoteRow>(NOTES_TABLE, {
    id: host.ids.newUuid(),
    resourceType: "note",
    values: {
      title: input.title,
      body: input.body ?? "",
      pinned: input.pinned === true ? 1 : 0,
      archived: input.archived === true ? 1 : 0,
    },
    source: "agent",
  });
  for (const tag of input.tags ?? []) {
    await host.tags.add("note", row.id, tag);
  }
  await host.audit.record({
    action: "note.create",
    source: "agent",
    targetResourceType: "note",
    targetResourceId: row.id,
  });
  const note = noteRowToNote(
    row,
    await host.tags.listForResource("note", row.id),
  );
  return { ...note, shortId: host.ids.shortId("note", row.seq) };
}

async function listNotes(ctx: AgentOperationContext): Promise<unknown> {
  const limit =
    typeof ctx.args.limit === "number" ? ctx.args.limit : undefined;
  const cursor =
    typeof ctx.args.cursor === "string" ? ctx.args.cursor : undefined;
  const page = await ctx.host.scopedDb.list<NoteRow>(NOTES_TABLE, {
    where: { archived: 0 },
    orderBy: { column: "updated_at", direction: "desc" },
    limit: limit ?? 10,
    ...(cursor !== undefined ? { cursor } : {}),
  });
  const items = await Promise.all(
    page.items.map(async (row) => {
      const tags = await ctx.host.tags.listForResource("note", row.id);
      return noteRowToNote(row, tags);
    }),
  );
  return page.nextCursor === undefined
    ? { items }
    : { items, nextCursor: page.nextCursor };
}

async function getNote(ctx: AgentOperationContext): Promise<unknown> {
  const id = String(ctx.args.id ?? "");
  const row = await ctx.host.scopedDb.findById<NoteRow>(NOTES_TABLE, id);
  if (!row) {
    // 与 mcp-host 的约定一致:业务错误返回 { error: { code, message } }。
    return { error: { code: "not_found", message: `note "${id}" not found` } };
  }
  const tags = await ctx.host.tags.listForResource("note", id);
  return noteRowToNote(row, tags);
}

async function updateNote(ctx: AgentOperationContext): Promise<unknown> {
  const id = String(ctx.args.id ?? "");
  const body = noteUpdateSchema.parse(ctx.args.patch);
  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.body !== undefined) patch.body = body.body;
  if (body.pinned !== undefined) patch.pinned = body.pinned === true ? 1 : 0;
  if (body.archived !== undefined) {
    patch.archived = body.archived === true ? 1 : 0;
  }
  const row = await ctx.host.scopedDb.update<NoteRow>(NOTES_TABLE, id, patch);

  if (body.tags !== undefined) {
    const current = await ctx.host.tags.listForResource("note", id);
    for (const tag of current) {
      await ctx.host.tags.remove("note", id, tag);
    }
    for (const tag of body.tags) {
      await ctx.host.tags.add("note", id, tag);
    }
  }
  await ctx.host.audit.record({
    action: "note.update",
    source: "agent",
    targetResourceType: "note",
    targetResourceId: id,
  });
  const tags = await ctx.host.tags.listForResource("note", id);
  return noteRowToNote(row, tags);
}

async function deleteNote(ctx: AgentOperationContext): Promise<unknown> {
  const id = String(ctx.args.id ?? "");
  await ctx.host.scopedDb.softDelete(NOTES_TABLE, id);
  await ctx.host.audit.record({
    action: "note.delete",
    source: "agent",
    targetResourceType: "note",
    targetResourceId: id,
  });
  return { deleted: true, id };
}

async function searchNotes(ctx: AgentOperationContext): Promise<unknown> {
  const query = String(ctx.args.query ?? "");
  const limit = typeof ctx.args.limit === "number" ? ctx.args.limit : undefined;
  // 与 server 搜索一致:先取最近 100 条未归档,再内存过滤。
  const page = await ctx.host.scopedDb.list<NoteRow>(NOTES_TABLE, {
    where: { archived: 0 },
    orderBy: { column: "updated_at", direction: "desc" },
    limit: 100,
  });
  const q = query.trim();
  const matched =
    q === ""
      ? [...page.items]
      : page.items.filter((row) => noteMatchesQuery(row, q));
  return matched.slice(0, limit ?? 10).map((note) => ({
    resourceType: "note",
    resourceId: note.id,
    shortId: ctx.host.ids.shortId("note", note.seq),
    title: note.title,
    snippet: truncate(note.body),
  }));
}

export const notesAgentModule: AgentModule = {
  metadata: notesManifest,
  resources: [
    {
      type: "note",
      label: "便签",
      operations: ["list", "get", "create", "update", "delete", "search"],
    },
  ],
  handlers: {
    "create:note": createNote,
    "list:note": listNotes,
    "get:note": getNote,
    "update:note": updateNote,
    "delete:note": deleteNote,
    "search:note": searchNotes,
  },
};
