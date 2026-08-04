/**
 * @atrium/theme — 视觉主题包。
 * 提供 Theme Icon Pack(语义图标映射)、默认 Lucide 图标包、默认主题
 * 与 --atrium-* CSS 变量生成,供 web-host 注入。
 */
export {
  FRAMEWORK_ICON_KEYS,
  type FrameworkIconKey,
  type SemanticIconKey,
  type ThemeAppearance,
  type ThemeColors,
  type ThemeComponentTokens,
  type ThemeDecorations,
  type ThemeLayoutTokens,
  type ThemePack,
  type ThemeTypography,
} from "@atrium/contracts";

export { hasIcon, resolveIcon, type ThemeIconPack } from "./icons.js";
export { defaultIconPack } from "./lucide-icons.js";
export {
  DEFAULT_THEME_ID,
  defaultTheme,
  toCssVariables,
} from "./default-theme.js";
