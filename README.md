# MoeFlow 定制版（iroha16-fix6）备份仓库

> 本仓库为 MoeFlow（彩翻 / 萌翻）**内部定制版本**的源码备份仓库（私有）。
> 定制基线：前端 `v1.1.7`、后端 `v1.1.8`；本次待构建测试镜像标记：`ghcr.io/umeabc/moeflow-frontend:v1.1.7-iroha16-fix6`、`ghcr.io/umeabc/moeflow-backend:v1.1.8-iroha16-fix6`。iroha16-fix6 已实现待验收，尚未构建镜像或部署。历史部署记录保留在变更文档中。
> 本文档为**脱敏版**，不含具体主机、域名、端口、代理与凭据信息。

---

## iroha16-fix6（2026-11-02，已实现待验收 / 待部署）

- 待构建测试镜像标记：前端 `v1.1.7-iroha16-fix6` / 后端 `v1.1.8-iroha16-fix6`。本次未构建或部署镜像，未操作测试机、正式机，未提交 Git；不代表已更新 GHCR 或线上版本。
- 后台新增「参与统计」：管理员接口 `GET /v1/admin/contribution-stats`，页面 `/admin/contribution-stats`，入口在管理分组。一次查询用户、一次遍历有效图片，不按用户查询文件。按当前 `File` 的 translator / proofreader / typesetter 负责人字符串统计参与图片数；支持顿号、中文逗号、英文逗号，trim 后同图同角色去重，与 `User.name` 精确匹配。仅计 `IMAGE` 且 `activated=True`，包含所有项目状态；列出未封禁、未注销用户及零计数用户，排除 `[Redacted]`，按合计降序、姓名升序。表格包含用户、邮箱、翻译、校对、嵌字、合计，支持分页、空态、加载态；中英文翻译及 locale JSON 已更新。
- 图片移动目标接口 `GET /v1/projects/<project_id>/move-target-projects` 增加 `status=ProjectStatus.WORKING`，排除完结、归档、计划完结、计划删除、已删除项目；保持项目集、类型 / 作者模式隔离与原权限。已检查 `FileMoveModal.tsx` 直接使用接口列表，无需前端过滤。
- 新增后端测试 `tests/api/test_admin_stats_api.py`：覆盖统计多角色 / 多人 / 三种分隔符 / 去重 / 精确匹配 / 零计数 / banned 与脱敏用户排除 / 图片与激活条件 / 历史状态，以及移动目标六种状态、四种类型组合与权限。
- 后端使用现有 `.review-minimal`、`.review-deps` 依赖与 `.env.test.sample` 的本地 mongomock（`moeflow_test`），命令见下方。完整相关测试结果为 **16 passed, 1 failed**；排除既有上传失败时 **16 passed, 1 deselected**。既有 `test_upload_project_file` 在第二次上传同内容文件时触发 `FileDuplicateError`（8008）；在内存加载 HEAD 原版 `app/apis/file.py` 后单独运行仍失败，确认与本次修改无关，未修改该既有行为。
- 前端 `npm.cmd run typecheck` 通过；`npm.cmd test -- --runInBand`：**2 suites / 19 tests passed**；`npm.cmd run lint`：**0 errors / 253 warnings**；`npm.cmd run build` 通过（保留既有 eval / 大 chunk 警告）。Windows PowerShell 禁用 npm.ps1，使用 npm.cmd。构建初次因系统临时目录删除权限失败，设置 `TEMP` / `TMP` 为工作区 `frontend/.fix6-tmp` 后通过。
- `npm.cmd run build:locale` 已尝试，tsx 因 Windows `uv_os_get_passwd ENOMEM` 无法启动；使用现有 TypeScript `transpileModule` 将同一生成脚本转为临时 CommonJS 后执行，成功生成 `en.json` / `zh-cn.json`，临时脚本已清理；未修改 package.json 或依赖。
- 未决项：上述既有上传测试失败；尚未进行部署验收与真实 MongoDB 大数据量性能验证。统计以当前负责人记录为准，负责人字段被更改或用户改名后会随当前记录变化，不回溯操作日志。

后端复现（在 `backend/` 下，显式加载测试配置，不连接远程服务）：

```powershell
$env:PYTHONPATH="$PWD/.review-minimal;$PWD/.review-deps"
python -c "from dotenv import load_dotenv; load_dotenv('.env.test.sample'); import pytest; raise SystemExit(pytest.main(['-o','addopts=','tests/api/test_admin_stats_api.py','tests/api/test_admin_api.py','tests/api/test_file_api.py','-q','-k','not test_upload_project_file']))"
```


