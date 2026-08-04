/**
 * @atrium/notes shared — 便签领域类型(运行时无关)。
 * NoteRow 是 ScopedDb 行(camelCase 化后)的内部形状,用于 server 与 agent 共享;
 * noteRowToNote 把行归一化为对外 Note(0/1 → boolean,可选 tags)。
 */
import type { Note } from "./schema.js";

export interface NoteRow {
  id: string;
  profileId: string;
  seq: number;
  title: string;
  body: string;
  pinned: number;
  archived: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** 满足 ScopedDb 泛型约束 Record<string, unknown>;行可能含额外列。 */
  [key: string]: unknown;
}

/** 把 ScopedDb 返回的行转换为对外 Note 类型。 */
export function noteRowToNote(row: NoteRow, tags?: readonly string[]): Note {
  const note: Note = {
    id: row.id,
    profileId: row.profileId,
    seq: row.seq,
    title: row.title,
    body: row.body,
    pinned: row.pinned === 1,
    archived: row.archived === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
  if (tags !== undefined) {
    note.tags = [...tags];
  }
  return note;
}

/** 标题/正文是否包含查询词(不区分大小写)。 */
export function noteMatchesQuery(
  note: Pick<NoteRow, "title" | "body">,
  q: string,
): boolean {
  const lower = q.toLowerCase();
  return (
    note.title.toLowerCase().includes(lower) ||
    String(note.body ?? "").toLowerCase().includes(lower)
  );
}

/** 截断正文为搜索 snippet(≤ max 字符,保留语义不截断单词中间)。 */
export function truncate(text: string, max = 120): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max).trimEnd()}…`;
}
