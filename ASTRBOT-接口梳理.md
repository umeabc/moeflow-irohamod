# MoeFlow → AstrBot 插件：可调用接口梳理

> 依据当前工作区源码（后端 `v1.1.8-iroha15` 定制版）逐文件核对，非猜测。
> 目标：判断哪些 HTTP 接口可以直接写成调用，交给 AstrBot 插件消费。

---

## 1. 系统总览

| 组件 | 技术栈 | 与插件的关系 |
|---|---|---|
| `backend/` | Flask + MongoEngine + Celery + Babel | **唯一的接口来源**，所有业务 API 都在这里 |
| `frontend/` | React + Vite + axios | 无接口价值，但可作为「字段命名/调用姿势」的参考实现 |
| `imgstore/` | Go 单二进制 | 独立存储服务，自带 HTTP API（可选接入） |

框架层：`flask_apikit`（`backend/app/factory.py` 里 `apikit = APIKit()`），
统一提供 `APIView`、`APIError`、`QueryParser`、分页。

**网关前缀**：前端 nginx 只反代 `/api` 前缀（见 `MOEFLOW-PROJECT.md` §2），
所以后端 `/v1/xxx` 的对外地址是：

```
https://<站点域名>/api/v1/xxx
```

---

## 2. 插件必须先知道的 6 条接口约定

### 2.1 鉴权
```
Authorization: Bearer <token>
```
- 校验逻辑：`backend/app/decorators/auth.py:17` → `User.verify_token()`（`backend/app/models/user.py:188`）
- Token 由 `TimedJSONWebSignatureSerializer` 签发，**默认 30 天**（`user.py:177` `expires_in=2592000`）
- Token 内含 `password_characteristic`，**用户改密码后旧 token 立刻失效**（`user.py:205`）
- `admin_required`（`auth.py:35`）用于管理接口，非管理员返回 103

### 2.2 登录接口有图形验证码（最大接入障碍）
`POST /api/v1/user/token`（`backend/app/apis/me.py:31`）要求 4 个字段：
```json
{"email": "...", "password": "...", "captcha_info": "...", "captcha": "..."}
```
验证码由 `POST /api/v1/captchas`（`apis/v_code.py:10`）返回 base64 图片 + `info`，
**必须人工识图**。这是机器人无法自动登录的唯一硬阻塞，见 §5。

### 2.3 响应格式
- **非分页接口**：直接返回 JSON 对象/数组，无外层包装。
  例：`{"message": "修改成功", "project": {...}}`
- **分页接口**：**body 就是数组本身**，总数在**响应头** `X-Pagination-Count`。
  ```python
  resp = await session.get(f"{base}/v1/teams/{tid}/projects", params={"page":1,"limit":30})
  items = await resp.json()                      # list
  total = int(resp.headers["X-Pagination-Count"]) # 总数
  ```
  依据：`backend/app/core/responses.py` 的 `MoePagination.set_data()`，
  前端消费方式见 `frontend/src/components/project/FileList.tsx:290-292`。
- **错误**：HTTP 4xx/5xx + JSON
  ```json
  {"code": 103, "error": "NoPermissionError", "message": "没有权限"}
  ```
  `code` 定义见 `backend/app/exceptions/base.py`（100 起为业务码，2 为字段校验错误，
  8008 为 MD5 重复）。前端解析见 `frontend/src/apis/index.ts:109-133`。

### 2.4 参数命名
- **请求体/查询参数一律 `snake_case`**（前端显式 `toUnderScoreCase` 后才发出，
  见 `frontend/src/apis/project.ts:68`）。分页参数固定为 `page` / `limit`。
- **响应字段也是 `snake_case`**（前端在收到后转小驼峰，插件里无需转换）。

### 2.5 分页默认值与上限
`backend/app/config.py:169-172`：默认 `limit=30`，**最大 100**。

### 2.6 没有 webhook / 事件推送
全仓库 grep `webhook` **零命中**。所有「通知类」功能只能靠轮询实现（见 §5.3）。

---

## 3. 接口清单（按插件可用性分级）

### A 级：强烈推荐 —— 只读查询，零副作用，可直接封装

