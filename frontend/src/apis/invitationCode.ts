import { AxiosRequestConfig } from 'axios';
import { request } from '.';
import { toUnderScoreCase } from '@/utils';

export interface APIInvitationCode {
  id: string;
  code: string;
  team_id: string | null;
  team_name: string;
  role: string;
  enabled: boolean;
  use_count: number;
  create_time: string | null;
}

/** 新建邀请码的请求数据 */
interface CreateInviteCodeData {
  teamId: string;
  role?: string;
}
/** 修改邀请码的请求数据 */
interface EditInviteCodeData {
  enabled?: boolean;
  teamId?: string;
  role?: string;
}

/** 列表 */
const listInvitationCodes = ({
  configs,
}: {
  configs?: AxiosRequestConfig;
} = {}) =>
  request<APIInvitationCode[]>({
    method: 'GET',
    url: `/v1/admin/invitation-codes`,
    ...configs,
  });

/** 新建 */
const createInvitationCode = ({
  data,
  configs,
}: {
  data: CreateInviteCodeData;
  configs?: AxiosRequestConfig;
}) =>
  request<APIInvitationCode>({
    method: 'POST',
    url: `/v1/admin/invitation-codes`,
    data: toUnderScoreCase(data),
    ...configs,
  });

/** 修改（启停/换团队/换角色） */
const editInvitationCode = ({
  inviteID,
  data,
  configs,
}: {
  inviteID: string;
  data: EditInviteCodeData;
  configs?: AxiosRequestConfig;
}) =>
  request<APIInvitationCode>({
    method: 'PUT',
    url: `/v1/admin/invitation-codes/${inviteID}`,
    data: toUnderScoreCase(data),
    ...configs,
  });

/** 删除 */
const deleteInvitationCode = ({
  inviteID,
  configs,
}: {
  inviteID: string;
  configs?: AxiosRequestConfig;
}) =>
  request<unknown>({
    method: 'DELETE',
    url: `/v1/admin/invitation-codes/${inviteID}`,
    ...configs,
  });

export default {
  listInvitationCodes,
  createInvitationCode,
  editInvitationCode,
  deleteInvitationCode,
};
