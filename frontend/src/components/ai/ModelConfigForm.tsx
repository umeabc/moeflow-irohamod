import React, { useEffect, useState } from 'react';
import { Form, Input, Select, Divider, Typography } from 'antd';
import * as LlmService from '@/services/ai/llm_preprocess';
import { useIntl } from 'react-intl';

/** 一键机翻模式可用性（由选中文件的 sourceCount 判定） */
export interface TranslateModeAvailability {
  allNoLabels: boolean;
  allHasLabels: boolean;
  mixed: boolean;
}

interface ModelConfigFormProps {
  initialValue?: LlmService.LLMConf;
  /** 可选预设（来自管理后台站点设置）；缺省时使用内置预设 */
  presets?: readonly LlmService.LLMConf[];
  onChange?: (config: LlmService.LLMConf) => void;
  availability?: TranslateModeAvailability;
  defaultMode?: LlmService.TranslateMode;
  onModeChange?: (mode: LlmService.TranslateMode) => void;
}

export const ModelConfigForm: React.FC<ModelConfigFormProps> = ({
  initialValue,
  presets = LlmService.llmPresets,
  onChange,
  availability,
  defaultMode,
  onModeChange,
}) => {
  const { formatMessage } = useIntl();
  const [form] = Form.useForm();
  const [mode, setMode] = useState<LlmService.TranslateMode>(
    defaultMode ?? 'all',
  );
  const [presetIndex, setPresetIndex] = useState<number>(-1);

  useEffect(() => {
    if (defaultMode) {
      setMode(defaultMode);
    }
  }, [defaultMode]);

  // Find matching preset index for initial value
  const findPresetIndex = (
    config: LlmService.LLMConf | undefined,
    list: readonly LlmService.LLMConf[],
  ): number => {
    if (!config) return -1;
    // 优先精确匹配 model + baseUrl
    let index = list.findIndex(
      (preset) =>
        preset.model === config.model && preset.baseUrl === config.baseUrl,
    );
    if (index >= 0) return index;
    // admin-key 预设允许用户改模型：按 baseUrl 兜底匹配
    index = list.findIndex(
      (preset) => preset.useAdminKey && preset.baseUrl === config.baseUrl,
    );
    return index >= 0 ? index : -1; // -1 for custom
  };

  const activePreset =
    presetIndex >= 0 && presetIndex < presets.length
      ? presets[presetIndex]
      : undefined;
  /** 选中「管理端密钥」预设时，隐藏 API URL / API KEY 两栏 */
  const hideCredentials = !!activePreset?.useAdminKey;

  useEffect(() => {
    if (initialValue) {
      const index = findPresetIndex(initialValue, presets);
      setPresetIndex(index);
      form.setFieldsValue({
        model: initialValue.model,
        baseUrl: initialValue.baseUrl,
        apiKey: initialValue.apiKey,
      });
      onChange?.(initialValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue, presets, form]);

  /** 由表单值与预设下标构造最终配置（admin-key 预设强制使用预设的 URL/KEY） */
  const buildConfig = (
    values: any,
    idx: number,
  ): LlmService.LLMConf => {
    const preset = idx >= 0 && idx < presets.length ? presets[idx] : undefined;
    const useAdminKey = !!preset?.useAdminKey;
    return {
      provider: preset?.provider ?? '',
      model: values.model ?? preset?.model ?? '',
      baseUrl: useAdminKey ? preset!.baseUrl : values.baseUrl,
      apiKey: useAdminKey ? preset!.apiKey : values.apiKey,
      useAdminKey,
    };
  };

  const emitConfig = (values: any, idx: number) => {
    const config = buildConfig(values, idx);
    if (config.useAdminKey) {
      // 隐藏字段也填入预设值，便于用户切回自定义时可见
      form.setFieldsValue({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey ?? '',
      });
    }
    onChange?.(config);
  };

  // Handle preset selection change
  const handlePresetChange = (index: number) => {
    setPresetIndex(index);
    const preset =
      index >= 0 && index < presets.length ? presets[index] : undefined;
    if (preset) {
      const patch = {
        model: preset.model,
        baseUrl: preset.baseUrl,
        apiKey: preset.apiKey || '',
      };
      form.setFieldsValue(patch);
      emitConfig(patch, index);
    } else {
      // 自定义：保留现有输入
      emitConfig(form.getFieldsValue(), index);
    }
  };

  // Handle form values change
  const handleFormChange = (changedValues: any, allValues: any) => {
    const values = form.getFieldsValue();
    let idx = presetIndex;
    // 仅当用户手动修改 baseUrl 时重新判定预设（admin-key 预设允许改模型）
    if (changedValues.baseUrl !== undefined) {
      idx = presets.findIndex(
        (preset) =>
          preset.model === allValues.model &&
          preset.baseUrl === allValues.baseUrl,
      );
      idx = idx >= 0 ? idx : -1;
      setPresetIndex(idx);
    }
    emitConfig({ ...values, ...allValues }, idx);
  };

  return (
    <div>
      <Typography.Title level={5}>
        {formatMessage({ id: 'fileList.aiTranslate.configModal.title' })}
      </Typography.Title>
      <p>
        {formatMessage({ id: 'fileList.aiTranslate.configModal.modelDesc' })}
      </p>
      <p>
        {formatMessage({
          id: 'fileList.aiTranslate.configModal.modelRequirements',
        })}
      </p>
      <p>
        {formatMessage({
          id: 'fileList.aiTranslate.configModal.configsAreLocal',
        })}
      </p>

      <Form form={form} layout="vertical" onValuesChange={handleFormChange}>
        {/* 翻译模式：下拉选择，置于下方各下拉栏前方 */}
        <Form.Item
          label={formatMessage({ id: 'fileList.aiTranslate.mode.title' })}
        >
          <Select
            value={mode}
            style={{ width: '100%' }}
            onChange={(v) => {
              const next = v as LlmService.TranslateMode;
              setMode(next);
              onModeChange?.(next);
            }}
          >
            <Select.Option
              value="all"
              disabled={availability?.allHasLabels}
            >
              {formatMessage({ id: 'fileList.aiTranslate.mode.all.label' })}
            </Select.Option>
            <Select.Option
              value="label-only"
              disabled={availability?.allHasLabels}
            >
              {formatMessage({ id: 'fileList.aiTranslate.mode.labelOnly.label' })}
            </Select.Option>
            <Select.Option
              value="translate-only"
              disabled={availability?.allNoLabels}
            >
              {formatMessage({
                id: 'fileList.aiTranslate.mode.translateOnly.label',
              })}
            </Select.Option>
          </Select>
        </Form.Item>
        <p
          style={{
            color: 'var(--moeflow-textColorSecondary)',
            marginTop: -8,
            marginBottom: 12,
            fontSize: 12,
          }}
        >
          {formatMessage({ id: 'fileList.aiTranslate.mode.desc' })}
        </p>

        <Form.Item
          label={formatMessage({
            id: 'fileList.aiTranslate.configModal.presets.label',
          })}
        >
          <Select
            value={presetIndex}
            placeholder={formatMessage({
              id: 'fileList.aiTranslate.configModal.presets.placeholder',
            })}
            onChange={handlePresetChange}
          >
            {presets.map((preset, i) => (
              <Select.Option key={i} value={i}>
                {preset.provider} / {preset.model}
                {preset.useAdminKey
                  ? ` · ${formatMessage({
                      id: 'fileList.aiTranslate.configModal.presets.adminKey',
                    })}`
                  : ''}
              </Select.Option>
            ))}
            <Select.Option key={-1} value={-1}>
              {formatMessage({
                id: 'fileList.aiTranslate.configModal.presets.custom',
              })}
            </Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          label={formatMessage({
            id: 'fileList.aiTranslate.configModal.model.label',
          })}
          name="model"
          rules={[
            {
              required: true,
              message: formatMessage({
                id: 'fileList.aiTranslate.configModal.model.required',
              }),
            },
          ]}
        >
          <Input
            placeholder="e.g., gemini-3.5-flash, gpt-5.6-sol, deepseek-v4-flash-vision-exp"
            autoComplete="llm-model"
          />
        </Form.Item>

        {hideCredentials ? (
          <p
            style={{
              color: 'var(--moeflow-textColorSecondary)',
              marginTop: -8,
              marginBottom: 12,
              fontSize: 12,
            }}
          >
            {formatMessage({
              id: 'fileList.aiTranslate.configModal.presets.adminKeyHint',
            })}
          </p>
        ) : (
          <>
            <Form.Item
              label={formatMessage({
                id: 'fileList.aiTranslate.configModal.baseUrl.label',
              })}
              name="baseUrl"
              rules={[
                {
                  required: true,
                  message: formatMessage({
                    id: 'fileList.aiTranslate.configModal.baseUrl.required',
                  }),
                },
                {
                  type: 'url',
                  message: formatMessage({
                    id: 'fileList.aiTranslate.configModal.baseUrl.invalidUrl',
                  }),
                },
              ]}
            >
              <Input
                placeholder="https://api.example.com/v1/"
                maxLength={200}
                autoComplete="llm-base-url"
              />
            </Form.Item>

            <Form.Item
              label={formatMessage({
                id: 'fileList.aiTranslate.configModal.apiKey.label',
              })}
              name="apiKey"
              rules={[
                {
                  required: true,
                  message: formatMessage({
                    id: 'fileList.aiTranslate.configModal.apiKey.required',
                  }),
                },
              ]}
            >
              <Input.Password
                placeholder="Enter your API key"
                autoComplete="off"
              />
            </Form.Item>
          </>
        )}
      </Form>

      <Divider />
    </div>
  );
};
