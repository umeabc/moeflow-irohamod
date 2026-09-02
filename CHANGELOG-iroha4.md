# MoeFlow 自定义改动 CHANGELOG（iroha4）

> 本次为 `moeflow-com/moeflow` 的自定义定制改动。
> 前端基于 `moeflow-frontend:v1.1.7`，后端基于 `moeflow-backend:v1.1.8`。
> 镜像：`moeflow-frontend:1.1.7-iroha4` / `moeflow-backend:1.1.8-iroha4`。
> 源码备份仓库：`umeabc/moeflow-backup`（私有，含 `frontend/` 与 `backend/`）。

---

## 一、前端：角色栏「翻译 / 校对 / 嵌字」

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

### 1. 定制文案（locale 同步为旧版定制）
- **zh-cn.json**（15 处）：
  - `site.name` → 「彩翻」
  - `site.slogan` → 「コール・ミー・サユリ！！」
  - `file.blockTip` → 「…被彩叶吃掉了，无法在彩翻进行翻译」
  - `auth.captchaTitle` → 「验证你不是鸽」
  - `auth.loginedTip` → 「你好喵，{userName}！喵喵~」
  - `api.networkError` → 「网络爆炸了」
  - `auth.logout` → 「注销」
  - AI 翻译相关 → 「一键机翻 / AI / 彩翻端」等
- **en.json**（6 处）：
  - `site.name` → 「IRTrans」
  - `site.slogan` → 「Ladies and Gentlemen, I told you, It's SAYURI」
  - AI 翻译相关 → 「Use AI / Sayuri」
  - `mit.desc` → 「…imported as IrohaTrans project.」

### 2. 品牌资源
- 吉祥物立绘替换：`src/images/brand/mascot-jump1.png`（新立绘）。
- favicon 替换：`public/static/favicon.png`（像素猪）。
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
- 后端启动时会自动迁移旧的角色字段（ObjectId → 清空重填）。

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

## 五、运维 / 部署

- 构建：本机构建前端 `build/` → 上传 → 远程 `docker build` 重建镜像；后端远程改源码 → 重建。
- 涉及镜像：
  - `moeflow-frontend:1.1.7-iroha4`（`FROM nginx:1.26` + `COPY ./build /build`）
  - `moeflow-backend:1.1.8-iroha4`（`FROM python:3.11`）
- 生产机（`REDACTED`）镜像以 `docker save` 导出 tar 后 `docker load` 导入。

---

## 六、登录页展示存储区剩余空间（本次新增）

### 后端
- 新增接口 `GET /v1/admin/storage-usage`（`admin_required` 保护）。
- 返回存储区磁盘用量（字节）：`{"storage_type","total","used","free"}`，基于 `shutil.disk_usage(STORAGE_PATH)`，仅 `LOCAL_STORAGE` 有效。
- 文件：`backend/app/apis/site_setting.py`（新增 `StorageUsageAPI`）、`backend/app/apis/urls.py`（注册路由）。

### 前端
- 登录页「已登录提示」（`AuthLoginedTip`）在「注销」按钮**下方**，对**站点管理员**（`user.admin`）显示「存储剩余空间：{space}」。
- 文案键 `auth.storageFreeSpace`（zh-cn / en / messages.yaml）；API 调用 `api.siteSetting.getStorageUsage`。
- 文件：`frontend/src/apis/siteSetting.ts`、`frontend/src/components/shared-form/AuthLoginedTip.tsx`、`frontend/src/locales/*`。

### 部署（测试机 REDACTED）
- 前端：本地 `npm run build` → 上传 `build/` → `docker build moeflow-frontend:v1.1.7-custom`。
- 后端：改 `/BUILD-backend/app/apis/*` → `docker build moeflow-backend:v1.1.8-custom`。
- `docker compose up -d --no-deps moeflow-backend moeflow-frontend`。
- 验证：`GET /api/v1/admin/storage-usage` 返回 `{"total":33633878016,"used":10534187008,"free":21365035008}`，与 `df -h` 一致。

---

