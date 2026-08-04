/**
 * notes 数据镜像 exporter(PRD §20.4 / AGENTS §19.3)。
 * - 可读格式:每个便签一个 Markdown 文件(note-{seq}-{slug}.md);
 * - 结构化格式:notes.json(全部便签的稳定 JSON)。
 * 只输出自身模块与当前 profile 的命名空间;不含 secret;输出稳定可重复。
 */
import type {
  DataMirrorExporter,
  ExportContext,
  ExportedFile,
} from "@atrium/contracts";

const NOTES_TABLE = "notes_notes";
const RESOURCE_TYPE = "note";
const MAX_EXPORT_NOTES = 10_000;

interface NoteRow extends Record<string, unknown> {
  id: string;
  seq: number;
  title: string;
  body: string;
  pinned: number;
  archived: number;
  createdAt: string;
  updatedAt: string;
}

/** 从标题生成安全的文件名片段(小写、非字母数字转连字符、截断)。 */
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 60 ? slug.slice(0, 60) : slug || "untitled";
}

/** 从行数据生成可读 Markdown(字段含义由模块负责)。 */
function noteToMarkdown(
  row: NoteRow,
  shortId: string,
  tags: string[],
): string {
  const lines = [
    `# ${row.title}`,
    "",
    `- 短 ID:${shortId}`,
    `- 创建:${row.createdAt}`,
    `- 更新:${row.updatedAt}`,
    `- 置顶:${row.pinned === 1 ? "是" : "否"}`,
    `- 归档:${row.archived === 1 ? "是" : "否"}`,
    ...(tags.length > 0 ? [`- 标签:${tags.join(", ")}`] : []),
    "",
    row.body,
    "",
  ];
  return lines.join("\n");
}

export const notesMirrorExporter: DataMirrorExporter = {
  moduleId: "notes",

  async exportReadable(context: ExportContext): Promise<ExportedFile[]> {
    const page = await context.scopedDb.list<NoteRow>(NOTES_TABLE, {
      limit: MAX_EXPORT_NOTES,
      orderBy: { column: "created_at", direction: "asc" },
    });
    const files: ExportedFile[] = [];
    for (const row of page.items) {
      const shortId = context.ids.shortId(RESOURCE_TYPE, row.seq);
      const tags = await context.tags.listForResource(
        RESOURCE_TYPE,
        row.id,
      );
      files.push({
        path: `note-${row.seq}-${slugify(row.title)}.md`,
        content: noteToMarkdown(row, shortId, tags),
        format: "markdown",
      });
    }
    return files;
  },

  async exportStructured(context: ExportContext): Promise<ExportedFile[]> {
    const page = await context.scopedDb.list<NoteRow>(NOTES_TABLE, {
      limit: MAX_EXPORT_NOTES,
      orderBy: { column: "created_at", direction: "asc" },
    });
    const notes = [];
    for (const row of page.items) {
      const tags = await context.tags.listForResource(
        RESOURCE_TYPE,
        row.id,
      );
      notes.push({
        id: row.id,
        shortId: context.ids.shortId(RESOURCE_TYPE, row.seq),
        seq: row.seq,
        title: row.title,
        body: row.body,
        pinned: row.pinned === 1,
        archived: row.archived === 1,
        tags,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }
    return [
      {
        path: "notes.json",
        content: `${JSON.stringify({ notes }, null, 2)}\n`,
        format: "json",
      },
    ];
  },
};
