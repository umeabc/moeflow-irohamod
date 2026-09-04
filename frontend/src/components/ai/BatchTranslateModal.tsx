import { FC } from 'react';
import { File as MFile } from '@/interfaces';
import { Target } from '@/interfaces';
import { useIntl } from 'react-intl';
import { useState } from 'react';
import { ResourcePool } from '@jokester/ts-commonutil/lib/concurrency/resource-pool-basic';
import { getCancelToken } from '@/utils/api';
import { useAsyncEffect } from '@jokester/ts-commonutil/lib/react/hook/use-async-effect';
import { createDebugLogger } from '@/utils/debug-logger';
import { api, resultTypes } from '@/apis';
import { APISource } from '@/apis/source';
import { toLowerCamelCase } from '@/utils';
import {
  llmTranslateImage,
  LLMConf,
  FilePreprocessResult,
  TranslateOnlyResult,
  annotateImage,
  AILabel,
  TranslateMode,
} from '@/services/ai/llm_preprocess';
import { ModalHandle } from '.';
import { Icon } from '../icon';

const debugLogger = createDebugLogger('components:ai:BatchTranslateModal');
interface FileProgress {
  file: MFile;
  icon: React.ReactNode | string;
  message?: React.ReactNode | string;
}

function clipTo01(x: number) {
  return Math.max(0, Math.min(1, x));
}

const stateIcons = {
  waiting: <Icon icon="ellipsis-h" />,
  working: <Icon icon="spinner" spin />,
  skip: <Icon icon="exclamation-circle" />,
  fail: <Icon icon="exclamation-circle" />,
  success: <Icon icon="check" />,
} as const;

/** 保证每个文本块 rank 唯一，避免与已有标号冲突 */
function uniqueRanks(texts: FilePreprocessResult['texts']) {
  const used = new Set<number>();
  return texts.map((tb) => {
    let rank = tb.rank;
    while (used.has(rank)) {
      rank += 1;
    }
    used.add(rank);
    return { ...tb, rank };
  });
}

