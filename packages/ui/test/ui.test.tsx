/**
 * @atrium/ui 单元测试(根 vitest 已配置 jsdom)。
 * 说明:AppShell 的响应式采用 CSS 类方案(侧栏与抽屉触发器始终渲染,
 * 可见性由宿主 CSS 的 >=lg / <lg media query 控制),jsdom 中无 matchMedia
 * 也能直接断言抽屉按钮等结构。
 */
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { NavigationItem } from "@atrium/contracts";
import {
  AppShell,
  Button,
  Card,
  IconButton,
  Input,
  Textarea,
  findActiveNavigation,
  mergeNavigation,
} from "../src/index.js";

// RTL 16 会自动配置 React act 环境;显式声明以防 React 19 的 act 警告。
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// 根 vitest 未开启 globals,RTL 不会自动 cleanup,需手动清理已渲染 DOM。
afterEach(cleanup);

/** 读取 DOM 属性(jest-dom 的 toHaveAttribute 不可用,用标准断言代替)。 */
function attr(el: Element | null, name: string): string | null {
  return el?.getAttribute(name) ?? null;
}

const nav: NavigationItem[] = [
  { id: "home", label: "首页", iconKey: "home", route: "/" },
  { id: "notes", label: "便签", iconKey: "notes", route: "/notes" },
];

const footerItems: NavigationItem[] = [
  { id: "settings", label: "设置", iconKey: "settings", route: "/settings" },
];

function iconResolver(key: string) {
  return <span data-testid={`icon-${key}`} aria-hidden="true" />;
}

function Shell({
  activeItemId,
  includeFooter = false,
}: {
  activeItemId?: string;
  includeFooter?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState<string | undefined>(activeItemId);
  return (
    <AppShell
      nav={nav}
      footerItems={includeFooter ? footerItems : []}
      activeItemId={active}
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed((c) => !c)}
      onNavigate={(item) => setActive(item.id)}
      iconResolver={iconResolver}
    >
      <div>页面内容</div>
    </AppShell>
  );
}

