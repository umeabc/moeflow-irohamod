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

## 备注
- 本改动为定制版本，与上游 moeflow 官方代码存在差异；如需回退，可用官方 tag `v1.1.7` / `v1.1.8` 重新构建。
- 涉及权限调整（角色编辑、项目集删除、项目移动），请按实际团队角色配置确认。
