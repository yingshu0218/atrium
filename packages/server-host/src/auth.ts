/**
 * @atrium/server-host — 认证原语(AGENTS.md §13 / PRD §16)。
 *
 * - 密码只存强哈希(node:crypto scrypt),存储格式自文档化:
 *   `scrypt$N$r$p$salt$hash`(salt 与 hash 均为 base64)。
 * - 会话存储在内存 Map,支持逐设备撤销(revoke)、全局退出(revokeAll)
 *   以及 admin challenge 通过后的 adminVerified 标记。
 * - 会话 token 使用 crypto randomBytes(32) 生成。
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

/** 会话 cookie 名称。 */
export const SESSION_COOKIE_NAME = "atrium_session";

const SCRYPT_PREFIX = "scrypt$";
// OWASP 推荐 scrypt N=2^17(仅影响新哈希;旧哈希按存储参数校验)。
const SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const TOKEN_LENGTH = 32;

/** 会话默认有效期(30 天)。 */
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** adminVerified 默认有效期(15 分钟,敏感操作需周期性重新验证)。 */
const DEFAULT_ADMIN_TTL_MS = 15 * 60 * 1000;

/** 已认证会话(与 profile 绑定)。 */
export interface Session {
  token: string;
  profileId: string;
  adminVerified: boolean;
  createdAt: string;
  /** 会话过期时间(ISO-8601 UTC);过期后会话失效。 */
  expiresAt: string;
  /** adminVerified 的过期时间;null 表示未验证或已过期。 */
  adminExpiresAt: string | null;
}

export interface SessionStoreOptions {
  sessionTtlMs?: number;
  adminTtlMs?: number;
}

export interface SessionStore {
  /** 创建会话并返回会话对象。 */
  create(profileId: string): Session;
  /** 按 token 查询会话;不存在、已撤销或已过期返回 undefined;admin 过期自动降级。 */
  get(token: string): Session | undefined;
  /** 逐设备撤销:删除指定 token 的会话。 */
  revoke(token: string): void;
  /** 全局退出:撤销某个 profile 的全部会话。 */
  revokeAll(profileId: string): void;
  /** admin challenge 通过后标记会话;token 无效返回 false。 */
  markAdminVerified(token: string): boolean;
}

/**
 * 把 fastify 请求上的会话挂到 FastifyRequest.session。
 * 由 createServer 负责 decorateRequest 与 onRequest 填充。
 */
declare module "fastify" {
  interface FastifyRequest {
    session: Session | null;
  }
}

/** 生成不可预测的会话 token(randomBytes → base64url)。 */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_LENGTH).toString("base64url");
}

/** 内存会话存储。 */
export function createSessionStore(
  options: SessionStoreOptions = {},
): SessionStore {
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const adminTtlMs = options.adminTtlMs ?? DEFAULT_ADMIN_TTL_MS;
  const sessions = new Map<string, Session>();
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
      sessions.set(session.token, session);
      return session;
    },
    get(token: string): Session | undefined {
      const session = sessions.get(token);
      if (session === undefined) {
        return undefined;
      }
      if (Date.parse(session.expiresAt) <= Date.now()) {
        sessions.delete(token);
        return undefined;
      }
      // admin 验证过期后自动降级为普通会话,避免一次验证永久有效。
      if (
        session.adminVerified &&
        session.adminExpiresAt !== null &&
        Date.parse(session.adminExpiresAt) <= Date.now()
      ) {
        session.adminVerified = false;
        session.adminExpiresAt = null;
      }
      return session;
    },
    revoke(token: string): void {
      sessions.delete(token);
    },
    revokeAll(profileId: string): void {
      for (const [token, session] of sessions) {
        if (session.profileId === profileId) {
          sessions.delete(token);
        }
      }
    },
    markAdminVerified(token: string): boolean {
      const session = sessions.get(token);
      if (session === undefined) {
        return false;
      }
      session.adminVerified = true;
      session.adminExpiresAt = new Date(
        Date.now() + adminTtlMs,
      ).toISOString();
      return true;
    },
  };
}

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  // OpenSSL 默认 maxmem=32MiB;N=2^17、r=8 需要 128*N*r=128MiB,
  // 显式放宽(2 倍余量)以支持 OWASP 推荐参数。
  const maxmem = 128 * options.N * options.r * 2;
  return new Promise((resolve, reject) => {
    scryptCb(
      password,
      salt,
      keylen,
      { ...options, maxmem },
      (err, derivedKey) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

/** 计算密码哈希,格式 `scrypt$N$r$p$salt$hash`(自文档化)。 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  const parts = [
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    derivedKey.toString("base64"),
  ];
  return `${SCRYPT_PREFIX}${parts.join("$")}`;
}

/** 校验密码与存储哈希是否匹配;未知/非法格式一律返回 false。 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  if (!stored.startsWith(SCRYPT_PREFIX)) {
    return false;
  }
  const parts = stored.slice(SCRYPT_PREFIX.length).split("$");
  if (parts.length !== 5) {
    return false;
  }
  const [nStr, rStr, pStr, saltB64, hashB64] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }
  const salt = Buffer.from(saltB64 ?? "", "base64");
  const expected = Buffer.from(hashB64 ?? "", "base64");
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }
  const derivedKey = await scryptAsync(password, salt, expected.length, {
    N,
    r,
    p,
  });
  return timingSafeEqual(derivedKey, expected);
}
