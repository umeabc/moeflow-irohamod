import { Progress, Spin, Table } from 'antd';
import React, { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { api } from '@/apis';
import { APIR2BucketUsage } from '@/apis/siteSetting';
import { FC } from '@/interfaces';
import { toLowerCamelCase } from '@/utils';

const formatBytes = (bytes?: number | null) => {
  if (bytes == null || bytes < 0) return '—';
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

/** R2 存储概览：桶名称 / 容量 / 已用 / 剩余（免费额度） */
export const AdminR2Storage: FC = () => {
  const { formatMessage } = useIntl();
  const [buckets, setBuckets] = useState<APIR2BucketUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.siteSetting
      .getR2Buckets({})
      .then((result) => {
        const raw: APIR2BucketUsage[] =
          (result.data as { buckets?: APIR2BucketUsage[] })?.buckets || [];
        const list = raw.map((item) => toLowerCamelCase<APIR2BucketUsage>(item));
        setBuckets(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <Spin />;
  }

  const columns = [
    {
      title: formatMessage({ id: 'admin.r2BucketName' }),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: formatMessage({ id: 'admin.r2BucketUrl' }),
      dataIndex: 'domain',
      key: 'domain',
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
      title: formatMessage({ id: 'admin.r2BucketQuota' }),
      dataIndex: 'quotaBytes',
      key: 'quotaBytes',
      render: (v: number) => formatBytes(v),
    },
    {
      title: formatMessage({ id: 'admin.r2BucketUsed' }),
      dataIndex: 'usedBytes',
      key: 'usedBytes',
      render: (v: number) => formatBytes(v),
    },
    {
      title: formatMessage({ id: 'admin.r2BucketFree' }),
      dataIndex: 'freeBytes',
      key: 'freeBytes',
      render: (v: number) => formatBytes(v),
    },
    {
      title: formatMessage({ id: 'admin.r2BucketUsagePercent' }),
      key: 'percent',
      render: (_: unknown, record: APIR2BucketUsage) => {
        const percent =
          record.quotaBytes > 0
            ? Math.min(100, Math.round((record.usedBytes / record.quotaBytes) * 100))
            : 0;
        return <Progress percent={percent} size="small" />;
      },
    },
  ];

  return (
    <Table
      rowKey="name"
      loading={loading}
      dataSource={buckets}
      columns={columns}
      pagination={false}
      locale={{ emptyText: formatMessage({ id: 'admin.r2NoBuckets' }) }}
    />
  );
};

export default AdminR2Storage;
