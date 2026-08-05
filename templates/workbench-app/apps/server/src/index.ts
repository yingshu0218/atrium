/**
 * 服务端入口:core 运行时 + server-host + 已安装模块 + 数据镜像。
 * 部署配置全部来自环境变量(见根目录 .env.example)。
 */
import { join } from "node:path";
import { createCoreRuntime, openDatabase } from "@atrium/core";
import { createServer, hashPassword, registerModule } from "@atrium/server-host";
import { DataMirrorEngine, MirrorConfigStore, MirrorHistory } from "@atrium/data-mirror";
import { notesServerModule } from "@atrium/notes/server";
import { applicationConfig } from "../../config/application.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`缺少环境变量 ${name}(见 .env.example)`);
  }
  return value;
}

async function main(): Promise<void> {
  const dbPath = process.env.ATRIUM_DB_PATH ?? ":memory:";
  const db = openDatabase(dbPath);
  const runtime = createCoreRuntime(db);

  // 已安装模块(应用组合边界;新增模块在此追加)。
  const modules = [notesServerModule];

  // 数据镜像(Server-only;AGENTS §19)。
  const mirrorConfigStore = new MirrorConfigStore(runtime.config);
  const mirrorHistory = new MirrorHistory(runtime.config);
  const mirrorEngine = new DataMirrorEngine({
    runtime,
    modules,
    configStore: mirrorConfigStore,
    history: mirrorHistory,
    workDir:
      process.env.ATRIUM_MIRROR_WORKDIR ?? join(process.cwd(), ".data-mirror"),
  });

  const app = await createServer({
    runtime,
    applicationId: applicationConfig.applicationId,
    name: applicationConfig.name,
    version: applicationConfig.version,
    authMode: applicationConfig.authMode,
    passwordHash: await hashPassword(requiredEnv("ATRIUM_PASSWORD")),
    adminPasswordHash: await hashPassword(requiredEnv("ATRIUM_ADMIN_PASSWORD")),
    cookieSecure: process.env.ATRIUM_COOKIE_SECURE === "true",
    adminMirror: { runtime, engine: mirrorEngine, configStore: mirrorConfigStore, history: mirrorHistory },
  });

  for (const module of modules) {
    await registerModule(app, runtime, module);
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`[workbench] listening on :${port}`);
}

main().catch((error: unknown) => {
  console.error("[workbench] server failed:", error);
  process.exitCode = 1;
});
