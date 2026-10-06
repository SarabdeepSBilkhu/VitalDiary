import React, { useState, useRef, useMemo } from 'react';
import { 
  Settings as SettingsIcon, LogOut, Download, FileText, 
  Upload, Database, AlertOctagon, CalendarRange
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Chart, registerables } from 'chart.js';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';
import { api, type WeightRecord, type ReportRecord, type ProfileRecord } from '../utils/api';
import { evaluateBP, evaluateGlucose } from '../utils/evaluators';
import { 
  parseAllReportParameters, 
  getLatestReportsByType, 
  getReportTypeFromRecord, 
  getNormalRange
} from '../utils/reportUtils';

Chart.register(...registerables);

/**
 * Renders a Chart.js configuration to an offscreen canvas and returns a PNG data URL.
 * This is used to embed charts into the PDF without needing the Analytics component to be mounted.
 */
function renderChartToPng(config: ConstructorParameters<typeof Chart>[1], width = 800, height = 280): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(''); return; }
    const chart = new Chart(ctx, config as any);
    // Chart.js renders synchronously in this context, but we give it a tick to settle
    setTimeout(() => {
      const dataUrl = canvas.toDataURL('image/png');
      chart.destroy();
      canvas.remove();
      resolve(dataUrl);
    }, 100);
  });
}

type ExportPreset = '7days' | '30days' | '90days' | '1year' | 'all' | 'custom';

const fmtDT = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const isWithinRange = (timestamp: string, from: Date, to: Date) => {
  const logDate = new Date(timestamp);
  return logDate >= from && logDate <= to;
};

const filterByRange = <T extends { timestamp: string }>(records: T[], from: Date, to: Date) =>
  records
    .filter(r => isWithinRange(r.timestamp, from, to))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

const toDateInputValue = (d: Date) => d.toISOString().slice(0, 10);

const PRESET_DAYS: Record<Exclude<ExportPreset, 'all' | 'custom'>, number> = {
  '7days': 7,
  '30days': 30,
  '90days': 90,
  '1year': 365,
};

const displayOrNA = (value: string | number | undefined | null) => {
  if (value === undefined || value === null || value === '') return 'N/A';
  return String(value);
};

interface SettingsProps {
  vitals: VitalsRecord[];
  glucose: GlucoseRecord[];
  weights: WeightRecord[];
  reports: ReportRecord[];
  allLogs: any[];
  userEmail: string;
  onLogout: () => void;
  onRefreshData: () => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'danger' | 'warning' | 'info') => void;
}

