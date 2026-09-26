import { ChatMessage, ArchaeologyReport } from '../core/models';
import { analyzeChatStrata } from '../core/archaeology-engine';
import { ArchaeologyPort } from '../ports/archaeology.port';
import { CAPACITY_LIMITS, clipText } from '../core/capacity-limits';

export interface ExcavationGuard {
  /** 是否因超过消息总条数上限而丢弃尾部消息（按传入顺序） */
  truncated: boolean;
  acceptedMessages: number;
  droppedMessages: number;
}

export class ArchaeologyEngineAdapter implements ArchaeologyPort {
  excavateSite(messages: ChatMessage[], siteName?: string): ArchaeologyReport {
    return analyzeChatStrata(messages, siteName);
  }

  /**
   * 核心层容量闸门：无论上游（解析适配器 / 内置标本 / 外部调用）传入何种数据，
   * 进入领域分析前统一收敛条数与单条文本长度。
   * wordCount 保留真实字数，统计总数以实际纳入分析的消息为准。
   */
  enforceCapacity(messages: ChatMessage[]): { messages: ChatMessage[]; guard: ExcavationGuard } {
    const accepted = messages.slice(0, CAPACITY_LIMITS.MAX_MESSAGES).map((m, idx) => {
      const content = m.content;
      return {
        ...m,
        id: m.id || `msg-${idx + 1}`,
        sender: clipText(m.sender || '未知者', CAPACITY_LIMITS.MAX_SENDER_CHARS),
        content: clipText(content, CAPACITY_LIMITS.MAX_MESSAGE_CHARS),
        wordCount: typeof m.wordCount === 'number' && m.wordCount >= content.length
          ? m.wordCount
          : content.length
      };
    });

    const droppedMessages = Math.max(0, messages.length - accepted.length);
    return {
      messages: accepted,
      guard: {
        truncated: droppedMessages > 0,
        acceptedMessages: accepted.length,
        droppedMessages
      }
    };
  }
}
