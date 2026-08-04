/**
 * 架构依赖测试 — 验证 AGENTS.md §5 的依赖方向矩阵。
 *
 * 用 TypeScript AST 提取每个 workspace 包的 src/** 真实 import,
 * 断言:
 *  1. @atrium/* 依赖落在允许矩阵内(禁止的依赖方向);
 *  2. 相对路径不得逃逸包目录(禁止绕过 package exports);
 *  3. 不得引用未知的 @atrium 包。
 *
 * ESLint 层(eslint.config.mjs)负责粗粒度包名禁止,这里负责完整矩阵。
 */
import { describe, expect, it } from "vitest";
import {
  createSourceFile,
  ScriptTarget,
  isImportDeclaration,
  isExportDeclaration,
  isStringLiteral,
  type ImportDeclaration,
  type ExportDeclaration,
} from "typescript";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

interface WorkspacePackage {
  name: string;
  dir: string;
  srcDir: string;
}

interface Violation {
  file: string;
  specifier: string;
  kind: "forbidden-package" | "relative-escape" | "unknown-atrium";
  detail: string;
}

/**
 * 允许的依赖矩阵(AGENTS.md §5)。
 * key 是被依赖的包,value 是允许被谁依赖?不 — key 是当前包,value 是它允许依赖的包。
 */
const ALLOWED_DEPENDENCIES: Record<string, readonly string[]> = {
  "@atrium/contracts": [],
  "@atrium/core": ["@atrium/contracts"],
  "@atrium/ui": ["@atrium/contracts", "@atrium/theme"],
  "@atrium/theme": ["@atrium/contracts"],
  "@atrium/server-host": [
    "@atrium/contracts",
    "@atrium/core",
    "@atrium/ui",
    "@atrium/theme",
    "@atrium/data-mirror",
  ],
  "@atrium/web-host": [
    "@atrium/contracts",
    "@atrium/core",
    "@atrium/ui",
    "@atrium/theme",
  ],
  "@atrium/desktop-host": [
    "@atrium/contracts",
    "@atrium/core",
    "@atrium/ui",
    "@atrium/theme",
  ],
  "@atrium/mcp-host": ["@atrium/contracts", "@atrium/core"],
  "@atrium/data-mirror": ["@atrium/contracts", "@atrium/core"],
  "@atrium/notes": ["@atrium/contracts", "@atrium/core", "@atrium/ui", "@atrium/theme"],
};

/** 应用是组合边界,可依赖全部 @atrium 包,不受矩阵限制。 */
const UNRESTRICTED_PACKAGES = new Set(["@atrium/reference-app"]);

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (full.endsWith(".ts") && !full.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function collectPackages(): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];
  for (const scope of ["packages", "modules", "examples"]) {
    const scopeDir = join(repoRoot, scope);
    for (const entry of readdirSync(scopeDir)) {
      const dir = join(scopeDir, entry);
      if (!statSync(dir).isDirectory()) continue;
      const pkgJsonPath = join(dir, "package.json");
      if (!existsSync(pkgJsonPath)) continue;
      const { name } = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
        name: string;
      };
      packages.push({ name, dir, srcDir: join(dir, "src") });
    }
  }
  return packages;
}

function collectViolations(packages: WorkspacePackage[]): Violation[] {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const violations: Violation[] = [];

  for (const pkg of packages) {
    const allowed = ALLOWED_DEPENDENCIES[pkg.name] ?? null;
    if (allowed === null && !UNRESTRICTED_PACKAGES.has(pkg.name)) {
      violations.push({
        file: pkg.dir,
        specifier: "",
        kind: "unknown-atrium",
        detail: `包 ${pkg.name} 不在依赖矩阵中,请先在 AGENTS.md 与架构测试中确认依赖方向`,
      });
      continue;
    }

    for (const file of listTsFiles(pkg.srcDir)) {
      const sourceText = readFileSync(file, "utf8");
      const sourceFile = createSourceFile(file, sourceText, ScriptTarget.Latest, true);

      const specifiers: string[] = [];
      for (const statement of sourceFile.statements) {
        if (isImportDeclaration(statement)) {
          specifiers.push(moduleSpecifier(statement));
        } else if (isExportDeclaration(statement)) {
          const spec = exportSpecifier(statement);
          if (spec) specifiers.push(spec);
        }
      }

      for (const specifier of specifiers) {
        if (specifier.startsWith(".")) {
          const resolved = resolve(dirname(file), specifier);
          if (!resolved.startsWith(pkg.srcDir + sep)) {
            violations.push({
              file,
              specifier,
              kind: "relative-escape",
              detail: `相对路径逃逸出包目录,必须改为包名引用(遵守 package exports)`,
            });
          }
          continue;
        }

        if (specifier.startsWith("@atrium/")) {
          if (UNRESTRICTED_PACKAGES.has(pkg.name)) continue;
          if (!byName.has(specifier)) {
            violations.push({
              file,
              specifier,
              kind: "unknown-atrium",
              detail: `引用了 workspace 中不存在的包`,
            });
            continue;
          }
          if (!allowed!.includes(specifier)) {
            violations.push({
              file,
              specifier,
              kind: "forbidden-package",
              detail: `${pkg.name} 不允许依赖 ${specifier}(允许:${allowed!.join(", ")})`,
            });
          }
        }
      }
    }
  }

  return violations;
}

function moduleSpecifier(node: ImportDeclaration): string {
  const spec = node.moduleSpecifier;
  if (isStringLiteral(spec)) return spec.text;
  return `<non-literal: ${spec.getText()}>`;
}

function exportSpecifier(node: ExportDeclaration): string | null {
  const spec = node.moduleSpecifier;
  if (spec && isStringLiteral(spec)) return spec.text;
  return null;
}

describe("架构依赖方向", () => {
  const packages = collectPackages();

  it("收集到预期的 workspace 包", () => {
    const names = packages.map((p) => p.name).sort();
    expect(names).toEqual(
      [
        "@atrium/contracts",
        "@atrium/core",
        "@atrium/data-mirror",
        "@atrium/desktop-host",
        "@atrium/mcp-host",
        "@atrium/notes",
        "@atrium/reference-app",
        "@atrium/server-host",
        "@atrium/theme",
        "@atrium/ui",
        "@atrium/web-host",
      ].sort()
    );
  });

  const violations = collectViolations(packages);

  it("所有 @atrium 依赖落在允许矩阵内,无相对路径逃逸,无未知包", () => {
    expect(violations).toEqual([]);
  });

  it("host 包不得 import 具体模块(如 @atrium/notes)", () => {
    const hostModuleImports = violations.filter(
      (v) =>
        v.kind === "forbidden-package" &&
        (v.file.includes("packages" + sep) || v.file.includes("modules" + sep))
    );
    // 具体违规已在上一用例统一断言;这里确保规则本身覆盖 host → 模块方向
    expect(ALLOWED_DEPENDENCIES["@atrium/server-host"]).not.toContain(
      "@atrium/notes"
    );
    expect(hostModuleImports).toEqual([]);
  });
});
