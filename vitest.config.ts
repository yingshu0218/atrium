import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tooling/**/*.test.ts",
      "packages/**/*.test.ts",
      "modules/**/*.test.ts",
      "examples/**/*.test.ts",
    ],
  },
});
