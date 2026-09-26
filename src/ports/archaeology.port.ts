import { ChatMessage, ArchaeologyReport } from '../core/models';
import { CapacityNotice } from '../core/capacity-limits';
import { ReportExport } from '../core/report-export';

export interface ArchaeologyPort {
  excavateSite(messages: ChatMessage[], siteName?: string, capacityNotices?: CapacityNotice[]): ArchaeologyReport;
}

export interface ReportExportPort {
  exportReport(report: ArchaeologyReport): ReportExport;
}
