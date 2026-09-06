import { css } from '@emotion/core';
import React, { ReactNode, useState } from 'react';
import { useSelector } from 'react-redux';
import { AppState } from '@/store';
import { FC } from '@/interfaces';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';
import style from '@/style';

interface AdminWorkspaceLayoutProps { children: ReactNode; }

/** 管理员工作台布局：固定侧栏、顶部栏与可滚动内容区 */
export const AdminWorkspaceLayout: FC<AdminWorkspaceLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useSelector((state: AppState) => state.site.platform === 'mobile');
  return (
    <div className="AdminWorkspaceLayout" css={css`
      min-height: 100vh; height: 100vh; display: flex; overflow: hidden;
      color: ${style.textColor}; background: var(--moeflow-adminBackground);
      .AdminWorkspaceLayout__Sidebar { flex: 0 0 240px; width: 240px; height: 100%; z-index: 20; background: var(--moeflow-surface); border-right: 1px solid ${style.borderColorLight}; }
      .AdminWorkspaceLayout__Main { min-width: 0; min-height: 0; flex: 1 1 auto; display: flex; flex-direction: column; }
      .AdminWorkspaceLayout__Content { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 32px; }
      .AdminWorkspaceLayout__ContentInner { width: 100%; max-width: 1440px; margin: 0 auto; }
      .AdminWorkspaceLayout__Overlay { display: none; }
      @media (max-width: 1024px) { .AdminWorkspaceLayout__Content { padding: 24px; } }
      @media (max-width: 768px) {
        .AdminWorkspaceLayout__Sidebar { position: fixed; top: 0; left: 0; bottom: 0; width: 250px; transform: translateX(-100%); transition: transform 180ms ease; box-shadow: ${style.boxShadowBase}; }
        .AdminWorkspaceLayout__Sidebar--open { transform: translateX(0); }
        .AdminWorkspaceLayout__Overlay { display: block; position: fixed; z-index: 19; inset: 0; background: rgba(0, 0, 0, .35); }
        .AdminWorkspaceLayout__Content { padding: 16px; }
      }
    `}>
      <aside className={`AdminWorkspaceLayout__Sidebar${sidebarOpen ? ' AdminWorkspaceLayout__Sidebar--open' : ''}`}>
        <AdminSidebar onNavigate={() => setSidebarOpen(false)} />
      </aside>
      {sidebarOpen && <div className="AdminWorkspaceLayout__Overlay" onClick={() => setSidebarOpen(false)} role="presentation" />}
      <main className="AdminWorkspaceLayout__Main">
        <AdminTopbar isMobile={isMobile} onOpenMenu={() => setSidebarOpen(true)} />
        <section className="AdminWorkspaceLayout__Content"><div className="AdminWorkspaceLayout__ContentInner">{children}</div></section>
      </main>
    </div>
  );
};
