/**
 * 数据镜像管理员 API(PRD §20.5 / AGENTS §19.4)。
 * 全部要求 admin challenge(requireAdmin);secret 永不进入响应。
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { CoreError } from "@atrium/core";
import type { CoreRuntime } from "@atrium/core";
import { ERROR_CODES } from "@atrium/contracts";
import type {
  DataMirrorEngine,
  MirrorConfigStore,
  MirrorHistory,
} from "@atrium/data-mirror";
import {
  defaultMirrorConfig,
  toPublicConfig,
} from "@atrium/data-mirror";
import type { MirrorConfig } from "@atrium/data-mirror";
import type { Session } from "./auth.js";

export interface AdminMirrorDeps {
  runtime: CoreRuntime;
  engine: DataMirrorEngine;
  configStore: MirrorConfigStore;
  history: MirrorHistory;
}

const mirrorConfigUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  repoUrl: z.string().min(1).max(2000).optional(),
  branch: z.string().min(1).max(100).optional(),
  dataDirPrefix: z.string().min(1).max(200).optional(),
  authType: z.enum(["ssh-deploy-key", "pat", "none"]).optional(),
  /** 提供时覆盖;留空保持原值(不回显) */
  sshPrivateKey: z.string().optional(),
  /** 提供时覆盖;留空保持原值(不回显) */
  pat: z.string().optional(),
  schedule: z.enum(["daily", "weekly", "manual"]).optional(),
  includeAttachments: z.boolean().optional(),
});

export function registerAdminMirrorApi(
  app: FastifyInstance,
  deps: AdminMirrorDeps,
): void {
  /** admin 校验:未登录 401,未通过 admin challenge 抛 admin_challenge_required。 */
  async function requireAdmin(request: FastifyRequest): Promise<void> {
    const session = request.session as Session | null;
    if (session === null) {
      throw new CoreError(ERROR_CODES.UNAUTHORIZED, "Authentication required");
    }
    const host = deps.runtime.hostFor(session.profileId, {
      adminVerified: session.adminVerified,
    });
    await host.requireAdmin();
  }

  app.get("/api/core/admin/data-mirror/config", async (request) => {
    await requireAdmin(request);
    const config = (await deps.configStore.get()) ?? defaultMirrorConfig();
    return { data: toPublicConfig(config) };
  });

  app.put("/api/core/admin/data-mirror/config", async (request) => {
    await requireAdmin(request);
    const parsed = mirrorConfigUpdateSchema.parse(request.body);
    const current = (await deps.configStore.get()) ?? defaultMirrorConfig();
    const next: MirrorConfig = {
      ...current,
      ...(parsed.enabled !== undefined ? { enabled: parsed.enabled } : {}),
      ...(parsed.repoUrl !== undefined ? { repoUrl: parsed.repoUrl } : {}),
      ...(parsed.branch !== undefined ? { branch: parsed.branch } : {}),
      ...(parsed.dataDirPrefix !== undefined
        ? { dataDirPrefix: parsed.dataDirPrefix }
        : {}),
      ...(parsed.authType !== undefined ? { authType: parsed.authType } : {}),
      ...(parsed.sshPrivateKey !== undefined
        ? { sshPrivateKey: parsed.sshPrivateKey }
        : {}),
      ...(parsed.pat !== undefined ? { pat: parsed.pat } : {}),
      ...(parsed.schedule !== undefined ? { schedule: parsed.schedule } : {}),
      ...(parsed.includeAttachments !== undefined
        ? { includeAttachments: parsed.includeAttachments }
        : {}),
    };
    await deps.configStore.set(next);
    return { data: toPublicConfig(next) };
  });

  app.post("/api/core/admin/data-mirror/test", async (request) => {
    await requireAdmin(request);
    return { data: await deps.engine.testConnection() };
  });

  app.post("/api/core/admin/data-mirror/run", async (request) => {
    await requireAdmin(request);
    return { data: await deps.engine.runOnce() };
  });

  app.get("/api/core/admin/data-mirror/history", async (request) => {
    await requireAdmin(request);
    return { data: { runs: deps.history.list(50) } };
  });
}
