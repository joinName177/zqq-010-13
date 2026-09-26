import { ArchaeologyReport } from './models';
import { CAPACITY_LIMITS, clipText } from './capacity-limits';

export interface ReportExportDocument {
  filename: string;
  mimeType: 'text/plain';
  content: string;
}

/**
 * 基于同一份报告快照构建有界文本导出：
 * - 所有自由文本字段经统一容量裁剪，引文与化石数量封顶；
 * - 统计数字（总条数、跨度、分层计数）直接取自报告，口径与界面完全一致；
 * - 字节级上限在导出适配器中再次校验，保证最终产物不会撑爆下载链路。
 */
export function buildBoundedReportExport(report: ArchaeologyReport): ReportExportDocument {
  const L = CAPACITY_LIMITS;
  const lines: string[] = [];

  const line = (text = '') => lines.push(clipText(text, 2000));
  const rule = () => line('────────────────────────────────────────');

  line(`《${clipText(report.siteName, L.MAX_SITE_NAME_CHARS)}》关系考古发掘总报告`);
  line(`编号：${report.siteCode}　发掘时间：${report.excavatedAt}`);
  rule();
  line(`对话地质沉淀跨度：${report.totalDays} 天`);
  line(`出土总话语标本：${report.totalMessages} 条`);
  line(`碳14现代残余活性：${report.carbon14Activity}%`);
  line(`最高温纪元：${report.peakEpoch}`);
  line(`渐冷纪元：${report.coolingEpoch}`);
  line();

  let layerCount = 0;
  for (const layer of report.strata) {
    layerCount++;
    rule();
    line(`Layer 0${layer.depthLevel} · ${layer.geologicalCode}　${layer.epochName}`);
    line(`岩相：${layer.lithology}`);
    line(`年代范围：${layer.timeRange.start} ~ ${layer.timeRange.end}`);
    line(`对话遗存：${layer.messageCount} 条　关系地温：${layer.temperatureCelsius}°C`);
    line(
      `情感沉积：温存 ${layer.sediment.warmth}% / 思念 ${layer.sediment.longing}% / ` +
        `琐碎 ${layer.sediment.daily}% / 摩擦 ${layer.sediment.friction}% / 沉默 ${layer.sediment.silence}%`
    );
    line(`核心话题：${layer.dominantTopics.map(t => clipText(t, L.MAX_TOPIC_CHARS)).join(' ')}`);
    const relics = layer.fossilRelics.slice(0, L.MAX_RELICS_PER_LAYER);
    if (relics.length > 0) {
      line('出土化石：');
      for (const relic of relics) {
        line(
          `  · [${relic.category}] ${relic.dateStr} 发掘深度 -${relic.depthMeters.toFixed(1)}m ` +
            `${relic.sender}（保存完好度 ${relic.preservationScore}%）`
        );
        line(`    “${clipText(relic.quote, L.MAX_QUOTE_CHARS)}”`);
      }
    }
  }
  void layerCount;
  rule();
  line(`地质剖面综述：${report.archaeologicalSummary}`);
  line(`馆藏专家终审评定：${report.curatorAssessment}`);

  const safeCode = report.siteCode.replace(/[^A-Za-z0-9_-]/g, '');
  return {
    filename: `archaeology-report-${safeCode || 'export'}.txt`,
    mimeType: 'text/plain',
    content: lines.join('\n')
  };
}
