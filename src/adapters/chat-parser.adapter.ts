import { ChatMessage } from '../core/models';
import { ChatParserPort, ParseResult } from '../ports/chat-parser.port';
import { CAPACITY_LIMITS, CapacityNotice, clipText } from '../core/capacity-limits';

export class UniversalChatParserAdapter implements ChatParserPort {
  async parse(rawText: string): Promise<ParseResult> {
    const capacityNotices: CapacityNotice[] = [];
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const messages: ChatMessage[] = [];

    // Regex patterns for WeChat, QQ, SMS
    // WeChat: 2023-08-12 21:04:12 张三
    const wechatPattern = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s+(.*?)(?::|：)?$/;
    // QQ: 2023-08-12 21:04:12 张三(123456)
    const qqPattern = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s+(.*?)\(\d+\)$/;
    // SMS / simple: [2023-08-12 21:04] 张三: 内容
    const bracketPattern = /^\[?(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\]?\s+([^:：]+)[：:](.*)$/;

    let currentSender = '发件人';
    let currentTimestamp = new Date();
    let currentContent: string[] = [];
    let truncatedMessages = 0;
    let messageCapHit = false;

    const buildMessage = (sender: string, timestamp: Date, text: string): ChatMessage => {
      const fullLength = text.length;
      const clipped = clipText(text, CAPACITY_LIMITS.maxMessageChars);
      if (clipped.length < fullLength) truncatedMessages++;
      return {
        id: `msg-${messages.length + 1}`,
        timestamp: new Date(timestamp),
        // 发送者名称同样限长，避免超长昵称撑破化石卡片与地层标注
        sender: clipText(sender.trim(), CAPACITY_LIMITS.maxSenderChars) || '未知者',
        content: clipped,
        sentimentScore: 0,
        // 统计口径始终基于原文长度，不受展示截断影响
        wordCount: fullLength,
        truncated: clipped.length < fullLength
      };
    };

    const flush = () => {
      if (currentContent.length === 0 || messages.length >= CAPACITY_LIMITS.maxMessages) {
        currentContent = [];
        return;
      }
      const text = currentContent.join('\n').trim();
      currentContent = [];
      if (text) messages.push(buildMessage(currentSender, currentTimestamp, text));
    };

    for (let li = 0; li < lines.length; li++) {
      if (messages.length >= CAPACITY_LIMITS.maxMessages) {
        messageCapHit = true;
        break;
      }
      const line = lines[li];

      // Check bracket pattern
      const bMatch = line.match(bracketPattern);
      if (bMatch) {
        flush();
        currentTimestamp = new Date(bMatch[1]);
        currentSender = bMatch[2];
        currentContent.push(bMatch[3].trim());
        continue;
      }

      // Check QQ pattern
      const qMatch = line.match(qqPattern);
      if (qMatch) {
        flush();
        currentTimestamp = new Date(qMatch[1]);
        currentSender = qMatch[2];
        continue;
      }

      // Check WeChat header pattern
      const wMatch = line.match(wechatPattern);
      if (wMatch) {
        flush();
        currentTimestamp = new Date(wMatch[1]);
        currentSender = wMatch[2];
        continue;
      }

      // If JSON format
      if (line.startsWith('{') && line.endsWith('}')) {
        try {
          const parsed = JSON.parse(line);
          const rawContent: string = parsed.content || parsed.message || parsed.text || '';
          if (rawContent) {
            flush();
            if (messages.length < CAPACITY_LIMITS.maxMessages) {
              messages.push(buildMessage(parsed.sender || parsed.user || '未知者', parsed.timestamp ? new Date(parsed.timestamp) : new Date(), rawContent));
            }
            continue;
          }
        } catch {
          // not json, continue
        }
      }

      // Otherwise regular dialogue line
      currentContent.push(line);
    }

    flush();

    if (messageCapHit) {
      // 余下的每个非空行至少对应一条尚未处理的记录（多行消息会更少），
      // 因此这里以剩余行数作为保守下界告知参观者。
      capacityNotices.push({
        kind: 'message-count',
        observed: lines.length,
        limit: CAPACITY_LIMITS.maxMessages,
        message: `文件包含超过 ${CAPACITY_LIMITS.maxMessages.toLocaleString()} 条对话记录，为保证浏览稳定，仅对文件中最早解析出的前 ${CAPACITY_LIMITS.maxMessages.toLocaleString()} 条进行地层切片，各层统计均基于该分析窗口。`
      });
    }

    // If still empty or no timestamps recognized, fallback to sequential mock dates
    if (messages.length === 0 && lines.length > 0) {
      const now = Date.now();
      const total = Math.min(lines.length, CAPACITY_LIMITS.maxMessages);
      if (lines.length > CAPACITY_LIMITS.maxMessages) {
        capacityNotices.push({
          kind: 'message-count',
          observed: lines.length,
          limit: CAPACITY_LIMITS.maxMessages,
          message: `文件包含超过 ${CAPACITY_LIMITS.maxMessages.toLocaleString()} 行文本，为保证浏览稳定，仅对前 ${CAPACITY_LIMITS.maxMessages.toLocaleString()} 行进行地层切片。`
        });
      }
      for (let idx = 0; idx < total; idx++) {
        const line = lines[idx];
        const parts = line.split(/[:：]/);
        const sender = parts.length > 1 ? parts[0] : (idx % 2 === 0 ? '挖掘目标A' : '挖掘目标B');
        const content = parts.length > 1 ? parts.slice(1).join(':') : line;
        messages.push(buildMessage(sender, new Date(now - (total - idx) * 86400000 * 3), content.trim()));
      }
    }

    if (truncatedMessages > 0) {
      capacityNotices.push({
        kind: 'message-length',
        observed: truncatedMessages,
        limit: CAPACITY_LIMITS.maxMessageChars,
        message: `有 ${truncatedMessages.toLocaleString()} 条超长消息在展示与化石取样时截断至 ${CAPACITY_LIMITS.maxMessageChars.toLocaleString()} 字，字数统计仍按原文计算。`
      });
    }

    return { messages, capacityNotices };
  }
}
