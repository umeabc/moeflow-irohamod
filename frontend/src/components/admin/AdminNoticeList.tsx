import { css } from '@emotion/core';
import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Spin,
  Switch,
  Table,
  Tag,
} from 'antd';
import React, { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { api } from '@/apis';
import { APINotice } from '@/apis/notice';
import { FC } from '@/interfaces';
import { toLowerCamelCase } from '@/utils';
import style from '@/style';

const { TextArea } = Input;

interface NoticeRow extends APINotice {
  key: string;
}

interface EditFormValues {
  title?: string;
  content?: string;
}

/** 管理员：通知管理（发布/编辑/停用/删除全体通知） */
export const AdminNoticeList: FC = () => {
  const { formatMessage } = useIntl();
  const [rows, setRows] = useState<NoticeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<APINotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<EditFormValues>();

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.notice.adminGetNotices({});
      setRows(
        ((res.data as any[]) || []).map(
          (item) => toLowerCamelCase<APINotice>(item as any) as NoticeRow,
        ),
      );
    } catch (e) {
      // noop
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalVisible(true);
  };

  const openEdit = (notice: APINotice) => {
    setEditing(notice);
    form.setFieldsValue({ title: notice.title, content: notice.content });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      if (editing) {
        await api.notice.adminEditNotice({
          noticeId: editing.id,
          data: {
            title: (values.title || '').trim(),
            content: (values.content || '').trim(),
          },
        });
      } else {
        await api.notice.adminCreateNotice({
          title: (values.title || '').trim(),
          content: (values.content || '').trim(),
        });
      }
      message.success(formatMessage({ id: 'form.ok' }));
      setModalVisible(false);
      load();
    } catch (error) {
      (error as any)?.default?.();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleEnabled = async (notice: APINotice) => {
    try {
      await api.notice.adminEditNotice({
        noticeId: notice.id,
        data: { enabled: !notice.enabled },
      });
      load();
    } catch (e) {
      // noop
    }
  };

  const handleDelete = async (notice: APINotice) => {
    try {
      await api.notice.adminDeleteNotice({ noticeId: notice.id });
      message.success(formatMessage({ id: 'form.ok' }));
      load();
    } catch (e) {
      // noop
    }
  };

  const columns = [
    {
      title: formatMessage({ id: 'notice.title' }),
      dataIndex: 'title',
      key: 'title',
      render: (_: unknown, record: NoticeRow) =>
        record.title || (
          <span css={css`color: ${style.textColorSecondary};`}>—</span>
        ),
    },
    {
      title: formatMessage({ id: 'notice.content' }),
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      render: (_: unknown, record: NoticeRow) => (
        <span css={css`white-space: pre-wrap;`}>{record.content}</span>
      ),
    },
    {
      title: formatMessage({ id: 'notice.publishAt' }),
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      render: (value: string | null) =>
        value ? new Date(value).toLocaleString() : '—',
    },
    {
      title: formatMessage({ id: 'notice.status' }),
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled: boolean) =>
        enabled ? (
          <Tag color="success">{formatMessage({ id: 'notice.enabled' })}</Tag>
        ) : (
          <Tag>{formatMessage({ id: 'notice.disabled' })}</Tag>
        ),
    },
    {
      title: formatMessage({ id: 'admin.actions' }),
      key: 'actions',
      width: 200,
      render: (_: unknown, record: NoticeRow) => (
        <>
          <Button type="link" size="small" onClick={() => openEdit(record)}>
            {formatMessage({ id: 'notice.edit' })}
          </Button>
          <Switch
            size="small"
            checked={record.enabled}
            onChange={() => handleToggleEnabled(record)}
            css={css`margin: 0 8px;`}
          />
          <Popconfirm
            title={formatMessage({ id: 'notice.deleteConfirm' })}
            onConfirm={() => handleDelete(record)}
          >
            <Button type="link" size="small" danger>
              {formatMessage({ id: 'notice.delete' })}
            </Button>
          </Popconfirm>
        </>
      ),
    },
  ];

  return (
    <div
      css={css`
        .AdminNoticeList__Toolbar {
          margin-bottom: 16px;
          text-align: right;
        }
      `}
    >
      <div className="AdminNoticeList__Toolbar">
        <Button type="primary" onClick={openCreate}>
          {formatMessage({ id: 'notice.publish' })}
        </Button>
      </div>
      <Spin spinning={loading}>
        <Table
          dataSource={rows}
          columns={columns as any}
          pagination={{ pageSize: 10 }}
          rowKey="id"
        />
      </Spin>
      <Modal
        title={formatMessage({
          id: editing ? 'notice.edit' : 'notice.publish',
        })}
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label={formatMessage({ id: 'notice.title' })}
          >
            <Input
              placeholder={formatMessage({ id: 'notice.titlePlaceholder' })}
            />
          </Form.Item>
          <Form.Item
            name="content"
            label={formatMessage({ id: 'notice.content' })}
            rules={[
              {
                required: true,
                message: formatMessage({ id: 'form.required' }),
              },
            ]}
          >
            <TextArea
              rows={6}
              placeholder={formatMessage({ id: 'notice.contentPlaceholder' })}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminNoticeList;
