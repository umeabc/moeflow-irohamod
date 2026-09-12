import React from 'react';
import { Redirect, Route, Switch, useRouteMatch } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { useTitle } from '@/hooks';
import { FC } from '@/interfaces';
import { AdminWorkspaceLayout } from '@/components/admin/AdminWorkspaceLayout';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { AdminUserList } from '@/components/admin/AdminUserList';
import { AdminImageSafeCheck } from '@/components/admin/AdminImageSafeCheck';
import { AdminSiteSetting } from '@/components/admin/AdminSiteSetting';
import { AdminInviteCode } from '@/components/admin/AdminInviteCode';
import { AdminTeam } from '@/components/admin/AdminTeam';
import { AdminNoticeList } from '@/components/admin/AdminNoticeList';
import { AdminR2Storage } from '@/components/admin/AdminR2Storage';
import { AdminImgstoreStorage } from '@/components/admin/AdminImgstoreStorage';
import { routes } from './routes';

/** 管理员页面 */
const Admin: FC = () => {
  const { formatMessage } = useIntl();
  const { path } = useRouteMatch();
  useTitle({ prefix: formatMessage({ id: 'admin.title' }) });

  const page = (
    titleId: string,
    descriptionId: string,
    content: React.ReactNode,
  ) => (
    <AdminPageShell
      title={formatMessage({ id: titleId })}
      description={formatMessage({ id: descriptionId })}
    >
      <AdminContentCard>{content}</AdminContentCard>
    </AdminPageShell>
  );

  return (
    <AdminWorkspaceLayout>
      <Switch>
        <Route exact path={path}>
          <AdminDashboard />
        </Route>
        <Route path={`${path}/users`}>
          {page('admin.users', 'admin.pageDescription.users', <AdminUserList />)}
        </Route>
        <Route path={`${path}/image-moderation`}>
          {page('admin.imageModeration', 'admin.pageDescription.imageModeration', <AdminImageSafeCheck />)}
        </Route>
        <Route path={`${path}/site-setting`}>
          {page('admin.siteSettings', 'admin.pageDescription.siteSettings', <AdminSiteSetting />)}
        </Route>
        <Route path={`${path}/notices`}>
          {page('admin.notices', 'admin.noticesDesc', <AdminNoticeList />)}
        </Route>
        <Route path={`${path}/invite-codes`}>
          {page('admin.inviteCodes', 'admin.pageDescription.inviteCodes', <AdminInviteCode />)}
        </Route>
        <Route path={`${path}/team-manage`}>
          {page('admin.teamManage', 'admin.pageDescription.teamManage', <AdminTeam />)}
        </Route>
        <Route path={`${path}/r2-storage`}>
          {page('admin.r2Storage', 'admin.pageDescription.r2Storage', <AdminR2Storage />)}
        </Route>
        <Route path={`${path}/imgstore-storage`}>
          {page('admin.imgstoreStorage', 'admin.pageDescription.imgstoreStorage', <AdminImgstoreStorage />)}
        </Route>
        <Redirect to={routes.admin} />
      </Switch>
    </AdminWorkspaceLayout>
  );
};

export default Admin;
