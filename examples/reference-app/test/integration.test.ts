/**
 * reference-app 端到端集成测试(AGENTS §22:reference app 端到端流程)。
 * 真实组装 server-host + core(:memory: SQLite)+ notes 模块,覆盖:
 * 登录 → notes CRUD → 搜索 → 详情 → 软删除 → capture → Agent 链路。
 */
import { afterEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CoreRuntime } from "@atrium/core";
import { AgentService } from "@atrium/mcp-host";
import { notesAgentModule } from "@atrium/notes/agent";
import { buildReferenceServer } from "../src/server.js";

const SAME_ORIGIN = { host: "localhost", origin: "http://localhost" };

type ReferenceApp = Awaited<ReturnType<typeof buildReferenceServer>>;

interface TestContext {
  app: ReferenceApp["app"];
  runtime: CoreRuntime;
  db: ReferenceApp["db"];
}

describe("reference app 端到端", () => {
  let ctx: TestContext | undefined;
  const tempDirs: string[] = [];

  afterEach(async () => {
    await ctx?.app.close();
    ctx = undefined;
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  async function setup(): Promise<TestContext> {
    const mirrorWorkDir = mkdtempSync(join(tmpdir(), "atrium-ref-mirror-"));
    tempDirs.push(mirrorWorkDir);
    const server = await buildReferenceServer({ mirrorWorkDir });
    ctx = server;
    return server;
  }

  async function login(app: ReferenceApp["app"]): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/api/core/auth/login",
      headers: SAME_ORIGIN,
      payload: { password: "atrium-dev-password" },
    });
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers["set-cookie"];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookie).toBeTruthy();
    return String(cookie).split(";")[0] as string;
  }

  it("health / version 可用", async () => {
    const { app } = await setup();
    const health = await app.inject({ method: "GET", url: "/api/core/health" });
    expect(health.json()).toMatchObject({ data: { status: "ok" } });
    const version = await app.inject({ method: "GET", url: "/api/core/version" });
    expect(version.json().data).toMatchObject({
      applicationId: "reference-app",
    });
  });

  it("未登录访问模块 API 返回 unauthorized", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/api/m/notes" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("unauthorized");
  });

  it("登录后完成 notes 全链路:创建→列表→搜索→详情→更新→软删除", async () => {
    const { app } = await setup();
    const cookie = await login(app);

    const create = await app.inject({
      method: "POST",
      url: "/api/m/notes",
      headers: { ...SAME_ORIGIN, cookie },
      payload: { title: "atrium 设计笔记", body: "四层模型与可读数据镜像", tags: ["atrium", "design"] },
    });
    expect(create.statusCode).toBe(200);
    const created = create.json().data;
    expect(created.title).toBe("atrium 设计笔记");
    expect(created.profileId).toBe("default");
    expect(created.seq).toBeGreaterThan(0);
    expect(created.shortId).toMatch(/^note-\d+$/);
    expect(created.tags).toEqual(["atrium", "design"]);
    const noteId = created.id as string;

    const list = await app.inject({
      method: "GET",
      url: "/api/m/notes",
      headers: { cookie },
    });
    expect(list.json().data.items).toHaveLength(1);

    const search = await app.inject({
      method: "GET",
      url: "/api/m/notes?q=数据镜像",
      headers: { cookie },
    });
    expect(search.json().data.items.map((n: { id: string }) => n.id)).toContain(noteId);

    const get = await app.inject({
      method: "GET",
      url: `/api/m/notes/${noteId}`,
      headers: { cookie },
    });
    expect(get.json().data.id).toBe(noteId);

    const update = await app.inject({
      method: "PUT",
      url: `/api/m/notes/${noteId}`,
      headers: { ...SAME_ORIGIN, cookie },
      payload: { title: "更新后的标题", pinned: true },
    });
    expect(update.json().data.title).toBe("更新后的标题");
    expect(update.json().data.pinned).toBe(true);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/m/notes/${noteId}`,
      headers: { ...SAME_ORIGIN, cookie },
    });
    expect(del.json()).toEqual({ data: { deleted: true } });

    const afterDelete = await app.inject({
      method: "GET",
      url: `/api/m/notes/${noteId}`,
      headers: { cookie },
    });
    expect(afterDelete.statusCode).toBe(404);
  });

  it("capture 快速输入创建便签", async () => {
    const { runtime } = await setup();
    const result = await runtime.capture.capture("default", {
      text: "快速记录标题\n第一行正文",
    });
    expect(result.resourceType).toBe("note");
    expect(result.shortId).toMatch(/^note-\d+$/);

    const note = await runtime.scopedDbFor("default").findById(
      "notes_notes",
      result.resourceId,
    );
    expect(note?.title).toBe("快速记录标题");
  });

  it("Agent 通道(notes 资源)可 describe / create / list / delete", async () => {
    const { runtime } = await setup();
    const agent = new AgentService({
      runtime,
      modules: [notesAgentModule],
      profileId: "default",
    });

    const describe = await agent.describe();
    expect(describe.some((r) => r.type === "note")).toBe(true);

    const created = await agent.create({
      resourceType: "note",
      input: { title: "agent 创建的便签", body: "来自 Agent" },
    });
    const noteId = (created as { id: string }).id;

    const list = await agent.list({ resourceType: "note" });
    expect((list as { items: unknown[] }).items).toHaveLength(1);

    const deleted = await agent.delete({ resourceType: "note", id: noteId });
    expect(deleted).toMatchObject({ deleted: true });

    const listAfter = await agent.list({ resourceType: "note" });
    expect((listAfter as { items: unknown[] }).items).toHaveLength(0);
  });

  it("audit log 记录模块写操作", async () => {
    const { app, db } = await setup();
    const cookie = await login(app);
    await app.inject({
      method: "POST",
      url: "/api/m/notes",
      headers: { ...SAME_ORIGIN, cookie },
      payload: { title: "审计验证", body: "body" },
    });
    const rows = db
      .prepare(
        "SELECT action, source FROM audit_log WHERE action = 'note.create'",
      )
      .all() as Array<{ action: string; source: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.source).toBe("api");
  });

  it("admin challenge 验证通过后标记 verified", async () => {
    const { app } = await setup();
    const cookie = await login(app);
    const challenge = await app.inject({
      method: "POST",
      url: "/api/core/auth/admin-challenge",
      headers: { ...SAME_ORIGIN, cookie },
      payload: { password: "atrium-dev-admin-password" },
    });
    expect(challenge.json()).toEqual({ data: { verified: true } });
  });

  it("数据镜像:管理员配置 → 创建便签 → 推送 → 远端可读", async () => {
    const { app } = await setup();
    // 本地裸仓库模拟远端。
    const root = mkdtempSync(join(tmpdir(), "atrium-ref-remote-"));
    tempDirs.push(root);
    const remote = join(root, "remote.git");
    execSync(`git init --bare -b main "${remote}"`, { stdio: "ignore" });

    const cookie = await login(app);
    await app.inject({
      method: "POST",
      url: "/api/core/auth/admin-challenge",
      headers: { ...SAME_ORIGIN, cookie },
      payload: { password: "atrium-dev-admin-password" },
    });

    const put = await app.inject({
      method: "PUT",
      url: "/api/core/admin/data-mirror/config",
      headers: { ...SAME_ORIGIN, cookie },
      payload: {
        enabled: true,
        repoUrl: remote,
        branch: "main",
        authType: "none",
        schedule: "manual",
      },
    });
    expect(put.statusCode).toBe(200);

    // 创建一条便签(经模块 API)。
    await app.inject({
      method: "POST",
      url: "/api/m/notes",
      headers: { ...SAME_ORIGIN, cookie },
      payload: { title: "镜像里的便签", body: "应该出现在远端" },
    });

    const run = await app.inject({
      method: "POST",
      url: "/api/core/admin/data-mirror/run",
      headers: { ...SAME_ORIGIN, cookie },
      payload: {},
    });
    expect(run.statusCode).toBe(200);
    expect(run.json().data.status).toBe("success");
    expect(run.json().data.commitCount).toBe(1);

    // 克隆远端验证镜像内容。
    const clone = join(root, "clone");
    execSync(`git clone -q "${remote}" "${clone}"`, { stdio: "ignore" });
    const notesJson = join(
      clone,
      "atrium-data",
      "profiles",
      "default",
      "notes",
      "notes.json",
    );
    expect(existsSync(notesJson)).toBe(true);
    const parsed = JSON.parse(readFileSync(notesJson, "utf8")) as {
      notes: Array<{ title: string }>;
    };
    expect(parsed.notes[0]?.title).toBe("镜像里的便签");

    // 再次推送:无变化,不产生新提交。
    const runAgain = await app.inject({
      method: "POST",
      url: "/api/core/admin/data-mirror/run",
      headers: { ...SAME_ORIGIN, cookie },
      payload: {},
    });
    expect(runAgain.json().data.commitCount).toBe(0);
  });
});
