import React from 'react';
import {
  Activity, Heart, Droplet, Thermometer, TrendingUp, Sparkles,
  PlusCircle, Clock, Edit3, Trash2
} from 'lucide-react';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const fmtDT = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

interface DashboardProps {
  vitals: VitalsRecord[];
  glucose: GlucoseRecord[];
  allLogs: any[];
  onOpenLogModal: (log?: any) => void;
  onDeleteLog: (id: string, type: 'vitals' | 'glucose') => void;
  onNavigate: (view: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  vitals,
  glucose,
  allLogs,
  onOpenLogModal,
  onDeleteLog,
  onNavigate
}) => {

  // 1. Latest card values
  const latestVital = vitals[0] || null;
  const latestGlucose = glucose[0] || null;

  const bpEval = latestVital ? evaluateBP(latestVital.systolic, latestVital.diastolic) : null;
  const hrEval = latestVital ? evaluateHR(latestVital.hr) : null;
  const spo2Eval = latestVital ? evaluateSpO2(latestVital.spo2) : null;
  const glucoseEval = latestGlucose ? evaluateGlucose(latestGlucose.value, latestGlucose.context) : null;

  // 2. Averages
  const avgBP = () => {
    if (vitals.length === 0) return '--/-- mmHg';
    const sysSum = vitals.reduce((acc, l) => acc + l.systolic, 0);
    const diaSum = vitals.reduce((acc, l) => acc + l.diastolic, 0);
    return `${Math.round(sysSum / vitals.length)}/${Math.round(diaSum / vitals.length)} mmHg`;
  };

  const avgHR = () => {
    if (vitals.length === 0) return '-- bpm';
    const hrSum = vitals.reduce((acc, l) => acc + l.hr, 0);
    return `${Math.round(hrSum / vitals.length)} bpm`;
  };

  const avgSpO2 = () => {
    const validSpo2 = vitals.filter(l => l.spo2 !== null);
    if (validSpo2.length === 0) return '-- %';
    const spo2Sum = validSpo2.reduce((acc, l) => acc + (l.spo2 || 0), 0);
    return `${Math.round(spo2Sum / validSpo2.length)} %`;
  };

  const avgFastingGlucose = () => {
    const fasting = glucose.filter(l => l.context === 'fasting');
    if (fasting.length === 0) return '-- mg/dL';
    const sum = fasting.reduce((acc, l) => acc + l.value, 0);
    return `${Math.round(sum / fasting.length)} mg/dL`;
  };

  // 3. BP Chart (last 7, chronological)
  const chartVitals = [...vitals].slice(0, 7).reverse();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? '#b2ccd6' : '#546e7a';

  const chartData = {
    labels: chartVitals.map(l => formatDateLabel(l.timestamp)),
    datasets: [
      {
        label: 'Systolic',
        data: chartVitals.map(l => l.systolic),
        borderColor: 'hsl(355, 78%, 56%)',
        backgroundColor: 'hsla(355, 78%, 56%, 0.1)',
        borderWidth: 3,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: 'hsl(355, 78%, 56%)',
        pointHoverRadius: 7
      },
      {
        label: 'Diastolic',
        data: chartVitals.map(l => l.diastolic),
        borderColor: 'hsl(200, 85%, 55%)',
        backgroundColor: 'hsla(200, 85%, 55%, 0.05)',
        borderWidth: 3,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: 'hsl(200, 85%, 55%)',
        pointHoverRadius: 7
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: textColor, font: { family: 'Outfit' } }
      },
      tooltip: {
        titleFont: { family: 'Outfit' },
        bodyFont: { family: 'Outfit' }
      }
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: { color: textColor, font: { family: 'Outfit' } }
      },
      y: {
        grid: { color: gridColor },
        ticks: { color: textColor, font: { family: 'Outfit' } }
      }
    }
  };

  const recentLogs = [...allLogs].slice(0, 5);

  return (
    <section id="dashboard-view" className="view-section active">
      {/* Metric Cards */}
      <div className="stats-grid">

        {/* BP Card */}
        <div className="metric-card bp-card" id="card-bp">
          <div className="card-header">
            <div className="icon-wrapper bg-red">
              <Activity size={20} />
            </div>
            <span className="metric-title">Blood Pressure</span>
          </div>
          <div className="card-value-container">
            <div className="card-value" id="latest-bp">
              {latestVital ? `${latestVital.systolic}/${latestVital.diastolic}` : '--/--'}
            </div>
            <span className="card-unit">mmHg</span>
          </div>
          <div className="card-footer">
            <span className={`status-indicator ${bpEval?.className || 'status-neutral'}`}>
              {bpEval?.status || 'No Data'}
            </span>
            <span className="time-stamp" id="time-bp">
              {latestVital ? fmtDT(latestVital.timestamp) : '--'}
            </span>
          </div>
        </div>

        {/* HR Card */}
        <div className="metric-card hr-card" id="card-hr">
          <div className="card-header">
            <div className="icon-wrapper bg-rose">
              <Heart size={20} />
            </div>
            <span className="metric-title">Heart Rate</span>
          </div>
          <div className="card-value-container">
            <div className="card-value" id="latest-hr">
              {latestVital ? latestVital.hr : '--'}
            </div>
            <span className="card-unit">bpm</span>
          </div>
          <div className="card-footer">
            <span className={`status-indicator ${hrEval?.className || 'status-neutral'}`}>
              {hrEval?.status || 'No Data'}
            </span>
            <span className="time-stamp" id="time-hr">
              {latestVital ? fmtDT(latestVital.timestamp) : '--'}
            </span>
          </div>
        </div>

        {/* SpO2 Card */}
        <div className="metric-card spo2-card" id="card-spo2">
          <div className="card-header">
            <div className="icon-wrapper bg-blue">
              <Droplet size={20} />
            </div>
            <span className="metric-title">SpO₂ Oxygen</span>
          </div>
          <div className="card-value-container">
            <div className="card-value" id="latest-spo2">
              {latestVital?.spo2 !== null && latestVital?.spo2 !== undefined ? latestVital.spo2 : '--'}
            </div>
            <span className="card-unit">%</span>
          </div>
          <div className="card-footer">
            <span className={`status-indicator ${spo2Eval?.className || 'status-neutral'}`}>
              {spo2Eval?.status || 'No Data'}
            </span>
            <span className="time-stamp" id="time-spo2">
              {latestVital ? fmtDT(latestVital.timestamp) : '--'}
            </span>
          </div>
        </div>

        {/* Glucose Card */}
        <div className="metric-card glucose-card" id="card-glucose">
          <div className="card-header">
            <div className="icon-wrapper bg-purple">
              <Thermometer size={20} />
            </div>
            <span className="metric-title">Blood Glucose</span>
          </div>
          <div className="card-value-container">
            <div className="card-value" id="latest-glucose">
              {latestGlucose ? latestGlucose.value : '--'}
            </div>
            <span className="card-unit">mg/dL</span>
          </div>
          <div className="card-footer">
            <span className={`status-indicator ${glucoseEval?.className || 'status-neutral'}`}>
              {latestGlucose ? `${latestGlucose.context} (${glucoseEval?.status})` : 'No Data'}
            </span>
            <span className="time-stamp" id="time-glucose">
              {latestGlucose ? fmtDT(latestGlucose.timestamp) : '--'}
            </span>
          </div>
        </div>

      </div>

      {/* Dashboard Grid */}
      <div className="dashboard-grid">

        {/* BP Trend Chart */}
        <div className="panel panel-glass trends-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <TrendingUp className="color-primary" size={22} />
              <h3>Quick Trend (Blood Pressure)</h3>
            </div>
            <button className="btn btn-text btn-sm" onClick={() => onNavigate('analytics-view')}>
              View Detailed Charts
            </button>
          </div>
          <div className="chart-container">
            {chartVitals.length > 0 ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <div className="d-flex align-center justify-center h-100 text-muted">
                No vitals readings logged yet. Add logs to see your blood pressure trend.
              </div>
            )}
          </div>
        </div>

        {/* Averages Summary */}
        <div className="panel panel-glass summary-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <Sparkles className="color-gold" size={22} />
              <h3>Averages &amp; Status Summary</h3>
            </div>
          </div>
          <div className="summary-list">
            <div className="summary-item">
              <div className="summary-label">Avg Blood Pressure</div>
              <div className="summary-value" id="summary-avg-bp">{avgBP()}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Avg Heart Rate</div>
              <div className="summary-value" id="summary-avg-hr">{avgHR()}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Avg SpO₂ Saturation</div>
              <div className="summary-value" id="summary-avg-spo2">{avgSpO2()}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Avg Fasting Glucose</div>
              <div className="summary-value" id="summary-avg-glucose-fasting">{avgFastingGlucose()}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Total Logs Added</div>
              <div className="summary-value" id="summary-total-logs">{allLogs.length} readings</div>
            </div>
          </div>
          <div className="summary-action-box">
            <button className="btn btn-outline w-100" onClick={() => onOpenLogModal()}>
              <PlusCircle size={16} /> Log BP, HR &amp; SpO₂
            </button>
            <button className="btn btn-outline w-100" onClick={() => onOpenLogModal()}>
              <PlusCircle size={16} /> Log Blood Glucose
            </button>
          </div>
        </div>

      </div>

      {/* Recent Logs Table */}
      <div className="panel panel-glass mt-4">
        <div className="panel-header">
          <div className="panel-title-group">
            <Clock className="color-blue" size={22} />
            <h3>Recent Readings</h3>
          </div>
          <button className="btn btn-text btn-sm" onClick={() => onNavigate('history-view')}>
            View All History
          </button>
        </div>
        <div className="table-responsive">
          <table className="table" id="recent-logs-table">
            <thead>
              <tr>
                <th>Date &amp; Time</th>
                <th>Metric / Type</th>
                <th>Value</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="recent-logs-tbody">
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
                    No readings logged yet. Add your first health record today!
                  </td>
                </tr>
              ) : (
                recentLogs.map((log) => {
                  const isVital = log.type === 'vitals' || 'systolic' in log;
                  let metricLabel;
                  let valueLabel;
                  let badgeText = '';
                  let badgeClass = '';

                  if (isVital) {
                    const vitalLog = log as VitalsRecord;
                    metricLabel = (
                      <div className="d-flex align-center gap-2">
                        <span className="badge bg-red" title="Vitals Entry">
                          <Activity size={12} style={{ marginRight: '4px' }} /> Vitals
                        </span>
                      </div>
                    );
                    valueLabel = (
                      <div>
                        <div><strong>BP:</strong> {vitalLog.systolic}/{vitalLog.diastolic} <span className="text-sm text-muted">mmHg</span></div>
                        <div className="text-sm text-secondary"><strong>HR:</strong> {vitalLog.hr} bpm | <strong>SpO₂:</strong> {vitalLog.spo2 || '--'}%</div>
                      </div>
                    );
                    const evalRes = evaluateBP(vitalLog.systolic, vitalLog.diastolic);
                    badgeText = evalRes.status;
                    badgeClass = evalRes.className;
                  } else {
                    const glucoseLog = log as GlucoseRecord;
                    metricLabel = (
                      <div className="d-flex align-center gap-2">
                        <span className="badge bg-purple" title="Glucose Entry">
                          <Thermometer size={12} style={{ marginRight: '4px' }} /> Glucose
                        </span>
                        <span className="text-sm text-secondary capitalize">{glucoseLog.context}</span>
                      </div>
                    );
                    valueLabel = <span><strong>{glucoseLog.value}</strong> <span className="text-sm text-muted">mg/dL</span></span>;
                    const evalRes = evaluateGlucose(glucoseLog.value, glucoseLog.context);
                    badgeText = evalRes.status;
                    badgeClass = evalRes.className;
                  }

                  return (
                    <tr key={log.id}>
                      <td>{fmtDT(log.timestamp)}</td>
                      <td>{metricLabel}</td>
                      <td>{valueLabel}</td>
                      <td><span className={`status-indicator ${badgeClass}`}>{badgeText}</span></td>
                      <td
                        className="text-secondary"
                        style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={log.notes || ''}
                      >
                        {log.notes || '--'}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn-table-action edit-action"
                            title="Edit Entry"
                            onClick={() => onOpenLogModal(log)}
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            className="btn-table-action delete-action"
                            title="Delete Entry"
                            onClick={() => onDeleteLog(log.id, isVital ? 'vitals' : 'glucose')}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