## 项目简介

MoeFlow（彩翻）是一款**自托管漫画翻译协作平台**：支持上传漫画/图片、OCR 识别、逐条翻译、校对、嵌字、导出等完整流程。

本仓库在官方 `moeflow-com/moeflow` 的基础上做了一套内部定制，并记录了本次迭代的**改动明细**与**交接档案**。

## 目录结构

| 路径 | 说明 |
|---|---|
| `frontend/` | 前端源码（React + antd + Emotion），基于官方 `moeflow-frontend` v1.1.7 |
| `backend/` | 后端源码（Python Flask + MongoDB + Celery），基于官方 `moeflow-backend` v1.1.8 |
| `CHANGELOG-iroha4.md` | 改动明细（完整、脱敏） |
| `MOEFLOW-PROJECT.md` | 项目交接档案（完整、脱敏） |

## 定制概览

在官方基础上的主要定制，详见 [`CHANGELOG-iroha4.md`](./CHANGELOG-iroha4.md)。

- **文件卡角色栏**：文件卡新增「翻译 / 校对 / 嵌字」负责人展示，支持自由文本编辑与自动填充，按项目角色权限矩阵控制；「嵌字」卡片绿色高亮。
- **项目集**：设置 / 改名（默认集可改）、删除（仅站点管理员，级联物理删除）、项目移动（仅 admin / creator）。
- **存储剩余空间（admin 面板）**：存储空间集成在管理员面板（dashboard「存储空间」卡片 + 存储概览页）；login 页不再显示。
- **搜索优化**：移除团队 / 项目集 / 项目三处搜索；项目文件页改为跨「组（团队）」文件搜索（带面包屑路径，未加入的项目灰显且不可选中）。
- **上传 MD5 去重**：以团队为单位用 `md5` 去重；同内容已存在则拒绝上传并提示已有图片位置。
- **暗色模式**：全局明 / 暗主题切换（CSS 变量 + antd 组件覆盖），入口在用户菜单，可持久化。
- **图片翻译器符号工具**：翻译 / 校对输入框插入常用符号，支持拖拽拉伸条调高输入区。
- **AI 机翻预设**：更新 Google / OpenAI / Anthropic 预设，并新增 Deepseek、SpaceXAI。
- **定制品牌与文案**：吉祥物立绘、favicon 像素猪、彩翻 / IRTrans 等定制文案与 i18n。
- **一键机翻三模式**：仅标号 / 仅翻译 / 我全都要（下拉选择，置于翻译模式栏最前），按模型能力门控展示。
- **注册重构（邀请码制）**：移除邮箱验证码与邮箱白名单，注册需有效邀请码（多次使用、可停用、一码绑一团队并自动入团）；忘记密码统一联系站点管理员重置。
- **站点管理员管理页**：邀请码管理（创建 / 启停 / 删除，团队覆盖全站）+ 团队管理（全站团队概览 + 级联删除 + 头像）。
- **图片移动**：同项目集批量移动勾选图片，重复 md5 失败并说明原因；标号随图保留、翻译按语言重映射到新项目，进度条与计数正确。
- **自定义文案（按语言分组）**：`site.name` / `site.slogan` / `site.englishName` 品牌文案与 mascot / favicon 品牌图片均在站点设置页可配（中英文分别设置，留空恢复默认）。
- **上传文件名去 emoji**：图片上传时自动清除文件名中的 emoji（服务端兜底，前端也清洗）。
- **全体用户通知系统**：管理员发布公告，登录弹未读，用户菜单「通知一览」查历史；管理后台「通知管理」发布 / 编辑 / 启停 / 删除。
- **翻译者累积记录**：打标号 / 机翻全能模式自动累积处理过该图的用户到「翻译」字段（顿号分隔去重）；手动编辑直接设置。
- **移动图片仅团队管理员可用**：移动按钮仅站点管理员 / 创建人 / 管理员 / 监理可见，普通成员 API 也拒绝。
- **翻译失败详情**：自动翻译失败时输出具体到哪一步（调用模型 / 保存翻译）+ 相关参数（模式 / 模型 / 目标语言 / 错误详情）。
- **从社交媒体 / 外部链接获取图片**：项目文件页上传按钮旁新增「从社交媒体获取图片」下拉，支持 **从 X(Twitter) / Bluesky / Pixiv / 外部链接** 获取图片；X / Bluesky / Pixiv 解析贴文 / 作品内全部图片（多图 P1/P2 页码），服务器端下载直连导入，逐张组级 MD5 去重并提示导入/重复数。
- **外部链接下载绕过 Cloudflare**：改用 `curl_cffi`（`impersonate="chrome"` 伪造浏览器 TLS/HTTP2 指纹），规避 Cloudflare 对 Python `requests` 的拦截（如 Danbooru 等图源）。
- **按用户抓取全部图片（X / Bluesky / Pixiv）**：社交媒体下拉新增「从 X 获取（用户）」「从 Bluesky 获取（用户）」「从 Pixiv 获取（用户）」，输入用户主页地址抓取该用户**媒体时间线 / 贴文 / 作品的全部图片**；**进度式导入**（`MediaImportTask` 后台线程逐张下载入库，前端轮询显示「正在下载第 a/b 张」+ 完成/重复提示）。Bluesky 支持匿名或账号模式，Pixiv 支持 `PHPSESSID` 取 R18 受限作品。
- **独立图片存储服务（STORAGE_TYPE=REMOTE_HTTP + imgstore）**：新增轻量图片存储服务 **imgstore**（Go 单二进制、Docker 承载、镜像约 7MB，源码在 `imgstore/`，部署编排见 `umeabc/moeflow-irohamod-imgstore`）。Moeflow 新增 `REMOTE_HTTP` 存储驱动：上传 / 删除 / 列表 / 用量走 imgstore HTTP API，图片外链直读 `STORAGE_DOMAIN`，可将图片落到**独立主机**并支持 HTTP/HTTPS 外链；imgstore 支持多级 key（`outputs/<id>/<file>`）。
- **imgstore 存储概览（admin）**：dashboard「存储空间」卡片在 REMOTE_HTTP 模式显示「imgstore 总存储占用」（已用 / 剩余）；管理后台新增「imgstore 存储概览」页（服务 URL / 已用 / 剩余 / 总容量 / 占用比例）。LOCAL / R2 模式照常。
- **登录页全新改版**：左品牌区（吉祥物 + 光环动画）+ 右登录/注册分段卡片；已登录状态展示「已登录」卡片（进入仪表盘 / 退出）。
- **暗色模式高亮修复**：通知标题与站点设置「下载图片设置」分区标题在暗色模式下改为主题粉色高亮。
- **iroha16-fix4 代码维护**：修复前端 TypeScript/ESLint/Jest 配置与既有类型错误；删除未使用组件、工具与依赖；合并重复的 `formatBytes` 和导出清理逻辑；云存储 SDK 改为按 `STORAGE_TYPE` 构建时可选安装，`LOCAL_STORAGE`/`REMOTE_HTTP` 不再携带 OSS/R2/Google SDK。
- **iroha16-fix5 自适应分页**：文件列表移除每页 16 张固定下限，按容器宽高与真实卡片行高计算每页数量；窗口尺寸变化后自动回第 1 页并按新 `limit` 重取。

