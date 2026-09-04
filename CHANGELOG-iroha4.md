# MoeFlow 自定义改动 CHANGELOG（iroha6）

> 基于 `moeflow-com/moeflow` 的自定义定制版本。
> 前端基线 `moeflow-frontend:v1.1.7`，后端基线 `moeflow-backend:v1.1.8`。
> 镜像 tag：`moeflow-frontend:1.1.7-iroha6` / `moeflow-backend:1.1.8-iroha6`（后续进一步定制沿用 irohaN 约定；历史 `iroha4`/`iroha5` 镜像保留各自版本 tag）。
> 源码备份仓库：`umeabc/moeflow-backup`（私有，含 `frontend/` 与 `backend/`）。
> 交付方式：以 `docker save` 导出镜像 tar → 生产侧 `docker load` 导入（仅替换前端/后端镜像，勿改动 env / compose）。

---

## iroha6 新增特性（基于 iroha5）

### 一、一键机翻「三模式」

- 一键机翻在原有「全自动/整页」基础上拆分为**三种模式**（下拉选择，置于翻译模式等下拉栏**最前**）：**仅标号** / **仅翻译** / **我全都要**。
- **仅标号**：用 LLM 识别文字区并只生成标号（框选），不产出译文。
- **仅翻译**：用 LLM 识别已标号区域的文字并只翻译到对应标号框，不生成新标号。
- **我全都要**：完整的「标号 + 翻译」流程。
- 可用性门控：仅当所选模型能力满足时展示对应模式。`services/ai/llm_preprocess.ts` 的 `llmPresets` 增 `availability`/`mode` 字段；`ModelConfigForm` 为模式三选一；`BatchTranslateModal` 按模式分支处理。
- 相关：图片选择器可选模式；`Source.to_api()` 返回 `rank`，`CreateImageSourceSchema` 支持 `rank`，POST 透传。
- 文件：`frontend/src/services/ai/llm_preprocess.ts`、`frontend/src/components/ai/{ModelConfigForm,index,BatchTranslateModal}.tsx`、`frontend/src/apis/source.ts`、`backend/app/{models,validators,apis}/source.py|file.py`、`frontend/src/locales/*`、`messages.yaml`。

### 二、注册系统重构（邀请码制）

- **移除邮箱验证码**整块功能：注册不再需要邮箱验证码，注册页「验证码」改为**邀请码**；必须持有效邀请码才能注册。
- **邀请码**：**多次使用**、可**停用**；一码**绑定一个团队**（注册成功后自动加入该团队并赋予对应角色）。
- **忘记密码**：移除自助重置（邮箱验证码/找回），统一**联系站点管理员重置**（`ResetPassword` 页改为说明文案）。
- **移除邮箱白名单**：任意邮箱 + 有效邀请码均可注册（`enable_whitelist`/`whitelist_emails` 字段声明保留以兼容旧文档，但不参与校验）。
- 后端：`InvitationCode` 模型（`backend/app/models/invitation_code.py`：code/team/role/enabled/use_count/create_time/create_user；`generate_code()` 生成 8 位大写、避开 0/O/1/I）；`UserAPI.post` 校验邀请码并 `user.join(invite.team, role)`、递增 `use_count`；`RegisterSchema` 用 `invite_code` 替代 `v_code`；`exceptions/auth.py` 新增邀请码无效/不可用异常。
- 前端：`Register.tsx`（邮箱+邀请码+昵称+密码）、`ResetPassword.tsx`（联系管理员文案）、`locales/*`。

### 三、站点管理员「邀请码管理」

- `admin/settings` 支持对邀请码的**创建 / 列表 / 启停用 / 删除**（`admin_required` 保护）。
- 团队下拉**覆盖全站团队**（`api.adminTeam.listTeams`），供管理员为不同团队发不同邀请码。
- 后端：`backend/app/apis/invitation_code.py`（`InvitationCodeListAPI` GET/POST、`InvitationCodeAPI` PUT/DELETE），路由 `/v1/admin/invitation-codes`、`/<invitation_code_id>`。
- 前端：`AdminInviteCode.tsx`（表格 + 创建表单），`apis/invitationCode.ts`，`locales/*`（`admin.inviteCodes.*`）。

### 四、站点管理员「团队管理」+ 团队头像

