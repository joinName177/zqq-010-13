import { ChatMessage } from '../core/models';

export interface ChatParseResult {
  messages: ChatMessage[];
  /** 原始文本是否超过字符上限被截断（仅在前缀内解析） */
  sourceTruncated: boolean;
  /** 超过消息总条数上限而被丢弃的消息数 */
  droppedMessages: number;
}

export interface ChatParserPort {
  parse(rawText: string): Promise<ChatParseResult>;
}