| 方法 | 路径 | 用途 | 关键返回字段 |
|---|---|---|---|
| GET | `/v1/user/info` | 当前用户资料 | `name` `avatar` `admin` |
| GET | `/v1/user/projects` | **我的项目列表**（支持 `word`/`status` 过滤） | 见 §4.1 |
| GET | `/v1/user/teams` | 我的团队列表 | `name` `role` |
| GET | `/v1/user/notices` | 通知列表，`?scope=unread` 只看未读 | `title` `content` `read` |
| GET | `/v1/teams/<team_id>` | 团队详情 | `name` `user_count` |
| GET | `/v1/teams/<team_id>/projects` | 团队项目列表 | 同 §4.1 |
| GET | `/v1/teams/<team_id>/project-sets` | 项目集列表 | `name` |
| GET | `/v1/teams/<team_id>/insight/projects` | **团队项目看板**（含成员+导出） | `project` `users` `outputs` |
| GET | `/v1/teams/<team_id>/insight/users` | **成员贡献看板** | `user` `projects` |
| GET | `/v1/teams/<team_id>/insight/users/<uid>/projects` | 某人参与的项目 | |
| GET | `/v1/teams/<team_id>/insight/projects/<pid>/users` | 某项目的参与人 | |
| GET | `/v1/projects/<project_id>` | 项目详情 → 进度计算 | 同 §4.1 |
| GET | `/v1/projects/<project_id>/files` | 文件列表（`word`/`page`/`limit`） | 见 §4.2 |
| GET | `/v1/projects/<project_id>/targets` | 目标语言列表 | `id` `language` |
| GET | `/v1/projects/<project_id>/targets/<tid>/outputs` | **导出产物下载链接** | `url` `create_time` |
| GET | `/v1/files/<file_id>` | 单文件详情（含前后图） | 见 §4.2 |
| GET | `/v1/files/<file_id>/content` | **同源取图字节流** → 直接发到群 | `image/*` 二进制 |
| GET | `/v1/files/search` | **跨团队按文件名搜图** | `name` `project_name` `team_name` |
| GET | `/v1/<group_type>/<group_id>/users` | 成员列表（team/project 通用） | `name` `role` |
| GET | `/v1/<group_type>/<group_id>/public-info` | 团体公开信息 | `joined` `user_count` |
| GET | `/ping` | 存活探测 | `pong` |

