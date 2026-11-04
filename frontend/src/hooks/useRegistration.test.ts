import React from 'react';
import { render, unmountComponentAtNode } from 'react-dom';
import { act } from 'react-dom/test-utils';
import { Modal } from 'antd';
import type { FormInstance } from 'antd/lib/form';
import { api, resultTypes } from '@/apis';
import { setUserToken } from '@/store/user/slice';
import { useRegistration } from './useRegistration';

const mockDispatch = jest.fn();
const mockPush = jest.fn();
jest.mock('react-redux', () => ({ useDispatch: () => mockDispatch }));
jest.mock('react-router-dom', () => ({
  useHistory: () => ({ push: mockPush }),
}));
jest.mock('react-intl', () => ({
  useIntl: () => ({ formatMessage: ({ id }: { id: string }) => id }),
}));
jest.mock('antd', () => ({ Modal: { confirm: jest.fn() } }));
jest.mock('@/apis', () => ({
  api: { auth: { register: jest.fn() } },
  resultTypes: {
    VALIDATION_FAILURE: 'VALIDATION_FAILURE',
    BASIC_FAILURE: 'BASIC_FAILURE',
  },
}));

const values = {
  email: 'new@example.com',
  inviteCode: 'invite-code',
  name: 'New member',
  password: 'password123',
};

describe('shared registration flow', () => {
  let container: HTMLDivElement;
  let submit: ReturnType<typeof useRegistration>;
  let form: FormInstance;
  const register = jest.mocked(api.auth.register);
  const confirm = jest.mocked(Modal.confirm);

  beforeEach(() => {
    jest.clearAllMocks();
    form = { resetFields: jest.fn() } as unknown as FormInstance;
    container = document.createElement('div');
    document.body.appendChild(container);
    const Harness = () => {
      submit = useRegistration(form);
      return null;
    };
    act(() => {
      render(React.createElement(Harness), container);
    });
  });

  afterEach(() => {
    act(() => {
      unmountComponentAtNode(container);
    });
    container.remove();
  });

  it.each([
    ['onOk', true],
    ['onCancel', undefined],
  ] as const)(
    'logs in after %s with the selected persistence',
    async (choice, rememberMe) => {
      register.mockResolvedValue({
        type: 'SUCCESS',
        data: { token: 'new-user-token' },
        headers: {},
      });

      await submit(values);

      expect(register).toHaveBeenCalledWith({ data: values });
      expect(form.resetFields).toHaveBeenCalledTimes(1);
      expect(mockDispatch).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      const dialog = confirm.mock.calls[0][0];
      expect(dialog.title).toBe('auth.registerSuccessTitle');
      dialog[choice]?.();
      expect(mockDispatch).toHaveBeenCalledWith(
        setUserToken({ token: 'new-user-token', rememberMe }),
      );
      expect(mockPush).toHaveBeenCalledWith('/dashboard/projects');
    },
  );

  it('keeps the form and presents field validation errors without logging in', async () => {
    const showErrors = jest.fn();
    register.mockRejectedValue({
      type: resultTypes.VALIDATION_FAILURE,
      default: showErrors,
    });

    await submit(values);

    expect(showErrors).toHaveBeenCalledWith(form);
    expect(form.resetFields).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('uses the API error handler for non-validation failures', async () => {
    const showError = jest.fn();
    register.mockRejectedValue({
      type: resultTypes.BASIC_FAILURE,
      default: showError,
    });

    await submit(values);

    expect(showError).toHaveBeenCalledWith();
    expect(form.resetFields).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
