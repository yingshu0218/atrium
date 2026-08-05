# Desktop(Tauri v2)占位

Atrium 提供 `@atrium/desktop-host` 作为 Tauri 宿主。本模板暂不包含桌面端实现:

- 需要 Rust 工具链(cargo)与 Tauri CLI;
- 桌面端通过同一服务端 API 工作,不直接访问数据库(Atrium §14);
- 数据镜像为 Server-only 能力,桌面端不保存 Git 凭证、不执行 Git(Atrium §19.2)。

接入方式(待桌面工具链就绪):

1. 在 `@atrium/desktop-host` 之上创建 Tauri app;
2. WebView 加载 `apps/web` 的构建产物(或远端部署地址);
3. 复用同一登录与 API。

详见 Atrium 仓库 `docs/PRD.md` §19 与 AGENTS.md §16。
