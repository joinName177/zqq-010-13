import './ui/styles.css';
import { UniversalChatParserAdapter, assertFileSizeAllowed } from './adapters/chat-parser.adapter';
import { SampleSitesAdapter } from './adapters/sample-data.adapter';
import { ArchaeologyEngineAdapter } from './adapters/archaeology-engine.adapter';
import { ReportExportAdapter } from './adapters/report-export.adapter';
import { renderApp } from './ui/app';
import { ArchaeologyReport } from './core/models';
import { calculateReportMetrics } from './core/report-metrics';
import { reportTelemetry } from './adapters/report-telemetry';
import { buildBugSurface } from './adapters/quality/bugSurface';
import { CAPACITY_LIMITS, CapacityError, formatBytes } from './core/capacity-limits';

const parser = new UniversalChatParserAdapter();
const sampleAdapter = new SampleSitesAdapter();
const engine = new ArchaeologyEngineAdapter();
const reportExporter = new ReportExportAdapter();

const sampleSites = sampleAdapter.getSites();
let selectedSiteId = sampleSites[0].id;
let currentReport: ArchaeologyReport = engine.excavateSite(sampleSites[0].data, sampleSites[0].name);
let selectedLayerIndex = 0;
let isReportOpen = false;
let capacityNotice: string[] = [];

const appRoot = document.getElementById('app')!;
const bugSurface = buildBugSurface([currentReport.totalMessages, currentReport.strata.length]);
appRoot.dataset.reportTelemetry = reportTelemetry('sample', {
  ...calculateReportMetrics(currentReport),
  bug: bugSurface.values[0],
  bugCount: bugSurface.bugs.length
});
appRoot.dataset.preembeddedBugs = JSON.stringify({
  bugs: bugSurface.bugs,
  affectedLayers: bugSurface.affectedLayers,
  digest: bugSurface.digest
});

function update() {
  renderApp(
    appRoot,
    currentReport,
    sampleSites,
    selectedSiteId,
    selectedLayerIndex,
    isReportOpen,
    {
      onSelectPreset: (siteId: string) => {
        const target = sampleSites.find(s => s.id === siteId);
        if (target) {
          selectedSiteId = siteId;
          currentReport = engine.excavateSite(target.data, target.name);
          selectedLayerIndex = 0;
          capacityNotice = [];
          update();
        }
      },
      onUploadFile: async (file: File) => {
        try {
          // 文件级边界：在读取文件文本之前拦截，避免超大文件使浏览器失去响应。
          assertFileSizeAllowed(file.size);
          const text = await file.text();
          const result = await parser.parse(text);
          if (result.messages.length === 0) {
            alert('未能从该文件中解析出有效对话记录，请检查文件格式。');
            return;
          }

          // 核心层容量闸门：统一收敛条数 / 单条长度，统计基于实际纳入分析的消息。
          const guarded = engine.enforceCapacity(result.messages);
          selectedSiteId = 'custom-upload';
          currentReport = engine.excavateSite(guarded.messages, `自定义导入档案 · ${file.name}`);
          selectedLayerIndex = 0;

          const notices: string[] = [];
          if (result.sourceTruncated) {
            notices.push(
              `文件超过 ${CAPACITY_LIMITS.MAX_RAW_CHARS.toLocaleString()} 字符解析上限，仅分析了前半部分；` +
                `统计数字基于已纳入分析的 ${guarded.guard.acceptedMessages.toLocaleString()} 条消息。`
            );
          }
          const dropped = result.droppedMessages + guarded.guard.droppedMessages;
          if (guarded.guard.truncated || dropped > 0) {
            notices.push(
              `消息量较大，已保留最早的 ${CAPACITY_LIMITS.MAX_MESSAGES.toLocaleString()} 条用于地层分析，` +
                `约 ${Math.max(dropped, 1).toLocaleString()} 条未纳入统计；报告中的总条数与分层计数均为实际分析口径。`
            );
          }
          capacityNotice = notices;
          update();
        } catch (err: any) {
          if (err instanceof CapacityError && err.code === 'FILE_TOO_LARGE') {
            alert(
              `导入失败：文件体积 ${formatBytes(err.actual)}，超过 ${formatBytes(CAPACITY_LIMITS.MAX_FILE_BYTES)} 的导入上限。\n` +
                '请拆分聊天记录或使用更短的导出文件后再试。'
            );
            return;
          }
          alert('解析失败: ' + err.message);
        }
      },
      onOpenReport: () => {
        isReportOpen = true;
        update();
      },
      onExportReport: () => {
        try {
          const doc = reportExporter.exportReport(currentReport);
          reportExporter.download(doc);
        } catch (err: any) {
          if (err instanceof CapacityError && err.code === 'EXPORT_TOO_LARGE') {
            alert(
              `导出失败：档案体积 ${formatBytes(err.actual)}，超过 ${formatBytes(CAPACITY_LIMITS.MAX_EXPORT_BYTES)} 的导出上限。`
            );
            return;
          }
          alert('导出失败: ' + err.message);
        }
      }
    },
    (layerIdx: number) => {
      selectedLayerIndex = layerIdx;
      update();
    },
    () => {
      isReportOpen = false;
      update();
    },
    capacityNotice
  );
}

// Initial render
update();