- `admin` 新增「团队管理」页：全站团队**按行概览**（名称、团队 id、项目集数、项目数、图片数）+ **删除团队**（级联清空）。
- 团队名称旁展示团队头像（`Avatar`）。
- 后端：`backend/app/apis/admin_team.py`（`AdminTeamListAPI.get`、`AdminTeamAPI.delete`，`team.clear()` 级联），路由 `/v1/admin/teams`、`/<team_id>`。
- 前端：`AdminTeam.tsx`，`apis/adminTeam.ts`，`locales/*`（`admin.teamManage.*`）。

### 五、图片移动（同项目集，含翻译随移）

- 文件列表「全选本页 / 反选本页 / 取消选择」**最前**新增「**图片移动**」按钮，勾选后点击 → 弹窗选择**同项目集下的另一项目** → 批量移动。
- **仅限同一项目集（ProjectSet）** 下移动；目标项目已存在 **md5 相同**图片 → 该张 `失败` 并说明原因（`FileDuplicateError`，code 8008「目标项目已存在相同图片」）。
- 移动后**标号（Source）随图保留**；**翻译随图迁移**：`File.move_to_project` 按**语言**将各 `Translation.target` 重映射到新项目同语言 target，并按实际翻译**重算**新旧项目的目标缓存/计数（进度条正确，不再归零/错乱）。
- 后端：`File.move_to_project`（`backend/app/models/file.py`，重算式对账：`recompute_source_counts_for_target` 按实际翻译计算 translated/checked 贡献，不依赖旧缓存是否存在）；`ProjectFileMoveAPI` PUT `/v1/projects/<id>/files/move`、`MoveTargetProjectsAPI` GET `/v1/projects/<id>/move-target-projects`；`validators/file.py` 增 `FileMoveSchema`；`exceptions/file.py` 增 `FileMoveError`。
- 前端：`FileList.tsx`（移动按钮 + 弹窗）、`FileMoveModal.tsx`、`apis/file.ts`（`getMoveTargetProjects`/`moveFiles`）、`locales/*`（`file.moveImages`/`file.moveStatusMoved/Failed/Skipped`/`file.moveDuplicateReason`/`form.confirm` 等）。

### 六、登录页文案 3 处

- 「还没有帐号？去找组长注册吧」→「还没有账号？去注册吧」。
- 登录页右上角 GitHub 图标超链接 → `https://github.com/umeabc/moeflow-backup`。
- 「忘记密码？」→「忘记密码？请联系站点管理员为您重置密码。」。
- 文件：`frontend/src/components/shared/Header.tsx`、`frontend/src/locales/{zh-cn,en}.json`、`messages.yaml`（键 `auth.toReigsterTip` / `auth.toResetPasswordTip`）。

---

## 一、前端：文件卡角色栏「翻译 / 校对 / 嵌字」

### 1. 新增角色负责人展示与手动编辑
- 项目文件卡片（FileItem）新增「翻译 / 校对 / 嵌字」三行角色信息。
- 点击角色名可进入文本编辑，支持**任意文本**输入（回车即存、失焦兜底保存）。
- 点击角色名/编辑框不会触发展开图片（阻止事件冒泡到卡片点击）。
- 角色字段后端存储为**自由文本**（非用户引用）。

### 2. 角色自动填充流程
- **标号动作** → 自动记录当前用户为「翻译」。
- **校对模式点击「确认以上所有翻译」** → 自动记录当前用户为「校对」。
- **生成导出资源** → 自动记录当前用户为「嵌字」。
- 自动填充**不受权限限制**（始终生效）。

### 3. 角色编辑权限矩阵（按项目角色 systemCode 控制手动编辑）
| 项目角色 | 可编辑 |
|---|---|
| 创建人 / 管理员 / 监理 | 翻译、校对、嵌字（全部） |
| 翻译 / 校对 | 翻译 + 校对 |
| 嵌字 | 仅嵌字 |
| 见习翻译 | 全部不可编辑 |

### 4. 嵌字变绿标识
- 当某文件被记录为「嵌字」后，文件卡片显示**绿色边框/高亮**。

---

## 二、前端：项目集（ProjectSet）

### 1. 设置按钮与设置页
- 项目集列表行新增**设置按钮**（默认「未分组」也显示）。
- 设置页支持**更改名称**（默认集也可改名）。

### 2. 删除项目集
- 设置页新增「删除本项目集」按钮。
- **仅站点管理员可用**（前端禁用 + 后端校验）。
- 删除为**级联物理删除**：该项目集及其下所有项目、文件、译文数据一并删除（不可逆，前端有强确认提示）。

