import type { ReportRecord } from './api';

// ─── Report Parameter Parser ────────────────────────────────────────────────
// Extracts named numeric parameters from free-text report data.
// Supports formats like:
//   "Hb: 14.5 g/dL", "WBC=8.2", "Glucose 95 mg/dL", "Creatinine : 1.1"
//   Also handles quoted entries: "RBC: 3.86", "Haemoglobin: 9.8"
export function parseReportParameters(text: string): Record<string, number> {
  const result: Record<string, number> = {};
  if (!text) return result;

  // Strip surrounding quote characters so entries like "Key: Value" are parsed correctly
  const cleaned = text.replace(/['"]/g, '');

  // Pattern: word(s) + optional colon/equals + numeric value (unit ignored)
  // Support optional bounding indicators like >, <, -, etc. before the number
  const regex = /([A-Za-z][A-Za-z0-9\s\-/()]{0,40}?)\s*[:\-=]\s*[>\-<\s]*([0-9]+(?:\.[0-9]+)?)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(cleaned)) !== null) {
    const key = match[1].trim().replace(/\s+/g, ' ');
    const val = parseFloat(match[2]);
    if (key && !isNaN(val)) {
      result[key] = val;
    }
  }
  return result;
}

export function parseAllReportParameters(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!text) return result;

  const items: string[] = [];
  const itemRegex = /"([^"]+)"|'([^']+)'|([^,\n]+)/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(text)) !== null) {
    const val = match[1] || match[2] || match[3];
    if (val && val.trim()) {
      items.push(val.trim());
    }
  }

  for (const item of items) {
    const separatorIdx = item.indexOf(':') !== -1 ? item.indexOf(':') : item.indexOf('=');
    if (separatorIdx !== -1) {
      let key = item.substring(0, separatorIdx).trim();
      let val = item.substring(separatorIdx + 1).trim();
      key = key.replace(/^["']|["']$/g, '').trim();
      val = val.replace(/^["']|["']$/g, '').trim();
      if (key && val) {
        result[key] = val;
      }
    } else {
      const spaceMatch = item.match(/^([A-Za-z0-9\s\-/()]+?)\s+([0-9+>\-<]+.*)$/);
      if (spaceMatch) {
        let key = spaceMatch[1].trim();
        let val = spaceMatch[2].trim();
        key = key.replace(/^["']|["']$/g, '').trim();
        val = val.replace(/^["']|["']$/g, '').trim();
        if (key && val) {
          result[key] = val;
        }
      }
    }
  }
  return result;
}

export const REPORT_TYPE_OPTIONS = ['CBC', 'LFT', 'RFT', 'Lipid Profile', 'Thyroid Profile', 'HbA1c', 'Urine Report', 'Other Reports'] as const;

export type ReportType = typeof REPORT_TYPE_OPTIONS[number];

export const normalizeReportType = (value: string): ReportType => {
  const lower = (value || '').toLowerCase();
  if (lower.includes('cbc')) return 'CBC';
  if (lower.includes('lft')) return 'LFT';
  if (lower.includes('rft')) return 'RFT';
  if (lower.includes('lipid')) return 'Lipid Profile';
  if (lower.includes('thyroid')) return 'Thyroid Profile';
  if (lower.includes('hba1c')) return 'HbA1c';
  if (lower.includes('urine')) return 'Urine Report';
  return 'Other Reports';
};

export const getReportTypeFromRecord = (report: ReportRecord): ReportType =>
  normalizeReportType(report.report_type || report.data || '');

export function getLatestReportsByType(reports: ReportRecord[]): ReportRecord[] {
  const latestByType = new Map<ReportType, ReportRecord>();

  for (const report of reports) {
    const type = getReportTypeFromRecord(report);
    const existing = latestByType.get(type);
    if (!existing || new Date(report.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
      latestByType.set(type, report);
    }
  }

  return REPORT_TYPE_OPTIONS
    .map(type => latestByType.get(type))
    .filter((report): report is ReportRecord => report !== undefined);
}
