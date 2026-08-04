/**
 * Theme Icon Pack:把语义图标 key 映射为实际图标实现。
 * 模块只声明语义 iconKey,不得 import 具体图标包(AGENTS.md §16.3)。
 */
import type { LucideIcon } from "lucide-react";

import type { SemanticIconKey } from "@atrium/contracts";

/**
 * 主题图标包:语义 key → Lucide 图标组件 的映射。
 * key 是开放的语义标识(框架基础集合见 FRAMEWORK_ICON_KEYS)。
 */
export interface ThemeIconPack {
  id: string;
  name: string;
  /** 语义图标 key → 图标组件;readonly 防止运行时被修改 */
  icons: Readonly<Record<string, LucideIcon>>;
}

/**
 * 解析语义 key 对应的图标。
 * 主题缺少某个 key 时返回 null,由调用方(宿主)回退到默认图标包。
 */
export function resolveIcon(
  pack: ThemeIconPack,
  key: SemanticIconKey
): LucideIcon | null {
  return pack.icons[key] ?? null;
}

/** 判断主题图标包是否包含某个语义 key(不含原型链继承)。 */
export function hasIcon(pack: ThemeIconPack, key: SemanticIconKey): boolean {
  return Object.prototype.hasOwnProperty.call(pack.icons, key);
}
