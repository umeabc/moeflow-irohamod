# MoeFlow 定制版（iroha16-fix7）备份仓库

> 本仓库为 MoeFlow（彩翻 / 萌翻）**内部定制版本**的源码备份仓库（私有）。
> 定制基线：前端 `v1.1.7`、后端 `v1.1.8`；当前源码 **iroha16-fix7，已实现待验收/待部署**。本轮没有镜像构建或发布；历史 fix6 部署记录见下方。
> 本文档为**脱敏版**，不含具体主机、域名、端口、代理与凭据信息。

---

## iroha16-fix7（2026-11-05，已实现待验收/待部署）

本轮仅修改本地源码、资源、依赖声明与测试；未 commit、未构建/部署镜像、未操作测试机/正式机/GHCR。此前 fix6 部署记录保留为历史，不能视为 fix7 已部署。

- **批次 1**：删除未注册的旧角色 API 链、不可达同步用户媒体下载、无入口自助重置密码、异步 `wait_result` 与直接 `asgiref` 依赖；保留 RBAC/角色模型、逐图线程导入、改密 PUT、管理员重置和联系管理员页面。删除无消费者的前端包装、验证码列表、模板组件与 `mascot-jump2.png`。
- **批次 2**：生产、开发、OSS/R2/Google OCR 根依赖分离；新的锁文件生成器使用独立 venv 和现有精确版本约束，成功解析及 `pip check` 后才替换文件，避免测试工具进入生产。补全 `curl_cffi` 和 AVIF 依赖；删除 `fontmin` 脚本、无用类型/工具依赖，更新 npm lock。
- **批次 3**：默认关闭前端 source map，需要排障时用 `GENERATE_SOURCEMAP=true npm run build` 显式生成；Docker context 白名单、后端仅复制运行代码/验证码字体，Babel 使用只编译 MO 的目标，ALL 不重复安装 Google 依赖。移除停用的 PS 脚本和模板，保留 LabelPlus 导出及外部脚本说明。立绘改无损 WebP：1,118,098 → 509,882 字节（减少 54.4%，RGBA 像素一致）。
- **图片链路**：新增 WebP/AVIF 接受类型和后端解码支持；保持 Pillow 9.5.0，AVIF 固定 `pillow-avif-plugin==1.5.5`。完整 ZIP 导出只把这两种格式转成 JPEG（quality=95、透明白底），图片名与 LabelPlus 引用使用同一映射，并为同名冲突生成后缀。JPG/PNG/GIF 原有格式、内容和扁平 ZIP 布局保留；仅文本导出保留源图片名。
- **批次 4**：合并创建/导入项目校验、三个用户媒体任务启动分支、登录/注册共用字段与动作、重复 cache/file/source/output 测试逻辑；将旧邮箱流程中有效字段断言迁入邀请码注册，删除 13+1 个永久 skip 测试体；修复上传测试夹具内容重复，保留生产去重。
- **批次 5**：管理页与 ImageTranslator 路由拆包，ZIP/AI 操作按需加载；清理未使用的 HTML/Jest/Vite 配置残留。
- **保留/延后**：项目 API 包装均有消费者，继续保留；保留 ImageOCRProgress、debug-logger、locale YAML、默认头像、Label-Number 字体与 OFL。antd-mobile/Tailwind 和计划完结/删除 API 仍有业务或样式依赖，延后；四份子项目 `.github/workflows` 不迁移到根目录，不改变发布行为。`imgstore/` 未修改。

依赖维护（在 `backend/` 下）：`python scripts/lock_requirements.py production --check` 可离线核对声明；去掉 `--check` 会在隔离环境重新解析，保持已有精确版本，需能访问包源。其余 profile 为 `dev`、`oss`、`r2`、`google-ocr`。Linux 也可使用原 `make requirements.txt` 等目标。Babel `make babel-compile-mo` 仅编译现有 PO；`make babel-update-mo` 保留提取/更新 PO 的开发流程。

