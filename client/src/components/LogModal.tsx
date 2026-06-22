import React, { useState, useEffect } from 'react';
import { X, Activity, Thermometer, Weight, FileText } from 'lucide-react';

const REPORT_TYPE_OPTIONS = ['CBC', 'LFT', 'RFT', 'Lipid Profile', 'Thyroid Profile', 'HbA1c', 'Urine Report', 'Other Reports'];

interface LogModalProps {
  isOpen: boolean;
  onClose: () => void;
  logToEdit: any | null;
  onSaveVitals: (data: any) => Promise<void>;
  onSaveGlucose: (data: any) => Promise<void>;
  onSaveWeight: (data: any) => Promise<void>;
  onSaveReport: (data: any) => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'danger' | 'warning' | 'info') => void;
  selectedCalendarDate: Date | null;
}

const getLocalISOString = (date: Date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - (offset * 60 * 1000)).toISOString().slice(0, 16);
};

export const LogModal: React.FC<LogModalProps> = ({
  isOpen,
  onClose,
  logToEdit,
  onSaveVitals,
  onSaveGlucose,
  onSaveWeight,
  onSaveReport,
  showToast,
  selectedCalendarDate
}) => {
  const [activeTab, setActiveTab] = useState<'vitals' | 'glucose' | 'weight' | 'reports'>('vitals');
  
  // Vitals State
  const [vitalDate, setVitalDate] = useState('');
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [hr, setHr] = useState('');
  const [spo2, setSpo2] = useState('');
  const [vitalNotes, setVitalNotes] = useState('');

  // Glucose State
  const [glucoseDate, setGlucoseDate] = useState('');
  const [glucoseValue, setGlucoseValue] = useState('');
  const [glucoseContext, setGlucoseContext] = useState<'fasting' | 'pre-meal' | 'post-meal'>('post-meal');
  const [glucoseNotes, setGlucoseNotes] = useState('');

  // Weight State
  const [weightDate, setWeightDate] = useState('');
  const [weightValue, setWeightValue] = useState('');
  const [weightNotes, setWeightNotes] = useState('');

  // Medical Reports State
  const [reportDate, setReportDate] = useState('');
  const [reportType, setReportType] = useState('CBC');
  const [reportData, setReportData] = useState('');
  const [reportNotes, setReportNotes] = useState('');

  const [loading, setLoading] = useState(false);

  // Sync state with logToEdit or default
  useEffect(() => {
    if (isOpen) {
      if (logToEdit) {
        const d = new Date(logToEdit.timestamp);
        const formatted = getLocalISOString(d);

        if ('systolic' in logToEdit) {
          // Vitals
          setActiveTab('vitals');
          setVitalDate(formatted);
          setSystolic(String(logToEdit.systolic));
          setDiastolic(String(logToEdit.diastolic));
          setHr(String(logToEdit.hr));
          setSpo2(logToEdit.spo2 ? String(logToEdit.spo2) : '');
          setVitalNotes(logToEdit.notes || '');
        } else if ('context' in logToEdit) {
          // Glucose
          setActiveTab('glucose');
          setGlucoseDate(formatted);
          setGlucoseValue(String(logToEdit.value));
          setGlucoseContext(logToEdit.context);
          setGlucoseNotes(logToEdit.notes || '');
        } else if ('report_type' in logToEdit) {
          // Medical Reports
          setActiveTab('reports');
          setReportDate(formatted);
          setReportType(logToEdit.report_type);
          setReportData(logToEdit.data || '');
          setReportNotes(logToEdit.notes || '');
        } else {
          // Weight
          setActiveTab('weight');
          setWeightDate(formatted);
          setWeightValue(String(logToEdit.value));
          setWeightNotes(logToEdit.notes || '');
        }
      } else {
        // Logging a new record
        const defaultDate = selectedCalendarDate ? new Date(selectedCalendarDate) : new Date();
        const now = new Date();
        defaultDate.setHours(now.getHours(), now.getMinutes());
        const formatted = getLocalISOString(defaultDate);

        // Reset all forms
        setVitalDate(formatted);
        setSystolic('');
        setDiastolic('');
        setHr('');
        setSpo2('');
        setVitalNotes('');

        setGlucoseDate(formatted);
        setGlucoseValue('');
        setGlucoseContext('post-meal');
        setGlucoseNotes('');

        setWeightDate(formatted);
        setWeightValue('');
        setWeightNotes('');

        setReportDate(formatted);
        setReportType('CBC');
        setReportData('');
        setReportNotes('');
      }
    }
  }, [isOpen, logToEdit, selectedCalendarDate]);

  if (!isOpen) return null;

  const handleVitalsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vitalDate || !systolic || !diastolic || !hr) {
      showToast('Please fill out all required fields.', 'warning');
      return;
    }

    const sysNum = parseInt(systolic);
    const diaNum = parseInt(diastolic);
    const hrNum = parseInt(hr);
    const spo2Num = spo2 ? parseInt(spo2) : null;

    if (sysNum < 50 || sysNum > 250 || diaNum < 30 || diaNum > 180) {
      showToast('Please enter blood pressure within physiological limits (Systolic: 50-250, Diastolic: 30-180).', 'warning');
      return;
    }
    if (hrNum < 30 || hrNum > 220) {
      showToast('Please enter a valid heart rate (30-220 bpm).', 'warning');
      return;
    }
    if (spo2Num !== null && (spo2Num < 50 || spo2Num > 100)) {
      showToast('Please enter a valid SpO2 percentage (50-100%).', 'warning');
      return;
    }

    setLoading(true);
    try {
      await onSaveVitals({
        id: logToEdit ? logToEdit.id : undefined,
        timestamp: new Date(vitalDate).toISOString(),
        systolic: sysNum,
        diastolic: diaNum,
        hr: hrNum,
        spo2: spo2Num,
        notes: vitalNotes
      });
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Error saving vital records.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleGlucoseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!glucoseDate || !glucoseValue || !glucoseContext) {
      showToast('Please fill out all required fields.', 'warning');
      return;
    }

    const valueNum = parseInt(glucoseValue);
    if (valueNum < 20 || valueNum > 600) {
      showToast('Please enter a realistic blood glucose level (20-600 mg/dL).', 'warning');
      return;
    }

    setLoading(true);
    try {
      await onSaveGlucose({
        id: logToEdit ? logToEdit.id : undefined,
        timestamp: new Date(glucoseDate).toISOString(),
        value: valueNum,
        context: glucoseContext,
        notes: glucoseNotes
      });
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Error saving glucose records.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleWeightSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weightDate || !weightValue) {
      showToast('Please fill out all required fields.', 'warning');
      return;
    }

    const valueNum = parseFloat(weightValue);
    if (valueNum < 5 || valueNum > 500) {
      showToast('Please enter a realistic weight value (5-500).', 'warning');
      return;
    }

    setLoading(true);
    try {
      await onSaveWeight({
        id: logToEdit ? logToEdit.id : undefined,
        timestamp: new Date(weightDate).toISOString(),
        value: valueNum,
        notes: weightNotes
      });
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Error saving weight records.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportDate || !reportType || !reportData) {
      showToast('Please fill out all required fields.', 'warning');
      return;
    }

    setLoading(true);
    try {
      await onSaveReport({
        id: logToEdit ? logToEdit.id : undefined,
        timestamp: new Date(reportDate).toISOString(),
        report_type: reportType,
        data: reportData,
        notes: reportNotes
      });
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Error saving medical report.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        
        <div className="modal-header">
          <h3>{logToEdit ? 'Edit Health Record' : 'Log New Health Reading'}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Show tabs only when logging new, disable tab switching when editing */}
        {!logToEdit && (
          <div className="modal-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            <button 
              type="button"
              className={`modal-tab ${activeTab === 'vitals' ? 'active' : ''}`}
              onClick={() => setActiveTab('vitals')}
            >
              <Activity size={16} /> Vitals
            </button>
            <button 
              type="button"
              className={`modal-tab ${activeTab === 'glucose' ? 'active' : ''}`}
              onClick={() => setActiveTab('glucose')}
            >
              <Thermometer size={16} /> Glucose
            </button>
            <button 
              type="button"
              className={`modal-tab ${activeTab === 'weight' ? 'active' : ''}`}
              onClick={() => setActiveTab('weight')}
            >
              <Weight size={16} /> Weight
            </button>
            <button 
              type="button"
              className={`modal-tab ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => setActiveTab('reports')}
            >
              <FileText size={16} /> Medical Report
            </button>
          </div>
        )}

        {activeTab === 'vitals' && (
          <form onSubmit={handleVitalsSubmit} className="modal-tab-content active">
            <div className="form-grid">
              <div className="form-group grid-col-2">
                <label htmlFor="modal-vital-date">Date & Time *</label>
                <input 
                  type="datetime-local" 
                  id="modal-vital-date" 
                  className="form-control"
                  value={vitalDate}
                  onChange={(e) => setVitalDate(e.target.value)}
                  required 
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="modal-vital-systolic">Systolic (BP High) *</label>
                <div className="input-unit-wrapper">
                  <input 
                    type="number" 
                    id="modal-vital-systolic" 
                    min="50" 
                    max="250" 
                    placeholder="e.g. 120" 
                    className="form-control"
                    value={systolic}
                    onChange={(e) => setSystolic(e.target.value)}
                    required 
                  />
                  <span className="input-unit">mmHg</span>
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="modal-vital-diastolic">Diastolic (BP Low) *</label>
                <div className="input-unit-wrapper">
                  <input 
                    type="number" 
                    id="modal-vital-diastolic" 
                    min="30" 
                    max="180" 
                    placeholder="e.g. 80" 
                    className="form-control"
                    value={diastolic}
                    onChange={(e) => setDiastolic(e.target.value)}
                    required 
                  />
                  <span className="input-unit">mmHg</span>
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="modal-vital-hr">Heart Rate *</label>
                <div className="input-unit-wrapper">
                  <input 
                    type="number" 
                    id="modal-vital-hr" 
                    min="30" 
                    max="220" 
                    placeholder="e.g. 72" 
                    className="form-control"
                    value={hr}
                    onChange={(e) => setHr(e.target.value)}
                    required 
                  />
                  <span className="input-unit">bpm</span>
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="modal-vital-spo2">Oxygen Saturation (SpO₂)</label>
                <div className="input-unit-wrapper">
                  <input 
                    type="number" 
                    id="modal-vital-spo2" 
                    min="50" 
                    max="100" 
                    placeholder="e.g. 98" 
                    className="form-control"
                    value={spo2}
                    onChange={(e) => setSpo2(e.target.value)}
                  />
                  <span className="input-unit">%</span>
                </div>
              </div>
              
              <div className="form-group grid-col-2">
                <label htmlFor="modal-vital-notes">Notes / Observations</label>
                <textarea 
                  id="modal-vital-notes" 
                  rows={2} 
                  className="form-control" 
                  placeholder="Feeling dizzy, post-workout, coffee consumed, etc."
                  value={vitalNotes}
                  onChange={(e) => setVitalNotes(e.target.value)}
                ></textarea>
              </div>
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : 'Save Reading'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'glucose' && (
          <form onSubmit={handleGlucoseSubmit} className="modal-tab-content active">
            <div className="form-grid">
              <div className="form-group grid-col-2">
                <label htmlFor="modal-glucose-date">Date & Time *</label>
                <input 
                  type="datetime-local" 
                  id="modal-glucose-date" 
                  className="form-control"
                  value={glucoseDate}
                  onChange={(e) => setGlucoseDate(e.target.value)}
                  required 
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="modal-glucose-value">Blood Glucose Level *</label>
                <div className="input-unit-wrapper">
                  <input 
                    type="number" 
                    id="modal-glucose-value" 
                    min="20" 
                    max="600" 
                    placeholder="e.g. 105" 
                    className="form-control"
                    value={glucoseValue}
                    onChange={(e) => setGlucoseValue(e.target.value)}
                    required 
                  />
                  <span className="input-unit">mg/dL</span>
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="modal-glucose-context">Measurement Time *</label>
                <select 
                  id="modal-glucose-context" 
                  className="form-control"
                  value={glucoseContext}
                  onChange={(e) => setGlucoseContext(e.target.value as any)}
                  required
                >
                  <option value="fasting">Fasting</option>
                  <option value="pre-meal">Pre-Meal (Before food)</option>
                  <option value="post-meal">Post-Meal (After food)</option>
                </select>
              </div>
              
              <div className="form-group grid-col-2">
                <label htmlFor="modal-glucose-notes">Notes / Diet / Medication</label>
                <textarea 
                  id="modal-glucose-notes" 
                  rows={3} 
                  className="form-control" 
                  placeholder="Had sweet dessert, taken insulin, etc."
                  value={glucoseNotes}
                  onChange={(e) => setGlucoseNotes(e.target.value)}
                ></textarea>
              </div>
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : 'Save Glucose'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'weight' && (
          <form onSubmit={handleWeightSubmit} className="modal-tab-content active">
            <div className="form-grid">
              <div className="form-group grid-col-2">
                <label htmlFor="modal-weight-date">Date & Time *</label>
                <input 
                  type="datetime-local" 
                  id="modal-weight-date" 
                  className="form-control"
                  value={weightDate}
                  onChange={(e) => setWeightDate(e.target.value)}
                  required 
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="modal-weight-value">Weight *</label>
                <div className="input-unit-wrapper">
                  <input 
                    type="number" 
                    step="0.1"
                    id="modal-weight-value" 
                    min="5" 
                    max="500" 
                    placeholder="e.g. 74.5" 
                    className="form-control"
                    value={weightValue}
                    onChange={(e) => setWeightValue(e.target.value)}
                    required 
                  />
                  <span className="input-unit">kg</span>
                </div>
              </div>

              <div className="form-group grid-col-2">
                <label htmlFor="modal-weight-notes">Notes / Scale context</label>
                <textarea 
                  id="modal-weight-notes" 
                  rows={2} 
                  className="form-control" 
                  placeholder="Morning empty stomach, post-workout, clothed, etc."
                  value={weightNotes}
                  onChange={(e) => setWeightNotes(e.target.value)}
                ></textarea>
              </div>
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : 'Save Weight'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'reports' && (
          <form onSubmit={handleReportSubmit} className="modal-tab-content active">
            <div className="form-grid">
              <div className="form-group grid-col-2">
                <label htmlFor="modal-report-date">Date & Time *</label>
                <input 
                  type="datetime-local" 
                  id="modal-report-date" 
                  className="form-control"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group">
                <label htmlFor="modal-report-type">Report Type *</label>
                <select 
                  id="modal-report-type" 
                  className="form-control"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  required
                >
                  {REPORT_TYPE_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div className="form-group grid-col-2">
                <label htmlFor="modal-report-data">Lab Results / Reference Ranges *</label>
                <textarea 
                  id="modal-report-data" 
                  rows={4} 
                  className="form-control font-monospace" 
                  placeholder="Manually type details (e.g. Hb: 13.5, Cholesterol: 190, Creatinine: 0.9)"
                  value={reportData}
                  onChange={(e) => setReportData(e.target.value)}
                  required
                ></textarea>
              </div>

              <div className="form-group grid-col-2">
                <label htmlFor="modal-report-notes">Doctor / Facility / Notes</label>
                <textarea 
                  id="modal-report-notes" 
                  rows={2} 
                  className="form-control" 
                  placeholder="Prescribed by Dr. Smith, City Clinic"
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                ></textarea>
              </div>
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : 'Save Report'}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
