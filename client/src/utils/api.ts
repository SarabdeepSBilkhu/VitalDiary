// VitalDiary API Client Wrapper

const TOKEN_KEY = 'vital_diary_token';
const USER_KEY = 'vital_diary_user';

export interface User {
  id: number;
  email: string;
}

export interface WeightRecord {
  id: string;
  user_id: number;
  timestamp: string;
  value: number;
  notes: string;
}

export interface ProfileRecord {
  name: string;
  age: string;
  gender: string;
  bloodGroup: string;
  height: string;
  allergies: string;
  emergencyContact: string;
}

export interface MedicationRecord {
  id: string;
  name: string;
  timeOfDay: Array<'morning' | 'afternoon' | 'night' | 'sos'>;
  instructions: string;
}

export interface ReportRecord {
  id: string;
  user_id: number;
  timestamp: string;
  report_type: string;
  data: string;
  notes: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getCurrentUser(): User | null {
  const user = localStorage.getItem(USER_KEY);
  if (user) {
    try {
      return JSON.parse(user);
    } catch {
      return null;
    }
  }
  return null;
}

export function setCurrentUser(user: User) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

let dbReadyNotifyTimer: ReturnType<typeof setTimeout> | null = null;

function notifyDbReadyOnce() {
  if (dbReadyNotifyTimer) return;
  dbReadyNotifyTimer = setTimeout(() => {
    window.dispatchEvent(new Event('db-ready'));
    dbReadyNotifyTimer = null;
  }, 50);
}

// Request dispatcher helper with auto-retry for database cold start warming
async function request(url: string, method: string = 'GET', data?: any) {
  const token = getToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    method,
    headers
  };

  if (data) {
    config.body = JSON.stringify(data);
  }

  let response = await fetch(url, config);

  // If database is waking up on Railway, auto-retry transparently
  let attempts = 0;
  const maxAttempts = 15;
  
  if (response.status === 503) {
    let result;
    try {
      // Clone response to read json safely
      result = await response.clone().json();
    } catch {
      result = {};
    }

    while (response.status === 503 && result.status === 'waking_up' && attempts < maxAttempts) {
      attempts++;
      window.dispatchEvent(new CustomEvent('db-waking-up', {
        detail: { attempt: attempts, maxAttempts }
      }));
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      response = await fetch(url, config);
      try {
        result = await response.clone().json();
      } catch {
        result = {};
      }
    }

    if (attempts > 0 && response.ok) {
      notifyDbReadyOnce();
    }
  }

  if (response.status === 401 || response.status === 403) {
    // Session expired or unauthorized
    removeToken();
    window.dispatchEvent(new Event('auth-expired'));
    throw new Error('Authentication expired. Please log in again.');
  }

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `Request failed with status ${response.status}`);
  }

  return result;
}

export const api = {
  // Auth
  async login(email: string, password: string) {
    const res = await request('/api/auth/login', 'POST', { email, password });
    setToken(res.token);
    setCurrentUser(res.user);
    return res.user;
  },

  async register(email: string, password: string) {
    const res = await request('/api/auth/register', 'POST', { email, password });
    setToken(res.token);
    setCurrentUser(res.user);
    return res.user;
  },

  async getMe() {
    return await request('/api/auth/me', 'GET');
  },

  // Vitals CRUD
  async getVitals() {
    return await request('/api/vitals', 'GET');
  },

  async createVitals(data: any) {
    return await request('/api/vitals', 'POST', data);
  },

  async updateVitals(id: string, data: any) {
    return await request(`/api/vitals/${id}`, 'PUT', data);
  },

  async deleteVitals(id: string) {
    return await request(`/api/vitals/${id}`, 'DELETE');
  },

  // Glucose CRUD
  async getGlucose() {
    return await request('/api/glucose', 'GET');
  },

  async createGlucose(data: any) {
    return await request('/api/glucose', 'POST', data);
  },

  async updateGlucose(id: string, data: any) {
    return await request(`/api/glucose/${id}`, 'PUT', data);
  },

  async deleteGlucose(id: string) {
    return await request(`/api/glucose/${id}`, 'DELETE');
  },

  // Weight CRUD
  async getWeight() {
    return await request('/api/weight', 'GET');
  },

  async createWeight(data: any) {
    return await request('/api/weight', 'POST', data);
  },

  async updateWeight(id: string, data: any) {
    return await request(`/api/weight/${id}`, 'PUT', data);
  },

  async deleteWeight(id: string) {
    return await request(`/api/weight/${id}`, 'DELETE');
  },

  // Reports CRUD
  async getReports() {
    return await request('/api/reports', 'GET');
  },

  async createReport(data: any) {
    return await request('/api/reports', 'POST', data);
  },

  async updateReport(id: string, data: any) {
    return await request(`/api/reports/${id}`, 'PUT', data);
  },

  async deleteReport(id: string) {
    return await request(`/api/reports/${id}`, 'DELETE');
  },

  // Profile
  async getProfile(): Promise<ProfileRecord> {
    return await request('/api/profile', 'GET');
  },

  async saveProfile(data: ProfileRecord): Promise<ProfileRecord> {
    return await request('/api/profile', 'PUT', data);
  },

  // Medications
  async getMedications(): Promise<MedicationRecord[]> {
    return await request('/api/medications', 'GET');
  },

  async createMedication(data: MedicationRecord): Promise<MedicationRecord> {
    return await request('/api/medications', 'POST', data);
  },

  async updateMedication(id: string, data: MedicationRecord): Promise<MedicationRecord> {
    return await request(`/api/medications/${id}`, 'PUT', data);
  },

  async deleteMedication(id: string) {
    return await request(`/api/medications/${id}`, 'DELETE');
  }
};
