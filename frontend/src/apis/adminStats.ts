import { AxiosRequestConfig } from 'axios';
import { request } from '.';

export interface APIContributionStats {
  user_id: string;
  name: string;
  email: string;
  translator_count: number;
  proofreader_count: number;
  typesetter_count: number;
  total: number;
}

const getContributionStats = (configs?: AxiosRequestConfig) =>
  request<APIContributionStats[]>({
    method: 'GET',
    url: '/v1/admin/contribution-stats',
    ...configs,
  });

export default { getContributionStats };
