import { css } from '@emotion/core';
import { Checkbox, message } from 'antd';
import classNames from 'classnames';
import { useIntl } from 'react-intl';
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
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
import { toLowerCamelCase } from '@/utils';
import { cardClickEffect, clickEffect } from '@/utils/style';
import { extractErrorMessage } from '@/components/file/importFromURLHelpers';

/** patch 对象：只需 id 必填，其余字段可选（partial 更新防覆盖） */
type FilePatch = Pick<File, 'id'> & Partial<File>;

/** 文件条目的属性接口 */
interface FileItemProps {
  file: File;
  projectID: string;
  roleSystemCode?: string;
  isAdmin?: boolean;
  hasTarget: boolean;
  /** 项目是否启用校对（仅翻嵌为 false）：隐藏校对负责人与校对/审核进度 */
  withProofread?: boolean;
  /** 项目是否启用原作者栏 */
  withAuthor?: boolean;
  /** 保存/撤回成功后用文件 patch 更新列表（只传变化的字段） */
  onFileChanged?: (file: FilePatch) => void;
  onClick?: () => void;
  selectVisible?: boolean;
  selected?: boolean;
  onSelect?: (value: boolean) => void;
  deleteButtonVisible?: boolean;
  onDeleteButtonClick?: () => void;
  className?: string;
  /** 是否允许内联重命名文件（默认 false） */
  renameEnabled?: boolean;
}

