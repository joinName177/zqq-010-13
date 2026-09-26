import { CapacityNotice } from './capacity-limits';

export interface ChatMessage {
  id: string;
  timestamp: Date;
  sender: string;
  content: string;
  sentimentScore: number; // -1.0 to 1.0
  wordCount: number; // 按原文统计；content 被容量边界截断时仍反映真实长度
  truncated?: boolean; // 原文超过 maxMessageChars 已被截断
}

export type RelicCategory = '初识刻石' | '誓约泥版' | '交锋裂痕' | '深夜篝火' | '寂静化石';

export interface FossilArtifact {
  id: string;
  name: string;
  category: RelicCategory;
  depthMeters: number;
  dateStr: string;
  sender: string;
  quote: string;
  archaeologicalNotes: string;
  preservationScore: number; // 0 - 100
}

export interface EmotionalSediment {
  warmth: number;   // 依恋温存 %
  longing: number;  // 牵挂思念 %
  daily: number;    // 生活琐碎 %
  friction: number; // 情绪摩擦 %
  silence: number;  // 沉默冷却 %
}

export interface StrataLayer {
  depthLevel: number; // 1 to 5 (1 = 最浅层，5 = 最深古基岩)
  epochName: string;
  geologicalCode: string;
  lithology: string; // 岩性描述 (如：风化黄土带, 细砂沉积带, 坚硬花岗基岩)
  timeRange: { start: string; end: string };
  messageCount: number;
  temperatureCelsius: number; // 关系温度 (0 - 100)
  dominantTopics: string[];
  sediment: EmotionalSediment;
  fossilRelics: FossilArtifact[];
  colorHex: string;
  soilPattern: string;
}

export interface ArchaeologyReport {
  siteCode: string;
  siteName: string;
  excavatedAt: string;
  totalMessages: number;
  totalDays: number;
  carbon14Activity: number; // 碳14残留活性 %
  strata: StrataLayer[];
  notableRelics: FossilArtifact[];
  peakEpoch: string;
  coolingEpoch: string;
  archaeologicalSummary: string;
  curatorAssessment: string;
  /** 容量保护触发记录：为保证浏览稳定而执行的截断/取样说明（无触发时为空数组）。 */
  capacityNotices: CapacityNotice[];
}