### 3. 项目移动
- 「所属项目集」下拉，可将项目移动到另一个项目集。
- **仅项目管理员（admin）与创建人（creator）可移动**，其他角色禁用。

---

## 三、前端：文案与品牌资源

### 1. 定制文案（locale 同步为定制）
- **zh-cn.json**（15 处）：
  - `site.name` → 「彩翻」；`site.slogan` → 「コール・ミー・サユリ！！」
  - `file.blockTip` → 「…被彩叶吃掉了，无法在彩翻进行翻译」
  - `auth.captchaTitle` → 「验证你不是鸽」；`auth.loginedTip` → 「你好喵，{userName}！喵喵~」
  - `api.networkError` → 「网络爆炸了」；`auth.logout` → 「注销」
  - AI 翻译相关 → 「一键机翻 / AI / 彩翻端」等
- **en.json**（6 处）：
  - `site.name` → 「IRTrans」；`site.slogan` → 「Ladies and Gentlemen, I told you, It's SAYURI」
  - AI 翻译相关 → 「Use AI / Sayuri」；`mit.desc` → 「…imported as IrohaTrans project.」

### 2. 品牌资源
- 吉祥物立绘替换：`src/images/brand/mascot-jump1.png`。
- favicon 替换：`public/static/favicon.png`。
- 两者均已持久化写入源码并重新构建镜像。

---

## 四、后端：模型与权限

### 1. File 模型新增字段
```python
translator  = StringField(db_field="tl",  default="")   # 翻译负责人
proofreader = StringField(db_field="pr",  default="")   # 校对负责人
typesetter  = StringField(db_field="tyu", default="")   # 嵌字负责人
```
- `File.to_api()` 返回以上三个字段（字符串）。
- 后端启动时自动迁移旧的角色字段（ObjectId → 清空重填）。

### 2. 角色字段编辑接口
- `PUT /v1/files/<id>` 支持编辑三个角色字段，并按**项目角色判权**（越权字段返回 403）。

### 3. 项目集
- 默认集改名放开（`project_set.py put` 移除 default 拦截）。
- 项目集删除仅限站点管理员（`current_user.admin`）。
- `ProjectSet.clear()` 改为**级联删除**所有项目（复用 `Project.clear()`）。
- 项目移动（`ProjectAPI.put`）当带 `project_set` 字段时，仅 `admin` / `creator` 角色可操作。

### 4. 导出逻辑
- 导出时自动记录「嵌字」= 当前用户；不再记录「校对」（校对改由前端确认触发）。

---

## 五、登录页展示存储区剩余空间（管理员）

### 后端
- 新增接口 `GET /v1/admin/storage-usage`（`admin_required` 保护）。
- 返回存储区磁盘用量（字节）：`{"storage_type","total","used","free"}`，基于 `shutil.disk_usage(STORAGE_PATH)`，仅 `LOCAL_STORAGE` 有效。
- 文件：`backend/app/apis/site_setting.py`（新增 `StorageUsageAPI`）、`backend/app/apis/urls.py`（注册路由）。

### 前端
- 登录页「已登录提示」（`AuthLoginedTip`）在「注销」按钮**下方**，对**站点管理员**（`user.admin`）显示「存储剩余空间：{space}」。
- 文案键 `auth.storageFreeSpace`（zh-cn / en / messages.yaml）；API 调用 `api.siteSetting.getStorageUsage`。
- 文件：`frontend/src/apis/siteSetting.ts`、`frontend/src/components/shared-form/AuthLoginedTip.tsx`、`frontend/src/locales/*`。

---

## 六、搜索优化

1. 移除「团队」「项目集」「项目」三处列表页的搜索框（`searchInputVisible={false}`，保留标题「+」创建按钮）：`TeamList.tsx`、`ProjectSetList.tsx`、`ProjectList.tsx`。
2. 项目文件页（`FileList`）搜索改造为**跨组（团队）文件搜索**：
   - 后端新增 `GET /v1/files/search?word=<w>&limit=<n>`（`token_required`）：在当前用户所加入的团队下，按文件名 `name__icontains` 匹配激活文件，返回面包屑（team/project_set/project 名称+id）与 `can_access`（仅按项目成员身份判权，非项目成员即「未加入」）。文件：`backend/app/apis/file.py` 新增 `FileSearchAPI`；`urls.py` 在 `/<file_id>` 前注册 `/search`。
   - 前端：`apis/file.ts` 新增 `searchFiles`；`FileList.tsx` 关旧搜索、顶部新增 `AutoComplete` 下拉（文件名 + 「团队 > 项目集 > 项目」路径，未加入项灰显「未加入」且禁用），点选可访问项跳到 `routes.dashboard.project.show`（该文件所属项目文件页）；新增文案键 `file.searchPlaceholder` / `file.searchNotJoined` / `file.searchEmpty`。
