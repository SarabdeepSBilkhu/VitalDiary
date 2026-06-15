import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarCheck, Plus, Activity, Thermometer, Edit3, Trash2, Weight, FileText } from 'lucide-react';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';
import type { WeightRecord, ReportRecord } from '../utils/api';
import { evaluateBP, evaluateGlucose } from '../utils/evaluators';

interface CalendarViewProps {
  vitals: VitalsRecord[];
  glucose: GlucoseRecord[];
  weights: WeightRecord[];
  reports: ReportRecord[];
  allLogs: any[];
  onOpenLogModal: (log?: any, defaultDate?: Date) => void;
  onDeleteLog: (id: string, type: 'vitals' | 'glucose' | 'weight' | 'reports') => void;
}

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const CalendarView: React.FC<CalendarViewProps> = ({
  vitals,
  glucose,
  weights,
  reports,
  allLogs,
  onOpenLogModal,
  onDeleteLog
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // 1. Generate Days for rendering
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    
    // Fill offset slots
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ day: null, date: null });
    }

    // Fill actual month days
    for (let day = 1; day <= lastDay; day++) {
      const d = new Date(year, month, day);
      days.push({ day, date: d });
    }

    return days;
  }, [year, month]);

  // 2. Fetch logs for currently selected date
  const selectedDateLogs = useMemo(() => {
    const dateStr = selectedDate.toLocaleDateString();
    const dayLogs = allLogs.filter(log => {
      return new Date(log.timestamp).toLocaleDateString() === dateStr;
    });

    // Sort descending by time
    return dayLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [selectedDate, allLogs]);

  // 3. Navigation controls
  const handlePrevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const isToday = (d: Date) => {
    const today = new Date();
    return d.getDate() === today.getDate() && 
           d.getMonth() === today.getMonth() && 
           d.getFullYear() === today.getFullYear();
  };

  const isSelected = (d: Date) => {
    return d.toDateString() === selectedDate.toDateString();
  };

  // Check if a date has BP, Glucose, Weight or Report logs
  const getDateIndicators = (d: Date) => {
    const dateStr = d.toLocaleDateString();
    const hasBP = vitals.some(log => new Date(log.timestamp).toLocaleDateString() === dateStr);
    const hasGlucose = glucose.some(log => new Date(log.timestamp).toLocaleDateString() === dateStr);
    const hasWeight = weights.some(log => new Date(log.timestamp).toLocaleDateString() === dateStr);
    const hasReport = reports.some(log => new Date(log.timestamp).toLocaleDateString() === dateStr);
    return { hasBP, hasGlucose, hasWeight, hasReport };
  };

  return (
    <section id="calendar-view" className="view-section active">
      <div className="calendar-layout">
        
        {/* Interactive Calendar Card */}
        <div className="panel panel-glass calendar-card">
          <div className="calendar-header-nav">
            <button className="btn btn-icon btn-sm" onClick={handlePrevMonth}>
              <ChevronLeft size={16} />
            </button>
            <h3>{monthNames[month]} {year}</h3>
            <button className="btn btn-icon btn-sm" onClick={handleNextMonth}>
              <ChevronRight size={16} />
            </button>
          </div>
          
          <div className="calendar-weekdays">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>
          
          <div className="calendar-days">
            {calendarDays.map((cell, idx) => {
              if (cell.day === null || cell.date === null) {
                return <div key={`empty-${idx}`} className="calendar-day empty-day" />;
              }

              const { hasBP, hasGlucose, hasWeight, hasReport } = getDateIndicators(cell.date);
              const activeClasses = [];
              if (isToday(cell.date)) activeClasses.push('today');
              if (isSelected(cell.date)) activeClasses.push('selected');

              return (
                <div 
                  key={`day-${cell.day}`} 
                  className={`calendar-day ${activeClasses.join(' ')}`}
                  onClick={() => setSelectedDate(cell.date as Date)}
                >
                  <span className="day-number">{cell.day}</span>
                  
                  {(hasBP || hasGlucose || hasWeight || hasReport) && (
                    <div className="day-indicators">
                      {hasBP && <span className="day-dot bp-dot" title="Vitals logged" />}
                      {hasGlucose && <span className="day-dot glucose-dot" title="Glucose logged" />}
                      {hasWeight && <span className="day-dot weight-dot" style={{ backgroundColor: 'hsl(150, 80%, 40%)' }} title="Weight logged" />}
                      {hasReport && <span className="day-dot report-dot" style={{ backgroundColor: 'hsl(30, 90%, 50%)' }} title="Report saved" />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Side details for selected date */}
        <div className="panel panel-glass selected-date-details">
          <div className="panel-header border-bottom">
            <div className="panel-title-group">
              <CalendarCheck className="color-primary" size={22} />
              <h3>
                {selectedDate.toLocaleDateString('en-US', { 
                  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
                })}
              </h3>
            </div>
          </div>

          <div className="selected-date-content">
            <div id="selected-date-logs-container">
              {selectedDateLogs.length === 0 ? (
                <p className="text-muted text-center py-4">No records logged on this date.</p>
              ) : (
                selectedDateLogs.map(log => {
                  const logType = log.type;
                  
                  if (logType === 'vitals') {
                    const vitalLog = log as VitalsRecord;
                    const bpEval = evaluateBP(vitalLog.systolic, vitalLog.diastolic);
                    return (
                      <div key={log.id} className="calendar-detail-card">
                        <div className="calendar-detail-header">
                          <span className="badge bg-red">
                            <Activity size={12} style={{ marginRight: '4px' }} /> Vitals
                          </span>
                          <span className="calendar-detail-time">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="calendar-detail-values">
                          BP: {vitalLog.systolic}/{vitalLog.diastolic} mmHg | HR: {vitalLog.hr} bpm
                        </div>
                        <div className="text-sm text-secondary">
                          SpO₂: {vitalLog.spo2 || '--'}% | BP Status:{' '}
                          <span className={`status-indicator ${bpEval.className}`}>{bpEval.status}</span>
                        </div>
                        {vitalLog.notes && (
                          <div className="text-sm text-muted mt-2 border-top pt-2 italic">
                            Notes: "{vitalLog.notes}"
                          </div>
                        )}
                        <div className="d-flex justify-between align-center mt-2 border-top pt-2">
                          <span className="text-xs text-muted">ID: {vitalLog.id.substring(0, 8)}</span>
                          <div className="action-buttons">
                            <button 
                              className="btn-table-action edit-action btn-sm" 
                              title="Edit Entry"
                              onClick={() => onOpenLogModal(log)}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button 
                              className="btn-table-action delete-action btn-sm" 
                              title="Delete Entry"
                              onClick={() => onDeleteLog(log.id, 'vitals')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  } else if (logType === 'glucose') {
                    const glucoseLog = log as GlucoseRecord;
                    const glEval = evaluateGlucose(glucoseLog.value, glucoseLog.context);
                    return (
                      <div key={log.id} className="calendar-detail-card">
                        <div className="calendar-detail-header">
                          <span className="badge bg-purple">
                            <Thermometer size={12} style={{ marginRight: '4px' }} /> Glucose
                          </span>
                          <span className="calendar-detail-time">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="calendar-detail-values">
                          Value: {glucoseLog.value} mg/dL
                        </div>
                        <div className="text-sm text-secondary">
                          Timeframe: <span className="capitalize font-semibold">{glucoseLog.context}</span> | Status:{' '}
                          <span className={`status-indicator ${glEval.className}`}>{glEval.status}</span>
                        </div>
                        {glucoseLog.notes && (
                          <div className="text-sm text-muted mt-2 border-top pt-2 italic">
                            Notes: "{glucoseLog.notes}"
                          </div>
                        )}
                        <div className="d-flex justify-between align-center mt-2 border-top pt-2">
                          <span className="text-xs text-muted">ID: {glucoseLog.id.substring(0, 8)}</span>
                          <div className="action-buttons">
                            <button 
                              className="btn-table-action edit-action btn-sm" 
                              title="Edit Entry"
                              onClick={() => onOpenLogModal(log)}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button 
                              className="btn-table-action delete-action btn-sm" 
                              title="Delete Entry"
                              onClick={() => onDeleteLog(log.id, 'glucose')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  } else if (logType === 'weight') {
                    const weightLog = log as WeightRecord;
                    return (
                      <div key={log.id} className="calendar-detail-card">
                        <div className="calendar-detail-header">
                          <span className="badge bg-green" style={{ backgroundColor: 'hsla(150, 80%, 40%, 0.15)', color: 'hsl(150, 80%, 40%)' }}>
                            <Weight size={12} style={{ marginRight: '4px' }} /> Weight
                          </span>
                          <span className="calendar-detail-time">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="calendar-detail-values">
                          Weight: {weightLog.value} kg
                        </div>
                        {weightLog.notes && (
                          <div className="text-sm text-muted mt-2 border-top pt-2 italic">
                            Notes: "{weightLog.notes}"
                          </div>
                        )}
                        <div className="d-flex justify-between align-center mt-2 border-top pt-2">
                          <span className="text-xs text-muted">ID: {weightLog.id.substring(0, 8)}</span>
                          <div className="action-buttons">
                            <button 
                              className="btn-table-action edit-action btn-sm" 
                              title="Edit Entry"
                              onClick={() => onOpenLogModal(log)}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button 
                              className="btn-table-action delete-action btn-sm" 
                              title="Delete Entry"
                              onClick={() => onDeleteLog(log.id, 'weight')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    const reportLog = log as ReportRecord;
                    return (
                      <div key={log.id} className="calendar-detail-card">
                        <div className="calendar-detail-header">
                          <span className="badge bg-orange" style={{ backgroundColor: 'hsla(30, 90%, 50%, 0.15)', color: 'hsl(30, 90%, 50%)' }}>
                            <FileText size={12} style={{ marginRight: '4px' }} /> Report ({reportLog.report_type})
                          </span>
                          <span className="calendar-detail-time">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="calendar-detail-values" style={{ fontWeight: 600 }}>
                          {reportLog.title}
                        </div>
                        {reportLog.data && (
                          <div className="text-sm text-secondary mt-1 font-monospace" style={{ whiteSpace: 'pre-wrap', padding: '0.25rem', background: 'rgba(0,0,0,0.05)', borderRadius: '4px' }}>
                            {reportLog.data}
                          </div>
                        )}
                        {reportLog.notes && (
                          <div className="text-sm text-muted mt-2 border-top pt-2 italic">
                            Notes: "{reportLog.notes}"
                          </div>
                        )}
                        <div className="d-flex justify-between align-center mt-2 border-top pt-2">
                          <span className="text-xs text-muted">ID: {reportLog.id.substring(0, 8)}</span>
                          <div className="action-buttons">
                            <button 
                              className="btn-table-action edit-action btn-sm" 
                              title="Edit Entry"
                              onClick={() => onOpenLogModal(log)}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button 
                              className="btn-table-action delete-action btn-sm" 
                              title="Delete Entry"
                              onClick={() => onDeleteLog(log.id, 'reports')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                })
              )}
            </div>
            
            <div className="selected-date-actions">
              <button 
                className="btn btn-primary w-100" 
                onClick={() => onOpenLogModal(null, selectedDate)}
              >
                <Plus size={16} /> Add Log For This Date
              </button>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
