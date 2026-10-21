import { css } from '@emotion/core';
import { Button, Input, message, Modal, Progress, Spin } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { api } from '@/apis';
import { FC } from '@/interfaces';
import { AppState } from '@/store';
import style from '@/style';
import {
  parseUrlLines,
  extractErrorMessage,
  calcBatchSummary,
  BatchLineItem,
  BATCH_MAX_LINES,
} from './importFromURLHelpers';

interface ImportFromURLModalProps {
  open: boolean;
  onClose: () => void;
  projectID: string;
  source: 'twitter' | 'twitter_user' | 'bluesky' | 'bluesky_user' | 'pixiv' | 'pixiv_user' | 'external';
  onSaved?: () => void;
}

const isUserSource = (s: string) =>
  s === 'twitter_user' || s === 'pixiv_user' || s === 'bluesky_user';

/**
 * 「从社交媒体获取图片」：输入 URL，由服务器下载图片直接导入项目。
 * source=*_user 走进度式导入：发起任务 -> 轮询进度显示
 * 一次性来源（twitter/bluesky/pixiv/external）支持批量（TextArea）串行导入。
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

  // *_user 进度
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    imported: number;
    duplicated: number;
    failed: number;
    failures: Array<{
      index: number;
      filename?: string;
      step?: string;
      reason?: string;
    }>;
    finished: boolean;
    error: string;
  } | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollInFlightRef = useRef(false);
  const pollFailCountRef = useRef(0);
  const pollRunIdRef = useRef(0);
  const currentTaskIdRef = useRef<string>('');

  // 批量导入状态（一次性来源）
  const [batchLines, setBatchLines] = useState<BatchLineItem[]>([]);
  const runningRef = useRef(false);
  const platform = useSelector((state: AppState) => state.site.platform);
  const isMobile = platform === 'mobile';

  useEffect(() => {
    if (open) {
      setUrl('');
      setProgress(null);
      setBatchLines([]);
      runningRef.current = false;
      pollFailCountRef.current = 0;
      pollRunIdRef.current = 0;
    }
  }, [open]);

  // 组件卸载 / 关闭时停止轮询
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const pollProgress = (taskID: string, runId: number) => {
    stopPolling();
    pollTimerRef.current = setInterval(async () => {
      if (pollInFlightRef.current) {
        return; // 跳过未完成轮次
      }
      if (pollRunIdRef.current !== runId) {
        stopPolling();
        return;
      }
      pollInFlightRef.current = true;
      try {
        const res = await api.file.getImportTaskProgress({ taskID });
        const data = res.data;
        pollFailCountRef.current = 0;
        if (pollRunIdRef.current !== runId) {
          return;
        }
        setProgress(data);
        if (data.finished) {
          stopPolling();
          pollRunIdRef.current = 0;
          // 仅结算一次
          if (data.failed > 0 || data.error) {
            message.error(
              formatMessage(
                { id: 'file.importFromUserFailedDetail' },
                {
                  imported: data.imported,
                  dup: data.duplicated,
                  failed: data.failed,
                },
              ),
              6,
            );
            setSubmitting(false);
            onSaved?.();
          } else {
            message.success(
              formatMessage(
                { id: 'file.importFromTwitterUserDone' },
                { imported: data.imported, dup: data.duplicated },
              ),
            );
            onSaved?.();
            onClose();
          }
        }
      } catch {
        pollFailCountRef.current += 1;
        if (pollFailCountRef.current >= 3) {
          stopPolling();
          // 不结束 submitting，展示重试按钮
        }
      } finally {
        pollInFlightRef.current = false;
      }
    }, 1500);
  };

  const retryPollProgress = (taskID: string, runId: number) => {
    pollFailCountRef.current = 0;
    pollProgress(taskID, runId);
  };

  // *_user 单行导入（旧逻辑保留）
  const handleUserImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      message.warning(formatMessage({ id: 'file.importUrlRequired' }));
      return;
    }
    // 检查换行
    if (/\r?\n/.test(trimmed)) {
      message.warning(formatMessage({ id: 'file.importUserSingleOnly' }));
      return;
    }
    if (runningRef.current) return;
    runningRef.current = true;
    setSubmitting(true);
    try {
      const res = await api.file.importFileFromUrl({
        projectID,
        data: { url: trimmed, source },
      });
      const start = res.data as unknown as { task_id: string; total: number };
      if (!start || !start.task_id) {
        message.warning(formatMessage({ id: 'file.importTaskStartInvalid' }));
        setSubmitting(false);
        runningRef.current = false;
        return;
      }
      const runId = ++pollRunIdRef.current;
      currentTaskIdRef.current = start.task_id;
      setProgress({
        done: 0,
        total: start.total,
        imported: 0,
        duplicated: 0,
        failed: 0,
        failures: [],
        finished: false,
        error: '',
      });
      pollProgress(start.task_id, runId);
    } catch (e) {
      if (e && typeof (e as { default?: () => void }).default === 'function') {
        (e as { default: () => void }).default();
      }
      setSubmitting(false);
      runningRef.current = false;
    }
  };

  // 批量导入（一次性来源）
  const handleBatchImport = async () => {
    const parsed = parseUrlLines(url);
    if (parsed.error) {
      message.warning(
        formatMessage(
          { id: parsed.error },
          parsed.errorParams || {},
        ),
      );
      return;
    }
    if (runningRef.current) return;
    runningRef.current = true;
    setSubmitting(true);

    const lines = parsed.lines;
    setBatchLines(lines);

    let anyRequestMade = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.status === 'failed') {
        continue; // 格式错误，跳过
      }
      setBatchLines((prev) =>
        prev.map((l, idx) => (idx === i ? { ...l, status: 'running' as const } : l)),
      );
      anyRequestMade = true;
      try {
        const res = await api.file.importFileFromUrl({
          projectID,
          data: { url: line.url, source },
        });
        const data = res.data as { files: string[]; duplicated: string[] };
        const importedCount = data.files?.length ?? 0;
        const dupCount = data.duplicated?.length ?? 0;
        setBatchLines((prev) =>
          prev.map((l, idx) =>
            idx === i
              ? {
                  ...l,
                  status: 'completed' as const,
                  imported: importedCount,
                  duplicated: dupCount,
                }
              : l,
          ),
        );
      } catch (e: unknown) {
        const errMsg = extractErrorMessage(e);
        setBatchLines((prev) =>
          prev.map((l, idx) =>
            idx === i
              ? { ...l, status: 'failed' as const, error: errMsg }
              : l,
          ),
        );
      }
    }

    // 整批结束
    setSubmitting(false);
    runningRef.current = false;

    // 读取最终 lines 计算汇总
    setBatchLines((finalLines) => {
      const summary = calcBatchSummary(finalLines);
      // 至多一条 toast
      if (
        summary.imported === 0 &&
        summary.duplicated === 0 &&
        summary.failed === finalLines.length
      ) {
        // 全失败不额外 toast（已有逐行展示）
      } else if (summary.imported === 0 && summary.duplicated === 0) {
        // files 与 duplicated 均空
        message.warning(formatMessage({ id: 'file.importBatchEmptyResult' }));
      } else {
        message.open({
          type: 'success',
          key: 'importFromURLBatchSummary',
          content: formatMessage(
            { id: 'file.importBatchSummary' },
            {
              imported: summary.imported,
              duplicated: summary.duplicated,
              failed: summary.failed,
            },
          ),
          duration: 4,
        });
      }
      return finalLines;
    });

    // 有请求过就刷新
    if (anyRequestMade) {
      onSaved?.();
    }
  };

  const handleImport = () => {
    if (isUserSource(source)) {
      handleUserImport();
    } else {
      handleBatchImport();
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

  // 进度模式（*_user 执行中）
  const isProgressMode = isUserSource(source) && progress !== null && !progress.finished;
  const isBatchMode = !isUserSource(source);

  const doneCount = batchLines.filter(
    (l) => l.status === 'completed' || l.status === 'failed',
  ).length;

  // 轮询连败 ≥3 次
  const showRetryProgress =
    isUserSource(source) &&
    progress !== null &&
    !progress.finished &&
    pollFailCountRef.current >= 3;

  return (
    <Modal
      title={formatMessage({ id: titleId })}
      open={open}
      onCancel={() => {
        stopPolling();
        onClose();
      }}
      maskClosable={!isProgressMode}
      keyboard={!isProgressMode}
      footer={
        isProgressMode
          ? null
          : [
              <Button
                key="cancel"
                onClick={onClose}
                disabled={submitting}
              >
                {formatMessage({ id: 'form.cancel' })}
              </Button>,
              <Button
                key="ok"
                type="primary"
                loading={submitting}
                disabled={submitting}
                onClick={handleImport}
              >
                {batchLines.length > 0 && doneCount === batchLines.length
                  ? formatMessage({ id: 'file.importFinishedClose' })
                  : formatMessage({ id: 'form.confirm' })}
              </Button>,
            ]
      }
      css={css`
        /* 移动端自适应 */
        max-width: ${isMobile ? 'calc(100vw - 24px)' : '520px'};
        .ant-modal-body {
          max-height: ${isMobile ? '65vh' : '70vh'};
          overflow-y: auto;
        }
      `}
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
        {isBatchMode ? (
          <>
            <Input.TextArea
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={formatMessage({ id: 'file.importBatchPlaceholder' })}
              disabled={submitting || batchLines.length > 0}
              autoSize={
                isMobile
                  ? { minRows: 3, maxRows: 6 }
                  : { minRows: 4, maxRows: 8 }
              }
            />
            <div
              css={css`
                font-size: 12px;
                color: ${style.textColorSecondary};
              `}
            >
              {formatMessage(
                { id: 'file.importBatchTip' },
                { max: BATCH_MAX_LINES },
              )}
            </div>
          </>
        ) : (
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={formatMessage({ id: 'file.importUrlPlaceholder' })}
            disabled={submitting || isProgressMode}
          />
        )}

        {/* *_user 进度条 */}
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
            {showRetryProgress && (
              <div
                css={css`
                  text-align: center;
                `}
              >
                <div
                  css={css`
                    font-size: 12px;
                    color: ${style.textColorSecondary};
                    margin-bottom: 8px;
                  `}
                >
                  {formatMessage({ id: 'file.importTaskProgressUnavailable' })}
                </div>
                <Button
                  size="small"
                  onClick={() => {
                    if (currentTaskIdRef.current) {
                      retryPollProgress(currentTaskIdRef.current, pollRunIdRef.current);
                    }
                  }}
                >
                  {formatMessage({ id: 'file.importTaskRetryProgress' })}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* 批量导入结果 */}
        {batchLines.length > 0 && (
          <div
            css={css`
              display: flex;
              flex-direction: column;
              gap: 6px;
              max-height: ${isMobile ? '40vh' : '50vh'};
              overflow-y: auto;
              padding: 8px;
              border: 1px solid ${style.borderColorLight};
              border-radius: 4px;
              background: var(--moeflow-surface);
              .ImportFromURLModal__BatchHeader {
                font-size: 13px;
                font-weight: 600;
                color: ${style.textColor};
                margin-bottom: 4px;
              }
              .ImportFromURLModal__BatchLine {
                font-size: 12px;
                padding: 4px 0;
                border-bottom: 1px solid ${style.borderColorLight};
                &:last-child {
                  border-bottom: none;
                }
              }
              .ImportFromURLModal__BatchLineUrl {
                color: ${style.textColorSecondary};
                overflow-wrap: anywhere;
                margin-bottom: 2px;
              }
              .ImportFromURLModal__BatchLineStatus {
                color: ${style.textColor};
              }
              .ImportFromURLModal__BatchLineStatusPending {
                color: ${style.textColorSecondary};
              }
              .ImportFromURLModal__BatchLineStatusRunning {
                color: ${style.primaryColor};
              }
              .ImportFromURLModal__BatchLineStatusCompleted {
                color: #52c41a;
              }
              .ImportFromURLModal__BatchLineStatusFailed {
                color: ${style.errorColor};
              }
            `}
          >
            <div className="ImportFromURLModal__BatchHeader">
              {formatMessage(
                { id: 'file.importBatchProgress' },
                { done: doneCount, total: batchLines.length },
              )}
            </div>
            {batchLines.map((line, idx) => (
              <div key={idx} className="ImportFromURLModal__BatchLine">
                <div className="ImportFromURLModal__BatchLineUrl">
                  {`#${line.lineNo}: `}
                  {line.url}
                </div>
                <div
                  className={`ImportFromURLModal__BatchLineStatus ImportFromURLModal__BatchLineStatus${
                    line.status.charAt(0).toUpperCase() + line.status.slice(1)
                  }`}
                >
                  {line.status === 'pending' &&
                    formatMessage({ id: 'file.importBatchPending' })}
                  {line.status === 'running' &&
                    formatMessage({ id: 'file.importBatchRunning' })}
                  {line.status === 'completed' &&
                    formatMessage(
                      { id: 'file.importBatchLineResult' },
                      {
                        line: line.lineNo,
                        imported: line.imported,
                        duplicated: line.duplicated,
                      },
                    )}
                  {line.status === 'failed' &&
                    formatMessage(
                      { id: 'file.importBatchLineFailed' },
                      { line: line.lineNo, reason: line.error || '' },
                    )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* *_user 失败明细（保留原有展示） */}
        {progress &&
          progress.finished &&
          (progress.failed > 0 || progress.error) && (
            <div
              css={css`
                display: flex;
                flex-direction: column;
                gap: 6px;
                padding: 10px;
                border: 1px solid #ffccc7;
                background: #fff2f0;
                border-radius: 4px;
                max-height: 200px;
                overflow-y: auto;
                .ImportFromURLModal__FailTitle {
                  font-size: 13px;
                  font-weight: 600;
                  color: #cf1322;
                }
                .ImportFromURLModal__FailItem {
                  font-size: 12px;
                  color: #555;
                }
              `}
            >
              <div className="ImportFromURLModal__FailTitle">
                {formatMessage(
                  { id: 'file.importFromUserFailedTitle' },
                  { failed: progress.failed },
                )}
              </div>
              {progress.error && (
                <div className="ImportFromURLModal__FailItem">
                  {formatMessage({ id: 'file.importFromUserFailedOverall' })}：
                  {progress.error}
                </div>
              )}
              {(progress.failures || []).map((f) => (
                <div key={f.index} className="ImportFromURLModal__FailItem">
                  <span>
                    {formatMessage({ id: 'file.importFromUserFailedNo' })}
                    {f.index}
                  </span>
                  {f.filename ? `（${f.filename}）` : ''}
                  {'：'}
                  {f.step === 'download'
                    ? formatMessage({ id: 'file.importFromUserFailedStepDownload' })
                    : f.step === 'import'
                      ? formatMessage({ id: 'file.importFromUserFailedStepImport' })
                      : ''}
                  {' - '}
                  {f.reason || ''}
                </div>
              ))}
            </div>
          )}
        {submitting && !isProgressMode && batchLines.length === 0 && (
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
