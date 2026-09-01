# MoeFlow 项目交接档案（iroha4 定制版）

> 项目已稳定并正式上线。本文件为项目背景的**自包含交接档案**，可随工作区/仓库迁移。
> 配套文件：`CHANGELOG-iroha4.md`（改动明细）、备份仓库 `umeabc/moeflow-backup`。

---

## 1. 项目概览
- 名称：MoeFlow（萌翻 / 彩翻）—— 自托管漫画翻译协作平台。
- 定制基线：前端 `v1.1.7`、后端 `v1.1.8`。
- 镜像 tag：`moeflow-frontend:1.1.7-iroha4`、`moeflow-backend:1.1.8-iroha4`。

## 2. 环境与部署
| 角色 | 主机 | 说明 |
|---|---|---|
| 镜像构建 / Compose 部署机 | `REDACTED` | Debian 13；compose 目录 `/DEPLOY`；源码 `/BUILD-{frontend,backend}` |
| 生产机 | `REDACTED`（REDACTED） | SSH 5926；nginx 强制 HTTPS，须用 https 访问 |
| 生产机访问 | 经代理 `http://REDACTED:1445` | |

- 容器：mongodb、rabbitmq、backend、celery-default、celery-output、frontend。
- 外部存储：`/STORAGE/`（LOCAL_STORAGE）。
- 数据：`/DEPLOY` 下的 `.env` / `.env-backend` / `backup-*`。

## 3. 部署迁移方式
- 镜像 `docker save` 导出 tar → 生产机 `docker load` → compose（**只替换 backend/frontend，保留 mongodb/rabbitmq 数据**）。
- tar 位于 `REDACTED:/opt/`：
  - `moeflow-backend-1.1.8-iroha4.tar`（496MB）
  - `moeflow-frontend-1.1.7-iroha4.tar`（73MB）

## 4. 本次改动摘要
见 `CHANGELOG-iroha4.md`。
- 前端：角色栏（翻译/校对/嵌字）自由文本编辑 + 自动填充 + 权限矩阵；「嵌字」变绿；项目集设置/改名(默认集可)/删除(仅管理员，级联)/移动(仅 admin+creator)；定制文案(彩翻/IRTrans/验证你不是鸽/网络爆炸了/一键机翻/SAYURI/IrohaTrans)；mascot 立绘 + favicon 像素猪。
- 后端：File 模型新增 `translator/proofreader/typesetter`(StringField)；角色编辑按项目角色判权；导出只填 typesetter；项目集默认改名放开、删除仅 admin(级联)、移动仅 admin/creator。

## 5. 关键环境坑（务必牢记）
1. **前端 build 在本地 Windows 做**，远程 2GB 内存跑不动（OOM）。本地 `npm run build` 后上传 `build/` 再 `docker build`。
2. **Docker Hub 不稳定** → 用 daocloud `docker.m.daocloud.io` 拉基础镜像再 retag。
3. **pip 用阿里云镜像** `https://mirrors.aliyun.com/pypi/simple/`（清华 403）。
4. 前端 `apis` **默认导出是平铺**，无 `apis.file/apis.member`；用 `import { api }`（`api.file.editFile`）。误用 `apis.member` 会白屏。
5. Win Python 读 utf-8 需 `encoding='utf-8'`，默认 GBK 报错。

## 6. 备份
- 源码快照：GitHub 私有仓库 `umeabc/moeflow-backup`（`frontend/` + `backend/`，commit `629e9f0`）。
- 改动清单：`CHANGELOG-iroha4.md`。
- 会话操作轨迹：agent 记忆 `JOURNAL.jsonl`（10 条事件）。

## 7. 回退
- 如要回到官方：用官方 tag `v1.1.7` / `v1.1.8` 重新构建即可（本定制版与上游存在差异）。
