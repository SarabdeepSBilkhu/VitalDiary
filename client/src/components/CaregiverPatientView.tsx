import React, { useState, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import {
  Activity, Heart, Droplet, Thermometer, TrendingUp, CalendarRange,
  Weight, User, AlertCircle, FlaskConical, X, Calculator, FileText
} from 'lucide-react';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';
import { api, type WeightRecord, type ReportRecord, type ProfileRecord } from '../utils/api';
import { evaluateBP, evaluateHR, evaluateSpO2, evaluateGlucose, formatDateLabel } from '../utils/evaluators';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  parseReportParameters,
  REPORT_TYPE_OPTIONS,
  getReportTypeFromRecord,
  getNormalRange
} from '../utils/reportUtils';
import { type ReportType, parseAllReportParameters, getLatestReportsByType } from '../utils/reportUtils';

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

function makeNormalBand(
  n: number,
  min: number,
  max: number
): any[] {
  const flat = (v: number) => Array(n).fill(v);

  return [
    {
      label: 'Normal Range',
      data: flat(max),

      borderColor: 'transparent',
      backgroundColor: 'rgba(72, 199, 116, 0.13)',
      borderWidth: 0,

      pointRadius: 0,
      pointHoverRadius: 0,
      pointHitRadius: 0,

      fill: '+1',
      tension: 0,

      order: 10,
      isNormalBand: true,
    },
    {
      label: 'Normal Range Floor',
      data: flat(min),

      borderColor: 'transparent',
      backgroundColor: 'transparent',
      borderWidth: 0,

      pointRadius: 0,
      pointHoverRadius: 0,
      pointHitRadius: 0,

      fill: false,
      tension: 0,

      order: 11,
      isNormalBand: true,
    },
  ];
}

const bpNormalRangePlugin = {
  id: 'bpNormalRange',

  beforeDraw(chart: any, _args: any, options: any) {
    if (!options?.enabled) return;

    const { ctx, chartArea, scales } = chart;
    const y = scales.y;

    if (!y || !chartArea) return;

    const { left, right } = chartArea;

    const systolicTop = y.getPixelForValue(120);
    const systolicBottom = y.getPixelForValue(90);

    const diastolicTop = y.getPixelForValue(80);
    const diastolicBottom = y.getPixelForValue(60);

    ctx.save();

    ctx.fillStyle = 'rgba(72, 199, 116, 0.13)';

    // Systolic: 90–120
    ctx.fillRect(
      left,
      systolicTop,
      right - left,
      systolicBottom - systolicTop
    );

    // Diastolic: 60–80
    ctx.fillRect(
      left,
      diastolicTop,
      right - left,
      diastolicBottom - diastolicTop
    );

    ctx.restore();
  }
};

function renderChartToPng(config: ConstructorParameters<typeof ChartJS>[1], width = 800, height = 280): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(''); return; }
    const chart = new ChartJS(ctx, config as any);
    // Chart.js renders synchronously in this context, but we give it a tick to settle
    setTimeout(() => {
      const dataUrl = canvas.toDataURL('image/png');
      chart.destroy();
      canvas.remove();
      resolve(dataUrl);
    }, 100);
  });
}

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  bpNormalRangePlugin
);

const fmtDT = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatShortDate = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
};

type ExportPreset = '7days' | '30days' | '90days' | '1year' | 'all' | 'custom';
const formatNumeric = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));
const toDateInputValue = (d: Date) => d.toISOString().slice(0, 10);
const PRESET_DAYS: Record<Exclude<ExportPreset, 'all' | 'custom'>, number> = {
  '7days': 7,
  '30days': 30,
  '90days': 90,
  '1year': 365,
};
const isWithinRange = (timestamp: string, from: Date, to: Date) => {
  const logDate = new Date(timestamp);
  return logDate >= from && logDate <= to;
};
const filterByRange = <T extends { timestamp: string }>(records: T[], from: Date, to: Date) =>
  records
    .filter(r => isWithinRange(r.timestamp, from, to))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

// Collect all unique parameter names across a list of reports
function collectParameters(reports: ReportRecord[]): string[] {
  const paramSet = new Set<string>();
  for (const r of reports) {
    const parsed = parseReportParameters(r.data);
    Object.keys(parsed).forEach(k => paramSet.add(k));
  }
  return Array.from(paramSet).sort();
}

const displayOrNA = (value: string | number | undefined | null) => {
  if (value === undefined || value === null || value === '') return 'N/A';
  return String(value);
};

interface CaregiverPatientViewProps {
  patientInfo: any;
  vitals: VitalsRecord[];
  glucose: GlucoseRecord[];
  weights: WeightRecord[];
  reports: ReportRecord[];
  allLogs: any[];
  userEmail: string;
  healthAlerts?: { type: 'info' | 'warning' | 'danger', message: string }[];
  showToast: (msg: string, type?: 'success' | 'danger' | 'warning' | 'info') => void;
  onOpenLogModal: (log?: any) => void;
}

