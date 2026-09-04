import { Modal } from 'antd';
import { File as MFile, Target } from '@/interfaces';
import { createDebugLogger } from '@/utils/debug-logger';
import { ModalStaticFunctions } from 'antd/lib/modal/confirm';

import { ModelConfigForm, TranslateModeAvailability } from './ModelConfigForm';
import { BatchTranslateModalContent } from './BatchTranslateModal';
import { useMemo } from 'react';
import {
  LLMConf,
  llmPresets,
  TranslateMode,
} from '@/services/ai/llm_preprocess';
import { llmConfStorage } from '@/utils/storage';
import { IntlShape, useIntl } from 'react-intl';

const debugLogger = createDebugLogger('components:project:FileListAiTranslate');

export type ModalHandle = ReturnType<typeof Modal.confirm>;

interface TranslationCallbacks {
  onFileSaved?(f: MFile): void;
}

interface TranslatorApi {
  start(callbacks: TranslationCallbacks): Promise<void>;
  testModel?(modelConf: LLMConf): Promise<{ worked: boolean; message: string }>;
}

/** 由选中文件的 sourceCount 判定一键机翻模式可用性 */
function computeAvailability(files: MFile[]): TranslateModeAvailability {
  const counts = files.map((f) => f.sourceCount ?? 0);
  const allNoLabels = counts.length > 0 && counts.every((c) => c === 0);
  const allHasLabels = counts.length > 0 && counts.every((c) => c > 0);
  return { allNoLabels, allHasLabels, mixed: !allNoLabels && !allHasLabels };
}

function bind(
  files: MFile[],
  target: Target,
  modal: ModalStaticFunctions,
  { formatMessage }: IntlShape,
): TranslatorApi {
  const availability = computeAvailability(files);
  return {
    start,
    // testModel,
  };
  async function start(callbacks: TranslationCallbacks) {
    const llmConfAndMode = await new Promise<
      { config: LLMConf; mode: TranslateMode } | null
    >((resolve, reject) => {
      let confValue: LLMConf = llmConfStorage.load() ?? {
        ...llmPresets.at(0)!,
      };
      let modeValue: TranslateMode = availability.allHasLabels
        ? 'translate-only'
        : 'all';
      const onChange = (conf: LLMConf) => {
        debugLogger('model configured', conf);
        confValue = conf;
        if (confValue.model && confValue.baseUrl && confValue.apiKey) {
          handle.update({ okButtonProps: {} });
        }
      };
      const onModeChange = (mode: TranslateMode) => {
        modeValue = mode;
      };
      const handle = modal.confirm({
        icon: null,
        content: (
          <ModelConfigForm
            initialValue={confValue}
            onChange={onChange}
            availability={availability}
            defaultMode={modeValue}
            onModeChange={onModeChange}
          />
        ),
        okText: formatMessage({ id: 'fileList.aiTranslate.startTranslate' }),
        okButtonProps: { disabled: true },
        onOk: () => {
          resolve({ config: confValue, mode: modeValue });
        },
        onCancel: () => {
          resolve(null);
        },
      });
    });
    if (!llmConfAndMode) {
      return;
    }
    const { config: llmConf, mode } = llmConfAndMode;
    llmConfStorage.save(llmConf);

    await new Promise<boolean>((resolve) => {
      const handle = modal.confirm({
        icon: null,
        content: (
          <BatchTranslateModalContent
            llmConf={llmConf}
            mode={mode}
            files={files}
            target={target}
            onFileSaved={callbacks.onFileSaved}
            getHandle={() => handle as ModalHandle}
          />
        ),
        okButtonProps: { disabled: true },
        onOk: () => {
          resolve(true);
        },
        onCancel: () => {
          resolve(false);
        },
      });
    });
  }
}

export function useAiTranslate(
  files: MFile[],
  target: Target,
): [true, TranslatorApi, React.ReactNode] | [false, null, null] {
  const [modal, contextHolder] = Modal.useModal();
  const intl = useIntl();

  const api = useMemo(
    () => bind(files, target, modal as ModalStaticFunctions, intl),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target.id, files.map((file) => file.id).join('|')],
  );

  return [true, api, contextHolder];
}
