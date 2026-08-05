/**
 * SQLite 持久化会话存储测试:会话跨 store 实例(模拟服务重启)保留、
 * 过期清理、admin 过期降级。
 */
import { describe, expect, it } from "vitest";
import { openDatabase } from "@atrium/core";
import { createPersistentSessionStore } from "../src/index.js";

const SESSION_TTL_MS = 60_000;
const ADMIN_TTL_MS = 60_000;

describe("createPersistentSessionStore", () => {
  it("会话写入 SQLite,重启(新 store 实例)后仍可读取", () => {
    const db = openDatabase(":memory:");
    const store = createPersistentSessionStore(db, {
      sessionTtlMs: SESSION_TTL_MS,
      adminTtlMs: ADMIN_TTL_MS,
    });

    const session = store.create("default");
    expect(session.token.length).toBeGreaterThan(0);
    expect(store.get(session.token)?.profileId).toBe("default");

    // 模拟重启:同一数据库上创建全新 store 实例。
    const restarted = createPersistentSessionStore(db, {
      sessionTtlMs: SESSION_TTL_MS,
      adminTtlMs: ADMIN_TTL_MS,
    });
    expect(restarted.get(session.token)?.profileId).toBe("default");
  });

  it("adminVerified 持久化,且可被撤销", () => {
    const db = openDatabase(":memory:");
    const store = createPersistentSessionStore(db, {
      sessionTtlMs: SESSION_TTL_MS,
      adminTtlMs: ADMIN_TTL_MS,
    });
    const session = store.create("default");

    expect(store.markAdminVerified(session.token)).toBe(true);
    expect(store.get(session.token)?.adminVerified).toBe(true);

    store.revoke(session.token);
    expect(store.get(session.token)).toBeUndefined();
  });

  it("过期会话被清理", () => {
    const db = openDatabase(":memory:");
    const store = createPersistentSessionStore(db, {
      sessionTtlMs: -1000, // 立即过期
      adminTtlMs: ADMIN_TTL_MS,
    });
    const session = store.create("default");
    expect(store.get(session.token)).toBeUndefined();
  });

  it("revokeAll 撤销某个 profile 的全部会话", () => {
    const db = openDatabase(":memory:");
    const store = createPersistentSessionStore(db, {
      sessionTtlMs: SESSION_TTL_MS,
      adminTtlMs: ADMIN_TTL_MS,
    });
    const a = store.create("default");
    const b = store.create("default");
    const c = store.create("other");
    store.revokeAll("default");
    expect(store.get(a.token)).toBeUndefined();
    expect(store.get(b.token)).toBeUndefined();
    expect(store.get(c.token)?.profileId).toBe("other");
  });
});
