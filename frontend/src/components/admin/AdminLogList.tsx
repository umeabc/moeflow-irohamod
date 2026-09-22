import { css } from '@emotion/core';
import React, { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { FC } from '@/interfaces';
import {
  Button,
  DatePicker,
  Descriptions,
  Input,
  Modal,
  Select,
  Space,
  Table,
  TablePaginationConfig,
  Tabs,
  Tag,
} from 'antd';
import dayjs from 'dayjs';
import { api } from '@/apis';
import { APIActionLog, APIErrorLog } from '@/apis/log';
import { toLowerCamelCase } from '@/utils';
import style from '@/style';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { TextArea } = Input;

// antd 4 的 RangePicker 类型存在 moment/dayjs 重载冲突，这里宽松处理
const RangePickerAny = RangePicker as any;

/** 日志管理的属性接口 */
interface AdminLogListProps {
  className?: string;
}

/**
 * 日志管理：用户操作日志 + 服务器错误日志
 */
export const AdminLogList: FC<AdminLogListProps> = ({ className }) => {
  const { formatMessage } = useIntl();

  const [activeTab, setActiveTab] = useState<'actions' | 'errors'>('actions');
  const [actionLogs, setActionLogs] = useState<APIActionLog[]>([]);
  const [errorLogs, setErrorLogs] = useState<APIErrorLog[]>([]);
  const [loading, setLoading] = useState(false);

  // 筛选条件
  const [username, setUsername] = useState('');
  const [action, setAction] = useState('');
  const [resource, setResource] = useState('');
  const [errorType, setErrorType] = useState('');
  const [resolved, setResolved] = useState<boolean | undefined>(undefined);
  const [dateRange, setDateRange] = useState<
    [dayjs.Dayjs, dayjs.Dayjs] | undefined
  >(undefined);

  const [actionPagination, setActionPagination] =
    useState<TablePaginationConfig>({
      current: 1,
      pageSize: 30,
      total: 0,
    });
  const [errorPagination, setErrorPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 30,
    total: 0,
  });

  // 错误详情弹窗
  const [errorDetailModalOpen, setErrorDetailModalOpen] = useState(false);
  const [selectedError, setSelectedError] = useState<APIErrorLog | null>(null);

  const timeParams = () => {
    if (!dateRange) return {};
    return {
      start_time: dateRange[0].toISOString(),
      end_time: dateRange[1].toISOString(),
    };
  };

  const fetchActionLogs = async (pagination = actionPagination) => {
    setLoading(true);
    try {
      const result = await api.log.getActionLogs({
        params: {
          page: pagination.current,
          limit: pagination.pageSize,
          user_name: username || undefined,
          action_type: action || undefined,
          resource_type: resource || undefined,
          ...timeParams(),
        },
      });
      setActionLogs(toLowerCamelCase(result.data));
      setActionPagination({
        ...pagination,
        total: Number(result.headers['x-pagination-count'] || 0),
      });
    } catch (error: any) {
      error.default();
    } finally {
      setLoading(false);
    }
  };

  const fetchErrorLogs = async (pagination = errorPagination) => {
    setLoading(true);
    try {
      const result = await api.log.getErrorLogs({
        params: {
          page: pagination.current,
          limit: pagination.pageSize,
          error_type: errorType || undefined,
          resolved,
          ...timeParams(),
        },
      });
      setErrorLogs(toLowerCamelCase(result.data));
      setErrorPagination({
        ...pagination,
        total: Number(result.headers['x-pagination-count'] || 0),
      });
    } catch (error: any) {
      error.default();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'actions') {
      fetchActionLogs();
    } else {
      fetchErrorLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleSearch = () => {
    if (activeTab === 'actions') {
      fetchActionLogs({ ...actionPagination, current: 1 });
    } else {
      fetchErrorLogs({ ...errorPagination, current: 1 });
    }
  };

  const handleReset = () => {
    setUsername('');
    setAction('');
    setResource('');
    setErrorType('');
    setResolved(undefined);
    setDateRange(undefined);
    if (activeTab === 'actions') {
      fetchActionLogs({ ...actionPagination, current: 1 });
    } else {
      fetchErrorLogs({ ...errorPagination, current: 1 });
    }
  };

  const handleViewErrorDetail = (record: APIErrorLog) => {
    setSelectedError(record);
    setErrorDetailModalOpen(true);
  };

  const handleToggleResolved = async (record: APIErrorLog) => {
    try {
      await api.log.resolveErrorLog({
        logId: record.id,
        resolved: !record.resolved,
      });
      fetchErrorLogs();
    } catch (error: any) {
      error.default();
    }
  };

  const actionColumns = [
    {
      title: formatMessage({ id: 'admin.log.time' }),
      dataIndex: 'createTime',
      key: 'createTime',
      width: 160,
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: formatMessage({ id: 'admin.log.username' }),
      dataIndex: 'userName',
      key: 'userName',
      width: 140,
      render: (text: string, record: APIActionLog) =>
        text ? (
          <Space size={4}>
            <span>{text}</span>
            {record.isAdmin && <Tag color="gold">Admin</Tag>}
          </Space>
        ) : (
          '-'
        ),
    },
    {
      title: formatMessage({ id: 'admin.log.operateIp' }),
      dataIndex: 'ip',
      key: 'ip',
      width: 130,
      render: (text: string) => text || '-',
    },
    {
      title: formatMessage({ id: 'admin.log.action' }),
      dataIndex: 'actionType',
      key: 'actionType',
      width: 170,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: formatMessage({ id: 'admin.log.resource' }),
      dataIndex: 'resourceType',
      key: 'resourceType',
      width: 110,
      render: (text: string) => text || '-',
    },
    {
      title: formatMessage({ id: 'admin.log.resourceName' }),
      dataIndex: 'resourceName',
      key: 'resourceName',
      ellipsis: true,
      render: (text: string) => text || '-',
    },
    {
      title: formatMessage({ id: 'admin.log.detail' }),
      dataIndex: 'details',
      key: 'details',
      width: 220,
      ellipsis: true,
      render: (details?: Record<string, any>) =>
        details && Object.keys(details).length > 0
          ? JSON.stringify(details)
          : '-',
    },
    {
      title: formatMessage({ id: 'admin.log.endpoint' }),
      dataIndex: 'path',
      key: 'path',
      width: 240,
      ellipsis: true,
    },
  ];

  const errorColumns = [
    {
      title: formatMessage({ id: 'admin.log.time' }),
      dataIndex: 'createTime',
      key: 'createTime',
      width: 160,
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: formatMessage({ id: 'admin.log.username' }),
      dataIndex: 'userName',
      key: 'userName',
      width: 110,
      render: (text: string) => text || '-',
    },
    {
      title: formatMessage({ id: 'admin.log.operateIp' }),
      dataIndex: 'ip',
      key: 'ip',
      width: 130,
      render: (text: string) => text || '-',
    },
    {
      title: formatMessage({ id: 'admin.log.errorType' }),
      dataIndex: 'errorType',
      key: 'errorType',
      width: 110,
      render: (text: string) => <Tag color="red">{text}</Tag>,
    },
    {
      title: formatMessage({ id: 'admin.log.errorMessage' }),
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      ellipsis: true,
    },
    {
      title: formatMessage({ id: 'admin.log.endpoint' }),
      dataIndex: 'path',
      key: 'path',
      width: 200,
      ellipsis: true,
    },
    {
      title: formatMessage({ id: 'admin.log.method' }),
      dataIndex: 'method',
      key: 'method',
      width: 80,
    },
    {
      title: formatMessage({ id: 'admin.log.resolved' }),
      dataIndex: 'resolved',
      key: 'resolved',
      width: 100,
      render: (value: boolean) => (
        <Tag color={value ? 'green' : 'orange'}>
          {formatMessage({
            id: value ? 'admin.log.resolved' : 'admin.log.unresolved',
          })}
        </Tag>
      ),
    },
    {
      title: formatMessage({ id: 'admin.log.actions' }),
      key: 'actions',
      width: 210,
      render: (_: unknown, record: APIErrorLog) => (
        <Space>
          <Button size="small" onClick={() => handleViewErrorDetail(record)}>
            {formatMessage({ id: 'admin.log.viewDetail' })}
          </Button>
          <Button
            size="small"
            type={record.resolved ? 'default' : 'primary'}
            onClick={() => handleToggleResolved(record)}
          >
            {formatMessage({
              id: record.resolved
                ? 'admin.log.markUnresolved'
                : 'admin.log.markResolved',
            })}
          </Button>
        </Space>
      ),
    },
  ];

  const filterSection = (
    <div
      css={css`
        padding: 16px;
        background: ${style.surface2};
        border: 1px solid ${style.borderColorLight};
        border-radius: 4px;
        margin-bottom: 16px;
      `}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Space wrap>
          {(activeTab === 'actions' || activeTab === 'errors') && (
            <Input
              placeholder={formatMessage({ id: 'admin.log.filterUsername' })}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: 200 }}
              disabled={activeTab === 'errors'}
            />
          )}
          {activeTab === 'actions' ? (
            <>
              <Input
                placeholder={formatMessage({ id: 'admin.log.filterAction' })}
                value={action}
                onChange={(e) => setAction(e.target.value)}
                style={{ width: 200 }}
              />
              <Input
                placeholder={formatMessage({ id: 'admin.log.filterResource' })}
                value={resource}
                onChange={(e) => setResource(e.target.value)}
                style={{ width: 200 }}
              />
            </>
          ) : (
            <>
              <Input
                placeholder={formatMessage({ id: 'admin.log.filterErrorType' })}
                value={errorType}
                onChange={(e) => setErrorType(e.target.value)}
                style={{ width: 200 }}
              />
              <Select
                placeholder={formatMessage({ id: 'admin.log.filterResolved' })}
                value={resolved}
                onChange={setResolved}
                style={{ width: 150 }}
                allowClear
              >
                <Option value={true}>
                  {formatMessage({ id: 'admin.log.resolved' })}
                </Option>
                <Option value={false}>
                  {formatMessage({ id: 'admin.log.unresolved' })}
                </Option>
              </Select>
            </>
          )}
          <RangePickerAny
            value={dateRange}
            onChange={setDateRange}
            showTime
            format="YYYY-MM-DD HH:mm"
          />
        </Space>
        <Space>
          <Button type="primary" onClick={handleSearch}>
            {formatMessage({ id: 'admin.log.search' })}
          </Button>
          <Button onClick={handleReset}>
            {formatMessage({ id: 'admin.log.reset' })}
          </Button>
        </Space>
      </Space>
    </div>
  );

  return (
    <div className={className}>
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'actions' | 'errors')}
        items={[
          {
            key: 'actions',
            label: formatMessage({ id: 'admin.log.actionLogs' }),
            children: (
              <>
                {filterSection}
                <Table
                  columns={actionColumns}
                  dataSource={actionLogs}
                  rowKey="id"
                  loading={loading}
                  pagination={actionPagination}
                  onChange={(pagination) => fetchActionLogs(pagination)}
                  scroll={{ x: 1200 }}
                />
              </>
            ),
          },
          {
            key: 'errors',
            label: formatMessage({ id: 'admin.log.errorLogs' }),
            children: (
              <>
                {filterSection}
                <Table
                  columns={errorColumns}
                  dataSource={errorLogs}
                  rowKey="id"
                  loading={loading}
                  pagination={errorPagination}
                  onChange={(pagination) => fetchErrorLogs(pagination)}
                  scroll={{ x: 1400 }}
                />
              </>
            ),
          },
        ]}
      />

      <Modal
        title={formatMessage({ id: 'admin.log.errorDetail' })}
        open={errorDetailModalOpen}
        onCancel={() => setErrorDetailModalOpen(false)}
        footer={null}
        width={800}
      >
        {selectedError && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label={formatMessage({ id: 'admin.log.time' })}>
              {dayjs(selectedError.createTime).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item
              label={formatMessage({ id: 'admin.log.username' })}
            >
              {selectedError.userName || '-'}
            </Descriptions.Item>
            <Descriptions.Item
              label={formatMessage({ id: 'admin.log.errorType' })}
            >
              <Tag color="red">{selectedError.errorType}</Tag>
            </Descriptions.Item>
            <Descriptions.Item
              label={formatMessage({ id: 'admin.log.errorClass' })}
            >
              {selectedError.errorClass}
            </Descriptions.Item>
            <Descriptions.Item
              label={formatMessage({ id: 'admin.log.errorMessage' })}
            >
              {selectedError.errorMessage}
            </Descriptions.Item>
            <Descriptions.Item
              label={formatMessage({ id: 'admin.log.endpoint' })}
            >
              {selectedError.method} {selectedError.path}
            </Descriptions.Item>
            <Descriptions.Item
              label={formatMessage({ id: 'admin.log.statusCode' })}
            >
              {selectedError.statusCode || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={formatMessage({ id: 'admin.log.ip' })}>
              {selectedError.ip || '-'}
            </Descriptions.Item>
            {selectedError.requestData && (
              <Descriptions.Item
                label={formatMessage({ id: 'admin.log.requestData' })}
              >
                <TextArea
                  value={JSON.stringify(selectedError.requestData, null, 2)}
                  autoSize={{ minRows: 3, maxRows: 10 }}
                  readOnly
                />
              </Descriptions.Item>
            )}
            {selectedError.traceback && (
              <Descriptions.Item
                label={formatMessage({ id: 'admin.log.stackTrace' })}
              >
                <TextArea
                  value={selectedError.traceback}
                  autoSize={{ minRows: 5, maxRows: 15 }}
                  readOnly
                />
              </Descriptions.Item>
            )}
            {selectedError.resolvedBy && (
              <Descriptions.Item
                label={formatMessage({ id: 'admin.log.resolvedBy' })}
              >
                {selectedError.resolvedBy}
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};
