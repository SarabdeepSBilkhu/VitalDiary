import React, { useState, useEffect } from 'react';
import { X, Activity, Thermometer, Weight, FileText, Plus, Trash2 } from 'lucide-react';

const REPORT_TYPE_OPTIONS = ['CBC', 'LFT', 'RFT', 'Lipid Profile', 'Thyroid Profile', 'HbA1c', 'Urine Report', 'Other Reports'];

interface ReportParameter {
  name: string;
  value: string;
  unit: string;
}

const REPORT_TEMPLATES: Record<string, ReportParameter[]> = {
  'CBC': [
    { name: 'RBC', value: '', unit: 'million/µL' },
    { name: 'Haemoglobin', value: '', unit: 'g/dL' },
    { name: 'PCV', value: '', unit: '%' },
    { name: 'MCV', value: '', unit: 'fL' },
    { name: 'MCH', value: '', unit: 'pg' },
    { name: 'MCHC', value: '', unit: 'g/dL' },
    { name: 'RDW (CV)', value: '', unit: '%' },
    { name: 'Platelet Count', value: '', unit: 'lakh/µL' },
    { name: 'TLC', value: '', unit: 'cells/µL' },
    { name: 'Neutrophils', value: '', unit: '%' },
    { name: 'Lymphocytes', value: '', unit: '%' },
    { name: 'Monocytes', value: '', unit: '%' },
    { name: 'Eosinophils', value: '', unit: '%' },
    { name: 'Basophils', value: '', unit: '%' },
    { name: 'Absolute Neutrophils', value: '', unit: 'cells/µL' },
    { name: 'Absolute Lymphocytes', value: '', unit: 'cells/µL' },
    { name: 'Absolute Monocytes', value: '', unit: 'cells/µL' },
    { name: 'Absolute Eosinophils', value: '', unit: 'cells/µL' },
    { name: 'Absolute Basophils', value: '', unit: 'cells/µL' },
    { name: 'ESR', value: '', unit: 'mm/hr' },
  ],
  'LFT': [
    { name: 'Total Bilirubin', value: '', unit: 'mg/dL' },
    { name: 'Direct Bilirubin', value: '', unit: 'mg/dL' },
    { name: 'Indirect Bilirubin', value: '', unit: 'mg/dL' },
    { name: 'SGOT (AST)', value: '', unit: 'U/L' },
    { name: 'SGPT (ALT)', value: '', unit: 'U/L' },
    { name: 'ALP', value: '', unit: 'U/L' },
    { name: 'Total Protein', value: '', unit: 'g/dL' },
    { name: 'Albumin', value: '', unit: 'g/dL' },
    { name: 'Globulin', value: '', unit: 'g/dL' },
    { name: 'A/G Ratio', value: '', unit: '' },
    { name: 'GGT', value: '', unit: 'U/L' },
  ],
  'RFT': [
    { name: 'Blood Urea', value: '', unit: 'mg/dL' },
    { name: 'BUN', value: '', unit: 'mg/dL' },
    { name: 'Creatinine', value: '', unit: 'mg/dL' },
    { name: 'Uric Acid', value: '', unit: 'mg/dL' },
    { name: 'Sodium', value: '', unit: 'mEq/L' },
    { name: 'Potassium', value: '', unit: 'mEq/L' },
    { name: 'Chloride', value: '', unit: 'mEq/L' },
    { name: 'BUN/Creatinine Ratio', value: '', unit: '' },
  ],
  'Lipid Profile': [
    { name: 'Total Cholesterol', value: '', unit: 'mg/dL' },
    { name: 'HDL', value: '', unit: 'mg/dL' },
    { name: 'LDL', value: '', unit: 'mg/dL' },
    { name: 'VLDL', value: '', unit: 'mg/dL' },
    { name: 'Triglycerides', value: '', unit: 'mg/dL' },
    { name: 'Chol/HDL Ratio', value: '', unit: '' },
    { name: 'HDL/LDL Ratio', value: '', unit: '' },
    { name: 'LDL/HDL Ratio', value: '', unit: '' },
  ],
  'Thyroid Profile': [
    { name: 'FT3', value: '', unit: 'pg/mL' },
    { name: 'FT4', value: '', unit: 'ng/dL' },
    { name: 'TSH', value: '', unit: 'mIU/L' },
  ],
  'HbA1c': [
    { name: 'HbA1c', value: '', unit: '%' },
    { name: 'Estimated Average Glucose (eAG)', value: '', unit: 'mg/dL' },
  ],
  'Urine Report': [
    { name: 'Culture', value: '', unit: '' },
    { name: 'Organism Isolated', value: '', unit: '' },
    { name: 'Susceptibility', value: '', unit: '' },
    { name: 'Colour', value: '', unit: '' },
    { name: 'Appearance', value: '', unit: '' },
    { name: 'pH', value: '', unit: '' },
    { name: 'Specific Gravity', value: '', unit: '' },
    { name: 'Protein', value: '', unit: '' },
    { name: 'Leukocyte Esterase', value: '', unit: '' },
    { name: 'Pus Cells', value: '', unit: 'HPF' },
    { name: 'Epithelial Cells', value: '', unit: 'HPF' },
  ],
  'Other Reports': [
    { name: 'hs-CRP', value: '', unit: 'mg/L' },
    { name: 'Iron', value: '', unit: 'µg/dL' },
    { name: 'TIBC', value: '', unit: 'µg/dL' },
    { name: 'Transferrin Saturation', value: '', unit: '%' },
    { name: 'Vitamin D (25-OH)', value: '', unit: 'ng/mL' },
    { name: 'Vitamin B12', value: '', unit: 'pg/mL' },
  ],
};

