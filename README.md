# MoeFlow 定制版（iroha6）备份仓库

> 本仓库为 MoeFlow（彩翻 / 萌翻）**内部定制版本**的源码备份仓库（私有）。
> 定制基线：前端 `v1.1.7`、后端 `v1.1.8`；镜像 tag：`moeflow-frontend:1.1.7-iroha6`、`moeflow-backend:1.1.8-iroha6`。
> 本文档为**脱敏版**，不含具体主机、域名、端口、代理与凭据信息。

---

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
- **存储剩余空间**：站点管理员登录页展示存储区剩余空间。
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

## 部署

> 以下为通用流程，本仓库不含具体主机/凭据信息。

### 构建
- **前端**：在资源充足的开发机执行 `npm run build`（`vite build`，输出 `build/`）→ 上传 `build/` 到远程 → `docker build` 生成镜像（Dockerfile `COPY ./build /build`）。
- **后端**：修改后端源码 → 远程 `docker build`（`FROM python:3.11`，pip 使用阿里云 PyPI 镜像）。

### 交付
- 镜像 `docker save` 导出为 tar → 生产侧 `docker load` → 用 Compose 替换 `backend` / `frontend` 服务（保留 mongodb / rabbitmq 数据）。
- 涉及镜像：
  - `moeflow-frontend:1.1.7-iroha6`（`FROM nginx:1.26` + `COPY ./build /build`）
  - `moeflow-backend:1.1.8-iroha6`（`FROM python:3.11`）

## 相关文档

- 改动明细：[`CHANGELOG-iroha4.md`](./CHANGELOG-iroha4.md)
- 项目交接档案：[`MOEFLOW-PROJECT.md`](./MOEFLOW-PROJECT.md)

## 回退

如需回到官方版本，用官方 tag `v1.1.7` / `v1.1.8` 重新构建即可（本定制版与上游存在差异）。

## 环境注意（通用）

- 远程内存不足无法执行前端构建（OOM），请在本地 / 资源充足机子构建。
- Docker Hub 拉取不稳定时可使用 daocloud 镜像加速。
- pip 建议使用阿里云 PyPI 镜像（`https://mirrors.aliyun.com/pypi/simple/`）。
