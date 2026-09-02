import { css } from '@emotion/core';
import TextArea, { TextAreaRef } from 'antd/lib/input/TextArea';
import classNames from 'classnames';
import React, { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useDispatch, useSelector } from 'react-redux';
import { DebounceStatus, Icon, Tooltip } from '@/components';
import { APITranslation } from '@/apis/translation';
import { PROJECT_PERMISSION } from '@/constants';
import { FC, Source as ISource } from '@/interfaces';
import { AppState } from '@/store';
import { editMyTranslationSaga, focusSource } from '@/store/source/slice';
import style from '@/style';
import { getBestTranslation } from '@/utils/source';
import { clickEffect, hover } from '@/utils/style';
import { can } from '@/utils/user';

/** 符号工具：可插入到翻译栏的字符 */
const SYMBOLS = [
  '…',
  '～',
  '♡',
  '♠',
  '「',
  '」',
  '『',
  '』',
  '（',
  '）',
  '○',
  '●',
  '※',
  '☆',
  '★',
  '□',
  '◇',
  '♪',
  '♬',
  '·',
  '〆',
];

/** 翻译模式的属性接口 */
interface ImageSourceViewerTranslatorProps {
  sources: ISource[];
  targetID: string;
  className?: string;
}
/**
 * "translate" model, the panel to fill in text 翻译模式
 */
export const ImageSourceViewerTranslator: FC<
  ImageSourceViewerTranslatorProps
