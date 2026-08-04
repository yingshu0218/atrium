/**
 * @atrium/notes web 测试(jsdom + @testing-library/react)。
 * mock 全局 fetch 返回 { data } envelope;验证列表渲染与表单提交(POST/PUT)。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { NotesEditPage, NotesListPage } from "../src/web/index.js";

// RTL 16 会自动配置 React act 环境;显式声明以防 React 19 的 act 警告。
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function noteFixture(id: string, title: string, body: string) {
  return {
    id,
    profileId: "profile-1",
    seq: 1,
    title,
    body,
    pinned: false,
    archived: false,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

describe("NotesListPage", () => {
  it("加载并渲染便签列表(标题、摘要、置顶标记)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          items: [
            noteFixture("n1", "测试标题", "正文摘要"),
            noteFixture("n2", "置顶便签", "pinned body"),
          ],
          nextCursor: undefined,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <NotesListPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("测试标题")).toBeTruthy();
    expect(screen.getByText("正文摘要")).toBeTruthy();
    expect(screen.getByText("置顶便签")).toBeTruthy();
    expect(screen.getByText("新建便签")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/m/notes/"),
      expect.anything(),
    );
  });

  it("搜索提交后带 q 参数重新请求", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { items: [], nextCursor: undefined } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <NotesListPage />
      </MemoryRouter>,
    );
    await screen.findByRole("status");

    fireEvent.change(screen.getByLabelText("搜索"), {
      target: { value: "grocer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/m/notes/?q=grocer",
        expect.anything(),
      );
    });
  });
});

describe("NotesEditPage", () => {
  it("新建模式(/notes/new)提交时调用 POST /api/m/notes/", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/notes/new"]}>
        <Routes>
          <Route path="/notes/new" element={<NotesEditPage />} />
          {/* 保存后 navigate 的目标占位,避免 Router 警告 */}
          <Route path="/notes" element={<div>列表</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "新便签" },
    });
    fireEvent.change(screen.getByLabelText("正文"), {
      target: { value: "正文内容" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/m/notes/",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(init.body))).toMatchObject({
      title: "新便签",
      body: "正文内容",
    });
  });

  it("编辑模式(/notes/:id)加载现有便签并提交 PUT", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/note-1")) {
          return Promise.resolve(
            jsonResponse({
              data: noteFixture("note-1", "旧标题", "旧正文"),
            }),
          );
        }
        return Promise.resolve(jsonResponse({ data: {} }));
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/notes/note-1"]}>
        <Routes>
          <Route path="/notes/:id" element={<NotesEditPage />} />
          {/* 保存后 navigate 的目标占位,避免 Router 警告 */}
          <Route path="/notes" element={<div>列表</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect((screen.getByLabelText("标题") as HTMLInputElement).value).toBe(
        "旧标题",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/m/notes/note-1",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });
});
