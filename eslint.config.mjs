import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

/**
 * Atrium 架构依赖守卫(ESLint 层)。
 *
 * 依赖矩阵的完整校验由 tooling/arch/arch-tests.test.ts(TS AST)负责;
 * 这里用精确包名 paths 做粗粒度拦截。
 * 注意:no-restricted-imports 的 patterns 使用 micromatch,
 * extglob(如 "@atrium/!(a|b)")实测不生效,因此一律用精确枚举。
 */

const repoRoot = dirname(fileURLToPath(import.meta.url));

function listPackageNames(scope) {
  const scopeDir = join(repoRoot, scope);
  return readdirSync(scopeDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try {
        const { name } = JSON.parse(
          readFileSync(join(scopeDir, entry.name, "package.json"), "utf8")
        );
        return name;
      } catch {
        return null;
      }
    })
    .filter((name) => typeof name === "string");
}

const FRAMEWORK_PACKAGES = listPackageNames("packages");
const MODULE_PACKAGES = listPackageNames("modules");
const ALL_ATRIUM_PACKAGES = [...FRAMEWORK_PACKAGES, ...MODULE_PACKAGES];

/** 模块不得依赖的宿主 / 引擎实现包(AGENTS.md §5.8) */
const HOST_OR_ENGINE_PACKAGES = [
  "@atrium/server-host",
  "@atrium/web-host",
  "@atrium/desktop-host",
  "@atrium/mcp-host",
  "@atrium/data-mirror",
];

const FRAMEWORK_PACKAGE_SOURCES = [
  "packages/contracts/src/**/*.ts",
  "packages/core/src/**/*.ts",
  "packages/ui/src/**/*.ts",
  "packages/theme/src/**/*.ts",
  "packages/server-host/src/**/*.ts",
  "packages/web-host/src/**/*.ts",
  "packages/desktop-host/src/**/*.ts",
  "packages/mcp-host/src/**/*.ts",
  "packages/data-mirror/src/**/*.ts",
];

function asRestrictedPaths(names, message) {
  return { paths: names.map((name) => ({ name, message })) };
}

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.git/**",
      "**/*.tsbuildinfo",
    ],
  },
  ...tseslint.configs.recommended,
  {
    // 框架包不得依赖任何具体业务模块(AGENTS.md §5.1)
    files: FRAMEWORK_PACKAGE_SOURCES,
    rules: {
      "no-restricted-imports": [
        "error",
        asRestrictedPaths(
          MODULE_PACKAGES,
          "框架包禁止依赖具体业务模块;业务判断必须留在应用仓库(AGENTS.md §5)。"
        ),
      ],
    },
  },
  {
    // core 只允许依赖 contracts(AGENTS.md §5)
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        asRestrictedPaths(
          ALL_ATRIUM_PACKAGES.filter((name) => name !== "@atrium/contracts"),
          "core 只允许依赖 @atrium/contracts。"
        ),
      ],
    },
  },
  {
    // 仅 server-host 可以组合 Data Mirror Engine;其他宿主不得依赖其实现
    files: [
      "packages/web-host/src/**/*.ts",
      "packages/desktop-host/src/**/*.ts",
      "packages/mcp-host/src/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        asRestrictedPaths(
          ["@atrium/data-mirror"],
          "仅 server-host 可以组合 Data Mirror Engine;其他宿主不得依赖 Git 执行实现(AGENTS.md §5.8)。"
        ),
      ],
    },
  },
  {
    // 模块只能依赖 contracts 及公开的 core/ui/theme API;模块之间不得互相 import
    files: ["modules/*/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        asRestrictedPaths(
          [...HOST_OR_ENGINE_PACKAGES, ...MODULE_PACKAGES],
          "模块只能依赖 contracts 及公开的 core/ui/theme API,不得依赖宿主、引擎或其他模块(AGENTS.md §5)。"
        ),
      ],
    },
  }
);