> = ({ sources, targetID, className }) => {
  const { formatMessage } = useIntl();
  const dispatch = useDispatch();
  const platform = useSelector((state: AppState) => state.site.platform);
  const isMobile = platform === 'mobile';
  const domRefs = useRef<(HTMLDivElement | null)[]>([]);
  const textAreaRef = useRef<TextAreaRef>(null);
  const currentProject = useSelector(
    (state: AppState) => state.project.currentProject,
  );
  const focusedSourceID = useSelector(
    (state: AppState) => state.source.focusedSource.id,
  );
  const focusedSourceEffects = useSelector(
    (state: AppState) => state.source.focusedSource.effects,
  );
  const focusedSourceNoiseFocusInput = useSelector(
    (state: AppState) => state.source.focusedSource.noises.focusInput,
  );
  const focusedSourceNoiseScrollIntoView = useSelector(
    (state: AppState) => state.source.focusedSource.noises.scrollIntoView,
  );
  let focusedSource: ISource | undefined = undefined;
  let focusedSourceIndex: number = -1;
  const myTranslations: (APITranslation | undefined)[] = [];
  const othersBestTranslations: (APITranslation | undefined)[] = [];
  for (let i = 0; i < sources.length; i++) {
    if (sources[i].id === focusedSourceID) {
      focusedSource = sources[i];
      focusedSourceIndex = i;
    }
    myTranslations.push(sources[i].myTranslation);
    othersBestTranslations.push(getBestTranslation(sources[i]));
  }
  const focusedSourceCreating = focusedSource?.labelStatus === 'creating';
  const focusedSourceDeleting = focusedSource?.labelStatus === 'deleting';

  const defaultBottomHeight = isMobile ? 60 : 380;
  const [bottomPanelHeight, setBottomPanelHeight] = useState(defaultBottomHeight);
  const bottomHeight = focusedSource ? bottomPanelHeight : 0;
  const resizeStartRef = useRef<{ startY: number; startH: number } | null>(
    null,
  );

  /** 拖动底部面板顶部的拉伸条来调整高度（向上拖增高、向下拖降低） */
  const onResizeHandleStart = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartRef.current = { startY: e.clientY, startH: bottomPanelHeight };
    const onMove = (ev: MouseEvent) => {
      const start = resizeStartRef.current;
      if (!start) {
        return;
      }
      const delta = start.startY - ev.clientY;
      const next = Math.max(80, Math.min(560, start.startH + delta));
      setBottomPanelHeight(next);
    };
    const onUp = () => {
      resizeStartRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    if (focusedSourceEffects.includes('focusInput')) {
      setTimeout(() => {
        textAreaRef.current?.focus({ cursor: 'end' });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedSourceID, focusedSourceNoiseFocusInput]);

  useEffect(() => {
    if (focusedSourceEffects.includes('scrollIntoView')) {
      domRefs.current[focusedSourceIndex]?.scrollIntoView({
        block: 'end',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedSourceID, focusedSourceNoiseScrollIntoView]);

  const handleTranslationContentChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    dispatch(
      editMyTranslationSaga({
        sourceID: focusedSourceID,
        targetID,
        content: e.target.value,
      }),
    );
  };

  /** 符号工具是否显示 */
  const [symbolToolVisible, setSymbolToolVisible] = useState(true);

  /** 在光标处插入符号（无光标则追加到末尾），并重新派发翻译内容 */
  const insertSymbol = (symbol: string) => {
    if (
      !can(currentProject, PROJECT_PERMISSION.ADD_TRA) ||
      focusedSourceCreating ||
      focusedSourceDeleting
    ) {
      return;
    }
    const textArea = textAreaRef.current?.resizableTextArea?.textArea;
    const value = focusedSource?.myTranslation?.content || '';
    const start = textArea ? textArea.selectionStart : value.length;
    const end = textArea ? textArea.selectionEnd : value.length;
    const newValue = value.slice(0, start) + symbol + value.slice(end);
    dispatch(
      editMyTranslationSaga({
        sourceID: focusedSourceID,
        targetID,
        content: newValue,
      }),
    );
    // 恢复光标到插入符号之后（受控 value 更新后重设选区）
    if (textArea) {
      const pos = start + symbol.length;
      requestAnimationFrame(() => {
        textArea.focus();
        textArea.setSelectionRange(pos, pos);
      });
    }
  };

  return (
    <div
      className={classNames('ImageSourceViewerTranslator', className)}
      css={css`
        height: 100%;
        .ImageSourceViewerTranslator__Translations {
          height: calc(100% - ${bottomHeight}px);
          overflow-y: auto;
        }
        .ImageSourceViewerTranslator__Translation {
          display: flex;
          padding: 4px 5px;
          border-left: 5px solid ${style.borderColorLight};
          border-bottom: 1px solid ${style.borderColorBase};
          min-height: 30px;
          ${clickEffect()};
          ${hover(css`
            .ImageSourceViewerTranslator__TranslationContentOthersBest {
              color: ${style.textColor};
            }
            .ImageSourceViewerTranslator__TranslationContentOthersBestPrefixIcon {
              color: ${style.textColorSecondary};
            }
            .ImageSourceViewerTranslator__TranslationContentMine--hasProofread {
              color: ${style.textColor};
            }
          `)};
          :last-child {
            border-bottom: 0;
          }
        }
        .ImageSourceViewerTranslator__Translation--empty {
          border-left-color: ${style.primaryColorLightest};
        }
        .ImageSourceViewerTranslator__Translation--focus {
          background-color: ${style.backgroundFocus};
        }
        .ImageSourceViewerTranslator__TranslationIndex {
          flex: none;
          color: ${style.textColorSecondary};
          font-size: 14px;
          font-family: ${style.labelFontFamily};
          font-weight: 600;
          margin: 1px 6px 0 4px;
          min-width: 17px;
          text-align: center;
        }
        .ImageSourceViewerTranslator__SingleDebounceStatus {
          float: right;
          margin-right: 3px;
        }
        .ImageSourceViewerTranslator__TranslationContent {
          flex: auto;
          color: ${style.textColor};
        }
        .ImageSourceViewerTranslator__TranslationContentMine {
          width: 100%;
          min-height: 22px;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .ImageSourceViewerTranslator__TranslationContentMine--hasProofread {
          color: ${style.textColorSecondary};
        }
        .ImageSourceViewerTranslator__TranslationContentMineProofread {
          width: 100%;
          margin-top: 4px;
          padding-top: 4px;
          border-top: 1px dashed ${style.borderColorBase};
          white-space: pre-wrap;
          word-break: break-all;
        }
        .ImageSourceViewerTranslator__TranslationContentMineProofreadPrefix {
          margin-right: 4px;
        }
        .ImageSourceViewerTranslator__TranslationContentMineProofreadPrefixIcon {
          width: 12px;
          color: ${style.textColorSecondary};
        }
        .ImageSourceViewerTranslator__TranslationContentOthersBest {
          width: 100%;
          color: ${style.textColorSecondary};
          white-space: pre-wrap;
          word-break: break-all;
        }
        .ImageSourceViewerTranslator__TranslationContentOthersBestPrefix {
          margin-right: 4px;
        }
        .ImageSourceViewerTranslator__TranslationContentOthersBestPrefixIcon {
          width: 14px;
          color: ${style.textColorSecondaryLighter};
        }
        .ImageSourceViewerTranslator__Bottom {
          display: flex;
          flex-direction: column;
          height: ${bottomHeight}px;
          border-top: 3px solid ${style.borderColorBase};
        }
        .ImageSourceViewerTranslator__ResizeHandle {
          flex: none;
          height: 8px;
          width: 100%;
          cursor: ns-resize;
          display: flex;
          align-items: center;
          justify-content: center;
          user-select: none;
          &:hover {
            .ImageSourceViewerTranslator__ResizeHandleLine {
              background-color: ${style.primaryColor};
            }
          }
          .ImageSourceViewerTranslator__ResizeHandleLine {
            width: 44px;
            height: 3px;
            border-radius: 2px;
            background-color: ${style.borderColorLight};
          }
        }
        .ImageSourceViewerTranslator__TextArea {
          flex: auto;
          width: 100%;
          border-radius: 0;
          border-width: 0;
          padding: 7px 11px;
          resize: none;
          &.ant-input {
            border-right-width: 0px !important;
            outline: 0;
            box-shadow: none;
          }
        }
        .ImageSourceViewerTranslator__StatusBar {
          background-color: ${style.backgroundColorLight};
          border-top: 1px solid ${style.borderColorBase};
          display: flex;
          align-items: center;
          padding: 0 5px;
        }
        .ImageSourceViewerTranslator__FunctionBar {
          flex: none;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 5px 8px;
          border-bottom: 1px solid ${style.borderColorBase};
          background-color: ${style.backgroundColorLight};
        }
        .ImageSourceViewerTranslator__DebounceStatus {
          margin-left: auto;
        }
        .ImageSourceViewerTranslator__SymbolTool {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 4px;
          padding: 5px 8px;
          border-bottom: 1px solid ${style.borderColorBase};
          background-color: ${style.backgroundColorLight};
          .SymbolTool__Key {
            min-width: 26px;
            height: 26px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid ${style.borderColorLight};
            border-radius: ${style.borderRadiusSm};
            background-color: var(--moeflow-surface);
            color: ${style.textColor};
            font-size: 15px;
            cursor: pointer;
            ${clickEffect()};
          }
          .SymbolTool__Hide {
            margin-left: auto;
            height: 26px;
            padding: 0 8px;
            border: 1px solid ${style.borderColorLight};
            border-radius: ${style.borderRadiusSm};
            background-color: var(--moeflow-surface);
            color: ${style.textColorSecondary};
            font-size: 12px;
            cursor: pointer;
            ${clickEffect()};
          }
        }
        .SymbolTool__Toggle {
          height: 26px;
          margin-left: 6px;
          padding: 0 8px;
          border: 1px solid ${style.borderColorLight};
          border-radius: ${style.borderRadiusSm};
          background-color: var(--moeflow-surface);
          color: ${style.textColorSecondary};
          font-size: 12px;
          cursor: pointer;
          ${clickEffect()};
        }
      `}
    >
      <div className="ImageSourceViewerTranslator__Translations">
        {myTranslations.map((myTranslation, i) => {
          const source = sources[i];
          const othersBestTranslation = othersBestTranslations[i];
          const myContent = myTranslation ? myTranslation.content : '';
          const myProofreadContent = myTranslation
            ? myTranslation.proofreadContent
            : '';
          let othersBestContent = '';
          if (othersBestTranslation) {
            othersBestContent = othersBestTranslation.proofreadContent
              ? othersBestTranslation.proofreadContent
              : othersBestTranslation.content;
          }
          const empty: boolean =
            !myContent && !myProofreadContent && !othersBestContent;

          return (
            <div
              ref={(ref) => (domRefs.current[i] = ref)}
              key={source.id}
              className={classNames(
                'ImageSourceViewerTranslator__Translation',
                {
                  'ImageSourceViewerTranslator__Translation--empty': empty,
                  'ImageSourceViewerTranslator__Translation--focus':
                    focusedSourceID === source.id,
                },
              )}
              onClick={() => {
                dispatch(
                  focusSource({
                    id: source.id,
                    effects: ['focusLabel', 'focusInput'],
                    noises: ['focusInput'],
                  }),
                );
              }}
            >
              <div className="ImageSourceViewerTranslator__TranslationIndex">
                {i + 1}
              </div>
              <div className="ImageSourceViewerTranslator__TranslationContent">
                {myContent || myProofreadContent ? (
                  <>
                    <div
                      className={classNames(
                        'ImageSourceViewerTranslator__TranslationContentMine',
                        {
                          'ImageSourceViewerTranslator__TranslationContentMine--hasProofread':
                            myProofreadContent,
                        },
                      )}
                    >
                      {myContent}
                      <DebounceStatus
                        className="ImageSourceViewerTranslator__SingleDebounceStatus"
                        status={source.myTranslationContentStatus}
                        tipVisible={false}
                      />
                    </div>
                    {myProofreadContent && (
                      <div className="ImageSourceViewerTranslator__TranslationContentMineProofread">
                        <Tooltip
                          title={formatMessage({
                            id: 'translation.proofreadFirstTip',
                          })}
                          placement="left"
                        >
                          <span className="ImageSourceViewerTranslator__TranslationContentMineProofreadPrefix">
                            <Icon
                              className="ImageSourceViewerTranslator__TranslationContentMineProofreadPrefixIcon"
                              icon="pen-nib"
                            />
                          </span>
                        </Tooltip>
                        {myProofreadContent}
                      </div>
                    )}
                  </>
                ) : (
                  othersBestContent && (
                    <div className="ImageSourceViewerTranslator__TranslationContentOthersBest">
                      <Tooltip
                        title={formatMessage({
                          id: 'translation.hasOthersBestContentTip',
                        })}
                        placement="left"
                      >
                        <span className="ImageSourceViewerTranslator__TranslationContentOthersBestPrefix">
                          <Icon
                            className="ImageSourceViewerTranslator__TranslationContentOthersBestPrefixIcon"
                            icon="user-check"
                          />
                        </span>
                      </Tooltip>
                      {othersBestContent}
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
      {focusedSourceIndex > -1 && (
        <div className="ImageSourceViewerTranslator__Bottom">
          <div
            className="ImageSourceViewerTranslator__ResizeHandle"
            onMouseDown={onResizeHandleStart}
          >
            <div className="ImageSourceViewerTranslator__ResizeHandleLine" />
          </div>
          <div className="ImageSourceViewerTranslator__FunctionBar">
            <button
              type="button"
              className="SymbolTool__Toggle"
              onClick={() => setSymbolToolVisible((v) => !v)}
            >
              {formatMessage({
                id: symbolToolVisible
                  ? 'imageTranslator.hideSymbolTool'
                  : 'imageTranslator.showSymbolTool',
              })}
            </button>
          </div>
          {symbolToolVisible && (
            <div className="ImageSourceViewerTranslator__SymbolTool">
              {SYMBOLS.map((s) => (
                <button
                  type="button"
                  key={s}
                  className="SymbolTool__Key"
                  onClick={() => insertSymbol(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <TextArea
            className="ImageSourceViewerTranslator__TextArea"
            onChange={handleTranslationContentChange}
            value={
              can(currentProject, PROJECT_PERMISSION.ADD_TRA)
                ? focusedSource?.myTranslation?.content
                : formatMessage({
                    id: 'imageTranslator.translationNoPremissionPlaceholder',
                  })
            }
            placeholder={
              focusedSourceCreating
                ? formatMessage({ id: 'imageTranslator.sourceCreating' })
                : focusedSourceDeleting
                  ? formatMessage({ id: 'imageTranslator.sourceDeleting' })
                  : formatMessage({
                      id: 'imageTranslator.translationPlaceholder',
                    })
            }
            disabled={
              !can(currentProject, PROJECT_PERMISSION.ADD_TRA) ||
              focusedSourceCreating ||
              focusedSourceDeleting
            }
            ref={textAreaRef}
          ></TextArea>
          <div className="ImageSourceViewerTranslator__StatusBar">
            <DebounceStatus
              className="ImageSourceViewerTranslator__DebounceStatus"
              status={focusedSource?.myTranslationContentStatus}
            />
          </div>
        </div>
      )}
    </div>
  );
};
