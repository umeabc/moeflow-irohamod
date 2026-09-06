import { css } from '@emotion/core';
import { Avatar, Button, Popconfirm, Spin, Table } from 'antd';
import React, { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { api } from '@/apis';
import { toLowerCamelCase } from '@/utils';
import { FC } from '@/interfaces';
import style from '@/style';

interface TeamRow {
  id: string;
  name: string;
  avatar: string | null;
  hasAvatar: boolean;
  projectSetCount?: number;
  projectCount?: number;
  imageCount?: number;
}

/** 管理员：全站团队管理 */
export const AdminTeam: FC = () => {
  const { formatMessage } = useIntl();
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.adminTeam.listTeams({});
      setRows(((res.data as any[]) || []).map((t) => toLowerCamelCase<TeamRow>(t as any) as TeamRow));
    } catch (e) {
      // 错误提示由 api 默认行为处理
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (row: TeamRow) => {
    try {
      await api.adminTeam.deleteTeam({ teamID: row.id });
      load();
    } catch (e) {
      // 错误提示由 api 默认行为处理
    }
  };

  const columns = [
    { title: formatMessage({ id: 'admin.teamName' }), dataIndex: 'name', key: 'name', render: (name: string, row: TeamRow) => <span className="AdminTeam__Name"><Avatar src={row.hasAvatar ? row.avatar || undefined : undefined} size="small">{name?.[0]}</Avatar>{name}</span> },
    { title: formatMessage({ id: 'admin.teamID' }), dataIndex: 'id', key: 'id', render: (id?: string) => id || '-' },
    { title: formatMessage({ id: 'admin.teamProjectSets' }), dataIndex: 'projectSetCount', key: 'projectSetCount', width: 110 },
    { title: formatMessage({ id: 'admin.teamProjects' }), dataIndex: 'projectCount', key: 'projectCount', width: 100 },
    { title: formatMessage({ id: 'admin.teamImages' }), dataIndex: 'imageCount', key: 'imageCount', width: 100 },
    { title: formatMessage({ id: 'admin.actions' }), key: 'actions', width: 110, render: (_: unknown, row: TeamRow) => <Popconfirm title={formatMessage({ id: 'admin.teamDeleteConfirm' })} onConfirm={() => handleDelete(row)}><Button size="small" danger>{formatMessage({ id: 'admin.teamDelete' })}</Button></Popconfirm> },
  ];

  return (
    <div className="AdminTeam" css={css`
      width: 100%;
      .AdminTeam__Toolbar { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid ${style.borderColorLight}; }
      .AdminTeam__Summary { color: ${style.textColorSecondary}; font-size: 13px; }
      .AdminTeam__Table { overflow-x: auto; padding-top: 16px; }
      .AdminTeam__Table .ant-table-wrapper { min-width: 720px; }
      .AdminTeam__Name { display: inline-flex; align-items: center; gap: 8px; }
    `}>
      <div className="AdminTeam__Toolbar"><span className="AdminTeam__Summary">{rows.length} {formatMessage({ id: 'admin.teamsSummary' })}</span></div>
      {loading ? <Spin /> : <div className="AdminTeam__Table"><Table rowKey="id" columns={columns} dataSource={rows} pagination={false} /></div>}
    </div>
  );
};
