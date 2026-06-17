import React, { useState, useRef } from 'react';
import { 
  Settings as SettingsIcon, LogOut, Download, FileSpreadsheet, FileText, 
  Upload, Database, AlertOctagon 
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';
import { api, type WeightRecord, type ReportRecord, type ProfileRecord } from '../utils/api';
import { evaluateBP, evaluateGlucose } from '../utils/evaluators';
import { parseReportParameters, getLatestReportsByType, getReportTypeFromRecord } from './Analytics';

const fmtDT = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const PDF_WINDOW_DAYS = 30;

const isWithinLastDays = (timestamp: string, days: number) => {
  const now = new Date();
  const logDate = new Date(timestamp);
  const diffDays = Math.ceil(Math.abs(now.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= days;
};

const filterRecent = <T extends { timestamp: string }>(records: T[], days = PDF_WINDOW_DAYS) =>
  records
    .filter(r => isWithinLastDays(r.timestamp, days))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

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
  allLogs,
  userEmail,
  onLogout,
  onRefreshData,
  showToast
}) => {
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Export CSV
  const handleExportCSV = () => {
    if (allLogs.length === 0) {
      showToast('No data available to export.', 'warning');
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Type,Timestamp/Date,Systolic (BP),Diastolic (BP),Heart Rate (bpm),Oxygen (SpO2 %),Glucose (mg/dL),Glucose Context,Weight (kg),Report Type,Report Lab Data,Notes/Comments\r\n";

    allLogs.forEach(log => {
      const type = log.type;
      if (type === 'vitals') {
        const v = log as VitalsRecord;
        csvContent += `Vitals,${v.timestamp},${v.systolic},${v.diastolic},${v.hr},${v.spo2 || ''},,,,,,,${(v.notes || '').replace(/"/g, '""')}\r\n`;
      } else if (type === 'glucose') {
        const g = log as GlucoseRecord;
        csvContent += `Glucose,${g.timestamp},,,,${g.value},${g.context},,,,,${(g.notes || '').replace(/"/g, '""')}\r\n`;
      } else if (type === 'weight') {
        const w = log as WeightRecord;
        csvContent += `Weight,${w.timestamp},,,,,,,,${w.value},,,,${(w.notes || '').replace(/"/g, '""')}\r\n`;
      } else if (type === 'reports') {
        const r = log as ReportRecord;
        csvContent += `Report,${r.timestamp},,,,,,,,${r.report_type},"${(r.data || '').replace(/"/g, '""')}","${(r.notes || '').replace(/"/g, '""')}"\r\n`;
      }
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "vitaldiary_health_logs.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV Exported successfully.', 'success');
  };

  // 2. Export Excel (XLSX)
  const handleExportExcel = () => {
    if (allLogs.length === 0) {
      showToast('No data available to export.', 'warning');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Vitals Sheet
    if (vitals.length > 0) {
      const vitalsData = vitals.map(v => ({
        "Date & Time": fmtDT(v.timestamp),
        "Systolic (mmHg)": v.systolic,
        "Diastolic (mmHg)": v.diastolic,
        "Heart Rate (bpm)": v.hr,
        "Oxygen (SpO2 %)": v.spo2 || 'N/A',
        "Status": evaluateBP(v.systolic, v.diastolic).status,
        "Notes": v.notes || ''
      }));
      const wsVitals = XLSX.utils.json_to_sheet(vitalsData);
      XLSX.utils.book_append_sheet(wb, wsVitals, "Vitals Logs");
    }

    // Glucose Sheet
    if (glucose.length > 0) {
      const glucoseData = glucose.map(g => ({
        "Date & Time": fmtDT(g.timestamp),
        "Glucose Value (mg/dL)": g.value,
        "Measurement Time": g.context.toUpperCase(),
        "Status": evaluateGlucose(g.value, g.context).status,
        "Notes": g.notes || ''
      }));
      const wsGlucose = XLSX.utils.json_to_sheet(glucoseData);
      XLSX.utils.book_append_sheet(wb, wsGlucose, "Glucose Logs");
    }

    // Weight Sheet
    if (weights.length > 0) {
      const weightData = weights.map(w => ({
        "Date & Time": fmtDT(w.timestamp),
        "Weight (kg)": w.value,
        "Notes": w.notes || ''
      }));
      const wsWeight = XLSX.utils.json_to_sheet(weightData);
      XLSX.utils.book_append_sheet(wb, wsWeight, "Weight Logs");
    }

    // Reports Sheet
    if (reports.length > 0) {
      const reportsData = reports.map(r => ({
        "Date & Time": fmtDT(r.timestamp),
        "Report Type": r.report_type,
        "Lab Results": r.data || '',
        "Notes": r.notes || ''
      }));
      const wsReports = XLSX.utils.json_to_sheet(reportsData);
      XLSX.utils.book_append_sheet(wb, wsReports, "Medical Reports");
    }

    if (wb.SheetNames.length === 0) {
      showToast('Export failed. Data arrays are empty.', 'danger');
      return;
    }

    XLSX.writeFile(wb, "vitaldiary_excel_export.xlsx");
    showToast('Excel Workbook exported successfully.', 'success');
  };

  // 3. Export PDF
  const handleExportPDF = async () => {
    let profile: ProfileRecord = {
      name: '', age: '', gender: '', bloodGroup: '', height: '', allergies: '', emergencyContact: '',
    };
    try {
      profile = await api.getProfile();
    } catch {
      // Continue with empty profile if fetch fails
    }

    const vitals30 = filterRecent(vitals);
    const glucose30 = filterRecent(glucose);
    const weights30 = filterRecent(weights);
    const latestReportsByType = getLatestReportsByType(reports);

    const hasContent = vitals30.length > 0 || glucose30.length > 0 || weights30.length > 0 || latestReportsByType.length > 0
      || [profile.name, profile.age, profile.gender, profile.bloodGroup, profile.height, profile.allergies, profile.emergencyContact]
        .some(v => v?.trim());

    if (!hasContent) {
      showToast('No profile or health data available to export.', 'warning');
      return;
    }

    const periodEnd = new Date();
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - PDF_WINDOW_DAYS);
    const periodLabel = `${periodStart.toLocaleDateString()} – ${periodEnd.toLocaleDateString()}`;

    const doc = new jsPDF();
    let y = 20;

    const ensurePageSpace = (needed: number) => {
      if (y + needed > 280) {
        doc.addPage();
        y = 20;
      }
    };

    const drawSummaryBox = (title: string, lines: string[]) => {
      const boxHeight = 10 + lines.length * 6;
      ensurePageSpace(boxHeight + 4);
      doc.setFillColor(242, 245, 248);
      doc.rect(14, y, 182, boxHeight, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(50, 50, 50);
      doc.text(title, 18, y + 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      lines.forEach((line, i) => doc.text(line, 18, y + 16 + i * 6));
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
    doc.setFillColor(34, 49, 63);
    doc.rect(0, 0, 220, 35, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text("VITALDIARY HEALTH REPORT", 14, 23);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}  |  Reporting period: Last ${PDF_WINDOW_DAYS} days`, 14, 30);
    y = 50;

    // Patient summary
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    doc.text("PATIENT SUMMARY", 14, y);
    y += 8;

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

    const vitalsCols = [
      { name: "Date & Time", x: 16 }, { name: "Sys / Dia", x: 60 },
      { name: "Heart Rate", x: 90 }, { name: "SpO2", x: 115 },
      { name: "Medical Status", x: 135 }, { name: "Notes", x: 165 }
    ];

    const avgSys30 = vitals30.length ? Math.round(vitals30.reduce((a, b) => a + b.systolic, 0) / vitals30.length) : 0;
    const avgDia30 = vitals30.length ? Math.round(vitals30.reduce((a, b) => a + b.diastolic, 0) / vitals30.length) : 0;
    const avgHr30 = vitals30.length ? Math.round(vitals30.reduce((a, b) => a + b.hr, 0) / vitals30.length) : 0;
    const spo2Readings = vitals30.filter(v => v.spo2);
    const avgSpo230 = spo2Readings.length
      ? Math.round(spo2Readings.reduce((a, b) => a + (b.spo2 || 0), 0) / spo2Readings.length)
      : 0;

    drawSummaryBox(`30-DAY VITALS SUMMARY (${vitals30.length} readings)`, [
      `Average Blood Pressure:  ${avgSys30 ? `${avgSys30}/${avgDia30} mmHg` : 'N/A'}`,
      `Average Heart Rate:      ${avgHr30 ? `${avgHr30} bpm` : 'N/A'}`,
      `Average SpO2:            ${avgSpo230 ? `${avgSpo230}%` : 'N/A'}`,
    ]);

    drawHeader("1. BLOOD PRESSURE & HEART RATE (LAST 30 DAYS)", [79, 93, 117], vitalsCols);

    if (vitals30.length === 0) {
      doc.text("No vitals recorded in the last 30 days.", 16, y); y += 10;
    } else {
      vitals30.forEach(v => {
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

    // ─── Section 2: 30-day glucose ───────────────────────────────────────────

    const glucoseCols = [
      { name: "Date & Time", x: 16 }, { name: "Glucose Level", x: 65 },
      { name: "Context", x: 100 }, { name: "Guidelines Status", x: 130 },
      { name: "Diet Notes", x: 165 }
    ];

    const glFasting30 = glucose30.filter(g => g.context === 'fasting');
    const avgFast30 = glFasting30.length
      ? Math.round(glFasting30.reduce((a, b) => a + b.value, 0) / glFasting30.length)
      : 0;
    const glPostMeal30 = glucose30.filter(g => g.context === 'post-meal');
    const avgPostMeal30 = glPostMeal30.length
      ? Math.round(glPostMeal30.reduce((a, b) => a + b.value, 0) / glPostMeal30.length)
      : 0;

    drawSummaryBox(`30-DAY GLUCOSE SUMMARY (${glucose30.length} readings)`, [
      `Average Fasting Glucose:   ${avgFast30 ? `${avgFast30} mg/dL` : 'N/A'}`,
      `Average Post-Meal Glucose: ${avgPostMeal30 ? `${avgPostMeal30} mg/dL` : 'N/A'}`,
    ]);

    drawHeader("2. BLOOD GLUCOSE (LAST 30 DAYS)", [115, 93, 120], glucoseCols);

    if (glucose30.length === 0) {
      doc.text("No glucose readings recorded in the last 30 days.", 16, y); y += 10;
    } else {
      glucose30.forEach(g => {
        if (y + 7 > 280) drawContinuationHeader("2. BLOOD GLUCOSE (Cont.)", [115, 93, 120], glucoseCols);
        doc.setFontSize(8);
        const noteLines = doc.splitTextToSize(g.notes || '', 20).slice(0, 2);
        doc.text(fmtDT(g.timestamp), 16, y);
        doc.text(g.value ? `${g.value} mg/dL` : 'N/A', 65, y);
        doc.text(g.context.toUpperCase(), 100, y);
        doc.text(evaluateGlucose(g.value, g.context).status, 130, y);
        doc.text(noteLines, 165, y);
        y += 7;
      });
    }

    y += 8;

    // ─── Section 3: 30-day weight ────────────────────────────────────────────

    const weightCols = [
      { name: "Date & Time", x: 16 }, { name: "Weight (kg)", x: 80 }, { name: "Notes", x: 130 }
    ];

    const latestWeight30 = weights30[0]?.value;
    const oldestWeight30 = weights30.length > 0 ? weights30[weights30.length - 1].value : null;
    const weightChange30 = latestWeight30 != null && oldestWeight30 != null && weights30.length > 1
      ? `${(latestWeight30 - oldestWeight30).toFixed(1)} kg`
      : 'N/A';

    drawSummaryBox(`30-DAY WEIGHT SUMMARY (${weights30.length} readings)`, [
      `Latest Weight:   ${latestWeight30 != null ? `${latestWeight30} kg` : 'N/A'}`,
      `Period Change:   ${weightChange30}`,
    ]);

    drawHeader("3. WEIGHT TRACKER (LAST 30 DAYS)", [34, 139, 34], weightCols);

    if (weights30.length === 0) {
      doc.text("No weight readings recorded in the last 30 days.", 16, y); y += 10;
    } else {
      weights30.forEach(w => {
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

    // ─── Section 4: Latest medical reports by type ───────────────────────────

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

      doc.setDrawColor(210, 105, 30);
      doc.setLineWidth(0.3);
      doc.setFillColor(255, 248, 240);
      doc.roundedRect(14, y, 182, 8, 1, 1, 'FD');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(80, 45, 10);
      doc.text(`${reportType}  —  ${fmtDT(r.timestamp)}`, 16, y + 5.5);
      y += 12;

      const params = parseReportParameters(r.data || '');
      const paramKeys = Object.keys(params);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(50, 50, 50);
      doc.text("Lab Results", 16, y);
      y += 5;

      if (paramKeys.length > 0) {
        doc.setFillColor(210, 105, 30);
        doc.rect(16, y, 176, 6, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text("Parameter", 18, y + 4.2);
        doc.text("Value", 115, y + 4.2);
        y += 8;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        paramKeys.forEach((key, paramIndex) => {
          ensurePageSpace(6);
          if (paramIndex % 2 === 0) {
            doc.setFillColor(248, 248, 248);
            doc.rect(16, y - 3.5, 176, 5.5, 'F');
          }
          doc.text(key, 18, y);
          doc.text(String(params[key]), 115, y);
          y += 5.5;
        });
      } else if (r.data?.trim()) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        const resultLines = doc.splitTextToSize(r.data.trim(), 176);
        resultLines.forEach((line: string) => {
          ensurePageSpace(5);
          doc.text(line, 16, y);
          y += 4.5;
        });
      } else {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text("No lab results recorded.", 16, y);
        y += 5;
      }

      if (r.notes?.trim()) {
        y += 2;
        ensurePageSpace(10);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(50, 50, 50);
        doc.text("Notes / Observations", 16, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
        const noteLines = doc.splitTextToSize(r.notes.trim(), 176);
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
      doc.text("No medical reports saved.", 16, y);
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

    // ─── Disclaimer page ─────────────────────────────────────────────────────

    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(50, 50, 50);
    doc.text("IMPORTANT DISCLAIMER", 14, 25);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const disclaimer = doc.splitTextToSize(
      `This report is generated from user-entered health data and uploaded medical records. It is intended solely for record keeping and informational purposes. This document is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional regarding medical concerns and treatment decisions.`,
      170
    );
    doc.text(disclaimer, 14, 40);

    // ─── Page numbers ─────────────────────────────────────────────────────────

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`Page ${i} of ${pageCount}`, 170, 290);
    }

    doc.save("vitaldiary_health_report.pdf");
    showToast('PDF Report downloaded successfully.', 'success');
  };

  // 4. Download Backup (JSON)
  const handleBackupDownload = () => {
    const backupObj = {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      user: userEmail,
      vitals,
      glucose,
      weights,
      reports
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
        
        if (!backup.vitals && !backup.glucose && !backup.weights && !backup.reports) {
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

        showToast('Health database restored successfully!', 'success');
        await onRefreshData();
      } catch (err: any) {
        showToast(`Failed to restore backup: ${err.message || 'Invalid JSON format.'}`, 'danger');
      }
    };
    reader.readAsText(file);
    // Reset file input value
    e.target.value = '';
  };

  // 6. Hard Reset Data
  const handleHardReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetConfirm !== 'DELETE ALL MY RECORDS') {
      showToast('Verification sentence mismatch.', 'warning');
      return;
    }

    setResetting(true);
    try {
      // Clear vitals
      await fetch('/api/vitals/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('vital_diary_token')}`
        },
        body: JSON.stringify({ logs: [] })
      });

      // Clear glucose
      await fetch('/api/glucose/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('vital_diary_token')}`
        },
        body: JSON.stringify({ logs: [] })
      });

      // Clear weights
      await fetch('/api/weight/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('vital_diary_token')}`
        },
        body: JSON.stringify({ logs: [] })
      });

      // Clear reports
      await fetch('/api/reports/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('vital_diary_token')}`
        },
        body: JSON.stringify({ logs: [] })
      });

      showToast('Database wiped successfully.', 'success');
      setResetConfirm('');
      await onRefreshData();
    } catch (err: any) {
      showToast('Error resetting database.', 'danger');
    } finally {
      setResetting(false);
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

            <div className="d-flex flex-column gap-3">
              <button className="btn btn-outline justify-between" onClick={handleExportCSV}>
                <span className="d-flex align-center gap-2"><Download size={18} /> Export as CSV File</span>
                <span className="text-xs text-muted">Comma-Separated Text</span>
              </button>

              <button className="btn btn-outline justify-between" onClick={handleExportExcel}>
                <span className="d-flex align-center gap-2"><FileSpreadsheet size={18} className="color-success" /> Export Excel Workbook</span>
                <span className="text-xs text-muted">SheetJS .xlsx format</span>
              </button>

              <button className="btn btn-outline justify-between" onClick={() => void handleExportPDF()}>
                <span className="d-flex align-center gap-2"><FileText size={18} className="color-danger" /> Export Medical PDF Report</span>
                <span className="text-xs text-muted">30-day summary + latest labs by type</span>
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
                This action will delete all logged blood pressure, heart rate, oxygen, and glucose records from this database. This cannot be undone.
              </p>
              
              <form onSubmit={handleHardReset}>
                <div className="form-group mb-3">
                  <label htmlFor="reset-confirm-input" className="text-secondary text-xs">
                    Type <strong>DELETE ALL MY RECORDS</strong> to verify:
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
                  disabled={resetConfirm !== 'DELETE ALL MY RECORDS' || resetting}
                >
                  {resetting ? 'Resetting database...' : 'Wipe Database Records'}
                </button>
              </form>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
