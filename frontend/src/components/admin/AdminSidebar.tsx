import { css } from '@emotion/core';
import classNames from 'classnames';
import React from 'react';
import { useSelector } from 'react-redux';
import { Link, useLocation } from 'react-router-dom';
import { AppState } from '@/store';
import { useIntl } from 'react-intl';
import { Avatar, Icon } from '@/components';
import { FC } from '@/interfaces';
import { routes } from '@/pages/routes';
import style from '@/style';

interface AdminSidebarProps {
  onNavigate?: () => void;
}

interface AdminNavItemProps {
  to: string;
  icon: string;
  label: string;
  exact?: boolean;
  onNavigate?: () => void;
}

const AdminNavItem: FC<AdminNavItemProps> = ({
  to,
  icon,
  label,
  exact = false,
  onNavigate,
}) => {
  const location = useLocation();
  const active = exact
    ? location.pathname === to
    : location.pathname === to || location.pathname.startsWith(`${to}/`);
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={classNames('AdminSidebar__Item', {
        'AdminSidebar__Item--active': active,
      })}
    >
      <Icon icon={icon as any} />
      <span>{label}</span>
    </Link>
  );
};

/** 管理员工作台左侧导航 */
export const AdminSidebar: FC<AdminSidebarProps> = ({ onNavigate }) => {
  const { formatMessage } = useIntl();
  const user = useSelector((state: AppState) => state.user);
  return (
    <div
      className="AdminSidebar"
      css={css`
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 0 14px 18px;
        box-sizing: border-box;
        .AdminSidebar__Brand {
          min-height: 82px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 0 14px;
          border-bottom: 1px solid ${style.borderColorLight};
        }
        .AdminSidebar__BrandName {
          color: ${style.textColor};
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 24px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }
        .AdminSidebar__BrandSub {
          margin-top: 4px;
          color: ${style.textColorSecondary};
          font-size: 12px;
        }
        .AdminSidebar__Section {
          margin-top: 24px;
        }
        .AdminSidebar__SectionTitle {
          padding: 0 14px 8px;
          color: ${style.textColorSecondary};
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .AdminSidebar__Item {
          display: flex;
          align-items: center;
          min-height: 42px;
          margin: 3px 0;
          padding: 0 14px;
          border-radius: 9px;
          color: ${style.textColorSecondary};
          font-size: 14px;
          text-decoration: none;
          transition: background 120ms ease, color 120ms ease;
          svg {
            width: 16px;
            margin-right: 12px;
          }
          &:hover {
            color: ${style.textColor};
            background: ${style.hoverColor};
          }
        }
        .AdminSidebar__Item--active {
          color: var(--moeflow-adminNavActive);
          background: var(--moeflow-adminNavActiveBg);
          font-weight: 600;
        }
        .AdminSidebar__Bottom {
          margin-top: auto;
          padding-top: 14px;
          border-top: 1px solid ${style.borderColorLight};
        }
        .AdminSidebar__User {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 12px;
          padding: 8px 10px;
          color: ${style.textColorSecondary};
          font-size: 13px;
        }
        .AdminSidebar__UserName {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}
    >
      <div className="AdminSidebar__Brand">
        <div className="AdminSidebar__BrandName">MoeFlow</div>
        <div className="AdminSidebar__BrandSub">
          {formatMessage({ id: 'admin.title' })}
        </div>
      </div>
      <nav aria-label={formatMessage({ id: 'admin.navigation' })}>
        <div className="AdminSidebar__Section">
          <div className="AdminSidebar__SectionTitle">
            {formatMessage({ id: 'admin.overview' })}
          </div>
          <AdminNavItem
            to={routes.admin}
            icon="th-large"
            label={formatMessage({ id: 'admin.home' })}
            exact
            onNavigate={onNavigate}
          />
        </div>
        <div className="AdminSidebar__Section">
          <div className="AdminSidebar__SectionTitle">
            {formatMessage({ id: 'admin.management' })}
          </div>
          <AdminNavItem
            to={`${routes.admin}/users`}
            icon="user-check"
            label={formatMessage({ id: 'admin.users' })}
            onNavigate={onNavigate}
          />
          <AdminNavItem
            to={`${routes.admin}/image-moderation`}
            icon="image"
            label={formatMessage({ id: 'admin.imageModeration' })}
            onNavigate={onNavigate}
          />
          <AdminNavItem
            to={`${routes.admin}/invite-codes`}
            icon="link"
            label={formatMessage({ id: 'admin.inviteCodes' })}
            onNavigate={onNavigate}
          />
          <AdminNavItem
            to={`${routes.admin}/team-manage`}
            icon="layer-group"
            label={formatMessage({ id: 'admin.teamManage' })}
            onNavigate={onNavigate}
          />
        </div>
        <div className="AdminSidebar__Section">
          <div className="AdminSidebar__SectionTitle">
            {formatMessage({ id: 'admin.preferences' })}
          </div>
          <AdminNavItem
            to={`${routes.admin}/site-setting`}
            icon="cog"
            label={formatMessage({ id: 'admin.siteSettings' })}
            onNavigate={onNavigate}
          />
          <AdminNavItem
            to={`${routes.admin}/notices`}
            icon="bell"
            label={formatMessage({ id: 'admin.notices' })}
            onNavigate={onNavigate}
          />
        </div>
      </nav>
      <div className="AdminSidebar__Bottom">
        <AdminNavItem
          to={routes.dashboard.$}
          icon="angle-left"
          label={formatMessage({ id: 'admin.backToDashboard' })}
          onNavigate={onNavigate}
        />
        <div className="AdminSidebar__User">
          <Avatar type="user" url={user.hasAvatar ? user.avatar : undefined} size="small" />
          <span className="AdminSidebar__UserName">{user.name}</span>
        </div>
      </div>
    </div>
  );
};
