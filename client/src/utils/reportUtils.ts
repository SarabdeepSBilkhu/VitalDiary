import type { ReportRecord } from './api';

// ─── Structured Report Parameter Type ───────────────────────────────────────
export interface ReportParameter {
  name: string;
  value: string;
  unit: string;
}

// ─── JSON Array Format Detection ────────────────────────────────────────────
// New format: [{"name":"...","value":"...","unit":"..."}]
// Old format: "Hb: 14.5 g/dL", "WBC=8.2", etc.
function tryParseJsonParameters(text: string): ReportParameter[] | null {
  if (!text || !text.trim().startsWith('[')) return null;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0 && 'name' in parsed[0]) {
      return parsed as ReportParameter[];
    }
  } catch {
    // Not valid JSON, fall through
  }
  return null;
}

// ─── Report Parameter Parser ────────────────────────────────────────────────
// Extracts named numeric parameters from free-text report data.
// Supports formats like:
//   "Hb: 14.5 g/dL", "WBC=8.2", "Glucose 95 mg/dL", "Creatinine : 1.1"
//   Also handles quoted entries: "RBC: 3.86", "Haemoglobin: 9.8"
//   And the new JSON array format: [{name, value, unit}]
export function parseReportParameters(text: string): Record<string, number> {
  const result: Record<string, number> = {};

  if (!text) return result;

  // Try the structured JSON format first.
  const jsonParams = tryParseJsonParameters(text);

  if (jsonParams) {
    for (const item of jsonParams) {
      const val = parseFloat(String(item.value));

      if (item.name && !isNaN(val)) {
        result[item.name.trim()] = val;
      }
    }

    return result;
  }

  // Legacy format
  const cleaned = text.replace(/['"]/g, '');

  const regex =
    /([A-Za-z][A-Za-z0-9\s\-/()]{0,40}?)\s*[:\-=]\s*[>\-<\s]*([0-9]+(?:\.[0-9]+)?)/g;

  let match: RegExpExecArray | null;

  while ((match = regex.exec(cleaned)) !== null) {
    const key = match[1]
      .trim()
      .replace(/\s+/g, ' ');

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

  // Try new structured JSON format first
  const jsonParams = tryParseJsonParameters(text);
  if (jsonParams) {
    for (const item of jsonParams) {
      if (item.name && item.value !== undefined) {
        result[item.name] = item.unit ? `${item.value} ${item.unit}` : item.value;
      }
    }
    return result;
  }

  // Legacy format
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

// ─── Plain-text formatter for exports (PDF fallback) ────────────
// Converts report data (either format) into a readable "Name: Value Unit" string.
export function formatReportDataAsText(text: string): string {
  if (!text) return '';
  const jsonParams = tryParseJsonParameters(text);
  if (jsonParams) {
    return jsonParams
      .map(item => `${item.name}: ${item.value}${item.unit ? ' ' + item.unit : ''}`)
      .join(', ');
  }
  // Legacy format — return as-is (already human-readable)
  return text;
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

// ─── Normal reference ranges ─────────────────────────────────────────────────
// Each entry has keywords (any match = hit) and [min, max] inclusive.
const NORMAL_RANGE_ENTRIES: {
  keywords: string[];
  range: [number, number];
}[] = [

  // =========================
  // CBC
  // =========================

  { keywords: ['rbc', 'red blood cell', 'erythrocyte'],
    range: [4.2, 5.7] },

  { keywords: ['hemoglobin', 'haemoglobin', 'hb', 'hgb'],
    range: [13, 18] },

  { keywords: ['pcv', 'hematocrit', 'haematocrit', 'hct'],
    range: [40, 55] },

  { keywords: ['mcv'],
    range: [80, 100] },

  { keywords: ['mch'],
    range: [27, 33] },

  { keywords: ['mchc'],
    range: [32, 36] },

  { keywords: ['rdw cv', 'rdw (cv)', 'rdw'],
    range: [11.5, 14.5] },

  { keywords: ['rdw sd', 'rdw (sd)'],
    range: [39, 46] },

  { keywords: ['platelet count', 'platelet', 'plt'],
    range: [1.5, 4.5] },

  { keywords: ['tlc', 'wbc', 'white blood cell',
              'leucocyte', 'leukocyte'],
    range: [4500, 11000] },

  { keywords: ['neutrophils', 'neutrophil'],
    range: [40, 70] },

  { keywords: ['lymphocytes', 'lymphocyte'],
    range: [20, 40] },

  { keywords: ['monocytes', 'monocyte'],
    range: [2, 10] },

  { keywords: ['eosinophils', 'eosinophil'],
    range: [1, 6] },

  { keywords: ['basophils', 'basophil'],
    range: [0, 1] },

  // IMPORTANT: these must come BEFORE percentage WBC entries
  { keywords: ['absolute neutrophils', 'absolute neutrophil', 'anc'],
    range: [1500, 8000] },

  { keywords: ['absolute lymphocytes', 'absolute lymphocyte', 'alc'],
    range: [1000, 4000] },

  { keywords: ['absolute monocytes', 'absolute monocyte'],
    range: [200, 1000] },

  { keywords: ['absolute eosinophils', 'absolute eosinophil'],
    range: [0, 500] },

  { keywords: ['absolute basophils', 'absolute basophil'],
    range: [0, 100] },

  { keywords: ['mpv'],
    range: [7.5, 12.0] },

  { keywords: ['esr', 'erythrocyte sedimentation rate'],
    range: [0, 20] },

  { keywords: ['nlr', 'neutrophil lymphocyte ratio'],
    range: [1.0, 3.0] },


  // =========================
  // LFT
  // =========================

  { keywords: ['direct bilirubin', 'conjugated bilirubin'],
    range: [0.0, 0.3] },

  { keywords: ['indirect bilirubin', 'unconjugated bilirubin'],
    range: [0.2, 0.9] },

  { keywords: ['total bilirubin', 'bilirubin'],
    range: [0.1, 1.2] },

  { keywords: ['ast (sgot)', 'sgot', 'ast',
              'aspartate aminotransferase'],
    range: [8, 40] },

  { keywords: ['alt (sgpt)', 'sgpt', 'alt',
              'alanine aminotransferase'],
    range: [7, 56] },

  { keywords: ['alp', 'alkaline phosphatase'],
    range: [40, 130] },

  { keywords: ['ggt', 'gamma gt',
              'gamma glutamyl transferase'],
    range: [9, 48] },

  { keywords: ['ldh', 'lactate dehydrogenase'],
    range: [140, 280] },

  { keywords: ['albumin'],
    range: [3.4, 5.4] },

  { keywords: ['globulin'],
    range: [2.0, 3.5] },

  { keywords: ['total protein', 'protein'],
    range: [6.0, 8.3] },

  { keywords: [
      'albumin/globulin ratio',
      'albumin globulin ratio',
      'a/g ratio',
      'ag ratio'
    ],
    range: [1.0, 2.5] },


  // =========================
  // RFT
  // =========================

  { keywords: ['blood urea', 'urea'],
    range: [15, 45] },

  { keywords: ['bun', 'blood urea nitrogen'],
    range: [7, 20] },

  { keywords: ['creatinine'],
    range: [0.6, 1.3] },

  { keywords: ['bun/creatinine ratio',
              'bun creatinine ratio'],
    range: [10, 20] },

  { keywords: ['uric acid', 'uric_acid'],
    range: [3.4, 7.0] },

  { keywords: ['egfr', 'estimated glomerular filtration rate'],
    range: [90, 120] },

  { keywords: ['sodium', 'na+'],
    range: [135, 145] },

  { keywords: ['potassium', 'k+'],
    range: [3.5, 5.2] },

  { keywords: ['chloride', 'cl'],
    range: [96, 106] },

  { keywords: ['calcium', 'ca'],
    range: [8.5, 10.2] },

  { keywords: ['phosphorus', 'phosphate'],
    range: [2.5, 4.5] },

  { keywords: ['magnesium', 'mg'],
    range: [1.7, 2.2] },


  // =========================
  // URINE
  // =========================

  { keywords: ['specific gravity', 'urine specific gravity'],
    range: [1.005, 1.030] },

  { keywords: ['urine ph', 'ph'],
    range: [4.5, 8.0] },

  { keywords: ['pus cells', 'urine pus cells', 'urine wbc'],
    range: [0, 5] },

  { keywords: ['epithelial cells', 'urine epithelial cells'],
    range: [0, 5] },

  { keywords: ['urine rbcs', 'urine rbc', 'urine red blood cell'],
    range: [0, 2] },


  // =========================
  // LIPID PROFILE
  // =========================

  { keywords: ['total cholesterol', 'cholesterol'],
    range: [0, 200] },

  { keywords: ['ldl cholesterol', 'ldl'],
    range: [0, 100] },

  { keywords: ['hdl cholesterol', 'hdl'],
    range: [40, 999] },

  { keywords: ['triglycerides', 'triglyceride', 'tg'],
    range: [0, 150] },

  { keywords: ['vldl'],
    range: [5, 30] },

  { keywords: ['non-hdl cholesterol', 'non hdl cholesterol'],
    range: [0, 130] },

  { keywords: ['chol/hdl ratio', 'chol hdl ratio',
              'cholesterol hdl ratio'],
    range: [0, 5] },

  { keywords: ['ldl/hdl ratio', 'ldl hdl ratio'],
    range: [0, 3] },

  { keywords: ['hdl/ldl ratio', 'hdl ldl ratio'],
    range: [0, 5] },


  // =========================
  // THYROID
  // =========================

  { keywords: ['ft3', 'free t3'],
    range: [2.3, 4.2] },

  { keywords: ['ft4', 'free t4'],
    range: [0.8, 1.9] },

  { keywords: ['tsh', 'thyroid stimulating hormone'],
    range: [0.4, 4.8] },

  { keywords: ['total t3', 't3'],
    range: [0.8, 2.0] },

  { keywords: ['total t4', 't4'],
    range: [5.0, 12.0] },


  // =========================
  // GLUCOSE / HbA1c
  // =========================

  { keywords: ['hba1c', 'a1c', 'glycated', 'glycosylated'],
    range: [4.0, 5.6] },

  { keywords: ['fasting blood glucose',
              'fasting glucose',
              'fbs',
              'fasting blood sugar'],
    range: [70, 99] },

  { keywords: ['ppbs', 'post prandial', 'pp glucose',
              'post meal', 'post-meal', 'postmeal'],
    range: [70, 140] },

  { keywords: ['pre meal', 'pre-meal', 'premeal'],
    range: [70, 130] },

  { keywords: ['random glucose',
              'rbs',
              'random blood sugar'],
    range: [70, 125] },

  { keywords: ['estimated average glucose', 'eag'],
    range: [68, 114] },


  // =========================
  // IRON STUDIES
  // =========================

  { keywords: ['ferritin'],
    range: [24, 336] },

  { keywords: ['serum iron', 'iron'],
    range: [59, 158] },

  { keywords: ['tibc', 'total iron binding capacity'],
    range: [250, 450] },

  { keywords: ['transferrin saturation',
              'iron saturation',
              'transferrin sat'],
    range: [20, 50] },


  // =========================
  // VITAMINS
  // =========================

  { keywords: ['vitamin d', 'vit d', '25-oh', '25 oh vitamin d'],
    range: [30, 100] },

  { keywords: ['vitamin b12', 'vit b12', 'b12'],
    range: [200, 900] },

  { keywords: ['folate', 'folic acid'],
    range: [3, 20] },


  // =========================
  // INFLAMMATION
  // =========================

  { keywords: ['hs-crp', 'hs crp', 'high sensitivity crp'],
    range: [0, 3] },

];
/**
 * Look up the normal range for a parameter by
 * specific/longest keyword matching.
 */
export function getNormalRange(
  key: string
): [number, number] | null {

  const cleaned = key
    .toLowerCase()
    .trim()
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // First: exact match.
  // This prevents "absolute neutrophils" from becoming "neutrophils",
  // "total bilirubin" from becoming "bilirubin", etc.
  for (const entry of NORMAL_RANGE_ENTRIES) {
    for (const kw of entry.keywords) {
      const normalizedKw = kw
        .toLowerCase()
        .trim()
        .replace(/[()]/g, ' ')
        .replace(/\s+/g, ' ');

      if (cleaned === normalizedKw) {
        return entry.range;
      }
    }
  }

  // Second: fuzzy matching.
  // If multiple keywords match, prefer the longest/more specific one.
  const matches: {
    range: [number, number];
    keywordLength: number;
  }[] = [];

  for (const entry of NORMAL_RANGE_ENTRIES) {
    for (const kw of entry.keywords) {
      const normalizedKw = kw
        .toLowerCase()
        .trim()
        .replace(/[()]/g, ' ')
        .replace(/\s+/g, ' ');

      if (
        cleaned.includes(normalizedKw) ||
        normalizedKw.includes(cleaned)
      ) {
        matches.push({
          range: entry.range,
          keywordLength: normalizedKw.length,
        });
      }
    }
  }

  if (matches.length === 0) {
    return null;
  }

  // Longest keyword = most specific match.
  matches.sort((a, b) => b.keywordLength - a.keywordLength);

  return matches[0].range;
}