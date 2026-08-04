/**
 * @atrium/theme 测试:默认图标包覆盖、图标解析回退、CSS 变量生成。
 */
import { describe, expect, it } from "vitest";

import { FRAMEWORK_ICON_KEYS } from "@atrium/contracts";

import {
  defaultIconPack,
  defaultTheme,
  hasIcon,
  resolveIcon,
  toCssVariables,
} from "../src/index.js";

describe("defaultIconPack", () => {
  it("覆盖 FRAMEWORK_ICON_KEYS 全部 key", () => {
    for (const key of FRAMEWORK_ICON_KEYS) {
      expect(defaultIconPack.icons[key], `缺少框架图标: ${key}`).toBeDefined();
    }
  });

  it("映射数量与框架 key 数量一致(无遗漏、无多余)", () => {
    expect(Object.keys(defaultIconPack.icons)).toHaveLength(
      FRAMEWORK_ICON_KEYS.length
    );
  });
});

describe("resolveIcon", () => {
  it("已知 key 返回对应图标组件", () => {
    expect(resolveIcon(defaultIconPack, "home")).not.toBeNull();
    expect(resolveIcon(defaultIconPack, "notes")).toBeDefined();
  });

  it("缺失 key 返回 null(供宿主回退默认图标包)", () => {
    expect(resolveIcon(defaultIconPack, "not-a-real-key")).toBeNull();
    expect(resolveIcon(defaultIconPack, "")).toBeNull();
  });
});

describe("hasIcon", () => {
  it("已知 key 返回 true", () => {
    expect(hasIcon(defaultIconPack, "settings")).toBe(true);
  });

  it("缺失 key 返回 false", () => {
    expect(hasIcon(defaultIconPack, "not-a-real-key")).toBe(false);
  });
});

describe("toCssVariables", () => {
  it("包含基础 CSS 变量", () => {
    const variables = toCssVariables(defaultTheme);
    expect(variables["--atrium-background"]).toBeDefined();
    expect(variables["--atrium-foreground"]).toBeDefined();
    expect(variables["--atrium-primary"]).toBeDefined();
    expect(variables["--atrium-radius-md"]).toBeDefined();
    expect(variables["--atrium-sidebar-width-expanded"]).toBeDefined();
    expect(variables["--atrium-density"]).toBeDefined();
  });

  it("使用 kebab-case 变量名", () => {
    const variables = toCssVariables(defaultTheme);
    expect(variables["--atrium-primary-foreground"]).toBeDefined();
    expect(variables["--atrium-sidebar-width-collapsed"]).toBeDefined();
  });

  it("无重复键", () => {
    const keys = Object.keys(toCssVariables(defaultTheme));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("adaptive 主题颜色携带 light/dark 两套值", () => {
    const variables = toCssVariables(defaultTheme);
    expect(variables["--atrium-background"]).toContain("light-dark(");
  });
});
