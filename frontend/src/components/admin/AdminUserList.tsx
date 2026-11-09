import { css } from '@emotion/core';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import dayjs from 'dayjs';
import { FC } from '@/interfaces';
import classNames from 'classnames';
import {
  Button,
  Input,
  message,
  Modal,
  Popconfirm,
  Space,
  Table,
  TablePaginationConfig,
  Form as AntdForm,
} from 'antd';
import { api, FailureResults } from '@/apis';
import { toLowerCamelCase } from '@/utils';
import { APIUser } from '@/apis/user';
import { FormItem } from '@/components/shared-form/FormItem';
import { Form } from '@/components/shared-form/Form';
import { EmailInput } from '@/components/shared-form/EmailInput';
import { EMAIL_REGEX, USER_NAME_REGEX } from '@/utils/regex';
import style from '@/style';

/** 用户列表管理的属性接口 */
interface AdminUserListProps {
  className?: string;
}
/**
 * 用户列表管理
 */
export const AdminUserList: FC<AdminUserListProps> = ({ className }) => {
  const { formatMessage } = useIntl();

  const [data, setData] = useState<APIUser[]>([]);
  const [word, setWord] = useState('');
  const [loading, setLoading] = useState(false);
  // 分页只保存原始值：Table 的 pagination 由这些值拼出来。
  // 早期把整个 pagination 对象放进 fetchData 依赖里，请求回包又 setPagination 新对象，
  // 会导致 effect 无限重跑；配合闭包里过期的 current，翻页时会来回跳。
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [total, setTotal] = useState(0);
  // 只接受最后一次请求的结果，避免旧页面的慢响应覆盖新页面
  const requestSeq = useRef(0);
  // 修改用户密码
  const [newPassword, setNewPassword] = useState('');
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [changePasswordModalUser, setChangePasswordModalUser] =
    useState<APIUser | null>(null);
  // 创建用户
  const [form] = AntdForm.useForm();
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);
    try {
      const result = await api.user.adminGetUserList({
        params: {
          page,
          limit: pageSize,
          word,
        },
      });
      if (seq !== requestSeq.current) {
        return;
      }
      setData(toLowerCamelCase(result.data));
      setTotal(Number(result.headers['x-pagination-count'] || 0));
    } catch (error) {
      if (seq === requestSeq.current) {
        (error as FailureResults).default();
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
      }
    }
  }, [page, pageSize, word]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTableChange = (next: TablePaginationConfig) => {
    const nextPageSize = next.pageSize ?? pageSize;
    if (nextPageSize !== pageSize) {
      // 改变每页条数时回到第一页，避免停留在超出范围的页码
      setPageSize(nextPageSize);
      setPage(1);
      return;
    }
    const nextPage = next.current ?? 1;
    if (nextPage !== page) {
      setPage(nextPage);
    }
  };

  const handelChangeAdminStatus = async (record: APIUser) => {
    setLoading(true);
    try {
      await api.user.adminChangeAdminStatus({
        data: {
          userId: record.id,
          status: !record.admin,
        },
      });
      fetchData();
      message.success(formatMessage({ id: 'site.setting.editSuccess' }));
    } catch (error) {
      (error as FailureResults).default();
    } finally {
      setLoading(false);
    }
  };

  const handleChangePasswordModalOk = () => {
    handelChangePassword(changePasswordModalUser!.id, newPassword);
    setChangePasswordModalOpen(false);
    setNewPassword('');
  };

  const handleChangePasswordModalCancel = () => {
    setChangePasswordModalOpen(false);
    setNewPassword('');
  };

  const handleCreateUserFormFinish = (values: any) => {
    api.user
      .adminCreateUser({
        data: values,
      })
      .then(() => {
        message.success(formatMessage({ id: 'site.setting.createSuccess' }));
        fetchData();
        setCreateUserModalOpen(false);
      })
      .catch((error) => {
        error.default(form);
      });
  };

  const handleCreateUserModalCancel = () => {
    setCreateUserModalOpen(false);
  };

  const handelChangePassword = async (userID: string, password: string) => {
    setLoading(true);
    try {
      await api.user.adminEditUserPassword({
        userID: userID,
        data: { password },
      });
      message.success(formatMessage({ id: 'site.setting.editSuccess' }));
    } catch (error) {
      const failure = error as FailureResults;
      if (failure.type === 'VALIDATION_FAILURE') {
        message.error(failure.data.message.password?.[0]);
      } else {
        failure.default();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async (record: APIUser) => {
    setLoading(true);
    try {
      await api.user.adminDeactivateUser({ userID: record.id });
      message.success(formatMessage({ id: 'admin.deactivateSuccess' }));
      fetchData();
    } catch (error) {
      (error as FailureResults).default();
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: formatMessage({ id: 'site.userName' }),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: formatMessage({ id: 'site.email' }),
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: formatMessage({ id: 'admin.lastLoginTime' }),
      dataIndex: 'lastActiveTime',
      key: 'lastActiveTime',
      render: (text: string) =>
        text ? dayjs.utc(text).local().format('lll') : '—',
    },
    {
      title: formatMessage({ id: 'admin.actions' }),
      key: 'action',
      render: (_: any, record: APIUser) => (
        <Space size="middle">
          <a
            onClick={() => {
              handelChangeAdminStatus(record);
            }}
          >
            {record.admin
              ? formatMessage({ id: 'admin.unsetAdmin' })
              : formatMessage({ id: 'admin.setAdmin' })}
          </a>
          <a
            onClick={() => {
              setChangePasswordModalUser(record);
              setChangePasswordModalOpen(true);
            }}
          >
            {formatMessage({ id: 'admin.resetPassword' })}
          </a>
          <Popconfirm
            title={formatMessage({ id: 'admin.deactivateUserConfirm' })}
            okText={formatMessage({ id: 'form.confirm' })}
            cancelText={formatMessage({ id: 'form.cancel' })}
            onConfirm={() => handleDeactivate(record)}
          >
            <a className="AdminUserList__Deactivate">
              {formatMessage({ id: 'admin.deactivateUser' })}
            </a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div
      className={classNames('AdminUserList', className)}
      css={css`
        width: 100%;
        .AdminUserList__Toolbar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 16px;
          border-bottom: 1px solid ${style.borderColorLight};
          .ant-input {
            max-width: 420px;
          }
        }
        .AdminUserList__Table {
          overflow-x: auto;
          padding-top: 16px;
        }
        @media (max-width: 600px) {
          .AdminUserList__Toolbar {
            align-items: stretch;
            flex-direction: column;
            .ant-input {
              max-width: none;
            }
          }
        }
      `}
    >
      <header className="AdminUserList__Toolbar">
        <Input
          value={word}
          onChange={(e) => {
            setWord(e.target.value);
            // 搜索条件变化后回到第一页
            setPage(1);
          }}
          placeholder={formatMessage({ id: 'admin.searchUser' })}
          css={css`
            margin-right: 8px;
          `}
        />
        <Button
          type="primary"
          onClick={() => {
            setCreateUserModalOpen(true);
          }}
        >
          {formatMessage({ id: 'admin.createUser' })}
        </Button>
      </header>
      <div className="AdminUserList__Table">
        <Table
          dataSource={data}
          rowKey={(record) => record.id}
          columns={columns}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
          }}
          loading={loading}
          onChange={handleTableChange}
          scroll={{ x: 820 }}
        />
      </div>
      <Modal
        title={formatMessage({ id: 'admin.resetPassword' })}
        visible={changePasswordModalOpen}
        onOk={handleChangePasswordModalOk}
        onCancel={handleChangePasswordModalCancel}
      >
        <Input.Password
          minLength={6}
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
          }}
        />
      </Modal>
      <Modal
        title={formatMessage({ id: 'admin.createUser' })}
        visible={createUserModalOpen}
        onCancel={handleCreateUserModalCancel}
        footer={null}
      >
        <Form
          name="register-form"
          form={form}
          onFinish={handleCreateUserFormFinish}
        >
          <FormItem
            name="email"
            rules={[
              { required: true },
              {
                pattern: EMAIL_REGEX,
                message: formatMessage({ id: 'form.formatWrong' }),
              },
            ]}
          >
            <EmailInput prefix={formatMessage({ id: 'site.email' })} />
          </FormItem>
          <FormItem
            name="name"
            rules={[
              { required: true },
              {
                pattern: USER_NAME_REGEX,
                message: formatMessage({ id: 'auth.userNameFormatTip' }),
              },
              { min: 2 },
              { max: 18 },
            ]}
          >
            <Input prefix={formatMessage({ id: 'site.userName' })} />
          </FormItem>
          <FormItem
            name="password"
            rules={[{ required: true }, { min: 6 }, { max: 60 }]}
          >
            <Input.Password prefix={formatMessage({ id: 'site.password' })} />
          </FormItem>
          <FormItem>
            <Button type="primary" block htmlType="submit">
              {formatMessage({ id: 'form.submit' })}
            </Button>
          </FormItem>
        </Form>
      </Modal>
    </div>
  );
};
