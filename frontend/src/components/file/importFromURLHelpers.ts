/**
 * 批量 URL 导入的纯函数工具
 * 无副作用、无依赖，便于独立单测。
 */

/** 批量最大行数 */
export const BATCH_MAX_LINES = 50;

/** 单行 URL 的解析状态 */
export type BatchLineStatus = 'pending' | 'running' | 'completed' | 'failed';

/** 批量导入的行条目 */
export interface BatchLineItem {
  lineNo: number;  // 物理行号（从 1 开始）
  url: string;     // 原始 trim 后的 URL 字符串
  status: BatchLineStatus;
  imported: number;
  duplicated: number;
  error?: string;
}

/** 解析 URL 文本块，返回：
 *  - lines: 有效（含格式错误）行列表
 *  - error: 整批被拒绝时的错误信息 key（'file.importUrlRequired' / 'file.importBatchTooMany'）
 *  - errorParams: 整批错误的插值参数
 */
export function parseUrlLines(raw: string): {
  lines: BatchLineItem[];
  error?: string;
  errorParams?: Record<string, string | number>;
} {
  // 按行拆分（保留物理行号）
  const rawLines = raw.split(/\r?\n/);
  // 计算非空行
  const nonEmpty = rawLines
    .map((line, idx) => ({ lineNo: idx + 1, text: line.trim() }))
    .filter((l) => l.text.length > 0);

  // 全空
  if (nonEmpty.length === 0) {
    return { lines: [], error: 'file.importUrlRequired' };
  }

  // 超出限制
  if (nonEmpty.length > BATCH_MAX_LINES) {
    return {
      lines: [],
      error: 'file.importBatchTooMany',
      errorParams: { max: BATCH_MAX_LINES, count: nonEmpty.length },
    };
  }

  // 逐行创建 BatchLineItem，格式错误标 failed
  const lines: BatchLineItem[] = nonEmpty.map(({ lineNo, text }) => {
    if (!isValidHttpUrl(text)) {
      return {
        lineNo,
        url: text,
        status: 'failed' as BatchLineStatus,
        imported: 0,
        duplicated: 0,
        error: 'file.importBatchInvalidUrl',
      };
    }
    return {
      lineNo,
      url: text,
      status: 'pending' as BatchLineStatus,
      imported: 0,
      duplicated: 0,
    };
  });

  return { lines };
}

/** 粗检 http/https URL：使用 new URL() + 非空 hostname */
export function isValidHttpUrl(text: string): boolean {
  try {
    const u = new URL(text);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/** 从 FailureResults 错误对象提取可读文本
 *  - e.data.message 可能是字符串或字段 map
 *  - 兜底返回 fallback
 */
export function extractErrorMessage(
  e: unknown,
  fallback = 'file.importBatchUnknownError',
): string {
  if (!e || typeof e !== 'object') {
    return fallback;
  }
  const err = e as Record<string, unknown>;
  const data = err['data'] as Record<string, unknown> | undefined;
  if (!data) {
    return fallback;
  }
  const msg = data['message'];
  if (typeof msg === 'string') {
    return msg;
  }
  if (msg && typeof msg === 'object') {
    // 字段错误 map：展平为逐行文本
    const entries = Object.entries(msg as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('; ') : String(v)}`)
      .join('; ');
    if (entries) {
      return entries;
    }
  }
  return fallback;
}

/** 计算批次汇总统计 */
export function calcBatchSummary(lines: BatchLineItem[]): {
  imported: number;
  duplicated: number;
  failed: number;
} {
  let imported = 0;
  let duplicated = 0;
  let failed = 0;
  for (const l of lines) {
    imported += l.imported;
    duplicated += l.duplicated;
    if (l.status === 'failed') {
      failed += 1;
    }
  }
  return { imported, duplicated, failed };
}
