import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCircle2, Clock3, Pill, RotateCcw, Save, TrendingUp } from 'lucide-react';

type Medication = {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  instructions: string;
  timings: string[];
  active: boolean;
};

type DoseStatus = 'taken' | 'skipped' | 'missed';

type DoseLog = {
  medicationId: string;
  dateKey: string;
  timing: string;
  status: DoseStatus;
};

const MEDICATIONS_KEY = 'vital_diary_medications';
const DOSE_LOGS_KEY = 'vital_diary_dose_logs';

const emptyMedications: Medication[] = [];

const loadMedications = () => {
  try {
    const stored = localStorage.getItem(MEDICATIONS_KEY);
    return stored ? JSON.parse(stored) : emptyMedications;
  } catch {
    return emptyMedications;
  }
};

const loadDoseLogs = () => {
  try {
    const stored = localStorage.getItem(DOSE_LOGS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const slotLabel = (timing: string) => {
  const hour = Number.parseInt(timing.split(':')[0] || '0', 10);
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Night';
};

export const Medications: React.FC = () => {
  const [medications, setMedications] = useState<Medication[]>(loadMedications);
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>(loadDoseLogs);

  useEffect(() => {
    localStorage.setItem(MEDICATIONS_KEY, JSON.stringify(medications));
  }, [medications]);

  useEffect(() => {
    localStorage.setItem(DOSE_LOGS_KEY, JSON.stringify(doseLogs));
  }, [doseLogs]);

  const activeMedications = medications.filter(medication => medication.active);
  const dateKey = todayKey();

  const scheduledDoses = useMemo(() => {
    return activeMedications.flatMap(medication => medication.timings.map(timing => ({ medication, timing })));
  }, [activeMedications]);

  const summary = useMemo(() => {
    const allTimes = activeMedications.flatMap(medication => medication.timings);
    const monthlyLogs = doseLogs.filter(log => log.dateKey.startsWith(dateKey.slice(0, 7)));
    const taken = monthlyLogs.filter(log => log.status === 'taken').length;
    const adherence = monthlyLogs.length ? Math.round((taken / monthlyLogs.length) * 100) : 0;

    return {
      activeCount: activeMedications.length,
      morning: allTimes.filter(timing => slotLabel(timing) === 'Morning').length,
      afternoon: allTimes.filter(timing => slotLabel(timing) === 'Afternoon').length,
      night: allTimes.filter(timing => slotLabel(timing) === 'Night').length,
      adherence,
      missed: monthlyLogs.filter(log => log.status === 'missed').length,
    };
  }, [activeMedications, doseLogs, dateKey]);

  const markDose = (medicationId: string, timing: string, status: DoseStatus) => {
    setDoseLogs(prev => {
      const remaining = prev.filter(log => !(log.medicationId === medicationId && log.dateKey === dateKey && log.timing === timing));
      return [...remaining, { medicationId, dateKey, timing, status }];
    });
  };

  const resolveDoseStatus = (medicationId: string, timing: string) => {
    return doseLogs.find(log => log.medicationId === medicationId && log.dateKey === dateKey && log.timing === timing)?.status || '';
  };

  return (
    <section id="medications-view" className="view-section active">
      <div className="panel panel-glass mb-4">
        <div className="panel-header border-bottom">
          <div className="panel-title-group">
            <Pill className="color-primary" size={22} />
            <h3>Medications</h3>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-outline btn-sm" onClick={() => { setMedications(emptyMedications); setDoseLogs([]); }}>
              <RotateCcw size={14} style={{ marginRight: '4px' }} /> Reset
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => { localStorage.setItem(MEDICATIONS_KEY, JSON.stringify(medications)); localStorage.setItem(DOSE_LOGS_KEY, JSON.stringify(doseLogs)); }}>
              <Save size={14} style={{ marginRight: '4px' }} /> Save
            </button>
          </div>
        </div>

        <div className="stats-grid">
          <div className="metric-card"><div className="card-header"><div className="icon-wrapper bg-blue"><Pill size={18} /></div><span className="metric-title">Active Medications</span></div><div className="card-value-container"><div className="card-value">{summary.activeCount}</div></div></div>
          <div className="metric-card"><div className="card-header"><div className="icon-wrapper bg-red"><Clock3 size={18} /></div><span className="metric-title">Morning Doses</span></div><div className="card-value-container"><div className="card-value">{summary.morning}</div></div></div>
          <div className="metric-card"><div className="card-header"><div className="icon-wrapper bg-orange"><Clock3 size={18} /></div><span className="metric-title">Afternoon Doses</span></div><div className="card-value-container"><div className="card-value">{summary.afternoon}</div></div></div>
          <div className="metric-card"><div className="card-header"><div className="icon-wrapper bg-green"><TrendingUp size={18} /></div><span className="metric-title">Adherence</span></div><div className="card-value-container"><div className="card-value">{summary.adherence}%</div></div></div>
        </div>

        <div className="dashboard-grid mt-4" style={{ gridTemplateColumns: '1.2fr 0.8fr' }}>
          <div className="panel panel-glass" style={{ boxShadow: 'none' }}>
            <div className="panel-header border-bottom">
              <div className="panel-title-group"><BellRing className="color-primary" size={22} /><h3>Today&apos;s Medicines</h3></div>
            </div>
            <div className="summary-list">
              {scheduledDoses.length === 0 ? (
                <div className="text-muted py-4 text-center">No active medicines scheduled.</div>
              ) : scheduledDoses.map(({ medication, timing }) => {
                const status = resolveDoseStatus(medication.id, timing);
                return (
                  <div key={`${medication.id}-${timing}`} className="summary-item" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="summary-value">{timing} {medication.name} {medication.dosage}</div>
                      <div className="summary-label">{medication.frequency} • {medication.instructions}</div>
                    </div>
                    <div className="d-flex gap-2 flex-wrap justify-end">
                      {(['taken', 'skipped', 'missed'] as DoseStatus[]).map(option => (
                        <button key={option} className={`btn btn-sm ${status === option ? 'btn-primary' : 'btn-outline'}`} onClick={() => markDose(medication.id, timing, option)}>
                          {option.charAt(0).toUpperCase() + option.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="panel panel-glass mt-3" style={{ boxShadow: 'none' }}>
              <div className="panel-title-group mb-2"><CheckCircle2 className="color-success" size={18} /><h3 className="text-sm">Adherence Tracking</h3></div>
              <div className="summary-list">
                <div className="summary-item"><div className="summary-label">Weekly Adherence</div><div className="summary-value">{summary.adherence}%</div></div>
                <div className="summary-item"><div className="summary-label">Monthly Adherence</div><div className="summary-value">{summary.adherence}%</div></div>
                <div className="summary-item"><div className="summary-label">Missed Doses</div><div className="summary-value color-danger">{summary.missed}</div></div>
              </div>
            </div>
          </div>

          <div className="panel panel-glass" style={{ boxShadow: 'none' }}>
            <div className="panel-header border-bottom">
              <div className="panel-title-group"><TrendingUp className="color-blue" size={22} /><h3>Medication Analytics</h3></div>
            </div>
            <div className="summary-list">
              <div className="summary-item"><div className="summary-label">Active Medications</div><div className="summary-value">{summary.activeCount}</div></div>
              <div className="summary-item"><div className="summary-label">Morning Doses</div><div className="summary-value">{summary.morning}</div></div>
              <div className="summary-item"><div className="summary-label">Afternoon Doses</div><div className="summary-value">{summary.afternoon}</div></div>
              <div className="summary-item"><div className="summary-label">Night Doses</div><div className="summary-value">{summary.night}</div></div>
              <div className="summary-item"><div className="summary-label">Adherence</div><div className="summary-value color-success">{summary.adherence}%</div></div>
              <div className="summary-item"><div className="summary-label">Missed Doses</div><div className="summary-value color-danger">{summary.missed} this month</div></div>
            </div>

            <div className="panel panel-glass mt-3" style={{ boxShadow: 'none' }}>
              <div className="panel-title-group mb-2"><Pill className="color-primary" size={18} /><h3 className="text-sm">Medication Cards</h3></div>
              <div className="summary-list">
                {medications.length === 0 ? (
                  <div className="text-muted py-3 text-center">No medications saved yet.</div>
                ) : medications.map(medication => (
                  <div key={medication.id} className="summary-item" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="summary-value">{medication.name}</div>
                      <div className="summary-label">{medication.dosage} • {medication.frequency}</div>
                      <div className="text-secondary text-sm">{medication.instructions}</div>
                      <div className="text-secondary text-sm">Timings: {medication.timings.join(' • ')}</div>
                    </div>
                    <span className={`status-indicator ${medication.active ? 'status-normal' : 'status-neutral'}`}>{medication.active ? 'Active' : 'Inactive'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};