## 七、搜索优化（本次新增）
1. 移除「团队」「项目集」「项目」三处列表页的搜索框（`searchInputVisible={false}`，保留标题「+」创建按钮）：`TeamList.tsx`、`ProjectSetList.tsx`、`ProjectList.tsx`。
2. 项目文件页（`FileList`）搜索改造为**跨组（团队）文件搜索**：
   - 后端新增 `GET /v1/files/search?word=<w>&limit=<n>`（`token_required`）：在当前用户所加入的团队下，按文件名 `name__icontains` 匹配激活文件，返回面包屑（team/project_set/project 名称+id）与 `can_access`（仅按项目成员身份判权，非项目成员即「未加入」）。文件：`backend/app/apis/file.py` 新增 `FileSearchAPI`；`urls.py` 在 `/<file_id>` 前注册 `/search`。
   - 前端：`apis/file.ts` 新增 `searchFiles`；`FileList.tsx` 关旧搜索、顶部新增 `AutoComplete` 下拉（文件名 + 「团队 > 项目集 > 项目」路径，未加入项灰显「未加入」且禁用），点选可访问项跳到 `routes.dashboard.project.show`（该文件所属项目文件页）；新增文案键 `file.searchPlaceholder` / `file.searchNotJoined` / `file.searchEmpty`。
3. 测试机 REDACTED 已重建镜像并部署。验证：`GET /api/v1/files/search?word=aki` 无 token 401、带管理员 token 返回 `[{name:"@akimaru_m.png", team_name:"Default Team", project_set_name:"千年", project_name:"优香", can_access:true}]`。

---

## 八、上传图片 MD5 去重（以组为单位，本次新增）
- 上传文件时，以**团队（组）**为单位用 `md5` 去重：同内容已在同组其他位置存在，则拒绝上传并指明已有图片位置。
  - 后端：`ProjectFileListAPI.post` 在 `project.upload` 前对 `real_file` 计算 md5（读流后 `real_file.stream.seek(0)` 还原），查「同团队项目下同 md5 的激活文件」；若非同名同项目覆盖（`old_file`）则抛新增异常 `FileDuplicateError`（`exceptions/file.py`，code 8008），消息含「相同内容的图片已存在：xxx（团队 > 项目集 > 项目）」。注意：mongoengine 不支持 `project__team` 跨两级 join 查询，需先取 `Project.objects(team=...)` 的 id，再 `project__in`。
  - 前端：`FileList` 的 `FilePond.onerror` 解析响应体，`code===8008` 时 `message.warning(body.message)` 提示并移除占位卡片；其余错误保持原有失败态。
- 校验：同项目同名重传（覆盖）放行；不同名同内容 `400 {"code":8008,"message":"相同内容的图片已存在：duptest.png（Default Team > 千年 > 优香）"}`。

---

## 九、暗色模式（本次新增）
- 全局明/暗主题可切换，入口在用户下拉菜单（DashboardMenu 的 `useMenuProps`，桌面端底部用户头像菜单）加「暗色模式」Switch。
- 实现方式：
  - `src/index.css` 定义 `:root`（浅色）与 `html[data-theme="dark"]`（暗色）两套 `--moeflow-*` CSS 变量，并给 `body` 设 `background-color/color`；`color-scheme` 随主题。
  - `src/style.ts` 默认导出的颜色键改为 `var(--moeflow-*)`（`antdLessVars` 保持字面量供构建期 antd Less）。
  - 修复 4 处 `polished` 颜色运算（`markers/overview/Translation.tsx` 的 `lighten`、`markers/{source,translate}/index.tsx`、`markers/proofread/Source.tsx` 的 `darken`）改用对应 CSS 变量色。
  - `src/App.tsx` 增 `html[data-theme="dark"]` 下的 antd / antd-mobile 组件暗色覆盖。
  - `src/store/site/slice.ts` 增 `darkMode` + `setDarkMode`；`src/utils/storage.ts` 增 `themeStorage`（`store` 包持久化 `darkMode`）。
  - `src/index.tsx` 渲染前读偏好设 `data-theme` 并 dispatch；避免首屏闪烁。
  - 文案键 `site.darkMode`（zh-cn/en/messages.yaml）。
