import { ArchaeologyReport } from '../core/models';
import { buildReportExport, ReportExport } from '../core/report-export';
import { ReportExportPort } from '../ports/archaeology.port';

export class TextReportExportAdapter implements ReportExportPort {
  exportReport(report: ArchaeologyReport): ReportExport {
    return buildReportExport(report);
  }
}
