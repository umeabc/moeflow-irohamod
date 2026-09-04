import { z } from 'zod';
import {
  generateText,
  GenerateTextOptions,
  SystemMessage,
  UserMessage,
} from 'xsai';
import { tool } from '@xsai/tool';
import { createDebugLogger } from '@/utils/debug-logger';

const debugLogger = createDebugLogger('services:ai:llm_preprocess');

export interface LLMConf {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey?: string;
  extraPrompt?: string;
}

export const llmPresets: readonly Readonly<LLMConf>[] = [
  // gemini:
  // see https://ai.google.dev/gemini-api/docs/openai
  ...['gemini-3.5-flash', 'gemini-3.7-flash'].map((model) => ({
    provider: 'Google',
    model,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  })),
  // OpenAI models: see https://platform.openai.com/docs/models
  ...['gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-5.6-terra'].map((model) => ({
    provider: 'OpenAI',
    model,
    baseUrl: 'https://api.openai.com/v1/',
  })),
  // Anthropic models in OpenAI compatible format: https://docs.claude.com/en/api/openai-sdk
  ...['claude-sonnet-5', 'claude-sonnet-4-6'].map((model) => ({
    provider: 'Anthropic',
    model,
    baseUrl: 'https://api.anthropic.com/v1/',
  })),
  // Deepseek models in OpenAI compatible format
  ...['deepseek-v4-flash-vision-exp'].map((model) => ({
    provider: 'Deepseek',
    model,
    baseUrl: 'https://api.deepseek.com/v1/',
  })),
  // SpaceXAI (xAI) models in OpenAI compatible format
  ...['grok-4.6'].map((model) => ({
    provider: 'SpaceXAI',
    model,
    baseUrl: 'https://api.x.ai/v1/',
  })),
];

const filePreprocessResultSchema = z.object({
  imageW: z.number({ message: 'the width of the image in PX' }),
  imageH: z.number({ message: 'the height of the image in PX' }),
  texts: z.array(
    z.object({
      rank: z
        .number()
        .int()
        .describe('unique label/rank number within the image, follow reading order'),
      left: z
        .number()
        .describe('left coordinate of the text in PX, in the whole image'),
      top: z
        .number()
        .describe('top coordinate of the text in PX, in the whole image'),
      width: z.number().describe('width of the text in PX'),
      height: z.number().describe('height of the text in PX'),
      textLines: z.array(z.string()).describe('the text lines'),
      text: z.string().describe('concatenated original text'),
      translated: z.string().describe('translated text'),
      comment: z
        .string()
        .describe('additional comment of the text, or the translation'),
    }),
  ),
});

export type FilePreprocessResult = z.infer<typeof filePreprocessResultSchema>;

/** 仅翻译：坐标无需输出，减少 VLM 出错面 */
const translateOnlyResultSchema = z.object({
  texts: z.array(
    z.object({
      rank: z
        .number()
        .int()
        .describe('must equal one of the known label numbers'),
      translated: z.string().describe('translated text'),
    }),
  ),
});

export type TranslateOnlyResult = z.infer<typeof translateOnlyResultSchema>;

export type TranslateMode = 'all' | 'label-only' | 'translate-only';

export interface AILabel {
  rank: number;
  content: string;
  x: number;
  y: number;
}

export interface LLMTranslateOptions {
  mode?: TranslateMode;
  labels?: AILabel[];
}

/**
 * 调用视觉大模型：
 * - mode 'all'：检测文字框 + 生成标号 + 翻译（沿用原逻辑）
 * - mode 'label-only'：仅检测文字框 + 生成标号（不翻译）
 * - mode 'translate-only'：图已有标号，注入 rank->原文 + 画框标注，模型仅输出 rank+译文
 */