- 验证：线上 JS 含 `data-theme`/`darkMode`/`site.darkMode`，CSS 含 `html[data-theme` 与 `--moeflow-primaryColor`，首页 200。
- **暗色修正**（新增 token：`--moeflow-surface/surface2/control/controlIcon/progressTrack/warningColorLight/successColorLight/progressStatus` 等，均明暗两套）：
  - ① 图片翻译器未选中白底：`ImageSourceViewer`、`ImageSourceViewerModeControl`、`markers/proofread/index.tsx`、`markers/overview/index.tsx` 的 `#fff/#f7f7f7/#eee/#fff6f6` → 主题变量。
  - ②③ 返回/设置/翻页按钮（`ImageViewer` 的 Back/Setting/Paging、`ImageViewerZoomPanel`、`ImageViewerPagingPanel`、`ImageViewerSettingPanel`）的 `#fff`/`rgba(255,255,255,opacity)` → `var(--moeflow-control)`（暗色近黑）。
  - ④ 文件卡状态色：`TranslationProgress.tsx` 进度条底/黄/粉/灰与徽标色 `#efefef/#ffe4a8/#ffd26e/#ffb3bc` → 主题变量（暗色压暗）；`FileItem.tsx` 卡片底 `var(--moeflow-surface)`。
  - ⑤ 左栏白底：`Dashboard.tsx` 的 `.Dashboard__CollapsibleMenu`、`DashboardMenu.tsx` 的 logo → `var(--moeflow-surface)`。
  - ⑥ 搜索栏：App.tsx 暗色覆盖补 Autocomplete/Select 内层输入框透明。
  - ⑦ 说明：早期 App.tsx 的暗色覆盖用了**嵌套式** `html[data-theme='dark']{ .ant-x {...} }`，对 antd Modal/Select 未可靠生效（模态/下拉仍白）。已改为**扁平选择器**（每条 `html[data-theme='dark'] .ant-x`）+ 大量 `!important`，并扩充 `.ant-modal* / .ant-modal-confirm* / .ant-select-selector / .ant-select-selection / .ant-picker` 等；覆盖数量由 1 个嵌套块 → 96 个扁平选择器（线上已确认）。

---

## 十、图片翻译器「符号工具」（本次新增）
- 在翻译输入框（`markers/translate/index.tsx` 的 `ImageSourceViewerTranslator__Bottom`）上方加一行符号工具条：点按键在光标处插入对应符号（`insertSymbol` 读取 `textArea.selectionStart/End` 后拼入并重新派发 `editMyTranslationSaga`，随后恢复光标）。
- 符号集 `SYMBOLS`：`… ～ ♡ ♠ 「 」 『 』 （ ） ○ ● ※ ☆ ★ □ ◇ ♪ ♬ · 〆`。
- 「隐藏符号工具」按钮收起工具条；状态栏右侧「符号工具」按钮随时显示/隐藏。样式用 `--moeflow-surface` 等主题变量（明暗自适应）。
- 文案键 `imageTranslator.hideSymbolTool` / `imageTranslator.showSymbolTool`（zh-cn/en/messages.yaml）。
- 验证：线上 JS 含 `SymbolTool__Key`/`imageTranslator.hideSymbolTool`，首页 200。
- **增强**：翻译模式默认高度 `200->380`、校对模式 `250->420`；两者底部面板顶部各加一条**可拖拽拉伸条**（`ResizeHandle`，`onMouseDown` 追踪 `mousemove` 调整 `bottomPanelHeight` 状态，范围 80~560/620）。校对模式（`proofread/index.tsx`）加入与翻译一致的**符号工具**，且重构为**底部面板顶部单一符号条**（无翻译时插入翻译输入框、否则插入校对输入框 `insertSymbol`；不再遮挡 TranslationUser 图标）。**统一「显示/隐藏符号工具」为常驻单开关**：翻译模式在顶部 `FunctionBar`（新增，常驻行，仅放该开关，右对齐）、校对模式在顶部 FunctionBar；移除各符号条上的「隐藏符号工具」按钮与翻译模式底部状态栏开关，保证隐藏后能再次呼出。样式 `SymbolTool__`/拉伸条用主题变量。线上已验证存在 `ResizeHandle`/`ImageSourceViewerProofreader__SymbolTool`。
- **图片查看器缩放条暗色适配**：`ImageViewerZoomPanel`（横向白条，含按钮+水平滑块）面板底 `#fff`→`var(--moeflow-control)`，缩小按钮 `#fff/#eee`→`control/surface2`，滑块 rail/轨道/手柄 `#e1e1e1/#666666`→新增 `--moeflow-sliderRail`（亮 #e1e1e1/暗 #3a3a3a）、`--moeflow-sliderThumb`（亮 #666666/暗 #d0d0d0），暗色下不再刺眼。

---

## 备注
- 本改动为定制版本，与上游 moeflow 官方代码存在差异；如需回退，可用官方 tag `v1.1.7` / `v1.1.8` 重新构建。
- 涉及权限调整（角色编辑、项目集删除、项目移动、文件搜索 as range），请按实际团队角色配置确认。
