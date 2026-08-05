import { defineConfig } from "@playwright/test";

/**
 * Playwright e2e(AGENTS §22 最低检查 test:e2e)。
 * 用独立端口(9920/9921)起 reference-app 服务端 + 静态反代,
 * 浏览器执行真实登录与业务链路。
 */
export default defineConfig({
  testDir: "./examples/reference-app/e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:9921",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "bash -c 'PORT=9920 ATRIUM_DB_PATH=/tmp/atrium-e2e.sqlite ATRIUM_MIRROR_WORKDIR=/tmp/atrium-e2e-mirror node examples/reference-app/dist/src/server.js & sleep 1.5; node tooling/scripts/static-proxy.mjs --port 9921 --static examples/reference-app/dist-web --api-target http://127.0.0.1:9920'",
    url: "http://127.0.0.1:9921/api/core/health",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
