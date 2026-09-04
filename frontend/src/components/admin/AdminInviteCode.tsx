import { css } from '@emotion/core';
import {
  Button,
  Form,
  message,
  Popconfirm,
  Select,
  Spin,
  Switch,
  Table,
} from 'antd';
import React, { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { api } from '@/apis';
import { toLowerCamelCase } from '@/utils';
import { FC } from '@/interfaces';

interface InviteRow {
  id: string;
  code: string;
  teamId?: string | null;
  teamName?: string;
  role?: string;
  enabled?: boolean;
  useCount?: number;
  createTime?: string | null;
}

interface TeamOption {
  id: string;
  name: string;
}

const ROLE_OPTIONS = [
  { value: '', label: '使用团队默认角色' },
  { value: 'beginner', label: 'beginner' },
  { value: 'member', label: 'member' },
  { value: 'senior', label: 'senior' },
];

/** 管理员：邀请码管理 */
export const AdminInviteCode: FC = () => {
  const { formatMessage } = useIntl();
  const [rows, setRows] = useState<InviteRow[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [codeRes, teamRes] = await Promise.all([
        api.invitationCode.listInvitationCodes({}),
        // 站点管理员可绑定全站任意团队（非仅自己加入的）
        api.adminTeam.listTeams({}),
      ]);
      setRows(
        (codeRes.data ?? []).map(
          (item) => toLowerCamelCase<InviteRow>(item as any) as InviteRow,
        ),
      );
      setTeams(
        ((teamRes.data as any[]) || []).map((t: any) => ({
          id: t.id,
          name: t.name,
        })),
      );
    } catch (e) {
      // api 默认行为会弹错误提示
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (values: { teamId: string; role?: string }) => {
    setSubmitting(true);
    try {
      await api.invitationCode.createInvitationCode({
        data: { teamId: values.teamId, role: values.role },
      });
      message.success(formatMessage({ id: 'admin.inviteCodeCreated' }));
      form.resetFields();
      load();
    } catch (e) {
      // 错误提示由 api 默认行为处理
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEnabled = async (row: InviteRow, enabled: boolean) => {
    try {
      await api.invitationCode.editInvitationCode({
        inviteID: row.id,
        data: { enabled },
      });
      load();
    } catch (e) {
      // 错误提示由 api 默认行为处理
    }
  };

  const handleDelete = async (row: InviteRow) => {
    try {
      await api.invitationCode.deleteInvitationCode({ inviteID: row.id });
      message.success(formatMessage({ id: 'admin.inviteCodeDeleted' }));
      load();
    } catch (e) {
      // 错误提示由 api 默认行为处理
    }
  };

  const columns = [
    {
      title: formatMessage({ id: 'admin.inviteCodeCode' }),
      dataIndex: 'code',
      key: 'code',
    },
    {
      title: formatMessage({ id: 'admin.inviteCodeTeam' }),
      dataIndex: 'teamName',
      key: 'teamName',
      render: (name?: string) => name || '-',
    },
    {
      title: formatMessage({ id: 'admin.inviteCodeRole' }),
      dataIndex: 'role',
      key: 'role',
      render: (role?: string) =>
        role || formatMessage({ id: 'admin.inviteCodeDefaultRole' }),
    },
    {
      title: formatMessage({ id: 'admin.inviteCodeUseCount' }),
      dataIndex: 'useCount',
      key: 'useCount',
      width: 90,
    },
    {
      title: formatMessage({ id: 'admin.inviteCodeEnabled' }),
      dataIndex: 'enabled',
      key: 'enabled',
      width: 90,
      render: (enabled: boolean, row: InviteRow) => (
        <Switch checked={enabled} onChange={(v) => toggleEnabled(row, v)} />
      ),
    },
    {
      title: formatMessage({ id: 'form.actions' }),
      key: 'actions',
      width: 100,
      render: (_: unknown, row: InviteRow) => (
        <Popconfirm
          title={formatMessage({ id: 'admin.inviteCodeDeleteConfirm' })}
          onConfirm={() => handleDelete(row)}
        >
          <Button size="small" danger>
            {formatMessage({ id: 'admin.inviteCodeDelete' })}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div
      className="AdminInviteCode"
      css={css`
        padding: 24px;
      `}
    >
      <Form
        form={form}
        layout="inline"
        onFinish={handleCreate}
        style={{ marginBottom: 16 }}
      >
        <Form.Item
          name="teamId"
          label={formatMessage({ id: 'admin.inviteCodeTeam' })}
          rules={[{ required: true }]}
        >
          <Select
            showSearch
            placeholder={formatMessage({ id: 'admin.inviteCodeTeam' })}
            optionFilterProp="label"
            style={{ minWidth: 220 }}
          >
            {teams.map((t) => (
              <Select.Option key={t.id} value={t.id} label={t.name}>
                {t.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item
          name="role"
          label={formatMessage({ id: 'admin.inviteCodeRole' })}
        >
          <Select style={{ minWidth: 180 }}>
            {ROLE_OPTIONS.map((r) => (
              <Select.Option key={r.value} value={r.value}>
                {r.label}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting}>
            {formatMessage({ id: 'admin.inviteCodeCreate' })}
          </Button>
        </Form.Item>
      </Form>

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
