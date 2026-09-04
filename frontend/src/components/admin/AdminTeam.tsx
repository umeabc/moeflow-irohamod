import { css } from '@emotion/core';
import { Avatar, Button, Popconfirm, Spin, Table } from 'antd';
import React, { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { api } from '@/apis';
import { toLowerCamelCase } from '@/utils';
import { FC } from '@/interfaces';

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
      setRows(
        ((res.data as any[]) || []).map(
          (t) => toLowerCamelCase<TeamRow>(t as any) as TeamRow,
        ),
      );
    } catch (e) {
      // 错误提示由 api 默认行为处理
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (row: TeamRow) => {
    try {
      await api.adminTeam.deleteTeam({ teamID: row.id });
      load();
    } catch (e) {
      // 错误提示由 api 默认行为处理
    }
  };

  const columns = [
    {
      title: formatMessage({ id: 'admin.teamName' }),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row: TeamRow) => (
        <span>
          <Avatar
            src={row.hasAvatar ? row.avatar || undefined : undefined}
            size="small"
            style={{ marginRight: 8 }}
          >
            {name?.[0]}
          </Avatar>
          {name}
        </span>
      ),
    },
    {
      title: formatMessage({ id: 'admin.teamID' }),
      dataIndex: 'id',
      key: 'id',
      render: (id?: string) => id || '-',
    },
    {
      title: formatMessage({ id: 'admin.teamProjectSets' }),
      dataIndex: 'projectSetCount',
      key: 'projectSetCount',
      width: 110,
    },
    {
      title: formatMessage({ id: 'admin.teamProjects' }),
      dataIndex: 'projectCount',
      key: 'projectCount',
      width: 100,
    },
    {
      title: formatMessage({ id: 'admin.teamImages' }),
      dataIndex: 'imageCount',
      key: 'imageCount',
      width: 100,
    },
    {
      title: formatMessage({ id: 'form.actions' }),
      key: 'actions',
      width: 110,
      render: (_: unknown, row: TeamRow) => (
        <Popconfirm
          title={formatMessage({ id: 'admin.teamDeleteConfirm' })}
          onConfirm={() => handleDelete(row)}
        >
          <Button size="small" danger>
            {formatMessage({ id: 'admin.teamDelete' })}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div
      className="AdminTeam"
      css={css`
        padding: 24px;
      `}
    >
      {loading ? (
        <Spin />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={false}
        />
      )}
    </div>
  );
};
