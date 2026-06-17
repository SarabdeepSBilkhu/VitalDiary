import React, { useState, useMemo } from 'react';
import { Calculator, LineChart as ChartIcon, FlaskConical, FileText } from 'lucide-react';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';
import type { WeightRecord, ReportRecord } from '../utils/api';
import { evaluateBP, evaluateHR, evaluateSpO2, evaluateGlucose, formatDateLabel } from '../utils/evaluators';
import { Line } from 'react-chartjs-2';

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
  const regex = /([A-Za-z][A-Za-z0-9\s\-/()]{0,40}?)\s*[:\-=]\s*([0-9]+(?:\.[0-9]+)?)/g;
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

// Collect all unique parameter names across a list of reports
function collectParameters(reports: ReportRecord[]): string[] {
  const paramSet = new Set<string>();
  for (const r of reports) {
    const parsed = parseReportParameters(r.data);
    Object.keys(parsed).forEach(k => paramSet.add(k));
  }
  return Array.from(paramSet).sort();
}

// Palette for multi-parameter lines
const PARAM_COLORS = [
  'hsl(200, 85%, 55%)',
  'hsl(355, 78%, 56%)',
  'hsl(150, 80%, 40%)',
  'hsl(35, 90%, 55%)',
  'hsl(280, 80%, 60%)',
  'hsl(30, 100%, 50%)',
  'hsl(170, 60%, 45%)',
  'hsl(310, 70%, 55%)',
];

const REPORT_TYPE_OPTIONS = ['CBC', 'LFT', 'KFT', 'Lipid Profile', 'Thyroid Profile', 'HbA1c', 'Other Reports'] as const;

type ReportType = typeof REPORT_TYPE_OPTIONS[number];

const formatShortDate = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatNumeric = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

const normalizeReportType = (value: string): ReportType => {
  const lower = (value || '').toLowerCase();
  if (lower.includes('cbc')) return 'CBC';
  if (lower.includes('lft')) return 'LFT';
  if (lower.includes('kft')) return 'KFT';
  if (lower.includes('lipid')) return 'Lipid Profile';
  if (lower.includes('thyroid')) return 'Thyroid Profile';
  if (lower.includes('hba1c')) return 'HbA1c';
  return 'Other Reports';
};

const getReportTypeFromRecord = (report: ReportRecord): ReportType => normalizeReportType(report.report_type || report.title || report.data || '');

// ─── Component ──────────────────────────────────────────────────────────────

interface AnalyticsProps {
  vitals: VitalsRecord[];
  glucose: GlucoseRecord[];
  weights: WeightRecord[];
  reports: ReportRecord[];
}

