import React, { lazy, Suspense } from 'react';
import { Redirect, Route, Switch, useRouteMatch } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { useTitle } from '@/hooks';
import { FC } from '@/interfaces';
import { AdminWorkspaceLayout } from '@/components/admin/AdminWorkspaceLayout';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { routes } from './routes';
import { Spin } from '@/components/shared/Spin';

const AdminDashboard = lazy(() =>
  import('@/components/admin/AdminDashboard').then((module) => ({
    default: module.AdminDashboard,
  })),
);
const AdminUserList = lazy(() =>
  import('@/components/admin/AdminUserList').then((module) => ({
    default: module.AdminUserList,
  })),
);
const AdminImageSafeCheck = lazy(() =>
  import('@/components/admin/AdminImageSafeCheck').then((module) => ({
    default: module.AdminImageSafeCheck,
  })),
);
const AdminSiteSetting = lazy(() =>
  import('@/components/admin/AdminSiteSetting').then((module) => ({
    default: module.AdminSiteSetting,
  })),
);
const AdminInviteCode = lazy(() =>
  import('@/components/admin/AdminInviteCode').then((module) => ({
    default: module.AdminInviteCode,
  })),
);
const AdminTeam = lazy(() =>
  import('@/components/admin/AdminTeam').then((module) => ({
    default: module.AdminTeam,
  })),
);
const AdminContributionStats = lazy(() =>
  import('@/components/admin/AdminContributionStats').then((module) => ({
    default: module.AdminContributionStats,
  })),
);
const AdminNoticeList = lazy(() =>
  import('@/components/admin/AdminNoticeList').then((module) => ({
    default: module.AdminNoticeList,
  })),
);
const AdminR2Storage = lazy(() =>
  import('@/components/admin/AdminR2Storage').then((module) => ({
    default: module.AdminR2Storage,
  })),
);
const AdminImgstoreStorage = lazy(() =>
  import('@/components/admin/AdminImgstoreStorage').then((module) => ({
    default: module.AdminImgstoreStorage,
  })),
);
const AdminLogList = lazy(() =>
  import('@/components/admin/AdminLogList').then((module) => ({
    default: module.AdminLogList,
  })),
);

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
      <Suspense fallback={<Spin size="large" />}>
        <Switch>
          <Route exact path={path}>
            <AdminDashboard />
          </Route>
          <Route path={`${path}/contribution-stats`}>
            {page(
              'admin.contributionStats',
              'admin.contributionDescription',
              <AdminContributionStats />,
            )}
          </Route>
          <Route path={`${path}/users`}>
            {page(
              'admin.users',
              'admin.pageDescription.users',
              <AdminUserList />,
            )}
          </Route>
          <Route path={`${path}/image-moderation`}>
            {page(
              'admin.imageModeration',
              'admin.pageDescription.imageModeration',
              <AdminImageSafeCheck />,
            )}
          </Route>
          <Route path={`${path}/site-setting`}>
            {page(
              'admin.siteSettings',
              'admin.pageDescription.siteSettings',
              <AdminSiteSetting />,
            )}
          </Route>
          <Route path={`${path}/notices`}>
            {page('admin.notices', 'admin.noticesDesc', <AdminNoticeList />)}
          </Route>
          <Route path={`${path}/invite-codes`}>
            {page(
              'admin.inviteCodes',
              'admin.pageDescription.inviteCodes',
              <AdminInviteCode />,
            )}
          </Route>
          <Route path={`${path}/team-manage`}>
            {page(
              'admin.teamManage',
              'admin.pageDescription.teamManage',
              <AdminTeam />,
            )}
          </Route>
          <Route path={`${path}/r2-storage`}>
            {page(
              'admin.r2Storage',
              'admin.pageDescription.r2Storage',
              <AdminR2Storage />,
            )}
          </Route>
          <Route path={`${path}/imgstore-storage`}>
            {page(
              'admin.imgstoreStorage',
              'admin.pageDescription.imgstoreStorage',
              <AdminImgstoreStorage />,
            )}
          </Route>
          <Route path={`${path}/logs`}>
            {page('admin.logs', 'admin.pageDescription.logs', <AdminLogList />)}
          </Route>
          <Redirect to={routes.admin} />
        </Switch>
      </Suspense>
    </AdminWorkspaceLayout>
  );
};

export default Admin;
