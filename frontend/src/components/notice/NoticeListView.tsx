import { css } from '@emotion/core';
import { Empty, Tag, Typography } from 'antd';
import React from 'react';
import { useIntl } from 'react-intl';
import { APINotice } from '@/apis/notice';
import { FC } from '@/interfaces';
import style from '@/style';

const { Paragraph, Text } = Typography;

interface NoticeListViewProps {
  notices: APINotice[];
  /** 是否显示已读/未读标记（通知一览） */
  showReadState?: boolean;
  loading?: boolean;
}

/**
 * 通知列表展示（纯文本多行），登录弹窗与通知一览共用
 */
export const NoticeListView: FC<NoticeListViewProps> = ({
  notices,
  showReadState = false,
}) => {
  const { formatMessage } = useIntl();
  if (notices.length === 0) {
    return (
      <Empty
        css={css`
          margin: 24px 0;
        `}
        description={formatMessage({ id: 'notice.empty' })}
      />
    );
  }
  return (
    <div
      css={css`
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-height: 55vh;
        overflow-y: auto;
      `}
    >
      {notices.map((notice) => (
        <div
          key={notice.id}
          css={css`
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 12px 14px;
            border: 1px solid ${style.borderColorLight};
            border-radius: 8px;
            background: var(--moeflow-surface);
            ${!notice.read && showReadState
              ? `border-color: ${style.primaryColor};`
              : ''}
          `}
        >
          <div
            css={css`
              display: flex;
              align-items: center;
              gap: 8px;
            `}
          >
            {notice.title && (
              <Text strong css={css`font-size: 14px;`}>
                {notice.title}
              </Text>
            )}
            {showReadState &&
              (notice.read ? (
                <Tag color="default">
                  {formatMessage({ id: 'notice.read' })}
                </Tag>
              ) : (
                <Tag color="processing">
                  {formatMessage({ id: 'notice.unread' })}
                </Tag>
              ))}
          </div>
          <Paragraph
            css={css`
              margin-bottom: 0 !important;
              white-space: pre-wrap;
              word-break: break-word;
              font-size: 13px;
              color: ${style.textColor};
            `}
          >
            {notice.content}
          </Paragraph>
          {notice.createTime && (
            <Text
              type="secondary"
              css={css`
                font-size: 12px;
              `}
            >
              {formatMessage({ id: 'notice.publishAt' })}:{' '}
              {new Date(notice.createTime).toLocaleString()}
            </Text>
          )}
        </div>
      ))}
    </div>
  );
};
