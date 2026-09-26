import { ChatMessage } from '../core/models';
import { CapacityNotice } from '../core/capacity-limits';

export interface ParseResult {
  /** 参与后续分析的消息（已施加条数与单条长度边界）。 */
  messages: ChatMessage[];
  /** 解析过程中触发的容量保护记录。 */
  capacityNotices: CapacityNotice[];
}

export interface ChatParserPort {
  parse(rawText: string): Promise<ParseResult>;
}
