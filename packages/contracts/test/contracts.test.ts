/**
 * @atrium/contracts 运行时契约测试。
 */
import { describe, expect, it } from "vitest";
import { shortIdOf, UUID_V7_PATTERN } from "../src/index.js";
import { ERROR_CODES, ok, fail } from "../src/index.js";
import { FRAMEWORK_ICON_KEYS } from "../src/index.js";

describe("短 ID", () => {
  it("由资源类型前缀与 seq 组成", () => {
    expect(shortIdOf("note", 142)).toBe("note-142");
  });
});

describe("UUID v7 形态", () => {
  it("模式匹配标准 UUID v7(版本位 7,变体位 8/9/a/b)", () => {
    expect(UUID_V7_PATTERN.test("0192d4e6-8f00-7000-8000-000000000000")).toBe(true);
    expect(UUID_V7_PATTERN.test("0192d4e6-8f00-6000-8000-000000000000")).toBe(false);
  });
});

describe("API envelope", () => {
  it("ok 与 fail 结构正确", () => {
    expect(ok({ a: 1 })).toEqual({ data: { a: 1 } });
    expect(fail(ERROR_CODES.NOT_FOUND, "missing")).toEqual({
      error: { code: "not_found", message: "missing" },
    });
  });

  it("错误码稳定且唯一", () => {
    const codes = Object.values(ERROR_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("框架基础语义图标集合", () => {
  it("包含导航/设置/搜索等基础 key", () => {
    expect(FRAMEWORK_ICON_KEYS).toEqual(
      expect.arrayContaining(["home", "search", "settings", "theme", "notes"])
    );
  });

  it("key 全部为小写连字符形式", () => {
    for (const key of FRAMEWORK_ICON_KEYS) {
      expect(key).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
