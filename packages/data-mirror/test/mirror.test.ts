/**
 * @atrium/data-mirror 测试。
 * 用本地裸 Git 仓库模拟远端(无需网络),覆盖:
 * - 首次推送生成完整镜像;无变化不提交;有变化再推送;
 * - exporter 路径逃逸被拒绝;secret 不进入错误消息;
 * - 远端人工提交导致分叉时停止推送;
 * - 脱敏投影;testConnection;调度器到点触发。
 */
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCoreRuntime, openDatabase } from "@atrium/core";
import type { CoreRuntime, SqliteDatabase } from "@atrium/core";
import type { ServerModule } from "@atrium/contracts";
import { notesServerModule } from "@atrium/notes/server";
import {
  DataMirrorEngine,
  MirrorConfigStore,
  MirrorHistory,
  MirrorScheduler,
  defaultMirrorConfig,
  redactRepoUrl,
  toPublicConfig,
} from "../src/index.js";
import type { MirrorConfig } from "../src/index.js";

interface Harness {
  root: string;
  remote: string;
  workDir: string;
  runtime: CoreRuntime;
  db: SqliteDatabase;
  configStore: MirrorConfigStore;
  history: MirrorHistory;
  engine: DataMirrorEngine;
}

const cleanups: string[] = [];

