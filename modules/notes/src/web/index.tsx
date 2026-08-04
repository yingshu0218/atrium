/**
 * @atrium/notes web 入口 — WebModule(AGENTS.md §16 / PRD §12.2)。
 * - 页面直接 fetch(不经过 web-host 的 client,避免模块依赖宿主);
 * - 导航只声明语义 iconKey,不依赖任何图标包;
 * - 样式仅使用 tailwind 通用类与 var(--atrium-*) 语义 token(AGENTS.md §16.4)。
 */
import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { WebModule } from "@atrium/contracts";
import { Button, Card, Input, Textarea } from "@atrium/ui";
import { notesManifest } from "../manifest.js";
import type { Note, NoteInput } from "../shared/index.js";
import { noteInputSchema } from "../shared/index.js";

const API_BASE = "/api/m/notes";

/** 模块内 API 错误(与 contracts 的 ApiErrorBody 对齐)。 */
class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

function isErrorEnvelope(
  payload: unknown,
): payload is { error: { code: string; message: string } } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error: { code: unknown } }).error === "object" &&
    (payload as { error: { code: unknown } }).error !== null
  );
}

function isDataEnvelope(payload: unknown): payload is { data: unknown } {
  return typeof payload === "object" && payload !== null && "data" in payload;
}

/** 统一 { data } / { error } envelope 解析。 */
async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    payload = undefined;
  }
  if (isErrorEnvelope(payload)) {
    throw new ApiError(payload.error.code, payload.error.message);
  }
  if (!response.ok) {
    throw new ApiError("http_error", `HTTP ${response.status}`);
  }
  if (isDataEnvelope(payload)) {
    return payload.data as T;
  }
  return payload as T;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : "操作失败,请稍后重试";
}

/** 便签列表页:搜索 + 新建 + 列表(标题、摘要、置顶标记)。 */
export function NotesListPage(): ReactElement {
  const [items, setItems] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ items: Note[] }>(
        `/?q=${encodeURIComponent(q)}`,
      );
      setItems(data.items);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(appliedQuery);
  }, [load, appliedQuery]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setAppliedQuery(query.trim());
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <Card
        title="便签"
        actions={
          <Link to="/notes/new">
            <Button>新建便签</Button>
          </Link>
        }
      >
        <form
          onSubmit={handleSubmit}
          className="mb-4 flex flex-col gap-3 sm:flex-row"
        >
          <Input
            label="搜索"
            placeholder="搜索标题或正文…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="sm:max-w-sm"
          />
          <Button type="submit" variant="ghost" className="self-end">
            搜索
          </Button>
        </form>

        {error !== null ? (
          <p role="alert" className="text-sm text-[var(--atrium-destructive)]">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p role="status" className="text-sm text-[var(--atrium-mutedForeground)]">
            加载中…
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-[var(--atrium-mutedForeground)]">
            还没有便签,点击「新建便签」开始记录。
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--atrium-border)]">
            {items.map((note) => (
              <li key={note.id}>
                <Link
                  to={`/notes/${note.id}`}
                  className="flex items-start gap-3 rounded-[var(--atrium-radiusMd)] px-2 py-3 transition-colors hover:bg-[var(--atrium-muted)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-[var(--atrium-foreground)]">
                      {note.pinned ? (
                        <span
                          aria-label="已置顶"
                          className="text-xs text-[var(--atrium-primary)]"
                        >
                          置顶
                        </span>
                      ) : null}
                      <span className="truncate">{note.title}</span>
                    </p>
                    {note.body !== "" ? (
                      <p className="mt-0.5 truncate text-sm text-[var(--atrium-mutedForeground)]">
                        {note.body}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** 便签编辑页:新建(/notes/new)与编辑(/notes/:id)共用。 */
export function NotesEditPage(): ReactElement {
  const { id } = useParams();
  const isNew = id === undefined || id === "new";
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NoteInput>({
    resolver: zodResolver(noteInputSchema),
    defaultValues: { title: "", body: "", pinned: false, archived: false },
  });

  useEffect(() => {
    if (isNew) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJson<Note>(`/${id}`)
      .then((note) => {
        if (!cancelled) {
          reset({
            title: note.title,
            body: note.body,
            pinned: note.pinned,
            archived: note.archived,
          });
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(messageOf(cause));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await fetchJson("/", { method: "POST", body: JSON.stringify(values) });
      } else {
        await fetchJson(`/${id}`, {
          method: "PUT",
          body: JSON.stringify(values),
        });
      }
      navigate("/notes");
    } catch (cause) {
      setError(messageOf(cause));
      setSaving(false);
    }
  });

  return (
    <div className="p-6">
      <Card title={isNew ? "新建便签" : "编辑便签"}>
        {loading ? (
          <p role="status" className="text-sm text-[var(--atrium-mutedForeground)]">
            加载中…
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Input
              label="标题"
              placeholder="便签标题"
              maxLength={200}
              {...register("title")}
            />
            {errors.title !== undefined ? (
              <p role="alert" className="text-sm text-[var(--atrium-destructive)]">
                {errors.title.message}
              </p>
            ) : null}

            <Textarea
              label="正文"
              rows={10}
              placeholder="写下点什么…"
              maxLength={100000}
              {...register("body")}
            />

            <label className="flex items-center gap-2 text-sm text-[var(--atrium-foreground)]">
              <input
                type="checkbox"
                className="size-4 accent-[var(--atrium-primary)]"
                {...register("pinned")}
              />
              置顶
            </label>

            {error !== null ? (
              <p role="alert" className="text-sm text-[var(--atrium-destructive)]">
                {error}
              </p>
            ) : null}

            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </Button>
              <Link to="/notes">
                <Button variant="ghost">返回列表</Button>
              </Link>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

/** 首页 widget(可选能力;宿主当前不渲染 homeWidget,提供简单快捷入口)。 */
export function NotesHomeWidget(): ReactElement {
  return (
    <Card title="便签">
      <p className="text-sm text-[var(--atrium-mutedForeground)]">
        快速记录想法与待办,支持搜索、置顶与归档。
      </p>
      <div className="mt-3">
        <Link to="/notes">
          <Button variant="ghost">打开便签</Button>
        </Link>
      </div>
    </Card>
  );
}

export const notesWebModule: WebModule = {
  metadata: notesManifest,
  navigation: [
    { id: "notes", label: "便签", iconKey: "notes", route: "/notes", order: 10 },
  ],
  routes: [
    { path: "/notes", element: <NotesListPage /> },
    { path: "/notes/:id", element: <NotesEditPage /> },
  ],
  homeWidget: <NotesHomeWidget />,
};
