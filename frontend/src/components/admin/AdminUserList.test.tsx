import React from 'react';
import { render, unmountComponentAtNode } from 'react-dom';
import { act } from 'react-dom/test-utils';

jest.mock('react-intl', () => ({
  useIntl: () => ({ formatMessage: ({ id }: { id: string }) => id }),
}));
jest.mock('@/apis', () => ({
  api: {
    user: {
      adminGetUserList: jest.fn(),
      adminChangeAdminStatus: jest.fn(),
      adminEditUserPassword: jest.fn(),
      adminDeactivateUser: jest.fn(),
      adminCreateUser: jest.fn(),
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { api } = require('@/apis') as {
  api: { user: { adminGetUserList: jest.Mock } };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AdminUserList } = require('./AdminUserList') as {
  AdminUserList: React.FC;
};

const TOTAL = 59;
const PAGE_SIZE = 30;

const makeUsers = (page: number) =>
  Array.from({ length: PAGE_SIZE }, (_, index) => ({
    id: `u-${page}-${index}`,
    name: `user-${page}-${index}`,
    email: `user-${page}-${index}@example.com`,
    lastActiveTime: null,
    admin: false,
  }));

/** 等待 effect 里的请求与状态更新落定 */
const flush = async (ms = 0) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

describe('AdminUserList pagination', () => {
  let container: HTMLDivElement;

  beforeAll(() => {
    // antd 的响应式栅格会读取 matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    api.user.adminGetUserList.mockReset();
    api.user.adminGetUserList.mockImplementation(
      async ({ params }: { params: { page: number } }) => ({
        data: makeUsers(params.page),
        headers: { 'x-pagination-count': String(TOTAL) },
      }),
    );
  });

  afterEach(() => {
    act(() => {
      unmountComponentAtNode(container);
    });
    container.remove();
  });

  it('stays on the clicked page instead of bouncing between pages', async () => {
    await act(async () => {
      render(<AdminUserList />, container);
    });
    await flush();

    expect(api.user.adminGetUserList).toHaveBeenCalledTimes(1);
    expect(api.user.adminGetUserList.mock.calls[0][0].params.page).toBe(1);

    // 点击第 2 页
    const page2 = container.querySelector<HTMLLIElement>(
      '.ant-pagination-item-2',
    );
    expect(page2).not.toBeNull();
    await act(async () => {
      page2!.click();
    });
    await flush(50);

    expect(api.user.adminGetUserList).toHaveBeenLastCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ page: 2 }) }),
    );

    // 修复前：回包 setPagination 新对象 → effect 再次触发，请求会无限重跑
    const callsAfterClick = api.user.adminGetUserList.mock.calls.length;
    await flush(300);
    expect(api.user.adminGetUserList.mock.calls.length).toBe(callsAfterClick);
    expect(api.user.adminGetUserList.mock.calls.length).toBeLessThanOrEqual(3);

    // Table 仍停在第 2 页
    expect(
      container.querySelector('.ant-pagination-item-2')?.className,
    ).toContain('ant-pagination-item-active');
  });
});
