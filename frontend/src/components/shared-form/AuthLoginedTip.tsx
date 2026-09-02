import { css } from '@emotion/core';
import { Button } from 'antd';
import { useIntl } from 'react-intl';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components';
import { AppState } from '@/store';
import { setUserToken } from '@/store/user/slice';
import { api } from '@/apis';
import { APIStorageUsage } from '@/apis/siteSetting';
import style from '@/style';
import { FC } from '@/interfaces';

/** 已经登陆提示的属性接口 */
interface AuthLoginedTipProps {
  className?: string;
}
/**
 * 已经登陆提示
 */
export const AuthLoginedTip: FC<AuthLoginedTipProps> = ({ className }) => {
  const { formatMessage } = useIntl(); // i18n
  const userName = useSelector((state: AppState) => state.user.name);
  const dispatch = useDispatch();
  const history = useHistory();
  const currentUser = useSelector((state: AppState) => state.user);
  const [storage, setStorage] = useState<APIStorageUsage | null>(null);

  /** 前往仪表盘 */
  const goDashboard = () => {
    history.push('/dashboard/projects');
  };

  /** 登出 */
  const logout = () => {
    dispatch(setUserToken({ token: '' }));
  };

  /** 格式化字节数 */
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1,
    );
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(1)} ${units[i]}`;
  };

  // 站点管理员可见存储区剩余空间
  useEffect(() => {
    if (!currentUser.admin) {
      return;
    }
    api.siteSetting
      .getStorageUsage({})
      .then((result) => {
        setStorage(result.data);
      })
      .catch(() => {
        setStorage(null);
      });
  }, [currentUser.admin]);

  return (
    <div
      className={className}
      css={css`
        width: 300px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        .avatar {
          margin-bottom: 24px;
        }
        .tip {
          color: ${style.textColorSecondary};
          font-size: 20px;
          margin-bottom: 24px;
        }
        .go-dashboard {
          margin-bottom: 24px;
        }
        .storage-usage {
          margin-top: 24px;
          color: ${style.textColorSecondary};
          font-size: 14px;
        }
      `}
    >
      <Avatar
        type="user"
        className="avatar"
        size={120}
        url={currentUser.avatar}
      />
      <div className="tip">
        {formatMessage({ id: 'auth.loginedTip' }, { userName })}
      </div>
      <Button
        onClick={goDashboard}
        className="go-dashboard"
        size="large"
        type="primary"
        block
      >
        {formatMessage({ id: 'router.goDashboard' })}
      </Button>
      <Button onClick={logout} className="logout" size="large" block>
        {formatMessage({ id: 'auth.logout' })}
      </Button>
      {currentUser.admin && (
        <div className="storage-usage">
          {formatMessage(
            { id: 'auth.storageFreeSpace' },
            { space: storage ? formatBytes(storage.free) : '---' },
          )}
        </div>
      )}
    </div>
  );
};
