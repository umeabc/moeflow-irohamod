# MoeFlow 项目交接档案（iroha6 定制版）

> 项目已稳定并正式上线。本文件为项目背景的**自包含交接档案**，可随工作区/仓库迁移。
> 配套文件：`CHANGELOG-iroha4.md`（改动明细）、备份仓库 `umeabc/moeflow-backup`。
> 注：本档案为**脱敏版**，不含具体主机 IP、域名、端口、代理与凭据；实际部署环境信息由部署方自理。

---

## 1. 项目概览
- 名称：MoeFlow（萌翻 / 彩翻）—— 自托管漫画翻译协作平台。
- 基线：前端 `v1.1.7`、后端 `v1.1.8`。
- 镜像 tag：`moeflow-frontend:1.1.7-iroha6`、`moeflow-backend:1.1.8-iroha6`。

## 2. 部署拓扑（通用）
- 一组 Docker Compose 服务：mongodb、rabbitmq、backend、celery-default、celery-output、frontend。
- 外部存储：`STORAGE_TYPE=LOCAL_STORAGE`，后端/前端容器共享挂载。
- 环境配置：`.env` / `.env-backend`；数据（mongodb/rabbitmq 卷）与 `backup-*`。
- 前端 nginx 仅在 `/api` 前缀反代后端；前端以 `/api/v1/...` 访问后端（前端 baseURL 默认 `/api/`）。

## 3. 部署迁移方式
- 镜像 `docker save` 导出 tar → 生产侧 `docker load` → compose（**只替换 backend/frontend，保留 mongodb/rabbitmq 数据**）。
- 镜像 tar 命名：`moeflow-backend-1.1.8-iroha6.tar`（约 496MB）、`moeflow-frontend-1.1.7-iroha6.tar`（约 74MB）。

## 4. 本次改动摘要
详见 `CHANGELOG-iroha4.md`。
- **前端**：文件卡角色栏（翻译/校对/嵌字）自由文本编辑 + 自动填充 + 权限矩阵；「嵌字」变绿；项目集设置/改名(默认集可)/删除(仅管理员，级联)/移动(仅 admin+creator)；定制文案(彩翻/IRTrans/验证你不是鸽/网络爆炸了/一键机翻/SAYURI/IrohaTrans)；mascot 立绘 + favicon 像素猪；登录页展示存储剩余空间(管理员)；跨「组」文件搜索；暗色模式(明暗主题)；图片翻译器符号工具 + 拉伸条；AI 机翻预设更新。
- **后端**：File 模型新增 `translator/proofreader/typesetter`(StringField)；角色编辑按项目角色判权；导出只填 typesetter；项目集默认改名放开、删除仅 admin(级联)、移动仅 admin/creator；新增 `GET /v1/admin/storage-usage`、`GET /v1/files/search`；上传 MD5 去重（`FileDuplicateError`，code 8008）。

## 4.1 iroha6 新增（基于 iroha5）
- **一键机翻三模式**（仅标号 / 仅翻译 / 我全都要），按模型能力门控，模式下拉置于翻译模式栏最前。
- **注册重构**：移除邮箱验证码整块功能与邮箱白名单；注册需有效邀请码（多次使用、可停用、一码绑一团队、自动入团）；忘记密码统一联系站点管理员重置。
- **站点管理员管理页**：邀请码管理（创建 / 启停 / 删除，团队覆盖全站）+ 团队管理（全站团队概览、级联删除、头像）。
- **图片移动**：同项目集批量移动勾选图片，重复 md5 失败并说明原因；标号随图保留、翻译按语言重映射到新项目，进度条与计数正确。

## 5. 关键环境坑（务必牢记）
1. **前端 build 在资源充足的开发机上做**，再上传远程 `docker build`；远程内存不足跑不动前端构建（OOM）。
2. **Docker Hub 不稳定** → 用 daocloud `docker.m.daocloud.io` 拉基础镜像再 retag。
3. **pip 用阿里云镜像** `https://mirrors.aliyun.com/pypi/simple/`（清华 403）。
4. 前端 `apis` **默认导出是平铺**，无 `apis.file/apis.member`；用 `import { api }`（`api.file.editFile`）。误用 `apis.member` 会白屏。
5. Win Python 读 utf-8 需 `encoding='utf-8'`，默认 GBK 报错。

## 6. 备份
- 源码快照：GitHub 私有仓库 `umeabc/moeflow-backup`（`frontend/` + `backend/`）。
- 改动清单：`CHANGELOG-iroha4.md`（当前镜像版本 iroha6）。

## 7. 回退
- 如要回到官方：用官方 tag `v1.1.7` / `v1.1.8` 重新构建即可（本定制版与上游存在差异）。
