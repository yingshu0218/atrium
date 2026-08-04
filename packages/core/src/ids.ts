/**
 * ID 服务(PRD §13.3 / AGENTS.md §9)。
 * - UUID v7(RFC 9562):48 位 unix 毫秒时间戳 + 版本位 7 + 变体位 8/9/a/b + 随机数;
 * - seq:按部署实例 + 资源类型递增(单写者事务内使用);
 * - 短 ID:由 resourceType 前缀与 seq 组成,如 "note-142"。
 */
import { randomBytes } from "node:crypto";
import { ERROR_CODES, shortIdOf } from "@atrium/contracts";
import type { IdService } from "@atrium/contracts";
import { CoreError } from "./errors.js";
import type { SqliteDatabase } from "./sqlite.js";

/** 生成 RFC 9562 UUID v7(小写 hex,含连字符)。 */
export function uuidV7(): string {
  const bytes = new Uint8Array(16);
  // 后 10 字节用随机数填充(版本/变体位随后覆盖)。
  bytes.set(randomBytes(10), 6);

  const now = BigInt(Date.now());
  bytes[5] = Number(now & 0xffn);
  bytes[4] = Number((now >> 8n) & 0xffn);
  bytes[3] = Number((now >> 16n) & 0xffn);
  bytes[2] = Number((now >> 24n) & 0xffn);
  bytes[1] = Number((now >> 32n) & 0xffn);
  bytes[0] = Number((now >> 40n) & 0xffn);

  // 版本位(高 4 位 = 0111)。
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  // 变体位(高 2 位 = 10,即 8/9/a/b)。
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class IdServiceImpl implements IdService {
  constructor(private readonly db: SqliteDatabase) {}

  newUuid(): string {
    return uuidV7();
  }

  /**
   * 按部署实例 + 资源类型分配递增 seq。
   * 使用 UPSERT + RETURNING 保持单语句原子性;必须用于单写者事务内
   * (AGENTS.md §9 / §20)。
   */
  nextSeq(resourceType: string): number {
    const row = this.db
      .prepare(
        `INSERT INTO "id_counters" ("resource_type", "seq")
         VALUES (?, 1)
         ON CONFLICT("resource_type") DO UPDATE SET "seq" = "seq" + 1
         RETURNING "seq"`,
      )
      .get(resourceType) as { seq: number } | undefined;
    if (!row) {
      throw new CoreError(
        ERROR_CODES.INTERNAL,
        `failed to allocate sequence for resource type "${resourceType}"`,
      );
    }
    return row.seq;
  }

  shortId(resourceType: string, seq: number): string {
    return shortIdOf(resourceType, seq);
  }
}
