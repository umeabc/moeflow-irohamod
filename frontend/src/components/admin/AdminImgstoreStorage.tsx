import { Progress, Spin, Table } from 'antd';
import React, { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { api } from '@/apis';
import { APIImgstoreUsage } from '@/apis/siteSetting';
import { FC } from '@/interfaces';
import { toLowerCamelCase } from '@/utils';

const formatBytes = (bytes?: number | null) => {
  if (bytes == null || bytes < 0) return '—';
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

/** imgstore 存储概览：服务 URL / 已用容量 / 剩余容量 */
export const AdminImgstoreStorage: FC = () => {
  const { formatMessage } = useIntl();
  const [imgstores, setImgstores] = useState<APIImgstoreUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.siteSetting
      .getImgstoreOverview({})
      .then((result) => {
        const raw: APIImgstoreUsage[] =
          (result.data as { imgstores?: APIImgstoreUsage[] })?.imgstores || [];
        const list = raw.map((item) => toLowerCamelCase<APIImgstoreUsage>(item));
        setImgstores(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <Spin />;
  }

  const columns = [
    {
      title: formatMessage({ id: 'admin.imgstoreUrl' }),
      dataIndex: 'url',
      key: 'url',
      render: (v: string) =>
        v ? (
          <a href={v} target="_blank" rel="noreferrer">
            {v}
          </a>
        ) : (
          '—'
        ),
    },
    {
      title: formatMessage({ id: 'admin.imgstoreUsed' }),
      dataIndex: 'usedBytes',
      key: 'usedBytes',
      render: (v: number) => formatBytes(v),
    },
    {
      title: formatMessage({ id: 'admin.imgstoreFree' }),
      dataIndex: 'freeBytes',
      key: 'freeBytes',
      render: (v: number) => formatBytes(v),
    },
    {
      title: formatMessage({ id: 'admin.imgstoreTotal' }),
      dataIndex: 'totalBytes',
      key: 'totalBytes',
      render: (v: number) => formatBytes(v),
    },
    {
      title: formatMessage({ id: 'admin.imgstoreUsagePercent' }),
      key: 'percent',
      render: (_: unknown, record: APIImgstoreUsage) => {
        const percent =
          record.totalBytes > 0
            ? Math.min(100, Math.round((record.usedBytes / record.totalBytes) * 100))
            : 0;
        return <Progress percent={percent} size="small" />;
      },
    },
  ];

  return (
    <Table
      rowKey="url"
      loading={loading}
      dataSource={imgstores}
      columns={columns}
      pagination={false}
      locale={{ emptyText: formatMessage({ id: 'admin.imgstoreNoData' }) }}
    />
  );
};

export default AdminImgstoreStorage;
