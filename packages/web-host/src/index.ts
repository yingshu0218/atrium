/**
 * @atrium/web-host — React Web/PWA 宿主外壳。
 * 提供应用组装(createWebApp)、认证上下文、主题上下文与 API 客户端。
 */
export { ApiError, createApiClient } from "./api-client.js";
export type { ApiClient } from "./api-client.js";
export { AuthProvider, useAuth } from "./auth-context.js";
export type { AuthContextValue, AuthProviderProps, AuthStatus } from "./auth-context.js";
export { ThemeProvider, useTheme } from "./theme-context.js";
export type { ThemeContextValue, ThemeProviderProps } from "./theme-context.js";
export { createWebApp } from "./create-app.js";
export type { CreateWebAppOptions } from "./create-app.js";
