# MoeFlow 项目交接档案（iroha10 定制版）

> 项目已稳定并正式上线。本文件为项目背景的**自包含交接档案**，可随工作区/仓库迁移。
> 配套文件：`CHANGELOG-iroha4.md`（改动明细）、备份仓库 `umeabc/moeflow-backup`。
> 注：本档案为**脱敏版**，不含具体主机 IP、域名、端口、代理与凭据；实际部署环境信息由部署方自理。

---

## 1. 项目概览
- 名称：MoeFlow（萌翻 / 彩翻）—— 自托管漫画翻译协作平台。
- 基线：前端 `v1.1.7`、后端 `v1.1.8`。
- 镜像 tag：`moeflow-frontend:1.1.7-iroha10`、`moeflow-backend:1.1.8-iroha10`。

## 2. 部署拓扑（通用）
- 一组 Docker Compose 服务：mongodb、redis、backend、celery、frontend。
- 外部存储：支持 `STORAGE_TYPE`：
  - `LOCAL_STORAGE`（默认）：后端/前端容器共享挂载。
  - `R2`：Cloudflare R2（S3 兼容 + 公开桶直读，支持多账号多桶负载均衡）。
  - `REMOTE_HTTP`：**独立图片存储服务 imgstore**（Go 单二进制，镜像约 7MB；部署编排见 `umeabc/moeflow-irohamod-imgstore`），Moeflow 上传/删除/列表/用量走 imgstore HTTP API，图片外链直读 imgstore 主机。
- 环境配置：`.env` / `.env-backend`；数据（mongodb/redis 卷）与 `backup-*`。
- 前端 nginx 仅在 `/api` 前缀反代后端；前端以 `/api/v1/...` 访问后端（前端 baseURL 默认 `/api/`）。

## 3. 部署迁移方式
- 镜像 `docker save` 导出 tar → 生产侧 `docker load` → compose（**只替换 backend/frontend，保留 mongodb/rabbitmq 数据**）。
- 镜像 tar 命名：`moeflow-backend-1.1.8-iroha10.tar`（约 537MB）、`moeflow-frontend-1.1.7-iroha10.tar`（约 77MB）。

## 4. 本次改动摘要
详见 `CHANGELOG-iroha4.md`。
- **前端**：文件卡角色栏（翻译/校对/嵌字）自由文本编辑 + 自动填充 + 权限矩阵；「嵌字」变绿；项目集设置/改名(默认集可)/删除(仅管理员，级联)/移动(仅 admin+creator)；定制文案(彩翻/IRTrans/验证你不是鸽/网络爆炸了/一键机翻/SAYURI/IrohaTrans)；mascot 立绘 + favicon 像素猪；存储空间集成在 admin 面板（dashboard「存储空间」卡片 + 存储概览页）；跨「组」文件搜索；暗色模式(明暗主题)；图片翻译器符号工具 + 拉伸条；AI 机翻预设更新。
- **后端**：File 模型新增 `translator/proofreader/typesetter`(StringField)；角色编辑按项目角色判权；导出只填 typesetter；项目集默认改名放开、删除仅 admin(级联)、移动仅 admin/creator；新增 `GET /v1/admin/storage-usage`、`GET /v1/files/search`；上传 MD5 去重（`FileDuplicateError`，code 8008）。

## 4.1 iroha6 新增（基于 iroha5）
- **一键机翻三模式**（仅标号 / 仅翻译 / 我全都要），按模型能力门控，模式下拉置于翻译模式栏最前。
- **注册重构**：移除邮箱验证码整块功能与邮箱白名单；注册需有效邀请码（多次使用、可停用、一码绑一团队、自动入团）；忘记密码统一联系站点管理员重置。
- **站点管理员管理页**：邀请码管理（创建 / 启停 / 删除，团队覆盖全站）+ 团队管理（全站团队概览、级联删除、头像）。
- **图片移动**：同项目集批量移动勾选图片，重复 md5 失败并说明原因；标号随图保留、翻译按语言重映射到新项目，进度条与计数正确。

