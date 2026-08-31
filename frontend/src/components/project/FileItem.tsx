import { css } from '@emotion/core';
import { Checkbox } from 'antd';
import classNames from 'classnames';
import { useIntl } from 'react-intl';
import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Icon } from '@/components';
import { FileUploadProgress } from './FileUploadProgress';
import { api } from '@/apis';
import { TranslationProgress } from '@/components/shared/TranslationProgress';
import { ImageOCRProgress } from '@/components/unused/ImageOCRProgress';
import { TranslationUser } from '@/components/project-file/markers/TranslationUser';
import {
  FILE_NOT_EXIST_REASON,
  FILE_SAFE_STATUS,
  IMAGE_COVER,
} from '@/constants';
import { FC, File } from '@/interfaces';
import style from '@/style';
import { AppState } from '@/store';
import { cardClickEffect, clickEffect } from '@/utils/style';

/** 文件条目的属性接口 */
interface FileItemProps {
  file: File;
  projectID: string;
  roleSystemCode?: string;
  isAdmin?: boolean;
  hasTarget: boolean;
  onClick?: () => void;
  selectVisible?: boolean;
  selected?: boolean;
  onSelect?: (value: boolean) => void;
  deleteButtonVisible?: boolean;
  onDeleteButtonClick?: () => void;
  className?: string;
}

const width = IMAGE_COVER.WIDTH;
const height = 268;
const imageHeight = IMAGE_COVER.HEIGHT;

const fileItemStyle = css`
  position: relative;
  width: ${width}px;
  height: ${height}px;
  border-radius: ${style.borderRadiusBase};
  overflow: hidden;
  transition:
    box-shadow 100ms,
    border-color 100ms;
  border: 1px solid ${style.borderColorLight};
  &.FileItem--typeset { border-color: #52c41a; box-shadow: 0 0 0 2px rgba(82,196,26,0.3); }
  .FileItem__ImageOCRProgressWrapper {
    display: none;
    position: absolute;
    top: ${imageHeight - 17}px;
    left: 6px;
    padding: 3px 5px;
    background-color: rgba(255, 255, 255, 0.8);
    border-radius: 4px;
    border: 1px solid #fff;
  }
  .FileItem__ImageWrapper {
    display: block;
    width: ${width - 2}px;
    height: ${imageHeight}px;
    overflow: hidden;
  }
  .FileItem__Image {
    display: block;
    width: ${width - 2}px;
    height: ${imageHeight}px;
    transition: transform 400ms;
    user-select: none;
    /* 禁止 iOS 上 Safari/Chrome/Firefox，重按/长按图片弹出菜单 */
    -webkit-touch-callout: none;
  }
  .FileItem__ImageTip {
    width: 100%;
    height: 100%;
    padding: 20px 10px;
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
    background-color: #f3f3f3;
    font-weight: bold;
  }
  .FileItem__Name {
    font-size: 14px;
    line-height: 18px;
  }
  .FileItem__SelectWrapper {
    position: absolute;
    top: 0;
    left: 0;
    width: 36px;
    height: 36px;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: ${style.borderRadiusBase} 0 ${style.borderRadiusBase} 0;
    background-color: rgba(0, 0, 0, 0.04);
    ${clickEffect(
      css`
        background-color: rgba(0, 0, 0, 0.2);
      `,
      css`
        background-color: rgba(0, 0, 0, 0.4);
      `,
    )};
  }
  .FileItem__Select {
    padding: 7px 10px;
  }
  .FileItem__DeleteButton {
    position: absolute;
    top: 0;
    right: 0;
    width: 36px;
    height: 36px;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 0 ${style.borderRadiusBase} 0 ${style.borderRadiusBase};
    background-color: rgba(0, 0, 0, 0.04);
    ${clickEffect(
      css`
        background-color: rgba(0, 0, 0, 0.2);
      `,
      css`
        background-color: rgba(0, 0, 0, 0.4);
      `,
    )};
  }
  .FileItem__DeleteButtonIcon {
    width: 18px;
    height: 18px;
    color: rgba(255, 255, 255, 0.8);
  }
  .FileItem__Info {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    height: ${height - imageHeight - 2}px;
    padding: 8px 10px;
    gap: 7px;
  }
  .FileItem__Name {
    height: 20px;
    line-height: 20px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .FileItem__Roles {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0;
    .TranslationUser {
      min-height: 15px;
      & .TranslationUser__TypeIcon {
        margin-right: 3px;
      }
      & .TranslationUser__UserName {
        margin-right: 4px;
      }
    }
  }
  ${cardClickEffect()};
  ${clickEffect(
    css`
      .FileItem__Image {
        transform: scale(1.1);
      }
    `,
    css`
      .FileItem__Image {
        transform: scale(1.08);
        transition: transform 100ms;
      }
    `,
  )};
`;

