import { css } from '@emotion/core';
import { Button, Modal, Spin } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { api } from '@/apis';
import { APINotice } from '@/apis/notice';
import { FC } from '@/interfaces';
import { AppState } from '@/store';
import style from '@/style';
import { NoticeListView } from './NoticeListView';

/**
 * 登录后弹未读通知：全局挂载一次，每次登录（用户 id 变化）时拉取未读通知，
 * 有则弹窗，点「知道了」或关闭即全部标记已读，之后本次会话不再弹。
 */
export const NoticeLoginPopup: FC = () => {
  const { formatMessage } = useIntl();
  const userId = useSelector((state: AppState) => state.user.id);
  const token = useSelector((state: AppState) => state.user.token);
  const [visible, setVisible] = useState(false);
  const [notices, setNotices] = useState<APINotice[]>([]);
  const [loading, setLoading] = useState(false);
  const shownForUserId = useRef<string | null>(null);

  useEffect(() => {
    // 未登录或无 token 则不做任何事
    if (!token || !userId) return;
    // 同一用户只弹一次（登出再登入其它账号会再弹）
    if (shownForUserId.current === userId) return;
    shownForUserId.current = userId;
    setLoading(true);
    api.notice
      .getNotices({ scope: 'unread' })
      .then((result) => {
        const unread = result.data || [];
        if (unread.length > 0) {
          setNotices(unread);
          setVisible(true);
        }
      })
      .catch(() => {
        /* 静默失败 */
      })
      .finally(() => setLoading(false));
  }, [token, userId]);

  const handleClose = () => {
    setVisible(false);
    // 标记全部已读（仅对当前弹出的未读）
    const ids = notices.map((n) => n.id);
    if (ids.length > 0) {
      api.notice.markNoticesRead({ noticeIds: ids }).catch(() => {});
    }
  };

  return (
    <>
      {loading && <Spin size="small" css={css`display:none;`} />}
      <Modal
        title={
          <span css={css`color: ${style.textColor};`}>
            {formatMessage({ id: 'notice.newNotice' })}
          </span>
        }
        visible={visible}
        onCancel={handleClose}
        footer={[
          <Button key="ok" type="primary" onClick={handleClose}>
            {formatMessage({ id: 'notice.allRead' })}
          </Button>,
        ]}
        width={520}
      >
        <NoticeListView notices={notices} />
      </Modal>
    </>
  );
};

export default NoticeLoginPopup;
