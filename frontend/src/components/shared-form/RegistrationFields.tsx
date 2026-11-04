import { Input } from 'antd';
import { useIntl } from 'react-intl';
import { USER_NAME_REGEX } from '@/utils/regex';
import { FormItem } from './FormItem';

export const RegistrationFields = () => {
  const { formatMessage } = useIntl();

  return (
    <>
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
        <Input prefix={formatMessage({ id: 'site.email' })} size="large" />
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
        <Input prefix={formatMessage({ id: 'site.userName' })} size="large" />
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
    </>
  );
};
