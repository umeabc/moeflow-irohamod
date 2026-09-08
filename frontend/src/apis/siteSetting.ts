import { AxiosRequestConfig } from 'axios';
import { request } from '.';
import { toUnderScoreCase } from '@/utils';

export interface APISiteSetting {
  onlyAllowAdminCreateTeam: boolean;
  autoJoinTeamIDs: string[];
  twitterAuth?: string;
  twitterCt0?: string;
  downloadProxy?: string;
  pixivSession?: string;
  blueskyAnonymous?: boolean;
  blueskyHandle?: string;
  blueskyAppPassword?: string;
}

const getSiteSetting = ({ configs }: { configs?: AxiosRequestConfig }) => {
  return request<APISiteSetting>({
    method: 'GET',
    url: `/v1/admin/site-setting`,
    ...configs,
  });
};

const editSiteSetting = ({
  data,
  configs,
}: {
  data: APISiteSetting;
  configs?: AxiosRequestConfig;
}) => {
  return request({
    method: 'PUT',
    url: `/v1/admin/site-setting`,
    data: toUnderScoreCase(data),
    ...configs,
  });
};

export interface APIHomepage {
  html: string;
  css: string;
}
const getHomepage = ({ configs }: { configs?: AxiosRequestConfig }) => {
  return request<APIHomepage>({
    method: 'GET',
    url: `/v1/site/homepage`,
    ...configs,
  });
};

export interface APIStorageUsage {
  storageType: string;
  total: number;
  used: number;
  free: number;
}
const getStorageUsage = ({ configs }: { configs?: AxiosRequestConfig }) => {
  return request<APIStorageUsage>({
    method: 'GET',
    url: `/v1/admin/storage-usage`,
    ...configs,
  });
};

export interface APISystemStatus {
  cpuPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
  diskTotal: number | null;
  diskUsed: number | null;
  diskFree: number | null;
  systemVersion: string | null;
  storageType: string;
}
const getSystemStatus = ({
  configs,
}: {
  configs?: AxiosRequestConfig;
} = {}) => {
  return request<APISystemStatus>({
    method: 'GET',
    url: `/v1/admin/system-status`,
    ...configs,
  });
};

/** 站点自定义文案覆盖（按语言分组）：{ locale: { key: message } }；兼容旧单层结构 { key: message }。公开可读（登录页文案也需可覆盖） */
export type APICustomMessages = Record<string, Record<string, string>>;
const getCustomMessages = ({
  configs,
}: {
  configs?: AxiosRequestConfig;
} = {}) => {
  return request<APICustomMessages>({
    method: 'GET',
    url: `/v1/site/custom-messages`,
    ...configs,
  });
};

const saveCustomMessages = ({
  messages,
  configs,
}: {
  messages: APICustomMessages;
  configs?: AxiosRequestConfig;
}) => {
  return request<{ message: string; customMessages: APICustomMessages }>({
    method: 'PUT',
    url: `/v1/admin/custom-messages`,
    // 注意：key 含点号/大小写（如 site.englishName），不可经 toUnderScoreCase 转换
    data: { messages },
    ...configs,
  });
};

export type BrandAssetType = 'mascot' | 'favicon';
/** 站点品牌图片：{ type: 访问 URL 或 '' } */
export type APIBrandAssets = Record<BrandAssetType, string>;
const getBrandAssets = ({
  configs,
}: {
  configs?: AxiosRequestConfig;
} = {}) => {
  return request<APIBrandAssets>({
    method: 'GET',
    url: `/v1/site/brand-assets`,
    ...configs,
  });
};

const uploadBrandAsset = ({
  type,
  file,
  configs,
}: {
  type: BrandAssetType;
  file: File;
  configs?: AxiosRequestConfig;
}) => {
  const formData = new FormData();
  formData.append('type', type);
  formData.append('file', file);
  return request<{ message: string; url: string }>({
    method: 'PUT',
    url: `/v1/admin/site-brand-assets`,
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    ...configs,
  });
};

export default {
  getSiteSetting,
  editSiteSetting,
  getHomepage,
  getStorageUsage,
  getSystemStatus,
  getCustomMessages,
  saveCustomMessages,
  getBrandAssets,
  uploadBrandAsset,
};
