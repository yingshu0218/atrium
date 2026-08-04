/**
 * reference-app 服务端入口:组装 core 运行时 + server-host + notes 模块。
 *
 * 部署配置通过环境变量注入(AGENTS §18:密钥、数据库路径不得写入应用源码):
 * - ATRIUM_DB_PATH:SQLite 文件路径(缺省 :memory:);
 * - ATRIUM_PASSWORD / ATRIUM_ADMIN_PASSWORD:登录与管理密码(仅开发缺省值,
 *   生产必须显式提供环境变量,缺省时打印警告)。
 */
import { createCoreRuntime, openDatabase, type CoreRuntime } from "@atrium/core";
import {
  createServer,
  hashPassword,
  registerModule,
} from "@atrium/server-host";
import type { ServerModule } from "@atrium/contracts";
import { notesServerModule } from "@atrium/notes/server";
import { applicationConfig } from "../config/application.js";

export interface ReferenceServerOptions {
  dbPath?: string;
  password?: string;
  adminPassword?: string;
  passwordHash?: string;
  adminPasswordHash?: string;
  /** 额外模块(默认仅 notes) */
  modules?: readonly ServerModule[];
}

export interface ReferenceServer {
  app: Awaited<ReturnType<typeof createServer>>;
  runtime: CoreRuntime;
  db: ReturnType<typeof openDatabase>;
}

const DEV_PASSWORD = "atrium-dev-password";
const DEV_ADMIN_PASSWORD = "atrium-dev-admin-password";

/** 组装但不 listen(供测试与外部调用)。 */
export async function buildReferenceServer(
  options: ReferenceServerOptions = {},
): Promise<ReferenceServer> {
  const dbPath =
    options.dbPath ?? process.env.ATRIUM_DB_PATH ?? ":memory:";

  const password =
    options.password ?? process.env.ATRIUM_PASSWORD ?? DEV_PASSWORD;
  const adminPassword =
    options.adminPassword ??
    process.env.ATRIUM_ADMIN_PASSWORD ??
    DEV_ADMIN_PASSWORD;

  if (
    !options.passwordHash &&
    !process.env.ATRIUM_PASSWORD &&
    !options.password
  ) {
    console.warn(
      "[reference-app] 使用开发默认登录密码,生产环境必须通过环境变量提供。",
    );
  }
  if (
    !options.adminPasswordHash &&
    !process.env.ATRIUM_ADMIN_PASSWORD &&
    !options.adminPassword
  ) {
    console.warn(
      "[reference-app] 使用开发默认管理员密码,生产环境必须通过环境变量提供。",
    );
  }

  const passwordHash =
    options.passwordHash ?? (await hashPassword(password));
  const adminPasswordHash =
    options.adminPasswordHash ?? (await hashPassword(adminPassword));

  const db = openDatabase(dbPath);
  const runtime = createCoreRuntime(db);

  const app = await createServer({
    runtime,
    applicationId: applicationConfig.applicationId,
    name: applicationConfig.name,
    version: applicationConfig.version,
    authMode: applicationConfig.authMode,
    passwordHash,
    adminPasswordHash,
  });

  for (const module of options.modules ?? [notesServerModule]) {
    await registerModule(app, runtime, module);
  }

  return { app, runtime, db };
}

/** 启动入口。 */
export async function startServer(): Promise<void> {
  const { app } = await buildReferenceServer();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
}

// ESM 直接运行检测:node dist/src/server.js 时启动服务。
import { pathToFileURL } from "node:url";
const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  startServer().catch((error: unknown) => {
    console.error("[reference-app] server failed to start:", error);
    process.exitCode = 1;
  });
}
