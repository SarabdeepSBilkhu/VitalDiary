import React, { useState, useEffect } from 'react';
import { X, Activity, Thermometer } from 'lucide-react';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';

interface LogModalProps {
  isOpen: boolean;
  onClose: () => void;
  logToEdit: VitalsRecord | GlucoseRecord | null;
  onSaveVitals: (data: any) => Promise<void>;
  onSaveGlucose: (data: any) => Promise<void>;
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
  showToast,
  selectedCalendarDate
}) => {
  const [activeTab, setActiveTab] = useState<'vitals' | 'glucose'>('vitals');
  
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

  const [loading, setLoading] = useState(false);

  // Sync state with logToEdit or default
  useEffect(() => {
    if (isOpen) {
      if (logToEdit) {
        const d = new Date(logToEdit.timestamp);
        const formatted = getLocalISOString(d);

        if ('systolic' in logToEdit) {
          // It's a vitals log
          setActiveTab('vitals');
          setVitalDate(formatted);
          setSystolic(String(logToEdit.systolic));
          setDiastolic(String(logToEdit.diastolic));
          setHr(String(logToEdit.hr));
          setSpo2(logToEdit.spo2 ? String(logToEdit.spo2) : '');
          setVitalNotes(logToEdit.notes || '');
        } else {
          // It's a glucose log
          setActiveTab('glucose');
          setGlucoseDate(formatted);
          setGlucoseValue(String(logToEdit.value));
          setGlucoseContext(logToEdit.context);
          setGlucoseNotes(logToEdit.notes || '');
        }
      } else {
        // Logging a new record
        const defaultDate = selectedCalendarDate ? new Date(selectedCalendarDate) : new Date();
        if (!selectedCalendarDate) {
          // if it's current time, set current hours and minutes
          const now = new Date();
          defaultDate.setHours(now.getHours(), now.getMinutes());
        } else {
          const now = new Date();
          defaultDate.setHours(now.getHours(), now.getMinutes());
        }
        const formatted = getLocalISOString(defaultDate);

        // Reset vitals
        setVitalDate(formatted);
        setSystolic('');
        setDiastolic('');
        setHr('');
        setSpo2('');
        setVitalNotes('');

        // Reset glucose
        setGlucoseDate(formatted);
        setGlucoseValue('');
        setGlucoseContext('post-meal');
        setGlucoseNotes('');
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
          <div className="modal-tabs">
            <button 
              type="button"
              className={`modal-tab ${activeTab === 'vitals' ? 'active' : ''}`}
              onClick={() => setActiveTab('vitals')}
            >
              <Activity size={18} /> Vitals (BP, HR, SpO₂)
            </button>
            <button 
              type="button"
              className={`modal-tab ${activeTab === 'glucose' ? 'active' : ''}`}
              onClick={() => setActiveTab('glucose')}
            >
              <Thermometer size={18} /> Glucose
            </button>
          </div>
        )}

        {activeTab === 'vitals' ? (
          <form onSubmit={handleVitalsSubmit} className="modal-tab-content active">
            <div className="form-grid">
              <div className="form-group grid-col-2">
                <label htmlFor="modal-vital-date">Date & Time *</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input 
                    type="datetime-local" 
                    id="modal-vital-date" 
                    className="form-control"
                    value={vitalDate}
                    onChange={(e) => setVitalDate(e.target.value)}
                    required 
                  />
                </div>
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
        ) : (
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

      </div>
    </div>
  );
};
