/**
 * 应用配置类型(PRD §10.1 / AGENTS §18)。
 * 应用配置描述应用品牌、已安装模块、默认启用模块、默认主题等;
 * 部署级信息(域名、密钥、数据库路径)不得出现在这里。
 */
import type { AuthMode } from "./auth.js";

/** 应用声明支持的客户端能力 */
export type SupportedClient = "web" | "pwa" | "desktop" | "mcp";

export interface ApplicationConfig {
  /** 稳定应用标识,如 "personal-workbench" */
  applicationId: string;
  name: string;
  version: string;
  /** 构建时包含的模块 id(installed modules) */
  installedModules: readonly string[];
  /** 部署实例默认启用的模块 id,必须是 installedModules 的子集 */
  defaultEnabledModules: readonly string[];
  defaultTheme: string;
  defaultLocale: string;
  defaultTimezone: string;
  authMode: AuthMode;
  supportedClients: readonly SupportedClient[];
}
