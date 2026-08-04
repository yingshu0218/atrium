/**
 * 工作台应用外壳(PRD §19.1-19.3 / AGENTS §16.1)。
 * - 桌面:左侧功能菜单 + 右侧功能区;
 * - 移动:不保留固定侧栏,基于同一 nav 数据渲染抽屉(PRD §19.3);
 * - 活动项高亮 aria-current="page";折叠态纯图标带 title tooltip;
 * - 图标一律由 iconResolver 注入,不 import 任何图标包。
 *
 * 响应式采用 CSS 类方案:侧栏与抽屉触发器始终渲染,
 * 由宿主 CSS(>=lg / <lg media query)决定可见性,
 * 因此无需 matchMedia,jsdom 下也始终可断言结构。
 */
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { NavigationItem } from "@atrium/contracts";
import { mergeNavigation } from "./navigation.js";
import { IconButton, cx } from "./primitives.js";

export interface AppShellProps {
  /** 框架入口 + 模块入口合并前的导航项。 */
  nav: readonly NavigationItem[];
  /** 侧栏底部框架入口(设置、主题切换等,PRD §19.2)。 */
  footerItems?: readonly NavigationItem[];
  /** 当前活动导航项 id(由宿主通过 findActiveNavigation 计算后传入)。 */
  activeItemId?: string;
  /** 桌面侧栏是否折叠。 */
  collapsed: boolean;
  onToggleCollapsed(): void;
  onNavigate(item: NavigationItem): void;
  /** 把语义 iconKey 映射为图标节点。 */
  iconResolver(key: string): ReactNode;
  children: ReactNode;
}

interface SidebarNavProps {
  items: readonly NavigationItem[];
  activeItemId?: string | undefined;
  collapsed: boolean;
  onNavigate(item: NavigationItem): void;
  iconResolver(key: string): ReactNode;
  ariaLabel: string;
}

/** 渲染一组导航项;侧栏与抽屉复用同一渲染逻辑。 */
function SidebarNav({
  items,
  activeItemId,
  collapsed,
  onNavigate,
  iconResolver,
  ariaLabel,
}: SidebarNavProps) {
  return (
    <nav aria-label={ariaLabel} className="flex flex-col gap-1">
      {items.map((item) => {
        const isActive = item.id === activeItemId;
        return (
          <a
            key={item.id}
            href={item.route}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(item);
            }}
            aria-current={isActive ? "page" : undefined}
            data-active={isActive || undefined}
            title={collapsed ? item.label : undefined}
            className={cx(
              "flex items-center gap-3 rounded-[var(--atrium-radiusMd)] px-3 py-2 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--atrium-focusRing)]",
              isActive
                ? "bg-[var(--atrium-primary)] text-[var(--atrium-primaryForeground)]"
                : "text-[var(--atrium-mutedForeground)] hover:bg-[var(--atrium-muted)] hover:text-[var(--atrium-foreground)]",
              collapsed && "justify-center"
            )}
          >
            {iconResolver(item.iconKey)}
            {!collapsed ? <span>{item.label}</span> : null}
          </a>
        );
      })}
    </nav>
  );
}

export function AppShell({
  nav,
  footerItems = [],
  activeItemId,
  collapsed,
  onToggleCollapsed,
  onNavigate,
  iconResolver,
  children,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 侧栏与抽屉共享同一份合并后的导航定义(PRD §19.3)。
  const navItems = useMemo(() => mergeNavigation(nav), [nav]);
  const footerNavItems = useMemo(
    () => mergeNavigation(footerItems),
    [footerItems]
  );

  // 抽屉可点遮罩或关闭按钮关闭;Escape 键同样支持(键盘可操作)。
  useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--atrium-background)] text-[var(--atrium-foreground)]">
      {/* 桌面侧栏:<lg 由宿主 CSS 隐藏,>=lg 显示 */}
      <aside
        data-collapsed={collapsed}
        className={cx(
          "hidden shrink-0 flex-col border-r border-[var(--atrium-border)] bg-[var(--atrium-background)] lg:flex",
          "transition-[width] duration-200",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          <SidebarNav
            items={navItems}
            activeItemId={activeItemId}
            collapsed={collapsed}
            onNavigate={onNavigate}
            iconResolver={iconResolver}
            ariaLabel="主导航"
          />
        </div>
        <div className="flex flex-col gap-1 border-t border-[var(--atrium-border)] p-2">
          {footerNavItems.length > 0 ? (
            <SidebarNav
              items={footerNavItems}
              activeItemId={activeItemId}
              collapsed={collapsed}
              onNavigate={onNavigate}
              iconResolver={iconResolver}
              ariaLabel="侧栏底部导航"
            />
          ) : null}
          <IconButton
            label={collapsed ? "展开侧栏" : "折叠侧栏"}
            onClick={onToggleCollapsed}
            data-collapsed={collapsed}
          >
            {iconResolver(collapsed ? "chevron-right" : "chevron-left")}
          </IconButton>
        </div>
      </aside>

      {/* 右侧功能区:移动顶栏 + 页面内容 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-[var(--atrium-border)] px-3 py-2 lg:hidden">
          <IconButton
            label="打开菜单"
            className="atrium-drawer-trigger"
            onClick={() => setDrawerOpen(true)}
          >
            {iconResolver("menu")}
          </IconButton>
        </div>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* 移动抽屉:<lg 时打开;基于同一 nav 数据渲染 */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-50 bg-[var(--atrium-background)]/60"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="导航菜单"
            className="flex h-full w-64 flex-col bg-[var(--atrium-card)] shadow-[var(--atrium-shadowMd)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--atrium-border)] px-3 py-2">
              <span className="text-sm font-semibold">菜单</span>
              <IconButton
                label="关闭菜单"
                onClick={() => setDrawerOpen(false)}
              >
                {iconResolver("close")}
              </IconButton>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <SidebarNav
                items={navItems}
                activeItemId={activeItemId}
                collapsed={false}
                onNavigate={onNavigate}
                iconResolver={iconResolver}
                ariaLabel="主导航"
              />
              {footerNavItems.length > 0 ? (
                <div className="mt-2 border-t border-[var(--atrium-border)] pt-2">
                  <SidebarNav
                    items={footerNavItems}
                    activeItemId={activeItemId}
                    collapsed={false}
                    onNavigate={onNavigate}
                    iconResolver={iconResolver}
                    ariaLabel="侧栏底部导航"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