const parseReportData = (raw: string): ReportParameter[] => {
  if (!raw) return [{ name: '', value: '', unit: '' }];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((p: any) => ({ name: p.name || '', value: p.value || '', unit: p.unit || '' }));
    }
    // Object format fallback
    return Object.entries(parsed).map(([name, value]) => ({ name, value: String(value), unit: '' }));
  } catch {
    // Legacy comma-separated or plain text — put it all in a single custom row
    return [{ name: 'Notes', value: raw, unit: '' }];
  }
};

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
  const [reportParameters, setReportParameters] = useState<ReportParameter[]>(REPORT_TEMPLATES['CBC'].map(p => ({ ...p })));
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
          setReportParameters(parseReportData(logToEdit.data || ''));
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
        setReportParameters(REPORT_TEMPLATES['CBC'].map(p => ({ ...p })));
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

  const handleReportTypeChange = (newType: string) => {
    setReportType(newType);
    // Only auto-fill template if all current params are empty or came from a previous template
    const hasUserData = reportParameters.some(p => p.value.trim() !== '');
    if (!hasUserData) {
      const template = REPORT_TEMPLATES[newType] || [{ name: '', value: '', unit: '' }];
      setReportParameters(template.map(p => ({ ...p })));
    }
  };

  const updateParameter = (index: number, field: keyof ReportParameter, value: string) => {
    setReportParameters(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const addParameter = () => {
    setReportParameters(prev => [...prev, { name: '', value: '', unit: '' }]);
  };

  const removeParameter = (index: number) => {
    setReportParameters(prev => prev.filter((_, i) => i !== index));
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportDate || !reportType) {
      showToast('Please fill out all required fields.', 'warning');
      return;
    }
    const filledParams = reportParameters.filter(p => p.name.trim() !== '' && p.value.trim() !== '');
    if (filledParams.length === 0) {
      showToast('Please enter at least one lab parameter with a value.', 'warning');
      return;
    }

    setLoading(true);
    try {
      await onSaveReport({
        id: logToEdit ? logToEdit.id : undefined,
        timestamp: new Date(reportDate).toISOString(),
        report_type: reportType,
        data: JSON.stringify(filledParams),
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
              <div className="form-group">
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
                  onChange={(e) => handleReportTypeChange(e.target.value)}
                  required
                >
                  {REPORT_TYPE_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Parameter Builder */}
            <div style={{ marginTop: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Lab Parameters *
                </label>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={addParameter}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Plus size={13} /> Add Row
                </button>
              </div>

              <div style={{
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--border-radius-md)',
                overflow: 'hidden',
                background: 'var(--bg-surface-elevated)',
              }}>
                {/* Header Row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '3fr 2fr 2fr auto',
                  gap: '0',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-surface)',
                  borderBottom: '1px solid var(--border-color)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  <span>Parameter / Test Name</span>
                  <span style={{ paddingLeft: '0.5rem' }}>Value</span>
                  <span style={{ paddingLeft: '0.5rem' }}>Unit</span>
                  <span></span>
                </div>

                {/* Parameter Rows */}
                <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  {reportParameters.map((param, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '3fr 2fr 2fr auto',
                        gap: '0',
                        borderBottom: index < reportParameters.length - 1 ? '1px solid var(--border-color)' : 'none',
                        alignItems: 'center',
                      }}
                    >
                      <input
                        type="text"
                        placeholder="e.g. Hemoglobin"
                        value={param.name}
                        onChange={e => updateParameter(index, 'name', e.target.value)}
                        style={{
                          padding: '0.55rem 0.75rem',
                          background: 'transparent',
                          border: 'none',
                          borderRight: '1px solid var(--border-color)',
                          color: 'var(--text-primary)',
                          fontSize: '0.875rem',
                          width: '100%',
                          outline: 'none',
                        }}
                      />
                      <input
                        type="text"
                        placeholder="e.g. 13.5"
                        value={param.value}
                        onChange={e => updateParameter(index, 'value', e.target.value)}
                        style={{
                          padding: '0.55rem 0.75rem',
                          background: 'transparent',
                          border: 'none',
                          borderRight: '1px solid var(--border-color)',
                          color: 'var(--color-primary)',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          width: '100%',
                          outline: 'none',
                        }}
                      />
                      <input
                        type="text"
                        placeholder="e.g. g/dL"
                        value={param.unit}
                        onChange={e => updateParameter(index, 'unit', e.target.value)}
                        style={{
                          padding: '0.55rem 0.75rem',
                          background: 'transparent',
                          border: 'none',
                          borderRight: '1px solid var(--border-color)',
                          color: 'var(--text-muted)',
                          fontSize: '0.8rem',
                          width: '100%',
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => removeParameter(index)}
                        title="Remove row"
                        style={{
                          padding: '0.55rem 0.65rem',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'color 0.2s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-danger)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                Tip: Selecting a report type auto-fills standard parameters. You can edit names, values, units, or add custom rows.
              </p>
            </div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
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