export const Analytics: React.FC<AnalyticsProps> = ({ vitals, glucose, weights, reports }) => {
  const [metric, setMetric] = useState<'bp' | 'hr' | 'spo2' | 'glucose' | 'weight' | 'reports'>('bp');
  const [timeframe, setTimeframe] = useState<'7days' | '30days' | 'year' | 'all'>('30days');
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('CBC');
  const [selectedParam, setSelectedParam] = useState<string>('');

  // 1. Filter logs by metric and timeframe
  const filteredLogs = useMemo(() => {
    const now = new Date();
    let sourceLogs: any[];
    if (metric === 'glucose') sourceLogs = glucose;
    else if (metric === 'weight') sourceLogs = weights;
    else if (metric === 'reports') sourceLogs = reports;
    else sourceLogs = vitals;

    const filtered = sourceLogs.filter(log => {
      const logDate = new Date(log.timestamp);
      const diffDays = Math.ceil(Math.abs(now.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24));
      if (timeframe === '7days') return diffDays <= 7;
      if (timeframe === '30days') return diffDays <= 30;
      if (timeframe === 'year') return diffDays <= 365;
      return true;
    });

    return [...filtered].reverse(); // chronological order
  }, [metric, timeframe, vitals, glucose, weights, reports]);

  // 2. Collect available parameters when in report mode
  const availableParams = useMemo(() => {
    if (metric !== 'reports') return [];
    return collectParameters(filteredLogs as ReportRecord[]);
  }, [metric, filteredLogs]);

  const reportGroups = useMemo(() => {
    const groups: Record<ReportType, ReportRecord[]> = {
      CBC: [],
      LFT: [],
      KFT: [],
      'Lipid Profile': [],
      'Thyroid Profile': [],
      HbA1c: [],
      'Other Reports': [],
    };

    reports.forEach(report => {
      groups[getReportTypeFromRecord(report)].push(report);
    });

    Object.values(groups).forEach(group => {
      group.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    });

    return groups;
  }, [reports]);

  const activeReportLogs = useMemo(() => reportGroups[selectedReportType], [reportGroups, selectedReportType]);
  const activeReportParams = useMemo(() => collectParameters(activeReportLogs), [activeReportLogs]);
  const activeReportParam = useMemo(() => {
    if (activeReportParams.includes(selectedParam)) return selectedParam;
    return activeReportParams[0] ?? '';
  }, [activeReportParams, selectedParam]);

  // Auto-select first param when params change
  const resolvedParam = useMemo(() => {
    if (metric !== 'reports') return '';
    if (availableParams.includes(selectedParam)) return selectedParam;
    return availableParams[0] ?? '';
  }, [metric, availableParams, selectedParam]);

  const activeReportChartData = useMemo(() => {
    if (!activeReportParam || activeReportLogs.length === 0) return null;
    const labels = [...activeReportLogs].reverse().map(r => formatDateLabel(r.timestamp));
    const values = [...activeReportLogs].reverse().map(r => {
      const parsed = parseReportParameters(r.data);
      const match = Object.entries(parsed).find(([key]) => key.toLowerCase() === activeReportParam.toLowerCase());
      return match ? match[1] : null;
    });

    return {
      labels,
      datasets: [{
        label: activeReportParam,
        data: values,
        borderColor: PARAM_COLORS[0],
        backgroundColor: 'hsla(200, 85%, 55%, 0.12)',
        borderWidth: 3,
        tension: 0.25,
        fill: true,
        pointBackgroundColor: PARAM_COLORS[0],
        pointHoverRadius: 7,
        spanGaps: true,
      }],
    };
  }, [activeReportLogs, activeReportParam]);

  const activeReportComparisonRows = useMemo(() => {
    const rows: { parameter: string; latest: number | null; previous: number | null; change: number | null }[] = [];
    activeReportParams.forEach(parameter => {
      const values: number[] = [];
      activeReportLogs.forEach(report => {
        const parsed = parseReportParameters(report.data);
        Object.entries(parsed).forEach(([key, value]) => {
          if (key.toLowerCase() === parameter.toLowerCase()) values.push(value);
        });
      });
      const latest = values[0] ?? null;
      const previous = values[1] ?? null;
      const change = latest !== null && previous !== null && previous !== 0 ? ((latest - previous) / previous) * 100 : null;
      rows.push({ parameter, latest, previous, change });
    });
    return rows;
  }, [activeReportParams, activeReportLogs]);

  const abnormalFindings = useMemo(() => {
    if (!activeReportLogs.length) return [] as Array<{ parameter: string; value: number }>;
    const latestReport = activeReportLogs[0];
    const parsed = parseReportParameters(latestReport.data);
    return Object.entries(parsed)
      .filter(([key, value]) => {
        const lower = key.toLowerCase();
        if (lower.includes('hemoglobin') || lower === 'hb' || lower.includes('hgb')) return value < 12 || value > 17.5;
        if (lower === 'rbc') return value < 4 || value > 6;
        if (lower === 'wbc') return value < 4 || value > 11;
        if (lower.includes('platelet')) return value < 150 || value > 450;
        if (lower === 'pcv') return value < 36 || value > 52;
        if (lower === 'mcv') return value < 80 || value > 100;
        if (lower === 'hba1c') return value < 4 || value > 5.6;
        if (lower.includes('tsh')) return value < 0.4 || value > 4.5;
        return false;
      })
      .map(([parameter, value]) => ({ parameter, value }))
      .slice(0, 8);
  }, [activeReportLogs]);

  const selectedReport = useMemo(() => activeReportLogs[0] ?? null, [activeReportLogs]);

  const selectedHistoryReport = useMemo(() => {
    if (!selectedReport) return null;
    return selectedReport;
  }, [selectedReport]);

  // 3. Calculate Stats based on filtered logs
  const stats = useMemo(() => {
    const results = {
      avg: '--',
      highest: '--',
      lowest: '--',
      normal: 0,
      warning: 0,
      critical: 0,
      glucoseFastingAvg: '--',
      glucosePreAvg: '--',
      glucosePostAvg: '--',
    };

    if (filteredLogs.length === 0) return results;

    let normalCount = 0;
    let warningCount = 0;
    let criticalCount = 0;

    if (metric === 'bp') {
      const bpLogs = filteredLogs as VitalsRecord[];
      results.avg = `${Math.round(bpLogs.reduce((a, b) => a + b.systolic, 0) / bpLogs.length)}/${Math.round(bpLogs.reduce((a, b) => a + b.diastolic, 0) / bpLogs.length)} mmHg`;
      const sortedSys = [...bpLogs].sort((a, b) => b.systolic - a.systolic);
      const sortedDia = [...bpLogs].sort((a, b) => a.diastolic - b.diastolic);
      results.highest = `${sortedSys[0].systolic}/${sortedSys[0].diastolic}`;
      results.lowest = `${sortedDia[0].systolic}/${sortedDia[0].diastolic}`;
      bpLogs.forEach(log => {
        const e = evaluateBP(log.systolic, log.diastolic);
        if (e.className === 'status-normal') normalCount++;
        else if (e.className === 'status-elevated') warningCount++;
        else criticalCount++;
      });

    } else if (metric === 'hr') {
      const hrLogs = filteredLogs as VitalsRecord[];
      results.avg = `${Math.round(hrLogs.reduce((a, b) => a + b.hr, 0) / hrLogs.length)} bpm`;
      const sorted = [...hrLogs].sort((a, b) => b.hr - a.hr);
      results.highest = `${sorted[0].hr} bpm`;
      results.lowest = `${sorted[sorted.length - 1].hr} bpm`;
      hrLogs.forEach(log => {
        const e = evaluateHR(log.hr);
        if (e.className === 'status-normal') normalCount++;
        else if (e.className === 'status-elevated' || e.className === 'status-low') warningCount++;
        else criticalCount++;
      });

    } else if (metric === 'spo2') {
      const spo2Logs = (filteredLogs as VitalsRecord[]).filter(l => l.spo2 !== null);
      if (spo2Logs.length > 0) {
        results.avg = `${Math.round(spo2Logs.reduce((a, b) => a + (b.spo2 || 0), 0) / spo2Logs.length)}%`;
        const sorted = [...spo2Logs].sort((a, b) => (b.spo2 || 0) - (a.spo2 || 0));
        results.highest = `${sorted[0].spo2}%`;
        results.lowest = `${sorted[sorted.length - 1].spo2}%`;
        spo2Logs.forEach(log => {
          const e = evaluateSpO2(log.spo2);
          if (e.className === 'status-normal') normalCount++;
          else if (e.className === 'status-elevated') warningCount++;
          else criticalCount++;
        });
      }

    } else if (metric === 'glucose') {
      const glLogs = filteredLogs as GlucoseRecord[];
      results.avg = `${Math.round(glLogs.reduce((a, b) => a + b.value, 0) / glLogs.length)} mg/dL`;
      const sorted = [...glLogs].sort((a, b) => b.value - a.value);
      results.highest = `${sorted[0].value} mg/dL`;
      results.lowest = `${sorted[sorted.length - 1].value} mg/dL`;
      const calcAvg = (arr: GlucoseRecord[]) => arr.length ? `${Math.round(arr.reduce((a, b) => a + b.value, 0) / arr.length)} mg/dL` : '--';
      results.glucoseFastingAvg = calcAvg(glLogs.filter(l => l.context === 'fasting'));
      results.glucosePreAvg = calcAvg(glLogs.filter(l => l.context === 'pre-meal'));
      results.glucosePostAvg = calcAvg(glLogs.filter(l => l.context === 'post-meal'));
      glLogs.forEach(log => {
        const e = evaluateGlucose(log.value, log.context);
        if (e.className === 'status-normal') normalCount++;
        else if (e.className === 'status-elevated') warningCount++;
        else criticalCount++;
      });

    } else if (metric === 'weight') {
      const wtLogs = filteredLogs as WeightRecord[];
      const sum = wtLogs.reduce((a, b) => a + b.value, 0);
      results.avg = `${(sum / wtLogs.length).toFixed(1)} kg`;
      const sorted = [...wtLogs].sort((a, b) => b.value - a.value);
      results.highest = `${sorted[0].value} kg`;
      results.lowest = `${sorted[sorted.length - 1].value} kg`;
      normalCount = wtLogs.length;

    } else if (metric === 'reports') {
      const repLogs = filteredLogs as ReportRecord[];
      if (resolvedParam) {
        const values: number[] = [];
        repLogs.forEach(r => {
          const parsed = parseReportParameters(r.data);
          if (resolvedParam in parsed) values.push(parsed[resolvedParam]);
        });
        if (values.length > 0) {
          results.avg = `${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)}`;
          results.highest = `${Math.max(...values).toFixed(2)}`;
          results.lowest = `${Math.min(...values).toFixed(2)}`;
          normalCount = values.length;
        }
      } else {
        results.avg = `${repLogs.length} reports`;
        normalCount = repLogs.length;
      }
    }

    results.normal = normalCount;
    results.warning = warningCount;
    results.critical = criticalCount;
    return results;
  }, [filteredLogs, metric, resolvedParam]);

  // 4. Prepare Chart Data & Options
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
  const textColor = isDark ? '#b2ccd6' : '#546e7a';

  const chartData = useMemo(() => {
    const labels = filteredLogs.map(l => formatDateLabel(l.timestamp));

    if (metric === 'bp') {
      const bpLogs = filteredLogs as VitalsRecord[];
      return {
        labels,
        datasets: [
          { label: 'Systolic (BP High)', data: bpLogs.map(l => l.systolic), borderColor: 'hsl(355, 78%, 56%)', backgroundColor: 'hsla(355, 78%, 56%, 0.1)', borderWidth: 3, tension: 0.25, fill: true, pointBackgroundColor: 'hsl(355, 78%, 56%)' },
          { label: 'Diastolic (BP Low)', data: bpLogs.map(l => l.diastolic), borderColor: 'hsl(200, 85%, 55%)', backgroundColor: 'hsla(200, 85%, 55%, 0.05)', borderWidth: 3, tension: 0.25, fill: true, pointBackgroundColor: 'hsl(200, 85%, 55%)' },
        ],
      };
    } else if (metric === 'hr') {
      return { labels, datasets: [{ label: 'Heart Rate (bpm)', data: (filteredLogs as VitalsRecord[]).map(l => l.hr), borderColor: 'hsl(330, 80%, 60%)', backgroundColor: 'hsla(330, 80%, 60%, 0.15)', borderWidth: 3, tension: 0.3, fill: true, pointBackgroundColor: 'hsl(330, 80%, 60%)' }] };
    } else if (metric === 'spo2') {
      return { labels, datasets: [{ label: 'SpO₂ (%)', data: (filteredLogs as VitalsRecord[]).map(l => l.spo2), borderColor: 'hsl(200, 85%, 55%)', backgroundColor: 'hsla(200, 85%, 55%, 0.15)', borderWidth: 3, tension: 0.2, fill: true, pointBackgroundColor: 'hsl(200, 85%, 55%)' }] };
    } else if (metric === 'weight') {
      return { labels, datasets: [{ label: 'Body Weight (kg)', data: (filteredLogs as WeightRecord[]).map(l => l.value), borderColor: 'hsl(150, 80%, 40%)', backgroundColor: 'hsla(150, 80%, 40%, 0.15)', borderWidth: 3, tension: 0.2, fill: true, pointBackgroundColor: 'hsl(150, 80%, 40%)' }] };
    } else if (metric === 'reports' && resolvedParam) {
      // Build a dataset for the selected parameter across all matching reports
      const repLogs = filteredLogs as ReportRecord[];
      const dataPoints: { label: string; value: number }[] = [];
      repLogs.forEach(r => {
        const parsed = parseReportParameters(r.data);
        if (resolvedParam in parsed) {
          dataPoints.push({ label: formatDateLabel(r.timestamp), value: parsed[resolvedParam] });
        }
      });
      return {
        labels: dataPoints.map(d => d.label),
        datasets: [
          {
            label: resolvedParam,
            data: dataPoints.map(d => d.value),
            borderColor: PARAM_COLORS[0],
            backgroundColor: PARAM_COLORS[0].replace('hsl', 'hsla').replace(')', ', 0.15)'),
            borderWidth: 3,
            tension: 0.25,
            fill: true,
            pointBackgroundColor: PARAM_COLORS[0],
            pointHoverRadius: 7,
          },
        ],
      };
    } else {
      return { labels: [], datasets: [] };
    }
  }, [filteredLogs, metric, resolvedParam]);

  const glucoseCharts = useMemo(() => {
    if (metric !== 'glucose') return null;
    const glLogs = filteredLogs as GlucoseRecord[];
    const buildContextChart = (context: string, label: string, color: string, bgColor: string) => {
      const contextLogs = glLogs.filter(l => l.context === context);
      return {
        logs: contextLogs,
        data: { labels: contextLogs.map(l => formatDateLabel(l.timestamp)), datasets: [{ label, data: contextLogs.map(l => l.value), borderColor: color, backgroundColor: bgColor, borderWidth: 3, tension: 0.3, fill: true, pointBackgroundColor: color, pointHoverRadius: 7 }] },
      };
    };
    return {
      fasting: buildContextChart('fasting', 'Fasting Glucose (mg/dL)', 'hsl(150, 80%, 40%)', 'hsla(150, 80%, 40%, 0.1)'),
      preMeal: buildContextChart('pre-meal', 'Pre-Meal Glucose (mg/dL)', 'hsl(35, 90%, 55%)', 'hsla(35, 90%, 55%, 0.1)'),
      postMeal: buildContextChart('post-meal', 'Post-Meal Glucose (mg/dL)', 'hsl(280, 80%, 60%)', 'hsla(280, 80%, 60%, 0.1)'),
    };
  }, [filteredLogs, metric]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: textColor, font: { family: 'Outfit' } } },
      tooltip: { titleFont: { family: 'Outfit' }, bodyFont: { family: 'Outfit' } },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Outfit' } } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Outfit' } } },
    },
  };

  const titles: Record<typeof metric, string> = {
    bp: 'Blood Pressure Trends',
    hr: 'Heart Rate (BPM) Log',
    spo2: 'Oxygen Saturation (SpO₂) History',
    glucose: 'Blood Glucose Levels',
    weight: 'Weight Tracker History',
    reports: 'Medical Report Parameter Trends',
  };

  const showSingleChart = metric !== 'glucose' && metric !== 'reports';
  const showGlucoseCharts = metric === 'glucose';
  const showReportCharts = metric === 'reports';

  return (
    <section id="analytics-view" className="view-section active">
      <div className="analytics-controls panel panel-glass mb-4">
        <div className="filters-row">
          <div className="filter-group">
            <label htmlFor="analytics-metric-select">Select Metric</label>
            <select
              id="analytics-metric-select"
              className="form-control"
              value={metric}
              onChange={(e) => { setMetric(e.target.value as any); setSelectedParam(''); }}
            >
              <option value="bp">Blood Pressure</option>
              <option value="hr">Heart Rate</option>
              <option value="spo2">Blood Oxygen (SpO₂)</option>
              <option value="glucose">Blood Glucose</option>
              <option value="weight">Body Weight</option>
              <option value="reports">Medical Reports</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="analytics-timeframe-select">Time Range</label>
            <select
              id="analytics-timeframe-select"
              className="form-control"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as any)}
            >
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="year">Last 1 Year</option>
              <option value="all">All-Time</option>
            </select>
          </div>

          {showReportCharts && availableParams.length > 0 && (
            <div className="filter-group">
              <label htmlFor="analytics-param-select">Parameter</label>
              <select
                id="analytics-param-select"
                className="form-control"
                value={resolvedParam}
                onChange={(e) => setSelectedParam(e.target.value)}
              >
                {availableParams.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Interactive Charts */}
        <div className="panel panel-glass trends-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              {showReportCharts
                ? <FlaskConical className="color-primary" size={22} />
                : <ChartIcon className="color-primary" size={22} />}
              <h3>{titles[metric]}</h3>
            </div>
          </div>

          {showSingleChart && (
            <div className="chart-container-large">
              {filteredLogs.length > 0 ? (
                <Line data={chartData} options={chartOptions} />
              ) : (
                <div className="d-flex align-center justify-center h-100 text-muted">
                  No logs recorded within this time range. Add health logs to view statistics.
                </div>
              )}
            </div>
          )}

          {showGlucoseCharts && (
            <div className="glucose-charts-stack">
              {(['fasting', 'preMeal', 'postMeal'] as const).map((ctx, i) => {
                const labels = ['🟢 Fasting', '🟠 Pre-Meal', '🟣 Post-Meal'];
                const colorClasses = ['color-success', 'color-warning', 'color-purple'];
                const emptyMsg = ['No fasting glucose readings in this range.', 'No pre-meal glucose readings in this range.', 'No post-meal glucose readings in this range.'];
                return (
                  <div key={ctx} className="glucose-chart-section">
                    <h4 className={`glucose-chart-label ${colorClasses[i]}`}>{labels[i]}</h4>
                    <div className="chart-container">
                      {glucoseCharts && glucoseCharts[ctx].logs.length > 0 ? (
                        <Line data={glucoseCharts[ctx].data} options={chartOptions} />
                      ) : (
                        <div className="d-flex align-center justify-center h-100 text-muted text-sm">{emptyMsg[i]}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showReportCharts && (
            <div className="report-charts-stack">
              <div className="panel panel-glass mb-4">
                <div className="panel-header border-bottom">
                  <div className="panel-title-group">
                    <FileText className="color-primary" size={22} />
                    <h3>Select Report Type</h3>
                  </div>
                  <div className="filter-group" style={{ minWidth: '240px' }}>
                    <select
                      className="form-control"
                      value={selectedReportType}
                      onChange={(e) => {
                        setSelectedReportType(e.target.value as ReportType);
                        setSelectedParam('');
                      }}
                    >
                      {REPORT_TYPE_OPTIONS.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {activeReportLogs.length === 0 ? (
                  <div className="d-flex align-center justify-center h-100 text-muted">
                    No {selectedReportType} reports found.
                  </div>
                ) : (
                  <>
                    <div className="summary-list" style={{ marginTop: '1rem' }}>
                      <div className="summary-item">
                        <div className="summary-label">Total Reports</div>
                        <div className="summary-value">{activeReportLogs.length}</div>
                      </div>
                      <div className="summary-item">
                        <div className="summary-label">Parameters Tracked</div>
                        <div className="summary-value">{activeReportParams.length}</div>
                      </div>
                      <div className="summary-item">
                        <div className="summary-label">Latest Report Date</div>
                        <div className="summary-value">{formatShortDate(activeReportLogs[0].timestamp)}</div>
                      </div>
                      <div className="summary-item">
                        <div className="summary-label">First Report Date</div>
                        <div className="summary-value">{formatShortDate(activeReportLogs[activeReportLogs.length - 1].timestamp)}</div>
                      </div>
                      <div className="summary-item">
                        <div className="summary-label">Abnormal Parameters Count</div>
                        <div className="summary-value">{abnormalFindings.length}</div>
                      </div>
                    </div>

                    <div className="glucose-chart-section" style={{ marginTop: '1.5rem' }}>
                      <h4 className="glucose-chart-label color-danger">Abnormal Findings</h4>
                      <div className="summary-list">
                        {abnormalFindings.length > 0 ? abnormalFindings.map(item => (
                          <div key={item.parameter} className="summary-item">
                            <div className="summary-label">{item.parameter}</div>
                            <div className="summary-value color-danger">{formatNumeric(item.value)}</div>
                          </div>
                        )) : (
                          <div className="d-flex align-center justify-center h-100 text-muted">No abnormal findings detected.</div>
                        )}
                      </div>
                    </div>

                    <div className="glucose-chart-section" style={{ marginTop: '1.5rem' }}>
                      <h4 className="glucose-chart-label" style={{ color: textColor }}>Parameter Comparison Table</h4>
                      <div className="table-responsive">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Parameter</th>
                              <th>Latest</th>
                              <th>Previous</th>
                              <th>Change</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeReportComparisonRows.length > 0 ? activeReportComparisonRows.map(row => (
                              <tr key={row.parameter}>
                                <td>{row.parameter}</td>
                                <td>{row.latest === null ? '--' : formatNumeric(row.latest)}</td>
                                <td>{row.previous === null ? '--' : formatNumeric(row.previous)}</td>
                                <td>{row.change === null ? '--' : `${row.change >= 0 ? '+' : ''}${row.change.toFixed(1)}%`}</td>
                              </tr>
                            )) : (
                              <tr>
                                <td colSpan={4} className="text-center text-muted py-4">No numeric parameters detected.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="glucose-chart-section" style={{ marginTop: '1.5rem' }}>
                      <h4 className="glucose-chart-label color-primary">Single Parameter Trend</h4>
                      {activeReportParam ? (
                        <>
                          <div className="filter-group mb-3">
                            <select
                              className="form-control"
                              value={activeReportParam}
                              onChange={(e) => setSelectedParam(e.target.value)}
                            >
                              {activeReportParams.map(param => (
                                <option key={param} value={param}>{param}</option>
                              ))}
                            </select>
                          </div>
                          <div className="summary-list" style={{ marginBottom: '1rem' }}>
                            <div className="summary-item">
                              <div className="summary-label">Current Value</div>
                              <div className="summary-value">
                                {(() => {
                                  const values = activeReportLogs.map(report => {
                                    const parsed = parseReportParameters(report.data);
                                    return parsed[activeReportParam];
                                  }).filter((value): value is number => typeof value === 'number');
                                  return values.length ? formatNumeric(values[0]) : '--';
                                })()}
                              </div>
                            </div>
                            <div className="summary-item">
                              <div className="summary-label">Average Value</div>
                              <div className="summary-value">
                                {(() => {
                                  const values = activeReportLogs.map(report => {
                                    const parsed = parseReportParameters(report.data);
                                    return parsed[activeReportParam];
                                  }).filter((value): value is number => typeof value === 'number');
                                  return values.length ? formatNumeric(values.reduce((a, b) => a + b, 0) / values.length) : '--';
                                })()}
                              </div>
                            </div>
                            <div className="summary-item">
                              <div className="summary-label">Highest Value</div>
                              <div className="summary-value">{activeReportChartData ? formatNumeric(Math.max(...activeReportChartData.datasets[0].data.filter((v): v is number => typeof v === 'number'))) : '--'}</div>
                            </div>
                            <div className="summary-item">
                              <div className="summary-label">Lowest Value</div>
                              <div className="summary-value">{activeReportChartData ? formatNumeric(Math.min(...activeReportChartData.datasets[0].data.filter((v): v is number => typeof v === 'number'))) : '--'}</div>
                            </div>
                          </div>
                          <div className="chart-container-large">
                            <Line data={activeReportChartData} options={chartOptions} />
                          </div>
                        </>
                      ) : (
                        <div className="d-flex align-center justify-center h-100 text-muted">
                          No numeric parameters found in this report type.
                        </div>
                      )}
                    </div>

                    <div className="glucose-chart-section" style={{ marginTop: '1.5rem' }}>
                      <h4 className="glucose-chart-label" style={{ color: textColor }}>Report History</h4>
                      <div className="summary-list">
                        {activeReportLogs.slice(0, 8).map(report => (
                          <div key={report.id} className="summary-item">
                            <div>
                              <div className="summary-value">{formatShortDate(report.timestamp)}</div>
                              <div className="summary-label">{report.title}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Statistics Panel */}
        <div className="panel panel-glass summary-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <Calculator className="color-rose" size={22} />
              <h3>Reading Statistics</h3>
            </div>
          </div>

          <div className="stats-details">
            <div className="stats-subgroup">
              <h4 className="stats-subgroup-title">Averages</h4>
              <div className="summary-list">
                <div className="summary-item">
                  <div className="summary-label">
                    {metric === 'glucose' ? 'Overall Average' : metric === 'reports' ? (resolvedParam ? `Avg ${resolvedParam}` : 'Total Reports') : 'Average Value'}
                  </div>
                  <div className="summary-value">{stats.avg}</div>
                </div>

                {metric === 'glucose' && (
                  <>
                    <div className="summary-item">
                      <div className="summary-label">Fasting Average</div>
                      <div className="summary-value">{stats.glucoseFastingAvg}</div>
                    </div>
                    <div className="summary-item">
                      <div className="summary-label">Pre-Meal Average</div>
                      <div className="summary-value">{stats.glucosePreAvg}</div>
                    </div>
                    <div className="summary-item">
                      <div className="summary-label">Post-Meal Average</div>
                      <div className="summary-value">{stats.glucosePostAvg}</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="stats-subgroup mt-3">
              <h4 className="stats-subgroup-title">Extrema Records</h4>
              <div className="summary-list">
                <div className="summary-item">
                  <div className="summary-label">Highest Record</div>
                  <div className="summary-value color-danger">{stats.highest}</div>
                </div>
                <div className="summary-item">
                  <div className="summary-label">Lowest Record</div>
                  <div className="summary-value color-success">{stats.lowest}</div>
                </div>
              </div>
            </div>

            <div className="stats-subgroup mt-3">
              <h4 className="stats-subgroup-title">
                {metric === 'reports' ? 'Report Count' : 'Health Distribution'}
              </h4>
              <div className="summary-list">
                {metric === 'reports' ? (
                  <>
                    <div className="summary-item">
                      <div className="summary-label">Total Reports</div>
                      <div className="summary-value color-primary">{filteredLogs.length}</div>
                    </div>
                    <div className="summary-item">
                      <div className="summary-label">Parameters Detected</div>
                      <div className="summary-value color-success">{availableParams.length}</div>
                    </div>
                    {resolvedParam && (
                      <div className="summary-item">
                        <div className="summary-label">Data Points for "{resolvedParam}"</div>
                        <div className="summary-value">{stats.normal}</div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="summary-item">
                      <div className="summary-label">Normal Readings</div>
                      <div className="summary-value color-success">{stats.normal}</div>
                    </div>
                    <div className="summary-item">
                      <div className="summary-label">Elevated/Warning</div>
                      <div className="summary-value color-warning">{stats.warning}</div>
                    </div>
                    <div className="summary-item">
                      <div className="summary-label">High / Critical</div>
                      <div className="summary-value color-danger">{stats.critical}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
