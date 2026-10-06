import React, { useState, useMemo } from 'react';
import { Calculator, LineChart as ChartIcon, FlaskConical, FileText, X, TrendingUp } from 'lucide-react';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';
import type { WeightRecord, ReportRecord } from '../utils/api';
import { evaluateBP, evaluateHR, evaluateSpO2, evaluateGlucose, formatDateLabel } from '../utils/evaluators';
import { Line } from 'react-chartjs-2';
import {
  parseReportParameters,
  REPORT_TYPE_OPTIONS,
  getReportTypeFromRecord,
  getNormalRange  
} from '../utils/reportUtils';
import type { ReportType } from '../utils/reportUtils';

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

const formatShortDate = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatNumeric = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));


/**
 * Returns two invisible datasets that Chart.js will fill between, creating a
 * green normal-range band.
 * `n` is the number of data points (labels length) so the flat lines span the chart.
 */
function makeNormalBand(
  n: number,
  min: number,
  max: number,
  label = '✓ Normal Range'
): any[] {
  const flat = (v: number) => Array(n).fill(v);

  return [
    {
      label,
      data: flat(max),
      borderColor: 'transparent',
      backgroundColor: 'rgba(72, 199, 116, 0.13)',
      borderWidth: 0,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: '+1',
      tension: 0,
      order: 10,
    },
    {
      label: `Normal: ${min}–${max}`,
      data: flat(min),
      borderColor: 'transparent',
      borderWidth: 0,
      borderDash: [],
      backgroundColor: 'transparent',
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0,
      order: 11,
    },
  ];
}

