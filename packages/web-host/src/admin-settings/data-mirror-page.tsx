/**
 * 数据镜像管理员设置页(PRD §20.5 / AGENTS §19.4)。
 * - 仅服务端提供能力;Web 只提供 Admin-only 配置 UI;
 * - 未通过 admin challenge 时要求管理员密码验证(周期性重新验证由服务端强制);
 * - secret(SSH key / PAT)留空表示不修改,保存后不回显。
 */
import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from "react";
import { Button, Card, Input, Textarea } from "@atrium/ui";
import { ApiError } from "../api-client.js";

interface MirrorConfigPublic {
  enabled: boolean;
  repoUrlRedacted: string;
  branch: string;
  dataDirPrefix?: string;
  authType: "ssh-deploy-key" | "pat" | "none";
  schedule: "daily" | "weekly" | "manual";
  includeAttachments: boolean;
  lastSuccessAt?: string;
  lastError?: string;
}

interface MirrorRunEntry {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: "success" | "failed" | "skipped";
  commitCount: number;
  error?: string;
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = (await res.json().catch(() => null)) as
    | { data: T }
    | { error: { code: string; message: string } }
    | null;
  if (body === null) {
    throw new ApiError("http_error", `HTTP ${res.status}`);
  }
  if ("error" in body) {
    throw new ApiError(body.error.code, body.error.message);
  }
  return body.data;
}