export const CaregiverPatientView: React.FC<CaregiverPatientViewProps> = ({
  patientInfo,
  vitals,
  glucose,
  weights,
  reports,
  allLogs,
  userEmail,
  healthAlerts = [],
  showToast,
  onOpenLogModal
}) => {
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('CBC');
  const [timeframe, setTimeframe] = useState<'7days' | '30days' | '1year' | 'all'>('30days');
  const [trendModalParam, setTrendModalParam] = useState<string | null>(null);
  const [statsModalType, setStatsModalType] = useState<'bp' | 'hr' | 'spo2' | 'glucose' | 'weight' | null>(null);
  const [exportPreset, setExportPreset] = useState<ExportPreset>('7days');
  const today = toDateInputValue(new Date());
  const sevenDaysAgo = toDateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [customFrom, setCustomFrom] = useState(sevenDaysAgo);
  const [customTo, setCustomTo] = useState(today);

  // ── Export parameter selection state ──────────────────────────────────────────
  const [pdfIncludes, setPdfIncludes] = useState({
    vitals: true,
    glucose: true,
    weight: true,
    reports: true
  });

  const exportRange = useMemo<{ from: Date; to: Date }>(() => {
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    if (exportPreset === 'all') {
      return { from: new Date(0), to };
    }
    if (exportPreset === 'custom') {
      const from = new Date(customFrom);
      from.setHours(0, 0, 0, 0);
      const customToDate = new Date(customTo);
      customToDate.setHours(23, 59, 59, 999);
      return { from, to: customToDate };
    }
    const from = new Date();
    from.setDate(from.getDate() - PRESET_DAYS[exportPreset]);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }, [exportPreset, customFrom, customTo]);

  const exportRangeLabel = useMemo(() => {
      if (exportPreset === 'all') return 'All Time';
      return `${exportRange.from.toLocaleDateString()} - ${exportRange.to.toLocaleDateString()}`;
    }, [exportPreset, exportRange]);

  // Group reports by type
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

  // Latest values
  const latestVital = vitals[0] || null;
  const latestGlucose = glucose[0] || null;
  const latestWeight = weights[0] || null;

  const bpEval = latestVital ? evaluateBP(latestVital.systolic, latestVital.diastolic) : null;
  const hrEval = latestVital ? evaluateHR(latestVital.hr) : null;
  const spo2Eval = latestVital ? evaluateSpO2(latestVital.spo2) : null;
  const glucoseEval = latestGlucose ? evaluateGlucose(latestGlucose.value, latestGlucose.context) : null;

  const tempEval = latestVital?.temperature 
    ? (latestVital.temperature_unit === 'C' 
      ? (latestVital.temperature > 38 ? { status: "Fever", className: "status-high" } : { status: "Normal", className: "status-normal" })
      : (latestVital.temperature > 100.4 ? { status: "Fever", className: "status-high" } : { status: "Normal", className: "status-normal" })
    ) : null;



  // Chart configurations
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? '#b2ccd6' : '#546e7a';

  // Filter data based on timeframe
  const filterByTimeframe = <T,>(data: T[], timestampKey: string): T[] => {
    const now = new Date();
    return data.filter(item => {
      const itemDate = new Date((item as any)[timestampKey]);
      const diffDays = Math.ceil(Math.abs(now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));
      if (timeframe === '7days') return diffDays <= 7;
      if (timeframe === '30days') return diffDays <= 30;
      if (timeframe === '1year') return diffDays <= 365;
      return true;
    }).sort((a, b) => new Date((a as any)[timestampKey]).getTime() - new Date((b as any)[timestampKey]).getTime()); // chronological order
  };

  const filteredVitals = filterByTimeframe(vitals, 'timestamp');
  const filteredGlucose = filterByTimeframe(glucose, 'timestamp');
  const filteredWeights = filterByTimeframe(weights, 'timestamp');

  // BP Trend Chart
  const chartVitals = [...filteredVitals];
  const bpChartData = {
    labels: chartVitals.map(l => formatDateLabel(l.timestamp)),

    datasets: [
      {
        label: 'Systolic',
        data: chartVitals.map(l => l.systolic),
        borderColor: 'hsl(355, 78%, 56%)',
        backgroundColor: 'transparent',
        borderWidth: 3,
        tension: 0.25,
        fill: false,
        pointBackgroundColor: 'hsl(355, 78%, 56%)',
        pointHoverRadius: 7,
        order: 1,
      },

      {
        label: 'Diastolic',
        data: chartVitals.map(l => l.diastolic),
        borderColor: 'hsl(200, 85%, 55%)',
        backgroundColor: 'transparent',
        borderWidth: 3,
        tension: 0.25,
        fill: false,
        pointBackgroundColor: 'hsl(200, 85%, 55%)',
        pointHoverRadius: 7,
        order: 2,
      },
    ],
  };
  // Heart Rate Trend Chart
  const hrNormalMin = 60;
  const hrNormalMax = 90;

  const hrChartData = {
    labels: chartVitals.map(l => formatDateLabel(l.timestamp)),
    datasets: [
      {
        label: 'Normal Range',
        data: Array(chartVitals.length).fill(hrNormalMax),
        borderColor: 'transparent',
        backgroundColor: 'rgba(72, 199, 116, 0.13)',
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        pointHitRadius: 0,
        fill: '+1',
        tension: 0,
        order: 10,
        isNormalBand: true,
      },
      {
        label: `Normal: ${hrNormalMin}–${hrNormalMax}`,
        data: Array(chartVitals.length).fill(hrNormalMin),
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        borderWidth: 0,
        borderDash: [],
        pointRadius: 0,
        pointHoverRadius: 0,
        pointHitRadius: 0,
        fill: false,
        tension: 0,
        order: 11,
        isNormalBand: true,
      },
      {
        label: 'Heart Rate',
        data: chartVitals.map(l => l.hr),
        borderColor: 'hsla(330, 80%, 60%, 1.00)',
        backgroundColor: 'transparent',
        borderWidth: 3,
        tension: 0.25,
        fill: false,
        pointBackgroundColor: 'hsla(330, 80%, 60%, 1.00)',
        pointHoverRadius: 7,
        order: 1,
      },
    ],
  };


  // SpO₂ Trend Chart
  const spo2NormalMin = 95;
  const spo2NormalMax = 100;

  const spo2ChartData = {
    labels: chartVitals.map(l => formatDateLabel(l.timestamp)),
    datasets: [
      {
        label: 'Normal Range',
        data: Array(chartVitals.length).fill(spo2NormalMax),
        borderColor: 'transparent',
        backgroundColor: 'rgba(72, 199, 116, 0.13)',
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        pointHitRadius: 0,
        fill: '+1',
        tension: 0,
        order: 10,
        isNormalBand: true,
      },
      {
        label: `Normal: ${spo2NormalMin}–${spo2NormalMax}%`,
        data: Array(chartVitals.length).fill(spo2NormalMin),
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        borderWidth: 0,
        borderDash: [],
        pointRadius: 0,
        pointHoverRadius: 0,
        pointHitRadius: 0,
        fill: false,
        tension: 0,
        order: 11,
        isNormalBand: true,
      },
      {
        label: 'SpO₂',
        data: chartVitals.map(l => l.spo2),
        borderColor: 'hsl(200, 85%, 55%)',
        backgroundColor: 'transparent',
        borderWidth: 3,
        tension: 0.25,
        fill: false,
        pointBackgroundColor: 'hsl(200, 85%, 55%)',
        pointHoverRadius: 7,
        spanGaps: true,
        order: 1,
      },
    ],
  };
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    
    plugins: {
      legend: {
        labels: {
          color: textColor,
          font: { family: 'Outfit' },

          filter: (legendItem: any, data: any) => {
            const dataset = data.datasets[legendItem.datasetIndex];

            return !dataset?.isNormalBand;
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
  
  const bpChartOptions = {
    ...chartOptions,

    plugins: {
      ...chartOptions.plugins,

      bpNormalRange: {
        enabled: true,
      },

      legend: {
        labels: {
          color: textColor,
          font: { family: 'Outfit' },
        },
      },
    },
  };

  // Weight Trend Chart
  const chartWeights = [...filteredWeights];
  const weightChartData = {
    labels: chartWeights.map(l => formatDateLabel(l.timestamp)),
    datasets: [
      {
        label: 'Weight',
        data: chartWeights.map(l => l.value),
        borderColor: 'hsl(150, 70%, 45%)',
        backgroundColor: 'hsla(150, 70%, 45%, 0.1)',
        borderWidth: 3,
        tension: 0.3,
        fill: false,
        pointBackgroundColor: 'hsl(150, 70%, 45%)',
        pointHoverRadius: 7
      }
    ]
  };
  

  // 1. Export PDF
    const handleExportPDF = async () => {
      let profile: ProfileRecord = {
        name: '', age: '', gender: '', bloodGroup: '', height: '', allergies: '', emergencyContact: '',
      };
      try {
        profile = await api.getProfile();
      } catch {
        // Continue with empty profile if fetch fails
      }
  
      const vitalsFiltered = filterByRange(vitals, exportRange.from, exportRange.to);
      const glucoseFiltered = filterByRange(glucose, exportRange.from, exportRange.to);
      const weightsFiltered = filterByRange(weights, exportRange.from, exportRange.to);
      const latestReportsByType = getLatestReportsByType(reports);
  
      const hasContent = vitalsFiltered.length > 0 || glucoseFiltered.length > 0 || weightsFiltered.length > 0 || latestReportsByType.length > 0
        || [profile.name, profile.age, profile.gender, profile.bloodGroup, profile.height, profile.allergies, profile.emergencyContact]
          .some(v => v?.trim());
  
      if (!hasContent) {
        showToast('No profile or health data available to export.', 'warning');
        return;
      }
  
      const periodLabel = exportRangeLabel;
  
      const doc = new jsPDF();
      let y = 20;
  
      const ensurePageSpace = (needed: number) => {
        if (y + needed > 280) {
          doc.addPage();
          y = 20;
        }
      };
  
      const drawSummaryBox = (title: string, lines: string[]) => {
          const boxWidth = 182;
          const padding = 6;
  
          const wrappedLines = lines.flatMap(line =>
              doc.splitTextToSize(line, boxWidth - padding * 2)
          );
  
          const boxHeight = 14 + wrappedLines.length * 6;
  
          ensurePageSpace(boxHeight + 4);
  
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(220, 225, 230);
          doc.roundedRect(
          14,
          y,
          boxWidth,
          boxHeight,
          2,
          2,
          'FD'
          );
  
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(50, 50, 50);
          doc.text(title, 14 + padding, y + 8);
  
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
  
          let lineY = y + 16;
          wrappedLines.forEach(line => {
              doc.text(line, 14 + padding, lineY);
              lineY += 6;
          });
  
          y += boxHeight + 8;
      };
  
      const drawHeader = (title: string, color: [number, number, number], cols: { name: string; x: number }[]) => {
        ensurePageSpace(20);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(50, 50, 50);
        doc.text(title, 14, y);
        y += 6;
        doc.setFillColor(...color);
        doc.rect(14, y, 182, 7, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        cols.forEach(c => doc.text(c.name, c.x, y + 5));
        y += 12;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
      };
  
      const drawContinuationHeader = (title: string, color: [number, number, number], cols: { name: string; x: number }[]) => {
        doc.addPage();
        y = 20;
        drawHeader(title, color, cols);
      };
  
      // Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(79, 93, 117);
  
      doc.text("VITALDIARY HEALTH REPORT", 14, 20);
  
      doc.setDrawColor(79, 93, 117);
      doc.setLineWidth(0.5);
      doc.line(14, 24, 196, 24);
  
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
  
      doc.text(
          `Generated on: ${new Date().toLocaleDateString()} | Reporting period: ${periodLabel}`,
          14,
          32
      );
  
      y = 45;
  
      // Patient summary
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(50, 50, 50);
      doc.text("PATIENT SUMMARY", 14, y); 
      doc.setDrawColor(220, 225, 230);
      doc.line(14, y + 3, 196, y + 3);
      y += 12;
      
      const patientLines = [
        `Name:               ${displayOrNA(profile.name)}`,
        `Age / Gender:       ${displayOrNA(profile.age)} / ${displayOrNA(profile.gender)}`,
        `Blood Group:        ${displayOrNA(profile.bloodGroup)}`,
        `Height:             ${displayOrNA(profile.height)}`,
        `Allergies:          ${displayOrNA(profile.allergies)}`,
        `Emergency Contact:  ${displayOrNA(profile.emergencyContact)}`,
        `Account Email:      ${userEmail}`,
        `Report Period:      ${periodLabel}`,
      ];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      patientLines.forEach(line => {
        ensurePageSpace(6);
        doc.text(line, 14, y);
        y += 6;
      });
      y += 8;
  
      // ─── Section 1: 30-day vitals ────────────────────────────────────────────
  
      if (pdfIncludes.vitals) {
        const vitalsCols = [
        { name: "Date & Time", x: 16 }, { name: "Sys / Dia", x: 60 },
        { name: "Heart Rate", x: 90 }, { name: "SpO2", x: 115 },
        { name: "Medical Status", x: 135 }, { name: "Notes", x: 165 }
      ];
  
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentVitals = vitalsFiltered.filter(v => new Date(v.timestamp) >= sevenDaysAgo);

      const avgSysPeriod = recentVitals.length ? Math.round(recentVitals.reduce((a, b) => a + Number(b.systolic), 0) / recentVitals.length) : 0;
      const avgDiaPeriod = recentVitals.length ? Math.round(recentVitals.reduce((a, b) => a + Number(b.diastolic), 0) / recentVitals.length) : 0;
      const avgHrPeriod = recentVitals.length ? Math.round(recentVitals.reduce((a, b) => a + Number(b.hr), 0) / recentVitals.length) : 0;
      const spo2Readings = recentVitals.filter(v => v.spo2);
      const avgSpo2Period = spo2Readings.length
        ? Math.round(spo2Readings.reduce((a, b) => a + Number(b.spo2 || 0), 0) / spo2Readings.length)
        : 0;
  
      drawSummaryBox(`VITALS SUMMARY — ${periodLabel} (${vitalsFiltered.length} readings)`, [
        `Average Blood Pressure:  ${avgSysPeriod ? `${avgSysPeriod}/${avgDiaPeriod} mmHg` : 'N/A'}`,
        `Average Heart Rate:      ${avgHrPeriod ? `${avgHrPeriod} bpm` : 'N/A'}`,
        `Average SpO2:            ${avgSpo2Period ? `${avgSpo2Period}%` : 'N/A'}`,
      ]);
  
      // ── Vitals charts (BP, Heart Rate, SpO2 — three separate charts) ─────────
      if (vitalsFiltered.length > 1) {
        const vitalsChronological = [...vitalsFiltered].reverse();
        const vitalsLabels = vitalsChronological.map(v =>
          new Date(v.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        );
        const vChartOpts = (yLabel: string) => ({
          animation: false as const,
          responsive: false,
          plugins: { legend: { position: 'top' as const, labels: { font: { size: 13 } } } },
          scales: {
            x: { ticks: { font: { size: 10 } } },
            y: { ticks: { font: { size: 10 } }, title: { display: true, text: yLabel, font: { size: 11 } } }
          }
        });
  
        // Blood Pressure chart
        const bpPng = await renderChartToPng({
          type: 'line',
          data: {
            labels: vitalsLabels,
            datasets: [
              { label: 'Systolic (mmHg)', data: vitalsChronological.map(v => v.systolic), borderColor: 'rgb(220, 80, 80)', backgroundColor: 'rgba(220, 80, 80, 0.07)', fill: true, tension: 0.3, pointRadius: 3, borderWidth: 2 },
              { label: 'Diastolic (mmHg)', data: vitalsChronological.map(v => v.diastolic), borderColor: 'rgb(79, 93, 200)', backgroundColor: 'rgba(79, 93, 200, 0.07)', fill: true, tension: 0.3, pointRadius: 3, borderWidth: 2 },
            ]
          },
          options: vChartOpts('mmHg')
        });
        if (bpPng) {
          ensurePageSpace(70);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
          doc.text('Blood Pressure Trend', 14, y); y += 4;
          doc.addImage(bpPng, 'PNG', 14, y, 182, 60);
          y += 64;
        }
  
        // Heart Rate chart
        const hrPng = await renderChartToPng({
          type: 'line',
          data: {
            labels: vitalsLabels,
            datasets: [
              { label: 'Heart Rate (bpm)', data: vitalsChronological.map(v => v.hr), borderColor: 'rgb(220, 140, 40)', backgroundColor: 'rgba(220, 140, 40, 0.07)', fill: true, tension: 0.3, pointRadius: 3, borderWidth: 2 },
            ]
          },
          options: vChartOpts('bpm')
        });
        if (hrPng) {
          ensurePageSpace(70);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
          doc.text('Heart Rate Trend', 14, y); y += 4;
          doc.addImage(hrPng, 'PNG', 14, y, 182, 60);
          y += 64;
        }
  
        // SpO2 chart (only if data exists)
        const spo2Data = vitalsChronological.map(v => v.spo2 ?? null);
        if (spo2Data.some(v => v !== null)) {
          const spo2Png = await renderChartToPng({
            type: 'line',
            data: {
              labels: vitalsLabels,
              datasets: [
                { label: 'SpO₂ (%)', data: spo2Data, borderColor: 'rgb(60, 160, 180)', backgroundColor: 'rgba(60, 160, 180, 0.07)', fill: true, tension: 0.3, pointRadius: 3, borderWidth: 2, spanGaps: false },
              ]
            },
            options: vChartOpts('%')
          });
          if (spo2Png) {
            ensurePageSpace(70);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
            doc.text('Blood Oxygen (SpO₂) Trend', 14, y); y += 4;
            doc.addImage(spo2Png, 'PNG', 14, y, 182, 60);
            y += 64;
          }
        }
      }
  
  
      drawHeader(`1. BLOOD PRESSURE & HEART RATE (${periodLabel})`, [79, 93, 117], vitalsCols);
  
      if (vitalsFiltered.length === 0) {
        doc.text(`No vitals recorded in the selected period.`, 16, y); y += 10;
      } else {
        vitalsFiltered.forEach(v => {
          if (y + 7 > 280) drawContinuationHeader("1. BLOOD PRESSURE & HEART RATE (Cont.)", [79, 93, 117], vitalsCols);
          doc.setFontSize(8);
          const bpStatus = evaluateBP(v.systolic, v.diastolic).status
            .replace("Stage 1 Hypertension", "Stage 1 HTN")
            .replace("Stage 2 Hypertension", "Stage 2 HTN")
            .replace("Hypertensive Crisis", "Crisis");
          const noteLines = doc.splitTextToSize(v.notes || '', 20).slice(0, 2);
          doc.text(fmtDT(v.timestamp), 16, y);
          doc.text(`${v.systolic}/${v.diastolic} mmHg`, 60, y);
          doc.text(v.hr ? `${v.hr} bpm` : 'N/A', 90, y);
          doc.text(v.spo2 ? `${v.spo2}%` : 'N/A', 115, y);
          doc.text(bpStatus, 135, y);
          doc.text(noteLines, 165, y);
          y += 7;
        });
      }
  
      y += 8;
      }
  
      // ─── Section 2: 30-day glucose (grouped by context) ───────────────────────
  
      if (pdfIncludes.glucose) {
        const glucoseGroupCols = [
        { name: "Date & Time", x: 16 }, { name: "Glucose Level", x: 70 },
        { name: "Guidelines Status", x: 110 }, { name: "Diet Notes", x: 155 }
      ];
  
      const glucoseGroups = [
        { key: 'fasting' as const, label: 'Fasting' },
        { key: 'pre-meal' as const, label: 'Pre-Meal' },
        { key: 'post-meal' as const, label: 'Post-Meal' },
      ];
  
      const calcGlucoseAvg = (logs: GlucoseRecord[]) =>
        logs.length ? Math.round(logs.reduce((a, b) => a + b.value, 0) / logs.length) : 0;
  
      const glFastingPeriod = glucoseFiltered.filter(g => g.context === 'fasting');
      const glPreMealPeriod = glucoseFiltered.filter(g => g.context === 'pre-meal');
      const glPostMealPeriod = glucoseFiltered.filter(g => g.context === 'post-meal');
      const avgFastPeriod = calcGlucoseAvg(glFastingPeriod);
      const avgPreMealPeriod = calcGlucoseAvg(glPreMealPeriod);
      const avgPostMealPeriod = calcGlucoseAvg(glPostMealPeriod);
  
      drawSummaryBox(`GLUCOSE SUMMARY — ${periodLabel} (${glucoseFiltered.length} readings)`, [
        `Fasting:    ${glFastingPeriod.length ? `avg ${avgFastPeriod} mg/dL (${glFastingPeriod.length} readings)` : 'N/A'}`,
        `Pre-Meal:   ${glPreMealPeriod.length ? `avg ${avgPreMealPeriod} mg/dL (${glPreMealPeriod.length} readings)` : 'N/A'}`,
        `Post-Meal:  ${glPostMealPeriod.length ? `avg ${avgPostMealPeriod} mg/dL (${glPostMealPeriod.length} readings)` : 'N/A'}`,
      ]);
  
      const drawGlucoseGroupHeader = () => {
        doc.setFillColor(115, 93, 120);
        doc.rect(14, y, 182, 7, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        glucoseGroupCols.forEach(c => doc.text(c.name, c.x, y + 5));
        y += 12;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
      };
  
      const drawGlucoseGroupContinuation = (groupLabel: string) => {
        doc.addPage();
        y = 20;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(50, 50, 50);
        doc.text(`2. BLOOD GLUCOSE (LAST 30 DAYS) — ${groupLabel} (Cont.)`, 14, y);
        y += 10;
        drawGlucoseGroupHeader();
      };
  
      // ── Glucose charts (Fasting, Pre-Meal, Post-Meal — three separate charts) ────────
      if (glucoseFiltered.length > 1) {
        const glucoseChronological = [...glucoseFiltered].reverse();
        const glucoseChartOpts = (yLabel: string) => ({
          animation: false as const,
          responsive: false,
          plugins: { legend: { position: 'top' as const, labels: { font: { size: 13 } } } },
          scales: {
            x: { ticks: { font: { size: 10 } } },
            y: { ticks: { font: { size: 10 } }, title: { display: true, text: yLabel, font: { size: 11 } } }
          }
        });
  
        const glucoseContexts: Array<{ key: GlucoseRecord['context']; label: string; color: string }> = [
          { key: 'fasting',   label: 'Fasting Glucose',   color: 'rgb(115, 93, 200)' },
          { key: 'pre-meal',  label: 'Pre-Meal Glucose',  color: 'rgb(60, 160, 100)'  },
          { key: 'post-meal', label: 'Post-Meal Glucose', color: 'rgb(220, 120, 50)'  },
        ];
  
        for (const ctx of glucoseContexts) {
          // Filter to ONLY this context's records so every point connects with no nulls/gaps
          const ctxRecords = glucoseChronological.filter(g => g.context === ctx.key);
          if (ctxRecords.length === 0) continue;
          const ctxLabels = ctxRecords.map(g =>
            new Date(g.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          );
          const ctxData = ctxRecords.map(g => g.value);
          const ctxPng = await renderChartToPng({
            type: 'line',
            data: {
              labels: ctxLabels,
              datasets: [{
                label: `${ctx.label} (mg/dL)`,
                data: ctxData,
                borderColor: ctx.color,
                backgroundColor: ctx.color.replace('rgb(', 'rgba(').replace(')', ', 0.07)'),
                fill: true,
                tension: 0.3,
                pointRadius: 3,
                borderWidth: 2,
              }]
            },
            options: glucoseChartOpts('mg/dL')
          });
          if (ctxPng) {
            ensurePageSpace(68);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
            doc.text(`${ctx.label} Trend`, 14, y); y += 4;
            doc.addImage(ctxPng, 'PNG', 14, y, 182, 60);
            y += 64;
          }
        }
      }
  
      ensurePageSpace(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(50, 50, 50);
      doc.text(`2. BLOOD GLUCOSE (${periodLabel})`, 14, y);
      y += 10;
  
      if (glucoseFiltered.length === 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        doc.text("No glucose readings recorded in the selected period.", 16, y);
        y += 10;
      } else {
        glucoseGroups.forEach(({ key, label }, groupIndex) => {
          const groupLogs = glucoseFiltered.filter(g => g.context === key);
  
          if (groupIndex > 0) y += 4;
          ensurePageSpace(18);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(80, 60, 90);
          doc.text(`${label} (${groupLogs.length} reading${groupLogs.length === 1 ? '' : 's'})`, 16, y);
          y += 7;
  
          if (groupLogs.length === 0) {
            doc.setFont("helvetica", "italic");
            doc.setFontSize(8);
            doc.setTextColor(120, 120, 120);
            doc.text(`No ${label.toLowerCase()} readings in the selected period.`, 16, y);
            y += 8;
            return;
          }
  
          drawGlucoseGroupHeader();
          groupLogs.forEach(g => {
            if (y + 7 > 280) drawGlucoseGroupContinuation(label);
            doc.setFontSize(8);
            const noteLines = doc.splitTextToSize(g.notes || '', 30).slice(0, 2);
            doc.text(fmtDT(g.timestamp), 16, y);
            doc.text(g.value ? `${g.value} mg/dL` : 'N/A', 70, y);
            doc.text(evaluateGlucose(g.value, g.context).status, 110, y);
            doc.text(noteLines, 155, y);
            y += 7;
          });
        });
      }
  
      y += 8;
      }
  
      // ─── Section 3: 30-day weight ────────────────────────────────────────────
  
      if (pdfIncludes.weight) {
        const weightCols = [
        { name: "Date & Time", x: 16 }, { name: "Weight (kg)", x: 80 }, { name: "Notes", x: 130 }
      ];
  
      const latestWeightPeriod = weightsFiltered[0]?.value;
      const oldestWeightPeriod = weightsFiltered.length > 0 ? weightsFiltered[weightsFiltered.length - 1].value : null;
      const weightChangePeriod = latestWeightPeriod != null && oldestWeightPeriod != null && weightsFiltered.length > 1
        ? `${(latestWeightPeriod - oldestWeightPeriod).toFixed(1)} kg`
        : 'N/A';
  
      drawSummaryBox(`WEIGHT SUMMARY — ${periodLabel} (${weightsFiltered.length} readings)`, [
        `Latest Weight:   ${latestWeightPeriod != null ? `${latestWeightPeriod} kg` : 'N/A'}`,
        `Period Change:   ${weightChangePeriod}`,
      ]);
  
      // ── Weight chart ─────────────────────────────────────────────────────────
      if (weightsFiltered.length > 1) {
        const weightChronological = [...weightsFiltered].reverse();
        const weightLabels = weightChronological.map(w =>
          new Date(w.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        );
        const weightChartPng = await renderChartToPng({
          type: 'line',
          data: {
            labels: weightLabels,
            datasets: [
              { label: 'Weight (kg)', data: weightChronological.map(w => w.value), borderColor: 'rgb(88, 160, 110)', backgroundColor: 'rgba(88, 160, 110, 0.08)', fill: true, tension: 0.3, pointRadius: 3, borderWidth: 2 },
            ]
          },
          options: {
            animation: false,
            responsive: false,
            plugins: { legend: { position: 'top', labels: { font: { size: 14 } } } },
            scales: { x: { ticks: { font: { size: 11 } } }, y: { ticks: { font: { size: 11 } }, title: { display: true, text: 'kg', font: { size: 12 } } } }
          }
        });
        if (weightChartPng) {
          ensurePageSpace(68);
          doc.addImage(weightChartPng, 'PNG', 14, y, 182, 64);
          y += 68;
        }
      }
  
      drawHeader(`3. WEIGHT TRACKER (${periodLabel})`, [88, 125, 105], weightCols);
  
      if (weightsFiltered.length === 0) {
        doc.text(`No weight readings recorded in the selected period.`, 16, y); y += 10;
      } else {
        weightsFiltered.forEach(w => {
          if (y + 7 > 280) drawContinuationHeader("3. WEIGHT TRACKER (Cont.)", [34, 139, 34], weightCols);
          doc.setFontSize(8);
          const noteLines = doc.splitTextToSize(w.notes || '', 40).slice(0, 2);
          doc.text(fmtDT(w.timestamp), 16, y);
          doc.text(w.value ? `${w.value} kg` : 'N/A', 80, y);
          doc.text(noteLines, 130, y);
          y += 7;
        });
      }
  
      y += 8;
      }
  
      // ─── Section 4: Latest medical reports by type ───────────────────────────
  
      if (pdfIncludes.reports) {
        const drawLabReportsSectionHeader = () => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(50, 50, 50);
        doc.text("4. LATEST MEDICAL LAB REPORTS (BY TYPE)", 14, y);
  
        y += 8;
      };
  
      const drawReportRecord = (r: ReportRecord) => {
        const reportType = getReportTypeFromRecord(r);
  
        ensurePageSpace(30);
  
        doc.setDrawColor(168, 115, 75);
        doc.setLineWidth(0.3);
        doc.setFillColor(252, 248, 244);
        doc.roundedRect(14, y, 182, 8, 1, 1, "FD");
  
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(95, 70, 45);
  
        doc.text(
          `${reportType}  —  ${fmtDT(r.timestamp)}`,
          16,
          y + 5.5
        );
  
        y += 12;
  
        const params = parseAllReportParameters(r.data || "");
        const paramKeys = Object.keys(params);
  
        // Find the previous report of the same type in user's report history
        const typeReports = reports
          .filter(
            report => getReportTypeFromRecord(report) === reportType
          )
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() -
              new Date(a.timestamp).getTime()
          );
  
        const currentReportIdx = typeReports.findIndex(
          report => report.id === r.id
        );
  
        const prevReport =
          currentReportIdx !== -1 &&
          currentReportIdx + 1 < typeReports.length
            ? typeReports[currentReportIdx + 1]
            : null;
  
        const prevParams = prevReport
          ? parseAllReportParameters(prevReport.data || "")
          : {};
  
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(50, 50, 50);
        doc.text("Lab Results", 16, y);
  
        y += 5;
  
        if (paramKeys.length > 0) {
          const headerHeight = 7;
  
          // ─── Column positions ───────────────────────────────────────────────
          // Order:
          // Parameter | Value | Previous Value | Normal Range
  
          const parameterX = 18;
          const valueX = 78;
          const previousValueX = 112;
          const normalRangeX = 150;
  
          // ─── Column widths ──────────────────────────────────────────────────
  
          const parameterWidth = 55;
          const valueWidth = 30;
          const previousValueWidth = 35;
          const normalRangeWidth = 42;
  
          // ─── Table header ───────────────────────────────────────────────────
  
          doc.setFillColor(168, 115, 75);
          doc.rect(16, y, 176, headerHeight, "F");
  
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(255, 255, 255);
  
          doc.text(
            "Parameter",
            parameterX,
            y + headerHeight / 2 + 1
          );
  
          doc.text(
            "Value",
            valueX,
            y + headerHeight / 2 + 1
          );
  
          doc.text(
            "Previous Value",
            previousValueX,
            y + headerHeight / 2 + 1
          );
  
          doc.text(
            "Normal Range",
            normalRangeX,
            y + headerHeight / 2 + 1
          );
  
          y += headerHeight;
  
          // ─── Table rows ─────────────────────────────────────────────────────
  
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(60, 60, 60);
  
          paramKeys.forEach((key, paramIndex) => {
            // Parameter
            const keyLines = doc.splitTextToSize(
              key,
              parameterWidth
            );
  
            // Current value
            const valueLines = doc.splitTextToSize(
              String(params[key]),
              valueWidth
            );
  
            // Previous value
            const prevVal =
              prevParams[key] !== undefined
                ? String(prevParams[key])
                : "--";
  
            const prevLines = doc.splitTextToSize(
              prevVal,
              previousValueWidth
            );
  
            // Normal range
            const range = getNormalRange(key);
  
            const normalRange = Array.isArray(range)
              ? `${range[0]}–${range[1]}`
              : range ?? "--";
  
            const normalRangeLines = doc.splitTextToSize(
              String(normalRange),
              normalRangeWidth
            );
  
            // Determine row height based on the tallest cell
            const lineCount = Math.max(
              keyLines.length,
              valueLines.length,
              prevLines.length,
              normalRangeLines.length
            );
  
            const rowHeight = Math.max(
              7,
              lineCount * 4.5 + 2
            );
  
            ensurePageSpace(rowHeight);
  
            // Alternating row background
            if (paramIndex % 2 === 0) {
              doc.setFillColor(248, 248, 248);
              doc.rect(
                16,
                y,
                176,
                rowHeight,
                "F"
              );
            }
  
            // Parameter
            keyLines.forEach(
              (line: string, i: number) => {
                doc.text(
                  line,
                  parameterX,
                  y + 5 + i * 4.5
                );
              }
            );
  
            // Current value
            valueLines.forEach(
              (line: string, i: number) => {
                doc.text(
                  line,
                  valueX,
                  y + 5 + i * 4.5
                );
              }
            );
  
            // Previous value
            prevLines.forEach(
              (line: string, i: number) => {
                doc.text(
                  line,
                  previousValueX,
                  y + 5 + i * 4.5
                );
              }
            );
  
            // Normal range
            normalRangeLines.forEach(
              (line: string, i: number) => {
                doc.text(
                  line,
                  normalRangeX,
                  y + 5 + i * 4.5
                );
              }
            );
  
            y += rowHeight;
          });
        } else if (r.data?.trim()) {
          // ─── Raw report data ────────────────────────────────────────────────
  
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(60, 60, 60);
  
          const resultLines = doc.splitTextToSize(
            r.data.trim(),
            176
          );
  
          resultLines.forEach((line: string) => {
            ensurePageSpace(5);
  
            doc.text(line, 16, y);
  
            y += 4.5;
          });
        } else {
          // ─── No results ─────────────────────────────────────────────────────
  
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(120, 120, 120);
  
          doc.text(
            "No lab results recorded.",
            16,
            y
          );
  
          y += 5;
        }
  
        // ─── Notes / Observations ─────────────────────────────────────────────
  
        if (r.notes?.trim()) {
          y += 2;
  
          ensurePageSpace(10);
  
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(50, 50, 50);
  
          doc.text(
            "Notes / Observations",
            16,
            y
          );
  
          y += 5;
  
          doc.setFont("helvetica", "normal");
          doc.setTextColor(60, 60, 60);
  
          const noteLines = doc.splitTextToSize(
            r.notes.trim(),
            176
          );
  
          noteLines.forEach((line: string) => {
            ensurePageSpace(5);
  
            doc.text(line, 16, y);
  
            y += 4.5;
          });
        }
  
        y += 6;
      };
  
      ensurePageSpace(30);
  
      drawLabReportsSectionHeader();
  
      if (latestReportsByType.length === 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
  
        doc.text(
          "No medical reports saved.",
          16,
          y
        );
  
        y += 10;
      } else {
        latestReportsByType.forEach((r, index) => {
          if (index > 0 && y + 30 > 280) {
            doc.addPage();
            y = 20;
  
            drawLabReportsSectionHeader();
          }
  
          drawReportRecord(r);
        });
      }
      }
  
      // ─── Page numbers ─────────────────────────────────────────────────────────
  
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(
          `VitalDiary • Page ${i} of ${pageCount}`,
          145,
          290
          );
      }
  
      const fromSlug = exportRange.from.toISOString().slice(0, 10);
      const toSlug = exportRange.to.toISOString().slice(0, 10);
      doc.save(`vitaldiary_report_${fromSlug}_to_${toSlug}.pdf`);
      showToast('PDF Report downloaded successfully.', 'success');
    };

  return (
    <section id="caregiver-patient-view" className="view-section active">
      {/* Patient Overview */}
      <div className="panel panel-glass mb-4">
        <div className="panel-header">
          <div className="panel-title-group">
            <User className="color-primary" size={22} />
            <h3>Patient Overview</h3>
          </div>
        </div>
        <div className="p-4">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div>
              <div className="text-secondary text-sm mb-1">Name</div>
              <div className="text-lg font-semibold">{patientInfo?.name || 'Unknown'}</div>
            </div>
            <div>
              <div className="text-secondary text-sm mb-1">Email</div>
              <div className="text-lg">{patientInfo?.email || 'Unknown'}</div>
            </div>
            <div>
              <div className="text-secondary text-sm mb-1">Age</div>
              <div className="text-lg">{patientInfo?.age || 'Unknown'}</div>
            </div>
            <div>
              <div className="text-secondary text-sm mb-1">Gender</div>
              <div className="text-lg capitalize">{patientInfo?.gender || 'Unknown'}</div>
            </div>
            <div>
              <div className="text-secondary text-sm mb-1">Total Records</div>
              <div className="text-lg font-semibold">{allLogs.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Caregiver quick-action: Add/Update a reading on behalf of the patient */}
      <div className="d-flex justify-between align-center mb-4">
        <div className="text-secondary text-sm">Latest readings for this patient</div>
      </div>

      {/* Health Alerts */}
      {healthAlerts.length > 0 && (
        <div className="health-alerts-container mb-4" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {healthAlerts.map((alert, idx) => (
            <div key={idx} className={`alert-card alert-${alert.type}`} style={{
              padding: '1rem', 
              borderRadius: '8px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px',
              backgroundColor: alert.type === 'danger' ? 'hsla(355, 78%, 56%, 0.1)' : alert.type === 'warning' ? 'hsla(30, 90%, 50%, 0.1)' : 'hsla(200, 85%, 55%, 0.1)',
              border: `1px solid ${alert.type === 'danger' ? 'hsl(355, 78%, 56%)' : alert.type === 'warning' ? 'hsl(30, 90%, 50%)' : 'hsl(200, 85%, 55%)'}`,
              color: 'var(--text-primary)'
            }}>
              <AlertCircle size={24} style={{ color: alert.type === 'danger' ? 'hsl(355, 78%, 56%)' : alert.type === 'warning' ? 'hsl(30, 90%, 50%)' : 'hsl(200, 85%, 55%)' }} />
              <div>
                <strong>Health Alert: </strong> {alert.message}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Current Vitals Status */}
      <div className="stats-grid mb-4">
        <div className="metric-card bp-card" style={{ cursor: 'pointer' }} onClick={() => setStatsModalType('bp')} title="Click to view Blood Pressure statistics">
          <div className="card-header">
            <div className="icon-wrapper bg-red">
              <Activity size={20} />
            </div>
            <span className="metric-title">Blood Pressure</span>
          </div>
          <div className="card-value-container">
            <div className="card-value">
              {latestVital ? `${latestVital.systolic}/${latestVital.diastolic}` : '--/--'}
            </div>
            <span className="card-unit">mmHg</span>
          </div>
          <div className="card-footer">
            <span className={`status-indicator ${bpEval?.className || 'status-neutral'}`}>
              {bpEval?.status || 'No Data'}
            </span>
            <span className="time-stamp">{latestVital ? fmtDT(latestVital.timestamp) : '--'}</span>
          </div>
        </div>

        <div className="metric-card hr-card" style={{ cursor: 'pointer' }} onClick={() => setStatsModalType('hr')} title="Click to view Heart Rate statistics">
          <div className="card-header">
            <div className="icon-wrapper bg-rose">
              <Heart size={20} />
            </div>
            <span className="metric-title">Heart Rate</span>
          </div>
          <div className="card-value-container">
            <div className="card-value">{latestVital ? latestVital.hr : '--'}</div>
            <span className="card-unit">bpm</span>
          </div>
          <div className="card-footer">
            <span className={`status-indicator ${hrEval?.className || 'status-neutral'}`}>
              {hrEval?.status || 'No Data'}
            </span>
            <span className="time-stamp">{latestVital ? fmtDT(latestVital.timestamp) : '--'}</span>
          </div>
        </div>

        <div className="metric-card spo2-card" style={{ cursor: 'pointer' }} onClick={() => setStatsModalType('spo2')} title="Click to view SpO₂ statistics">
          <div className="card-header">
            <div className="icon-wrapper bg-blue">
              <Droplet size={20} />
            </div>
            <span className="metric-title">SpO₂ Oxygen</span>
          </div>
          <div className="card-value-container">
            <div className="card-value">
              {latestVital?.spo2 !== null && latestVital?.spo2 !== undefined ? latestVital.spo2 : '--'}
            </div>
            <span className="card-unit">%</span>
          </div>
          <div className="card-footer">
            <span className={`status-indicator ${spo2Eval?.className || 'status-neutral'}`}>
              {spo2Eval?.status || 'No Data'}
            </span>
            <span className="time-stamp">{latestVital ? fmtDT(latestVital.timestamp) : '--'}</span>
          </div>
        </div>

        <div className="metric-card temp-card" style={{ cursor: 'pointer' }} onClick={() => setStatsModalType('temp' as any)} title="Click to view Body Temperature statistics">
          <div className="card-header">
            <div className="icon-wrapper bg-orange" style={{ backgroundColor: 'hsla(30, 90%, 50%, 0.15)', color: 'hsl(30, 90%, 50%)' }}>
              <Thermometer size={20} />
            </div>
            <span className="metric-title">Body Temp</span>
          </div>
          <div className="card-value-container">
            <div className="card-value">
              {latestVital?.temperature !== null && latestVital?.temperature !== undefined ? latestVital.temperature : '--'}
            </div>
            <span className="card-unit">°{latestVital?.temperature_unit || 'C'}</span>
          </div>
          <div className="card-footer">
            <span className={`status-indicator ${tempEval?.className || 'status-neutral'}`}>
              {tempEval?.status || 'No Data'}
            </span>
            <span className="time-stamp">{latestVital ? fmtDT(latestVital.timestamp) : '--'}</span>
          </div>
        </div>

        <div className="metric-card glucose-card" style={{ cursor: 'pointer' }} onClick={() => setStatsModalType('glucose')} title="Click to view Blood Glucose statistics">
          <div className="card-header">
            <div className="icon-wrapper bg-purple">
              <Thermometer size={20} />
            </div>
            <span className="metric-title">Blood Glucose</span>
          </div>
          <div className="card-value-container">
            <div className="card-value">{latestGlucose ? latestGlucose.value : '--'}</div>
            <span className="card-unit">mg/dL</span>
          </div>
          <div className="card-footer">
            <span className={`status-indicator ${glucoseEval?.className || 'status-neutral'}`}>
              {latestGlucose ? `${latestGlucose.context} (${glucoseEval?.status})` : 'No Data'}
            </span>
            <span className="time-stamp">{latestGlucose ? fmtDT(latestGlucose.timestamp) : '--'}</span>
          </div>
        </div>

        <div className="metric-card weight-card" style={{ cursor: 'pointer' }} onClick={() => setStatsModalType('weight')} title="Click to view Body Weight statistics">
          <div className="card-header">
            <div className="icon-wrapper bg-green" style={{ backgroundColor: 'hsla(150, 80%, 40%, 0.15)', color: 'hsl(150, 80%, 40%)' }}>
              <Weight size={20} />
            </div>
            <span className="metric-title">Body Weight</span>
          </div>
          <div className="card-value-container">
            <div className="card-value">{latestWeight ? latestWeight.value : '--'}</div>
            <span className="card-unit">kg</span>
          </div>
          <div className="card-footer">
            <span className="status-indicator status-info">Active Track</span>
            <span className="time-stamp">{latestWeight ? fmtDT(latestWeight.timestamp) : '--'}</span>
          </div>
        </div>
      </div>

      {/* Export & backup tools */}
      <div className="panel panel-glass mb-4" style={{paddingBottom: 8}}>
        <div className="panel-header border-bottom">
          <div className="panel-title-group">
            <FileText className="color-primary" size={22} />
            <h3>PDF Exports</h3>
          </div>
        </div>
        
        <div className="panel-body py-3">
          <p className="text-secondary text-sm mb-4">
            Export your records to tabular formats for doctor visits or backup a secure copy locally.
          </p>

          {/* ── Export Period Picker ────────────────────────────────────── */}
          <div className="export-period-picker mb-4">
            <div className="d-flex align-center gap-2 mb-3" style={{ color: 'var(--color-primary)' }}>
              <CalendarRange size={17} />
              <span className="text-sm font-semibold">Export Period</span>
            </div>

            <div className="export-preset-tabs">
              {(['7days', '30days', '90days', '1year', 'all', 'custom'] as ExportPreset[]).map(preset => {
                const labels: Record<ExportPreset, string> = {
                  '7days': '7 Days', '30days': '30 Days', '90days': '90 Days',
                  '1year': '1 Year', 'all': 'All Time', 'custom': 'Custom'
                };
                return (
                  <button
                    key={preset}
                    className={`export-preset-btn${exportPreset === preset ? ' active' : ''}`}
                    onClick={() => setExportPreset(preset)}
                    type="button"
                  >
                    {labels[preset]}
                  </button>
                );
              })}
            </div>

            {exportPreset === 'custom' && (
              <div className="d-flex gap-3 mt-3 export-custom-dates" style={{ flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1, minWidth: '140px' }}>
                  <label className="text-xs text-secondary mb-1 block">From</label>
                  <input
                    type="date"
                    className="form-control"
                    value={customFrom}
                    max={customTo}
                    onChange={e => setCustomFrom(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: '140px' }}>
                  <label className="text-xs text-secondary mb-1 block">To</label>
                  <input
                    type="date"
                    className="form-control"
                    value={customTo}
                    min={customFrom}
                    max={today}
                    onChange={e => setCustomTo(e.target.value)}
                  />
                </div>
              </div>
            )}

            {exportPreset !== 'custom' && (
              <div className="export-range-badge mt-2">
                <span className="text-xs text-muted">📅 {exportRangeLabel}</span>
              </div>
            )}
          </div>

          <div className="d-flex flex-column gap-3">
            <button className="btn btn-outline justify-between" onClick={() => void handleExportPDF()}>
              <span className="d-flex align-center gap-2"><FileText size={18} className="color-danger" /> Export Medical PDF Report</span>
              <span className="text-xs text-muted">Period summary + latest labs by type</span>
            </button>
          </div>
        </div>
      </div>

      {/* Analytics Section */}
      <div className="panel panel-glass mb-4" style={{ paddingBottom: '0' }}>
        <div className="panel-header" style={{ marginBottom: 0}}>
          <div className="panel-title-group">
            <TrendingUp className="color-primary" size={22} />
            <h3>Health Trends</h3>
          </div>
          <div className="d-flex align-center gap-2">
            <div className="filter-group" style={{ minWidth: '150px' }}>
              <select
                className="form-control"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as any)}
              >
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="1year">Last 1 Year</option>
                <option value="all">All Time</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <div className="d-flex flex-column gap-6 mb-4">
        <div className="panel panel-glass trends-panel" style={{ marginBottom: '1.5rem' }}>
          <div className="panel-header">
            <div className="panel-title-group">
              <TrendingUp className="color-primary" size={22} />
              <h3>Blood Pressure Trends</h3>
            </div>
          </div>
          <div className="chart-container" style={{ minHeight: '300px' }}>
            {chartVitals.length > 0 ? (
              <Line data={bpChartData} options={bpChartOptions} />
            ) : (
              <div className="d-flex align-center justify-center h-100 text-muted">
                No vitals readings logged yet.
              </div>
            )}
          </div>
        </div>

        {/* Heart Rate Trends */}
        <div className="panel panel-glass trends-panel" style={{ marginBottom: '1.5rem' }}>
          <div className="panel-header">
            <div className="panel-title-group">
              <Heart className="color-rose" size={22} />
              <h3>Heart Rate Trends</h3>
            </div>
          </div>

          <div className="chart-container" style={{ minHeight: '300px' }}>
            {chartVitals.length > 0 ? (
              <Line data={hrChartData} options={chartOptions} />
            ) : (
              <div className="d-flex align-center justify-center h-100 text-muted">
                No heart rate readings logged yet.
              </div>
            )}
          </div>
        </div>

        {/* SpO₂ Trends */}
        <div className="panel panel-glass trends-panel" style={{ marginBottom: '1.5rem' }}>
          <div className="panel-header">
            <div className="panel-title-group">
              <Droplet className="color-blue" size={22} />
              <h3>SpO₂ Trends</h3>
            </div>
          </div>

          <div className="chart-container" style={{ minHeight: '300px' }}>
            {chartVitals.some(l => l.spo2 !== null && l.spo2 !== undefined) ? (
              <Line data={spo2ChartData} options={chartOptions} />
            ) : (
              <div className="d-flex align-center justify-center h-100 text-muted">
                No SpO₂ readings logged yet.
              </div>
            )}
          </div>
        </div>

        <div className="panel panel-glass trends-panel" style={{ marginBottom: '1.5rem' }}>
          <div className="panel-header">
            <div className="panel-title-group">
              <TrendingUp className="color-purple" size={22} />
              <h3>Glucose Trends</h3>
          </div>
          </div>
          <div className="glucose-charts-stack">
            {(['fasting', 'preMeal', 'postMeal'] as const).map((ctx, i) => {
              const contextMap = { fasting: 'fasting', preMeal: 'pre-meal', postMeal: 'post-meal' } as const;
              const contextLogs = filteredGlucose.filter(g => g.context === contextMap[ctx]);
              const labels = ['🟢 Fasting', '🟠 Pre-Meal', '🟣 Post-Meal'];
              const colors = ['hsl(150, 80%, 40%)', 'hsl(35, 90%, 55%)', 'hsl(280, 80%, 60%)'];
              const emptyMsg = ['No fasting glucose readings in this range.', 'No pre-meal glucose readings in this range.', 'No post-meal glucose readings in this range.'];
              
              const glucoseNormalRanges = {
                fasting: [70, 100],
                preMeal: [70, 100],
                postMeal: [70, 140],
              } as const;

              const [normalMin, normalMax] = glucoseNormalRanges[ctx];

              const contextChartData = {
                labels: contextLogs.map(l => formatDateLabel(l.timestamp)),
                datasets: [
                  // Normal-range upper boundary
                  {
                    label: 'Normal Range',
                    data: Array(contextLogs.length).fill(normalMax),
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(72, 199, 116, 0.13)',
                    borderWidth: 0,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    fill: '+1',
                    tension: 0,
                    order: 10,
                    isNormalBand: true,
                  },

                  // Normal-range lower boundary
                  {
                    label: `Normal: ${normalMin}–${normalMax}`,
                    data: Array(contextLogs.length).fill(normalMin),
                    borderColor: 'transparent',
                    borderWidth: 0,
                    borderDash: [],
                    backgroundColor: 'transparent',
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    fill: false,
                    tension: 0,
                    order: 11,
                    isNormalBand: true,
                  },

                  // Actual glucose values
                  {
                    label: labels[i].replace('🟢 ', '').replace('🟠 ', '').replace('🟣 ', ''),
                    data: contextLogs.map(l => l.value),
                    borderColor: colors[i],
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: false,
                    pointBackgroundColor: colors[i],
                    pointHoverRadius: 7,
                    order: 1,
                  },
                ],
              };

              return (
                <div key={ctx} className="glucose-chart-section" style={{ marginBottom: '1.5rem' }}>
                  <h4 className="glucose-chart-label" style={{ color: colors[i], marginBottom: '0.5rem' }}>{labels[i]}</h4>
                  <div className="chart-container" style={{ minHeight: '200px' }}>
                    {contextLogs.length > 0 ? (
                      <Line data={contextChartData} options={chartOptions} />
                    ) : (
                      <div className="d-flex align-center justify-center h-100 text-muted text-sm">{emptyMsg[i]}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel panel-glass trends-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <TrendingUp className="color-green" size={22} />
              <h3>Weight Trends</h3>
            </div>
          </div>
          <div className="chart-container" style={{ minHeight: '300px' }}>
            {chartWeights.length > 0 ? (
              <Line data={weightChartData} options={chartOptions} />
            ) : (
              <div className="d-flex align-center justify-center h-100 text-muted">
                No weight readings logged yet.
              </div>
            )}
          </div>
        </div>
      </div>



      {/* Medical Reports */}
      <div className="panel panel-glass">
        <div className="panel-header border-bottom">
          <div className="panel-title-group">
            <FlaskConical className="color-primary" size={22} />
            <h3>Medical Reports</h3>
          </div>
          <div className="filter-group" style={{ minWidth: '240px' }}>
            <select
              className="form-control"
              value={selectedReportType}
              onChange={(e) => setSelectedReportType(e.target.value as ReportType)}
            >
              {REPORT_TYPE_OPTIONS.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>

        {activeReportLogs.length === 0 ? (
          <div className="d-flex align-center justify-center h-100 text-muted py-8">
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
            onClick={(e) => { if (e.target === e.currentTarget) setTrendModalParam(null); }}
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
                  onClick={() => setTrendModalParam(null)}
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

      {/* ── Statistics Modal ─────────────────────────────────────────── */}
      {statsModalType && (() => {
        // Calculate stats based on the selected type and timeframe
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

        let normalCount = 0;
        let warningCount = 0;
        let criticalCount = 0;

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const getRecent = <T extends { timestamp: string }>(arr: T[]) => arr.filter(item => new Date(item.timestamp) >= sevenDaysAgo);

        if (statsModalType === 'bp') {
          const bpLogs = filteredVitals;
          const recentBpLogs = getRecent(bpLogs);
          if (bpLogs.length > 0) {
            results.avg = recentBpLogs.length > 0 ? `${Math.round(recentBpLogs.reduce((a, b) => a + b.systolic, 0) / recentBpLogs.length)}/${Math.round(recentBpLogs.reduce((a, b) => a + b.diastolic, 0) / recentBpLogs.length)} mmHg` : '--/-- mmHg';
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
        } else if (statsModalType === 'hr') {
          const hrLogs = filteredVitals;
          const recentHrLogs = getRecent(hrLogs);
          if (hrLogs.length > 0) {
            results.avg = recentHrLogs.length > 0 ? `${Math.round(recentHrLogs.reduce((a, b) => a + b.hr, 0) / recentHrLogs.length)} bpm` : '-- bpm';
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
        } else if (statsModalType === 'spo2') {
          const spo2Logs = filteredVitals.filter(l => l.spo2 !== null);
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
        } else if (statsModalType === 'glucose') {
          const glLogs = filteredGlucose;
          const recentGlLogs = getRecent(glLogs);
          if (glLogs.length > 0) {
            const now = new Date();
            const past3MonthsGlucose = glLogs.filter(log => {
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
            const sorted = [...glLogs].sort((a, b) => b.value - a.value);
            results.highest = `${sorted[0].value} mg/dL`;
            results.lowest = `${sorted[sorted.length - 1].value} mg/dL`;
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
          }
        } else if (statsModalType === 'weight') {
          const wtLogs = filteredWeights;
          const recentWtLogs = getRecent(wtLogs);
          if (wtLogs.length > 0) {
            results.avg = recentWtLogs.length > 0 ? `${Math.round(recentWtLogs.reduce((a, b) => a + b.value, 0) / recentWtLogs.length)} kg` : '-- kg';
            const sorted = [...wtLogs].sort((a, b) => b.value - a.value);
            results.highest = `${sorted[0].value} kg`;
            results.lowest = `${sorted[sorted.length - 1].value} kg`;
          }
        }

        results.normal = normalCount;
        results.warning = warningCount;
        results.critical = criticalCount;

        const typeLabels: Record<typeof statsModalType, string> = {
          bp: 'Blood Pressure',
          hr: 'Heart Rate',
          spo2: 'SpO₂ Oxygen',
          glucose: 'Blood Glucose',
          weight: 'Body Weight',
        };

        return (
          <div
            className="modal-overlay active"
            onClick={(e) => { if (e.target === e.currentTarget) setStatsModalType(null); }}
            style={{ zIndex: 1200 }}
          >
            <div
              className="modal-card"
              style={{ maxWidth: '680px', width: '95%', maxHeight: '85vh', overflowY: 'auto' }}
            >
              <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Calculator size={20} style={{ color: 'hsl(355, 78%, 56%)' }} />
                  <div>
                    <h3 style={{ margin: 0 }}>{typeLabels[statsModalType]} Statistics</h3>
                    <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.6 }}>Reading Statistics — {timeframe === '7days' ? 'Last 7 Days' : timeframe === '30days' ? 'Last 30 Days' : timeframe === '1year' ? 'Last 1 Year' : 'All Time'}</p>
                  </div>
                </div>
                <button
                  className="modal-close"
                  onClick={() => setStatsModalType(null)}
                  aria-label="Close statistics"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body">
                <div className="stats-details">
                  <div className="stats-subgroup">
                    <h4 className="stats-subgroup-title">Averages</h4>
                    <div className="summary-list">
                      <div className="summary-item">
                        <div className="summary-label">
                          {statsModalType === 'glucose' ? 'Overall Average' : 'Average Value'}
                        </div>
                        <div className="summary-value">{results.avg}</div>
                      </div>

                      {statsModalType === 'glucose' && (
                        <>
                          <div className="summary-item">
                            <div className="summary-label">Estimated HbA1c (90 Days)</div>
                            <div className="summary-value">{results.estimatedHbA1c}</div>
                          </div>
                          <div className="summary-item">
                            <div className="summary-label">Fasting Average</div>
                            <div className="summary-value">{results.glucoseFastingAvg}</div>
                          </div>
                          <div className="summary-item">
                            <div className="summary-label">Pre-Meal Average</div>
                            <div className="summary-value">{results.glucosePreAvg}</div>
                          </div>
                          <div className="summary-item">
                            <div className="summary-label">Post-Meal Average</div>
                            <div className="summary-value">{results.glucosePostAvg}</div>
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
                        <div className="summary-value color-danger">{results.highest}</div>
                      </div>
                      <div className="summary-item">
                        <div className="summary-label">Lowest Record</div>
                        <div className="summary-value color-success">{results.lowest}</div>
                      </div>
                    </div>
                  </div>

                  {statsModalType !== 'weight' && (
                    <div className="stats-subgroup mt-3">
                      <h4 className="stats-subgroup-title">Health Distribution</h4>
                      <div className="summary-list">
                        <div className="summary-item">
                          <div className="summary-label">Normal Readings</div>
                          <div className="summary-value color-success">{results.normal}</div>
                        </div>
                        <div className="summary-item">
                          <div className="summary-label">Elevated/Warning</div>
                          <div className="summary-value color-warning">{results.warning}</div>
                        </div>
                        <div className="summary-item">
                          <div className="summary-label">High / Critical</div>
                          <div className="summary-value color-danger">{results.critical}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
};