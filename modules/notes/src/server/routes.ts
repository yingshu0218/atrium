/**
 * @atrium/notes server — 路由与 handler(挂载在 /api/m/notes 下,path 相对)。
 * 说明:
 * - 响应 envelope({ data })由 server-host 的 FastifyRouteRegistrar 统一包装;
 *   这里只返回裸数据;
 * - body/query/params 用 zod schema 校验(server-host 校验一次,handler 内
 *   再 parse 一次作为防御,测试 harness 也直接调 handler);
 * - q 过滤与搜索一致采用内存过滤(数据量小,后续可优化为全文索引);
 * - 附件只登记元数据,内容存储由 core 管理(后续阶段实现)。
 */
import { ERROR_CODES } from "@atrium/contracts";
import type {
  HostContext,
  RouteDefinition,
  RouteRequest,
} from "@atrium/contracts";
import { CoreError } from "@atrium/core";
import {
  attachmentCreateSchema,
  noteIdParamsSchema,
  noteInputSchema,
  noteListQuerySchema,
  noteUpdateSchema,
  relationCreateSchema,
} from "../shared/schema.js";
import {
  noteMatchesQuery,
  noteRowToNote,
  type NoteRow,
} from "../shared/note.js";

const NOTES_TABLE = "notes_notes";

async function handleList(
  req: RouteRequest,
  host: HostContext,
): Promise<{ items: unknown[]; nextCursor?: string }> {
  const query = noteListQuerySchema.parse(req.query);

  // 默认只列出未归档;archived=true 时显式列出归档项。
  const where: Record<string, unknown> = { archived: 0 };
  if (query.pinned !== undefined) {
    where.pinned = query.pinned === "true" ? 1 : 0;
  }
  if (query.archived !== undefined) {
    where.archived = query.archived === "true" ? 1 : 0;
  }

  const page = await host.scopedDb.list<NoteRow>(NOTES_TABLE, {
    where,
    orderBy: { column: "updated_at", direction: "desc" },
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
    ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
  });

  const q = query.q?.trim() ?? "";
  const rows =
    q === ""
      ? [...page.items]
      : page.items.filter((row) => noteMatchesQuery(row, q));

  const items = await Promise.all(
    rows.map(async (row) => {
      const tags = await host.tags.listForResource("note", row.id);
      return noteRowToNote(row, tags);
    }),
  );
  // 说明:q 过滤在分页之后进行,游标可能越过被过滤项;数据量小可接受。
  return page.nextCursor === undefined
    ? { items }
    : { items, nextCursor: page.nextCursor };
}

async function handleCreate(
  req: RouteRequest,
  host: HostContext,
): Promise<unknown> {
  const body = noteInputSchema.parse(req.body);
  const row = await host.scopedDb.create<NoteRow>(NOTES_TABLE, {
    id: host.ids.newUuid(),
    resourceType: "note",
    values: {
      title: body.title,
      body: body.body ?? "",
      pinned: body.pinned === true ? 1 : 0,
      archived: body.archived === true ? 1 : 0,
    },
    ...(body.idempotencyKey !== undefined
      ? { idempotencyKey: body.idempotencyKey }
      : {}),
    source: "api",
  });

  for (const tag of body.tags ?? []) {
    await host.tags.add("note", row.id, tag);
  }
  await host.audit.record({
    action: "note.create",
    source: "api",
    targetResourceType: "note",
    targetResourceId: row.id,
  });

  // 返回与 DB 一致(排序)的 tags,而非输入顺序。
  const tags = await host.tags.listForResource("note", row.id);
  const note = noteRowToNote(row, tags);
  // 对外提供短 ID(内部 UUID 不暴露给人与 Agent,AGENTS.md §9)。
  return { ...note, shortId: host.ids.shortId("note", row.seq) };
}

async function handleGet(req: RouteRequest, host: HostContext): Promise<unknown> {
  const { id } = noteIdParamsSchema.parse(req.params);
  const row = await host.scopedDb.findById<NoteRow>(NOTES_TABLE, id);
  if (!row) {
    throw new CoreError(ERROR_CODES.NOT_FOUND, `note "${id}" not found`);
  }
  const tags = await host.tags.listForResource("note", id);
  return noteRowToNote(row, tags);
}

