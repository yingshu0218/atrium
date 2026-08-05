/**
 * SQLite 持久化会话存储(PRD §16 / AGENTS §13)。
 * 与 createSessionStore(内存)接口一致;会话跨服务重启保留。
 * 表结构在首次构造时自动创建;过期会话惰性清理。
 */
import type { SqliteDatabase } from "@atrium/core";
import { generateSessionToken } from "./auth.js";
import type { Session, SessionStore, SessionStoreOptions } from "./auth.js";

/** 会话默认有效期(30 天)。 */
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** adminVerified 默认有效期(15 分钟)。 */
const DEFAULT_ADMIN_TTL_MS = 15 * 60 * 1000;

interface SessionRow {
  token: string;
  profile_id: string;
  admin_verified: number;
  created_at: string;
  expires_at: string;
  admin_expires_at: string | null;
}

function toSession(row: SessionRow): Session {
  return {
    token: row.token,
    profileId: row.profile_id,
    adminVerified: row.admin_verified === 1,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    adminExpiresAt: row.admin_expires_at,
  };
}

export function createPersistentSessionStore(
  db: SqliteDatabase,
  options: SessionStoreOptions = {},
): SessionStore {
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const adminTtlMs = options.adminTtlMs ?? DEFAULT_ADMIN_TTL_MS;

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      admin_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      admin_expires_at TEXT
    )
  `);

  const insert = db.prepare(
    `INSERT INTO sessions (token, profile_id, admin_verified, created_at, expires_at, admin_expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const select = db.prepare(
    `SELECT token, profile_id, admin_verified, created_at, expires_at, admin_expires_at
     FROM sessions WHERE token = ?`,
  );
  const remove = db.prepare(`DELETE FROM sessions WHERE token = ?`);
  const removeAll = db.prepare(`DELETE FROM sessions WHERE profile_id = ?`);
  const setAdmin = db.prepare(
    `UPDATE sessions SET admin_verified = ?, admin_expires_at = ? WHERE token = ?`,
  );
  const prune = db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`);

  return {
    create(profileId: string): Session {
      const now = Date.now();
      const session: Session = {
        token: generateSessionToken(),
        profileId,
        adminVerified: false,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + sessionTtlMs).toISOString(),
        adminExpiresAt: null,
      };
      insert.run(
        session.token,
        session.profileId,
        0,
        session.createdAt,
        session.expiresAt,
        null,
      );
      return session;
    },

    get(token: string): Session | undefined {
      const row = select.get(token) as SessionRow | undefined;
      if (row === undefined) {
        return undefined;
      }
      if (Date.parse(row.expires_at) <= Date.now()) {
        remove.run(token);
        return undefined;
      }
      const session = toSession(row);
      if (
        session.adminVerified &&
        session.adminExpiresAt !== null &&
        Date.parse(session.adminExpiresAt) <= Date.now()
      ) {
        session.adminVerified = false;
        session.adminExpiresAt = null;
        setAdmin.run(0, null, token);
      }
      // 惰性清理过期会话。
      prune.run(new Date().toISOString());
      return session;
    },

    revoke(token: string): void {
      remove.run(token);
    },

    revokeAll(profileId: string): void {
      removeAll.run(profileId);
    },

    markAdminVerified(token: string): boolean {
      const row = select.get(token) as SessionRow | undefined;
      if (row === undefined) {
        return false;
      }
      const adminExpiresAt = new Date(Date.now() + adminTtlMs).toISOString();
      setAdmin.run(1, adminExpiresAt, token);
      return true;
    },
  };
}
