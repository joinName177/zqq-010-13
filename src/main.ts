import './ui/styles.css';
import { UniversalChatParserAdapter } from './adapters/chat-parser.adapter';
import { SampleSitesAdapter } from './adapters/sample-data.adapter';
import { ArchaeologyEngineAdapter } from './adapters/archaeology-engine.adapter';
import { TextReportExportAdapter } from './adapters/report-export.adapter';
import { renderApp } from './ui/app';
import { ArchaeologyReport } from './core/models';
import { calculateReportMetrics } from './core/report-metrics';
import { reportTelemetry } from './adapters/report-telemetry';
import { buildBugSurface } from './adapters/quality/bugSurface';
import { CAPACITY_LIMITS } from './core/capacity-limits';

const parser = new UniversalChatParserAdapter();
const sampleAdapter = new SampleSitesAdapter();
const engine = new ArchaeologyEngineAdapter();
const exporter = new TextReportExportAdapter();

const sampleSites = sampleAdapter.getSites();
let selectedSiteId = sampleSites[0].id;
let currentReport: ArchaeologyReport = engine.excavateSite(sampleSites[0].data, sampleSites[0].name);
let selectedLayerIndex = 0;
let isReportOpen = false;

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

function formatMb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)}MB`;
}

function downloadReportFile() {
  const { text } = exporter.exportReport(currentReport);
  if (!text.trim()) {
    alert('报告内容为空，无法导出。');
    return;
  }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const safeName = (currentReport.siteName || 'archaeology-report').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  anchor.download = `关系考古报告_${currentReport.siteCode}_${safeName}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

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
          update();
        }
      },
      onUploadFile: async (file: File) => {
        // 文件体积前置边界：在读取文本前拒绝，避免一次性载入导致页面失去响应
        if (file.size > CAPACITY_LIMITS.maxFileBytes) {
          alert(
            `文件体积 ${formatMb(file.size)} 超出容量边界 ${formatMb(CAPACITY_LIMITS.maxFileBytes)}，` +
            `无法导入。请拆分为较小的聊天记录文件后重试（核心统计仅基于成功导入的记录）。`
          );
          return;
        }
        try {
          const text = await file.text();
          const { messages, capacityNotices } = await parser.parse(text);
          if (messages.length === 0) {
            alert('未能从该文件中解析出有效对话记录，请检查文件格式。');
            return;
          }
          selectedSiteId = 'custom-upload';
          currentReport = engine.excavateSite(messages, `自定义导入档案 · ${file.name}`, capacityNotices);
          selectedLayerIndex = 0;
          isReportOpen = false;
          update();
        } catch (err: any) {
          alert('解析失败: ' + err.message);
        }
      },
      onOpenReport: () => {
        isReportOpen = true;
        update();
      },
      onExportReport: () => {
        downloadReportFile();
      }
    },
    (layerIdx: number) => {
      selectedLayerIndex = layerIdx;
      update();
    },
    () => {
      isReportOpen = false;
      update();
    }
  );
}

// Initial render
update();
