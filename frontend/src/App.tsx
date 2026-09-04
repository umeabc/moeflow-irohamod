import { css, Global } from '@emotion/core';
import React from 'react';
import { useSelector } from 'react-redux';
import { Redirect, Route, Switch, useLocation } from 'react-router-dom';
import Admin from './pages/Admin';
import Dashboard from './pages/Dashboard';
import ImageTranslator from './pages/ImageTranslator';
import { IndexPage } from './pages/Index';
import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import { NotFoundPage } from './pages/404';
import { AppState } from './store';
import style from './style';
import { routes } from './pages/routes';

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
            color: #858585;
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
          /* 暗色模式：覆盖 antd / antd-mobile 组件（全部使用扁平选择器 + !important 确保生效） */
          html[data-theme='dark'] .ant-modal,
          html[data-theme='dark'] .ant-modal-content,
          html[data-theme='dark'] .ant-modal-body,
          html[data-theme='dark'] .ant-modal-header,
          html[data-theme='dark'] .ant-modal-footer,
          html[data-theme='dark'] .ant-modal-confirm,
          html[data-theme='dark'] .ant-modal-confirm-body,
          html[data-theme='dark'] .ant-modal-confirm-content {
            background-color: #1f1f1f !important;
            color: rgba(255, 255, 255, 0.85) !important;
          }
          html[data-theme='dark'] .ant-modal-title,
          html[data-theme='dark'] .ant-modal-confirm-title {
            color: rgba(255, 255, 255, 0.85);
          }
          html[data-theme='dark'] .ant-modal-confirm-btns .ant-btn,
          html[data-theme='dark'] .ant-btn:not(.ant-btn-primary):not(.ant-btn-link):not(.ant-btn-text) {
            background-color: #1f1f1f !important;
            border-color: #333 !important;
            color: rgba(255, 255, 255, 0.85) !important;
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
            background-color: #1f1f1f !important;
            border-color: #333 !important;
            color: rgba(255, 255, 255, 0.85) !important;
          }
          html[data-theme='dark'] .ant-input::placeholder,
          html[data-theme='dark'] input::placeholder,
          html[data-theme='dark'] textarea::placeholder {
            color: rgba(255, 255, 255, 0.35);
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
            background-color: #262626 !important;
            color: rgba(255, 255, 255, 0.85) !important;
          }
          html[data-theme='dark'] .ant-select-item-option-active,
          html[data-theme='dark'] .ant-dropdown-menu-item:hover,
          html[data-theme='dark'] .ant-dropdown-menu-submenu-title:hover,
          html[data-theme='dark'] .ant-tabs-tab:hover {
            background-color: #333;
          }
          html[data-theme='dark'] .ant-select-item-option-selected {
            background-color: rgba(255, 101, 124, 0.2);
          }
          /* 让 AutoComplete/Select 内层输入框透明，露出暗色底 */
          html[data-theme='dark'] .ant-select-selection-search,
          html[data-theme='dark'] .ant-select-selection-search-input,
          html[data-theme='dark'] .ant-select-selection-search-input input,
          html[data-theme='dark'] .ant-auto-complete .ant-select-selection-search-input {
            background-color: transparent !important;
            color: rgba(255, 255, 255, 0.85) !important;
          }
          html[data-theme='dark'] .ant-table,
          html[data-theme='dark'] .ant-table-thead > tr > th,
          html[data-theme='dark'] .ant-table-tbody > tr > td,
          html[data-theme='dark'] .ant-table-tbody > tr > td.ant-table-cell-fix-left,
          html[data-theme='dark'] .ant-table-tbody > tr > td.ant-table-cell-fix-right {
            border-color: #333;
          }
          html[data-theme='dark'] .ant-table-tbody > tr:hover > td,
          html[data-theme='dark'] .ant-table-thead > tr > th {
            background-color: #2a2a2a;
          }
          html[data-theme='dark'] .ant-pagination-item-active,
          html[data-theme='dark'] .ant-tabs-ink-bar {
            background-color: var(--moeflow-primaryColor);
          }
          html[data-theme='dark'] .ant-form-item,
          html[data-theme='dark'] .ant-upload-list-item-name,
          html[data-theme='dark'] .ant-upload-list-item {
            color: rgba(255, 255, 255, 0.85);
          }
          html[data-theme='dark'] .ant-form-item-label > label {
            color: rgba(255, 255, 255, 0.85) !important;
          }
          /* admin 内容区为浅色 Layout.site-layout，标签需为深色以保证可读 */
          html[data-theme='dark'] .site-layout .ant-form-item-label > label {
            color: rgba(0, 0, 0, 0.85) !important;
          }
          html[data-theme='dark'] .ant-divider,
          html[data-theme='dark'] .ant-divider-horizontal {
            border-color: #333;
          }
          html[data-theme='dark'] .ant-badge-count {
            box-shadow: none;
          }
          html[data-theme='dark'] .ant-checkbox-inner,
          html[data-theme='dark'] .ant-radio-inner {
            border-color: #555;
            background-color: #1f1f1f;
          }
          html[data-theme='dark'] .ant-checkbox-checked .ant-checkbox-inner,
          html[data-theme='dark'] .ant-radio-checked .ant-radio-inner {
            border-color: var(--moeflow-primaryColor);
            background-color: var(--moeflow-primaryColor);
          }
          html[data-theme='dark'] .ant-switch {
            background-color: #444;
          }
          html[data-theme='dark'] .ant-switch-checked {
            background-color: var(--moeflow-primaryColor);
          }
          html[data-theme='dark'] .ant-spin-text,
          html[data-theme='dark'] .ant-spin-blur {
            color: rgba(255, 255, 255, 0.85);
          }
          html[data-theme='dark'] .ant-empty-description,
          html[data-theme='dark'] .ant-empty-image-inner {
            color: rgba(255, 255, 255, 0.45);
          }
          html[data-theme='dark'] .ant-tag {
            background-color: #2a2a2a;
            border-color: #333;
            color: rgba(255, 255, 255, 0.85);
          }
          html[data-theme='dark'] .ant-tooltip,
          html[data-theme='dark'] .ant-tooltip-inner {
            color: rgba(255, 255, 255, 0.85);
          }
          /* antd-mobile */
          html[data-theme='dark'] .am-navbar {
            background-color: #1f1f1f;
          }
          html[data-theme='dark'] .am-navbar-title,
          html[data-theme='dark'] .am-navbar-left,
          html[data-theme='dark'] .am-navbar-right {
            color: rgba(255, 255, 255, 0.85);
          }
          html[data-theme='dark'] .am-tab-bar,
          html[data-theme='dark'] .am-tab-bar-item,
          html[data-theme='dark'] .am-tab-bar-content,
          html[data-theme='dark'] .am-tab-bar-tab {
            background-color: #1f1f1f;
            color: rgba(255, 255, 255, 0.85);
          }
          html[data-theme='dark'] .am-tab-bar-item .am-tab-bar-tab-icon,
          html[data-theme='dark'] .am-tab-bar-tab-title {
            color: rgba(255, 255, 255, 0.85);
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
            render={({ match }) => (
              <Redirect to={`/${match.params.url.replace(/\/\/+/, '/')}`} />
            )}
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
            <ImageTranslator />
          </Route>
          <Route path={routes.dashboard.$}>
            <Dashboard />
          </Route>
          {userIsAdmin && (
            <Route path={routes.admin}>
              <Admin />
            </Route>
          )}
          <Route path="/*">
            <NotFoundPage />
          </Route>
        </Switch>
      )}
    </>
  );
};

export default App;
