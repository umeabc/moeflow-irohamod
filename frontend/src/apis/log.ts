import { AxiosRequestConfig } from 'axios';
import { request } from '.';

export interface APIActionLog {
  id: string;
  userName: string;
  userEmail: string;
  isAdmin: boolean;
  actionType: string;
  resourceType: string;
  resourceId: string;
  resourceName: string;
  method: string;
  path: string;
  ip: string;
  statusCode: number;
  details?: Record<string, any>;
  createTime: string;
}

export interface APIErrorLog {
  id: string;
  errorType: string;
  errorClass: string;
  errorMessage: string;
  traceback?: string;
  userName?: string;
  method: string;
  path: string;
  ip: string;
  requestData?: any;
  statusCode: number;
  resolved: boolean;
  resolvedBy?: string;
  resolvedTime?: string;
  resolvedNote?: string;
  createTime: string;
}

export interface ActionLogQueryParams {
  page?: number;
  limit?: number;
  user_id?: string;
  user_name?: string;
  action_type?: string;
  resource_type?: string;
  is_admin?: boolean;
  start_time?: string;
  end_time?: string;
}

export interface ErrorLogQueryParams {
  page?: number;
  limit?: number;
  error_type?: string;
  error_class?: string;
  resolved?: boolean;
  start_time?: string;
  end_time?: string;
}

const getActionLogs = ({
  params,
  configs,
}: {
  params?: ActionLogQueryParams;
  configs?: AxiosRequestConfig;
}) => {
  return request<APIActionLog[]>({
    method: 'GET',
    url: `/v1/admin/logs/actions`,
    params,
    ...configs,
  });
};

const getErrorLogs = ({
  params,
  configs,
}: {
  params?: ErrorLogQueryParams;
  configs?: AxiosRequestConfig;
}) => {
  return request<APIErrorLog[]>({
    method: 'GET',
    url: `/v1/admin/logs/errors`,
    params,
    ...configs,
  });
};

const getErrorLogDetail = ({
  logId,
  configs,
}: {
  logId: string;
  configs?: AxiosRequestConfig;
}) => {
  return request<APIErrorLog>({
    method: 'GET',
    url: `/v1/admin/logs/errors/${logId}`,
    ...configs,
  });
};

const resolveErrorLog = ({
  logId,
  resolved,
  resolvedNote,
  configs,
}: {
  logId: string;
  resolved: boolean;
  resolvedNote?: string;
  configs?: AxiosRequestConfig;
}) => {
  return request<APIErrorLog>({
    method: 'PUT',
    url: `/v1/admin/logs/errors/${logId}`,
    data: {
      resolved,
      resolved_note: resolvedNote,
    },
    ...configs,
  });
};

export default {
  getActionLogs,
  getErrorLogs,
  getErrorLogDetail,
  resolveErrorLog,
};
