/**
 * reference-app 端到端(浏览器级):登录 → 创建便签 → 列表可见。
 * 依赖构建产物(examples/reference-app/dist 与 dist-web),先运行
 * `pnpm typecheck` 与 `pnpm --filter @atrium/reference-app exec vite build`。
 */
import { expect, test } from "@playwright/test";

test("登录后创建便签并在列表可见", async ({ page }) => {
  await page.goto("/");

  // 登录页(web-host LoginPage)。
  await page.getByLabel("密码").fill("atrium-dev-password");
  await page.getByRole("button", { name: "登录" }).click();

  // 登录后外壳出现,侧栏含"便签"菜单(语义图标 + 活动高亮)。
  await page.getByRole("link", { name: "便签" }).click();
  await expect(page).toHaveURL(/\/notes/);

  // 新建便签(notes Web 页面)。
  await page.getByRole("button", { name: "新建便签" }).click();
  await page.getByLabel("标题").fill("e2e 测试便签");
  await page.getByLabel("正文").fill("来自 Playwright 的端到端验证");
  await page.getByRole("button", { name: "保存" }).click();

  // 返回列表,新便签可见。
  await expect(page.getByText("e2e 测试便签")).toBeVisible();
});
