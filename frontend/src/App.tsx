import { css, Global } from '@emotion/core';
import React, { lazy, Suspense } from 'react';
import { useSelector } from 'react-redux';
import { Redirect, Route, Switch, useLocation } from 'react-router-dom';
import { NoticeLoginPopup } from './components/notice/NoticeLoginPopup';
import Dashboard from './pages/Dashboard';
import { IndexPage } from './pages/Index';
import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import { NotFoundPage } from './pages/404';
import { AppState } from './store';
import style from './style';
import { routes } from './pages/routes';
import { Spin } from './components/shared/Spin';

const Admin = lazy(() => import('./pages/Admin'));
const ImageTranslator = lazy(() => import('./pages/ImageTranslator'));

// 公共的页面
const publicPaths = [
  routes.index,
  routes.login,
  routes.signUp,
  routes.resetPassword,
] as readonly string[];

const App: React.FC = () => {
  const location = useLocation();
  const token = useSelector((state: AppState) => state.user.token);
  const platform = useSelector((state: AppState) => state.site.platform);
  const userIsAdmin = useSelector((state: AppState) => state.user.admin);
  const isMobile = platform === 'mobile';

  return (
    <>
      {/* 用于覆盖 antd/antd-mobile 样式 */}
      <Global
        styles={css`
          /* 分页 */

          .ant-pagination-prev,
          .ant-pagination-next {
            padding: 0 10px;
          }

          /* 输入框前缀 */

          .ant-input-prefix {
            margin-left: 4px;
            margin-right: 12px;
            color: var(--moeflow-componentInputPrefix, #858585);
            font-size: 15px;
            line-height: 25px;
          }

          /** 单选组（因为可能折行，取消圆角） */

          .ant-radio-button-wrapper {
            &:first-of-type {
              border-radius: 0;
            }

            &:last-child {
              border-radius: 0;
            }
          }

          /** 骨架屏 */

          .ant-skeleton {
            .ant-skeleton-avatar.ant-skeleton-avatar-square {
              border-radius: ${style.borderRadiusBase};
            }
          }

          /** 导航栏 */

          .am-navbar {
            .am-navbar-title {
              font-size: 16px;
            }
          }

          /* 抽屉 */

          .ant-drawer-title {
            color: ${style.primaryColor};
            font-size: 16px;
          }

          .ant-badge-dot {
            background-color: ${style.primaryColor};
          }

          .ant-badge-count {
            background-color: ${style.primaryColor};
          }

          /* 时间选择面板：为小时/分钟两列增加列头标注（antd 默认无） */
          .ant-picker-time-panel-column::before {
            position: sticky;
            top: 0;
            z-index: 2;
            display: block;
            padding: 4px 0 5px;
            font-size: 12px;
            line-height: 1.4;
            text-align: center;
            color: var(--moeflow-textColorSecondary);
            background-color: var(--moeflow-surface);
          }
          .ant-picker-time-panel-column:nth-child(1)::before {
            content: '时';
          }
          .ant-picker-time-panel-column:nth-child(2)::before {
            content: '分';
          }

          /* == 手机版 == */
          ${isMobile &&
          css`
            #root {
              padding-bottom: constant(safe-area-inset-bottom); /* iOS 11.0 */
              padding-bottom: env(safe-area-inset-bottom); /* iOS 11.2 */
            }

            /* 表单 */

            .ant-form {
              .ant-row.ant-form-item {
                .ant-col.ant-form-item-label {
                  padding-bottom: 10px;
                  line-height: 1;

                  label {
                    height: auto;
                  }
                }
              }
            }

            /* 分页 */

            .ant-pagination-prev,
            .ant-pagination-next {
              padding: 0 15px;
            }
          `}
        `}
      />
      {/* 暗色模式：覆盖 antd / antd-mobile 组件的浅色默认值 */}
      <Global
        styles={css`
          /* 暗色覆盖使用 palette 组件 token；fallback 保留 default 原配色。
             palettes.css 以更高属性权重补充实时主色与选中态。 */
          html[data-theme='dark'] .ant-modal,
          html[data-theme='dark'] .ant-modal-content,
          html[data-theme='dark'] .ant-modal-body,
          html[data-theme='dark'] .ant-modal-header,
          html[data-theme='dark'] .ant-modal-footer,
          html[data-theme='dark'] .ant-modal-confirm,
          html[data-theme='dark'] .ant-modal-confirm-body,
          html[data-theme='dark'] .ant-modal-confirm-content {
            background-color: var(--moeflow-componentSurface, #1f1f1f) !important;
            color: var(--moeflow-textColor) !important;
          }
          html[data-theme='dark'] .ant-modal-title,
          html[data-theme='dark'] .ant-modal-confirm-title {
            color: var(--moeflow-textColor);
          }
          html[data-theme='dark'] .ant-modal-confirm-btns .ant-btn,
          html[data-theme='dark'] .ant-btn:not(.ant-btn-primary):not(.ant-btn-link):not(.ant-btn-text) {
            background-color: var(--moeflow-componentSurface, #1f1f1f) !important;
            border-color: var(--moeflow-componentBorder, #333) !important;
            color: var(--moeflow-textColor) !important;
          }
          html[data-theme='dark'] .ant-input,
          html[data-theme='dark'] .ant-input-affix-wrapper,
          html[data-theme='dark'] .ant-input-number,
          html[data-theme='dark'] .ant-input-number-input,
          html[data-theme='dark'] .ant-mentions,
          html[data-theme='dark'] .ant-select-selector,
          html[data-theme='dark'] .ant-select-selection,
          html[data-theme='dark'] .ant-picker,
          html[data-theme='dark'] .ant-upload.ant-upload-drag,
          html[data-theme='dark'] .ant-upload-list-item,
          html[data-theme='dark'] .ant-card,
          html[data-theme='dark'] .ant-card-head,
          html[data-theme='dark'] .ant-table {
            background-color: var(--moeflow-componentSurface, #1f1f1f) !important;
            border-color: var(--moeflow-componentBorder, #333) !important;
            color: var(--moeflow-textColor) !important;
          }
          html[data-theme='dark'] .ant-input::placeholder,
          html[data-theme='dark'] input::placeholder,
          html[data-theme='dark'] textarea::placeholder {
            color: var(--moeflow-textColorSecondaryLight);
          }
          html[data-theme='dark'] .ant-select-dropdown,
          html[data-theme='dark'] .ant-dropdown-menu,
          html[data-theme='dark'] .ant-dropdown-menu-item,
          html[data-theme='dark'] .ant-drawer-content,
          html[data-theme='dark'] .ant-drawer-header,
          html[data-theme='dark'] .ant-drawer-title,
          html[data-theme='dark'] .ant-message-notice-content,
          html[data-theme='dark'] .ant-notification-notice,
          html[data-theme='dark'] .ant-tooltip-inner,
          html[data-theme='dark'] .ant-popover-inner,
          html[data-theme='dark'] .ant-popover-inner-content,
          html[data-theme='dark'] .ant-cascader-menus,
          html[data-theme='dark'] .ant-select-item,
          html[data-theme='dark'] .ant-table-thead > tr > th,
          html[data-theme='dark'] .ant-pagination-item,
          html[data-theme='dark'] .ant-pagination-prev .ant-pagination-item-link,
          html[data-theme='dark'] .ant-pagination-next .ant-pagination-item-link,
          html[data-theme='dark'] .ant-breadcrumb,
          html[data-theme='dark'] .ant-tabs.ant-tabs-card .ant-tabs-card-bar .ant-tabs-tab,
          html[data-theme='dark'] .ant-empty-image {
            background-color: var(--moeflow-componentElevated, #262626) !important;
            color: var(--moeflow-textColor) !important;
          }
          html[data-theme='dark'] .ant-select-item-option-active,
          html[data-theme='dark'] .ant-dropdown-menu-item:hover,
          html[data-theme='dark'] .ant-dropdown-menu-submenu-title:hover,
          html[data-theme='dark'] .ant-tabs-tab:hover {
            background-color: var(--moeflow-componentHover, #333);
          }
          html[data-theme='dark'] .ant-select-item-option-selected {
            background-color: var(--moeflow-componentSelected, rgba(var(--moeflow-primaryRgb), 0.2));
          }
          /* 让 AutoComplete/Select 内层输入框透明，露出暗色底 */
          html[data-theme='dark'] .ant-select-selection-search,
          html[data-theme='dark'] .ant-select-selection-search-input,
          html[data-theme='dark'] .ant-select-selection-search-input input,
          html[data-theme='dark'] .ant-auto-complete .ant-select-selection-search-input {
            background-color: transparent !important;
            color: var(--moeflow-textColor) !important;
          }
          html[data-theme='dark'] .ant-table,
          html[data-theme='dark'] .ant-table-thead > tr > th,
          html[data-theme='dark'] .ant-table-tbody > tr > td,
          html[data-theme='dark'] .ant-table-tbody > tr > td.ant-table-cell-fix-left,
          html[data-theme='dark'] .ant-table-tbody > tr > td.ant-table-cell-fix-right {
            border-color: var(--moeflow-componentBorder, #333);
          }
          html[data-theme='dark'] .ant-table-tbody > tr:hover > td,
          html[data-theme='dark'] .ant-table-thead > tr > th {
            background-color: var(--moeflow-componentMuted, #2a2a2a);
          }
          html[data-theme='dark'] .ant-pagination-item-active,
          html[data-theme='dark'] .ant-tabs-ink-bar {
            background-color: var(--moeflow-primaryColor);
          }
          html[data-theme='dark'] .ant-form-item,
          html[data-theme='dark'] .ant-upload-list-item-name,
          html[data-theme='dark'] .ant-upload-list-item {
            color: var(--moeflow-textColor);
          }
          html[data-theme='dark'] .ant-form-item-label > label {
            color: var(--moeflow-textColor) !important;
          }
          html[data-theme='dark'] .ant-divider,
          html[data-theme='dark'] .ant-divider-horizontal {
            border-color: var(--moeflow-componentBorder, #333);
          }
          html[data-theme='dark'] .ant-badge-count {
            box-shadow: none;
          }
          html[data-theme='dark'] .ant-checkbox-inner,
          html[data-theme='dark'] .ant-radio-inner {
            border-color: var(--moeflow-componentBorderStrong, #555);
            background-color: var(--moeflow-componentSurface, #1f1f1f);
          }
          html[data-theme='dark'] .ant-checkbox-checked .ant-checkbox-inner,
          html[data-theme='dark'] .ant-radio-checked .ant-radio-inner {
            border-color: var(--moeflow-primaryColor);
            background-color: var(--moeflow-primaryColor);
          }
          html[data-theme='dark'] .ant-switch {
            background-color: var(--moeflow-componentSwitch, #444);
          }
          html[data-theme='dark'] .ant-switch-checked {
            background-color: var(--moeflow-primaryColor);
          }
          html[data-theme='dark'] .ant-spin-text,
          html[data-theme='dark'] .ant-spin-blur {
            color: var(--moeflow-textColor);
          }
          html[data-theme='dark'] .ant-empty-description,
          html[data-theme='dark'] .ant-empty-image-inner {
            color: var(--moeflow-textColorSecondary);
          }
          html[data-theme='dark'] .ant-tag {
            background-color: var(--moeflow-componentMuted, #2a2a2a);
            border-color: var(--moeflow-componentBorder, #333);
            color: var(--moeflow-textColor);
          }
          /* Tabs（默认线型标签页） */
          html[data-theme='dark'] .ant-tabs {
            color: var(--moeflow-textColor);
          }
          html[data-theme='dark'] .ant-tabs-tab,
          html[data-theme='dark'] .ant-tabs-tab-btn {
            color: var(--moeflow-textColorLighter);
          }
          html[data-theme='dark'] .ant-tabs-tab:hover,
          html[data-theme='dark'] .ant-tabs-tab:hover .ant-tabs-tab-btn {
            color: var(--moeflow-textColor);
          }
          html[data-theme='dark'] .ant-tabs-tab.ant-tabs-tab-active,
          html[data-theme='dark'] .ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn {
            color: var(--moeflow-primaryColor);
          }
          html[data-theme='dark'] .ant-tabs-nav::before {
            border-bottom-color: var(--moeflow-componentBorder, #333);
          }
          html[data-theme='dark'] .ant-tabs-nav-more {
            color: var(--moeflow-textColorLighter);
          }
          /* Descriptions（详情弹窗） */
          html[data-theme='dark'] .ant-descriptions-view,
          html[data-theme='dark'] .ant-descriptions-row > th,
          html[data-theme='dark'] .ant-descriptions-row > td {
            border-color: var(--moeflow-componentBorder, #333) !important;
          }
          html[data-theme='dark'] .ant-descriptions-item-label {
            background-color: var(--moeflow-componentElevated, #262626) !important;
            color: var(--moeflow-textColorLighter) !important;
          }
          html[data-theme='dark'] .ant-descriptions-item-content {
            background-color: var(--moeflow-componentSurface, #1f1f1f) !important;
            color: var(--moeflow-textColor) !important;
          }
          /* 日期选择器（筛选时间范围） */
          html[data-theme='dark'] .ant-picker-input > input {
            color: var(--moeflow-textColor);
          }
          html[data-theme='dark'] .ant-picker-panel-container {
            background-color: var(--moeflow-componentElevated, #262626);
            color: var(--moeflow-textColor);
          }
          html[data-theme='dark'] .ant-picker-header,
          html[data-theme='dark'] .ant-picker-footer,
          html[data-theme='dark'] .ant-picker-content th,
          html[data-theme='dark'] .ant-picker-cell {
            color: var(--moeflow-textColorSecondary);
          }
          html[data-theme='dark'] .ant-picker-cell-in-view {
            color: var(--moeflow-textColor);
          }
          html[data-theme='dark'] .ant-picker-cell:hover:not(.ant-picker-cell-selected):not(.ant-picker-cell-range-start):not(.ant-picker-cell-range-end) .ant-picker-cell-inner,
          html[data-theme='dark'] .ant-picker-time-panel-column > li.ant-picker-time-panel-cell .ant-picker-time-panel-cell-inner:hover {
            background-color: var(--moeflow-componentHover, #333);
          }
          /* 时间列（小时/分钟）文字与选中态 */
          html[data-theme='dark'] .ant-picker-time-panel-column::before {
            background-color: var(--moeflow-componentElevated, #262626);
            color: var(--moeflow-textColorSecondary);
          }
          html[data-theme='dark'] .ant-picker-time-panel-column:not(:first-child) {
            border-left-color: var(--moeflow-componentBorder, #333);
          }
          html[data-theme='dark'] .ant-picker-time-panel-column > li.ant-picker-time-panel-cell .ant-picker-time-panel-cell-inner {
            color: var(--moeflow-textColor);
          }
          html[data-theme='dark'] .ant-picker-time-panel-column > li.ant-picker-time-panel-cell-selected .ant-picker-time-panel-cell-inner {
            background-color: var(--moeflow-primaryColor);
            color: var(--moeflow-primaryContrast);
          }
          html[data-theme='dark'] .ant-tooltip,
          html[data-theme='dark'] .ant-tooltip-inner {
            color: var(--moeflow-textColor);
          }
          /* Typography（重置密码页等处的 Paragraph 默认深色文字，暗色下不可见） */
          html[data-theme='dark'] .ant-typography {
            color: var(--moeflow-textColor);
          }
          /* Radio.Button 分段按钮（创建团队/项目设置等表单） */
          html[data-theme='dark'] .ant-radio-button-wrapper {
            background-color: var(--moeflow-componentSurface, #1f1f1f) !important;
            border-color: var(--moeflow-componentBorderStrong, #555) !important;
            color: var(--moeflow-textColor) !important;
          }
          html[data-theme='dark'] .ant-radio-button-wrapper::before {
            background-color: var(--moeflow-componentBorderStrong, #555) !important;
          }
          html[data-theme='dark']
            .ant-radio-button-wrapper-checked:not(
              .ant-radio-button-wrapper-disabled
            ) {
            background-color: var(--moeflow-componentMuted, #2a2a2a) !important;
            border-color: var(--moeflow-primaryColor) !important;
            color: var(--moeflow-primaryColorLighter) !important;
          }
          html[data-theme='dark']
            .ant-radio-button-wrapper:hover:not(
              .ant-radio-button-wrapper-checked
            ) {
            color: var(--moeflow-primaryColorLighter) !important;
          }
          /* 进度条轨道（管理员工作台硬盘占用等） */
          html[data-theme='dark'] .ant-progress-line .ant-progress-inner {
            background-color: var(--moeflow-componentMuted, #2a2a2a) !important;
          }
          /* 输入框前缀附加块（登录页验证码图后面） */
          html[data-theme='dark'] .ant-input-group-addon {
            background-color: var(--moeflow-componentElevated, #262626) !important;
            border-color: var(--moeflow-componentBorder, #333) !important;
            color: var(--moeflow-textColor) !important;
          }
          /* 禁用按钮（antd 默认浅灰底在暗色下刺眼） */
          html[data-theme='dark'] .ant-btn[disabled],
          html[data-theme='dark'] .ant-btn[disabled]:hover {
            background-color: var(--moeflow-componentMuted, #2a2a2a) !important;
            border-color: var(--moeflow-componentBorder, #333) !important;
            color: var(--moeflow-textColorSecondaryLight) !important;
          }
          html[data-theme='dark'] .ant-btn-primary[disabled],
          html[data-theme='dark'] .ant-btn-primary[disabled]:hover {
            background-color: var(--moeflow-componentPrimaryDisabledBg, #33272a) !important;
            border-color: var(--moeflow-componentPrimaryDisabledBorder, #403338) !important;
            color: var(--moeflow-textColorSecondaryLight) !important;
          }
          /* 滑动条（图片翻译器缩放面板：轨道与手柄） */
          html[data-theme='dark'] .ant-slider-rail {
            background-color: var(--moeflow-sliderRail) !important;
          }
          html[data-theme='dark'] .ant-slider-handle {
            background-color: var(--moeflow-sliderThumb) !important;
            border-color: var(--moeflow-sliderThumb) !important;
          }
          /* antd-mobile */
          html[data-theme='dark'] .am-navbar {
            background-color: var(--moeflow-componentSurface, #1f1f1f);
          }
          html[data-theme='dark'] .am-navbar-title,
          html[data-theme='dark'] .am-navbar-left,
          html[data-theme='dark'] .am-navbar-right {
            color: var(--moeflow-textColor);
          }
          html[data-theme='dark'] .am-tab-bar,
          html[data-theme='dark'] .am-tab-bar-item,
          html[data-theme='dark'] .am-tab-bar-content,
          html[data-theme='dark'] .am-tab-bar-tab {
            background-color: var(--moeflow-componentSurface, #1f1f1f);
            color: var(--moeflow-textColor);
          }
          /* 新配色保留 TabBar 内联的 tintColor / unselectedTintColor CSS 变量，
             不能用统一文字色覆盖，否则选中项会失去主色。 */
          html[data-theme='dark']:is([data-palette='default'], :not([data-palette])) .am-tab-bar-item .am-tab-bar-tab-icon,
          html[data-theme='dark']:is([data-palette='default'], :not([data-palette])) .am-tab-bar-tab-title {
            color: var(--moeflow-textColor);
          }
          /* antd-mobile TabBar 的 barTintColor 以内联样式落下，需 !important 才能盖住 */
          html[data-theme='dark'] .am-tab-bar-bar {
            background-color: var(--moeflow-componentSurface, #1f1f1f) !important;
          }
        `}
      />
      {/* 如果没有 token 且访问路径不在公共路径中，则跳转到登陆页面 */}
      {!token && !publicPaths.includes(location.pathname) ? (
        <Redirect to={routes.login} />
      ) : (
        <Switch>
          {/* 去除 URL 结尾的斜杠 */}
          <Route
            path="/:url*(/+)"
            exact
            strict
            render={({ location }) => (
              <Redirect to={location.pathname.replace(/\/+$/, '')} />
            )}
          />
          {/* 去除 URL 中间的重复斜杠 */}
          <Route
            path="/:url(.*//+.*)"
            exact
            strict
            render={({ match }) => {
              const params = match.params as { url?: string };
              return <Redirect to={`/${params.url?.replace(/\/\/+/, '/') ?? ''}`} />;
            }}
          />
          <Route exact path={routes.index}>
            <IndexPage />
          </Route>
          <Route path={routes.login}>
            <Login />
          </Route>
          <Route path={routes.signUp}>
            <Register />
          </Route>
          <Route path={routes.resetPassword}>
            <ResetPassword />
          </Route>
          <Route path={routes.imageTranslator.asRouter}>
            <Suspense fallback={<Spin size="large" />}>
              <ImageTranslator />
            </Suspense>
          </Route>
          <Route path={routes.dashboard.$}>
            <Dashboard />
          </Route>
          {userIsAdmin && (
            <Route path={routes.admin}>
              <Suspense fallback={<Spin size="large" />}>
                <Admin />
              </Suspense>
            </Route>
          )}
          <Route path="/*">
            <NotFoundPage />
          </Route>
        </Switch>
      )}
      {/* 登录后弹未读站点通知（全局挂载，仅在已登录时生效） */}
      <NoticeLoginPopup />
    </>
  );
};

export default App;
