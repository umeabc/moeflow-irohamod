import { css } from '@emotion/core';
import { Button, Input, Tooltip } from 'antd';
import React, { KeyboardEvent, useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { Avatar, Icon } from '@/components';
import { FC } from '@/interfaces';
import { routes } from '@/pages/routes';
import style from '@/style';

interface AdminTopbarProps {
  isMobile?: boolean;
  onOpenMenu?: () => void;
}

/** 管理员工作台顶部栏：快捷跳转搜索与账户信息 */
export const AdminTopbar: FC<AdminTopbarProps> = ({
  isMobile = false,
  onOpenMenu,
}) => {
  const { formatMessage } = useIntl();
  const history = useHistory();
  const [word, setWord] = useState('');
  const items = useMemo(
    () => [
      { label: formatMessage({ id: 'admin.home' }), to: routes.admin },
      { label: formatMessage({ id: 'admin.users' }), to: `${routes.admin}/users` },
      {
        label: formatMessage({ id: 'admin.imageModeration' }),
        to: `${routes.admin}/image-moderation`,
      },
      {
        label: formatMessage({ id: 'admin.inviteCodes' }),
        to: `${routes.admin}/invite-codes`,
      },
      {
        label: formatMessage({ id: 'admin.teamManage' }),
        to: `${routes.admin}/team-manage`,
      },
      {
        label: formatMessage({ id: 'admin.siteSettings' }),
        to: `${routes.admin}/site-setting`,
      },
      {
        label: formatMessage({ id: 'admin.customMessages' }),
        to: `${routes.admin}/custom-messages`,
      },
    ],
    [formatMessage],
  );
  const matches = items.filter((item) =>
    item.label.toLocaleLowerCase().includes(word.trim().toLocaleLowerCase()),
  );

  const go = (to: string) => {
    history.push(to);
    setWord('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && matches.length > 0) {
      go(matches[0].to);
    }
  };

  return (
    <header
      className="AdminTopbar"
      css={css`
        flex: 0 0 64px;
        height: 64px;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 0 32px;
        background: var(--moeflow-surface);
        border-bottom: 1px solid ${style.borderColorLight};
        box-sizing: border-box;
        .AdminTopbar__Search {
          flex: 1 1 520px;
          max-width: 620px;
          position: relative;
        }
        .AdminTopbar__Search .ant-input-affix-wrapper {
          border: none;
          border-radius: 10px;
          background: var(--moeflow-surface2);
          box-shadow: none;
        }
        .AdminTopbar__Results {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          z-index: 30;
          padding: 6px;
          background: var(--moeflow-surface);
          border: 1px solid ${style.borderColorLight};
          border-radius: 10px;
          box-shadow: ${style.boxShadowBase};
        }
        .AdminTopbar__Result {
          display: block;
          width: 100%;
          padding: 9px 12px;
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: ${style.textColor};
          text-align: left;
          cursor: pointer;
          &:hover { background: ${style.hoverColor}; }
        }
        .AdminTopbar__Spacer { flex: 1 1 auto; }
        .AdminTopbar__Account {
          display: flex;
          align-items: center;
          gap: 10px;
          color: ${style.textColor};
          font-size: 13px;
          font-weight: 600;
        }
        @media (max-width: 1024px) {
          padding: 0 24px;
        }
        @media (max-width: 768px) {
          height: 58px;
          flex-basis: 58px;
          padding: 0 16px;
          gap: 8px;
          .AdminTopbar__Search { max-width: none; }
          .AdminTopbar__Account span { display: none; }
        }
      `}
    >
      {isMobile && (
        <Button
          type="text"
          aria-label={formatMessage({ id: 'admin.mobileMenu' })}
          icon={<Icon icon="bars" />}
          onClick={onOpenMenu}
        />
      )}
      <div className="AdminTopbar__Search">
        <Input
          prefix={<Icon icon="search" />}
          value={word}
          allowClear
          placeholder={formatMessage({ id: 'admin.searchPlaceholder' })}
          onChange={(event) => setWord(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {word.trim() && (
          <div className="AdminTopbar__Results">
            {matches.length === 0 ? (
              <div className="AdminTopbar__Result">
                {formatMessage({ id: 'admin.searchNoResults' })}
              </div>
            ) : (
              matches.map((item) => (
                <button
                  key={item.to}
                  type="button"
                  className="AdminTopbar__Result"
                  onClick={() => go(item.to)}
                >
                  {item.label}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <div className="AdminTopbar__Spacer" />
      <Tooltip title={formatMessage({ id: 'admin.noNotifications' })}>
        <Button
          type="text"
          aria-label={formatMessage({ id: 'admin.notifications' })}
          icon={<Icon icon="bell" />}
          disabled
        />
      </Tooltip>
      <div className="AdminTopbar__Account">
        <Avatar type="user" size="small" />
      </div>
    </header>
  );
};
