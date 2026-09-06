import { css } from '@emotion/core';
import { Button, Modal, Spin } from 'antd';
import React, { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { api } from '@/apis';
import { APINotice } from '@/apis/notice';
import { FC } from '@/interfaces';
import style from '@/style';
import { NoticeListView } from './NoticeListView';

interface NoticeHistoryModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * 通知一览：列出当前用户全部可见通知（含已读/未读标记），
 * 从用户菜单「通知一览」打开；打开即把未读全部标记为已读。
 */
export const NoticeHistoryModal: FC<NoticeHistoryModalProps> = ({
  visible,
  onClose,
}) => {
  const { formatMessage } = useIntl();
  const [notices, setNotices] = useState<APINotice[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    api.notice
      .getNotices({})
      .then((result) => {
        const list = result.data || [];
        setNotices(list);
        // 打开一览即把其中未读的标记为已读
        const unreadIds = list.filter((n) => !n.read).map((n) => n.id);
        if (unreadIds.length > 0) {
          api.notice.markNoticesRead({ noticeIds: unreadIds }).catch(() => {});
          setNotices((prev) =>
            prev.map((n) => ({ ...n, read: true })),
          );
        }
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => setLoading(false));
  }, [visible]);

  return (
    <Modal
      title={
        <span css={css`color: ${style.textColor};`}>
          {formatMessage({ id: 'notice.list' })}
        </span>
      }
      visible={visible}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          {formatMessage({ id: 'form.cancel' })}
        </Button>,
      ]}
      width={560}
    >
      {loading ? (
        <div
          css={css`
            text-align: center;
            padding: 32px 0;
          `}
        >
          <Spin />
        </div>
      ) : (
        <NoticeListView notices={notices} showReadState />
      )}
    </Modal>
  );
};

export default NoticeHistoryModal;
