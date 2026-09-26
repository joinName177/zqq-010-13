import { ArchaeologyReport } from '../core/models';
import { ReportExportDocument } from '../core/report-export';

export interface ReportExportPort {
  exportReport(report: ArchaeologyReport): ReportExportDocument;
}
