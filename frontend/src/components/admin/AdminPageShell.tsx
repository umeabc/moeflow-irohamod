import { css } from '@emotion/core';
import React from 'react';
import { FC } from '@/interfaces';
import style from '@/style';
import { ContentTitle } from '@/components';

interface AdminPageShellProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/** 管理员页面统一标题与内容布局 */
export const AdminPageShell: FC<AdminPageShellProps> = ({
  title,
  description,
  actions,
  children,
}) => (
  <div
    css={css`
      width: 100%;
      .AdminPageShell__Header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 20px;
      }
      .AdminPageShell__Title {
        margin-bottom: 0;
      }
      .AdminPageShell__Description {
        margin-top: 6px;
        color: ${style.textColorSecondary};
        font-size: 13px;
      }
      .AdminPageShell__Actions {
        flex: none;
      }
      @media (max-width: 600px) {
        .AdminPageShell__Header {
          align-items: flex-start;
          flex-direction: column;
          gap: 10px;
        }
      }
    `}
  >
    <div className="AdminPageShell__Header">
      <div>
        <ContentTitle className="AdminPageShell__Title">{title}</ContentTitle>
        {description && (
          <div className="AdminPageShell__Description">{description}</div>
        )}
      </div>
      {actions && <div className="AdminPageShell__Actions">{actions}</div>}
    </div>
    {children}
  </div>
);
