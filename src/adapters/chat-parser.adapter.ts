import { ChatMessage } from '../core/models';
import { ChatParserPort, ChatParseResult } from '../ports/chat-parser.port';
import { CAPACITY_LIMITS, CapacityError, clipText } from '../core/capacity-limits';

export class UniversalChatParserAdapter implements ChatParserPort {
  async parse(rawText: string): Promise<ChatParseResult> {
    // 防御性容量闸门：即便调用方绕过 UI 直接灌入超大文本，也不会进入全量拆分。
    let sourceTruncated = false;
    let source = rawText;
    if (source.length > CAPACITY_LIMITS.MAX_RAW_CHARS) {
      sourceTruncated = true;
      source = source.slice(0, CAPACITY_LIMITS.MAX_RAW_CHARS);
    }

    const lines = source.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
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

    // 超过条数上限后，按「识别到的消息头」精确计数被丢弃的消息，且不再累积其内容。
    let droppedMessages = 0;
    const atCapacity = () => messages.length >= CAPACITY_LIMITS.MAX_MESSAGES;
    const registerMessageStart = () => {
      if (atCapacity()) droppedMessages++;
    };

    const buildMessage = (
      sender: string,
      timestamp: Date,
      contentRaw: string,
      fallbackWordCount?: number
    ): ChatMessage => {
      const realLength = fallbackWordCount ?? contentRaw.length;
      return {
        id: `msg-${messages.length + 1}`,
        timestamp: new Date(timestamp),
        sender: clipText(sender, CAPACITY_LIMITS.MAX_SENDER_CHARS),
        content: clipText(contentRaw, CAPACITY_LIMITS.MAX_MESSAGE_CHARS),
        sentimentScore: 0,
        // wordCount 保留真实字数（裁剪前），统计口径不被展示边界影响
        wordCount: realLength
      };
    };

    const flush = () => {
      if (currentContent.length === 0) return;
      const text = currentContent.join('\n').trim();
      currentContent = [];
      if (!text || atCapacity()) return; // 达上限后的消息在其消息头处已计数
      messages.push(buildMessage(currentSender, currentTimestamp, text));
    };

    const isJsonObjectLine = (line: string) => line.startsWith('{') && line.endsWith('}');

    for (const line of lines) {
      // Check bracket pattern
      const bMatch = line.match(bracketPattern);
      if (bMatch) {
        flush();
        registerMessageStart();
        currentTimestamp = new Date(bMatch[1]);
        currentSender = bMatch[2].trim();
        if (!atCapacity()) currentContent.push(bMatch[3].trim());
        continue;
      }

      // Check QQ pattern
      const qMatch = line.match(qqPattern);
      if (qMatch) {
        flush();
        registerMessageStart();
        currentTimestamp = new Date(qMatch[1]);
        currentSender = qMatch[2].trim();
        continue;
      }

      // Check WeChat header pattern
      const wMatch = line.match(wechatPattern);
      if (wMatch) {
        flush();
        registerMessageStart();
        currentTimestamp = new Date(wMatch[1]);
        currentSender = wMatch[2].trim();
        continue;
      }

      // If JSON format
      if (isJsonObjectLine(line)) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.content || parsed.message || parsed.text) {
            flush();
            if (atCapacity()) {
              droppedMessages++;
              continue;
            }
            const rawContent: string = parsed.content || parsed.message || parsed.text;
            messages.push(
              buildMessage(
                parsed.sender || parsed.user || '未知者',
                parsed.timestamp ? new Date(parsed.timestamp) : new Date(),
                rawContent,
                (parsed.content || '').length || rawContent.length
              )
            );
            continue;
          }
        } catch {
          // not json, continue
        }
      }

      // Otherwise regular dialogue line（达上限后直接丢弃，避免无界累积撑爆内存）
      if (atCapacity()) continue;
      currentContent.push(line);
    }

    flush();

    // If still empty or no timestamps recognized, fallback to sequential mock dates
    if (messages.length === 0 && lines.length > 0) {
      droppedMessages = 0;
      const now = Date.now();
      lines.forEach((line, idx) => {
        if (atCapacity()) {
          droppedMessages++;
          return;
        }
        const parts = line.split(/[:：]/);
        const sender = parts.length > 1 ? parts[0] : (idx % 2 === 0 ? '挖掘目标A' : '挖掘目标B');
        const content = parts.length > 1 ? parts.slice(1).join(':') : line;
        const trimmed = content.trim();
        messages.push({
          id: `msg-${idx + 1}`,
          timestamp: new Date(now - (lines.length - idx) * 86400000 * 3),
          sender: sender.trim(),
          content: clipText(trimmed, CAPACITY_LIMITS.MAX_MESSAGE_CHARS),
          sentimentScore: 0,
          wordCount: trimmed.length
        });
      });
    }

    return { messages, sourceTruncated, droppedMessages };
  }
}

/** 供 UI 在读取文件前调用的文件级容量校验。 */
export function assertFileSizeAllowed(sizeBytes: number): void {
  if (sizeBytes > CAPACITY_LIMITS.MAX_FILE_BYTES) {
    throw new CapacityError(
      'FILE_TOO_LARGE',
      `文件过大，超过 ${CAPACITY_LIMITS.MAX_FILE_BYTES / (1024 * 1024)}MB 导入上限`,
      CAPACITY_LIMITS.MAX_FILE_BYTES,
      sizeBytes
    );
  }
}
