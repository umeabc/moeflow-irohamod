# MoeFlow 定制版（彩翻 / 萌翻）

自托管漫画翻译协作平台，基于官方 [moeflow](https://github.com/moeflow-com/moeflow) 的内部定制分支。

- 前端基线 `v1.1.7`（React 17 + antd + Emotion + Vite）
- 后端基线 `v1.1.8`（Flask + MongoDB + Celery）
- 完整改动明细见 [CHANGELOG-iroha4.md](./CHANGELOG-iroha4.md)

## 这是什么

MoeFlow 面向汉化组与嵌字协作者：上传页稿 → 自动标号 / OCR → 翻译 → 校对 → 嵌字 → 导出 LabelPlus 或打包 ZIP，多人按角色分工协作。

本仓库在官方基础上做了一轮长期定制，重点在**角色与署名**、**项目类型**、**导出流程**、**图片获取**、**存储方案**、**审核与日志**六个方向；并新增了一个独立的第二前端 **MoeFlow Atelier**（见文末）。

## 定制功能

### 前端（`frontend/`）

- **文件卡角色栏**：翻译 / 校对 / 嵌字三行负责人，支持自由文本编辑与「顿号分隔多人」自动累积，按项目角色判权；嵌字完成后卡片绿色高亮。
- **项目类型四模式**：翻嵌、翻校嵌、翻嵌作、翻校嵌作。创建项目用「启用校对 / 启用原作者」双勾选卡片 + 模式预览，项目列表与设置页用四色 Tag 展示。
- **原作者与作者信息**：文件卡新增「原作者」行；项目设置新增「作者信息」模板，支持 `{翻译}` / `{嵌字}` / `{原作者}` 占位符与固定文案（如 `B站@BA校委会`），带示例预览和 1000 字计数。
- **导出**：导出抽屉先弹「导出前标记嵌字者」（默认当前用户、可留空、可只填空白项），再导出全部或仅文本；LabelPlus 与 LLM 去字脚本可直接下载。
- **编辑器**：框内 / 框外标号、快捷标点、符号工具、滚轮缩放、移动端收纳；作者标号只读不可拖动。
- **主题**：默认粉色 / 蔚蓝档案 / 初音未来三套配色，可独立搭配明 / 暗模式并持久化；用户菜单与登录页右上角均可切换，登录页另有语言快捷入口。
- **协作与检索**：项目集管理、团队与成员、跨团队文件搜索（带面包屑）、邀请码注册、站点管理员页、通知中心、日志管理页、存储概览页。
- **其他**：登录页改版、移动端「我的」页与 TabBar、上传去 emoji、MD5 重复提示、社媒批量导入、图片行内重命名、文件列表自适应分页、AI 机翻预设与一键机翻三模式。

### 后端（`backend/`）

- **数据模型**：`File.translator/proofreader/typesetter/original_author`；`Source.kind`（`text` / `author`）+ `author_key`（唯一稀疏索引）；`Project.with_proofread` / `with_author` / `author_label_template`；`ProjectStatus.ARCHIVED`。
- **导出**：LabelPlus 增加第 3 组「作者信息」，作者标号固定导出为第 3 组；导出任务消费时重新读取可见性策略，TXT 与 ZIP 共用同一批文件；自动记录嵌字者；保留最近 3 个导出与 7 天窗口。
- **审核**：`SiteSetting.allow_pending_images`（默认 true）与 `auto_approve_images`（默认 false）；上传 / 覆盖原子写入审核状态；标号、翻译、OCR、导出、移动等入口统一走可用性闸门；管理员可按版本通过 / 驳回。
- **撤回**：`POST /v1/files/<id>/undo-completion` 撤回校对 / 嵌字 / 原作者标记，并同步四级计数缓存。
- **上传**：组级 MD5 去重、服务端去除文件名 emoji、修订版与存储失败回滚。
- **图片获取**：X（Twitter）/ Bluesky / Pixiv / 外链导入，支持按用户批量抓取；`MediaImportTask` 后台进度；`curl_cffi` 伪造浏览器指纹绕过 Cloudflare。
- **存储**：`LOCAL_STORAGE` / `OSS` / `R2`（多账号多桶）/ `REMOTE_HTTP`（配套轻量服务 `imgstore/`，Go 单二进制）。
- **日志**：`action_log`（用户动作、真实 IP、详情脱敏）与 `error_log`（Web 500 + Celery 失败），管理员可检索与标记处理。
- **站点设置**：品牌名 / 标语 / 英文名（中英分开）、mascot 与 favicon、自定义文案、LLM 模型预设（含管理端密钥）、快捷标点、社媒下载凭据。
- **其他**：最后登录时间、注册改为邀请码制、导出与测试的可选依赖拆分（`requirements-*.txt`）、离线测试脚本 `backend/scripts/test_isolated.py`。

### 第二前端：MoeFlow Atelier

独立的现代化前端，与旧前端**并存**、共用同一后端与数据，源码在 [`umeabc/moeflow-atelier`](https://github.com/umeabc/moeflow-atelier)。

- 无 UI 组件库，语义化 CSS 变量；纸白 / 夜墨两套明暗 × 朱红 / 蔚蓝档案 / 初音未来三套配色。
- 译制工作区、项目架、页稿上传（拖入 / 粘贴）、团队与项目集、图片审核与日志管理。
- 需要后端支持图片审核两项设置（`iroha16-fix14` 起）；旧后端上除该页外均可正常使用。

## 仓库结构

| 路径 | 说明 |
|---|---|
| `frontend/` | 旧版前端源码（React + antd + Emotion + Vite） |
| `backend/` | 后端源码（Flask + MongoEngine + Celery + Babel） |
| `imgstore/` | 轻量图片存储服务（Go，供 `STORAGE_TYPE=REMOTE_HTTP` 使用） |
| `CHANGELOG-iroha4.md` | 改动明细（按版本） |

## 本地开发

后端需要 Python 3.11、MongoDB、Redis：

```bash
cd backend
python -m venv venv && venv/bin/pip install -r requirements-dev.txt
cp .env.sample .env      # 修改 SITE_NAME / SECRET_KEY / MONGODB_URI / STORAGE_TYPE 等
venv/bin/python manage.py runserver
venv/bin/celery -A app.celery worker -Q default,output -l info
```

前端需要 Node.js（Vite 7）：

```bash
cd frontend
npm ci
npm run dev            # 默认代理 /api 到 http://localhost:5000
```

离线测试（内存库 + 临时本地存储，不加载 `.env`）：

```bash
cd backend
python scripts/test_isolated.py tests/api tests/model
```

## 构建与部署

通用的容器化部署方式，一个 compose 项目包含 mongodb、redis、backend、celery、frontend：

```bash
# 前端：在资源充足的机器上构建，产物在 build/
cd frontend && npm ci && npm run build

# 镜像统一以 :latest 发布
docker build -t ghcr.io/umeabc/moeflow-frontend:latest frontend
docker build -t ghcr.io/umeabc/moeflow-backend:latest backend

# 目标机器拉取并启动；.env / .env-backend 提供站点与存储配置
docker compose pull && docker compose up -d
```

镜像只维护 `latest` 一个标签，回退时用上一次的镜像 ID 重新 `docker tag` 即可；具体改了什么看 CHANGELOG。

注意事项：

- 前端构建吃内存，内存不足的机器请在本机构建后只上传 `build/`。
- Docker Hub 不稳定时可用镜像加速；pip 建议使用阿里云 PyPI 镜像。
- 后端重建后若前端 nginx 缓存了旧 upstream，会出现 `/api` 502，建议 `/api` 使用 Docker 内置 DNS 动态解析。
- `STORAGE_TYPE` 切换时同步调整 `STORAGE_DOMAIN`（本地存储带 `/storage/`，`REMOTE_HTTP` 指向图片服务外链）。

## 来源与许可

基于 [moeflow-com/moeflow](https://github.com/moeflow-com/moeflow)（MIT）二次开发；上游版权归原作者所有，本仓库定制部分同样遵循 MIT。
