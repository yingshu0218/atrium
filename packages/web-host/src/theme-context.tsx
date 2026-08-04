/**
 * 主题上下文(AGENTS §16.2 / §16.3,PRD §19.6-19.8)。
 * - 把当前 ThemePack 经 toCssVariables 注入 document.documentElement.style
 *   (先清除上一主题的 --atrium-* 变量再写入);
 * - iconResolver:用当前主题 icons 包解析语义 key,缺失回退 defaultIconPack,
 *   仍缺失则返回占位 span(aria-hidden)。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ThemePack } from "@atrium/contracts";
import {
  defaultIconPack,
  resolveIcon,
  toCssVariables,
  type ThemeIconPack,
} from "@atrium/theme";

export interface ThemeContextValue {
  currentThemeId: string;
  setTheme(id: string): void;
  /** 语义图标 key → 图标节点(主题缺失时回退默认图标包)。 */
  iconResolver(key: string): ReactNode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  themePacks: readonly ThemePack<unknown>[];
  defaultThemeId?: string;
  children: ReactNode;
}

function isThemeIconPack(value: unknown): value is ThemeIconPack {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const icons = (value as { icons?: unknown }).icons;
  return typeof icons === "object" && icons !== null;
}

function applyTheme(
  themePacks: readonly ThemePack<unknown>[],
  themeId: string
): void {
  const theme = themePacks.find((pack) => pack.id === themeId);
  const style = document.documentElement.style;
  // 清除上一主题的变量,避免残留旧值。
  for (let index = style.length - 1; index >= 0; index -= 1) {
    const name = style.item(index);
    if (name.startsWith("--atrium-")) {
      style.removeProperty(name);
    }
  }
  if (theme === undefined) {
    return;
  }
  const variables = toCssVariables(theme as ThemePack<ThemeIconPack>);
  for (const [name, value] of Object.entries(variables)) {
    style.setProperty(name, value);
  }
}

export function ThemeProvider({
  themePacks,
  defaultThemeId,
  children,
}: ThemeProviderProps) {
  const initialId = useMemo(() => {
    if (themePacks.length === 0) {
      return "atrium-default";
    }
    if (defaultThemeId !== undefined && themePacks.some((p) => p.id === defaultThemeId)) {
      return defaultThemeId;
    }
    return themePacks[0]?.id ?? "atrium-default";
  }, [themePacks, defaultThemeId]);

  const [currentThemeId, setCurrentThemeId] = useState(initialId);

  useEffect(() => {
    applyTheme(themePacks, currentThemeId);
  }, [themePacks, currentThemeId]);

  const setTheme = useCallback(
    (id: string) => {
      setCurrentThemeId((prev) => {
        if (themePacks.length > 0 && !themePacks.some((p) => p.id === id)) {
          // 无效主题 id:保持不变。
          return prev;
        }
        return id;
      });
    },
    [themePacks]
  );

  const iconResolver = useCallback(
    (key: string): ReactNode => {
      const theme = themePacks.find((pack) => pack.id === currentThemeId);
      const pack =
        theme !== undefined && isThemeIconPack(theme.icons) ? theme.icons : undefined;
      const Icon =
        (pack === undefined ? null : resolveIcon(pack, key)) ??
        resolveIcon(defaultIconPack, key);
      if (Icon !== null) {
        return <Icon aria-hidden="true" />;
      }
      return <span aria-hidden="true" data-icon-key={key} />;
    },
    [themePacks, currentThemeId]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ currentThemeId, setTheme, iconResolver }),
    [currentThemeId, setTheme, iconResolver]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error("useTheme 必须在 <ThemeProvider> 内使用");
  }
  return value;
}