export const Settings: React.FC<SettingsProps> = ({
  vitals,
  glucose,
  weights,
  reports,
  userEmail,
  onLogout,
  onRefreshData,
  showToast
}) => {
  const [resetConfirm, setResetConfirm] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // ── Export period state ──────────────────────────────────────────────────────
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

    const avgSysPeriod = recentVitals.length ? Math.round(recentVitals.reduce((a, b) => a + b.systolic, 0) / recentVitals.length) : 0;
    const avgDiaPeriod = recentVitals.length ? Math.round(recentVitals.reduce((a, b) => a + b.diastolic, 0) / recentVitals.length) : 0;
    const avgHrPeriod = recentVitals.length ? Math.round(recentVitals.reduce((a, b) => a + b.hr, 0) / recentVitals.length) : 0;
    const spo2Readings = recentVitals.filter(v => v.spo2);
    const avgSpo2Period = spo2Readings.length
      ? Math.round(spo2Readings.reduce((a, b) => a + (b.spo2 || 0), 0) / spo2Readings.length)
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

  // 4. Download Backup (JSON)
  const handleBackupDownload = async () => {
    let fetchedMedications = [];
    let profile = null;
    try {
      const res = await fetch('/api/medications', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('vital_diary_token')}` }
      });
      if (res.ok) {
        fetchedMedications = await res.json();
      }
      profile = await api.getProfile();
    } catch (err) {
      console.warn("Failed to fetch data for backup", err);
    }

    const backupObj = {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      user: userEmail,
      vitals,
      glucose,
      weights,
      reports,
      medications: fetchedMedications,
      profile
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `vitaldiary_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('JSON Database backup downloaded.', 'success');
  };

  // 5. Trigger Restore upload dialog
  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const backup = JSON.parse(event.target?.result as string);
        
        if (!backup.vitals && !backup.glucose && !backup.weights && !backup.reports && !backup.medications) {
          showToast('Invalid backup file structure. Missing data arrays.', 'danger');
          return;
        }

        // Call backend bulk restore APIs
        showToast('Restoring database, please wait...', 'info');

        const vitalsRestoreList = Array.isArray(backup.vitals) ? backup.vitals : [];
        const glucoseRestoreList = Array.isArray(backup.glucose) ? backup.glucose : [];
        const weightsRestoreList = Array.isArray(backup.weights) ? backup.weights : [];
        const reportsRestoreList = Array.isArray(backup.reports) ? backup.reports : [];

        // Restore Vitals
        await fetch('/api/vitals/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('vital_diary_token')}`
          },
          body: JSON.stringify({ logs: vitalsRestoreList })
        });

        // Restore Glucose
        await fetch('/api/glucose/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('vital_diary_token')}`
          },
          body: JSON.stringify({ logs: glucoseRestoreList })
        });

        // Restore Weights
        await fetch('/api/weight/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('vital_diary_token')}`
          },
          body: JSON.stringify({ logs: weightsRestoreList })
        });

        // Restore Reports
        await fetch('/api/reports/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('vital_diary_token')}`
          },
          body: JSON.stringify({ logs: reportsRestoreList })
        });

        // Restore Medications
        const medicationsRestoreList = Array.isArray(backup.medications) ? backup.medications : [];
        await fetch('/api/medications/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('vital_diary_token')}`
          },
          body: JSON.stringify({ logs: medicationsRestoreList })
        });

        // Restore Profile
        if (backup.profile) {
          try {
            await api.saveProfile(backup.profile);
          } catch (err) {
            console.warn("Failed to restore profile:", err);
          }
        }

        showToast('Database restore complete!', 'success');
        await onRefreshData();
      } catch (err: any) {
        showToast(`Failed to restore backup: ${err.message || 'Invalid JSON format.'}`, 'danger');
      }
    };
    reader.readAsText(file);
    // Reset file input value
    e.target.value = '';
  };

  // 5.5 Import CSV
  const handleCSVImportClick = () => {
    csvInputRef.current?.click();
  };

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    showToast('Importing CSV, please wait...', 'info');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/vitals/import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('vital_diary_token')}`
        },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        await onRefreshData();
      } else {
        showToast(`Import failed: ${data.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Import error: ${err.message}`, 'danger');
    }
    e.target.value = '';
  };

  // 6. Delete Account
  const handleAccountDeletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetConfirm !== 'DELETE MY ACCOUNT') {
      showToast('Verification sentence mismatch.', 'warning');
      return;
    }

    if (!window.confirm("Are you absolutely sure? This will delete your account and all associated data permanently.")) {
      return;
    }

    setDeletingAccount(true);
    try {
      await api.deleteAccount();
      showToast('Account successfully deleted.', 'success');
      onLogout(); // This will clear token and redirect to login
    } catch (err: any) {
      showToast(err.message || 'Failed to delete account.', 'danger');
      setDeletingAccount(false);
    }
  };

  return (
    <section id="settings-view" className="view-section active">
      <div className="dashboard-grid">
        
        {/* Export & backup tools */}
        <div className="panel panel-glass">
          <div className="panel-header border-bottom">
            <div className="panel-title-group">
              <Database className="color-primary" size={22} />
              <h3>Data Management & Exports</h3>
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
            {/* ────────────────────────────────────────────────────────────── */}

            {/* ── Export Parameter Selection ──────────────────────────────────────── */}
            <div className="export-parameters mb-4">
              <div className="d-flex align-center gap-2 mb-3" style={{ color: 'var(--color-primary)' }}>
                <FileText size={17} />
                <span className="text-sm font-semibold">Include Sections</span>
              </div>
              <div className="d-flex flex-wrap gap-3">
                <label className="d-flex align-center gap-2 text-sm text-secondary" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={pdfIncludes.vitals} onChange={(e) => setPdfIncludes({ ...pdfIncludes, vitals: e.target.checked })} />
                  Vitals (BP, HR, SpO2)
                </label>
                <label className="d-flex align-center gap-2 text-sm text-secondary" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={pdfIncludes.glucose} onChange={(e) => setPdfIncludes({ ...pdfIncludes, glucose: e.target.checked })} />
                  Blood Glucose
                </label>
                <label className="d-flex align-center gap-2 text-sm text-secondary" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={pdfIncludes.weight} onChange={(e) => setPdfIncludes({ ...pdfIncludes, weight: e.target.checked })} />
                  Body Weight
                </label>
                <label className="d-flex align-center gap-2 text-sm text-secondary" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={pdfIncludes.reports} onChange={(e) => setPdfIncludes({ ...pdfIncludes, reports: e.target.checked })} />
                  Medical Reports
                </label>
              </div>
            </div>
            {/* ────────────────────────────────────────────────────────────── */}

            <div className="d-flex flex-column gap-3">
              <button className="btn btn-outline justify-between" onClick={() => void handleExportPDF()}>
                <span className="d-flex align-center gap-2"><FileText size={18} className="color-danger" /> Export Medical PDF Report</span>
                <span className="text-xs text-muted">Period summary + latest labs by type</span>
              </button>

              <div className="border-top my-2 pt-3">
                <h4 className="text-secondary text-sm font-semibold mb-3">Backup & Restore</h4>
                <div className="d-flex gap-3">
                  <button className="btn btn-outline w-50" onClick={handleBackupDownload}>
                    <Download size={16} /> Backup Database (JSON)
                  </button>
                  <button className="btn btn-outline w-50" onClick={handleRestoreClick}>
                    <Upload size={16} /> Restore Backup (JSON)
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    accept=".json"
                    onChange={handleFileRestore} 
                  />
                </div>
              </div>
              <div className="border-top my-2 pt-3">
                <h4 className="text-secondary text-sm font-semibold mb-3">Wearable Import</h4>
                <button className="btn btn-outline w-100 justify-center" onClick={handleCSVImportClick}>
                  <Upload size={16} style={{ marginRight: '8px' }} /> Import Vitals (CSV)
                </button>
                <input 
                  type="file" 
                  ref={csvInputRef} 
                  style={{ display: 'none' }} 
                  accept=".csv"
                  onChange={handleCSVImport} 
                />
              </div>
            </div>
          </div>
        </div>

        {/* User Account Details & Hard Reset */}
        <div className="panel panel-glass">
          <div className="panel-header border-bottom">
            <div className="panel-title-group">
              <SettingsIcon className="color-rose" size={22} />
              <h3>Account Settings</h3>
            </div>
          </div>
          
          <div className="panel-body py-3">
            <div className="mb-4">
              <label className="text-secondary text-xs font-semibold block mb-1">Logged In Account</label>
              <div className="font-semibold text-lg">{userEmail}</div>
              <button className="btn btn-outline btn-sm mt-3" onClick={onLogout}>
                <LogOut size={14} style={{ marginRight: '6px' }} /> Sign Out of App
              </button>
            </div>

            <div className="border-top pt-4">
              <div className="d-flex align-center gap-2 color-danger mb-2">
                <AlertOctagon size={18} />
                <h4 className="font-semibold text-sm">Danger Zone</h4>
              </div>
              <p className="text-secondary text-xs mb-3">
                This action will permanently delete your account, including all your profiles, blood pressure logs, glucose records, medical reports, and settings. This cannot be undone.
              </p>
              
              <form onSubmit={handleAccountDeletion}>
                <div className="form-group mb-3">
                  <label htmlFor="reset-confirm-input" className="text-secondary text-xs">
                    Type <strong>DELETE MY ACCOUNT</strong> to verify:
                  </label>
                  <input 
                    type="text" 
                    id="reset-confirm-input" 
                    className="form-control" 
                    placeholder="Type verification sentence..."
                    value={resetConfirm}
                    onChange={(e) => setResetConfirm(e.target.value)}
                    required
                  />
                </div>
                <button 
                  type="submit" 
                  className="btn btn-primary bg-danger w-100 py-2"
                  disabled={resetConfirm !== 'DELETE MY ACCOUNT' || deletingAccount}
                >
                  {deletingAccount ? 'Deleting account...' : 'Delete My Account'}
                </button>
              </form>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
