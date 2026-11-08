// VitalDiary - Medical range evaluators and interfaces

export interface VitalsRecord {
  id: string;
  timestamp: string;
  systolic?: number | null;
  diastolic?: number | null;
  hr?: number | null;
  spo2: number | null;
  temperature?: number | null;
  temperature_unit?: 'C' | 'F' | null;
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
export function evaluateBP(sys?: number | null, dia?: number | null): EvaluationResult {
  if (sys === null || sys === undefined || dia === null || dia === undefined || isNaN(sys) || isNaN(dia)) {
    return { status: "--", className: "status-neutral" };
  }
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
export function evaluateHR(hr: number | null | undefined): EvaluationResult {
  if (hr === null || hr === undefined || isNaN(hr)) return { status: "--", className: "status-neutral" };
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

/**
 * Parses height string with arbitrary units into meters.
 * Supports:
 * - Metric: "175 cm", "175cm", "1.75 m", "1.75m", "1750 mm"
 * - Imperial: "5'10\"", "5 ft 10 in", "5ft 10in", "5 feet 10 inches", "5' 10", "70 in", "70 inches"
 * - Bare number (defaulted based on magnitude: >= 30 interpreted as cm, < 3 as meters)
 */
export function parseHeightInMeters(heightStr?: string | null): number | null {
  if (!heightStr) return null;
  const raw = heightStr.trim().toLowerCase();
  if (!raw) return null;

  // 1. Check feet and inches notation (e.g., 5'10", 5 ft 10 in, 5' 10, 5ft 10)
  const ftInMatch = raw.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|''|in|inch|inches)?)?$/);
  if (ftInMatch) {
    const feet = parseFloat(ftInMatch[1]);
    const inches = ftInMatch[2] ? parseFloat(ftInMatch[2]) : 0;
    if (isNaN(feet)) return null;
    const totalInches = feet * 12 + inches;
    const meters = totalInches * 0.0254;
    return meters > 0.3 && meters < 3.0 ? meters : null;
  }

  // 2. Inches only (e.g. 68 in, 68", 68 inches)
  const inMatch = raw.match(/^(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)$/);
  if (inMatch) {
    const inches = parseFloat(inMatch[1]);
    const meters = inches * 0.0254;
    return meters > 0.3 && meters < 3.0 ? meters : null;
  }

  // 3. Centimeters (e.g. 175 cm, 175cm)
  const cmMatch = raw.match(/^(\d+(?:\.\d+)?)\s*cm$/);
  if (cmMatch) {
    const cm = parseFloat(cmMatch[1]);
    const meters = cm / 100;
    return meters > 0.3 && meters < 3.0 ? meters : null;
  }

  // 4. Millimeters (e.g. 1750 mm)
  const mmMatch = raw.match(/^(\d+(?:\.\d+)?)\s*mm$/);
  if (mmMatch) {
    const mm = parseFloat(mmMatch[1]);
    const meters = mm / 1000;
    return meters > 0.3 && meters < 3.0 ? meters : null;
  }

  // 5. Meters (e.g. 1.75 m, 1.75m, 1.75 meters)
  const mMatch = raw.match(/^(\d+(?:\.\d+)?)\s*(?:m|meter|meters)$/);
  if (mMatch) {
    const meters = parseFloat(mMatch[1]);
    return meters > 0.3 && meters < 3.0 ? meters : null;
  }

  // 6. Bare number or other formats (e.g. "175", "1.75", "5.8")
  const bareMatch = raw.match(/^(\d+(?:\.\d+)?)$/);
  if (bareMatch) {
    const val = parseFloat(bareMatch[1]);
    if (isNaN(val) || val <= 0) return null;
    if (val >= 30 && val <= 300) {
      // Interpreted as cm
      return val / 100;
    } else if (val > 0.5 && val < 3.0) {
      // Interpreted as meters
      return val;
    }
  }

  return null;
}

/**
 * Calculates normal weight range [minKg, maxKg] according to BMI normal bounds (18.5 - 24.9).
 */
export function calculateNormalWeightRange(heightStr?: string | null): [number, number] | null {
  const heightM = parseHeightInMeters(heightStr);
  if (!heightM || heightM <= 0) return null;
  const minWeight = 18.5 * (heightM * heightM);
  const maxWeight = 24.9 * (heightM * heightM);
  return [parseFloat(minWeight.toFixed(1)), parseFloat(maxWeight.toFixed(1))];
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