async function handleUpdate(
  req: RouteRequest,
  host: HostContext,
): Promise<unknown> {
  const { id } = noteIdParamsSchema.parse(req.params);
  const body = noteUpdateSchema.parse(req.body);

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.body !== undefined) patch.body = body.body;
  if (body.pinned !== undefined) patch.pinned = body.pinned === true ? 1 : 0;
  if (body.archived !== undefined) {
    patch.archived = body.archived === true ? 1 : 0;
  }
  // update 未命中时 ScopedDb 抛 notFound。
  const row = await host.scopedDb.update<NoteRow>(NOTES_TABLE, id, patch);

  if (body.tags !== undefined) {
    const current = await host.tags.listForResource("note", id);
    for (const tag of current) {
      await host.tags.remove("note", id, tag);
    }
    for (const tag of body.tags) {
      await host.tags.add("note", id, tag);
    }
  }
  await host.audit.record({
    action: "note.update",
    source: "api",
    targetResourceType: "note",
    targetResourceId: id,
  });

  const tags = await host.tags.listForResource("note", id);
  return noteRowToNote(row, tags);
}

async function handleDelete(
  req: RouteRequest,
  host: HostContext,
): Promise<unknown> {
  const { id } = noteIdParamsSchema.parse(req.params);
  await host.scopedDb.softDelete(NOTES_TABLE, id);
  await host.audit.record({
    action: "note.delete",
    source: "api",
    targetResourceType: "note",
    targetResourceId: id,
  });
  return { deleted: true };
}

async function handleListRelations(
  req: RouteRequest,
  host: HostContext,
): Promise<unknown> {
  const { id } = noteIdParamsSchema.parse(req.params);
  return host.relations.listBySource("note", id);
}

async function handleCreateRelation(
  req: RouteRequest,
  host: HostContext,
): Promise<unknown> {
  const { id } = noteIdParamsSchema.parse(req.params);
  const body = relationCreateSchema.parse(req.body);
  await host.relations.create({
    relationType: body.relationType,
    sourceResourceType: "note",
    sourceResourceId: id,
    targetResourceType: body.targetResourceType,
    targetResourceId: body.targetResourceId,
  });
  await host.audit.record({
    action: "note.relation.create",
    source: "api",
    targetResourceType: "note",
    targetResourceId: id,
  });
  // RelationService.create 不返回记录;回显创建入参作为确认。
  return {
    created: true,
    relationType: body.relationType,
    targetResourceType: body.targetResourceType,
    targetResourceId: body.targetResourceId,
  };
}

async function handleListAttachments(
  req: RouteRequest,
  host: HostContext,
): Promise<unknown> {
  const { id } = noteIdParamsSchema.parse(req.params);
  return host.attachments.listForResource("note", id);
}

async function handleCreateAttachment(
  req: RouteRequest,
  host: HostContext,
): Promise<unknown> {
  const { id } = noteIdParamsSchema.parse(req.params);
  const body = attachmentCreateSchema.parse(req.body);
  // 简化:只登记元数据,不写文件;storageKey 预留路径,内容存储后续阶段实现。
  const record = await host.attachments.create({
    resourceType: "note",
    resourceId: id,
    filename: body.filename,
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes,
    storageKey: `notes/${id}/${body.filename}`,
  });
  await host.audit.record({
    action: "note.attachment.create",
    source: "api",
    targetResourceType: "note",
    targetResourceId: id,
  });
  return record;
}

/** 模块路由定义(相对 /api/m/notes)。 */
export const noteRoutes: readonly RouteDefinition[] = [
  {
    method: "GET",
    path: "/",
    schema: { query: noteListQuerySchema },
    handler: handleList,
  },
  {
    method: "POST",
    path: "/",
    schema: { body: noteInputSchema },
    handler: handleCreate,
  },
  {
    method: "GET",
    path: "/:id",
    schema: { params: noteIdParamsSchema },
    handler: handleGet,
  },
  {
    method: "PUT",
    path: "/:id",
    schema: { params: noteIdParamsSchema, body: noteUpdateSchema },
    handler: handleUpdate,
  },
  {
    method: "DELETE",
    path: "/:id",
    schema: { params: noteIdParamsSchema },
    handler: handleDelete,
  },
  {
    method: "GET",
    path: "/:id/relations",
    schema: { params: noteIdParamsSchema },
    handler: handleListRelations,
  },
  {
    method: "POST",
    path: "/:id/relations",
    schema: { params: noteIdParamsSchema, body: relationCreateSchema },
    handler: handleCreateRelation,
  },
  {
    method: "GET",
    path: "/:id/attachments",
    schema: { params: noteIdParamsSchema },
    handler: handleListAttachments,
  },
  {
    method: "POST",
    path: "/:id/attachments",
    schema: { params: noteIdParamsSchema, body: attachmentCreateSchema },
    handler: handleCreateAttachment,
  },
];
