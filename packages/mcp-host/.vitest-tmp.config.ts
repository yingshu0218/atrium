import { defineConfig } from "vitest/config";

export default defineConfig({
  // node_modules 只读:把 vite 的 config 转译缓存与运行缓存放到包内可写目录。
  configCacheDir: "/home/ubuntu/reasonix/station/packages/mcp-host/.vite-cache-tmp",
  cacheDir: "/home/ubuntu/reasonix/station/packages/mcp-host/.vite-cache-tmp/.vite",
  test: {
    environment: "jsdom",
    include: ["packages/mcp-host/test/**/*.test.ts"],
  },
});
