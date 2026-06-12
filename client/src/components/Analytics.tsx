import React, { useState, useMemo } from 'react';
import { Calculator, LineChart as ChartIcon } from 'lucide-react';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';
import { evaluateBP, evaluateHR, evaluateSpO2, evaluateGlucose, formatDateLabel } from '../utils/evaluators';
import { Line } from 'react-chartjs-2';

interface AnalyticsProps {
  vitals: VitalsRecord[];
  glucose: GlucoseRecord[];
}

export const Analytics: React.FC<AnalyticsProps> = ({ vitals, glucose }) => {
  const [metric, setMetric] = useState<'bp' | 'hr' | 'spo2' | 'glucose'>('bp');
  const [timeframe, setTimeframe] = useState<'7days' | '30days' | 'year' | 'all'>('30days');

  // 1. Filter logs by metric and timeframe
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const sourceLogs = (metric === 'glucose') ? glucose : vitals;

    let filtered = sourceLogs.filter(log => {
      const logDate = new Date(log.timestamp);
      const diffTime = Math.abs(now.getTime() - logDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (timeframe === '7days') return diffDays <= 7;
      if (timeframe === '30days') return diffDays <= 30;
      if (timeframe === 'year') return diffDays <= 365;
      return true;
    });

    // Chronological order for chart display
    return [...filtered].reverse();
  }, [metric, timeframe, vitals, glucose]);

  // 2. Calculate Stats based on filtered logs
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
      glucosePostAvg: '--'
    };

    if (filteredLogs.length === 0) return results;

    let normalCount = 0;
    let warningCount = 0;
    let criticalCount = 0;

    if (metric === 'bp') {
      const bpLogs = filteredLogs as VitalsRecord[];
      const sysSum = bpLogs.reduce((a, b) => a + b.systolic, 0);
      const diaSum = bpLogs.reduce((a, b) => a + b.diastolic, 0);
      results.avg = `${Math.round(sysSum / bpLogs.length)}/${Math.round(diaSum / bpLogs.length)} mmHg`;

      const sortedSys = [...bpLogs].sort((a, b) => b.systolic - a.systolic);
      const highest = sortedSys[0];
      const sortedDia = [...bpLogs].sort((a, b) => a.diastolic - b.diastolic);
      const lowest = sortedDia[0];

      results.highest = `${highest.systolic}/${highest.diastolic}`;
      results.lowest = `${lowest.systolic}/${lowest.diastolic}`;

      bpLogs.forEach(log => {
        const evalRes = evaluateBP(log.systolic, log.diastolic);
        if (evalRes.className === 'status-normal') normalCount++;
        else if (evalRes.className === 'status-elevated') warningCount++;
        else criticalCount++;
      });

    } else if (metric === 'hr') {
      const hrLogs = filteredLogs as VitalsRecord[];
      const hrSum = hrLogs.reduce((a, b) => a + b.hr, 0);
      results.avg = `${Math.round(hrSum / hrLogs.length)} bpm`;

      const sortedHr = [...hrLogs].sort((a, b) => b.hr - a.hr);
      results.highest = `${sortedHr[0].hr} bpm`;
      results.lowest = `${sortedHr[sortedHr.length - 1].hr} bpm`;

      hrLogs.forEach(log => {
        const evalRes = evaluateHR(log.hr);
        if (evalRes.className === 'status-normal') normalCount++;
        else if (evalRes.className === 'status-elevated' || evalRes.className === 'status-low') warningCount++;
        else criticalCount++;
      });

    } else if (metric === 'spo2') {
      const spo2Logs = (filteredLogs as VitalsRecord[]).filter(l => l.spo2 !== null);
      if (spo2Logs.length > 0) {
        const spo2Sum = spo2Logs.reduce((a, b) => a + (b.spo2 || 0), 0);
        results.avg = `${Math.round(spo2Sum / spo2Logs.length)}%`;

        const sortedSpo2 = [...spo2Logs].sort((a, b) => (b.spo2 || 0) - (a.spo2 || 0));
        results.highest = `${sortedSpo2[0].spo2}%`;
        results.lowest = `${sortedSpo2[sortedSpo2.length - 1].spo2}%`;

        spo2Logs.forEach(log => {
          const evalRes = evaluateSpO2(log.spo2);
          if (evalRes.className === 'status-normal') normalCount++;
          else if (evalRes.className === 'status-elevated') warningCount++;
          else criticalCount++;
        });
      }

    } else if (metric === 'glucose') {
      const glLogs = filteredLogs as GlucoseRecord[];
      const glSum = glLogs.reduce((a, b) => a + b.value, 0);
      results.avg = `${Math.round(glSum / glLogs.length)} mg/dL`;

      const sortedGl = [...glLogs].sort((a, b) => b.value - a.value);
      results.highest = `${sortedGl[0].value} mg/dL`;
      results.lowest = `${sortedGl[sortedGl.length - 1].value} mg/dL`;

      const fasting = glLogs.filter(l => l.context === 'fasting');
      const preMeal = glLogs.filter(l => l.context === 'pre-meal');
      const postMeal = glLogs.filter(l => l.context === 'post-meal');

      const calcAvgText = (arr: GlucoseRecord[]) => {
        if (arr.length === 0) return '--';
        const sum = arr.reduce((a, b) => a + b.value, 0);
        return `${Math.round(sum / arr.length)} mg/dL`;
      };

      results.glucoseFastingAvg = calcAvgText(fasting);
      results.glucosePreAvg = calcAvgText(preMeal);
      results.glucosePostAvg = calcAvgText(postMeal);

      glLogs.forEach(log => {
        const evalRes = evaluateGlucose(log.value, log.context);
        if (evalRes.className === 'status-normal') normalCount++;
        else if (evalRes.className === 'status-elevated') warningCount++;
        else criticalCount++;
      });
    }

    results.normal = normalCount;
    results.warning = warningCount;
    results.critical = criticalCount;

    return results;
  }, [filteredLogs, metric]);

  // 3. Prepare Chart Data & Options
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
            backgroundColor: 'hsla(355, 78%, 56%, 0.1)',
            borderWidth: 3,
            tension: 0.25,
            fill: true,
            pointBackgroundColor: 'hsl(355, 78%, 56%)'
          },
          {
            label: 'Diastolic (BP Low)',
            data: bpLogs.map(l => l.diastolic),
            borderColor: 'hsl(200, 85%, 55%)',
            backgroundColor: 'hsla(200, 85%, 55%, 0.05)',
            borderWidth: 3,
            tension: 0.25,
            fill: true,
            pointBackgroundColor: 'hsl(200, 85%, 55%)'
          }
        ]
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
            backgroundColor: 'hsla(330, 80%, 60%, 0.15)',
            borderWidth: 3,
            tension: 0.3,
            fill: true,
            pointBackgroundColor: 'hsl(330, 80%, 60%)'
          }
        ]
      };
    } else if (metric === 'spo2') {
      const spo2Logs = filteredLogs as VitalsRecord[];
      return {
        labels,
        datasets: [
          {
            label: 'Oxygen Saturation (SpO₂ %)',
            data: spo2Logs.map(l => l.spo2),
            borderColor: 'hsl(200, 85%, 55%)',
            backgroundColor: 'hsla(200, 85%, 55%, 0.15)',
            borderWidth: 3,
            tension: 0.2,
            fill: true,
            pointBackgroundColor: 'hsl(200, 85%, 55%)'
          }
        ]
      };
    } else {
      const glLogs = filteredLogs as GlucoseRecord[];

      const fastingLogs = glLogs.filter(l => l.context === 'fasting');
      const preMealLogs = glLogs.filter(l => l.context === 'pre-meal');
      const postMealLogs = glLogs.filter(l => l.context === 'post-meal');

      return {
        fasting: {
          labels: fastingLogs.map(l => formatDateLabel(l.timestamp)),
          datasets: [
            {
              label: 'Fasting Glucose (mg/dL)',
              data: fastingLogs.map(l => l.value),
              borderColor: 'hsl(145, 70%, 43%)',
              backgroundColor: 'hsla(145, 70%, 43%, 0.15)',
              borderWidth: 3,
              tension: 0.3,
              fill: true,
              pointBackgroundColor: 'hsl(145, 70%, 43%)'
            }
          ]
        },

        preMeal: {
          labels: preMealLogs.map(l => formatDateLabel(l.timestamp)),
          datasets: [
            {
              label: 'Pre-Meal Glucose (mg/dL)',
              data: preMealLogs.map(l => l.value),
              borderColor: 'hsl(38, 92%, 52%)',
              backgroundColor: 'hsla(38, 92%, 52%, 0.15)',
              borderWidth: 3,
              tension: 0.3,
              fill: true,
              pointBackgroundColor: 'hsl(38, 92%, 52%)'
            }
          ]
        },

        postMeal: {
          labels: postMealLogs.map(l => formatDateLabel(l.timestamp)),
          datasets: [
            {
              label: 'Post-Meal Glucose (mg/dL)',
              data: postMealLogs.map(l => l.value),
              borderColor: 'hsl(275, 80%, 60%)',
              backgroundColor: 'hsla(275, 80%, 60%, 0.15)',
              borderWidth: 3,
              tension: 0.3,
              fill: true,
              pointBackgroundColor: 'hsl(275, 80%, 60%)'
            }
          ]
        }
      };
    }
  }, [filteredLogs, metric]);

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

  const titles = {
    bp: "Blood Pressure Trends",
    hr: "Heart Rate (BPM) Log",
    spo2: "Oxygen Saturation (SpO₂) History",
    glucose: "Blood Glucose levels"
  };

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
              onChange={(e) => setMetric(e.target.value as any)}
            >
              <option value="bp">Blood Pressure</option>
              <option value="hr">Heart Rate</option>
              <option value="spo2">Blood Oxygen (SpO₂)</option>
              <option value="glucose">Blood Glucose</option>
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
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Interactive Charts */}
        <div className="panel panel-glass trends-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <ChartIcon className="color-primary" size={22} />
              <h3>{titles[metric]}</h3>
            </div>
          </div>
          <div className="chart-container-large">
            {filteredLogs.length > 0 ? (

              metric === 'glucose' ? (

                <div className="glucose-charts-grid">

                  <div className="mb-4">
                    <h4>Fasting Glucose</h4>
                    <div style={{ height: '250px' }}>
                      <Line
                        data={(chartData as any).fasting}
                        options={chartOptions}
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <h4>Pre-Meal Glucose</h4>
                    <div style={{ height: '250px' }}>
                      <Line
                        data={(chartData as any).preMeal}
                        options={chartOptions}
                      />
                    </div>
                  </div>

                  <div>
                    <h4>Post-Meal Glucose</h4>
                    <div style={{ height: '250px' }}>
                      <Line
                        data={(chartData as any).postMeal}
                        options={chartOptions}
                      />
                    </div>
                  </div>

                </div>

              ) : (

                <Line
                  data={chartData as any}
                  options={chartOptions}
                />

              )

            ) : (
              <div className="d-flex align-center justify-center h-100 text-muted">
                No logs recorded within this time range. Add health logs to view statistics.
              </div>
            )}
          </div>
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
                    {metric === 'glucose' ? 'Overall Average' : 'Average Value'}
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
              <h4 className="stats-subgroup-title">Health Distribution</h4>
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
      </div>
    </section>
  );
};
