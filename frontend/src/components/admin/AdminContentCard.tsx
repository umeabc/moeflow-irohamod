import { css } from '@emotion/core';
import classNames from 'classnames';
import React from 'react';
import { FC } from '@/interfaces';
import style from '@/style';

interface AdminContentCardProps {
  title?: React.ReactNode;
  className?: string;
}

/** 管理员内容卡片：统一白/深色表面、边框与圆角 */
export const AdminContentCard: FC<AdminContentCardProps> = ({
  title,
  className,
  children,
}) => (
  <div className={classNames('AdminContentCard', className)} css={css`
    width: 100%;
    .AdminContentCard__Panel {
      background: var(--moeflow-surface);
      border: 1px solid ${style.borderColorLight};
      border-radius: 12px;
      box-shadow: none;
      box-sizing: border-box;
      overflow: hidden;
      padding: 24px;
    }
    .AdminContentCard__Title {
      margin-bottom: 14px;
      color: ${style.textColor};
      font-size: 16px;
      font-weight: 600;
    }
  `}>
    {title && <div className="AdminContentCard__Title">{title}</div>}
    <div className="AdminContentCard__Panel">{children}</div>
  </div>
);
