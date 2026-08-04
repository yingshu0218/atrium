import type { ApplicationConfig } from "@atrium/contracts";

/**
 * 应用配置(PRD §10.1 / AGENTS §18)。
 * 仅包含品牌与模块组合信息;部署级信息(数据库路径、密钥、域名)不在此处。
 */
export const applicationConfig: ApplicationConfig = {
  applicationId: "reference-app",
  name: "Atrium Reference App",
  version: "0.1.0",
  installedModules: ["notes"],
  defaultEnabledModules: ["notes"],
  defaultTheme: "atrium-default",
  defaultLocale: "zh-CN",
  defaultTimezone: "Asia/Shanghai",
  authMode: "single",
  supportedClients: ["web", "pwa", "desktop", "mcp"],
};
