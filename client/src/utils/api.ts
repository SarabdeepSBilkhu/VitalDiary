// VitalDiary API Client Wrapper

const TOKEN_KEY = 'vital_diary_token';
const USER_KEY = 'vital_diary_user';

export interface User {
  id: number;
  email: string;
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

// Request dispatcher helper
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

  const response = await fetch(url, config);

  if (response.status === 401 || response.status === 403) {
    // Session expired or unauthorized
    removeToken();
    // Dispatch a custom event to alert App component to redirect to login
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
  }
};
