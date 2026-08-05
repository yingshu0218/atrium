# 备份与恢复

Atrium 部署的数据权威是服务端 SQLite 数据库与附件目录。
**可读数据镜像不是备份**(Atrium §20):它不备份源码、SQLite、Docker 配置,
不能替代 Litestream 与数据库恢复流程。

## 备份(Litestream)

`deploy/litestream.yml` 将 SQLite 持续复制到私有对象存储:

```bash
docker compose up -d litestream
```

- 必须使用**私有**桶/仓库,数据库文件不可公开;
- 数据库使用 WAL 模式,由 Litestream 处理一致复制;
- 数据镜像的 Git 工作目录(`.data-mirror`)不需要备份(可从远端 Git 仓库恢复,
  但远端仓库不是数据权威,恢复请以 SQLite 为准)。

## 恢复

1. 停止服务:`docker compose stop server`;
2. 从对象存储拉取最新的数据库文件:
   `litestream restore -o /app/data/workbench.sqlite <replica-url>`;
3. 校验数据库:`sqlite3 workbench.sqlite "PRAGMA integrity_check;"`;
4. 启动服务:`docker compose start server`;
5. 验证:登录、检查数据、触发一次数据镜像(管理 API)确认推送正常。

## 数据镜像的留档性质

远程 Git 仓库仅用于阅读与留档;恢复数据必须以 SQLite 备份为准。
镜像内不含 secret,但包含可直接阅读的个人数据,请确保仓库私有。
