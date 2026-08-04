/**
 * 默认主题包(Atrium Default)。
 * adaptive 外观:每个颜色 token 用 CSS light-dark() 同时承载浅色/深色两套色值,
 * 由浏览器按 prefers-color-scheme 自动选择;web-host 通过 toCssVariables
 * 注入 :root 供全局使用。
 */
import type { ThemePack } from "@atrium/contracts";

import type { ThemeIconPack } from "./icons.js";
import { defaultIconPack } from "./lucide-icons.js";

/** 默认主题 id。 */
export const DEFAULT_THEME_ID = "atrium-default";

/** 浅色色值(Tailwind 风格 HSL 三元组,与 DARK 一一对应)。 */
const LIGHT = {
  background: "hsl(0 0% 100%)",
  foreground: "hsl(222 47% 11%)",
  primary: "hsl(222 47% 11%)",
  primaryForeground: "hsl(210 40% 98%)",
  muted: "hsl(210 40% 96.1%)",
  mutedForeground: "hsl(215.4 16.3% 46.9%)",
  card: "hsl(0 0% 100%)",
  border: "hsl(214.3 31.8% 91.4%)",
  destructive: "hsl(0 84.2% 60.2%)",
  focusRing: "hsl(222.2 84% 4.9%)",
} as const;

/** 深色色值。 */
const DARK = {
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
} as const;

/** 构造同时承载浅色/深色两套值的 CSS light-dark() 色值。 */
function adaptive(lightValue: string, darkValue: string): string {
  return `light-dark(${lightValue}, ${darkValue})`;
}

/** 默认主题包。 */
export const defaultTheme: ThemePack<ThemeIconPack> = {
  id: DEFAULT_THEME_ID,
  name: "Atrium Default",
  appearance: "adaptive",
  colors: {
    background: adaptive(LIGHT.background, DARK.background),
    foreground: adaptive(LIGHT.foreground, DARK.foreground),
    primary: adaptive(LIGHT.primary, DARK.primary),
    primaryForeground: adaptive(LIGHT.primaryForeground, DARK.primaryForeground),
    muted: adaptive(LIGHT.muted, DARK.muted),
    mutedForeground: adaptive(LIGHT.mutedForeground, DARK.mutedForeground),
    card: adaptive(LIGHT.card, DARK.card),
    border: adaptive(LIGHT.border, DARK.border),
    destructive: adaptive(LIGHT.destructive, DARK.destructive),
    focusRing: adaptive(LIGHT.focusRing, DARK.focusRing),
  },
  typography: {
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontFamilyMono:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Mono", "Segoe UI Mono", monospace',
    fontSizeBase: "0.875rem",
    fontSizeSm: "0.75rem",
    fontSizeLg: "1.125rem",
    fontSizeXl: "1.25rem",
  },
  icons: defaultIconPack,
  components: {
    radiusSm: "0.375rem",
    radiusMd: "0.5rem",
    radiusLg: "0.75rem",
    shadowSm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    shadowMd:
      "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    density: "comfortable",
  },
  layout: {
    sidebarWidthExpanded: "16rem",
    sidebarWidthCollapsed: "3.5rem",
    pageMaxWidth: "80rem",
    contentPadding: "1.5rem",
  },
};

/** camelCase 转 kebab-case,如 sidebarWidthExpanded → sidebar-width-expanded。 */
function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

/**
 * 把主题的 colors / components / layout token 转为 --atrium-* CSS 变量,
 * 供 web-host 注入 :root(如 --atrium-background、--atrium-primary、
 * --atrium-radius-md、--atrium-sidebar-width-expanded)。
 */
export function toCssVariables(
  theme: ThemePack<ThemeIconPack>
): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme.colors)) {
    variables[`--atrium-${toKebabCase(key)}`] = value;
  }
  for (const [key, value] of Object.entries(theme.components)) {
    variables[`--atrium-${toKebabCase(key)}`] = value;
  }
  for (const [key, value] of Object.entries(theme.layout)) {
    variables[`--atrium-${toKebabCase(key)}`] = value;
  }
  return variables;
}
