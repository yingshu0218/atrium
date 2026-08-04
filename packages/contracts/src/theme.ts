/**
 * 语义图标 key(PRD §16.3 / AGENTS §16.3)。
 * 模块只声明图标用途,不决定最终图标实现;由当前 Theme Icon Pack 映射。
 */

/** 语义图标 key:描述用途的稳定标识(开放扩展) */
export type SemanticIconKey = string;

/**
 * 框架基础语义图标集合。
 * 所有 Theme Icon Pack 必须覆盖这些 key;主题缺少某个 key 时回退到默认图标包。
 */
export const FRAMEWORK_ICON_KEYS = [
  "home",
  "search",
  "settings",
  "theme",
  "sync",
  "menu",
  "logout",
  "add",
  "edit",
  "delete",
  "close",
  "chevron-left",
  "chevron-right",
  "user",
  "tag",
  "attachment",
  "notes",
] as const;

export type FrameworkIconKey = (typeof FRAMEWORK_ICON_KEYS)[number];

/** 主题外观模式 */
export type ThemeAppearance = "light" | "dark" | "adaptive";

/** 主题颜色 token(主题包受控契约,字段结构实现前可经 ADR 调整) */
export interface ThemeColors {
  background: string;
  foreground: string;
  primary: string;
  primaryForeground: string;
  muted: string;
  mutedForeground: string;
  card: string;
  border: string;
  destructive: string;
  focusRing: string;
}

/** 主题排版 token */
export interface ThemeTypography {
  fontFamily: string;
  fontFamilyMono: string;
  fontSizeBase: string;
  fontSizeSm: string;
  fontSizeLg: string;
  fontSizeXl: string;
}

/** 主题组件 token(圆角、阴影、密度等) */
export interface ThemeComponentTokens {
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  shadowSm: string;
  shadowMd: string;
  density: "compact" | "comfortable" | "spacious";
}

/** 主题布局 token */
export interface ThemeLayoutTokens {
  sidebarWidthExpanded: string;
  sidebarWidthCollapsed: string;
  pageMaxWidth: string;
  contentPadding: string;
}

/** 主题装饰(可选:背景纹理等) */
export interface ThemeDecorations {
  backgroundTexture?: string;
  [key: string]: unknown;
}

/**
 * 视觉主题包(PRD §19.6 / AGENTS §16.2)。
 * IconPack 泛型保持 contracts 运行时无关:具体图标映射实现由 theme 包提供。
 */
export interface ThemePack<IconPack = unknown> {
  id: string;
  name: string;
  appearance: ThemeAppearance;
  colors: ThemeColors;
  typography: ThemeTypography;
  icons: IconPack;
  components: ThemeComponentTokens;
  layout: ThemeLayoutTokens;
  decorations?: ThemeDecorations;
}
