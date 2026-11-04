import { Modal } from 'antd';
import type { FormInstance } from 'antd/lib/form';
import { useIntl } from 'react-intl';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { api, FailureResults, resultTypes } from '@/apis';
import type { RegisterData } from '@/apis/auth';
import { setUserToken } from '@/store/user/slice';

export const useRegistration = (form: FormInstance) => {
  const { formatMessage } = useIntl();
  const dispatch = useDispatch();
  const history = useHistory();

  return (values: RegisterData) =>
    api.auth
      .register({ data: values })
      .then((result) => {
        form.resetFields();
        const completeLogin = (rememberMe?: boolean) => {
          dispatch(setUserToken({ token: result.data.token, rememberMe }));
          history.push('/dashboard/projects');
        };
        Modal.confirm({
          title: formatMessage({ id: 'auth.registerSuccessTitle' }),
          content: formatMessage({ id: 'auth.autoLoginTip' }),
          okText: formatMessage({ id: 'auth.rememberMe' }),
          okType: 'primary',
          cancelText: formatMessage({ id: 'form.cancel' }),
          onOk: () => completeLogin(true),
          onCancel: () => completeLogin(),
        });
      })
      .catch((result: FailureResults) => {
        if (result.type === resultTypes.VALIDATION_FAILURE) {
          result.default(form);
          return;
        }
        result.default();
      });
};
