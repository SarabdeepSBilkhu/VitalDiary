import React from 'react';
import {
  Activity, Heart, Droplet, Thermometer, TrendingUp, Sparkles, Weight
} from 'lucide-react';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';
import type { WeightRecord, ReportRecord } from '../utils/api';
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

interface PatientHealthViewProps {
  vitals: VitalsRecord[];
  glucose: GlucoseRecord[];
  weights: WeightRecord[];
  reports: ReportRecord[];
  allLogs: any[];
  healthAlerts?: { type: 'info' | 'warning' | 'danger', message: string }[];
  onOpenLogModal: (log?: any) => void;
  onDeleteLog: (id: string, type: 'vitals' | 'glucose' | 'weight' | 'reports') => void;
  onNavigate: (view: string) => void;
}

export const PatientHealthView: React.FC<PatientHealthViewProps> = ({
  vitals,
  glucose,
  weights,
  allLogs,
  healthAlerts = [],
  onNavigate
}) => {

  // 1. Latest card values
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

  // 2. Averages (Last 7 Days Only)
  const getRecent = <T extends { timestamp: string }>(arr: T[]) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return arr.filter(item => new Date(item.timestamp) >= sevenDaysAgo);
  };

  const recentVitals = getRecent(vitals);
  const recentGlucose = getRecent(glucose);

  const avgBP = () => {
    if (recentVitals.length === 0) return '--/-- mmHg';
    const sysSum = recentVitals.reduce((acc, l) => acc + Number(l.systolic), 0);
    const dbDiaSum = recentVitals.reduce((acc, l) => acc + Number(l.diastolic), 0);
    return `${Math.round(sysSum / recentVitals.length)}/${Math.round(dbDiaSum / recentVitals.length)} mmHg`;
  };

  const avgHR = () => {
    if (recentVitals.length === 0) return '-- bpm';
    const hrSum = recentVitals.reduce((acc, l) => acc + Number(l.hr), 0);
    return `${Math.round(hrSum / recentVitals.length)} bpm`;
  };

  const avgSpO2 = () => {
    const validSpo2 = recentVitals.filter(l => l.spo2 !== null);
    if (validSpo2.length === 0) return '-- %';
    const spo2Sum = validSpo2.reduce((acc, l) => acc + Number(l.spo2 || 0), 0);
    return `${Math.round(spo2Sum / validSpo2.length)} %`;
  };

  const avgTemp = () => {
    const validTemp = recentVitals.filter(l => l.temperature !== null && l.temperature !== undefined);
    if (validTemp.length === 0) return '--';
    // Mixed units would complicate averages, simple approximation:
    const tempSum = validTemp.reduce((acc, l) => acc + Number(l.temperature), 0);
    const unit = validTemp[0]?.temperature_unit || 'C';
    return `${(tempSum / validTemp.length).toFixed(1)} °${unit}`;
  };

  const avgFastingGlucose = () => {
    const fasting = recentGlucose.filter(l => l.context === 'fasting');
    if (fasting.length === 0) return '-- mg/dL';
    const sum = fasting.reduce((acc, l) => acc + Number(l.value), 0);
    return `${Math.round(sum / fasting.length)} mg/dL`;
  };

  const avgPreMealGlucose = () => {
    const preMeal = recentGlucose.filter(l => l.context === 'pre-meal');
    if (preMeal.length === 0) return '-- mg/dL';
    const sum = preMeal.reduce((acc, l) => acc + Number(l.value), 0);
    return `${Math.round(sum / preMeal.length)} mg/dL`;
  };

  const avgPostMealGlucose = () => {
    const postMeal = recentGlucose.filter(l => l.context === 'post-meal');
    if (postMeal.length === 0) return '-- mg/dL';
    const sum = postMeal.reduce((acc, l) => acc + Number(l.value), 0);
    return `${Math.round(sum / postMeal.length)} mg/dL`;
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

  return (
    <section id="dashboard-view" className="view-section active">
      {/* Health Alerts */}
      {healthAlerts.length > 0 && (
        <div className="health-alerts-container" style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
              <Activity size={24} style={{ color: alert.type === 'danger' ? 'hsl(355, 78%, 56%)' : alert.type === 'warning' ? 'hsl(30, 90%, 50%)' : 'hsl(200, 85%, 55%)' }} />
              <div>
                <strong>Health Alert: </strong> {alert.message}
              </div>
            </div>
          ))}
        </div>
      )}

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

        {/* Temperature Card */}
        <div className="metric-card temp-card" id="card-temp">
          <div className="card-header">
            <div className="icon-wrapper bg-orange" style={{ backgroundColor: 'hsla(30, 90%, 50%, 0.15)', color: 'hsl(30, 90%, 50%)' }}>
              <Thermometer size={20} />
            </div>
            <span className="metric-title">Body Temp</span>
          </div>
          <div className="card-value-container">
            <div className="card-value" id="latest-temp">
              {latestVital?.temperature !== null && latestVital?.temperature !== undefined ? latestVital.temperature : '--'}
            </div>
            <span className="card-unit">°{latestVital?.temperature_unit || 'C'}</span>
          </div>
          <div className="card-footer">
            <span className={`status-indicator ${tempEval?.className || 'status-neutral'}`}>
              {tempEval?.status || 'No Data'}
            </span>
            <span className="time-stamp" id="time-temp">
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

        {/* Weight Card */}
        <div className="metric-card weight-card" id="card-weight">
          <div className="card-header">
            <div className="icon-wrapper bg-green" style={{ backgroundColor: 'hsla(150, 80%, 40%, 0.15)', color: 'hsl(150, 80%, 40%)' }}>
              <Weight size={20} />
            </div>
            <span className="metric-title">Body Weight</span>
          </div>
          <div className="card-value-container">
            <div className="card-value" id="latest-weight">
              {latestWeight ? latestWeight.value : '--'}
            </div>
            <span className="card-unit">kg</span>
          </div>
          <div className="card-footer">
            <span className="status-indicator status-info">Active Track</span>
            <span className="time-stamp" id="time-weight">
              {latestWeight ? fmtDT(latestWeight.timestamp) : '--'}
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
              <div className="summary-label">Avg Body Temp</div>
              <div className="summary-value" id="summary-avg-temp">{avgTemp()}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Avg Fasting Glucose</div>
              <div className="summary-value" id="summary-avg-glucose-fasting">{avgFastingGlucose()}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Avg Pre-meal Glucose</div>
              <div className="summary-value" id="summary-avg-glucose-pre">{avgPreMealGlucose()}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Avg Post-meal Glucose</div>
              <div className="summary-value" id="summary-avg-glucose-post">{avgPostMealGlucose()}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Total Logs Added</div>
              <div className="summary-value" id="summary-total-logs">{allLogs.length} readings</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};