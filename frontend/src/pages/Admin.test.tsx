import React from 'react';
import { render, unmountComponentAtNode } from 'react-dom';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, useHistory } from 'react-router-dom';
import Admin from './Admin';

const mockLoadedPages: string[] = [];
jest.mock('@/hooks', () => ({ useTitle: jest.fn() }));
jest.mock('react-intl', () => ({
  useIntl: () => ({ formatMessage: ({ id }: { id: string }) => id }),
}));
jest.mock('@/components/shared/Spin', () => ({ Spin: () => 'loading' }));
jest.mock('@/components/admin/AdminWorkspaceLayout', () => ({
  AdminWorkspaceLayout: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock('@/components/admin/AdminPageShell', () => ({
  AdminPageShell: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/components/admin/AdminContentCard', () => ({
  AdminContentCard: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/components/admin/AdminUserList', () => {
  mockLoadedPages.push('users');
  return { AdminUserList: () => 'users page' };
});
jest.mock('@/components/admin/AdminLogList', () => {
  mockLoadedPages.push('logs');
  return { AdminLogList: () => 'logs page' };
});
jest.mock('@/components/admin/AdminDashboard', () => {
  mockLoadedPages.push('dashboard');
  return { AdminDashboard: () => 'dashboard page' };
});

it('loads only the selected admin page and preserves navigation between lazy routes', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let history: ReturnType<typeof useHistory>;
  const Harness = () => {
    history = useHistory();
    return (
      <Route path="/admin">
        <Admin />
      </Route>
    );
  };

  try {
    expect(mockLoadedPages).toEqual([]);
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/admin/users']}>
          <Harness />
        </MemoryRouter>,
        container,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent).toBe('users page');
    expect(mockLoadedPages).toEqual(['users']);

    await act(async () => {
      history.push('/admin/logs');
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent).toBe('logs page');
    expect(mockLoadedPages).toEqual(['users', 'logs']);

    await act(async () => {
      history.push('/admin');
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent).toBe('dashboard page');
    expect(mockLoadedPages).toEqual(['users', 'logs', 'dashboard']);
  } finally {
    act(() => {
      unmountComponentAtNode(container);
    });
    container.remove();
  }
});