function makeBPNormalBands(n: number): any[] {
  const flat = (v: number) => Array(n).fill(v);

  return [
    // Systolic: 90–120
    {
      label: '✓ Systolic Normal Range',
      data: flat(120),
      borderColor: 'transparent',
      backgroundColor: 'rgba(72, 199, 116, 0.13)',
      borderWidth: 0,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: {
        target: {
          value: 90,
        },
      },
      tension: 0,
      order: 20,
    },

    // Systolic lower boundary
    {
      label: 'Systolic: 90–120',
      data: flat(90),
      borderColor: 'transparent',
      borderWidth: 0,
      borderDash: [],
      backgroundColor: 'transparent',
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0,
      order: 21,
    },

    // Diastolic: 60–80
    {
      label: '✓ Diastolic Normal Range',
      data: flat(80),
      borderColor: 'transparent',
      backgroundColor: 'rgba(72, 199, 116, 0.13)',
      borderWidth: 0,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: {
        target: {
          value: 60,
        },
      },
      tension: 0,
      order: 22,
    },

    // Diastolic lower boundary
    {
      label: 'Diastolic: 60–80',
      data: flat(60),
      borderColor: 'transparent',
      borderWidth: 0,
      borderDash: [],
      backgroundColor: 'transparent',
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0,
      order: 23,
    },
  ];
}
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
  const [trendModalParam, setTrendModalParam] = useState<string>('');

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
      RFT: [],
      'Lipid Profile': [],
      'Thyroid Profile': [],
      HbA1c: [],
      'Urine Report': [],
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

  // Auto-select first param when params change
  const resolvedParam = useMemo(() => {
    if (metric !== 'reports') return '';
    if (availableParams.includes(selectedParam)) return selectedParam;
    return availableParams[0] ?? '';
  }, [metric, availableParams, selectedParam]);

  const activeReportComparisonRows = useMemo(() => {
    const rows: { parameter: string; latest: number | null; previous: number | null; normalRange: string | null }[] = [];
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
      const range = getNormalRange(parameter);
      const normalRange = range ? `${range[0]}–${range[1]}` : null;
      rows.push({ parameter, latest, previous, normalRange });
    });
    return rows;
  }, [activeReportParams, activeReportLogs]);

  const abnormalFindings = useMemo(() => {
    return activeReportComparisonRows
      .filter((row) => {
        if (row.latest === null) return false;

        const range = getNormalRange(row.parameter);
        if (!range) return false;

        return (
          row.latest < range[0] ||
          row.latest > range[1]
        );
      })
      .map((row) => {
        const value = row.latest as number;
        const range = getNormalRange(row.parameter)!;

        return {
          parameter: row.parameter,
          value,
          status: value < range[0] ? 'Low' : 'High',
        };
      });
  }, [activeReportComparisonRows]);

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
      estimatedHbA1c: '--',
    };

    if (filteredLogs.length === 0) return results;

    let normalCount = 0;
    let warningCount = 0;
    let criticalCount = 0;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const getRecent = <T extends { timestamp: string }>(arr: T[]) => arr.filter(item => new Date(item.timestamp) >= sevenDaysAgo);

    if (metric === 'bp') {
      const bpLogs = filteredLogs as VitalsRecord[];
      const recentBpLogs = getRecent(bpLogs);
      results.avg = recentBpLogs.length > 0 ? `${Math.round(recentBpLogs.reduce((a, b) => a + b.systolic, 0) / recentBpLogs.length)}/${Math.round(recentBpLogs.reduce((a, b) => a + b.diastolic, 0) / recentBpLogs.length)} mmHg` : '--/-- mmHg';
      if (bpLogs.length > 0) {
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
      }

    } else if (metric === 'hr') {
      const hrLogs = filteredLogs as VitalsRecord[];
      const recentHrLogs = getRecent(hrLogs);
      results.avg = recentHrLogs.length > 0 ? `${Math.round(recentHrLogs.reduce((a, b) => a + b.hr, 0) / recentHrLogs.length)} bpm` : '-- bpm';
      if (hrLogs.length > 0) {
        const sorted = [...hrLogs].sort((a, b) => b.hr - a.hr);
        results.highest = `${sorted[0].hr} bpm`;
        results.lowest = `${sorted[sorted.length - 1].hr} bpm`;
        hrLogs.forEach(log => {
          const e = evaluateHR(log.hr);
          if (e.className === 'status-normal') normalCount++;
          else if (e.className === 'status-elevated' || e.className === 'status-low') warningCount++;
          else criticalCount++;
        });
      }

    } else if (metric === 'spo2') {
      const spo2Logs = (filteredLogs as VitalsRecord[]).filter(l => l.spo2 !== null);
      const recentSpo2Logs = getRecent(spo2Logs);
      if (spo2Logs.length > 0) {
        results.avg = recentSpo2Logs.length > 0 ? `${Math.round(recentSpo2Logs.reduce((a, b) => a + (b.spo2 || 0), 0) / recentSpo2Logs.length)}%` : '--%';
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
      const recentGlLogs = getRecent(glLogs);

      const now = new Date();
      const past3MonthsGlucose = glucose.filter(log => {
        const logDate = new Date(log.timestamp);
        const diffDays = Math.ceil(Math.abs(now.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 90;
      });
      if (past3MonthsGlucose.length > 0) {
        const sum = past3MonthsGlucose.reduce((a, b) => a + b.value, 0);
        const avg = sum / past3MonthsGlucose.length;
        const hba1c = (avg + 46.7) / 28.7;
        results.estimatedHbA1c = `${hba1c.toFixed(1)}%`;
      }

      results.avg = recentGlLogs.length > 0 ? `${Math.round(recentGlLogs.reduce((a, b) => a + b.value, 0) / recentGlLogs.length)} mg/dL` : '-- mg/dL';
      if (glLogs.length > 0) {
        const sorted = [...glLogs].sort((a, b) => b.value - a.value);
        results.highest = `${sorted[0].value} mg/dL`;
        results.lowest = `${sorted[sorted.length - 1].value} mg/dL`;
      }
      const calcAvg = (arr: GlucoseRecord[]) => arr.length ? `${Math.round(arr.reduce((a, b) => a + b.value, 0) / arr.length)} mg/dL` : '--';
      results.glucoseFastingAvg = calcAvg(recentGlLogs.filter(l => l.context === 'fasting'));
      results.glucosePreAvg = calcAvg(recentGlLogs.filter(l => l.context === 'pre-meal'));
      results.glucosePostAvg = calcAvg(recentGlLogs.filter(l => l.context === 'post-meal'));
      glLogs.forEach(log => {
        const e = evaluateGlucose(log.value, log.context);
        if (e.className === 'status-normal') normalCount++;
        else if (e.className === 'status-elevated') warningCount++;
        else criticalCount++;
      });

    } else if (metric === 'weight') {
      const wtLogs = filteredLogs as WeightRecord[];
      const recentWtLogs = getRecent(wtLogs);
      const sum = recentWtLogs.reduce((a, b) => a + b.value, 0);
      results.avg = recentWtLogs.length > 0 ? `${(sum / recentWtLogs.length).toFixed(1)} kg` : '-- kg';
      if (wtLogs.length > 0) {
        const sorted = [...wtLogs].sort((a, b) => b.value - a.value);
        results.highest = `${sorted[0].value} kg`;
        results.lowest = `${sorted[sorted.length - 1].value} kg`;
        normalCount = wtLogs.length;
      }

    } else if (metric === 'reports') {
      const repLogs = filteredLogs as ReportRecord[];
      const recentRepLogs = getRecent(repLogs);
      if (resolvedParam) {
        const values: number[] = [];
        const recentValues: number[] = [];
        repLogs.forEach(r => {
          const parsed = parseReportParameters(r.data);
          if (resolvedParam in parsed) values.push(parsed[resolvedParam]);
        });
        recentRepLogs.forEach(r => {
          const parsed = parseReportParameters(r.data);
          if (resolvedParam in parsed) recentValues.push(parsed[resolvedParam]);
        });
        if (recentValues.length > 0) {
          results.avg = `${(recentValues.reduce((a, b) => a + b, 0) / recentValues.length).toFixed(2)}`;
        }
        if (values.length > 0) {
          results.highest = `${Math.max(...values).toFixed(2)}`;
          results.lowest = `${Math.min(...values).toFixed(2)}`;
          normalCount = values.length;
        }
      } else {
        results.avg = `${recentRepLogs.length} reports`;
        normalCount = repLogs.length;
      }
    }

    results.normal = normalCount;
    results.warning = warningCount;
    results.critical = criticalCount;
    return results;
  }, [filteredLogs, metric, resolvedParam, glucose]);

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
          {
            label: 'Systolic (BP High)',
            data: bpLogs.map(l => l.systolic),
            borderColor: 'hsl(355, 78%, 56%)',
            backgroundColor: 'hsla(355, 78%, 56%, 0.10)',
            borderWidth: 3,
            tension: 0.25,
            fill: false,
            pointBackgroundColor: 'hsl(355, 78%, 56%)',
            pointHoverRadius: 7,
            order: 1,
          },

          {
            label: 'Diastolic (BP Low)',
            data: bpLogs.map(l => l.diastolic),
            borderColor: 'hsl(200, 85%, 55%)',
            backgroundColor: 'hsla(200, 85%, 55%, 0.10)',
            borderWidth: 3,
            tension: 0.25,
            fill: false,
            pointBackgroundColor: 'hsl(200, 85%, 55%)',
            pointHoverRadius: 7,
            order: 2,
          },

          ...makeBPNormalBands(labels.length),
        ],
      };
    } else if (metric === 'hr') {
      const hrLogs = filteredLogs as VitalsRecord[];

      return {
        labels,
        datasets: [
          {
            label: 'Heart Rate (bpm)',
            data: hrLogs.map(l => l.hr),
            borderColor: 'hsl(330, 80%, 60%)',
            backgroundColor: 'transparent',
            borderWidth: 3,
            tension: 0.3,
            fill: false,
            pointBackgroundColor: 'hsl(330, 80%, 60%)',
            order: 1
          },

          // Normal HR: 60–100 bpm
          ...makeNormalBand(
            labels.length,
            60,
            100
          )
        ]
      };

    } else if (metric === 'spo2') {
      const spo2Logs = filteredLogs as VitalsRecord[];

      return {
        labels,
        datasets: [
          {
            label: 'SpO₂ (%)',
            data: spo2Logs.map(l => l.spo2),
            borderColor: 'hsl(200, 85%, 55%)',
            backgroundColor: 'transparent',
            borderWidth: 3,
            tension: 0.2,
            fill: false,
            pointBackgroundColor: 'hsl(200, 85%, 55%)',
            order: 1
          },

          // Normal SpO₂: 95–100%
          ...makeNormalBand(
            labels.length,
            95,
            100
          )
        ]
      };

    } else if (metric === 'weight') {
      const weightLogs = filteredLogs as WeightRecord[];

      return {
        labels,
        datasets: [
          {
            label: 'Body Weight (kg)',
            data: weightLogs.map(l => l.value),
            borderColor: 'hsl(150, 80%, 40%)',
            backgroundColor: 'transparent',
            borderWidth: 3,
            tension: 0.2,
            fill: false,
            pointBackgroundColor: 'hsl(150, 80%, 40%)',
            order: 1
          }
        ]
      };

    } else if (metric === 'reports' && resolvedParam) {
      const repLogs = filteredLogs as ReportRecord[];

      const dataPoints: {
        label: string;
        value: number;
      }[] = [];

      repLogs.forEach(r => {
        const parsed = parseReportParameters(r.data);

        if (resolvedParam in parsed) {
          dataPoints.push({
            label: formatDateLabel(r.timestamp),
            value: parsed[resolvedParam]
          });
        }
      });

      const range = getNormalRange(resolvedParam);

      return {
        labels: dataPoints.map(d => d.label),

        datasets: [
          {
            label: resolvedParam,
            data: dataPoints.map(d => d.value),
            borderColor: PARAM_COLORS[0],
            backgroundColor: 'transparent',
            borderWidth: 3,
            tension: 0.25,
            fill: false,
            pointBackgroundColor: PARAM_COLORS[0],
            pointHoverRadius: 7,
            spanGaps: true,
            order: 1
          },

          // Normal range for medical-report parameter
          ...(range
            ? makeNormalBand(
                dataPoints.length,
                range[0],
                range[1]
              )
            : [])
        ]
      };

    } else {
      return {
        labels: [],
        datasets: []
      };
    }
  }, [filteredLogs, metric, resolvedParam]);

  const glucoseCharts = useMemo(() => {
    if (metric !== 'glucose') return null;

    const glLogs = filteredLogs as GlucoseRecord[];

    const buildContextChart = (
      context: string,
      label: string,
      color: string,
      normalMin: number,
      normalMax: number
    ) => {
      const contextLogs = glLogs.filter(
        l => l.context === context
      );

      const chartLabels = contextLogs.map(
        l => formatDateLabel(l.timestamp)
      );

      return {
        logs: contextLogs,

        data: {
          labels: chartLabels,

          datasets: [
            // Actual glucose values
            {
              label,
              data: contextLogs.map(l => l.value),
              borderColor: color,
              backgroundColor: color
                .replace('hsl', 'hsla')
                .replace(')', ', 0.10)'),
              borderWidth: 3,
              tension: 0.3,
              fill: false,
              pointBackgroundColor: color,
              pointHoverRadius: 7,
              order: 1,
            },

            // Green normal range
            ...makeNormalBand(
              chartLabels.length,
              normalMin,
              normalMax
            ),
          ],
        },
      };
    };

    return {
      fasting: buildContextChart(
        'fasting',
        'Fasting Glucose (mg/dL)',
        'hsl(150, 80%, 40%)',
        70,
        99
      ),

      preMeal: buildContextChart(
        'pre-meal',
        'Pre-Meal Glucose (mg/dL)',
        'hsl(35, 90%, 55%)',
        70,
        130
      ),

      postMeal: buildContextChart(
        'post-meal',
        'Post-Meal Glucose (mg/dL)',
        'hsl(280, 80%, 60%)',
        70,
        140
      ),
    };
  }, [filteredLogs, metric]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,

    plugins: {
      legend: {
        labels: {
          color: textColor,
          font: { family: 'Outfit' },

          filter: (legendItem: any) => {
            const text = legendItem.text.toLowerCase();

            return (
              !text.includes('normal range') &&
              !text.startsWith('normal:') &&
              !text.includes('systolic:') &&
              !text.includes('diastolic:')
            );
          },
        },
      },

      tooltip: {
        titleFont: { family: 'Outfit' },
        bodyFont: { family: 'Outfit' },
      },
    },

    scales: {
      x: {
        grid: { color: gridColor },
        ticks: {
          color: textColor,
          font: { family: 'Outfit' },
        },
      },

      y: {
        grid: { color: gridColor },
        ticks: {
          color: textColor,
          font: { family: 'Outfit' },
        },
      },
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
            <label
                htmlFor="analytics-metric-select"
                style={{ display: 'block', marginBottom: '8px' }}
            >
                Select Metric
            </label>
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

          {metric !== 'reports' && (
            <div className="filter-group">
              <label
                htmlFor="analytics-timeframe-select"
                style={{ display: 'block', marginBottom: '8px', marginTop: '8px' }}
              >
                Time Range
              </label>

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
          )}
        </div>
      </div>

      <div className={`dashboard-grid ${showReportCharts ? 'reports-active' : ''}`}>
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
                        <div className="summary-label">Latest Report Date</div>
                        <div className="summary-value">{formatShortDate(activeReportLogs[0].timestamp)}</div>
                      </div>
                    </div>

                    <div className="glucose-chart-section" style={{ marginTop: '1.5rem' }}>
                      <h4 className="glucose-chart-label color-danger">
                        Abnormal Findings
                      </h4>
                      <div className="summary-list">
                        {abnormalFindings.length > 0 ? (
                          abnormalFindings.map(item => (
                            <div
                              key={item.parameter}
                              className="summary-item"
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr auto auto',
                                columnGap: '2rem',
                                alignItems: 'center',
                              }}
                            >
                              <div className="summary-label">
                                {item.parameter}
                              </div>

                              <div className="summary-value color-danger">
                                {formatNumeric(item.value)}
                              </div>

                              <div className="summary-value color-gold">
                                {item.status}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="d-flex align-center justify-center h-100 text-muted">
                            No abnormal findings detected.
                          </div>
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
                              <th>Normal Range</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeReportComparisonRows.length > 0 ? activeReportComparisonRows.map(row => (
                              <tr
                                key={row.parameter}
                                onClick={() => setTrendModalParam(row.parameter)}
                                style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                                className="param-trend-row"
                                title={`Click to view trend for ${row.parameter}`}
                              >
                                <td style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <TrendingUp size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
                                  {row.parameter}
                                </td>
                                <td>{row.latest === null ? '--' : formatNumeric(row.latest)}</td>
                                <td>{row.previous === null ? '--' : formatNumeric(row.previous)}</td>
                                <td>{row.normalRange || '--'}</td>
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

                    <p className="text-xs text-muted mt-3" style={{ opacity: 0.65 }}>
                      💡 Click any row in the table above to view its trend chart.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Parameter Trend Modal ─────────────────────────────────────────── */}
        {trendModalParam && (() => {
          // Build chart data for the selected modal parameter
          const modalChartLabels = [...activeReportLogs].reverse().map(r => formatShortDate(r.timestamp));
          const modalChartValues = [...activeReportLogs].reverse().map(r => {
            const parsed = parseReportParameters(r.data);
            const match = Object.entries(parsed).find(([key]) => key.toLowerCase() === trendModalParam.toLowerCase());
            return match ? match[1] : null;
          });
          const numericValues = modalChartValues.filter((v): v is number => typeof v === 'number');
          const modalNormalRange = getNormalRange(trendModalParam);
          const modalChartData = {
            labels: modalChartLabels,
            datasets: [
              {
                label: trendModalParam,
                data: modalChartValues,
                borderColor: PARAM_COLORS[0],
                backgroundColor: 'transparent',
                borderWidth: 3,
                tension: 0.25,
                fill: false,
                pointBackgroundColor: PARAM_COLORS[0],
                pointHoverRadius: 7,
                spanGaps: true,
                order: 1,
              },
              ...(modalNormalRange ? makeNormalBand(modalChartLabels.length, modalNormalRange[0], modalNormalRange[1]) : []),
            ],
          };
          const currentVal = numericValues[numericValues.length - 1] ?? null;
          const avgVal = numericValues.length ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length : null;
          const maxVal = numericValues.length ? Math.max(...numericValues) : null;
          const minVal = numericValues.length ? Math.min(...numericValues) : null;

          return (
            <div
              className="modal-overlay active"
              onClick={(e) => { if (e.target === e.currentTarget) setTrendModalParam(''); }}
              style={{ zIndex: 1200 }}
            >
              <div
                className="modal-card"
                style={{ maxWidth: '680px', width: '95%', maxHeight: '85vh', overflowY: 'auto' }}
              >
                <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <TrendingUp size={20} style={{ color: PARAM_COLORS[0] }} />
                    <div>
                      <h3 style={{ margin: 0 }}>{trendModalParam}</h3>
                      <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.6 }}>{selectedReportType} — Parameter Trend</p>
                    </div>
                  </div>
                  <button
                    className="modal-close"
                    onClick={() => setTrendModalParam('')}
                    aria-label="Close trend"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="modal-body">
                  {/* Mini stat row */}
                  <div className="summary-list" style={{ marginBottom: '1.25rem' }}>
                    <div className="summary-item">
                      <div className="summary-label">Current</div>
                      <div className="summary-value">{currentVal !== null ? formatNumeric(currentVal) : '--'}</div>
                    </div>
                    <div className="summary-item">
                      <div className="summary-label">Average</div>
                      <div className="summary-value">{avgVal !== null ? formatNumeric(avgVal) : '--'}</div>
                    </div>
                    <div className="summary-item">
                      <div className="summary-label">Highest</div>
                      <div className="summary-value">{maxVal !== null ? formatNumeric(maxVal) : '--'}</div>
                    </div>
                    <div className="summary-item">
                      <div className="summary-label">Lowest</div>
                      <div className="summary-value">{minVal !== null ? formatNumeric(minVal) : '--'}</div>
                    </div>
                    <div className="summary-item">
                      <div className="summary-label">Data Points</div>
                      <div className="summary-value">{numericValues.length}</div>
                    </div>
                  </div>

                  {/* Trend chart */}
                  {numericValues.length > 0 ? (
                    <div style={{ height: '280px' }}>
                      <Line data={modalChartData} options={{
                        ...chartOptions,
                        maintainAspectRatio: false,
                        plugins: {
                          ...chartOptions.plugins,
                          legend: { display: false },
                        },
                      }} />
                    </div>
                  ) : (
                    <div className="d-flex align-center justify-center text-muted" style={{ height: '120px' }}>
                      Not enough data points to plot a trend.
                    </div>
                  )}

                  {/* Navigation hint */}
                  {activeReportParams.length > 1 && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '1rem', flexWrap: 'wrap' }}>
                      {activeReportParams.map(p => (
                        <button
                          key={p}
                          onClick={() => setTrendModalParam(p)}
                          style={{
                            padding: '4px 12px',
                            borderRadius: '999px',
                            border: '1px solid',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            background: p === trendModalParam ? PARAM_COLORS[0] : 'transparent',
                            borderColor: p === trendModalParam ? PARAM_COLORS[0] : 'var(--border)',
                            color: p === trendModalParam ? '#fff' : 'var(--text-secondary)',
                            transition: 'all 0.15s',
                          }}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Statistics Panel */}
        {!showReportCharts && (
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
                      {metric === 'glucose' ? 'Overall Average' : 'Average Value'}
                    </div>
                    <div className="summary-value">{stats.avg}</div>
                  </div>

                  {metric === 'glucose' && (
                    <>
                      <div className="summary-item">
                        <div className="summary-label">Estimated HbA1c (90 Days)</div>
                        <div className="summary-value">{stats.estimatedHbA1c}</div>
                      </div>
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
                  Health Distribution
                </h4>
                <div className="summary-list">
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
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
