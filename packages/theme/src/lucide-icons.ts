/**
 * 默认图标包:基于 Lucide 的框架基础语义图标映射。
 * 覆盖 FRAMEWORK_ICON_KEYS 全部 key;主题缺少某个 key 时宿主回退到本包。
 */
import {
  ChevronLeft,
  ChevronRight,
  House,
  LogOut,
  Menu,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  StickyNote,
  SunMoon,
  Tag,
  Trash2,
  User,
  X,
  type LucideIcon,
} from "lucide-react";

import { FRAMEWORK_ICON_KEYS, type FrameworkIconKey } from "@atrium/contracts";

import type { ThemeIconPack } from "./icons.js";

/**
 * 框架基础语义图标 → Lucide 组件。
 * Record<FrameworkIconKey, LucideIcon> 由类型系统保证覆盖全部框架 key。
 */
const iconMap: Readonly<Record<FrameworkIconKey, LucideIcon>> = {
  home: House,
  search: Search,
  settings: Settings,
  theme: SunMoon,
  sync: RefreshCw,
  menu: Menu,
  logout: LogOut,
  add: Plus,
  edit: Pencil,
  delete: Trash2,
  close: X,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  user: User,
  tag: Tag,
  attachment: Paperclip,
  notes: StickyNote,
};

/** 默认图标包(Lucide)。 */
export const defaultIconPack: ThemeIconPack = {
  id: "atrium-lucide",
  name: "Lucide",
  icons: iconMap,
};

// 运行时兜底校验:框架 key 必须全部可解析(类型已保证,这里防未来扩展遗漏)。
for (const key of FRAMEWORK_ICON_KEYS) {
  if (iconMap[key] === undefined) {
    throw new Error(`defaultIconPack missing framework icon key: ${key}`);
  }
}
