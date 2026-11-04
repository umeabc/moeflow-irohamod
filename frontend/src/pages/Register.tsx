import { RegistrationFields } from '@/components/shared-form/RegistrationFields';
import { useRegistration } from '@/hooks/useRegistration';
import { css } from '@emotion/core';
import { Button, Form as AntdForm } from 'antd';
import { useIntl } from 'react-intl';
import { AuthFormWrapper, FormItem, Header, Form } from '../components';
import { useTitle } from '../hooks';
import { FC } from '../interfaces';

/** 注册页的属性接口 */
interface RegisterProps {}
/**
 * 注册页（需邀请码）
 */
const Register: FC<RegisterProps> = () => {
  const { formatMessage } = useIntl(); // i18n
  useTitle({ prefix: formatMessage({ id: 'auth.register' }) }); // 设置标题
  const [form] = AntdForm.useForm();

  const handleFinish = useRegistration(form);

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
        title={formatMessage({ id: 'auth.register' })}
        navTip={formatMessage({ id: 'auth.toLogin' })}
        navLink="/login"
      >
        <Form name="register-form" form={form} onFinish={handleFinish}>
          <RegistrationFields />
          <FormItem>
            <Button type="primary" size="large" block htmlType="submit">
              {formatMessage({ id: 'auth.registerAndLogin' })}
            </Button>
          </FormItem>
        </Form>
      </AuthFormWrapper>
    </div>
  );
};
export default Register;
