import { css } from '@emotion/core';
import { Button, Input, message, Modal, Spin } from 'antd';
import React, { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { api } from '@/apis';
import { File as MFile } from '@/interfaces';
import { FC } from '@/interfaces';
import style from '@/style';

interface ImportFromURLModalProps {
  open: boolean;
  onClose: () => void;
  projectID: string;
  source: 'twitter' | 'twitter_user' | 'bluesky' | 'pixiv' | 'external';
  onSaved?: () => void;
}

/**
 * 「从社交媒体获取图片」：输入 URL，由服务器下载图片直接导入项目。
 * source=twitter 用 X(Twitter) 推文地址；source=external 用直接图片链接。
 */
export const ImportFromURLModal: FC<ImportFromURLModalProps> = ({
  open,
  onClose,
  projectID,
  source,
  onSaved,
}) => {
  const { formatMessage } = useIntl();
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setUrl('');
    }
  }, [open]);

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      message.warning(formatMessage({ id: 'file.importUrlRequired' }));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.file.importFileFromUrl({
        projectID,
        data: { url: trimmed, source },
      });
      const data = res.data as { files: MFile[]; duplicated: string[] };
      const importedCount = data.files?.length ?? 0;
      const dupCount = data.duplicated?.length ?? 0;
      if (importedCount > 0 && dupCount > 0) {
        message.success(
          formatMessage(
            { id: 'file.importUrlPartial' },
            { count: importedCount, dup: dupCount },
          ),
        );
      } else if (importedCount > 0) {
        message.success(
          formatMessage(
            { id: 'file.importUrlSuccessMulti' },
            { count: importedCount },
          ),
        );
      } else if (dupCount > 0) {
        message.warning(
          formatMessage({ id: 'file.importUrlAllDuplicated' }),
        );
      }
      onSaved?.();
      onClose();
    } catch (e) {
      // 错误提示由 api 默认行为处理
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={formatMessage({
        id:
          source === 'twitter'
            ? 'file.importFromTwitter'
            : source === 'twitter_user'
              ? 'file.importFromTwitterUser'
              : source === 'bluesky'
                ? 'file.importFromBluesky'
                : source === 'pixiv'
                  ? 'file.importFromPixiv'
                  : 'file.importFromExternal',
      })}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {formatMessage({ id: 'form.cancel' })}
        </Button>,
        <Button
          key="ok"
          type="primary"
          loading={submitting}
          onClick={handleImport}
        >
          {formatMessage({ id: 'form.confirm' })}
        </Button>,
      ]}
    >
      <div
        css={css`
          display: flex;
          flex-direction: column;
          gap: 12px;
          .ImportFromURLModal__Tip {
            font-size: 13px;
            color: ${style.textColorSecondary};
            word-break: break-all;
          }
        `}
      >
        <div className="ImportFromURLModal__Tip">
          {formatMessage({
            id:
              source === 'twitter'
                ? 'file.importFromTwitterTip'
                : source === 'twitter_user'
                  ? 'file.importFromTwitterUserTip'
                  : source === 'bluesky'
                    ? 'file.importFromBlueskyTip'
                    : source === 'pixiv'
                      ? 'file.importFromPixivTip'
                      : 'file.importFromExternalTip',
          })}
        </div>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={formatMessage({ id: 'file.importUrlPlaceholder' })}
          onPressEnter={handleImport}
          disabled={submitting}
        />
        {submitting && (
          <div
            css={css`
              text-align: center;
            `}
          >
            <Spin size="small" />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ImportFromURLModal;