/** 单个角色的可选成员下拉 */
const RoleEditField: FC<{
  iconType: 'translation' | 'proofread' | 'typesetter';
  label: string;
  value?: string;
  fileID: string;
  field: 'translator' | 'proofreader' | 'typesetter';
  canEdit: boolean;
}> = ({ iconType, label, value, fileID, field, canEdit }) => {
  const { formatMessage } = useIntl();
  const [editing, setEditing] = useState(false);
  const roleText = value || '';

  const save = (text: string) => {
    setEditing(false);
    const finalText = text.trim();
    if (finalText === (value || '')) {
      return; // 未变化
    }
    api.file
      .editFile({ id: fileID, data: { [field]: finalText || undefined } as any })
      .catch(() => {
        // 忽略
      });
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      css={css`
        display: flex; align-items: center; min-height: 16px; flex-wrap: wrap; font-size: 12px; line-height: 1.2;
        color: ${style.textColorSecondary};
        margin: -1px 0;
        &:not(:last-child) { margin-bottom: -1px; }
        .RoleEditField__Value { cursor: pointer; color: ${style.primaryColor}; &:hover { text-decoration: underline; } }
        .RoleEditField__Input { flex: 1; min-width: 60px; font-size: 12px; border: 1px solid ${style.borderColorLight}; border-radius: 4px; padding: 1px 4px; outline: none; &:focus { border-color: ${style.primaryColor}; } }
      `}>
      <TranslationUser iconType={iconType} name={label} />
      {editing ? (
        <input
          className="RoleEditField__Input"
          autoFocus
          defaultValue={roleText}
          placeholder={label}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') save((e.target as HTMLInputElement).value);
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={(e) => save(e.target.value)}
        />
      ) : (
        <span
          className="RoleEditField__Value"
          onClick={(e) => {
            e.stopPropagation();
            if (canEdit) {
              setEditing(true);
            }
          }}
        >
          {roleText ? `: ${roleText}` : ': -'}
        </span>
      )}
    </div>
  );
};

/**
 * 文件条目
 */
