/**
 * 导航合并与活动项解析(PRD §19.5 / AGENTS §16.1)。
 * 纯函数,不依赖 React。
 */
import type { NavigationItem } from "@atrium/contracts";

function compareByOrder(a: NavigationItem, b: NavigationItem): number {
  if (a.order === undefined && b.order === undefined) {
    return 0;
  }
  if (a.order === undefined) {
    return 1;
  }
  if (b.order === undefined) {
    return -1;
  }
  return a.order - b.order;
}

/**
 * 合并并规范化导航项:
 * - 按 `order` 升序排序,`order` 缺省的项排最后;
 * - 校验重复 `id` 与重复 `route`,冲突抛出 Error;
 * - 返回新数组,不修改入参。
 */
export function mergeNavigation(items: readonly NavigationItem[]): NavigationItem[] {
  const sorted = [...items].sort(compareByOrder);

  const seenIds = new Set<string>();
  const seenRoutes = new Set<string>();
  for (const item of sorted) {
    if (seenIds.has(item.id)) {
      throw new Error(`导航项 id 重复: "${item.id}"`);
    }
    if (seenRoutes.has(item.route)) {
      throw new Error(`导航项 route 重复: "${item.route}"`);
    }
    seenIds.add(item.id);
    seenRoutes.add(item.route);
  }
  return sorted;
}

/**
 * 根据当前 pathname 找出活动导航项:
 * 精确 route 匹配优先;否则选择最长前缀匹配
 * (例如 pathname 为 /notes/42 时匹配 route 为 /notes 的项)。
 */
export function findActiveNavigation(
  items: readonly NavigationItem[],
  pathname: string
): NavigationItem | undefined {
  const exact = items.find((item) => item.route === pathname);
  if (exact) {
    return exact;
  }

  let best: NavigationItem | undefined;
  for (const item of items) {
    const { route } = item;
    const isPrefix =
      route === "/"
        ? pathname.startsWith("/")
        : pathname.startsWith(route) && pathname.charAt(route.length) === "/";
    if (isPrefix && (best === undefined || route.length > best.route.length)) {
      best = item;
    }
  }
  return best;
}