## 部署

> 以下为通用流程，本仓库不含具体主机/凭据信息。

### 构建
- **前端**：在资源充足的开发机执行 `npm run build`（`vite build`，输出 `build/`）→ 上传 `build/` 到远程 → `docker build` 生成镜像（Dockerfile `COPY ./build /build`）。
- **后端**：修改后端源码 → 远程 `docker build`（`FROM python:3.11`，pip 使用阿里云 PyPI 镜像）。

### 交付
- 推送 `ghcr.io`：在测试机 `docker tag` 出 `:latest` 并 `docker push`。
- 正式机（compose 跟踪 `:latest`）：`docker compose pull moeflow-frontend moeflow-backend && docker compose up -d --no-deps moeflow-backend moeflow-celery moeflow-frontend`（保留 mongodb / redis 数据）。
- 涉及镜像：
  - `ghcr.io/umeabc/moeflow-frontend:v1.1.7-iroha16-fix1` → `:latest`（`FROM nginx:1.26` + `COPY ./build /build`）
  - `ghcr.io/umeabc/moeflow-backend:v1.1.8-iroha16` → `:latest`（`FROM python:3.11`）

## 相关文档

- 改动明细：[`CHANGELOG-iroha4.md`](./CHANGELOG-iroha4.md)
- 项目交接档案：[`MOEFLOW-PROJECT.md`](./MOEFLOW-PROJECT.md)

## 回退

如需回到官方版本，用官方 tag `v1.1.7` / `v1.1.8` 重新构建即可（本定制版与上游存在差异）。

## 环境注意（通用）

- 远程内存不足无法执行前端构建（OOM），请在本地 / 资源充足机子构建。
- Docker Hub 拉取不稳定时可使用 daocloud 镜像加速。
- pip 建议使用阿里云 PyPI 镜像（`https://mirrors.aliyun.com/pypi/simple/`）。
