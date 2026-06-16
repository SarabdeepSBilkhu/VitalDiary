import React, { useState, useRef } from 'react';
import { 
  Settings as SettingsIcon, LogOut, Download, FileSpreadsheet, FileText, 
  Upload, Database, AlertOctagon 
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';
import type { WeightRecord, ReportRecord } from '../utils/api';
import { evaluateBP, evaluateGlucose } from '../utils/evaluators';

const fmtDT = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    csvContent += "Type,Timestamp/Date,Systolic (BP),Diastolic (BP),Heart Rate (bpm),Oxygen (SpO2 %),Glucose (mg/dL),Glucose Context,Weight (kg),Report Type,Report Title,Report Lab Data,Notes/Comments\r\n";

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
        csvContent += `Report,${r.timestamp},,,,,,,,,,${r.report_type},"${r.title.replace(/"/g, '""')}","${(r.data || '').replace(/"/g, '""')}","${(r.notes || '').replace(/"/g, '""')}"\r\n`;
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
        "Title": r.title,
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
  const handleExportPDF = () => {
    if (allLogs.length === 0) {
      showToast('No data available to export.', 'warning');
      return;
    }

    const doc = new jsPDF();
    let y = 20;

    // Header
    doc.setFillColor(34, 49, 63);
    doc.rect(0, 0, 220, 35, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text("VITALDIARY HEALTH REPORT", 14, 23);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`User Account: ${userEmail}  |  Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
    y = 50;

    // Averages Subcard
    doc.setFillColor(242, 245, 248);
    doc.rect(14, y, 182, 35, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(50, 50, 50);
    doc.text("REPORT SUMMARY & STATISTICAL AVERAGES (LAST 30 DAYS)", 18, y + 8);
    const totalV = vitals.length;
    const avgSys = totalV ? Math.round(vitals.reduce((a, b) => a + b.systolic, 0) / totalV) : 0;
    const avgDia = totalV ? Math.round(vitals.reduce((a, b) => a + b.diastolic, 0) / totalV) : 0;
    const avgHr = totalV ? Math.round(vitals.reduce((a, b) => a + b.hr, 0) / totalV) : 0;
    const glFasting = glucose.filter(g => g.context === 'fasting');
    const avgFast = glFasting.length ? Math.round(glFasting.reduce((a, b) => a + b.value, 0) / glFasting.length) : 0;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Average Blood Pressure:  ${avgSys ? `${avgSys}/${avgDia} mmHg` : 'N/A'}`, 18, y + 18);
    doc.text(`Average Heart Rate:      ${avgHr ? `${avgHr} bpm` : 'N/A'}`, 18, y + 24);
    doc.text(`Average Fasting Glucose:  ${avgFast ? `${avgFast} mg/dL` : 'N/A'}`, 18, y + 30);
    doc.text(`Total Records Added:      ${allLogs.length} entries`, 110, y + 18);
    y += 50;

    const drawHeader = (title: string, color: [number, number, number], cols: { name: string, x: number }[]) => {
      doc.addPage();
      y = 20;
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

    // Vitals
    drawHeader("1. BLOOD PRESSURE & HEART RATE LOGS", [79, 93, 117], [
        { name: "Date & Time", x: 16 }, { name: "Sys / Dia", x: 60 }, { name: "Heart Rate", x: 90 }, { name: "SpO2", x: 115 }, { name: "Medical Status", x: 135 }, { name: "Notes", x: 165 }
    ]);
    vitals.forEach(v => {
      if (y > 280) drawHeader("1. BLOOD PRESSURE & HEART RATE LOGS (Cont.)", [79, 93, 117], [
        { name: "Date & Time", x: 16 }, { name: "Sys / Dia", x: 60 }, { name: "Heart Rate", x: 90 }, { name: "SpO2", x: 115 }, { name: "Medical Status", x: 135 }, { name: "Notes", x: 165 }
      ]);
      doc.text(fmtDT(v.timestamp), 16, y);
      doc.text(`${v.systolic}/${v.diastolic} mmHg`, 60, y);
      doc.text(`${v.hr} bpm`, 90, y);
      doc.text(v.spo2 ? `${v.spo2}%` : 'N/A', 115, y);
      doc.text(evaluateBP(v.systolic, v.diastolic).status, 135, y);
      doc.text(v.notes ? (v.notes.substring(0, 16)) : '', 165, y);
      y += 7;
    });

    // Glucose
    drawHeader("2. BLOOD GLUCOSE LOGS", [115, 93, 120], [
        { name: "Date & Time", x: 16 }, { name: "Glucose Level", x: 65 }, { name: "Context", x: 100 }, { name: "Guidelines Status", x: 130 }, { name: "Diet Notes", x: 165 }
    ]);
    glucose.forEach(g => {
      if (y > 280) drawHeader("2. BLOOD GLUCOSE LOGS (Cont.)", [115, 93, 120], [
        { name: "Date & Time", x: 16 }, { name: "Glucose Level", x: 65 }, { name: "Context", x: 100 }, { name: "Guidelines Status", x: 130 }, { name: "Diet Notes", x: 165 }
      ]);
      doc.text(fmtDT(g.timestamp), 16, y);
      doc.text(`${g.value} mg/dL`, 65, y);
      doc.text(g.context.toUpperCase(), 100, y);
      doc.text(evaluateGlucose(g.value, g.context).status, 130, y);
      doc.text(g.notes ? (g.notes.substring(0, 16)) : '', 165, y);
      y += 7;
    });

    // Weight
    drawHeader("3. WEIGHT TRACKER LOGS", [34, 139, 34], [
        { name: "Date & Time", x: 16 }, { name: "Weight (kg)", x: 80 }, { name: "Notes", x: 130 }
    ]);
    weights.forEach(w => {
      if (y > 280) drawHeader("3. WEIGHT TRACKER LOGS (Cont.)", [34, 139, 34], [
        { name: "Date & Time", x: 16 }, { name: "Weight (kg)", x: 80 }, { name: "Notes", x: 130 }
      ]);
      doc.text(fmtDT(w.timestamp), 16, y);
      doc.text(`${w.value} kg`, 80, y);
      doc.text(w.notes ? (w.notes.substring(0, 30)) : '', 130, y);
      y += 7;
    });

    // Reports
    drawHeader("4. MEDICAL LAB REPORTS", [210, 105, 30], [
        { name: "Date & Time", x: 16 }, { name: "Type", x: 60 }, { name: "Title", x: 90 }, { name: "Notes / Observations", x: 140 }
    ]);
    reports.forEach(r => {
      if (y > 280) drawHeader("4. MEDICAL LAB REPORTS (Cont.)", [210, 105, 30], [
        { name: "Date & Time", x: 16 }, { name: "Type", x: 60 }, { name: "Title", x: 90 }, { name: "Notes / Observations", x: 140 }
      ]);
      doc.text(fmtDT(r.timestamp), 16, y);
      doc.text(r.report_type, 60, y);
      doc.text(r.title.substring(0, 22), 90, y);
      doc.text(r.notes ? (r.notes.substring(0, 25)) : '', 140, y);
      y += 7;
    });

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

              <button className="btn btn-outline justify-between" onClick={handleExportPDF}>
                <span className="d-flex align-center gap-2"><FileText size={18} className="color-danger" /> Export Medical PDF Report</span>
                <span className="text-xs text-muted">Print Ready Format</span>
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
