import React, { useEffect, useState } from 'react';
import { Table } from 'antd';
import { useIntl } from 'react-intl';
import { api } from '@/apis';
import { APIContributionStats } from '@/apis/adminStats';
import { FC } from '@/interfaces';

export const AdminContributionStats: FC = () => {
  const { formatMessage } = useIntl();
  const [rows, setRows] = useState<APIContributionStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.adminStats
      .getContributionStats()
      .then((result) => {
        if (active) setRows(result.data);
      })
      .catch(() => {
        /* API errors are displayed by the request handler. */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const columns = [
    {
      title: formatMessage({ id: 'admin.contributionUser' }),
      dataIndex: 'name',
    },
    {
      title: formatMessage({ id: 'admin.contributionEmail' }),
      dataIndex: 'email',
    },
    {
      title: formatMessage({ id: 'admin.contributionTranslator' }),
      dataIndex: 'translator_count',
    },
    {
      title: formatMessage({ id: 'admin.contributionProofreader' }),
      dataIndex: 'proofreader_count',
    },
    {
      title: formatMessage({ id: 'admin.contributionTypesetter' }),
      dataIndex: 'typesetter_count',
    },
    {
      title: formatMessage({ id: 'admin.contributionTotal' }),
      dataIndex: 'total',
    },
  ];

  return (
    <Table<APIContributionStats>
      rowKey="user_id"
      columns={columns}
      dataSource={rows}
      loading={loading}
      locale={{ emptyText: formatMessage({ id: 'admin.contributionEmpty' }) }}
      pagination={{ pageSize: 20, showSizeChanger: false }}
      scroll={{ x: 720 }}
    />
  );
};