export function DataMirrorSettingsPage(): ReactElement {
  const [config, setConfig] = useState<MirrorConfigPublic | null>(null);
  const [needAdmin, setNeedAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [form, setForm] = useState({
    repoUrl: "",
    branch: "main",
    dataDirPrefix: "",
    authType: "none" as MirrorConfigPublic["authType"],
    schedule: "manual" as MirrorConfigPublic["schedule"],
    enabled: false,
    includeAttachments: false,
    pat: "",
    sshPrivateKey: "",
  });
  const [history, setHistory] = useState<MirrorRunEntry[]>([]);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const data = await adminFetch<MirrorConfigPublic>(
        "/api/core/admin/data-mirror/config",
      );
      setConfig(data);
      setNeedAdmin(false);
      setForm({
        repoUrl: data.repoUrlRedacted === "" ? "" : data.repoUrlRedacted,
        branch: data.branch,
        dataDirPrefix: data.dataDirPrefix ?? "",
        authType: data.authType,
        schedule: data.schedule,
        enabled: data.enabled,
        includeAttachments: data.includeAttachments,
        pat: "",
        sshPrivateKey: "",
      });
      const runs = await adminFetch<{ runs: MirrorRunEntry[] }>(
        "/api/core/admin/data-mirror/history",
      );
      setHistory(runs.runs);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "admin_challenge_required") {
        setNeedAdmin(true);
        return;
      }
      setMessage({
        kind: "error",
        text: cause instanceof Error ? cause.message : "加载配置失败",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submitAdmin = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/core/auth/admin-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      const body = (await res.json()) as
        | { data: { verified: boolean } }
        | { error: { message: string } };
      if ("error" in body) {
        throw new Error(body.error.message);
      }
      setAdminPassword("");
      await load();
    } catch (cause) {
      setMessage({
        kind: "error",
        text: cause instanceof Error ? cause.message : "管理员验证失败",
      });
    } finally {
      setBusy(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        enabled: form.enabled,
        repoUrl: form.repoUrl,
        branch: form.branch,
        authType: form.authType,
        schedule: form.schedule,
        includeAttachments: form.includeAttachments,
      };
      if (form.dataDirPrefix !== "") {
        payload.dataDirPrefix = form.dataDirPrefix;
      }
      // secret 留空表示不修改(不回显)。
      if (form.pat !== "") {
        payload.pat = form.pat;
      }
      if (form.sshPrivateKey !== "") {
        payload.sshPrivateKey = form.sshPrivateKey;
      }
      const data = await adminFetch<MirrorConfigPublic>(
        "/api/core/admin/data-mirror/config",
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      );
      setConfig(data);
      setForm((prev) => ({ ...prev, pat: "", sshPrivateKey: "" }));
      setMessage({ kind: "ok", text: "配置已保存" });
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "admin_challenge_required") {
        setNeedAdmin(true);
        return;
      }
      setMessage({
        kind: "error",
        text: cause instanceof Error ? cause.message : "保存失败",
      });
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (action: "test" | "run"): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const data = await adminFetch<{ ok?: boolean; message?: string; status?: string; commitCount?: number; error?: string }>(
        `/api/core/admin/data-mirror/${action}`,
        { method: "POST", body: "{}" },
      );
      if (action === "test") {
        setMessage({
          kind: data.ok === true ? "ok" : "error",
          text:
            data.ok === true
              ? "连接成功"
              : (data.message ?? "连接失败"),
        });
      } else {
        setMessage({
          kind: data.status === "success" ? "ok" : "error",
          text:
            data.status === "success"
              ? `推送完成,提交数 ${data.commitCount ?? 0}`
              : (data.error ?? `执行结果:${data.status ?? "unknown"}`),
        });
      }
      const runs = await adminFetch<{ runs: MirrorRunEntry[] }>(
        "/api/core/admin/data-mirror/history",
      );
      setHistory(runs.runs);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "admin_challenge_required") {
        setNeedAdmin(true);
        return;
      }
      setMessage({
        kind: "error",
        text: cause instanceof Error ? cause.message : "操作失败",
      });
    } finally {
      setBusy(false);
    }
  };

  if (needAdmin) {
    return (
      <div className="p-6">
        <Card title="管理员验证">
          <p className="text-sm text-[var(--atrium-mutedForeground)]">
            数据镜像配置属于敏感操作,需要管理员密码验证。
          </p>
          <form className="mt-4 flex max-w-sm flex-col gap-3" onSubmit={submitAdmin}>
            <Input
              label="管理员密码"
              type="password"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              required
            />
            <Button variant="primary" disabled={busy}>
              {busy ? "验证中…" : "验证"}
            </Button>
          </form>
          {message !== null ? (
            <p role="alert" className="mt-3 text-sm text-[var(--atrium-destructive)]">
              {message.text}
            </p>
          ) : null}
        </Card>
      </div>
    );
  }

  if (config === null) {
    return (
      <div className="p-6">
        <Card title="数据镜像">
          <p className="text-sm text-[var(--atrium-mutedForeground)]">加载中…</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Card
        title="数据镜像"
        actions={
          <span className="text-xs text-[var(--atrium-mutedForeground)]">
            最近成功:{config.lastSuccessAt ?? "从未"}
          </span>
        }
      >
        <form className="flex max-w-xl flex-col gap-3" onSubmit={save}>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, enabled: event.target.checked }))
              }
            />
            启用数据镜像(仅服务端执行 Git 操作)
          </label>
          <Input
            label="远程仓库地址(私有)"
            value={form.repoUrl}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, repoUrl: event.target.value }))
            }
            placeholder="git@github.com:me/repo.git 或 https://…"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="分支"
              value={form.branch}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, branch: event.target.value }))
              }
            />
            <Input
              label="镜像目录前缀(可选)"
              value={form.dataDirPrefix}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  dataDirPrefix: event.target.value,
                }))
              }
              placeholder="atrium-data"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              认证方式
              <select
                className="rounded-[var(--atrium-radiusMd)] border border-[var(--atrium-border)] bg-transparent px-2 py-1.5"
                value={form.authType}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    authType: event.target.value as MirrorConfigPublic["authType"],
                  }))
                }
              >
                <option value="none">无</option>
                <option value="ssh-deploy-key">SSH Deploy Key</option>
                <option value="pat">Personal Access Token</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              调度
              <select
                className="rounded-[var(--atrium-radiusMd)] border border-[var(--atrium-border)] bg-transparent px-2 py-1.5"
                value={form.schedule}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    schedule: event.target.value as MirrorConfigPublic["schedule"],
                  }))
                }
              >
                <option value="manual">手动</option>
                <option value="daily">每日</option>
                <option value="weekly">每周</option>
              </select>
            </label>
          </div>
          {form.authType === "pat" ? (
            <Input
              label="Personal Access Token(留空不修改)"
              type="password"
              value={form.pat}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, pat: event.target.value }))
              }
            />
          ) : null}
          {form.authType === "ssh-deploy-key" ? (
            <Textarea
              label="SSH 私钥(留空不修改)"
              value={form.sshPrivateKey}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, sshPrivateKey: event.target.value }))
              }
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----…"
            />
          ) : null}
          <div className="flex items-center gap-2">
            <Button variant="primary" disabled={busy}>
              {busy ? "处理中…" : "保存配置"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void runAction("test")}
            >
              测试连接
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void runAction("run")}
            >
              立即推送
            </Button>
          </div>
        </form>
        {config.lastError !== undefined ? (
          <p role="alert" className="mt-3 text-sm text-[var(--atrium-destructive)]">
            上次错误:{config.lastError}
          </p>
        ) : null}
        {message !== null ? (
          <p
            role="status"
            className={`mt-3 text-sm ${
              message.kind === "ok"
                ? "text-[var(--atrium-primary)]"
                : "text-[var(--atrium-destructive)]"
            }`}
          >
            {message.text}
          </p>
        ) : null}
      </Card>

      <Card title="执行历史" className="mt-4">
        {history.length === 0 ? (
          <p className="text-sm text-[var(--atrium-mutedForeground)]">
            暂无执行记录。
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {history.map((run) => (
              <li
                key={run.id}
                className="flex items-start justify-between gap-4 border-b border-[var(--atrium-border)] pb-2"
              >
                <div>
                  <span
                    className={
                      run.status === "success"
                        ? "text-[var(--atrium-primary)]"
                        : run.status === "failed"
                          ? "text-[var(--atrium-destructive)]"
                          : "text-[var(--atrium-mutedForeground)]"
                    }
                  >
                    {run.status}
                  </span>
                  <span className="ml-2 text-[var(--atrium-mutedForeground)]">
                    {run.startedAt} · 提交 {run.commitCount}
                  </span>
                  {run.error !== undefined ? (
                    <p className="text-xs text-[var(--atrium-destructive)]">
                      {run.error}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