const width = IMAGE_COVER.WIDTH;
const height = 286;
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
  background-color: var(--moeflow-surface);
  &.FileItem--typeset { border-color: #52c41a; box-shadow: 0 0 0 2px rgba(82,196,26,0.3); }
  .FileItem__ImageOCRProgressWrapper {
    display: none;
    position: absolute;
    top: ${imageHeight - 17}px;
    left: 6px;
    padding: 3px 5px;
    background-color: var(--moeflow-control);
    border-radius: 4px;
    border: 1px solid var(--moeflow-surface);
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
    background-color: var(--moeflow-surface2);
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
    position: relative;
    /* 建立层叠上下文，供角色行透明的点击热区伪元素使用（z-index: -1） */
    z-index: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    height: ${height - imageHeight - 2}px;
    padding: 6px 10px;
    gap: 6px;
  }
  .FileItem__Name {
    height: 20px;
    line-height: 20px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  /* 重命名输入框 */
  .FileItem__NameInput {
    height: 20px;
    line-height: 20px;
    font-size: 14px;
    width: 100%;
    border: 1px solid ${style.primaryColor};
    border-radius: 3px;
    padding: 0 4px;
    outline: none;
    background: var(--moeflow-surface);
    color: ${style.textColor};
    box-sizing: border-box;
    overflow: hidden;
    white-space: nowrap;
  }
  /* 可点击的文件名（启用重命名时） */
  .FileItem__NameButton {
    display: block;
    height: 20px;
    line-height: 20px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    width: 100%;
    text-align: left;
    font-size: 14px;
    color: ${style.textColor};
    cursor: text;
    &:hover { color: ${style.primaryColor}; }
    &:focus-visible {
      outline: 2px solid ${style.primaryColor};
      outline-offset: 1px;
    }
  }
  .FileItem__NameError {
    position: absolute;
    top: 26px;
    left: 10px;
    right: 10px;
    z-index: 10;
    font-size: 11px;
    color: ${style.errorColor};
    background: var(--moeflow-surface);
    border: 1px solid ${style.errorColor};
    border-radius: 3px;
    padding: 2px 6px;
    overflow-wrap: anywhere;
    white-space: normal;
  }
  .FileItem__Roles {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0;
    .TranslationUser {
      flex: none;
      min-height: 15px;
      & .TranslationUser__TypeIcon {
        margin-right: 3px;
      }
      & .TranslationUser__UserName {
        margin-right: 4px;
      }
    }
  }
  .FileItem__Info > .FileItem__TranslationProgressText {
    margin-top: auto;
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
  iconType: 'translation' | 'proofread' | 'typesetter' | 'author';
  label: string;
  value?: string;
  fileID: string;
  field: 'translator' | 'proofreader' | 'typesetter' | 'originalAuthor';
  canEdit: boolean;
  canUndo: boolean; // 是否显示撤回按钮（仅管理员）
  onFileChanged?: (file: FilePatch) => void;
}> = ({ iconType, label, value, fileID, field, canEdit, canUndo, onFileChanged }) => {
  const { formatMessage } = useIntl();
  const [editing, setEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value || '');
  const savingRef = useRef(false);
  const cancelRef = useRef(false);
  const requestSeqRef = useRef(0);
  const draftRef = useRef(value || '');

  useEffect(() => {
    // 服务端数据更新时同步显示值；编辑中保留用户草稿
    if (!editing) {
      setCurrentValue(value || '');
      draftRef.current = value || '';
    }
  }, [value, editing]);

  const save = (text: string) => {
    if (cancelRef.current) {
      cancelRef.current = false;
      setEditing(false);
      return;
    }
    setEditing(false);
    const finalText = text.trim();
    if (finalText === (currentValue || '')) {
      return; // 未变化
    }
    if (savingRef.current) {
      return; // 防止 Enter 与 blur 重复提交
    }
    savingRef.current = true;
    draftRef.current = finalText;
    const seq = ++requestSeqRef.current;
    const isAuthor = field === 'originalAuthor';
    const request = api.file.editFile({
      id: fileID,
      // 原作者空串表示清空；其它负责人字段保持原有「空串不提交」语义
      data: isAuthor
        ? { originalAuthor: finalText }
        : ({
            [field]: finalText || undefined,
            ...(field === 'translator' ? { replaceTranslator: true } : {}),
          } as any),
    });
    request
      .then((result: any) => {
        if (seq !== requestSeqRef.current) {
          return;
        }
        setCurrentValue(finalText);
        const updated = result?.data?.file;
        if (updated && onFileChanged) {
          onFileChanged(toLowerCamelCase(updated) as File);
        }
      })
      .catch(() => {
        if (isAuthor) {
          message.error(formatMessage({ id: 'file.originalAuthorSaveFailed' }));
          // 失败时保留草稿，便于用户直接重试
          setEditing(true);
        }
      })
      .finally(() => {
        if (seq === requestSeqRef.current) {
          savingRef.current = false;
        }
      });
  };

  const undo = () => {
    // 撤回操作：清空对应字段
    const data: any = {};
    if (field === 'proofreader') data.proofreader = true;
    if (field === 'typesetter') data.typesetter = true;
    if (field === 'originalAuthor') data.originalAuthor = true;

    api.file
      .undoFileCompletion({ id: fileID, data })
      .then((result: any) => {
        if (field !== 'originalAuthor') {
          // 保持现有校对/嵌字撤回行为：整页刷新以同步项目级进度
          window.location.reload();
          return;
        }
        const updated = result?.data?.file;
        if (updated && onFileChanged) {
          onFileChanged(toLowerCamelCase(updated) as File);
        }
      })
      .catch(() => {
        if (field === 'originalAuthor') {
          message.error(formatMessage({ id: 'file.originalAuthorSaveFailed' }));
        }
      });
  };

  // 仅校对、嵌字与原作者可撤回（翻译者不显示撤回按钮）
  const showUndoButton =
    canUndo &&
    Boolean(currentValue) &&
    ['proofreader', 'typesetter', 'originalAuthor'].includes(field);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      css={css`
        display: flex; align-items: center; min-height: 17px; flex-wrap: nowrap; font-size: 12px; line-height: 1.2;
        color: ${style.textColorSecondary};
        margin: 0;
        gap: 2px;
        /* 行本身不拦截点击：角色值/撤回按钮用透明伪元素扩大热区 */
        pointer-events: none;
        .TranslationUser {
          align-self: stretch;
        }
        .TranslationUser,
        .RoleEditField__Input,
        .RoleEditField__Value,
        .RoleEditField__UndoButton {
          pointer-events: auto;
        }
        .RoleEditField__Value {
          position: relative;
          flex: 1;
          min-width: 0;
          cursor: pointer;
          color: ${style.primaryColor};
          &:hover { text-decoration: underline; }
          /* 上下各扩 8px、左右各扩 6px；z-index: -1 保证文字/按钮仍优先响应 */
          &::after {
            content: '';
            position: absolute;
            z-index: -1;
            inset: -8px -6px;
          }
        }
        .RoleEditField__ValueText {
          display: block;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .RoleEditField__Input { flex: 1; min-width: 0; width: 100%; font-size: 12px; border: 1px solid ${style.borderColorLight}; border-radius: 4px; padding: 1px 4px; outline: none; &:focus { border-color: ${style.primaryColor}; } }
        .RoleEditField__UndoButton {
          position: relative;
          flex: none;
          margin-left: 4px;
          padding: 0 4px;
          min-width: 24px;
          min-height: 20px;
          line-height: 18px;
          text-align: center;
          font-size: 11px;
          color: ${style.textColorSecondary};
          cursor: pointer;
          border: 1px solid ${style.borderColorLight};
          border-radius: 3px;
          &:hover { color: ${style.errorColor}; border-color: ${style.errorColor}; background-color: rgba(255, 77, 79, 0.05); }
          &::after {
            content: '';
            position: absolute;
            z-index: -2;
            inset: -8px -6px;
          }
        }
      `}>
      <TranslationUser iconType={iconType} name={label} />
      {editing ? (
        <input
          className="RoleEditField__Input"
          autoFocus
          defaultValue={draftRef.current}
          placeholder={label}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') save((e.target as HTMLInputElement).value);
            if (e.key === 'Escape') {
              cancelRef.current = true;
              setEditing(false);
            }
          }}
          onBlur={(e) => save(e.target.value)}
        />
      ) : (
        <>
          <span
            className="RoleEditField__Value"
            title={currentValue || undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (canEdit) {
                cancelRef.current = false;
                draftRef.current = currentValue;
                setEditing(true);
              }
            }}
          >
            <span className="RoleEditField__ValueText">
              {currentValue ? `: ${currentValue}` : ': -'}
            </span>
          </span>
          {showUndoButton && (
            <span
              className="RoleEditField__UndoButton"
              title={`撤回${label}完成`}
              onClick={(e) => {
                e.stopPropagation();
                const confirmText =
                  field === 'originalAuthor'
                    ? formatMessage({ id: 'file.undoOriginalAuthorConfirm' })
                    : `确定要撤回${label}完成吗？`;
                if (window.confirm(confirmText)) {
                  undo();
                }
              }}
            >
              ↶
            </span>
          )}
        </>
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
  withProofread = true,
  withAuthor = false,
  onFileChanged,
  onClick,
  selectVisible = false,
  selected = false,
  onSelect,
  deleteButtonVisible = false,
  onDeleteButtonClick,
  className,
  renameEnabled = false,
}) => {
  // 角色权限矩阵:根据项目角色确定可编辑字段
  let canEditTranslator = false;
  let canEditProofreader = false;
  let canEditTypesetter = false;
  let canEditAuthor = false;
  let canUndo = false; // 仅管理员可撤回校对/嵌字
  let canUndoAuthor = false; // 原作者撤回仅管理员
  const isProjectAdmin =
    isAdmin || ['creator', 'admin', 'coordinator'].includes(roleSystemCode || '');
  if (isProjectAdmin) {
    canEditTranslator = canEditProofreader = canEditTypesetter = true;
    canEditAuthor = true;
    canUndo = true;
    canUndoAuthor = true;
  } else if (['translator', 'proofreader'].includes(roleSystemCode || '')) {
    canEditTranslator = canEditProofreader = true;
    canEditAuthor = true;
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

  // ===== 文件名内联重命名 =====
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(file.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameSavingRef = useRef(false);
  const nameCancelRef = useRef(false);

  // 非编辑态跟随 prop；编辑中保留草稿
  useEffect(() => {
    if (!nameEditing) {
      setNameDraft(file.name);
    }
  }, [file.name, nameEditing]);

  const enterNameEdit = (e: ReactMouseEvent | ReactKeyboardEvent) => {
    e.stopPropagation();
    nameCancelRef.current = false;
    setNameError(null);
    setNameDraft(file.name);
    setNameEditing(true);
  };

  const cancelNameEdit = () => {
    nameCancelRef.current = true;
    setNameEditing(false);
    setNameError(null);
    setNameDraft(file.name);
  };

  const saveNameEdit = async (draft: string) => {
    if (nameCancelRef.current) {
      nameCancelRef.current = false;
      setNameEditing(false);
      setNameError(null);
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed) {
      setNameError(formatMessage({ id: 'file.renameNameRequired' }));
      return; // 保留编辑态
    }
    if (trimmed === file.name) {
      setNameEditing(false);
      setNameError(null);
      return; // 未变化，静默退出
    }
    if (nameSavingRef.current) {
      return; // 防 Enter + blur 重复触发
    }
    nameSavingRef.current = true;
    try {
      await api.file.editFile({ id: file.id, data: { name: trimmed } });
      // 成功：本地 patch，不依赖后端返回的 file 对象
      setNameEditing(false);
      setNameError(null);
      onFileChanged?.({ id: file.id, name: trimmed });
    } catch (e: unknown) {
      // 失败：保留编辑态草稿，展示错误
      const msg = extractErrorMessage(e, formatMessage({ id: 'file.renameFailed' }));
      setNameError(msg);
    } finally {
      nameSavingRef.current = false;
    }
  };

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
        {/* ===== 文件名行 ===== */}
        {renameEnabled && nameEditing ? (
          <div style={{ position: 'relative' }}>
            <input
              className="FileItem__NameInput"
              autoFocus
              value={nameDraft}
              title={formatMessage({ id: 'file.renameHint' })}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                setNameDraft(e.target.value);
                if (nameError) setNameError(null); // 清除已有错误
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  saveNameEdit(nameDraft);
                }
                if (e.key === 'Escape') {
                  cancelNameEdit();
                }
              }}
              onBlur={() => saveNameEdit(nameDraft)}
            />
            {nameError && (
              <div className="FileItem__NameError">{nameError}</div>
            )}
          </div>
        ) : renameEnabled ? (
          <button
            type="button"
            className="FileItem__NameButton"
            title={`${file.name} — ${formatMessage({ id: 'file.renameHint' })}`}
            onClick={enterNameEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                enterNameEdit(e);
              }
            }}
          >
            {/* 显示最新名称（外部 prop 或本地 patch） */}
            {file.name}
          </button>
        ) : (
          <div className="FileItem__Name">{file.name}</div>
        )}

        <div className="FileItem__Roles">
          <RoleEditField iconType="translation" label="翻译" value={file.translator} fileID={file.id} field="translator" canEdit={canEditTranslator} canUndo={canUndo} onFileChanged={onFileChanged} />
          {withProofread && (
            <RoleEditField iconType="proofread" label="校对" value={file.proofreader} fileID={file.id} field="proofreader" canEdit={canEditProofreader} canUndo={canUndo} onFileChanged={onFileChanged} />
          )}
          <RoleEditField iconType="typesetter" label="嵌字" value={file.typesetter} fileID={file.id} field="typesetter" canEdit={canEditTypesetter} canUndo={canUndo} onFileChanged={onFileChanged} />
          {withAuthor && (
            <RoleEditField
              iconType="author"
              label={formatMessage({ id: 'file.originalAuthor' })}
              value={file.originalAuthor}
              fileID={file.id}
              field="originalAuthor"
              canEdit={canEditAuthor}
              canUndo={canUndoAuthor}
              onFileChanged={onFileChanged}
            />
          )}
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
              hideChecked={!withProofread}
              type="text"
            />
            <TranslationProgress
              className="FileItem__TranslationProgressLine"
              sourceCount={sourceCount}
              translatedSourceCount={translatedSourceCount}
              checkedSourceCount={checkedSourceCount}
              hideChecked={!withProofread}
              typesetPercent={file.typesetter ? 100 : 0}
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