export const FileItem: FC<FileItemProps> = ({
  file,
  projectID,
  roleSystemCode,
  isAdmin = false,
  hasTarget,
  onClick,
  selectVisible = false,
  selected = false,
  onSelect,
  deleteButtonVisible = false,
  onDeleteButtonClick,
  className,
}) => {
  // 角色权限矩阵:根据项目角色确定可编辑字段
  let canEditTranslator = false;
  let canEditProofreader = false;
  let canEditTypesetter = false;
  if (isAdmin || ['creator', 'admin', 'coordinator'].includes(roleSystemCode || '')) {
    canEditTranslator = canEditProofreader = canEditTypesetter = true;
  } else if (['translator', 'proofreader'].includes(roleSystemCode || '')) {
    canEditTranslator = canEditProofreader = true;
  } else if (roleSystemCode === 'picture_editor') {
    canEditTypesetter = true;
  }
  const { formatMessage } = useIntl(); // i18n
  const currentUser = useSelector((state: AppState) => state.user);
  const sourceCount = file.sourceCount;
  const translatedSourceCount = hasTarget
    ? file.fileTargetCache!.translatedSourceCount
    : file.translatedSourceCount;
  const checkedSourceCount = hasTarget
    ? file.fileTargetCache!.checkedSourceCount
    : file.checkedSourceCount;

  return (
    <div
      className={classNames(['FileItem', className], { 'FileItem--typeset': Boolean(file.typesetter) })}
      css={fileItemStyle}
      onClick={onClick}
    >
      <div className="FileItem__ImageWrapper">
        {file.coverUrl === 'generating' ? (
          <div className="FileItem__ImageTip">
            {formatMessage({ id: 'file.generating' })}
          </div>
        ) : file.safeStatus === FILE_SAFE_STATUS.BLOCK ? (
          <div className="FileItem__ImageTip">
            {formatMessage({ id: 'file.blockTip' })}
          </div>
        ) : file.fileNotExistReason === FILE_NOT_EXIST_REASON.NOT_UPLOAD ? (
          <div className="FileItem__ImageTip">
            {formatMessage({ id: 'file.needUploadTip' })}
          </div>
        ) : (
          <img
            className="FileItem__Image"
            alt={file.name}
            src={file.coverUrl}
            draggable={false} // 禁止浏览器拖拽图片
            onDragStart={(e) => e.preventDefault()} // 禁止 Firefox 拖拽图片（Firefox 仅 drageable={false} 无效）
            onContextMenu={(e) => e.preventDefault()} // 禁止鼠标右键菜单 和 Android 上 Chrome/Firefox，重按/长按图片弹出菜单
          />
        )}
      </div>
      {selectVisible && (
        <div
          className="FileItem__SelectWrapper"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <Checkbox
            className="FileItem__Select"
            checked={selected}
            onChange={(e) => {
              onSelect?.(e.target.checked);
            }}
          ></Checkbox>
        </div>
      )}
      {deleteButtonVisible && (
        <div
          className="FileItem__DeleteButton"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteButtonClick?.();
          }}
        >
          <Icon className="FileItem__DeleteButtonIcon" icon="times" />
        </div>
      )}
      <div className="FileItem__Info">
        <div className="FileItem__Name">{file.name}</div>

        <div className="FileItem__Roles">
          <RoleEditField iconType="translation" label="翻译" value={file.translator} fileID={file.id} field="translator" canEdit={canEditTranslator} />
          <RoleEditField iconType="proofread" label="校对" value={file.proofreader} fileID={file.id} field="proofreader" canEdit={canEditProofreader} />
          <RoleEditField iconType="typesetter" label="嵌字" value={file.typesetter} fileID={file.id} field="typesetter" canEdit={canEditTypesetter} />
        </div>

        {file.uploading ? (
          <FileUploadProgress file={file} />
        ) : (
          <>
            <TranslationProgress
              className="FileItem__TranslationProgressText"
              sourceCount={sourceCount}
              translatedSourceCount={translatedSourceCount}
              checkedSourceCount={checkedSourceCount}
              type="text"
            />
            <TranslationProgress
              className="FileItem__TranslationProgressLine"
              sourceCount={sourceCount}
              translatedSourceCount={translatedSourceCount}
              checkedSourceCount={checkedSourceCount}
              type="line"
            />
          </>
        )}
      </div>
      <div className="FileItem__ImageOCRProgressWrapper">
        <ImageOCRProgress
          className="FileItem__ImageOCRProgress"
          parseStatus={file.parseStatus}
          parseStatusName={file.parseStatusDetailName}
          parseErrorTypeDetailName={file.parseErrorTypeDetailName}
          percent={file.imageOcrPercent}
          percentName={file.imageOcrPercentDetailName}
        />
      </div>
    </div>
  );
};
