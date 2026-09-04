import { AxiosRequestConfig } from 'axios';
import { request } from '.';

export interface APIAdminTeam {
  id: string;
  name: string;
  avatar: string | null;
  has_avatar: boolean;
  project_set_count: number;
  project_count: number;
  image_count: number;
}

/** 列表（全站团队行概览） */
const listTeams = ({ configs }: { configs?: AxiosRequestConfig } = {}) =>
  request<APIAdminTeam[]>({
    method: 'GET',
    url: `/v1/admin/teams`,
    ...configs,
  });

/** 删除团队 */
const deleteTeam = ({
  teamID,
  configs,
}: {
  teamID: string;
  configs?: AxiosRequestConfig;
}) =>
  request<unknown>({
    method: 'DELETE',
    url: `/v1/admin/teams/${teamID}`,
    ...configs,
  });

export default {
  listTeams,
  deleteTeam,
};
