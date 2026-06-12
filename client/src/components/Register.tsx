import React, { useState } from 'react';
import { HeartPulse, Lock, Mail, Loader2 } from 'lucide-react';
import { api } from '../utils/api';

interface RegisterProps {
  onRegisterSuccess: (user: any) => void;
  onNavigateToLogin: () => void;
  showToast: (msg: string, type?: 'success' | 'danger' | 'warning' | 'info') => void;
}

export const Register: React.FC<RegisterProps> = ({ onRegisterSuccess, onNavigateToLogin, showToast }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) {
      showToast('Please fill out all fields.', 'warning');
      return;
    }

    if (password !== confirmPassword) {
      showToast('Passwords do not match.', 'danger');
      return;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters long.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const user = await api.register(email, password);
      showToast(`Welcome, account created for ${user.email}!`, 'success');
      onRegisterSuccess(user);
    } catch (err: any) {
      showToast(err.message || 'Registration failed. Try a different email.', 'danger');
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
          <h2>Create Account</h2>
          <p className="text-secondary text-sm">Create a free account to track your health vitals securely.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group mb-4">
            <label htmlFor="register-email">Email Address</label>
            <div className="input-unit-wrapper">
              <input
                id="register-email"
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
            <label htmlFor="register-password">Password</label>
            <div className="input-unit-wrapper">
              <input
                id="register-password"
                type="password"
                className="form-control"
                placeholder="Minimum 6 characters"
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

          <div className="form-group mb-4">
            <label htmlFor="register-confirm-password">Confirm Password</label>
            <div className="input-unit-wrapper">
              <input
                id="register-confirm-password"
                type="password"
                className="form-control"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                <span>Creating account...</span>
              </>
            ) : (
              <span>Sign Up</span>
            )}
          </button>
        </form>

        <div className="auth-footer text-center">
          <p className="text-secondary text-sm">
            Already have an account?{' '}
            <button className="btn-text btn-sm" onClick={onNavigateToLogin}>
              Sign In
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