AVIF 上游 wheel 信息：[pillow-avif-plugin 1.5.5](https://pypi.org/project/pillow-avif-plugin/1.5.5/) 提供 CPython 3.11 Windows/Linux wheel；本轮实际编解码是否通过以本节最终测试记录为准。


### fix7 最终相关验证（本地）

- 后端统一运行 15 个相关测试文件：**146 passed、4 failed、0 skipped，83.83s**。所要求的 admin_stats/file/admin/output/auth/v_code/file_model/multi_target_cache 全部通过；另覆盖 source/project API、project model、媒体启动/schema/依赖隔离。原 `test_upload_project_file` 已通过。
- 新图片回归：**7 passed、4 failed**。WebP 实际上传、原图/封面/预览解码、JPEG 文件头与白底、ZIP/LabelPlus 文件名对应、现有 JPEG 碰名、旧 JPG/PNG/GIF 字节不变均通过。4 个新增 AVIF 用例实际执行后均报 `ImportError: AVIF support requires pillow-avif-plugin==1.5.5`；没有 skip 或模拟图片解码。
- AVIF 安装命令因环境禁止 pip 网络套接字而失败（`WinError 10013`），本地 pip 缓存无该 wheel。**AVIF 在 Pillow 9.5 下的真实编解码仍未验证，属于本轮环境阻断，不可据此认定已验收。** 缺插件时记录明确警告，AVIF 操作报错，其它格式可正常运行。
- 前端 `npm.cmd run typecheck` 通过（修复 FilePond element 可空类型错误后重跑）；`npm.cmd test -- --runInBand`：**4 suites / 24 tests passed**；`npm.cmd run lint`：**0 errors / 243 warnings**；`npm.cmd run build` 通过。保留既有第三方 `eval` 与大 chunk 提示。产物 48 个文件、3,665,735 字节、**0 个 source map**，已检查 Admin/子页、ImageTranslator、AI 和 ZIP 独立 chunk。
- `npm.cmd install --package-lock-only --ignore-scripts --no-audit --no-fund` 成功；lock 节点 1201 → 974，删除 227 项，没有升级保留包版本。存在原有可选 peer 提示。
- 五种后端 lock profile 的 `--check` 通过；已安装依赖的 `pip check` 通过（不代表缺失的 AVIF 已安装）；从既有缓存补齐测试环境 `jmespath==0.10.0`、`execnet==2.1.1`。因包源不可访问，未重新执行完整联网锁解析。
- 直接执行 Babel compile，英文/中文 MO 均编译成功、PO 未改写。Docker 安装分支以 shell 替身核对 LOCAL_STORAGE/REMOTE_HTTP/OSS/R2/ALL × Google auto/true 共 10 种组合，ALL 无重复 Google pip 调用；**未构建镜像，不能代替真实镜像构建验收**。
- AST 比较确认 cache 测试 15 个方法和 69 次中间 `check_cache` 调用及参数未变；file_model 22 个测试方法完整保留。source/output 改用子场景参数化，导出保留 7 种场景，不能仅按测试方法数量判断覆盖变化。
- `git diff --check` 通过。仅工作树修改，HEAD 保持 `6789d32`，未暂存、未 commit、未部署。`imgstore/` 和四份 workflow 未变。

后端复现（工作目录 `backend/`，只加载本地测试配置）：

```powershell
$env:PYTHONPATH="$PWD/.review-minimal;$PWD/.review-deps"
$env:TEMP="$PWD/.review-minimal/tmp"; $env:TMP=$env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
$tests = @(
  'tests/api/test_admin_stats_api.py', 'tests/api/test_file_api.py',
  'tests/api/test_admin_api.py', 'tests/api/test_output_api.py',
  'tests/api/test_auth_api.py', 'tests/api/test_v_code_api.py',
  'tests/api/test_source_api.py', 'tests/api/test_project_api.py',
  'tests/api/test_media_import_api.py', 'tests/api/test_image_formats_api.py',
  'tests/model/test_file_model.py', 'tests/model/test_project_model.py',
  'tests/other/test_multi_target_cache.py', 'tests/base/test_project_schema.py',
  'tests/other/test_lock_requirements.py'
)
python -c "from dotenv import load_dotenv; load_dotenv('.env.test.sample', override=True); import pytest, sys; raise SystemExit(pytest.main(['-o','addopts=','-q'] + sys.argv[1:]))" @tests
```

在可访问包源的同等环境补齐 AVIF 后，必须重跑真实图片测试；保持 Pillow 9.5，不能通过跳过 AVIF 用例验收：

```powershell
python -m pip install --target .review-minimal --no-deps pillow-avif-plugin==1.5.5
python -c "from dotenv import load_dotenv; load_dotenv('.env.test.sample', override=True); import pytest; raise SystemExit(pytest.main(['-o','addopts=','-q','tests/api/test_image_formats_api.py']))"
```

前端在 `frontend/` 下依次执行 `npm.cmd run typecheck`、`npm.cmd test -- --runInBand`、`npm.cmd run lint`、`npm.cmd run build`。本机 build 使用工作区临时目录（`$env:TEMP="$PWD/.fix6-tmp"; $env:TMP=$env:TEMP`），验证后已清理缓存；默认产物不含 source map。


## iroha16-fix6（2026-11-02，已部署测试机与正式机）

- 镜像：前端 `v1.1.7-iroha16-fix6` / 后端 `v1.1.8-iroha16-fix6`，后端 build ID `iroha16-fix6`；测试机 `172.29.133.24` 与正式机（`moeflow.basmc.org`）均已部署，GHCR 版本标签及 `:latest` 已推送。
- 后台新增「参与统计」：管理员接口 `GET /v1/admin/contribution-stats`，页面 `/admin/contribution-stats`，入口在管理分组。一次查询用户、一次遍历有效图片，不按用户查询文件。按当前 `File` 的 translator / proofreader / typesetter 负责人字符串统计参与图片数；支持顿号、中文逗号、英文逗号，trim 后同图同角色去重，与 `User.name` 精确匹配。仅计 `IMAGE` 且 `activated=True`，包含所有项目状态；列出未封禁、未注销用户及零计数用户，排除 `[Redacted]`，按合计降序、姓名升序。表格包含用户、邮箱、翻译、校对、嵌字、合计，支持分页、空态、加载态；中英文翻译及 locale JSON 已更新。
- 图片移动目标接口 `GET /v1/projects/<project_id>/move-target-projects` 增加 `status=ProjectStatus.WORKING`，排除完结、归档、计划完结、计划删除、已删除项目；保持项目集、类型 / 作者模式隔离与原权限。已检查 `FileMoveModal.tsx` 直接使用接口列表，无需前端过滤。
- 新增后端测试 `tests/api/test_admin_stats_api.py`：覆盖统计多角色 / 多人 / 三种分隔符 / 去重 / 精确匹配 / 零计数 / banned 与脱敏用户排除 / 图片与激活条件 / 历史状态，以及移动目标六种状态、四种类型组合与权限。
- 后端使用现有 `.review-minimal`、`.review-deps` 依赖与 `.env.test.sample` 的本地 mongomock（`moeflow_test`），命令见下方。完整相关测试结果为 **16 passed, 1 failed**；排除既有上传失败时 **16 passed, 1 deselected**。既有 `test_upload_project_file` 在第二次上传同内容文件时触发 `FileDuplicateError`（8008）；在内存加载 HEAD 原版 `app/apis/file.py` 后单独运行仍失败，确认与本次修改无关，未修改该既有行为。
- 前端 `npm.cmd run typecheck` 通过；`npm.cmd test -- --runInBand`：**2 suites / 19 tests passed**；`npm.cmd run lint`：**0 errors / 253 warnings**；`npm.cmd run build` 通过（保留既有 eval / 大 chunk 警告）。Windows PowerShell 禁用 npm.ps1，使用 npm.cmd。构建初次因系统临时目录删除权限失败，设置 `TEMP` / `TMP` 为工作区 `frontend/.fix6-tmp` 后通过。
- `npm run build:locale` 已重新执行并成功生成 `en.json` / `zh-cn.json`；随后重新执行生产构建。未修改 package.json 或依赖。
- 真实环境验收：测试机统计接口 200、5 个用户、0.018s；正式机统计接口 200、58 个用户、1.833s。两端均抽样 5 个项目，移动目标全部为 WORKING；正式机域名/API/管理页 200，Celery ready，后端日志无 error。
- 正式机 compose 备份：`/var/dockers/moeflow/docker-compose.yml.bak-pre-fix6-20261102-014743`；旧镜像已打 `pre-fix6-20261102-014743` 回退标签。
- 未决项：上述既有上传测试失败；统计以当前负责人记录为准，负责人字段被更改或用户改名后会随当前记录变化，不回溯操作日志。

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
