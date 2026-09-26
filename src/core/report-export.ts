import { ArchaeologyReport } from './models';
import { CAPACITY_LIMITS, CapacityNotice, byteLength } from './capacity-limits';

export interface ReportExport {
  /** 导出档案纯文本（UTF-8 体积不超过 maxExportBytes）。 */
  text: string;
  /** 导出过程中触发的容量记录（含上游分析阶段的记录）。 */
  notices: CapacityNotice[];
  /** 是否因体积边界截断了化石清单。 */
  truncated: boolean;
}

/**
 * 基于同一份报告快照生成可导出的纯文本档案。
 * 界面预览、打印与文件下载都只能经由这里取得导出内容，
 * 保证“预览即所得、导出即所预览”，且体积受控。
 */
export function buildReportExport(report: ArchaeologyReport): ReportExport {
  const notices: CapacityNotice[] = [...report.capacityNotices];

  const lines: string[] = [];
  lines.push('══════════════════════════════════════════');
  lines.push('            关 系 考 古 发 掘 报 告');
  lines.push('══════════════════════════════════════════');
  lines.push(`遗址名称：${report.siteName}`);
  lines.push(`遗址编号：${report.siteCode}`);
  lines.push(`发掘时间：${report.excavatedAt}`);
  lines.push('──────────────────────────────────────────');
  lines.push(`对话地质沉淀跨度：${report.totalDays} 天`);
  lines.push(`出土总话语标本　：${report.totalMessages} 条`);
  lines.push(`碳14现代残余活性：${report.carbon14Activity}%`);
  lines.push(`最高温纪元　　　：${report.peakEpoch}`);
  lines.push(`渐冷纪元　　　　：${report.coolingEpoch}`);
  lines.push('');
  lines.push('【地质剖面综述】');
  lines.push(report.archaeologicalSummary);
  lines.push('');
  lines.push('【馆藏专家终审评定】');
  lines.push(report.curatorAssessment);
  lines.push('');
  lines.push('【五层地层切片】');

  report.strata.forEach(layer => {
    lines.push(`· Layer 0${layer.depthLevel} ${layer.epochName}（${layer.geologicalCode}）`);
    lines.push(`  年代范围：${layer.timeRange.start} ~ ${layer.timeRange.end}　遗存：${layer.messageCount} 条　地温：${layer.temperatureCelsius}°C`);
    lines.push(`  沉积化验：温存${layer.sediment.warmth}% / 思念${layer.sediment.longing}% / 日常${layer.sediment.daily}% / 摩擦${layer.sediment.friction}% / 冷却${layer.sediment.silence}%`);
    lines.push(`  核心话题：${layer.dominantTopics.join(' ')}`);
  });

  lines.push('');
  lines.push('【代表性对话化石】');

  let truncated = false;
  const limit = CAPACITY_LIMITS.maxExportBytes;
  const relicLimit = CAPACITY_LIMITS.maxExportRelics;
  const headroom = 512; // 为容量说明与结尾标记预留字节

  for (let i = 0; i < report.notableRelics.length; i++) {
    if (i >= relicLimit) {
      truncated = true;
      break;
    }
    const relic = report.notableRelics[i];
    const entry = [
      `[${relic.category}] ${relic.name}`,
      `  年代：${relic.dateStr}　发掘深度：-${relic.depthMeters.toFixed(1)}m　出土者：${relic.sender}　保存完好度：${relic.preservationScore}%`,
      `  引文：“${relic.quote}”`,
      `  鉴定：${relic.archaeologicalNotes}`,
      ''
    ].join('\n');

    if (byteLength(lines.join('\n') + entry) > limit - headroom) {
      truncated = true;
      break;
    }
    lines.push(entry.trimEnd());
  }

  if (truncated) {
    const observed = report.notableRelics.length;
    notices.push({
      kind: 'export-size',
      observed,
      limit: relicLimit,
      message: `导出档案已达容量边界，仅收录前 ${Math.min(observed, relicLimit)} 件代表性化石（共 ${observed} 件），完整统计数据不受影响。`
    });
  }

  const capacitySection = notices.length
    ? ['', '【容量保护说明】', ...notices.map(n => `· ${n.message}`)].join('\n')
    : '';

  let text = lines.join('\n') + capacitySection + '\n══════════════════════════════════════════\n';

  // 最终硬边界：若整体仍超限（极端长综述等），按字节安全截断。
  if (byteLength(text) > limit) {
    text = cutToBytes(text, limit - 64) + '\n……（档案已达导出容量边界，统计数据不受影响）\n';
    truncated = true;
  }

  return { text, notices, truncated };
}

/** 按 UTF-8 字节截断，且不在多字节字符中间切断。 */
function cutToBytes(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (byteLength(text.slice(0, mid)) <= maxBytes) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo);
}