- 验证：`GET /v1/files/search` 无 token 返回 401；带管理员 token 返回带面包屑与 `can_access` 的列表。

---

## 七、上传图片 MD5 去重（以组为单位）

- 上传文件时，以**团队（组）**为单位用 `md5` 去重：同内容已在同组其他位置存在，则拒绝上传并指明已有图片位置。
  - 后端：`ProjectFileListAPI.post` 在 `project.upload` 前对 `real_file` 计算 md5（读流后 `real_file.stream.seek(0)` 还原），查「同团队项目下同 md5 的激活文件」；若非同名同项目覆盖（`old_file`）则抛新增异常 `FileDuplicateError`（`backend/app/exceptions/file.py`，code 8008），消息含「相同内容的图片已存在：xxx（团队 > 项目集 > 项目）」。注意：mongoengine 不支持 `project__team` 跨两级 join 查询，需先取 `Project.objects(team=...)` 的 id，再 `project__in`。
  - 前端：`FileList` 的 `FilePond.onerror` 解析响应体，`code===8008` 时 `message.warning(body.message)` 提示并移除占位卡片；其余错误保持原有失败态。
- 行为：同项目同名重传（覆盖）放行；不同名/不同项目同内容则拦截并提示已有图片位置。

---

## 八、暗色模式

- 全局明/暗主题可切换，入口在用户下拉菜单（DashboardMenu 的 `useMenuProps`）加「暗色模式」Switch。
- 实现方式：
  - `src/index.css` 定义 `:root`（浅色）与 `html[data-theme="dark"]`（暗色）两套 `--moeflow-*` CSS 变量，并给 `body` 设 `background-color/color`；`color-scheme` 随主题。
  - `src/style.ts` 默认导出的颜色键改为 `var(--moeflow-*)`（`antdLessVars` 保持字面量供构建期 antd Less）。
  - 修复 4 处 `polished` 颜色运算（`markers/overview/Translation.tsx` 的 `lighten`、`markers/{source,translate}/index.tsx`、`markers/proofread/Source.tsx` 的 `darken`）改用对应 CSS 变量色。
  - `src/App.tsx` 增 `html[data-theme="dark"]` 下的 antd / antd-mobile 组件暗色覆盖（采用**扁平选择器 + `!important`**，避免嵌套式覆盖对 portal 组件失效）。
  - `src/store/site/slice.ts` 增 `darkMode` + `setDarkMode`；`src/utils/storage.ts` 增 `themeStorage`（`store` 包持久化 `darkMode`）。
  - `src/index.tsx` 渲染前读偏好设 `data-theme` 并 dispatch；避免首屏闪烁。
  - 文案键 `site.darkMode`（zh-cn/en/messages.yaml）。
- **暗色修正**（新增 token：`--moeflow-surface/surface2/control/controlIcon/progressTrack/warningColorLight/successColorLight/progressStatus/sliderRail/sliderThumb` 等，均明暗两套）：
  - ① 图片翻译器未选中白底：`ImageSourceViewer`、`ImageSourceViewerModeControl`、`markers/proofread/index.tsx`、`markers/overview/index.tsx` 的 `#fff/#f7f7f7/#eee/#fff6f6` → 主题变量。
  - ②③ 返回/设置/翻页/缩放按钮（`ImageViewer` 的 Back/Setting/Paging、`ImageViewerZoomPanel`、`ImageViewerPagingPanel`、`ImageViewerSettingPanel`）的 `#fff`/`rgba(255,255,255,opacity)` → `var(--moeflow-control)`（暗色近黑）。
  - ④ 文件卡状态色：`TranslationProgress.tsx` 进度条底/黄/粉/灰与徽标色 → 主题变量（亮色=原浅色、暗色压暗）；`FileItem.tsx` 卡片底 `var(--moeflow-surface)`。
  - ⑤ 左栏白底：`Dashboard.tsx` 的 `.Dashboard__CollapsibleMenu`、`DashboardMenu.tsx` 的 logo → `var(--moeflow-surface)`。
  - ⑥ 搜索栏：暗色覆盖补 Autocomplete/Select 内层输入框透明。
  - ⑦ antd Modal/Select 暗色：改为**扁平选择器**（每条 `html[data-theme='dark'] .ant-x`）+ `!important`，并扩充 `.ant-modal* / .ant-modal-confirm* / .ant-select-selector / .ant-select-selection / .ant-picker` 等，解决模态/下拉仍白的问题。
  - ⑧ 图片查看器缩放条：`ImageViewerZoomPanel` 面板底、缩小按钮、滑块 rail/轨道/手柄全部主题化（`--moeflow-sliderRail` 亮 #e1e1e1/暗 #3a3a3a；`--moeflow-sliderThumb` 亮 #666666/暗 #d0d0d0）。

