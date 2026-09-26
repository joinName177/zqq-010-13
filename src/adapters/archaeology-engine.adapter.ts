import { ChatMessage, ArchaeologyReport } from '../core/models';
import { analyzeChatStrata } from '../core/archaeology-engine';
import { ArchaeologyPort } from '../ports/archaeology.port';
import { CapacityNotice } from '../core/capacity-limits';

export class ArchaeologyEngineAdapter implements ArchaeologyPort {
  excavateSite(
    messages: ChatMessage[],
    siteName?: string,
    capacityNotices: CapacityNotice[] = []
  ): ArchaeologyReport {
    return analyzeChatStrata(messages, siteName, capacityNotices);
  }
}
