import { css } from '@emotion/core';
import { Badge } from 'antd';
import React from 'react';
import { useIntl } from 'react-intl';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory, useLocation, useRouteMatch } from 'react-router-dom';
import { Avatar, Icon, TabBarM } from '../components';
import { useTitle } from '../hooks';
import { FC } from '../interfaces';
import { AppState } from '../store';
import { setUserToken } from '../store/user/slice';
import style from '../style';
import { routes } from './routes';

/** 列表行的属性接口 */
interface MeMListRowProps {
  /** 左侧图标 */
  icon: React.ReactNode;
  /** 文字 */
  label: string;
  /** 右侧 Badge 数量（<= 0 时不显示） */
  badgeCount?: number;
  /** 点击回调 */
  onClick: () => void;
}
/**
 * 手机版 Me 页的列表行
 */
const MeMListRow: FC<MeMListRowProps> = ({
  icon,
  label,
  badgeCount,
  onClick,
}) => {
  return (
    <button type="button" className="MeM__Row" onClick={onClick}>
      <span className="MeM__RowIcon">{icon}</span>
      <span className="MeM__RowLabel">{label}</span>
      {badgeCount !== undefined && badgeCount > 0 && (
        <Badge className="MeM__RowBadge" count={badgeCount} size="small" />
      )}
      <Icon className="MeM__RowArrow" icon="angle-right" />
    </button>
  );
};

/** 用户手机版 Me 的属性接口 */
interface MeMProps {}
/**
 * 用户手机版 Me
 */
