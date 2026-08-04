/**
 * 短 ID 与 UUID 契约(PRD §13.3 / AGENTS §9)。
 * - UUID v7:内部标识,客户端可生成,默认不暴露给人和 Agent;
 * - seq:服务端按部署实例 + 资源类型分配递增;
 * - 短 ID:形如 "note-142",对外面向人与 Agent。
 */

/** UUID v7 形态(客户端可生成) */
export const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ShortId {
  resourceType: string;
  seq: number;
}

/** 由资源类型前缀与 seq 组成短 ID,如 "note-142" */
export function shortIdOf(resourceType: string, seq: number): string {
  return `${resourceType}-${seq}`;
}

/**
 * 幂等键契约(PRD §15 / AGENTS §12):写操作携带客户端生成的幂等键,
 * 服务端据此去重;离线重放也依赖它。
 */
export type IdempotencyKey = string;