describe("mergeNavigation", () => {
  it("按 order 升序排序,缺省 order 排最后", () => {
    const items: NavigationItem[] = [
      { id: "a", label: "A", iconKey: "home", route: "/a", order: 2 },
      { id: "b", label: "B", iconKey: "home", route: "/b" },
      { id: "c", label: "C", iconKey: "home", route: "/c", order: 1 },
    ];
    expect(mergeNavigation(items).map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("返回新数组,不修改入参", () => {
    const items: NavigationItem[] = [
      { id: "a", label: "A", iconKey: "home", route: "/a", order: 2 },
      { id: "b", label: "B", iconKey: "home", route: "/b", order: 1 },
    ];
    const result = mergeNavigation(items);
    expect(result).not.toBe(items);
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("重复 id 抛出 Error", () => {
    const items: NavigationItem[] = [
      { id: "a", label: "A", iconKey: "home", route: "/a" },
      { id: "a", label: "A2", iconKey: "home", route: "/a2" },
    ];
    expect(() => mergeNavigation(items)).toThrow(/重复/);
  });

  it("重复 route 抛出 Error", () => {
    const items: NavigationItem[] = [
      { id: "a", label: "A", iconKey: "home", route: "/notes" },
      { id: "b", label: "B", iconKey: "notes", route: "/notes" },
    ];
    expect(() => mergeNavigation(items)).toThrow(/重复/);
  });
});

describe("findActiveNavigation", () => {
  const items: NavigationItem[] = [
    { id: "home", label: "首页", iconKey: "home", route: "/" },
    { id: "notes", label: "便签", iconKey: "notes", route: "/notes" },
    { id: "detail", label: "详情", iconKey: "notes", route: "/notes/123" },
  ];

  it("精确 route 匹配优先", () => {
    expect(findActiveNavigation(items, "/notes/123")?.id).toBe("detail");
    expect(findActiveNavigation(items, "/notes")?.id).toBe("notes");
  });

  it("无精确匹配时做最长前缀匹配(/notes/:id 匹配 /notes)", () => {
    expect(findActiveNavigation(items, "/notes/456")?.id).toBe("notes");
    expect(findActiveNavigation(items, "/notes/456/edit")?.id).toBe("notes");
  });

  it("没有更具体匹配时回退到根路由", () => {
    expect(findActiveNavigation(items, "/settings")?.id).toBe("home");
  });

  it("无匹配返回 undefined", () => {
    expect(findActiveNavigation([], "/anything")).toBeUndefined();
  });
});

describe("primitives", () => {
  it("Button 渲染 variant 标记", () => {
    render(<Button variant="danger">删除</Button>);
    const button = screen.getByRole("button", { name: "删除" });
    expect(attr(button, "data-variant")).toBe("danger");
  });

  it("IconButton 的 label 渲染为 aria-label", () => {
    render(<IconButton label="关闭">×</IconButton>);
    const button = screen.getByRole("button", { name: "关闭" });
    expect(attr(button, "aria-label")).toBe("关闭");
    expect(attr(button, "title")).toBe("关闭");
  });

  it("Input 的 label 关联到输入框", () => {
    render(<Input label="标题" placeholder="输入标题" />);
    expect(attr(screen.getByLabelText("标题"), "placeholder")).toBe(
      "输入标题"
    );
  });

  it("Textarea 的 label 关联到文本域", () => {
    render(<Textarea label="正文" />);
    expect(screen.getByLabelText("正文").tagName).toBe("TEXTAREA");
  });

  it("Card 渲染标题、操作区与内容", () => {
    render(
      <Card title="卡片" actions={<button>操作</button>}>
        内容
      </Card>
    );
    expect(screen.getByText("卡片")).toBeTruthy();
    expect(screen.getByText("操作")).toBeTruthy();
    expect(screen.getByText("内容")).toBeTruthy();
  });
});

describe("AppShell", () => {
  it("渲染菜单 label 与页面内容", () => {
    render(<Shell />);
    expect(screen.getByText("首页")).toBeTruthy();
    expect(screen.getByText("便签")).toBeTruthy();
    expect(screen.getByText("页面内容")).toBeTruthy();
  });

  it("始终渲染抽屉按钮(可见性由 CSS 控制)", () => {
    const { container } = render(<Shell />);
    expect(
      screen.getByRole("button", { name: "打开菜单" })
    ).toBeTruthy();
    expect(container.querySelector(".atrium-drawer-trigger")).toBeTruthy();
  });

  it("点击折叠按钮后侧栏进入折叠态(data-collapsed 变化)", () => {
    const { container } = render(<Shell />);
    const aside = container.querySelector("aside");
    expect(attr(aside, "data-collapsed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "折叠侧栏" }));
    expect(attr(aside, "data-collapsed")).toBe("true");
    // 折叠态隐藏文字 label
    expect(screen.queryByText("首页")).toBeNull();
    // 折叠按钮 aria-label 表达语义
    expect(
      screen.getByRole("button", { name: "展开侧栏" })
    ).toBeTruthy();
  });

  it("折叠态菜单项带 title tooltip", () => {
    const { container } = render(<Shell />);
    fireEvent.click(screen.getByRole("button", { name: "折叠侧栏" }));
    const links = container.querySelectorAll("aside a");
    expect(links.length).toBeGreaterThan(0);
    for (const link of Array.from(links)) {
      expect(attr(link, "title")).toBeTruthy();
    }
  });

  it("活动项高亮 aria-current=page", () => {
    const { container } = render(<Shell activeItemId="notes" />);
    const link = container.querySelector('a[href="/notes"]');
    expect(attr(link, "aria-current")).toBe("page");
    expect(attr(container.querySelector('a[href="/"]'), "aria-current")).toBeNull();
  });

  it("抽屉打开后展示同一菜单定义,关闭按钮可关闭", () => {
    const { container } = render(<Shell includeFooter />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "打开菜单" }));
    const dialog = screen.getByRole("dialog", { name: "导航菜单" });
    expect(dialog).toBeTruthy();
    // 抽屉复用同一 nav 数据(含底部 footer 项);侧栏与抽屉同屏,查询限定在 dialog 内
    expect(within(dialog).getByText("便签")).toBeTruthy();
    expect(within(dialog).getByText("设置")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭菜单" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    // 遮罩关闭
    fireEvent.click(screen.getByRole("button", { name: "打开菜单" }));
    const overlay = container.querySelector(".fixed.inset-0");
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay as HTMLElement);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("抽屉支持 Escape 键关闭", () => {
    render(<Shell />);
    fireEvent.click(screen.getByRole("button", { name: "打开菜单" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
