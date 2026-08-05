# 版本锁定与依赖策略

关联决策:[ADR-0002](adr/ADR-0002.md)(统一版本)。

## 规则

- `@atrium/*` 采用**统一版本号**(ADR-0002);应用依赖必须锁定精确版本
  或受控范围,Atrium 发新版本**不自动升级**应用;
- 升级由应用仓库显式发起:先读 CHANGELOG/migration guide,再改依赖版本并验证;
- breaking change 必须提供迁移说明(PRD §22 / AGENTS §21);
- 引导阶段(尚未发布到 npm)可以使用不可变 Git tag 依赖;
  稳定后发布到受控 npm registry(PRD §22 建议 GitHub Packages);
- **禁止**复制 Atrium 源码到应用仓库长期维护私有分叉;
  发现通用缺口时,先在 Atrium 修复并发布,再升级应用依赖(AGENTS §21)。

## 示例(发布后)

```jsonc
// 应用 apps/server/package.json
{
  "dependencies": {
    "@atrium/contracts": "0.1.0",   // 精确锁定
    "@atrium/core": "0.1.0",
    "@atrium/notes": "0.1.0",
    "@atrium/server-host": "0.1.0"
  }
}
```

引导阶段(未发布)可用 `workspace:*` 或本地路径;正式发布后改用版本号锁定。

## 当前状态

- 版本:所有包统一 `0.1.0`(占位,未发布);
- 发布流程:待阶段 7 第一个独立应用接入时,按 ADR-0002 与本文档执行。
