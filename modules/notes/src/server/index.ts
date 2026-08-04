/**
 * @atrium/notes server 入口 — ServerModule。
 * resources / migrations / searchProvider / captureHandler 采用声明式字段
 * (由 server-host 的 registerModule 注册到 runtime);register 只注册路由。
 */
import type { ServerModule } from "@atrium/contracts";
import type {
  CaptureHandler,
  SearchProvider,
} from "@atrium/contracts";
import { notesManifest } from "../manifest.js";
import { notesMigrations } from "../migrations/index.js";
import { noteResourceDescriptor } from "../shared/schema.js";
import {
  noteMatchesQuery,
  truncate,
  type NoteRow,
} from "../shared/note.js";
import { noteRoutes } from "./routes.js";

const NOTES_TABLE = "notes_notes";

/**
 * 搜索 provider(PRD §12.2):按注册顺序由 core 的 SearchService 聚合。
 * 说明:ScopedDb.list 的 where 只支持等值,无 LIKE;因此先取最近 100 条
 * 未归档便签,再内存过滤 q(数据量小;后续可优化为全文索引)。
 */
export const noteSearchProvider: SearchProvider = {
  resourceType: "note",
  async search(profileId, query, limit, host) {
    const page = await host.scopedDb.list<NoteRow>(NOTES_TABLE, {
      where: { archived: 0 },
      orderBy: { column: "updated_at", direction: "desc" },
      limit: 100,
    });
    const q = query.trim();
    const matched =
      q === ""
        ? [...page.items]
        : page.items.filter((row) => noteMatchesQuery(row, q));
    return matched.slice(0, limit).map((note) => ({
      resourceType: "note",
      resourceId: note.id,
      shortId: host.ids.shortId("note", note.seq),
      title: note.title,
      snippet: truncate(note.body),
    }));
  },
};

/**
 * capture 快速输入(PRD §12.2):首行为标题,其余为正文。
 * 由 core 的 CaptureService 按注册顺序调用。
 */
export const noteCaptureHandler: CaptureHandler = {
  resourceType: "note",
  async capture(profileId, input, host) {
    const lines = input.text.split("\n").map((line) => line.trimEnd());
    const title = (lines[0] ?? "").trim().slice(0, 200) || "未命名便签";
    const body = lines.slice(1).join("\n").trim().slice(0, 100000);

    const row = await host.scopedDb.create<NoteRow>(NOTES_TABLE, {
      id: host.ids.newUuid(),
      resourceType: "note",
      values: { title, body, pinned: 0, archived: 0 },
      source: "api",
    });
    await host.audit.record({
      action: "note.create",
      source: "api",
      targetResourceType: "note",
      targetResourceId: row.id,
    });
    return {
      resourceId: row.id,
      shortId: host.ids.shortId("note", row.seq),
    };
  },
};

export const notesServerModule: ServerModule = {
  metadata: notesManifest,
  resources: [noteResourceDescriptor],
  migrations: notesMigrations,
  searchProvider: noteSearchProvider,
  captureHandler: noteCaptureHandler,
  register(context) {
    for (const route of noteRoutes) {
      context.routes.register(route);
    }
  },
};