---

## 九、图片翻译器「符号工具」

- 在翻译输入框（`markers/translate/index.tsx` 的 `ImageSourceViewerTranslator__Bottom`）上方加一行符号工具条：点按键在光标处插入对应符号（`insertSymbol` 读取 `textArea.selectionStart/End` 后拼入并重新派发 `editMyTranslationSaga`，随后恢复光标）。
- 符号集 `SYMBOLS`：`… ～ ♡ ♠ 「 」 『 』 （ ） ○ ● ※ ☆ ★ □ ◇ ♪ ♬ · 〆`。
- 文案键 `imageTranslator.hideSymbolTool` / `imageTranslator.showSymbolTool`（zh-cn/en/messages.yaml）。
- **增强**：翻译模式默认高度提升至 380、校对模式提升至 420；两者底部面板顶部各加一条**可拖拽拉伸条**（`ResizeHandle`，拖拽调整 `bottomPanelHeight` 状态，范围 80~560/620）。
- 校对模式（`proofread/index.tsx`）加入与翻译一致的**符号工具**，重构为**底部面板顶部单一符号条**（无翻译时插入翻译输入框、否则插入校对输入框 `insertSymbol`；不再遮挡 TranslationUser 图标）。
- **统一「显示/隐藏符号工具」为常驻单开关**：翻译模式在顶部 `FunctionBar`（常驻行，仅放该开关，右对齐）、校对模式在顶部 FunctionBar；移除各符号条上的「隐藏符号工具」按钮与翻译模式底部状态栏开关，保证隐藏后能再次呼出。

---

## 十、AI 机翻预设模型更新

- 修改 `frontend/src/services/ai/llm_preprocess.ts` 的 `llmPresets`：
  - **Google**：`gemini-2.5-flash/pro` → `gemini-3.5-flash` / `gemini-3.7-flash`（默认 API 地址不变）。
  - **OpenAI**：`gpt-5-mini/gpt-4o/gpt-5` → `gpt-5.6-sol` / `gpt-5.6-luna` / `gpt-5.6-terra`（默认 API 地址不变）。
  - **Anthropic**：`claude-sonnet-4-20250514` / `claude-3-7-sonnet-latest` → `claude-sonnet-5` / `claude-sonnet-4-6`（默认 API 地址不变）。
  - **新增 Deepseek**：`deepseek-v4-flash-vision-exp`（默认 API 地址 `https://api.deepseek.com/v1/`）。
  - **新增 SpaceXAI**：`grok-4.6`（默认 API 地址 `https://api.x.ai/v1/`）。
  - 自定义保持不变；`frontend/src/components/ai/ModelConfigForm.tsx` 输入占位示例同步更新。
- 说明：`llm_preprocess.ts` 内 `gemini-` / `claude-` 前缀的兼容 workaround（坐标缩放、`anthropic-dangerous-direct-browser-access` 头）仍对新模型名生效。

---

## 备注

- 本改动为定制版本，与上游 moeflow 官方代码存在差异；如需回退，可用官方 tag `v1.1.7` / `v1.1.8` 重新构建。
- 涉及权限与交互调整（角色编辑、项目集删除/移动、搜索范围、上传去重、主题切换、符号工具），请按实际团队与权限配置确认。
- 交付：前端/后端镜像已按 `docker save` 打包为 tar（`moeflow-*-1.1.x-iroha6.tar`），生产侧 `docker load` 后替换对应镜像即可（仅替换镜像，不动 env/compose）。
