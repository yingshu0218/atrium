import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "tooling/**/*.test.ts",
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "packages/**/test/**/*.test.ts",
      "packages/**/test/**/*.test.tsx",
      "modules/**/*.test.ts",
      "modules/**/*.test.tsx",
      "modules/**/test/**/*.test.ts",
      "modules/**/test/**/*.test.tsx",
      "examples/**/*.test.ts",
      "examples/**/*.test.tsx",
      "examples/**/test/**/*.test.ts",
      "examples/**/test/**/*.test.tsx",
    ],
  },
});