export const BatchTranslateModalContent: FC<{
  llmConf: LLMConf;
  files: MFile[];
  target: Target;
  mode?: TranslateMode;
  onFileSaved?(f: MFile): void;
  getHandle(): ModalHandle;
}> = ({ files, target, getHandle, llmConf, mode: modeProp, onFileSaved }) => {
  const mode = modeProp ?? 'all';
  const { formatMessage } = useIntl();
  const [fileStates, setFileStates] = useState<FileProgress[]>(() =>
    files.map(
      (file): FileProgress => ({
        file,
        icon: stateIcons.waiting,
        message: formatMessage({
          id: 'fileList.aiTranslate.fileMessage.waiting',
        }),
      }),
    ),
  );

  useAsyncEffect(async (running, released) => {
    const [cancelToken, fillCancelToken] = getCancelToken();
    const fileLimiter = ResourcePool.multiple([1, 2]);
    const moeflowApiLimiter = ResourcePool.multiple([1, 2, 3, 4]);
    const abort = new AbortController();
    released.then(() => fillCancelToken('unmounted'));
    released.then(() => abort.abort('unmounted'));

    if (!running.current) {
      debugLogger('canceled');
      return;
    }
    released = released.then(() => {
      debugLogger('released');
    });
    const tasksEnded = Promise.allSettled(
      files.map((f) => fileLimiter.use(() => translateFile(f))),
    );
    const cancelled = await Promise.race([
      released.then(() => true),
      tasksEnded.then(() => false),
    ]);
    debugLogger('cancelled', cancelled);
    if (!cancelled) {
      const handle = getHandle();
      handle.update({ okButtonProps: { disabled: false } });
    }
    return;

    function setFileState(f: MFile, message: string, icon: React.ReactNode) {
      debugLogger('setFileState', f.id, message);
      setFileStates((prev) =>
        prev.map((state) =>
          state.file === f ? { ...state, message, icon } : state,
        ),
      );
    }

    async function translateFile(f: MFile) {
      setFileState(
        f,
        formatMessage({ id: 'fileList.aiTranslate.fileMessage.sendingImage' }),
        stateIcons.working,
      );
      if (![undefined, null, 'success'].includes(f.uploadState)) {
        setFileState(
          f,
          formatMessage({
            id: 'fileList.aiTranslate.fileMessage.uploadNotFinished',
          }),
          stateIcons.skip,
        );
        return;
      }
      const refetchRes = await api.file
        .getFile({ fileID: f.id, configs: { cancelToken } })
        .catch(() => null);
      if (refetchRes?.type !== resultTypes.SUCCESS) {
        setFileState(
          f,
          formatMessage({
            id: 'fileList.aiTranslate.fileMessage.failFetchingImage',
          }),
          stateIcons.fail,
        );
        return;
      }
      const resData = toLowerCamelCase(refetchRes.data);
      const hasLabel = Number(resData.sourceCount ?? 0) > 0;

      // 按模式跳过不匹配模式前置的文件
      if (mode === 'translate-only' && !hasLabel) {
        setFileState(
          f,
          formatMessage({
            id: 'fileList.aiTranslate.fileMessage.needLabels',
          }),
          stateIcons.skip,
        );
        return;
      }
      if (mode !== 'translate-only' && hasLabel) {
        setFileState(
          f,
          formatMessage({
            id: 'fileList.aiTranslate.fileMessage.textAlreadyExist',
          }),
          stateIcons.skip,
        );
        return;
      }

      const imgBlob = await fetch(resData.url!, { signal: abort.signal }).then(
        (r) => r.blob(),
        () => null,
      );
      if (!imgBlob) {
        setFileState(
          f,
          formatMessage({
            id: 'fileList.aiTranslate.fileMessage.failFetchingImage',
          }),
          stateIcons.fail,
        );
        return;
      }

      setFileState(
        f,
        formatMessage({ id: 'fileList.aiTranslate.fileMessage.translating' }),
        stateIcons.working,
      );

      if (mode === 'translate-only') {
        await translateLabelsOnly(f, imgBlob);
        return;
      }

      const result = await llmTranslateImage(
        llmConf,
        target.language.enName,
        imgBlob,
        { mode },
      ).catch((e: unknown) => {
        debugLogger('translate failed', e);
        return null;
      });
      debugLogger('translate result', result);
      if (!running.current) {
        return;
      }

      if (result) {
        await saveTranslations(f, result as FilePreprocessResult);
      } else {
        setFileState(
          f,
          formatMessage({
            id: 'fileList.aiTranslate.fileMessage.translateFailed',
          }),
          stateIcons.fail,
        );
      }
    }

    async function translateLabelsOnly(f: MFile, imgBlob: Blob) {
      const srcRes = await api.source
        .getSources({
          fileID: f.id,
          params: { targetID: target.id },
          configs: { cancelToken },
        })
        .catch(() => null);
      if (srcRes?.type !== resultTypes.SUCCESS) {
        setFileState(
          f,
          formatMessage({
            id: 'fileList.aiTranslate.fileMessage.failFetchingImage',
          }),
          stateIcons.fail,
        );
        return;
      }
      const sources = srcRes.data as APISource[];
      if (sources.length === 0) {
        setFileState(
          f,
          formatMessage({
            id: 'fileList.aiTranslate.fileMessage.needLabels',
          }),
          stateIcons.skip,
        );
        return;
      }
      const labels: AILabel[] = sources.map((s) => ({
        rank: s.rank,
        content: s.content,
        x: s.x,
        y: s.y,
      }));
      const existingByRank = new Map(sources.map((s) => [s.rank, s]));
      let annotatedBlob = imgBlob;
      try {
        annotatedBlob = await annotateImage(imgBlob, labels);
      } catch (e) {
        debugLogger('annotate failed, fallback to original image', e);
      }
      const result = await llmTranslateImage(
        llmConf,
        target.language.enName,
        annotatedBlob,
        { mode: 'translate-only', labels },
      ).catch((e: unknown) => {
        debugLogger('translate-only failed', e);
        return null;
      });
      debugLogger('translate-only result', result);
      if (!running.current) {
        return;
      }
      if (!result) {
        setFileState(
          f,
          formatMessage({
            id: 'fileList.aiTranslate.fileMessage.translateFailed',
          }),
          stateIcons.fail,
        );
        return;
      }
      const r = result as TranslateOnlyResult;
      let matched = 0;
      const unmatched = r.texts.filter(
        (tb) => !existingByRank.has(tb.rank),
      ).length;
      try {
        await Promise.all(
          r.texts.map((tb) => {
            const src = existingByRank.get(tb.rank);
            if (!src) {
              return Promise.resolve();
            }
            matched += 1;
            return moeflowApiLimiter.use(() =>
              api.translation.createTranslation({
                sourceID: src.id,
                data: { content: tb.translated, targetID: target.id },
              }),
            );
          }),
        );
        if (matched === 0) {
          setFileState(
            f,
            formatMessage({
              id: 'fileList.aiTranslate.fileMessage.noMatch',
            }),
            stateIcons.fail,
          );
          return;
        }
        const successMsg =
          formatMessage(
            { id: 'fileList.aiTranslate.fileMessage.success' },
            { count: matched },
          ) +
          (unmatched > 0
            ? formatMessage(
                { id: 'fileList.aiTranslate.fileMessage.unmatchedNote' },
                { unmatched },
              )
            : '');
        setFileState(f, successMsg, stateIcons.success);
        onFileSaved?.({ ...f, translatedSourceCount: matched });
      } catch (e) {
        debugLogger('save translation failed', e);
        setFileState(
          f,
          formatMessage({
            id: 'fileList.aiTranslate.fileMessage.failSaving',
          }),
          stateIcons.fail,
        );
      }
    }

    async function saveTextBlock(
      f: MFile,
      tf: FilePreprocessResult,
      tb: FilePreprocessResult['texts'][number],
      withTranslation: boolean,
    ) {
      const src = await api.source.createSource({
        fileID: f.id,
        data: {
          x: clipTo01((tb.left + tb.width / 2) / tf.imageW),
          y: clipTo01((tb.top + tb.height / 2) / tf.imageH),
          content: tb.text,
          rank: tb.rank,
        },
        configs: { cancelToken },
      });
      if (withTranslation) {
        await api.translation.createTranslation({
          sourceID: src.data.id,
          data: {
            content: tb.translated,
            targetID: target.id,
          },
          // not using the cancel token, to make the saving operation closer to atomic
          // configs: { cancelToken },
        });
      }
    }

    async function saveTranslations(f: MFile, r: FilePreprocessResult) {
      if (r.texts.length === 0) {
        setFileState(
          f,
          formatMessage({
            id: 'fileList.aiTranslate.fileMessage.noTextDetected',
          }),
          stateIcons.skip,
        );
      }
      setFileState(
        f,
        formatMessage({ id: 'fileList.aiTranslate.fileMessage.saving' }),
        stateIcons.working,
      );
      const withTranslation = mode === 'all';
      const texts = uniqueRanks(r.texts);
      try {
        await Promise.all(
          texts.map((tb) =>
            moeflowApiLimiter.use(() => saveTextBlock(f, r, tb, withTranslation)),
          ),
        );
        if (withTranslation) {
          setFileState(
            f,
            formatMessage(
              { id: 'fileList.aiTranslate.fileMessage.success' },
              { count: texts.length },
            ),
            stateIcons.success,
          );
          onFileSaved?.({
            ...f,
            sourceCount: texts.length,
            translatedSourceCount: texts.length,
          });
        } else {
          setFileState(
            f,
            formatMessage(
              { id: 'fileList.aiTranslate.fileMessage.labeledCount' },
              { count: texts.length },
            ),
            stateIcons.success,
          );
          onFileSaved?.({
            ...f,
            sourceCount: texts.length,
          });
        }
      } catch (e) {
        debugLogger('save text block failed', e);
        setFileState(
          f,
          formatMessage({ id: 'fileList.aiTranslate.fileMessage.failSaving' }),
          stateIcons.fail,
        );
      }
    }
  }, []);
  return (
    <div>
      <p>
        {formatMessage(
          { id: 'fileList.aiTranslate.workingModal.content' },
          { fileCount: files.length },
        )}
      </p>
      <ul>
        {fileStates.map((state) => (
          <li key={state.file.id}>
            <span style={{ margin: '0 4px' }}>{state.icon}</span>
            {state.file.name} - {state.message}
          </li>
        ))}
      </ul>
    </div>
  );
};
