# imgstore — 轻量图片存储服务（Moeflow REMOTE_HTTP 存储后端）

Go 单二进制实现，Docker 承载，镜像约 7MB、常驻内存 < 20MB。

## 功能

- **HTTP API**：上传 `/put/<prefix>/<name>`、删除 `/delete/<prefix>/<name>`、列表 `/list/<prefix>`、用量 `/stats`
- **外链直读**：`GET /files/<prefix>/<name>` 匿名直读（支持 HTTP 外链；HTTPS 可前置 nginx/Caddy 反代）
- **多级 key**：key 支持 `outputs/<id>/<file>` 嵌套路径（前缀 + 任意层级文件名）
- **磁盘空间**：`/stats` 返回 `bytes`（已用）/ `total` / `free`（数据目录所在磁盘容量与剩余，statfs）
- **鉴权**：写操作（PUT/DELETE/LIST/STATS）需 `X-Api-Key`；读操作匿名
- **轻量**：进程内列表缓存（60s），无外部依赖

## 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `IMGSTORE_API_KEY` | 写操作鉴权密钥（必填，空=禁止写） | 空 |
| `IMGSTORE_DATA_DIR` | 数据目录 | `./data` |
| `IMGSTORE_LISTEN` | 监听地址 | `:8080` |
| `IMGSTORE_MAX_BODY` | 单文件最大字节 | 1GB |

## 构建

```bash
docker build -t ghcr.io/umeabc/imgstore:latest .
```

## 运行

```bash
docker run -d --name imgstore \
  -e IMGSTORE_API_KEY=你的密钥 \
  -v /data/imgstore:/data \
  -p 8080:8080 \
  ghcr.io/umeabc/imgstore:latest
```

## 与 Moeflow 配合

在 Moeflow `.env-backend` 中：

```ini
STORAGE_TYPE=REMOTE_HTTP
STORAGE_DOMAIN=http://<imgstore主机>:8080/files/
REMOTE_HTTP_BASE_URL=http://<imgstore主机>:8080
REMOTE_HTTP_API_KEY=<与 IMGSTORE_API_KEY 相同>
```

部署编排见仓库 `umeabc/moeflow-irohamod-imgstore`。
