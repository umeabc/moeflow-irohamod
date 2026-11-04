import type { APIUser } from './user';

export interface APITip {
  sourceID: string;
  id: string;
  content: string;
  user: APIUser | null;
  createTime: string;
  editTime: string;
}
