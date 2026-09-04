import { css } from '@emotion/core';
import { Button, Form as AntdForm, Input, Modal } from 'antd';
import React from 'react';
import { useIntl } from 'react-intl';
import { useDispatch } from 'react-redux';
import { api, FailureResults, resultTypes } from '../apis';
import { AuthFormWrapper, FormItem, Header, Form } from '../components';
import { setUserToken } from '../store/user/slice';
import { useTitle } from '../hooks';
import { FC } from '../interfaces';
import { USER_NAME_REGEX } from '../utils/regex';
import { useHistory } from 'react-router-dom';

/** 注册页的属性接口 */
interface RegisterProps {}
/**
 * 注册页（需邀请码）
 */
const Register: FC<RegisterProps> = () => {
  const { formatMessage } = useIntl(); // i18n
  useTitle({ prefix: formatMessage({ id: 'auth.register' }) }); // 设置标题
  const dispatch = useDispatch();
  const [form] = AntdForm.useForm();
  const history = useHistory();

  /** 提交表单 */
  const handleFinish = (values: any) => {
    api.auth
      .register({ data: values })
      .then((result) => {
        // 重置表单
        form.resetFields();
        // 询问用户是否记住我
        Modal.confirm({
          title: formatMessage({ id: 'auth.registerSuccessTitle' }),
          content: formatMessage({ id: 'auth.autoLoginTip' }),
          okText: formatMessage({ id: 'auth.rememberMe' }),
          okType: 'primary',
          cancelText: formatMessage({ id: 'form.cancel' }),
          onOk: () => {
            dispatch(
              setUserToken({ token: result.data.token, rememberMe: true }),
            );
            // 跳转到仪表盘
            history.push('/dashboard/projects');
          },
          onCancel: () => {
            dispatch(setUserToken({ token: result.data.token }));
            // 跳转到仪表盘
            history.push('/dashboard/projects');
          },
        });
      })
      .catch((result: FailureResults) => {
        if (result.type === resultTypes.VALIDATION_FAILURE) {
          // 字段验证错误
          result.default(form);
          return;
        }
        result.default();
      });
  };

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
          <FormItem
            name="email"
            rules={[
              { required: true },
              {
                type: 'email',
                message: formatMessage({ id: 'auth.emailFormatTip' }),
              },
            ]}
          >
            <Input
              prefix={formatMessage({ id: 'site.email' })}
              size="large"
            />
          </FormItem>
          <FormItem name="inviteCode" rules={[{ required: true }]}>
            <Input
              prefix={formatMessage({ id: 'register.inviteCode' })}
              size="large"
            />
          </FormItem>
          <FormItem
            name="name"
            rules={[
              { required: true },
              {
                pattern: USER_NAME_REGEX,
                message: formatMessage({ id: 'auth.userNameFormatTip' }),
              },
              { min: 2 },
              { max: 18 },
            ]}
          >
            <Input
              prefix={formatMessage({ id: 'site.userName' })}
              size="large"
            />
          </FormItem>
          <FormItem
            name="password"
            rules={[{ required: true }, { min: 6 }, { max: 60 }]}
          >
            <Input.Password
              prefix={formatMessage({ id: 'site.password' })}
              size="large"
            />
          </FormItem>
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
