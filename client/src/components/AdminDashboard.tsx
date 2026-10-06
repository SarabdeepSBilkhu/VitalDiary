import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Loader2, LogOut, Sun, Moon, LayoutDashboard,
  Shield, Activity, Droplets, Weight, FileText, Trash2,
  ChevronRight, BarChart3, UserX, RefreshCw, Eye
} from 'lucide-react';
import { api, getCurrentUser } from '../utils/api';
import { CaregiverPatientView } from './CaregiverPatientView';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';
import type { WeightRecord, ReportRecord } from '../utils/api';
import type { ToastType } from './Toast';

interface AdminDashboardProps {
  showToast: (msg: string, type?: ToastType['type']) => void;
  onPatientSwitched: () => void;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  onLogout: () => void;
}

interface Patient {
  id: number;
  email: string;
  name: string | null;
  age: string | null;
  gender: string | null;
  blood_group: string | null;
  created_at: string;
}

interface AdminStats {
  totalPatients: number;
  totalVitals: number;
  totalGlucose: number;
  totalReports: number;
  recentActivity: { email: string; role: string; action: string; route: string; timestamp: string }[];
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  showToast, onPatientSwitched, theme, setTheme, onLogout
}) => {
  const [activeView, setActiveView] = useState<'overview' | 'patients' | 'patient-detail'>('overview');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Patient health data state
  const [patientVitals, setPatientVitals] = useState<VitalsRecord[]>([]);
  const [patientGlucose, setPatientGlucose] = useState<GlucoseRecord[]>([]);
  const [patientWeights, setPatientWeights] = useState<WeightRecord[]>([]);
  const [patientReports, setPatientReports] = useState<ReportRecord[]>([]);
  const [patientDataLoading, setPatientDataLoading] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);

  const user = getCurrentUser();

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await api.getAdminStats();
      setStats(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch stats', 'danger');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAdminPatients();
      setPatients(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch patients', 'danger');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchPatients();
  }, [fetchStats, fetchPatients]);

  const handleViewPatient = async (patient: Patient) => {
    setSelectedPatient(patient);
    setActiveView('patient-detail');
    setPatientDataLoading(true);
    try {
      const [vitals, glucose, weights, reports] = await Promise.all([
        api.getAdminPatientVitals(patient.id.toString()),
        api.getAdminPatientGlucose(patient.id.toString()),
        api.getAdminPatientWeight(patient.id.toString()),
        api.getAdminPatientReports(patient.id.toString()),
      ]);
      setPatientVitals(vitals);
      setPatientGlucose(glucose);
      setPatientWeights(weights);
      setPatientReports(reports);
    } catch (err: any) {
      showToast(err.message || 'Failed to load patient data', 'danger');
    } finally {
      setPatientDataLoading(false);
    }
  };

  const handleDeleteUser = async (userId: number, userEmail: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete the account for "${userEmail}"? This will remove all their health data.`)) return;
    setDeletingUserId(userId);
    try {
      await api.deleteAdminUser(userId.toString());
      showToast(`Account for ${userEmail} deleted successfully.`, 'success');
      setPatients(prev => prev.filter(p => p.id !== userId));
      if (selectedPatient?.id === userId) {
        setSelectedPatient(null);
        setActiveView('patients');
      }
      fetchStats();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete user', 'danger');
    } finally {
      setDeletingUserId(null);
    }
  };

  const allPatientLogs = [
    ...patientVitals.map(v => ({ ...v, type: 'vitals' })),
    ...patientGlucose.map(g => ({ ...g, type: 'glucose' })),
    ...patientWeights.map(w => ({ ...w, type: 'weight' })),
    ...patientReports.map(r => ({ ...r, type: 'reports' })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const renderOverview = () => (
    <div>
      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {[
          { label: 'Total Patients', value: stats?.totalPatients ?? '–', icon: <Users size={22} />, color: 'hsl(200, 85%, 55%)' },
          { label: 'Vital Readings', value: stats?.totalVitals ?? '–', icon: <Activity size={22} />, color: 'hsl(355, 78%, 56%)' },
          { label: 'Glucose Logs', value: stats?.totalGlucose ?? '–', icon: <Droplets size={22} />, color: 'hsl(35, 90%, 55%)' },
          { label: 'Medical Reports', value: stats?.totalReports ?? '–', icon: <FileText size={22} />, color: 'hsl(150, 80%, 40%)' },
        ].map((stat, i) => (
          <div key={i} className="card" style={{
            padding: '1.5rem',
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '0.75rem',
              background: `${stat.color}22`, display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: stat.color,
              flexShrink: 0
            }}>
              {stat.icon}
            </div>
            <div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1 }}>
                {statsLoading ? <Loader2 size={20} className="animate-spin" /> : stat.value}
              </div>
              <div className="text-secondary text-sm" style={{ marginTop: '0.25rem' }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="card" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart3 size={18} /> Recent Activity
          </h3>
          <button className="btn btn-outline btn-sm" onClick={fetchStats} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
        {statsLoading ? (
          <div className="text-center py-4"><Loader2 size={24} className="animate-spin color-primary" /></div>
        ) : (stats?.recentActivity?.length ?? 0) === 0 ? (
          <p className="text-secondary text-sm text-center py-4">No recent activity.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['User', 'Action', 'Route', 'Time'].map(h => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats?.recentActivity.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', opacity: 0.9 }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{item.email || 'Unknown'}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 600,
                        background: item.action === 'DELETE' ? 'rgba(220, 53, 69, 0.15)' : item.action === 'POST' ? 'rgba(40, 167, 69, 0.15)' : 'rgba(23, 162, 184, 0.15)',
                        color: item.action === 'DELETE' ? 'hsl(355, 78%, 56%)' : item.action === 'POST' ? 'hsl(150, 80%, 40%)' : 'hsl(200, 85%, 55%)',
                      }}>{item.action}</span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>{item.route}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  const renderPatients = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <p className="text-secondary text-sm">{patients.length} patient{patients.length !== 1 ? 's' : ''} registered</p>
        <button className="btn btn-outline btn-sm" onClick={fetchPatients} title="Refresh list" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8"><Loader2 size={32} className="animate-spin color-primary" /></div>
      ) : patients.length === 0 ? (
        <div className="text-center py-8 text-muted">
          <Users size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <p>No patients registered yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {patients.map(p => (
            <div key={p.id} className="card" style={{
              padding: '1rem 1.25rem',
              border: '1px solid var(--border)',
              borderRadius: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              transition: 'border-color 0.2s',
            }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%',
                background: 'rgba(23, 162, 184, 0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'hsl(200, 85%, 55%)', flexShrink: 0
              }}>
                <Users size={18} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name || 'Unnamed Patient'}
                </div>
                <div className="text-secondary text-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.email}
                </div>
                <div className="text-sm" style={{ marginTop: '0.2rem', color: 'var(--text-muted)' }}>
                  {p.age ? `${p.age} yrs` : 'Age N/A'} · {p.gender || 'Gender N/A'} · {p.blood_group || 'Blood N/A'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button
                  className="btn btn-primary btn-sm"
                  id={`btn-view-patient-${p.id}`}
                  onClick={() => handleViewPatient(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Eye size={14} /> View
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  id={`btn-delete-patient-${p.id}`}
                  title="Delete account"
                  disabled={deletingUserId === p.id}
                  onClick={() => handleDeleteUser(p.id, p.email)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {deletingUserId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPatientDetail = () => {
    if (!selectedPatient) return null;

    if (patientDataLoading) {
      return (
        <div className="text-center py-8">
          <Loader2 size={36} className="animate-spin color-primary" />
          <p className="text-secondary mt-3">Loading patient data...</p>
        </div>
      );
    }

    return (
      <CaregiverPatientView
        patientInfo={selectedPatient}
        vitals={patientVitals}
        glucose={patientGlucose}
        weights={patientWeights}
        reports={patientReports}
        allLogs={allPatientLogs}
        healthAlerts={[]}
        userEmail={user?.email || 'Admin'}
        showToast={showToast}
        onOpenLogModal={() => {}}
      />
    );
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={20} /> },
    { id: 'patients', label: 'Patients', icon: <Users size={20} /> },
  ];

  const viewTitle = activeView === 'overview' ? 'Admin Overview'
    : activeView === 'patients' ? 'All Patients'
    : `${selectedPatient?.name || selectedPatient?.email || 'Patient'}'s Health`;

  const viewSubtitle = activeView === 'overview' ? 'System-wide health metrics and activity log'
    : activeView === 'patients' ? 'Manage and view all registered patient accounts'
    : `Viewing full health record for ${selectedPatient?.email}`;

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo-area">
          <div className="logo-icon">
            <Shield size={20} />
          </div>
          <span className="logo-text">Vital<span>Diary</span></span>
        </div>

        <nav className="nav-menu">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              onClick={() => { setActiveView(item.id as any); setSelectedPatient(null); }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}

          {selectedPatient && (
            <button
              className={`nav-item ${activeView === 'patient-detail' ? 'active' : ''}`}
              style={{ marginTop: '0.5rem', paddingLeft: '2rem', fontSize: '0.85rem', borderLeft: '2px solid var(--primary)' }}
              onClick={() => setActiveView('patient-detail')}
            >
              <ChevronRight size={16} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedPatient.name || selectedPatient.email.split('@')[0]}
              </span>
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">
              <Shield size={16} className="color-primary" />
            </div>
            <div className="user-details">
              <span className="user-name">{user?.email.split('@')[0]}</span>
              <span className="user-role" style={{ textTransform: 'capitalize', color: 'hsl(355, 78%, 56%)' }}>
                Admin
              </span>
            </div>
          </div>

          <div className="sidebar-actions">
            <button
              className="btn-action"
              id="theme-toggle"
              title="Toggle Theme"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="btn-action logout-action"
              id="btn-logout"
              title="Sign Out"
              onClick={onLogout}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="app-content">
        <header className="content-header">
          <div className="header-titles">
            <h1 id="view-title">{viewTitle}</h1>
            <p className="text-secondary text-sm">{viewSubtitle}</p>
          </div>

          <div className="header-actions">
            {activeView === 'patient-detail' && selectedPatient && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDeleteUser(selectedPatient.id, selectedPatient.email)}
                disabled={deletingUserId === selectedPatient.id}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {deletingUserId === selectedPatient.id
                  ? <Loader2 size={16} className="animate-spin" />
                  : <UserX size={16} />}
                Delete Account
              </button>
            )}
          </div>
        </header>

        <div className="view-content-wrapper">
          {activeView === 'overview' && renderOverview()}
          {activeView === 'patients' && renderPatients()}
          {activeView === 'patient-detail' && renderPatientDetail()}
        </div>
      </main>
    </div>
  );
};
