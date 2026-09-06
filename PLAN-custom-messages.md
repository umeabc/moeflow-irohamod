# 自定义文案覆盖功能（admin 后台可编辑项）

## Context
用户比较两个 `zh-cn.json`：修改后 irohamod（本地 `frontend/src/locales/zh-cn.json`）vs 原文官方 `moeflow-com/moeflow` main 分支 `frontend-v1/src/locales/zh-cn.json`，得到 **90 个新增 key + 2 个修改 key = 92 个 irohamod 定制文案**。

用户要求：把这 92 个「修改过的项目」做成 admin 后台的可修改项（文案值可在后台改，运行时生效、免改代码）。已确认：**形态 = 文案值可后台改；范围 = 仅这 92 个 key**。

## 实现方案（水印/上下文），待后端探索确认后细化。