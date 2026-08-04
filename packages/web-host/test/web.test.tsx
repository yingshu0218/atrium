/**
 * @atrium/web-host 集成测试(根 vitest 已配 jsdom)。
 * 用 fake WebModule + renderRouter 注入 MemoryRouter;认证 fetch 用 vi.fn mock。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import type { ApplicationConfig, WebModule } from "@atrium/contracts";
import { defaultTheme, type ThemePack } from "@atrium/theme";
import { createApiClient, createWebApp } from "../src/index.js";

// RTL 16 会自动配置 React act 环境;显式声明以防 React 19 的 act 警告。
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** 默认 auth mock:me / login / logout / challenge-admin 全部成功。 */
function authFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url.endsWith("/api/core/auth/me")) {
    return Promise.resolve(jsonResponse({ data: { profileId: "profile-1" } }));
  }
  if (url.endsWith("/api/core/auth/login")) {
    return Promise.resolve(jsonResponse({ data: { profileId: "profile-1" } }));
  }
  if (url.endsWith("/api/core/auth/logout")) {
    return Promise.resolve(jsonResponse({ data: null }));
  }
  if (url.endsWith("/api/core/auth/challenge-admin")) {
    return Promise.resolve(jsonResponse({ data: { verified: true } }));
  }
  return Promise.resolve(
    jsonResponse({ error: { code: "not_found", message: "未找到" } }, 404)
  );
}

beforeEach(() => {
  fetchMock = vi.fn(authFetch);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const config: ApplicationConfig = {
  applicationId: "test-app",
  name: "测试工作台",
  version: "0.1.0",
  installedModules: ["notes"],
  defaultEnabledModules: ["notes"],
  defaultTheme: "atrium-default",
  defaultLocale: "zh-CN",
  defaultTimezone: "Asia/Shanghai",
  authMode: "profiles",
  supportedClients: ["web"],
};

const notesModule: WebModule = {
  metadata: { id: "notes", name: "便签", version: "0.1.0", capabilities: ["web"] },
  navigation: [{ id: "notes", label: "便签", iconKey: "notes", route: "/notes" }],
  routes: [{ path: "/notes", element: <div>便签列表页面</div> }],
};

const darkThemePack: ThemePack<unknown> = {
  id: "dark",
  name: "深色主题",
  appearance: "dark",
  colors: {
    background: "hsl(222.2 84% 4.9%)",
    foreground: "hsl(210 40% 98%)",
    primary: "hsl(210 40% 98%)",
    primaryForeground: "hsl(222.2 47.4% 11.2%)",
    muted: "hsl(217.2 32.6% 17.5%)",
    mutedForeground: "hsl(215 20.2% 65.1%)",
    card: "hsl(222.2 84% 4.9%)",
    border: "hsl(217.2 32.6% 17.5%)",
    destructive: "hsl(0 62.8% 30.6%)",
    focusRing: "hsl(210 40% 98%)",
  },
  typography: {
    fontFamily: "sans-serif",
    fontFamilyMono: "monospace",
    fontSizeBase: "0.875rem",
    fontSizeSm: "0.75rem",
    fontSizeLg: "1.125rem",
    fontSizeXl: "1.25rem",
  },
  icons: { id: "none", name: "None", icons: {} },
  components: {
    radiusSm: "0.25rem",
    radiusMd: "0.375rem",
    radiusLg: "0.5rem",
    shadowSm: "none",
    shadowMd: "none",
    density: "comfortable",
  },
  layout: {
    sidebarWidthExpanded: "16rem",
    sidebarWidthCollapsed: "3.5rem",
    pageMaxWidth: "80rem",
    contentPadding: "1.5rem",
  },
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

const App = createWebApp({
  config,
  modules: [notesModule],
  themePacks: [defaultTheme, darkThemePack],
  defaultThemeId: "atrium-default",
  renderRouter: (children: ReactNode) => (
    <MemoryRouter initialEntries={["/"]}>
      {children}
      <LocationProbe />
    </MemoryRouter>
  ),
  apiClient: createApiClient(""),
});

describe("createWebApp", () => {
  it("合并框架与模块导航,模块菜单项出现", async () => {
    render(<App />);
    expect(await screen.findByText("首页")).toBeTruthy();
    expect(screen.getByText("便签")).toBeTruthy();
    expect(screen.getByText("设置")).toBeTruthy();
    expect(screen.getByText("主题")).toBeTruthy();
  });

  it("未认证时显示登录页", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/core/auth/me")) {
        return jsonResponse({ error: { code: "unauthorized", message: "未认证" } }, 401);
      }
      return jsonResponse({ error: { code: "not_found", message: "未找到" } }, 404);
    });
    render(<App />);
    expect(await screen.findByLabelText("密码")).toBeTruthy();
    expect(screen.getByRole("button", { name: "登录" })).toBeTruthy();
    expect(screen.queryByText("便签")).toBeNull();
  });

  it("登录后显示外壳与模块菜单", async () => {
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/core/auth/me")) {
          return jsonResponse({ error: { code: "unauthorized", message: "未认证" } }, 401);
        }
        if (url.endsWith("/api/core/auth/login") && init?.method === "POST") {
          return jsonResponse({ data: { profileId: "profile-1" } });
        }
        return jsonResponse({ error: { code: "not_found", message: "未找到" } }, 404);
      }
    );
    render(<App />);
    await screen.findByLabelText("密码");
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    expect(await screen.findByText("便签")).toBeTruthy();
    expect(screen.getByText("首页")).toBeTruthy();
    expect(screen.getByText("设置")).toBeTruthy();

    const loginCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/api/core/auth/login")
    );
    expect(loginCall).toBeTruthy();
    const [, loginInit] = loginCall as [unknown, RequestInit];
    expect(JSON.parse(String(loginInit.body))).toEqual({ password: "secret" });
  });

  it("登录失败显示错误提示", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/core/auth/me")) {
        return jsonResponse({ error: { code: "unauthorized", message: "未认证" } }, 401);
      }
      if (url.endsWith("/api/core/auth/login")) {
        return jsonResponse({ error: { code: "unauthorized", message: "密码错误" } }, 401);
      }
      return jsonResponse({ error: { code: "not_found", message: "未找到" } }, 404);
    });
    render(<App />);
    await screen.findByLabelText("密码");
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    expect((await screen.findByRole("alert")).textContent).toBe("密码错误");
    expect(screen.queryByText("便签")).toBeNull();
  });

  it("主题切换更新 CSS 变量且路由不变", async () => {
    render(<App />);
    await screen.findByText("便签");
    // 默认主题注入 light-dark() 变量
    expect(
      document.documentElement.style.getPropertyValue("--atrium-background")
    ).toContain("light-dark");

    // 点击侧栏底部主题入口弹选择面板,不改变路由
    fireEvent.click(screen.getByText("主题"));
    const dialog = screen.getByRole("dialog", { name: "选择主题" });
    expect(within(dialog).getByText("深色主题")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/");

    // 点击深色主题:样式变量更新、路由不变
    fireEvent.click(within(dialog).getByText("深色主题"));
    await waitFor(() => {
      expect(
        document.documentElement.style.getPropertyValue("--atrium-background")
      ).toBe("hsl(222.2 84% 4.9%)");
    });
    expect(screen.getByTestId("location").textContent).toBe("/");
    expect(screen.queryByText("系统设置。")).toBeNull();
  });
});
