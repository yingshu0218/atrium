/**
 * Web 宿主应用组装(PRD §19 / AGENTS §16.1)。
 * - 导航:框架入口(首页)+ 各模块 navigation,经 mergeNavigation 校验合并;
 *   设置与主题切换入口位于侧栏底部 footerItems(主题切换不改变路由,PRD §19.7);
 * - 路由:框架路由(/、/settings)+ 模块 WebRouteDefinition(元素类型收窄为可渲染节点);
 * - 认证:未认证渲染登录页,认证后渲染 AppShell;
 * - 主题:ThemeProvider 注入 CSS 变量;图标经 iconResolver 解析。
 */
import {
  isValidElement,
  createElement,
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  ApplicationConfig,
  NavigationItem,
  ThemePack,
  WebModule,
} from "@atrium/contracts";
import {
  AppShell,
  Button,
  Card,
  IconButton,
  Input,
  findActiveNavigation,
  mergeNavigation,
} from "@atrium/ui";

import { createApiClient, type ApiClient } from "./api-client.js";
import { AuthProvider, useAuth } from "./auth-context.js";
import { ThemeProvider, useTheme } from "./theme-context.js";

export interface CreateWebAppOptions {
  config: ApplicationConfig;
  modules: readonly WebModule[];
  themePacks: readonly ThemePack<unknown>[];
  defaultThemeId?: string;
  /** 测试可注入 MemoryRouter;缺省使用 BrowserRouter。 */
  renderRouter?: (children: ReactNode) => ReactNode;
  /** 测试可注入 fake client;缺省创建同源客户端。 */
  apiClient?: ApiClient;
}

/** 侧栏底部主题切换入口的导航项 id(点击弹主题选择,不导航)。 */
const THEME_SWITCHER_ID = "theme-switcher";

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/** WebRouteDefinition.element 为 unknown;收窄为可渲染节点。 */
function renderRouteElement(element: unknown): ReactElement {
  if (isValidElement(element)) {
    return element;
  }
  return createElement(element as ComponentType);
}

export function createWebApp(options: CreateWebAppOptions): () => ReactNode {
  const { config, modules, themePacks } = options;
  const renderRouter =
    options.renderRouter ?? ((children: ReactNode) => <BrowserRouter>{children}</BrowserRouter>);
  const apiClient = options.apiClient ?? createApiClient("");

  const frameworkNav: NavigationItem[] = [
    { id: "home", label: "首页", iconKey: "home", route: "/" },
  ];
  const footerItems: NavigationItem[] = [
    { id: "settings", label: "设置", iconKey: "settings", route: "/settings" },
    { id: THEME_SWITCHER_ID, label: "主题", iconKey: "theme", route: "/theme" },
  ];

  const nav = mergeNavigation([
    ...frameworkNav,
    ...modules.flatMap((m) => m.navigation),
  ]);

  const allRoutes = [
    <Route key="home" path="/" element={<HomePage />} />,
    <Route key="settings" path="/settings" element={<SettingsPage />} />,
    ...modules.flatMap((module, moduleIndex) =>
      module.routes.map((route, routeIndex) => (
        <Route
          key={`${module.metadata.id}-${moduleIndex}-${routeIndex}`}
          path={normalizePath(route.path)}
          element={renderRouteElement(route.element)}
        />
      ))
    ),
  ];

  function HomePage(): ReactElement {
    return (
      <div className="p-6">
        <Card title={config.name}>
          <p>欢迎使用工作台。</p>
        </Card>
      </div>
    );
  }

  function SettingsPage(): ReactElement {
    return (
      <div className="p-6">
        <Card title="设置">
          <p>系统设置。</p>
        </Card>
      </div>
    );
  }

  function LoginPage(): ReactElement {
    const { login } = useAuth();
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      setError(null);
      setSubmitting(true);
      try {
        await login(password);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "登录失败,请稍后重试");
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--atrium-background)] px-4 text-[var(--atrium-foreground)]">
        <Card title={config.name} className="w-full max-w-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              label="密码"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
            />
            {error !== null ? (
              <p role="alert" className="text-sm text-[var(--atrium-destructive)]">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={submitting || password.length === 0}>
              登录
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  function ThemePicker({
    onClose,
    onSelectTheme,
  }: {
    onClose(): void;
    onSelectTheme(id: string): void;
  }): ReactElement {
    const { currentThemeId, iconResolver } = useTheme();
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="选择主题"
          className="w-80 rounded-[var(--atrium-radiusLg)] border border-[var(--atrium-border)] bg-[var(--atrium-card)] p-4 text-[var(--atrium-foreground)] shadow-[var(--atrium-shadowMd)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">选择主题</h2>
            <IconButton label="关闭主题选择" onClick={onClose}>
              {iconResolver("close")}
            </IconButton>
          </div>
          <ul className="flex flex-col gap-1">
            {themePacks.map((pack) => (
              <li key={pack.id}>
                <button
                  type="button"
                  onClick={() => onSelectTheme(pack.id)}
                  data-active={pack.id === currentThemeId || undefined}
                  className="flex w-full items-center gap-3 rounded-[var(--atrium-radiusMd)] px-3 py-2 text-left text-sm text-[var(--atrium-foreground)] transition-colors hover:bg-[var(--atrium-muted)]"
                >
                  {pack.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  function Shell(): ReactElement {
    const { status } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { setTheme, iconResolver } = useTheme();
    const [collapsed, setCollapsed] = useState(false);
    const [themePickerOpen, setThemePickerOpen] = useState(false);

    const activeItemId = useMemo(
      () => findActiveNavigation(nav, location.pathname)?.id,
      [nav, location.pathname]
    );

    if (status === "loading") {
      return (
        <div role="status" className="flex min-h-screen items-center justify-center">
          加载中…
        </div>
      );
    }
    if (status === "anonymous") {
      return <LoginPage />;
    }

    const handleNavigate = (item: NavigationItem): void => {
      if (item.id === THEME_SWITCHER_ID) {
        // 主题切换只弹选择面板,不改变路由(PRD §19.7)。
        setThemePickerOpen(true);
        return;
      }
      navigate(item.route);
    };

    return (
      <>
        <AppShell
          nav={nav}
          footerItems={footerItems}
          {...(activeItemId !== undefined ? { activeItemId } : {})}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((value) => !value)}
          onNavigate={handleNavigate}
          iconResolver={iconResolver}
        >
          <Routes>{allRoutes}</Routes>
        </AppShell>
        {themePickerOpen ? (
          <ThemePicker
            onClose={() => setThemePickerOpen(false)}
            onSelectTheme={setTheme}
          />
        ) : null}
      </>
    );
  }

  function WebApp(): ReactNode {
    const [queryClient] = useState(
      () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
    );
    return renderRouter(
      <QueryClientProvider client={queryClient}>
        <AuthProvider apiClient={apiClient}>
          <ThemeProvider
            themePacks={themePacks}
            {...(options.defaultThemeId !== undefined
              ? { defaultThemeId: options.defaultThemeId }
              : {})}
          >
            <Shell />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  }

  return WebApp;
}
