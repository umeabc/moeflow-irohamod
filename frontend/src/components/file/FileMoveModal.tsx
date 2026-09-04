import { Button, Modal, Select, Spin } from 'antd';
import React, { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { api } from '@/apis';
import {
  APIFileMoveResult,
  APIMoveTargetProject,
} from '@/apis/file';
import { File as MFile } from '@/interfaces';
import { FC } from '@/interfaces';

interface FileMoveModalProps {
  open: boolean;
  onClose: () => void;
  projectID: string;
  files: MFile[];
  onSaved?: (movedIds: string[]) => void;
}

const STATUS_LABEL_KEYS = {
  moved: 'file.moveStatusMoved',
  failed: 'file.moveStatusFailed',
  skipped: 'file.moveStatusSkipped',
} as const;

/** 图片移动：把勾选的图片批量移动到同一项目集下的其它项目 */
export const FileMoveModal: FC<FileMoveModalProps> = ({
  open,
  onClose,
  projectID,
  files,
  onSaved,
}) => {
  const { formatMessage } = useIntl();
  const [targetProjects, setTargetProjects] = useState<APIMoveTargetProject[]>([]);
  const [targetId, setTargetId] = useState<string | undefined>();
  const [results, setResults] = useState<APIFileMoveResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setResults(null);
      setTargetId(undefined);
      setLoading(true);
      api.file
        .getMoveTargetProjects({ projectID })
        .then((res) => {
          setTargetProjects(res.data ?? []);
        })
        .finally(() => setLoading(false));
    }
  }, [open, projectID]);

  const handleMove = async () => {
    if (!targetId) return;
    setSubmitting(true);
    try {
      const res = await api.file.moveFiles({
        projectID,
        data: { fileIds: files.map((f) => f.id), targetProjectId: targetId },
      });
      setResults(res.data ?? []);
      onSaved?.(
        (res.data ?? [])
          .filter((r) => r.status === 'moved')
          .map((r) => r.file_id),
      );
    } catch (e) {
      // 错误提示由 api 默认行为处理
    } finally {
      setSubmitting(false);
    }
  };

  const footer = results
    ? [
        <Button key="close" type="primary" onClick={onClose}>
          {formatMessage({ id: 'form.confirm' })}
        </Button>,
      ]
    : [
        <Button key="cancel" onClick={onClose}>
          {formatMessage({ id: 'form.cancel' })}
        </Button>,
        <Button
          key="ok"
          type="primary"
          disabled={!targetId || submitting}
          loading={submitting}
          onClick={handleMove}
        >
          {formatMessage({ id: 'file.moveConfirm' })}
        </Button>,
      ];

  return (
    <Modal
      title={formatMessage({ id: 'file.moveImages' })}
      open={open}
      onCancel={onClose}
      footer={footer}
    >
      {results ? (
        <ul>
          {results.map((r) => (
            <li key={r.file_id}>
              {r.name} - {formatMessage({ id: STATUS_LABEL_KEYS[r.status] })}
              {r.reason ? `（${r.reason}）` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div style={{ marginBottom: 8 }}>
            {formatMessage({ id: 'file.moveTargetProject' })}:
          </div>
          {loading ? (
            <Spin />
          ) : (
            <Select
              style={{ width: '100%' }}
              value={targetId}
              onChange={setTargetId}
              placeholder={formatMessage({ id: 'file.moveTargetPlaceholder' })}
              showSearch
              optionFilterProp="label"
            >
              {targetProjects.map((p) => (
                <Select.Option key={p.id} value={p.id} label={p.name}>
                  {p.name}
                </Select.Option>
              ))}
            </Select>
          )}
        </>
      )}
    </Modal>
  );
};