**无需 token 的公开接口**（可做免登录的站点信息卡）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/v1/site/homepage` | 首页 HTML/CSS |
| GET | `/v1/site/custom-messages` | 站点自定义文案覆盖 |
| GET | `/v1/site/brand-assets` | mascot / favicon URL |
| GET | `/v1/site/brand-asset/<type>` | 品牌图字节流 |
| GET | `/v1/languages` | 语言字典（`backend/app/apis/language.py`） |
| GET | `/v1/types/<type_name>` | 角色/权限字典，`?group_type=team\|project` |
| GET | `/v1/users/<name>` | 用户公开资料 |

### B 级：可用但需谨慎 —— 有写入/异步/耗时副作用

| 方法 | 路径 | 说明与插件注意点 |
|---|---|---|
| POST | `/v1/projects/<pid>/files/from-url` | **社媒/外链导图**。`source` ∈ `twitter`/`twitter_user`/`bluesky`/`bluesky_user`/`pixiv`/`pixiv_user`/`external`；`*_user` 会返回 `{task_id,total}` |
| GET | `/v1/files/from-url-task/<task_id>` | 上者的进度轮询：`{done,total,imported,duplicated,finished,failures}` |
| POST | `/v1/projects/<pid>/files` | multipart 上传（字段名 `file`）。**同团队 MD5 去重**，重复抛 `code 8008` |
| PUT | `/v1/projects/<pid>/files/move` | 批量移动图片，返回逐张 `moved/failed/skipped` |
| PUT | `/v1/files/<file_id>` | 改名 / 移动 / 改负责人（`translator` `proofreader` `typesetter`，可带 `replace_translator`）。**一次只能传一类参数** |
| POST | `/v1/files/<file_id>/undo-completion` | 撤回校对/嵌字完成（仅项目管理员） |
| POST | `/v1/projects/<pid>/outputs` | **一键导出全部目标语言** |
| POST | `/v1/projects/<pid>/targets/<tid>/outputs` | 导出指定目标，可传 `file_ids_include`/`file_ids_exclude`/`type`。**60 秒内重复导出报错**（`OUTPUT_WAIT_SECONDS`），且只保留最近 2-3 个 |
| POST | `/v1/projects/<pid>/targets` | 新增目标语言 |
| PUT | `/v1/user/notices/read` | 标记通知已读（`{"notice_ids":[...]}`） |
| POST | `/v1/projects/<pid>/ocr`、`/v1/files/<fid>/ocr` | 触发自动标记，**消耗团队 OCR 配额** |
| POST | `/v1/projects/<pid>/archive` \| `/unarchive` \| `/resume` | 归档 / 取消归档 / 恢复 |
| DELETE | `/v1/projects/<pid>` | ⚠️ 实际是**完结项目**（清空文件与导出，数据不可恢复） |

### C 级：管理接口（需站点管理员 token）

| 方法 | 路径 | 插件用途 |
|---|---|---|
| GET | `/v1/admin/system-status` | **服务器 CPU/内存/磁盘** → 运维播报 |
| GET | `/v1/admin/storage-usage` | 存储容量（LOCAL/R2/imgstore 自适应） |
| GET | `/v1/admin/r2-buckets` | R2 多桶用量 |
| GET | `/v1/admin/imgstore-overview` | imgstore 用量 |
| GET | `/v1/admin/logs/actions` | **操作审计**（`user_name`/`action_type`/`start_time` 过滤） |
| GET | `/v1/admin/logs/errors` | 错误日志；PUT `.../errors/<id>` 标记已处理 |
| GET/POST | `/v1/admin/notices` | 发布全体公告（可配合群推送） |
| PUT/DELETE | `/v1/admin/notices/<id>` | 编辑/停用公告 |
| GET/POST | `/v1/admin/invitation-codes` | 邀请码管理（注册必需） |
| GET | `/v1/admin/users` | 用户列表（含 `last_active_time`） |
| POST | `/v1/admin/users` | 直接建号（**免验证码**） |
| PUT | `/v1/admin/users/<uid>` | 重置密码 |
| PUT | `/v1/admin/users/<uid>/deactivate` | 注销用户 |
| PUT | `/v1/admin/admin-status` | 授予/回收管理员 |
| GET | `/v1/admin/teams`、DELETE `/v1/admin/teams/<tid>` | 全站团队管理 |
| GET/PUT | `/v1/admin/site-setting` | 站点设置（含 LLM 预设、社媒 cookie） |
| GET/PUT | `/v1/admin/custom-messages` | 自定义文案 |
| PUT | `/v1/admin/site-brand-assets` | 品牌图上传 |
| GET | `/v1/admin/files`、PUT `/v1/admin/files/safe-status` | 图片安全审核 |

### D 级：不建议接入

- `POST /v1/user/token`（图形验证码）、`POST /v1/captchas`、邮箱验证码三个接口
  —— 机器人自动化无意义，且验证码接口可能被滥用。
- `PUT /v1/user/password`、`PUT /v1/user/email`、`DELETE /v1/user/password`
  —— 密码类操作交给浏览器，不要进群聊。
- 邀请码 / 申请 / 邀请审批（`/v1/<group_type>/<id>/invitations|applications`）
  —— 涉及站内审批流，语义易被群成员误触发。
- `DELETE /v1/admin/teams/<tid>`（级联删库）、`PUT /v1/admin/files/safe-status`
  —— 破坏性极强，不适合聊天指令触发。

### ⚠️ 额外发现：MIT 接口无鉴权

`backend/app/apis/manga_image_translator.py` 的三个类
（`MitImageApi` / `MitImageTaskApi` / `MitTranslateTaskApi`）**没有任何 `@token_required`**，
仅在 `MIT_STORAGE_ROOT` 非空时才注册（`apis/urls.py:658`）：

```
POST /v1/mit/images                 上传图片（匿名，落 MIT_STORAGE_ROOT 临时文件）
POST /v1/mit/image-tasks            mit_detect_text / mit_ocr
GET  /v1/mit/image-tasks/<task_id>
POST /v1/mit/translate-tasks        mit_translate
GET  /v1/mit/translate-tasks/<task_id>
```

这是**目前唯一能「匿名调用的业务能力」**，也正好是机器人最需要的
「发一张漫画图 → 返回译文/气泡框」能力。但：
1. 未鉴权 = 任何人可写服务器磁盘，若暴露公网属于严重风险；
2. 插件要用它，**建议先加 `@token_required` 或 `X-Service-Key`**，再对外。

### imgstore 独立接口（Go 服务，可选）

```
PUT    /put/<prefix>/<name>     上传        ┐
DELETE /delete/<prefix>/<name>  删除        ├─ 需 Header: X-Api-Key
GET    /list/<prefix>           列表        │
GET    /stats                   磁盘用量    ┘
GET    /files/<prefix>/<name>   匿名直读图片
```
（`imgstore/README.md`，路由见 `imgstore/main.go:315-319`）

---

## 4. 关键数据结构（插件渲染用）

### 4.1 项目进度（`Project.to_api`，`backend/app/models/project.py:1024`）

```json
{
  "id": "...", "name": "...", "status": 0, "archived": false,
  "with_proofread": true,
  "source_count": 120,              // 原文（气泡）总数
  "translated_source_count": 90,    // 已翻译
  "checked_source_count": 60,       // 已校对
  "typeset_file_count": 30,         // 已嵌字图片数
  "image_file_count": 45,           // 图片总数
  "has_output": true,
  "source_language": {"code": "ja", "name": "日文"},
  "team": {...}, "project_set": {...}, "role": {...}
}
```

进度计算（与前端三条进度条一致，见 `MOEFLOW-PROJECT.md` §4.9）：

```
翻译进度 = translated_source_count / source_count
校对进度 = checked_source_count   / source_count     # with_proofread=false 时隐藏
嵌字进度 = typeset_file_count     / image_file_count
```

`status` 取值（`backend/app/constants/project.py:6`）：
`0` 进行中 / `1` 已完结 / `2` 等待完结 / `3` 等待销毁 / `4` 已删除 / `5` 已归档。
（查询 `status=1` 时会自动包含 `5`。）

### 4.2 文件（`File.to_api`，`backend/app/models/file.py:1237`）

```json
{
  "id": "...", "name": "@001.png", "type": 2,
  "source_count": 8, "translated_source_count": 8, "checked_source_count": 3,
  "translator": "小明", "proofreader": "", "typesetter": "",
  "parse_status": 4, "parent_id": null,
  "url": "https://...",          // ⚠️ 可能是签名 URL / 外链，别直接转发
  "cover_url": "...", "safe_check_url": "...",
  "image_ocr_percent": 100
}
```
`type`：`0` 未知 / `1` 文件夹 / `2` 图片 / `3` 文本。

**发图请用 `GET /v1/files/<id>/content`**（`backend/app/apis/file.py:460`）：
后端从任意存储（LOCAL/OSS/R2/imgstore）读字节流并带权限校验以同源返回，
不受 CORS 与签名过期影响，插件拿到 bytes 直接合成消息发出即可。

---

## 5. 落地的三个阻塞点与建议改法

### 5.1 【阻塞】机器人无法自动登录

**方案 A（零后端改动，立即可用）**
运维在浏览器登录一次，把 token 写进插件配置。
- 优点：今天就能跑。
- 缺点：**30 天过期**，且改密码即失效，需要人工续期。

**方案 B（推荐，改动约 25 行）—— 新增服务令牌接口**

1. `backend/app/config.py` 增加：
   ```python
   SERVICE_API_KEY = env.get("SERVICE_API_KEY", "")
   ```
2. `backend/app/apis/me.py` 新增（放在 `MeTokenAPI` 旁）：
   ```python
   import hmac
   from flask import current_app
   from app.exceptions import NoPermissionError

   class MeServiceTokenAPI(MoeAPIView):
       """服务令牌：供机器人/脚本使用，X-Service-Key 校验，免图形验证码。"""
       def post(self):
           expected = current_app.config.get("SERVICE_API_KEY", "")
           provided = request.headers.get("X-Service-Key", "")
           if not expected or not hmac.compare_digest(provided, expected):
               raise NoPermissionError(gettext("服务密钥错误"))
           data = self.get_json()          # {"email": "bot@site.com"}
           user = User.by_email(data["email"])
           return {"token": user.generate_token(expires_in=90 * 24 * 3600)}
   ```
3. `backend/app/apis/urls.py` 的 `me` 蓝本注册：
   ```python
   me.add_url_rule("/service-token", methods=["POST", "OPTIONS"],
                   view_func=MeServiceTokenAPI.as_view("me_service_token"))
   ```
4. 用**专用服务账号**（建议就是管理员号）绑定机器人，密钥只放插件配置里。

> 该接口只做「密钥 → 该用户 token」，权限完全等同于该用户，
> 不引入新的越权面。务必限制来源 IP 或仅走内网。

### 5.2 【阻塞】需要「让机器人代发图/代导入」时的身份问题

若走方案 B，注意 MoeFlow 的权限是**按用户**判定的
（`ProjectPermission.ADD_FILE` / `MOVE_FILE` / `OUTPUT_TRA`，见 `apis/file.py:161`）。
插件携带的是服务账号的权限，**不等于群里说话那个人的权限**。
建议插件侧自行维护「QQ 号 ↔ MoeFlow 用户名」映射，并在指令上做白名单，
否则等于把服务账号的权限开放给全群。

### 5.3 【缺失】没有事件推送，只能轮询

当前无 webhook。三种可行路径，按成本从低到高：

1. **轮询审计日志**（零改动）：机器人定时查
   `GET /v1/admin/logs/actions?start_time=<上次时间>`，
   按 `action_type` 过滤（`file.upload` / `project.output` / `team.create` / `file.import_from_url` …）
   生成「项目动态」。字段见 `backend/app/models/log.py`，动作埋点见 `log_action` 装饰器调用处。
2. **轮询未读公告**（零改动）：`GET /v1/user/notices?scope=unread`，
   配合 `PUT /v1/user/notices/read` 做去重，用于把站点公告同步到群。
3. **加 webhook**（推荐，改动小）：
   在 `backend/app/decorators/log.py:171`（`ActionLog(...).save()` 之后）
   追加一段「按配置 POST 到 `WEBHOOK_URLS`」的逻辑，
   配置项加 `ACTION_WEBHOOK_URLS`。这样机器人能真正实时收到事件，
   比轮询省资源也更及时。

---

## 6. 建议的插件功能地图

| 指令 | 调用链路 | 级别 |
|---|---|---|
| `/mf 项目 [关键词]` | `GET /v1/user/projects` → 渲染进度条 | A |
| `/mf 进度 <项目>` | `GET /v1/user/projects?word=` 找 id → `GET /v1/projects/<id>` | A |
| `/mf 看板 <团队>` | `GET /v1/teams/<tid>/insight/projects` + `/insight/users` | A |
| `/mf 搜图 <文件名>` | `GET /v1/files/search?word=` → `GET /v1/files/<id>/content` 发原图 | A |
| `/mf 通知` | `GET /v1/user/notices?scope=unread` | A |
| `/mf 导出 <项目>` | `POST /v1/projects/<pid>/outputs` → 轮询 `.../targets/<tid>/outputs` → 回传 `url` | B |
| `/mf 导入 <链接> <项目>` | `POST /v1/projects/<pid>/files/from-url` → 轮询 `from-url-task/<id>` | B |
| `/mf 传图`（群图片） | 下载群图 → `POST /v1/projects/<pid>/files`（multipart） | B |
| `/mf 机翻`（群图片） | `POST /v1/mit/images` → `POST /v1/mit/translate-tasks` → 轮询 → 回图 | ⚠️ 需先补鉴权 |
| `/mf 状态`（管理员） | `GET /v1/admin/system-status` + `/storage-usage` | C |
| `/mf 公告 <内容>`（管理员） | `POST /v1/admin/notices`（站点公告 + 群推送） | C |

**推荐先做 A 级前 5 条**：全部只读、无副作用、失败影响面为零，能立刻验证连通性与鉴权链路。

---

## 7. 一页速查

```
站点地址      https://<域名>/api
鉴权头        Authorization: Bearer <token>
取 token      POST /v1/user/token        ← 需图形验证码（阻塞点，见 §5.1）
公开接口      /ping /v1/site/* /v1/languages /v1/types/<name> /v1/users/<name>
分页          参数 page/limit(≤100)，body=数组，总数在响应头 X-Pagination-Count
错误          {"code":..,"error":..,"message":..}
发图          GET /v1/files/<file_id>/content   ← 不要直接用 file.url
进度字段      source_count / translated_source_count / checked_source_count
              / typeset_file_count / image_file_count
无 webhook    所有通知靠轮询（见 §5.3）
```
