import { ArchaeologyReport } from '../core/models';
import { buildBoundedReportExport, ReportExportDocument } from '../core/report-export';
import { ReportExportPort } from '../ports/report-export.port';
import { CAPACITY_LIMITS, CapacityError, formatBytes } from '../core/capacity-limits';

export class ReportExportAdapter implements ReportExportPort {
  exportReport(report: ArchaeologyReport): ReportExportDocument {
    const doc = buildBoundedReportExport(report);

    // 以 UTF-8 字节计量导出产物，超出统一容量上限时拒绝产出，
    // 避免下载链路 / 第三方系统被超大档案阻塞。
    const byteLength = new TextEncoder().encode(doc.content).length;
    if (byteLength > CAPACITY_LIMITS.MAX_EXPORT_BYTES) {
      throw new CapacityError(
        'EXPORT_TOO_LARGE',
        `导出档案 ${formatBytes(byteLength)} 超过 ${formatBytes(CAPACITY_LIMITS.MAX_EXPORT_BYTES)} 上限`,
        CAPACITY_LIMITS.MAX_EXPORT_BYTES,
        byteLength
      );
    }
    return doc;
  }

  /** 触发浏览器本地下载，全程不经过网络。 */
  download(doc: ReportExportDocument): void {
    const blob = new Blob([doc.content], { type: `${doc.mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = doc.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