export async function llmTranslateImage(
  llmConf: LLMConf,
  targetLang: string,
  imgBlob: Blob,
  opts: LLMTranslateOptions = {},
  abortSignal?: AbortSignal,
): Promise<FilePreprocessResult | TranslateOnlyResult> {
  const { mode = 'all', labels = [] } = opts;

  if (mode === 'translate-only') {
    const labelList = labels
      .map((label) => `- label ${label.rank}: \"${label.content ?? ''}\"`)
      .join('\n');
    const userMessage: UserMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            `The image contains numbered labels. For each label, translate the text in that region to ${targetLang}.\n` +
            `The known labels are:\n${labelList}\n` +
            `Return one item per label, setting rank to one of the known label numbers above. Do not invent new labels.` +
            ` ${llmConf.extraPrompt || ''}`,
        },
        {
          type: 'image_url',
          image_url: {
            url: await img2dataurl(imgBlob),
            detail: 'high',
          },
        },
      ],
    };
    const messages: (UserMessage | SystemMessage)[] = [
      {
        content:
          'You are a helpful assistant. Please do as user instructs. The translations should be submitted using the provided tool.',
        role: 'system',
      },
      userMessage,
    ];
    return callModelWithTools<TranslateOnlyResult>(
      messages,
      translateOnlyResultSchema,
      llmConf,
      abortSignal,
    );
  }

  const instruction =
    mode === 'label-only'
      ? 'Please detect every text box in the image. Assign each text box a unique rank number following reading order. Output text, rank and coordinates. Do NOT translate — leave the translated field empty.'
      : `Please translate the image to ${targetLang}.`;
  const userMessage: UserMessage = {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `${instruction} ${llmConf.extraPrompt || ''}`,
      },
      {
        type: 'image_url',
        image_url: {
          url: await img2dataurl(imgBlob),
          detail: 'high',
        },
      },
    ],
  };

  const messages: (UserMessage | SystemMessage)[] = [
    {
      content:
        'You are a helpful assistant. Please do as user instructs. The extracted text and translations should be submitted using the provided tool.',
      role: 'system',
    },
    userMessage,
  ];

  let ret = await callModelWithTools<FilePreprocessResult>(
    messages,
    filePreprocessResultSchema,
    llmConf,
    abortSignal,
  );
  if (llmConf.model?.toLowerCase().includes('gemini-')) {
    debugLogger('gemini workaround: set coords to 1000 scale');
    ret = {
      ...ret,
      // gemini-only workaround: gemini returns coords in [0, 1000] scale
      // see https://ai.google.dev/gemini-api/docs/image-understanding
      imageH: 1000,
      imageW: 1000,
    };
  }
  return ret;
}

async function callModelWithTools<T>(
  messages: (UserMessage | SystemMessage)[],
  schema: any,
  llmConf: LLMConf,
  abortSignal?: AbortSignal,
): Promise<T> {
  let submittedResult: T | null = null;
  const submitTool = await tool({
    execute: (_result) => {
      submittedResult = _result as T;
      return 'saved';
    },
    parameters: schema,
    name: 'submit',
    description: 'Submit the result of preprocessing the image',
  });

  const generateConf: GenerateTextOptions = {
    messages,
    headers: {
      // Anthropic-only workaround, to call API from browser (otherwise it rejects with CORS error).
      ...(llmConf.model.toLowerCase().includes('claude-') && {
        'anthropic-dangerous-direct-browser-access': 'true',
      }),
    },
    tools: [submitTool],
    baseURL: llmConf.baseUrl,
    model: llmConf.model,
    apiKey: llmConf.apiKey,
    abortSignal,
  };
  await generateText(generateConf);

  if (!submittedResult) {
    throw new Error('LLM did not submit the result using the tool.');
  }
  return submittedResult;
}

/**
 * 在图上画标号标记：以 (x*W, y*H) 为中心画半透明圆点，并在旁边写 rank 号。
 * 供「仅翻译」在喂给模型前标注已有标号位置。
 */
export async function annotateImage(
  imgBlob: Blob,
  labels: { rank: number; x: number; y: number }[],
): Promise<Blob> {
  const url = URL.createObjectURL(imgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to load image for annotation'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('canvas 2d context unavailable');
    }
    ctx.drawImage(img, 0, 0);
    const W = canvas.width;
    const H = canvas.height;
    const radius = Math.max(12, Math.round(W / 70));
    ctx.font = `bold ${Math.max(18, Math.round(W / 55))}px sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (const label of labels) {
      const cx = label.x * W;
      const cy = label.y * H;
      ctx.fillStyle = 'rgba(255, 101, 124, 0.85)';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(String(label.rank), cx, cy);
    }
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob failed'))),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function img2dataurl(img: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(img);
  });
}
