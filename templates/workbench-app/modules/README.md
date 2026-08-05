# 应用专有模块

放本应用独有的业务模块(与 Atrium 官方模块 `modules/notes` 同结构):

```
modules/<name>/
  manifest.ts
  shared/
  server/
  web/
  agent/
  offline/
  migrations/
```

官方通用模块从 `@atrium/*` 依赖安装;应用专有模块放这里。
通用能力(标签、关联、附件、搜索、capture)由 Atrium core 提供,不要在模块里复制实现。