## 4.2 iroha7 新增（基于 iroha6）
- **自定义文案（按语言分组）**：`custom_messages` 按 `zh-CN`/`en` 分区存储；修复 `toUnderScoreCase` 破坏 key（如 `site.englishName`）导致改英文名不生效的坑；新增 `site.englishName` 配置项，标题展示 `站点名 · 英文名`。
- **品牌文案移至站点设置页**：站点名 / 标语 / 英文名在站点设置页中英文分别编辑（留空恢复默认），自定义文案入口已移除。
- **站点品牌图片（mascot / favicon）**：站点设置页上传 / 替换立绘与标签页图标（未设置回退默认）；公开 `/v1/site/brand-asset/<type>` 服务图片。
- **上传文件名去 emoji**：图片上传时自动清除文件名中的 emoji。
- **全体用户通知系统**：管理员发布公告（`/v1/admin/notices`），登录弹未读通知（点已读不再弹），用户菜单「通知一览」查历史；删除通知自动清理用户已读记录。

## 4.3 iroha8 新增（基于 iroha7）
- **上传文件名强制去 emoji（服务端兜底）**：新增 `backend/app/utils/filename.py`，上传入口统一清洗 multipart 文件名再入库，解决前端清洗兜不住的问题。
- **翻译者累积记录**：打标号 / 机翻全能模式自动累积处理过该图的用户到「翻译」字段（顿号分隔去重）；手动编辑直接覆盖（`replace_translator`）。
- **移动图片仅团队管理员可用**：移动按钮与目标列表接口均限站点管理员 / 创建人 / 管理员 / 监理；普通成员 403。
- **翻译失败详情**：自动翻译失败时输出具体到哪一步（调用模型 / 保存翻译）+ 相关参数（模式 / 模型 / 目标语言 / 错误详情）。

## 4.4 iroha9 新增（基于 iroha8）
- **外部链接下载规避 Cloudflare 拦截**：`download_external` 原用 Python `requests` 下载，TLS/HTTP2 指纹非浏览器特征，被 Cloudflare 等 CDN 拦截；改用 **`curl_cffi`**（`impersonate="chrome"` 伪造 Chrome TLS/HTTP2 指纹）后直连即可下载 Danbooru 等 Cloudflare 保护图源的原图（2.4MB 验证通过）。
- 依赖：`curl_cffi==0.14.0`（与项目 `cffi==1.17.1` 兼容；0.15+ 需 cffi>=2.0 冲突）。
- 实现：`backend/app/services/image_download.py` 全部请求注入 `impersonate="chrome"`、移除 `stream=True`、异常类改用 `curl_cffi.requests.exceptions.RequestException`。
- 镜像 tag：`moeflow-backend:1.1.8-iroha9`。

## 4.5 iroha10 新增（基于 iroha9）
- **从社交媒体 / 外部链接获取图片（多源多图）**：项目文件列表「上传」按钮旁新增「从社交媒体获取图片」下拉，四个来源——**从 X(Twitter) / Bluesky / Pixiv / 外部链接** 获取；服务器端下载图片直接导入项目（不走本地浏览器），逐张组级 MD5 去重并提示导入/重复数；多图时文件名追加 P1/P2 页码。
  - X：站点配置 `auth_token`/`ct0`，请求 `cdn.syndication.twimg.com/tweet-result` 解析全部图片，`?name=orig` 取原图。
  - Bluesky：`resolveHandle` → `getPostThread`，AppView `embed.images` 全部 fullsize URL，加 `@jpeg` 强制 JPEG 输出。
  - Pixiv：`/ajax/illust/<id>` 拿标题/原图 URL，多页调 `/ajax/illust/<id>/pages`，带 `Referer` 下载；可选 `PHPSESSID` 支持 R18。
  - 外部链接：直接下载图片直链，校验图片内容。
- **按用户抓取全部图片（X / Bluesky / Pixiv 用户）**：新增「从 X 获取（用户）」「从 Bluesky 获取（用户）」「从 Pixiv 获取（用户）」三个来源，输入用户主页地址抓取该用户**媒体时间线 / 贴文 / 作品的全部图片**。
  - X 用户：GraphQL（`UserByScreenName` + `UserMedia` 分页，max 40 页）拿媒体时间线全部 `media_url_https`；必须带 `Authorization: Bearer guest token` + `X-Csrf-Token=ct0`。
  - Bluesky 用户：`resolveHandle` → `getAuthorFeed` 分页抓取带 `embed.images` 的贴文图片；支持匿名或账号模式（站点设置）。
  - Pixiv 用户：`/ajax/user/<uid>/profile/all` 作品列表 → `/ajax/illust/<id>/pages` 全部页面原图。
