# 自定义文案覆盖功能（admin 后台可编辑项）

## Context
用户比较两个 `zh-cn.json`：修改后 irohamod（本地 `frontend/src/locales/zh-cn.json`）vs 原文官方 `moeflow-com/moeflow` main 分支 `frontend-v1/src/locales/zh-cn.json`，得到 **90 个新增 key + 2 个修改 key = 92 个 irohamod 定制文案**。

用户要求：把这 92 个「修改过的项目」做成 admin 后台的可修改项（文案值可在后台改，运行时生效、免改代码）。已确认：**形态 = 文案值可后台改；范围 = 仅这 92 个 key**。

## 调研结论
- 前端 i18n：`IntlProvider` 在 `frontend/src/index.tsx` 用 `intlMessages` 挂载；`frontend/src/locales/index.ts` 的 `doInitI18n()` 经 `loadI18nLocale(locales)` 动态 `import('./zh-cn.json')` 得到扁平 `{key:value}` messages，再 `createIntl({messages: intlMessages})`。**无任何后端覆盖机制**。
- 语言切换 `setLocale()` 写 localStorage 后 `location.reload()`（可复用作为「保存覆盖后刷新生效」）。
- 后端 `SiteSetting` 是单例；`SiteSetting.get()`、`to_api()`；`SiteSettingAPI`（GET/PUT，admin_required）；`HomepageAPI`（GET 公开，返回 homepage_html/css）——公开读接口的范式。
- 前端 API 封装：`api.siteSetting.getXxx({}).then(r => r.data)`，错误 `.catch(e => e.default(form))`；`api` 为命名导入。
- 前端 admin 新增页需改：① `components/admin/` 新建组件；② `pages/Admin.tsx` Switch 加 Route；③ `components/admin/AdminSidebar.tsx` 加 AdminNavItem；④ locale 加 admin.* key。

## 后端改动
### 1. SiteSetting 模型（`backend/app/models/site_setting.py`）
新增字段：`custom_messages = DictField(db_field="cm", default=dict)`。
`to_api()` 增加返回 `custom_messages`。

### 2. 公开读接口（`backend/app/apis/site_setting.py`）
新增 `CustomMessagesAPI`（**无需鉴权**，登录页文案也要可覆盖）：
```python
class CustomMessagesAPI(MoeAPIView):
    def get(self):
        return SiteSetting.get().custom_messages  # {key: value}
```

### 3. 管理写接口（`backend/app/apis/site_setting.py`）
新增 `AdminCustomMessagesAPI`（`@admin_required`）`put`：
- 接收 `{ messages: {key: value} }`，`get_json()`（自写轻量校验：dict, 值 str，可选长度上限）。
- 写入 `SiteSetting.get().custom_messages = messages; save()`，返回 `to_api().custom_messages`。

### 4. 路由（`backend/app/apis/urls.py`）
- `site` blueprint 加 `GET /v1/site/custom-messages` → CustomMessagesAPI
- `admin` blueprint 加 `PUT /v1/admin/custom-messages` → AdminCustomMessagesAPI

## 前端改动
### 1. 可改项清单（`frontend/src/locales/custom-messages.ts`）
固化 92 个 key，含默认值（取自 irohamod zh-cn.json）与分组：`export const CUSTOM_MESSAGE_DEFS: Array<{ key: string; group: string; default: string; desc?: string }>`。
分组：登录注册(auth.*, register.*, reset.*)、管理员后台(admin.*)、图片移动(file.move*)、AI 机翻(fileList.aiTranslate.*, imageTranslator.*)、暗色/符号(darkMode, hide/showSymbolTool)、其他。

### 2. API（`frontend/src/apis/siteSetting.ts`）
- `getCustomMessages()` GET `/v1/site/custom-messages` → `APIOverrides { [key]: string }`
- `saveCustomMessages({ messages })` PUT `/v1/admin/custom-messages`

### 3. 运行时覆盖（`frontend/src/locales/index.ts`）
在 `doInitI18n` 里，`loadI18nLocale` 后：
```ts
let overrides = {};
try { overrides = (await getCustomMessages()).data || {}; } catch (e) { /* 静默，用默认 */ }
const merged = { ...intlMessages, ...overrides };
singletonIntl = createIntl({ locale, messages: merged }, cache);
```
（避免循环依赖：`getCustomMessages` 从 `@/apis` import 会引 `getIntl`→`@/locales` 循环。方案：`locales/index.ts` 直接 `import { request, getAxiosInstance } from '@/apis'` 或改用顶层 `import('@/apis').then(...)`；但 `@/apis` 又 import `getIntl` from `@/locales` → 循环。**规避**：在 `locales/index.ts` 内用 fetch 直接打 `runtimeConfig.baseURL + '/v1/site/custom-messages'`（`import { runtimeConfig } from '@/configs'`），不经过 apis 层的 getIntl，避免循环依赖。）

### 4. 后台页面（`frontend/src/components/admin/AdminCustomMessages.tsx`）
- 加载时并行取 `getCustomMessages()` 与 CUSTOM_MESSAGE_DEFS；按组折叠面板（Collapse 或 Tabs）展示，每行：key + 默认值(只读小字) + 当前值(可编辑 TextArea/Input)。
- 保存：收集全部（仅改过的或全部）发出 `saveCustomMessages({ messages })` → `message.success → location.reload()`（reload 后 initI18n 拉到新覆盖，界面生效）。
- 提供「恢复默认」可清空某 key（置空即从前端覆盖字典移除/回退默认）。

### 5. 注册
- `pages/Admin.tsx` 加 `<Route path={`${path}/custom-messages`}>`（page helper 包装）。
- `AdminSidebar.tsx`「系统」分区加 AdminNavItem（`icon: 'language'` 或 'edit'）。
- `AdminTopbar.tsx` 加搜索项。
- locale：`admin.customMessages`（自定义文案）、`admin.pageDescription.customMessages`（定制文案说明）、`admin.customMsgDefault`（默认）、`admin.customMsgRestore`（恢复默认）、`admin.customMsgSaved`（已保存文案）等，zh-cn.json / en.json / messages.yaml 三处。

## 验证
- 后端：容器内 `python -c` 铸 admin token，`curl GET /v1/site/custom-messages`（无需 token 返回 dict）、`PUT /v1/admin/custom-messages` 保存后 GET 回读一致；未登录前端也能拉到。
- 前端：本地 `npm run build` 成功；后台「自定义文案」页出现 92 项，改一句保存 → 刷新后该文案全局生效（含登录页 auth.*）；恢复默认生效。
- 部署测试机：重建后端+前端镜像并重启（前端连同后端一起做，避免 nginx upstream 缓存 502）。
- 生产机不触碰。

## 备注
- 默认值直接读本地 irohamod zh-cn.json 已在仓库中，无需重新拉取官方；diff 用本地生成脚本落地到 custom-messages.ts。
- 不 bump 版本、不 push（用户未要求）。