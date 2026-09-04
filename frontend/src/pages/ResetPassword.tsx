import { css } from '@emotion/core';
import { Typography } from 'antd';
import React from 'react';
import { useIntl } from 'react-intl';
import { AuthFormWrapper, Header } from '@/components';
import { useTitle } from '@/hooks';
import { FC } from '@/interfaces';

/** 重置密码页的属性接口 */
interface ResetPasswordProps {}
/**
 * 重置密码页（统一联系站点管理员，不再自助）
 */
const ResetPassword: FC<ResetPasswordProps> = () => {
  const { formatMessage } = useIntl(); // i18n
  useTitle({ prefix: formatMessage({ id: 'auth.resetPassword' }) }); // 设置标题

  return (
    <div
      css={css`
        min-height: 100%;
        display: flex;
        flex-direction: column;
      `}
    >
      <Header></Header>
      <AuthFormWrapper
        title={formatMessage({ id: 'auth.resetPassword' })}
        navTip={formatMessage({ id: 'auth.back' })}
        navLink="back"
      >
        <Typography.Paragraph style={{ textAlign: 'center' }}>
          {formatMessage({ id: 'reset.contactAdmin' })}
        </Typography.Paragraph>
      </AuthFormWrapper>
    </div>
  );
};
export default ResetPassword;