afterEach(() => {
  for (const dir of cleanups.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeRemote(root: string): string {
  const remote = join(root, "remote.git");
  execSync(`git init --bare -b main "${remote}"`, { stdio: "ignore" });
  return remote;
}

function setupHarness(
  modules: readonly ServerModule[] = [notesServerModule],
): Harness {
  const root = mkdtempSync(join(tmpdir(), "atrium-mirror-test-"));
  cleanups.push(root);
  const remote = makeRemote(root);
  const workDir = join(root, "work");
  const db = openDatabase(":memory:");
  const runtime = createCoreRuntime(db);
  for (const module of modules) {
    if (module.migrations !== undefined) {
      runtime.runMigrations(module.metadata.id, module.migrations);
    }
  }
  const configStore = new MirrorConfigStore(runtime.config);
  const history = new MirrorHistory(runtime.config);
  const engine = new DataMirrorEngine({
    runtime,
    modules,
    configStore,
    history,
    workDir,
  });
  return { root, remote, workDir, runtime, db, configStore, history, engine };
}

async function enableConfig(
  harness: Harness,
  overrides: Partial<MirrorConfig> = {},
): Promise<void> {
  await harness.configStore.set({
    ...defaultMirrorConfig(),
    enabled: true,
    repoUrl: harness.remote,
    branch: "main",
    ...overrides,
  });
}

async function createNote(
  runtime: CoreRuntime,
  title: string,
  body: string,
): Promise<void> {
  const host = runtime.hostFor("default");
  await host.scopedDb.create("notes_notes", {
    id: host.ids.newUuid(),
    resourceType: "note",
    values: { title, body },
  });
}

function gitLog(remote: string): string[] {
  try {
    return execSync(`git --git-dir="${remote}" log --format=%s`)
      .toString()
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
  } catch {
    // 空仓库(尚无提交)时 git log 报错,视为空历史。
    return [];
  }
}

describe("data mirror engine", () => {
  it("未启用配置时 runOnce 返回 skipped", async () => {
    const harness = setupHarness();
    const record = await harness.engine.runOnce();
    expect(record.status).toBe("skipped");
    expect(record.commitCount).toBe(0);
  });

  it("首次推送生成完整镜像(README/manifest/notes.md/notes.json)", async () => {
    const harness = setupHarness();
    await createNote(harness.runtime, "镜像测试", "第一条正文");
    await enableConfig(harness);

    const record = await harness.engine.runOnce();
    expect(record.status).toBe("success");
    expect(record.commitCount).toBe(1);

    // 克隆远端检查内容。
    const clone = join(harness.root, "clone");
    execSync(`git clone -q "${harness.remote}" "${clone}"`, {
      stdio: "ignore",
    });
    const dataRoot = join(clone, "atrium-data");
    expect(existsSync(join(dataRoot, "README.md"))).toBe(true);
    expect(existsSync(join(dataRoot, "manifest.json"))).toBe(true);
    expect(
      existsSync(join(dataRoot, "profiles", "default", "notes", "notes.json")),
    ).toBe(true);

    const notesJson = JSON.parse(
      readFileSync(
        join(dataRoot, "profiles", "default", "notes", "notes.json"),
        "utf8",
      ),
    ) as { notes: Array<{ shortId: string; title: string }> };
    expect(notesJson.notes).toHaveLength(1);
    expect(notesJson.notes[0]).toMatchObject({
      shortId: "note-1",
      title: "镜像测试",
    });
  });

  it("无数据变化时不创建 commit", async () => {
    const harness = setupHarness();
    await createNote(harness.runtime, "第一条", "正文");
    await enableConfig(harness);

    const first = await harness.engine.runOnce();
    expect(first.commitCount).toBe(1);
    const commitsAfterFirst = gitLog(harness.remote);

    const second = await harness.engine.runOnce();
    expect(second.status).toBe("success");
    expect(second.commitCount).toBe(0);
    expect(gitLog(harness.remote)).toEqual(commitsAfterFirst);
  });

  it("数据变化后再次推送创建新 commit", async () => {
    const harness = setupHarness();
    await createNote(harness.runtime, "第一条", "正文");
    await enableConfig(harness);

    await harness.engine.runOnce();
    await createNote(harness.runtime, "第二条", "更多正文");

    const record = await harness.engine.runOnce();
    expect(record.commitCount).toBe(1);
    expect(gitLog(harness.remote)).toHaveLength(2);
  });

  it("exporter 路径逃逸被拒绝并记录失败(不产生提交)", async () => {
    const evilModule: ServerModule = {
      metadata: {
        id: "evil",
        name: "Evil",
        version: "0.1.0",
        capabilities: ["data-mirror"],
      },
      register() {},
      dataMirrorExporter: {
        moduleId: "evil",
        async exportReadable() {
          return [
            {
              path: "../../escape.md",
              content: "x",
              format: "markdown",
            },
          ];
        },
        async exportStructured() {
          return [];
        },
      },
    };
    const harness = setupHarness([notesServerModule, evilModule]);
    await createNote(harness.runtime, "正常", "正文");
    await enableConfig(harness);

    const record = await harness.engine.runOnce();
    expect(record.status).toBe("failed");
    expect(record.error).toContain("逃逸");
    expect(record.commitCount).toBe(0);
    expect(gitLog(harness.remote)).toEqual([]);
  });

  it("PAT 不进入错误消息(脱敏)", async () => {
    const harness = setupHarness();
    await createNote(harness.runtime, "第一条", "正文");
    await enableConfig(harness, {
      repoUrl: "https://user:super-secret-pat@invalid.example/repo.git",
      authType: "pat",
      pat: "super-secret-pat",
    });

    const record = await harness.engine.runOnce();
    expect(record.status).toBe("failed");
    // git 自身会把 URL 中的凭证剥离,错误消息中不得出现 PAT。
    expect(record.error ?? "").not.toContain("super-secret-pat");
  });

  it("远端人工提交导致分叉时停止推送,不覆盖人工内容", async () => {
    const harness = setupHarness();
    await createNote(harness.runtime, "第一条", "正文");
    await enableConfig(harness);
    await harness.engine.runOnce();

    // 人工在远端添加提交。
    const manual = join(harness.root, "manual");
    execSync(`git clone -q "${harness.remote}" "${manual}"`, {
      stdio: "ignore",
    });
    writeFileSync(join(manual, "manual-note.txt"), "人工内容");
    execSync(
      `cd "${manual}" && git add manual-note.txt && git commit -q -m "manual: 人工提交" && git push -q origin HEAD:main`,
      { stdio: "ignore" },
    );

    // 本地也领先于镜像历史(模拟本地存在未推送提交),形成真正的分叉。
    writeFileSync(
      join(harness.workDir, "atrium-data", "local-marker.txt"),
      "local",
    );
    execSync(
      `cd "${harness.workDir}" && git add -A && git commit -q -m "local: 本地提交"`,
      { stdio: "ignore" },
    );

    const record = await harness.engine.runOnce();
    expect(record.status).toBe("failed");
    expect(record.error).toContain("分叉");

    // 远端仍保留人工提交(未被覆盖)。
    const clone = join(harness.root, "verify");
    execSync(`git clone -q "${harness.remote}" "${clone}"`, {
      stdio: "ignore",
    });
    expect(existsSync(join(clone, "manual-note.txt"))).toBe(true);
  });

  it("toPublicConfig 与 redactRepoUrl 不泄露 secret", () => {
    const config: MirrorConfig = {
      ...defaultMirrorConfig(),
      repoUrl: "https://user:token123@github.com/me/repo.git",
      authType: "pat",
      pat: "token123",
    };
    const publicView = toPublicConfig(config);
    expect(JSON.stringify(publicView)).not.toContain("token123");
    expect(publicView.repoUrlRedacted).toBe(
      "https://***@github.com/me/repo.git",
    );
    expect(redactRepoUrl("https://user:secret@example.com/x.git")).toBe(
      "https://***@example.com/x.git",
    );
  });

  it("testConnection 对不可达仓库返回失败且不抛异常", async () => {
    const harness = setupHarness();
    await enableConfig(harness, {
      repoUrl: "https://invalid.invalid/repo.git",
    });
    const result = await harness.engine.testConnection();
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });
});

describe("data mirror scheduler", () => {
  it("到点(超过周期)时触发 run,未到点不触发", async () => {
    const harness = setupHarness();
    await createNote(harness.runtime, "第一条", "正文");
    await enableConfig(harness, { schedule: "daily" });

    let runs = 0;
    let current = new Date("2026-01-01T00:00:00Z");
    const scheduler = new MirrorScheduler({
      getConfig: () => harness.configStore.get(),
      run: async () => {
        runs += 1;
      },
      now: () => current,
    });

    // 从未成功过:首次 tick 即触发。
    await scheduler.tick();
    expect(runs).toBe(1);

    // 刚刚成功过:未到周期,不触发。
    await harness.configStore.set({
      ...defaultMirrorConfig(),
      enabled: true,
      repoUrl: harness.remote,
      branch: "main",
      schedule: "daily",
      includeAttachments: false,
      lastSuccessAt: "2026-01-01T00:00:00Z",
    });
    current = new Date("2026-01-01T12:00:00Z");
    await scheduler.tick();
    expect(runs).toBe(1);

    // 超过 24 小时:触发。
    current = new Date("2026-01-02T01:00:00Z");
    await scheduler.tick();
    expect(runs).toBe(2);
  });
});