- **进度式导入**：发起时先枚举图片 URL 存任务（`MediaImportTask` 模型，Mongo 持久化）并返回 `{task_id, total}`，后台线程逐张下载入库更新进度；前端轮询 `GET /v1/files/from-url-task/<task_id>` 显示「正在下载第 a/b 张，有 X 张可入库」+ 进度条，完成后提示已导入/重复数。`_run_media_import_task` 按 `download_kind` 区分 `twitter`/`pixiv`/`bluesky`。
- 关键文件：后端 `services/image_download.py`（`enumerate_twitter_user_media` / `enumerate_bluesky_user_media` / `enumerate_pixiv_user_media` 等）、`apis/file_download.py`（`ProjectFileFromURLAPI`，source 校验含 `twitter_user`/`bluesky_user`/`pixiv_user`）、`models/media_import_task.py`；前端 `FileList.tsx`（下拉）、`ImportFromURLModal.tsx`（来源弹窗 + 进度）、`AdminSiteSetting.tsx`（Twitter auth/ct0、HTTP 代理、Pixiv PHPSESSID、Bluesky 匿名/账号）、`apis/file.ts`/`siteSetting.ts`、i18n。
- **独立图片存储服务（STORAGE_TYPE=REMOTE_HTTP + imgstore）**：新增轻量图片存储服务 **imgstore**（Go 单二进制、Docker 承载、镜像约 7MB，源码在 `imgstore/` 目录，部署编排见 `umeabc/moeflow-irohamod-imgstore`）；Moeflow 新增 `REMOTE_HTTP` 存储驱动（`oss.py` upload/download/is_exist/delete/rmdir/sign_url/remote_stats 全走 imgstore HTTP API），图片外链直读 `STORAGE_DOMAIN`，可将图片落到**独立主机**；imgstore 支持**多级 key**（`outputs/<id>/<file>`）与 `/stats` 磁盘空间（bytes/total/free，statfs）。
- **imgstore 存储概览（admin）**：dashboard「存储空间」卡片在 REMOTE_HTTP 模式显示「imgstore 总存储占用」（已用/剩余）；管理后台新增「imgstore 存储概览」页（服务 URL / 已用 / 剩余 / 总容量 / 占用比例）；`GET /v1/admin/imgstore-overview`。LOCAL / R2 模式照常显示。
- **缩略图与删除缓存竞态修复**：缩略图任务判断「原图存在」从列表缓存 `is_exist` 改为**实时 download**（修复批量导入只生成 1 张缩略图）；`upload/delete/rmdir` 后列表缓存**双向失效**（子前缀 + 父前缀）。
- **社交媒体文件名格式**：X → `Twitter-<前40字>-<YYYYMMDDHHMM>-P<n>`、Bluesky → `Bluesky-...`、Pixiv → `Pixiv-<PID>-<标题>-P<n>`；去 # 号与 emoji。
- 镜像 tag：`moeflow-frontend:1.1.7-iroha10` / `moeflow-backend:1.1.8-iroha10`。

## 5. 关键环境坑（务必牢记）
1. **前端 build 在资源充足的开发机上做**，再上传远程 `docker build`；远程内存不足跑不动前端构建（OOM）。
2. **Docker Hub 不稳定** → 用 daocloud `docker.m.daocloud.io` 拉基础镜像再 retag。
3. **pip 用阿里云镜像** `https://mirrors.aliyun.com/pypi/simple/`（清华 403）。
4. 前端 `apis` **默认导出是平铺**，无 `apis.file/apis.member`；用 `import { api }`（`api.file.editFile`）。误用 `apis.member` 会白屏。
5. Win Python 读 utf-8 需 `encoding='utf-8'`，默认 GBK 报错。

## 6. 备份
- 源码快照：GitHub 私有仓库 `umeabc/moeflow-backup`（`frontend/` + `backend/`）。
- 改动清单：`CHANGELOG-iroha4.md`（当前镜像版本 iroha10）。

## 7. 回退
- 如要回到官方：用官方 tag `v1.1.7` / `v1.1.8` 重新构建即可（本定制版与上游存在差异）。
