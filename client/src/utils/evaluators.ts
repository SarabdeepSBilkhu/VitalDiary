// VitalDiary - Medical range evaluators and interfaces

export interface VitalsRecord {
  id: string;
  timestamp: string;
  systolic: number;
  diastolic: number;
  hr: number;
  spo2: number | null;
  notes: string;
}

export interface GlucoseRecord {
  id: string;
  timestamp: string;
  value: number;
  context: 'fasting' | 'pre-meal' | 'post-meal';
  notes: string;
}

export interface EvaluationResult {
  status: string;
  className: string;
}

// Blood Pressure Evaluator (AHA Guidelines)
export function evaluateBP(sys: number, dia: number): EvaluationResult {
  if (sys > 180 || dia > 120) {
    return { status: "Crisis", className: "status-high" };
  } else if (sys >= 140 || dia >= 90) {
    return { status: "Stage 2", className: "status-high" };
  } else if ((sys >= 130 && sys <= 139) || (dia >= 80 && dia <= 89)) {
    return { status: "Stage 1", className: "status-high" };
  } else if (sys >= 120 && sys < 130 && dia < 80) {
    return { status: "Elevated", className: "status-elevated" };
  } else if (sys < 120 && dia < 80) {
    return { status: "Normal", className: "status-normal" };
  }
  return { status: "Borderline", className: "status-elevated" };
}

// Heart Rate Evaluator
export function evaluateHR(hr: number): EvaluationResult {
  if (hr > 100) return { status: "High", className: "status-high" };
  if (hr < 60) return { status: "Low", className: "status-low" };
  return { status: "Normal", className: "status-normal" };
}

// Oxygen SpO2 Evaluator
export function evaluateSpO2(spo2: number | null): EvaluationResult {
  if (spo2 === null || spo2 === undefined) return { status: "--", className: "status-neutral" };
  if (spo2 >= 95) return { status: "Normal", className: "status-normal" };
  if (spo2 >= 90 && spo2 < 95) return { status: "Low", className: "status-elevated" };
  return { status: "Critical", className: "status-high" };
}

// Blood Glucose Evaluator (ADA Guidelines)
export function evaluateGlucose(val: number, context: 'fasting' | 'pre-meal' | 'post-meal'): EvaluationResult {
  if (context === 'fasting') {
    if (val >= 126) return { status: "Diabetes", className: "status-high" };
    if (val >= 100 && val < 126) return { status: "Pre-Diabetes", className: "status-elevated" };
    if (val >= 70 && val < 100) return { status: "Normal", className: "status-normal" };
    return { status: "Hypoglycemia", className: "status-low" };
  } else if (context === 'pre-meal') {
    if (val > 130) return { status: "High", className: "status-high" };
    if (val >= 70 && val <= 130) return { status: "Normal", className: "status-normal" };
    return { status: "Hypoglycemia", className: "status-low" };
  } else { // post-meal
    if (val >= 200) return { status: "Diabetes", className: "status-high" };
    if (val >= 140 && val < 200) return { status: "Pre-Diabetes", className: "status-elevated" };
    if (val >= 70 && val < 140) return { status: "Normal", className: "status-normal" };
    return { status: "Hypoglycemia", className: "status-low" };
  }
}

// Formatter Helpers
export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "--";
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

export function formatDateLabel(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
