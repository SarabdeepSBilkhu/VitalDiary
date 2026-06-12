import React, { useState } from 'react';
import { HeartPulse, Lock, Mail, Loader2 } from 'lucide-react';
import { api } from '../utils/api';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
  onNavigateToRegister: () => void;
  showToast: (msg: string, type?: 'success' | 'danger' | 'warning' | 'info') => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, onNavigateToRegister, showToast }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Please fill out all fields.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const user = await api.login(email, password);
      showToast(`Welcome back, ${user.email}!`, 'success');
      onLoginSuccess(user);
    } catch (err: any) {
      showToast(err.message || 'Login failed. Please check credentials.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card panel panel-glass">
        <div className="logo-area justify-center mb-4">
          <div className="logo-icon">
            <HeartPulse size={24} />
          </div>
          <span className="logo-text">Vital<span>Diary</span></span>
        </div>
        
        <div className="auth-header text-center mb-4">
          <h2>Secure Login</h2>
          <p className="text-secondary text-sm">Access your digital health logs securely from any device.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group mb-4">
            <label htmlFor="login-email">Email Address</label>
            <div className="input-unit-wrapper">
              <input
                id="login-email"
                type="email"
                className="form-control"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ paddingLeft: '2.75rem' }}
              />
              <span style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }}>
                <Mail size={18} />
              </span>
            </div>
          </div>

          <div className="form-group mb-4">
            <label htmlFor="login-password">Password</label>
            <div className="input-unit-wrapper">
              <input
                id="login-password"
                type="password"
                className="form-control"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingLeft: '2.75rem' }}
              />
              <span style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }}>
                <Lock size={18} />
              </span>
            </div>
          </div>

          <button type="submit" className="btn btn-primary w-100 py-3 mb-4" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Logging in...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        <div className="auth-footer text-center">
          <p className="text-secondary text-sm">
            Don't have an account?{' '}
            <button className="btn-text btn-sm" onClick={onNavigateToRegister}>
              Create Account
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
