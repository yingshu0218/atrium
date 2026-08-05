/**
 * 应用配置(Atrium §10.1 / AGENTS §18)。
 * 只描述品牌与模块组合;部署信息一律走环境变量,禁止写在这里。
 */
import type { ApplicationConfig } from "@atrium/contracts";

export const applicationConfig: ApplicationConfig = {
  applicationId: "workbench-app", // TODO: 替换为你的应用 id,如 "personal-workbench"
  name: "Workbench App", // TODO: 替换为应用显示名
  version: "0.1.0",
  // 构建时包含的模块(installed modules)。
  installedModules: ["notes"], // TODO: 增加你安装的官方/专有模块
  // 部署实例默认启用的模块(必须为 installedModules 的子集)。
  defaultEnabledModules: ["notes"],
  defaultTheme: "atrium-default",
  defaultLocale: "zh-CN", // TODO: 按需调整
  defaultTimezone: "Asia/Shanghai", // TODO: 按需调整
  authMode: "single",
  supportedClients: ["web", "pwa", "desktop", "mcp"],
};
