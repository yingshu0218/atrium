/**
 * @atrium/ui — 工作台 UI 外壳与共享 primitives。
 * 图标一律由 AppShell 的 iconResolver 注入,不依赖任何具体图标包。
 */
export { mergeNavigation, findActiveNavigation } from "./navigation.js";
export {
  Button,
  IconButton,
  Input,
  Textarea,
  Card,
  cx,
} from "./primitives.js";
export type {
  ButtonProps,
  ButtonVariant,
  IconButtonProps,
  InputProps,
  TextareaProps,
  CardProps,
} from "./primitives.js";
export { AppShell } from "./shell.js";
export type { AppShellProps } from "./shell.js";
