/**
 * 全局容量边界（单一事实源）。
 *
 * 超大聊天文件 / 超长消息会阻塞解析、撑破化石陈列或使浏览器失去响应。
 * 解析适配器、分析引擎、导出适配器与 UI 都必须引用此处常量，
 * 保证「文件 → 消息 → 引用 → 导出」各环节使用同一套边界口径，
 * 且核心统计（消息总数、分层计数、真实字数）始终基于同一批纳入分析的消息。
 */
export const CAPACITY_LIMITS = {
  /** 允许导入的原始文件字节数上限（UI 在读取文件内容前拦截） */
  MAX_FILE_BYTES: 20 * 1024 * 1024,
  /** 解析端口允许处理的原始字符数上限（防御非 UI 调用方直接灌入大文本） */
  MAX_RAW_CHARS: 10_000_000,
  /** 纳入地层分析的最大消息条数，超出部分不参与任何统计 */
  MAX_MESSAGES: 100_000,
  /** 单条消息保留的最大字符数；展示与分析使用裁剪文本，wordCount 仍保留真实字数 */
  MAX_MESSAGE_CHARS: 8_000,
  /** 发送者名称保留的最大字符数 */
  MAX_SENDER_CHARS: 64,
  /** 化石引文展示 / 导出的最大字符数 */
  MAX_QUOTE_CHARS: 120,
  /** 单个话题词的最大字符数，防止无标点超长字符串独霸话题云 */
  MAX_TOPIC_CHARS: 32,
  /** 每层最多陈列的化石件数 */
  MAX_RELICS_PER_LAYER: 2,
  /** 遗址名称保留的最大字符数 */
  MAX_SITE_NAME_CHARS: 80,
  /** 文本导出档案的最大字节数（UTF-8 编码后计量） */
  MAX_EXPORT_BYTES: 2 * 1024 * 1024
} as const;

export type CapacityLimitCode = 'FILE_TOO_LARGE' | 'SOURCE_TOO_LARGE' | 'EXPORT_TOO_LARGE';

export class CapacityError extends Error {
  readonly code: CapacityLimitCode;
  readonly limit: number;
  readonly actual: number;

  constructor(code: CapacityLimitCode, message: string, limit: number, actual: number) {
    super(message);
    this.name = 'CapacityError';
    this.code = code;
    this.limit = limit;
    this.actual = actual;
  }
}

const ELLIPSIS = '…';

/** 按字符数裁剪文本，超长时保留省略标记；永不返回超出 maxChars 的字符串。 */
export function clipText(input: string, maxChars: number): string {
  if (maxChars <= 0) return '';
  if (input.length <= maxChars) return input;
  if (maxChars <= 1) return ELLIPSIS;
  return input.slice(0, maxChars - 1) + ELLIPSIS;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