const MeM: FC<MeMProps> = () => {
  const history = useHistory(); // 路由
  const location = useLocation();
  const { url } = useRouteMatch();
  const { formatMessage } = useIntl(); // i18n
  useTitle(); // 设置标题
  const platform = useSelector((state: AppState) => state.site.platform);
  const isMobile = platform === 'mobile';
  const newInvitationsCount = useSelector(
    (state: AppState) => state.site.newInvitationsCount,
  );
  const relatedApplicationsCount = useSelector(
    (state: AppState) => state.site.relatedApplicationsCount,
  );
  const currentUser = useSelector((state: AppState) => state.user);
  const dispatch = useDispatch();

  /** 是否是管理员 */
  const isAdmin = currentUser.admin === true;
  /** 用户名 */
  const userName =
    currentUser.name || formatMessage({ id: 'me.profile.name.fallback' });
  /** 是否有签名 */
  const hasSignature = currentUser.signature.trim() !== '';

  /** 登出 */
  const logout = () => {
    dispatch(setUserToken({ token: '' }));
    history.push(routes.login);
  };

  /** 跳转到用户设置 */
  const goUserSetting = () => {
    history.push(routes.dashboard.user.setting);
  };

  return (
    <div
      css={css`
        height: 100%;
        max-width: ${style.contentMaxWidth}px;
        margin: 0 auto;
        overflow-y: auto;
        box-sizing: border-box;
        background-color: ${style.backgroundColorLight};
        -webkit-overflow-scrolling: touch;
        .MeM__Content {
          box-sizing: border-box;
          /* 手机版底部有 TabBar（含安全区），桌面版（无 TabBar）不需要额外预留 */
          padding: 16px 16px
            ${isMobile ? 'calc(16px + env(safe-area-inset-bottom))' : '16px'};
        }
        .MeM__Card {
          display: flex;
          align-items: center;
          width: 100%;
          box-sizing: border-box;
          margin: 0;
          padding: 18px 16px;
          border: 1px solid ${style.borderColorLight};
          border-radius: 14px;
          background-color: var(--moeflow-surface);
          color: ${style.textColor};
          font-family: inherit;
          text-align: left;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: background-color 150ms;
        }
        .MeM__Card:active {
          background-color: ${style.hoverColor};
        }
        .MeM__Card:focus-visible {
          outline: 2px solid ${style.primaryColor};
          outline-offset: 2px;
        }
        .MeM__CardAvatar {
          flex: none;
          margin-right: 14px;
        }
        .MeM__CardMain {
          flex: auto;
          min-width: 0;
        }
        .MeM__CardTop {
          display: flex;
          align-items: center;
          min-width: 0;
        }
        .MeM__CardName {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 18px;
          font-weight: 600;
          line-height: 24px;
          ${isAdmin ? 'max-width: calc(100% - 90px);' : ''}
        }
        .MeM__CardBadge {
          flex: none;
          height: 20px;
          margin-left: 8px;
          padding: 0 8px;
          border-radius: 10px;
          background-color: var(--moeflow-adminNavActiveBg);
          color: var(--moeflow-adminNavActive);
          font-size: 11px;
          font-weight: 600;
          line-height: 20px;
          white-space: nowrap;
        }
        .MeM__CardSignature {
          display: block;
          margin-top: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
          font-weight: 400;
          color: ${style.textColorSecondary};
        }
        .MeM__CardSignatureEmpty {
          color: ${style.textColorSecondaryLightest};
          font-style: italic;
        }
        .MeM__SectionTitle {
          margin: 18px 2px 8px;
          font-size: 12px;
          color: ${style.textColorSecondary};
        }
        .MeM__Group {
          overflow: hidden;
          border: 1px solid ${style.borderColorLight};
          border-radius: 14px;
          background-color: var(--moeflow-surface);
        }
        .MeM__Row {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
          min-height: 48px;
          box-sizing: border-box;
          margin: 0;
          padding: 8px 14px;
          border: none;
          background-color: transparent;
          color: ${style.textColor};
          font-family: inherit;
          font-size: 15px;
          font-weight: 500;
          text-align: left;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: background-color 150ms;
        }
        /* 分割线：左缩进对齐文字 */
        .MeM__Row + .MeM__Row::before {
          content: '';
          position: absolute;
          top: 0;
          left: 52px;
          right: 0;
          height: 1px;
          background-color: ${style.borderColorLight};
        }
        .MeM__Row:active {
          background-color: ${style.hoverColor};
        }
        .MeM__Row:focus-visible {
          outline: 2px solid ${style.primaryColor};
          outline-offset: -2px;
        }
        .MeM__RowIcon {
          flex: none;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          margin-right: 10px;
          border-radius: 8px;
          background-color: var(--moeflow-surface2);
          color: ${style.primaryColor};
          /* FontAwesome 图标按 em 缩放（与显式的宽高互为兜底） */
          font-size: 14px;
        }
        .MeM__RowIcon svg {
          width: 14px;
          height: 14px;
        }
        .MeM__RowLabel {
          flex: auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .MeM__RowBadge {
          flex: none;
          margin-left: 8px;
        }
        .MeM__RowArrow {
          flex: none;
          width: 14px;
          height: 14px;
          margin-left: 8px;
          color: ${style.textColorSecondaryLightest};
        }
        .MeM__Logout {
          display: block;
          width: 100%;
          height: 48px;
          box-sizing: border-box;
          margin: 18px 0 0;
          padding: 0;
          border: 1px solid ${style.borderColorLight};
          border-radius: 12px;
          background-color: var(--moeflow-surface);
          color: ${style.errorColor};
          font-family: inherit;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: background-color 150ms;
        }
        .MeM__Logout:active {
          background-color: rgba(245, 34, 45, 0.08);
        }
        .MeM__Logout:focus-visible {
          outline: 2px solid ${style.errorColor};
          outline-offset: 2px;
        }
      `}
    >
      <div className="MeM__Content">
        {/* 信息卡 */}
        <button
          type="button"
          className="MeM__Card"
          aria-label={formatMessage({ id: 'auth.accountSetting' })}
          onClick={goUserSetting}
        >
          <Avatar
            className="MeM__CardAvatar"
            type="user"
            size={68}
            url={currentUser.avatar}
          />
          <span className="MeM__CardMain">
            <span className="MeM__CardTop">
              <span className="MeM__CardName">{userName}</span>
              {isAdmin && (
                <span className="MeM__CardBadge">
                  {formatMessage({ id: 'me.profile.role.admin' })}
                </span>
              )}
            </span>
            <span
              className={
                'MeM__CardSignature' +
                (hasSignature ? '' : ' MeM__CardSignatureEmpty')
              }
            >
              {hasSignature
                ? currentUser.signature
                : formatMessage({ id: 'me.profile.signature.empty' })}
            </span>
          </span>
        </button>

        {/* 账号 */}
        <div className="MeM__SectionTitle">
          {formatMessage({ id: 'me.profile.section.account' })}
        </div>
        <div className="MeM__Group">
          <MeMListRow
            icon={<Icon icon="cog" />}
            label={formatMessage({ id: 'auth.accountSetting' })}
            onClick={goUserSetting}
          />
        </div>

        {/* 协作 */}
        <div className="MeM__SectionTitle">
          {formatMessage({ id: 'me.profile.section.collaboration' })}
        </div>
        <div className="MeM__Group">
          <MeMListRow
            icon={<Icon icon="link" />}
            label={formatMessage({ id: 'me.invitation.new' })}
            badgeCount={newInvitationsCount}
            onClick={() => {
              history.push(routes.dashboard.user.invitations);
            }}
          />
          <MeMListRow
            icon={<Icon icon="user-check" />}
            label={formatMessage({ id: 'me.applicatio.related' })}
            badgeCount={relatedApplicationsCount}
            onClick={() => {
              history.push(routes.dashboard.user.relatedApplications);
            }}
          />
        </div>

        {/* 管理区（仅管理员） */}
        {isAdmin && (
          <>
            <div className="MeM__SectionTitle">
              {formatMessage({ id: 'admin.management' })}
            </div>
            <div className="MeM__Group">
              <MeMListRow
                icon={<Icon icon="th-large" />}
                label={formatMessage({ id: 'admin.title' })}
                onClick={() => {
                  history.push(routes.admin);
                }}
              />
              <MeMListRow
                icon={<Icon icon="tag" />}
                label={formatMessage({ id: 'admin.inviteCodes' })}
                onClick={() => {
                  history.push(`${routes.admin}/invite-codes`);
                }}
              />
              <MeMListRow
                icon={<Icon icon="bell" />}
                label={formatMessage({ id: 'admin.notices' })}
                onClick={() => {
                  history.push(`${routes.admin}/notices`);
                }}
              />
              <MeMListRow
                icon={<Icon icon="user-circle" />}
                label={formatMessage({ id: 'admin.users' })}
                onClick={() => {
                  history.push(`${routes.admin}/users`);
                }}
              />
              <MeMListRow
                icon={<Icon icon="clipboard-list" />}
                label={formatMessage({ id: 'admin.logs' })}
                onClick={() => {
                  history.push(`${routes.admin}/logs`);
                }}
              />
            </div>
          </>
        )}

        {/* 其他 */}
        <div className="MeM__SectionTitle">
          {formatMessage({ id: 'me.profile.section.other' })}
        </div>
        <div className="MeM__Group">
          <MeMListRow
            icon={<Icon icon="home" />}
            label={formatMessage({ id: 'site.index' })}
            onClick={() => {
              history.push(routes.index);
            }}
          />
        </div>

        {/* 退出 */}
        <button type="button" className="MeM__Logout" onClick={logout}>
          {formatMessage({ id: 'auth.logout' })}
        </button>
      </div>
      {location.pathname === url && isMobile && (
        // 手机版显示 TabBar
        <TabBarM />
      )}
    </div>
  );
};
export default MeM;
