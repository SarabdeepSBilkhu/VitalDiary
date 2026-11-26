import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Loader2, LogOut, Sun, Moon, LayoutDashboard,
  Shield, Activity, Droplets, FileText, Trash2,
  ChevronRight, BarChart3, UserX, RefreshCw, Eye,
  CreditCard, CheckCircle, XCircle, AlertTriangle, Clock,
  BadgeCheck, Ban, Gift, TrendingUp
} from 'lucide-react';
import { api, getCurrentUser } from '../utils/api';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';
import type { WeightRecord, ReportRecord } from '../utils/api';
import type { ToastType } from './Toast';

interface AdminDashboardProps {
  showToast: (msg: string, type?: ToastType['type']) => void;
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
  premiumUsers?: number;
  subscriptionBreakdown?: { subscription_status: string; count: number }[];
}

interface SubscriptionRow {
  id: number;
  email: string;
  name: string | null;
  role: string;
  tier: string;
  subscription_status: string | null;
  subscription_plan: string | null;
  subscription_id: string | null;
  subscription_current_period_end: string | null;
  created_at: string;
  isExpired: boolean | null;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  showToast, theme, setTheme, onLogout
}) => {
  const [activeView, setActiveView] = useState<'overview' | 'patients' | 'patient-detail' | 'subscriptions'>('overview');
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

  // Subscription management state
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsFilter, setSubsFilter] = useState<'all' | 'active' | 'cancelled' | 'past_due' | 'refunded' | 'halted'>('all');
  const [grantingUserId, setGrantingUserId] = useState<number | null>(null);
  const [revokingUserId, setRevokingUserId] = useState<number | null>(null);
  const [grantDays, setGrantDays] = useState<Record<number, string>>({});

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

  const fetchSubscriptions = useCallback(async () => {
    setSubsLoading(true);
    try {
      const data = await api.getAdminSubscriptions();
      setSubscriptions(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch subscriptions', 'danger');
    } finally {
      setSubsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeView === 'subscriptions') fetchSubscriptions();
  }, [activeView, fetchSubscriptions]);

  const handleGrantPremium = async (userId: number, email: string) => {
    const days = parseInt(grantDays[userId] || '30', 10);
    if (isNaN(days) || days < 1 || days > 3650) {
      showToast('Enter a valid number of days (1–3650)', 'warning');
      return;
    }
    setGrantingUserId(userId);
    try {
      const res = await api.adminGrantPremium(String(userId), days, 'monthly', 'Admin panel grant');
      showToast(res.message || `Premium granted to ${email}`, 'success');
      fetchSubscriptions();
      fetchStats();
    } catch (err: any) {
      showToast(err.message || 'Failed to grant premium', 'danger');
    } finally {
      setGrantingUserId(null);
    }
  };

  const handleRevokePremium = async (userId: number, email: string) => {
    if (!window.confirm(`Revoke Premium access for "${email}"? This takes effect immediately.`)) return;
    setRevokingUserId(userId);
    try {
      const res = await api.adminRevokePremium(String(userId), 'Admin panel revoke');
      showToast(res.message || `Premium revoked for ${email}`, 'success');
      fetchSubscriptions();
      fetchStats();
    } catch (err: any) {
      showToast(err.message || 'Failed to revoke premium', 'danger');
    } finally {
      setRevokingUserId(null);
    }
  };

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
          { label: 'Premium Users', value: stats?.premiumUsers ?? '–', icon: <BadgeCheck size={22} />, color: 'hsl(272, 72%, 60%)' },
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Patient Info Card */}
        <div className="card" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '1rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>Patient Info</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
            {[
              { label: 'Name', value: selectedPatient.name || 'N/A' },
              { label: 'Email', value: selectedPatient.email },
              { label: 'Age', value: selectedPatient.age || 'N/A' },
              { label: 'Gender', value: selectedPatient.gender || 'N/A' },
              { label: 'Blood Group', value: selectedPatient.blood_group || 'N/A' },
              { label: 'Joined', value: new Date(selectedPatient.created_at).toLocaleDateString() },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-secondary text-sm">{label}</div>
                <div style={{ fontWeight: 500, marginTop: '0.2rem' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          {[
            { label: 'Vital Readings', value: patientVitals.length, icon: <Activity size={18} />, color: 'hsl(355, 78%, 56%)' },
            { label: 'Glucose Logs', value: patientGlucose.length, icon: <Droplets size={18} />, color: 'hsl(35, 90%, 55%)' },
            { label: 'Weight Logs', value: patientWeights.length, icon: <FileText size={18} />, color: 'hsl(200, 85%, 55%)' },
            { label: 'Reports', value: patientReports.length, icon: <FileText size={18} />, color: 'hsl(150, 80%, 40%)' },
          ].map((stat, i) => (
            <div key={i} className="card" style={{
              padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '0.875rem',
              display: 'flex', alignItems: 'center', gap: '0.75rem'
            }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '0.625rem',
                background: `${stat.color}22`, display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: stat.color, flexShrink: 0
              }}>{stat.icon}</div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 }}>{stat.value}</div>
                <div className="text-secondary text-sm" style={{ marginTop: '0.2rem' }}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent Logs */}
        <div className="card" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '1rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>Recent Activity</h3>
          {allPatientLogs.length === 0 ? (
            <p className="text-secondary text-sm text-center py-4">No records found for this patient.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {allPatientLogs.slice(0, 20).map((log: any, i: number) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.625rem 0.75rem', borderRadius: '0.5rem',
                  background: 'var(--surface)', fontSize: '0.875rem'
                }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 600,
                    background: log.type === 'vitals' ? 'rgba(220,53,69,0.15)' : log.type === 'glucose' ? 'rgba(255,167,38,0.15)' : 'rgba(23,162,184,0.15)',
                    color: log.type === 'vitals' ? 'hsl(355,78%,56%)' : log.type === 'glucose' ? 'hsl(35,90%,55%)' : 'hsl(200,85%,55%)',
                    textTransform: 'capitalize', flexShrink: 0
                  }}>{log.type}</span>
                  <span className="text-secondary" style={{ flex: 1 }}>{new Date(log.timestamp).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={20} /> },
    { id: 'patients', label: 'Patients', icon: <Users size={20} /> },
    { id: 'subscriptions', label: 'Subscriptions', icon: <CreditCard size={20} /> },
  ];

  const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    active:         { label: 'Active',          color: 'hsl(150,80%,38%)',  bg: 'rgba(40,167,69,0.12)',   icon: <CheckCircle size={13} /> },
    cancelled:      { label: 'Cancelled',       color: 'hsl(35,90%,52%)',   bg: 'rgba(255,167,38,0.14)',  icon: <XCircle size={13} /> },
    past_due:       { label: 'Past Due',         color: 'hsl(355,78%,56%)', bg: 'rgba(220,53,69,0.13)',   icon: <AlertTriangle size={13} /> },
    refund_pending: { label: 'Refund Pending',   color: 'hsl(35,90%,52%)',  bg: 'rgba(255,167,38,0.14)',  icon: <Clock size={13} /> },
    refunded:       { label: 'Refunded',         color: 'hsl(355,78%,56%)', bg: 'rgba(220,53,69,0.13)',   icon: <Ban size={13} /> },
    halted:         { label: 'Halted',           color: 'hsl(355,78%,56%)', bg: 'rgba(220,53,69,0.13)',   icon: <Ban size={13} /> },
    inactive:       { label: 'Inactive',         color: 'var(--text-muted)', bg: 'rgba(128,128,128,0.1)', icon: <Clock size={13} /> },
  };

  const renderSubscriptions = () => {
    const statusOptions = ['all', 'active', 'cancelled', 'past_due', 'refunded', 'halted'] as const;

    const filtered = subsFilter === 'all'
      ? subscriptions
      : subscriptions.filter(s => s.subscription_status === subsFilter);

    const StatusBadge = ({ status }: { status: string | null }) => {
      const s = STATUS_META[status || 'inactive'] || STATUS_META['inactive'];
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          padding: '3px 9px', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 700,
          background: s.bg, color: s.color
        }}>
          {s.icon} {s.label}
        </span>
      );
    };

    return (
      <div>
        {/* Summary chips */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <TrendingUp size={16} style={{ color: 'var(--text-muted)' }} />
          {stats?.subscriptionBreakdown?.map(b => {
            const m = STATUS_META[b.subscription_status] || STATUS_META['inactive'];
            return (
              <span key={b.subscription_status} style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '3px 10px', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 600,
                background: m.bg, color: m.color, cursor: 'pointer'
              }} onClick={() => setSubsFilter(b.subscription_status as any)}>
                {m.icon} {b.subscription_status}: {b.count}
              </span>
            );
          })}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {statusOptions.map(s => (
            <button key={s} className={`btn btn-sm ${subsFilter === s ? 'btn-primary' : 'btn-outline'}`}
              style={{ textTransform: 'capitalize', fontSize: '0.78rem' }}
              onClick={() => setSubsFilter(s)}>
              {s === 'all' ? `All (${subscriptions.length})` : s.replace('_', ' ')}
            </button>
          ))}
          <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }}
            onClick={fetchSubscriptions} title="Refresh">
            <RefreshCw size={13} />
          </button>
        </div>

        {subsLoading ? (
          <div className="text-center py-8"><Loader2 size={32} className="animate-spin color-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-secondary">
            <CreditCard size={48} style={{ opacity: 0.25, marginBottom: '1rem' }} />
            <p>No subscriptions found{subsFilter !== 'all' ? ` with status "${subsFilter}"` : ''}.</p>
          </div>
        ) : (
          <div className="card" style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--border-radius-lg)',
            overflowX: 'auto'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', minWidth: '800px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface-elevated)' }}>
                  {['User', 'Status', 'Plan', 'Period End', 'Subscription ID', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    {/* User */}
                    <td style={{ padding: '0.85rem 1rem', maxWidth: '220px' }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.name || row.email.split('@')[0]}
                      </div>
                      <div className="text-secondary" style={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.email}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {row.tier === 'premium'
                          ? <span style={{ color: 'hsl(272,72%,65%)', fontWeight: 700 }}>★ Premium</span>
                          : <span>Free</span>}
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <StatusBadge status={row.subscription_status} />
                      {row.isExpired && row.tier === 'premium' && (
                        <div style={{ fontSize: '0.68rem', color: 'hsl(355,78%,56%)', marginTop: '3px' }}>Expired</div>
                      )}
                    </td>

                    {/* Plan */}
                    <td style={{ padding: '0.85rem 1rem', textTransform: 'capitalize' }}>
                      {row.subscription_plan || <span className="text-secondary">—</span>}
                    </td>

                    {/* Period End */}
                    <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                      {row.subscription_current_period_end
                        ? <span style={{ color: row.isExpired ? 'hsl(355,78%,56%)' : 'inherit' }}>
                            {new Date(row.subscription_current_period_end).toLocaleDateString()}
                          </span>
                        : <span className="text-secondary">—</span>}
                    </td>

                    {/* Subscription ID */}
                    <td style={{ padding: '0.85rem 1rem', maxWidth: '170px' }}>
                      {row.subscription_id
                        ? <code style={{
                            fontSize: '0.7rem',
                            background: 'var(--bg-surface-elevated)',
                            border: '1px solid var(--border-color)',
                            padding: '3px 7px',
                            borderRadius: '6px',
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {row.subscription_id}
                          </code>
                        : <span className="text-secondary">—</span>}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'nowrap' }}>
                        {row.tier !== 'premium' ? (
                          <>
                            {/* Duration input + days label */}
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              background: 'var(--bg-surface-elevated)',
                              border: '1px solid var(--border-color-active)',
                              borderRadius: '8px',
                              padding: '2px 8px',
                              gap: '4px'
                            }}>
                              <input
                                type="number"
                                min={1} max={3650}
                                value={grantDays[row.id] ?? '30'}
                                onChange={e => setGrantDays(prev => ({ ...prev, [row.id]: e.target.value }))}
                                style={{
                                  width: '42px',
                                  padding: '3px 2px',
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  border: 'none',
                                  outline: 'none',
                                  background: 'transparent',
                                  color: 'var(--text-primary)',
                                  textAlign: 'center'
                                }}
                                title="Number of days to grant"
                              />
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>days</span>
                            </div>
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '5px 11px', whiteSpace: 'nowrap' }}
                              disabled={grantingUserId === row.id}
                              onClick={() => handleGrantPremium(row.id, row.email)}
                              title="Grant Premium for specified days"
                            >
                              {grantingUserId === row.id
                                ? <Loader2 size={12} className="animate-spin" />
                                : <Gift size={12} />}
                              Grant
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-danger btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '5px 11px', whiteSpace: 'nowrap' }}
                            disabled={revokingUserId === row.id}
                            onClick={() => handleRevokePremium(row.id, row.email)}
                            title="Revoke Premium immediately"
                          >
                            {revokingUserId === row.id
                              ? <Loader2 size={12} className="animate-spin" />
                              : <Ban size={12} />}
                            Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const viewTitle = activeView === 'overview' ? 'Admin Overview'
    : activeView === 'patients' ? 'All Patients'
    : activeView === 'subscriptions' ? 'Subscriptions & Payments'
    : `${selectedPatient?.name || selectedPatient?.email || 'Patient'}'s Health`;

  const viewSubtitle = activeView === 'overview' ? 'System-wide health metrics and activity log'
    : activeView === 'patients' ? 'Manage and view all registered patient accounts'
    : activeView === 'subscriptions' ? 'View subscription status, webhooks state, and grant or revoke Premium access'
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
          {activeView === 'subscriptions' && renderSubscriptions()}
          {activeView === 'patient-detail' && renderPatientDetail()}
        </div>
      </main>
    </div>
  );
};
