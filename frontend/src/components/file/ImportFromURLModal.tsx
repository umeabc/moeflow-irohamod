import { css } from '@emotion/core';
import { Button, Input, message, Modal, Progress, Spin } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { api } from '@/apis';
import { File as MFile } from '@/interfaces';
import { FC } from '@/interfaces';
import style from '@/style';

interface ImportFromURLModalProps {
  open: boolean;
  onClose: () => void;
  projectID: string;
  source: 'twitter' | 'twitter_user' | 'bluesky' | 'bluesky_user' | 'pixiv' | 'pixiv_user' | 'external';
  onSaved?: () => void;
}

/**
 * 「从社交媒体获取图片」：输入 URL，由服务器下载图片直接导入项目。
 * source=twitter_user 走进度式导入：发起任务 -> 轮询进度显示
 *   「正在下载第 a/b 张图片，有 X 张可入库」。
 * 其余 source 一次性下载。
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
  // twitter_user 进度
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    imported: number;
    duplicated: number;
    failed: number;
    finished: boolean;
    error: string;
  } | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open) {
      setUrl('');
      setProgress(null);
    }
  }, [open]);

  // 组件卸载 / 关闭时停止轮询
  useEffect(() => {
    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, []);

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const pollProgress = (taskID: string) => {
    stopPolling();
    pollTimer.current = setInterval(async () => {
      try {
        const res = await api.file.getImportTaskProgress({ taskID });
        const data = res.data;
        setProgress(data);
        if (data.finished) {
          stopPolling();
          message.success(
            formatMessage(
              { id: 'file.importFromTwitterUserDone' },
              { imported: data.imported, dup: data.duplicated },
            ),
          );
          onSaved?.();
          onClose();
        }
      } catch {
        // 轮询失败静默，下次再试
      }
    }, 1500);
  };

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      message.warning(formatMessage({ id: 'file.importUrlRequired' }));
      return;
    }
    setSubmitting(true);
    try {
      if (
        source === 'twitter_user' ||
        source === 'pixiv_user' ||
        source === 'bluesky_user'
      ) {
        // 进度式：发起任务
        const res = await api.file.importFileFromUrl({
          projectID,
          data: { url: trimmed, source },
        });
        const start = res.data as unknown as { task_id: string; total: number };
        if (start && start.task_id) {
          setProgress({
            done: 0,
            total: start.total,
            imported: 0,
            duplicated: 0,
            failed: 0,
            finished: false,
            error: '',
          });
          pollProgress(start.task_id);
        } else {
          message.warning(formatMessage({ id: 'file.importUrlAllDuplicated' }));
          onSaved?.();
          onClose();
        }
      } else {
        // 一次性导入（原有逻辑）
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
      }
    } catch (e) {
      // 错误提示由 api 默认行为处理
    } finally {
      if (
        (source !== 'twitter_user' &&
          source !== 'pixiv_user' &&
          source !== 'bluesky_user') ||
        !progress
      ) {
        setSubmitting(false);
      }
    }
  };

  const titleId =
    source === 'twitter'
      ? 'file.importFromTwitter'
      : source === 'twitter_user'
        ? 'file.importFromTwitterUser'
        : source === 'bluesky'
          ? 'file.importFromBluesky'
          : source === 'bluesky_user'
            ? 'file.importFromBlueskyUser'
            : source === 'pixiv'
              ? 'file.importFromPixiv'
              : source === 'pixiv_user'
                ? 'file.importFromPixivUser'
                : 'file.importFromExternal';

  const tipId =
    source === 'twitter'
      ? 'file.importFromTwitterTip'
      : source === 'twitter_user'
        ? 'file.importFromTwitterUserTip'
        : source === 'bluesky'
          ? 'file.importFromBlueskyTip'
          : source === 'bluesky_user'
            ? 'file.importFromBlueskyUserTip'
            : source === 'pixiv'
              ? 'file.importFromPixivTip'
              : source === 'pixiv_user'
                ? 'file.importFromPixivUserTip'
                : 'file.importFromExternalTip';

  // 进度模式：正在下载第 a/b 张，有 X 张可入库
  const isProgressMode =
    (source === 'twitter_user' ||
      source === 'pixiv_user' ||
      source === 'bluesky_user') &&
    progress !== null &&
    !progress.finished;

  return (
    <Modal
      title={formatMessage({ id: titleId })}
      open={open}
      onCancel={() => {
        stopPolling();
        onClose();
      }}
      footer={
        isProgressMode
          ? null
          : [
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
            ]
      }
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
          {formatMessage({ id: tipId })}
        </div>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={formatMessage({ id: 'file.importUrlPlaceholder' })}
          onPressEnter={handleImport}
          disabled={submitting || isProgressMode}
        />
        {isProgressMode && progress && (
          <div
            css={css`
              display: flex;
              flex-direction: column;
              gap: 8px;
              .ImportFromURLModal__ProgressText {
                font-size: 13px;
              }
            `}
          >
            <div className="ImportFromURLModal__ProgressText">
              {formatMessage(
                { id: 'file.importFromTwitterUserProgress' },
                {
                  done: Math.min(progress.done, progress.total),
                  total: progress.total,
                  importable: Math.max(progress.total - progress.duplicated, 0),
                },
              )}
            </div>
            <Progress
              percent={
                progress.total > 0
                  ? Math.min(Math.round((progress.done / progress.total) * 100), 100)
                  : 0
              }
              status="active"
            />
            <div
              css={css`
                text-align: center;
              `}
            >
              <Spin size="small" />
            </div>
          </div>
        )}
        {submitting && !isProgressMode && (
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
