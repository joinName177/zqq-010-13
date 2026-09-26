/**
 * 全系统统一的容量边界（quota）。
 *
 * 超大聊天文件、超长消息会阻塞解析、撑破化石展示或令浏览器失去响应，
 * 因此文件体积、消息条数、单条文本、引用语料与导出体积均在此集中声明，
 * core / adapter / ui 三层必须共用同一组数值，避免各出口口径不一致。
 */

export const CAPACITY_LIMITS = {
  /** 导入文件的最大体积（10 MiB）。超过则在读取前拒绝，不进入解析流程。 */
  maxFileBytes: 10 * 1024 * 1024,
  /** 参与地层分析的最大消息条数（取时间最早的前 N 条）。 */
  maxMessages: 200_000,
  /** 单条消息内容保留的最大字符数；超出部分截断，但 wordCount 仍按原文统计。 */
  maxMessageChars: 2_000,
  /** 发送者名称最大字符数。 */
  maxSenderChars: 32,
  /** 化石卡片 / 报告中引用语料的最大字符数。 */
  maxQuoteChars: 120,
  /** 单个话题标签的最大字符数，防止超长 token 撑破标签云。 */
  maxTopicChars: 20,
  /** 导出文本档案的最大体积（2 MiB），超出则按层截断化石清单。 */
  maxExportBytes: 2 * 1024 * 1024,
  /** 导出档案中收录的代表性化石上限。 */
  maxExportRelics: 60
} as const;

export interface CapacityNotice {
  /** 触发的边界类型，用于界面标识与遥测。 */
  kind: 'file-size' | 'message-count' | 'message-length' | 'export-size';
  /** 实际观测到的体量（字节 / 条数 / 字符数）。 */
  observed: number;
  /** 边界值。 */
  limit: number;
  /** 面向参观者的说明文案。 */
  message: string;
}

/** 以字符数为边界截断文本，超长时追加省略标记；返回值总长度不超过 limit。 */
export function clipText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const ellipsis = '...';
  return text.slice(0, Math.max(0, limit - ellipsis.length)) + ellipsis;
}

/** 以 UTF-8 字节数估算文本体积（TextEncoder 不可用时退化为字符数）。 */
export function byteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return text.length;
}
