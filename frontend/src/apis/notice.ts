/**
 * 站点通知（公告）
 */
import { AxiosRequestConfig } from 'axios';
import { request } from '.';
import { toUnderScoreCase } from '@/utils';

/** 站点通知 */
export interface APINotice {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  createTime: string | null;
  createUserName: string;
  /** 当前用户是否已读（仅用户侧返回） */
  read?: boolean;
}

/** 获取当前用户的可见通知 */
const getNotices = ({
  scope,
  params,
  configs,
}: {
  /** unread：只看未读 */
  scope?: 'unread';
  params?: { page?: number; limit?: number };
  configs?: AxiosRequestConfig;
} = {}) => {
  return request<APINotice[]>({
    method: 'GET',
    url: `/v1/user/notices`,
    params: toUnderScoreCase({ scope, ...params }),
    ...configs,
  });
};

/** 标记通知为已读 */
const markNoticesRead = ({
  noticeIds,
  configs,
}: {
  noticeIds: string[];
  configs?: AxiosRequestConfig;
}) => {
  return request<{ message: string }>({
    method: 'PUT',
    url: `/v1/user/notices/read`,
    data: { notice_ids: noticeIds },
    ...configs,
  });
};

/** 管理员：全部通知 */
const adminGetNotices = ({
  configs,
}: {
  configs?: AxiosRequestConfig;
} = {}) => {
  return request<APINotice[]>({
    method: 'GET',
    url: `/v1/admin/notices`,
    ...configs,
  });
};

/** 管理员：发布通知 */
const adminCreateNotice = ({
  title,
  content,
  configs,
}: {
  title: string;
  content: string;
  configs?: AxiosRequestConfig;
}) => {
  return request<APINotice>({
    method: 'POST',
    url: `/v1/admin/notices`,
    data: { title, content },
    ...configs,
  });
};

/** 管理员：编辑通知 */
const adminEditNotice = ({
  noticeId,
  data,
  configs,
}: {
  noticeId: string;
  data: { title?: string; content?: string; enabled?: boolean };
  configs?: AxiosRequestConfig;
}) => {
  return request<APINotice>({
    method: 'PUT',
    url: `/v1/admin/notices/${noticeId}`,
    data: toUnderScoreCase(data),
    ...configs,
  });
};

/** 管理员：删除通知 */
const adminDeleteNotice = ({
  noticeId,
  configs,
}: {
  noticeId: string;
  configs?: AxiosRequestConfig;
}) => {
  return request<{ message: string }>({
    method: 'DELETE',
    url: `/v1/admin/notices/${noticeId}`,
    ...configs,
  });
};

export default {
  getNotices,
  markNoticesRead,
  adminGetNotices,
  adminCreateNotice,
  adminEditNotice,
  adminDeleteNotice,
};
