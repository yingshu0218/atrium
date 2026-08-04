/**
 * @atrium/notes shared — zod v4 schema 与资源描述(运行时无关)。
 * 说明:HTTP query 全部为字符串形式,因此 noteListQuerySchema 的
 * pinned/archived 用 z.enum(["true","false"]) 而非 z.boolean();
 * server-host 校验通过后,handler 内再转成 ScopedDb 等值条件。
 */
import { z } from "zod";
import type { ResourceDescriptor } from "@atrium/contracts";

/** 便签对外类型(与 PRD §12.2 字段一致;pinned/archived 归一化为 boolean)。 */
export interface Note {
  id: string;
  profileId: string;
  seq: number;
  title: string;
  body: string;
  pinned: boolean;
  archived: boolean;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** 创建便签输入(AGENTS.md §12:写操作支持幂等键)。 */
export const noteInputSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(100000).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  tags: z.array(z.string().min(1).max(50)).max(50).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type NoteInput = z.infer<typeof noteInputSchema>;

/** 更新便签输入:字段全可选,未提供即不修改。 */
export const noteUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(100000).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  tags: z.array(z.string().min(1).max(50)).max(50).optional(),
});
export type NoteUpdate = z.infer<typeof noteUpdateSchema>;

/** 列表查询(游标分页;q 为内存过滤,数据量小,后续可优化为全文索引)。 */
export const noteListQuerySchema = z.object({
  q: z.string().max(200).optional(),
  pinned: z.enum(["true", "false"]).optional(),
  archived: z.enum(["true", "false"]).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type NoteListQuery = z.infer<typeof noteListQuerySchema>;

/** 资源 id 路径参数(允许 UUID v7 或任意标识字符串)。 */
export const noteIdParamsSchema = z.object({
  id: z.string().min(1).max(200),
});

/** 跨模块关联创建输入(AGENTS.md §10)。 */
export const relationCreateSchema = z.object({
  relationType: z.string().min(1).max(100),
  targetResourceType: z.string().min(1).max(100),
  targetResourceId: z.string().min(1).max(200),
});

/** 附件元数据登记输入(内容存储由 core 负责,后续阶段实现)。 */
export const attachmentCreateSchema = z.object({
  // 文件名安全校验(AGENTS §12:上传必须校验文件名;拒绝路径分隔符与 . / ..)
  filename: z
    .string()
    .min(1)
    .max(255)
    .regex(
      /^[^/\\\u0000-\u001f]+$/,
      "文件名不能包含路径分隔符或控制字符",
    )
    .refine((value) => value !== "." && value !== "..", "非法文件名"),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().int().min(0).max(10 * 1024 * 1024 * 1024),
});

/** 便签资源描述(资源注册 / Agent describe / 通用 UI)。 */
export const noteResourceDescriptor: ResourceDescriptor = {
  type: "note",
  label: "便签",
  moduleId: "notes",
  fields: [
    { name: "title", label: "标题", type: "string", required: true },
    { name: "body", label: "正文", type: "text" },
    { name: "pinned", label: "置顶", type: "boolean" },
    { name: "archived", label: "归档", type: "boolean" },
    { name: "createdAt", label: "创建时间", type: "timestamp" },
    { name: "updatedAt", label: "更新时间", type: "timestamp" },
  ],
  agentOperations: ["list", "get", "create", "update", "delete", "search"],
};
