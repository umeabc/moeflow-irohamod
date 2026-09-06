import { css } from '@emotion/core';
import React, { useEffect, useState } from 'react';
import { useTitle } from '@/hooks';
import { FC, File } from '@/interfaces';
import apis from '@/apis';
import {
  FileNotExistReasons,
  FileSafeStatuses,
  FILE_NOT_EXIST_REASON,
  FILE_SAFE_STATUS,
} from '@/constants';
import { toLowerCamelCase } from '@/utils';
import classNames from 'classnames';
import { Button, Pagination, Radio, Spin } from 'antd';
import { useIntl } from 'react-intl';
import style from '@/style';

/** 图片安全检查页面的属性接口 */
interface AdminImageSafeCheckProps {
  className?: string;
}
/**
 * 图片安全检查页面
 */
export const AdminImageSafeCheck: FC<AdminImageSafeCheckProps> = ({
  className,
}) => {
  const { formatMessage } = useIntl();
  useTitle(); // 设置标题
  const [files, setFiles] = useState<File[]>();
  const pageSize = 40;
  const [safeFileIDs, setSafeFileIDs] = useState<string[]>([]);
  const [unsafeFileIDs, setUnsafeFileIDs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pendingStatus: FileSafeStatuses[] = [
    FILE_SAFE_STATUS.NEED_HUMAN_CHECK,
    FILE_SAFE_STATUS.QUEUING,
    FILE_SAFE_STATUS.WAIT_RESULT,
    FILE_SAFE_STATUS.NEED_MACHINE_CHECK,
  ];
  const [safeStatus, setSafeStatus] =
    useState<FileSafeStatuses[]>(pendingStatus);

  const toggle = (id: string) => {
    if (safeFileIDs.includes(id)) {
      setSafeFileIDs((ids) => ids.filter((i) => i !== id));
      setUnsafeFileIDs((ids) => [...ids, id]);
    } else {
      setUnsafeFileIDs((ids) => ids.filter((i) => i !== id));
      setSafeFileIDs((ids) => [...ids, id]);
    }
  };

  const getFileNotExistReasonText = (id: FileNotExistReasons): string => {
    if (id === FILE_NOT_EXIST_REASON.BLOCK) return '屏蔽';
    if (id === FILE_NOT_EXIST_REASON.NOT_UPLOAD) return '待上传';
    if (id === FILE_NOT_EXIST_REASON.FINISH) return '完结';
    return '未知';
  };

  const safeCheck = () => {
    setSubmitting(true);
    apis
      .adminSafeCheck({ safeFileIDs, unsafeFileIDs })
      .then(() => {
        fetchAdminFiles({ page: 1, safeStatus });
        setSubmitting(false);
      });
  };

  const fetchAdminFiles = ({ page, safeStatus }: { page: number; safeStatus: FileSafeStatuses[] }) => {
    setLoading(true);
    apis
      .adminGetFiles({ params: { safeStatus, page, limit: pageSize } })
      .then((result) => {
        const data = toLowerCamelCase(result.data);
        setPage(page);
        setFiles(data);
        setSafeFileIDs(data.map((d) => d.id));
        setUnsafeFileIDs([]);
        setTotal(result.headers['x-pagination-count']);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchAdminFiles({ page: 1, safeStatus });
    // eslint-disable-next-line
  }, []);

  return (
    <div className={classNames('AdminImageSafeCheck', className)} css={css`
      width: 100%;
      .AdminImageSafeCheck__Top { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid ${style.borderColorLight}; }
      .AdminImageSafeCheck__Images { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; padding: 20px 0; }
      .AdminImageSafeCheck__Image { min-width: 0; aspect-ratio: 4 / 5; display: flex; align-items: center; justify-content: center; border: 2px solid ${style.borderColorBase}; border-radius: ${style.borderRadiusBase}; overflow: hidden; background: repeating-linear-gradient(45deg, ${style.backgroundColorLight}, ${style.backgroundColorLight} 15px, var(--moeflow-surface2) 0, var(--moeflow-surface2) 30px); cursor: pointer; }
      .AdminImageSafeCheck__Image:focus-visible { outline: 3px solid ${style.primaryColor}; outline-offset: 2px; }
      .AdminImageSafeCheck__Image img { width: 100%; height: 100%; object-fit: contain; }
      .AdminImageSafeCheck__Image--safe { border-color: ${style.successColor}; }
      .AdminImageSafeCheck__Image--unsafe { border-color: ${style.errorColor}; }
      .AdminImageSafeCheck__Bottom { display: flex; align-items: center; gap: 16px; padding-top: 16px; border-top: 1px solid ${style.borderColorLight}; }
      .AdminImageSafeCheck__SubmitButton { flex: 1; }
      @media (max-width: 600px) { .AdminImageSafeCheck__Images { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } .AdminImageSafeCheck__Top { align-items: flex-start; flex-direction: column; gap: 10px; } .AdminImageSafeCheck__Bottom { align-items: stretch; flex-direction: column; } }
    `}>
      <div className="AdminImageSafeCheck__Top">
        <Radio.Group
          options={[{ label: 'Pending', value: 'pending' }, { label: 'Safe', value: 'safe' }, { label: 'Unsafe', value: 'unsafe' }]}
          defaultValue="pending"
          onChange={(e) => {
            let nextStatus = pendingStatus;
            switch (e.target.value) {
              case 'safe': nextStatus = [FILE_SAFE_STATUS.SAFE]; setSafeStatus(nextStatus); fetchAdminFiles({ page: 1, safeStatus: nextStatus }); break;
              case 'unsafe': nextStatus = [FILE_SAFE_STATUS.BLOCK]; setSafeStatus(nextStatus); fetchAdminFiles({ page: 1, safeStatus: nextStatus }); break;
              default: setSafeStatus(pendingStatus); fetchAdminFiles({ page: 1, safeStatus: pendingStatus });
            }
          }}
        />
      </div>
      <div className="AdminImageSafeCheck__Images">
        {loading ? <Spin /> : files?.map((file) => (
          <div key={file.id} role="button" tabIndex={0} aria-label={`${file.name} ${file.safeStatus === FILE_SAFE_STATUS.SAFE ? 'safe' : 'unsafe'}`} className={classNames('AdminImageSafeCheck__Image', { 'AdminImageSafeCheck__Image--safe': file.safeStatus === FILE_SAFE_STATUS.SAFE, 'AdminImageSafeCheck__Image--unsafe': unsafeFileIDs.includes(file.id) || file.safeStatus === FILE_SAFE_STATUS.BLOCK })} onClick={() => toggle(file.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(file.id); } }}>
            {file.saveName ? <img src={file.safeCheckUrl} alt={file.name} /> : <div>文件不存在（{getFileNotExistReasonText(file.fileNotExistReason)}）</div>}
          </div>
        ))}
      </div>
      <div className="AdminImageSafeCheck__Bottom">
        <Pagination current={page} onChange={(nextPage) => fetchAdminFiles({ page: nextPage, safeStatus })} defaultPageSize={pageSize} showSizeChanger={false} total={total} />
        {safeStatus.includes(FILE_SAFE_STATUS.BLOCK) || <Button type="primary" className="AdminImageSafeCheck__SubmitButton" onClick={safeCheck} loading={submitting}>{formatMessage({ id: 'form.submit' })}</Button>}
      </div>
    </div>
  );
};
