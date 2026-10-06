import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Loader2, Link2Off, Sparkles, LogOut, Sun, Moon, LayoutDashboard } from 'lucide-react';
import { api, getActivePatient, setActivePatient, getCurrentUser } from '../utils/api';
import { CaregiverPatientView } from './CaregiverPatientView';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';
import type { WeightRecord, ReportRecord } from '../utils/api';
import type { ToastType } from './Toast';

interface CaregiverDashboardProps {
  showToast: (msg: string, type?: ToastType['type']) => void;
  onPatientSwitched: () => void;
  vitals: VitalsRecord[];
  glucose: GlucoseRecord[];
  weights: WeightRecord[];
  reports: ReportRecord[];
  allLogs: any[];
  healthAlerts?: { type: 'info' | 'warning' | 'danger', message: string }[];
  activeView: string;
  setActiveView: (view: string) => void;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  onLogout: () => void;
  onOpenLogModal: (log?: any) => void;
}

export const CaregiverDashboard: React.FC<CaregiverDashboardProps> = ({
  showToast,
  onPatientSwitched,
  vitals,
  glucose,
  weights,
  reports,
  allLogs,
  healthAlerts = [],
  activeView,
  setActiveView,
  theme,
  setTheme,
  onLogout,
  onOpenLogModal
}) => {
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newPatientEmail, setNewPatientEmail] = useState('');
  const [linking, setLinking] = useState(false);
  const [activePatient, setActivePatientState] = useState<string | null>(getActivePatient());
  const [showPatientSelector, setShowPatientSelector] = useState(false);

  const user = getCurrentUser();

  const fetchPatients = async () => {
    setLoading(true);
    try {
      const data = await api.getPatients();
      setPatients(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch patients', 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientEmail) return;
    setLinking(true);
    try {
      await api.linkPatient(newPatientEmail);
      showToast('Invite sent successfully! The patient must accept it before appearing in your list.', 'success');
      setNewPatientEmail('');
      fetchPatients();
    } catch (err: any) {
      showToast(err.message || 'Failed to send invite', 'danger');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (patientId: string) => {
    if (!window.confirm('Are you sure you want to unlink this patient?')) return;
    try {
      await api.unlinkPatient(patientId);
      showToast('Patient unlinked', 'info');
      if (getActivePatient() === patientId.toString()) {
        setActivePatient(null);
        setActivePatientState(null);
        onPatientSwitched();
      }
      fetchPatients();
    } catch (err: any) {
      showToast(err.message || 'Failed to unlink', 'danger');
    }
  };

  const handleSwitchPatient = (patientId: string) => {
    if (getActivePatient() === patientId.toString()) {
      setActivePatient(null);
      setActivePatientState(null);
      showToast('Deselected patient. Select a patient to view their health data.', 'info');
    } else {
      setActivePatient(patientId.toString());
      setActivePatientState(patientId.toString());
      showToast(`Switched to patient view.`, 'success');
    }
    onPatientSwitched();
    setShowPatientSelector(false);
  };

  const selectedPatient = patients.find(p => p.id.toString() === activePatient);

  // Caregiver navigation
  const renderView = () => {
    if (!activePatient) {
      return (
        <div className="d-flex flex-column align-center justify-center py-5 h-100">
          <Users size={64} className="color-primary mb-4" />
          <h2 className="mb-3">Select a Patient</h2>
          <p className="text-secondary text-center mb-4" style={{ maxWidth: '400px' }}>
            Choose a patient from your linked patients to view their health data and manage their care.
          </p>
          <button 
            className="btn btn-primary" 
            onClick={() => setShowPatientSelector(true)}
          >
            <Users size={18} className="mr-2" />
            Browse Patients
          </button>
        </div>
      );
    }

    switch (activeView) {
      case 'dashboard-view':
        return (
          <CaregiverPatientView
            patientInfo={selectedPatient}
            vitals={vitals}
            glucose={glucose}
            weights={weights}
            reports={reports}
            allLogs={allLogs}
            healthAlerts={healthAlerts}
            userEmail={user?.email || 'User Account'}
            showToast={showToast}
            onOpenLogModal={onOpenLogModal}
          />
        );
      default:
        return <div>View not available in caregiver mode.</div>;
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-area">
          <div className="logo-icon">
            <Users size={20} />
          </div>
          <span className="logo-text">Vital<span>Diary</span></span>
        </div>
        
        <nav className="nav-menu">
          <button 
            className={`nav-item ${activeView === 'dashboard-view' ? 'active' : ''}`}
            onClick={() => setActiveView('dashboard-view')}
            disabled={!activePatient}
          >
            <LayoutDashboard size={20} />
            <span>Patient Health</span>
          </button>

          <button 
            className="nav-item mt-4 border-top pt-3"
            onClick={() => setShowPatientSelector(true)}
            style={{ color: 'var(--primary)' }}
          >
            <Users size={20} />
            <span>Switch Patient</span>
          </button>
        </nav>
        
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">
              <Sparkles size={16} className="color-primary" />
            </div>
            <div className="user-details">
              <span className="user-name">{user?.email.split('@')[0]}</span>
              <span className="user-role" style={{
                textTransform: 'capitalize',
                color: 'var(--primary)'
              }}>
                Caregiver
                {activePatient && selectedPatient && (
                  <span style={{ color: 'hsl(30, 90%, 55%)', marginLeft: '4px', fontSize: '0.65rem' }}>
                    · Viewing {selectedPatient.name || selectedPatient.email}
                  </span>
                )}
              </span>
            </div>
          </div>
          
          <div className="sidebar-actions">
            <button 
              className="btn-action" 
              id="theme-toggle" 
              title="Toggle Light/Dark Theme"
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

      {/* Main Page Area */}
      <main className="app-content">
        {/* Dynamic header title */}
        <header className="content-header">
          <div className="header-titles">
            <h1 id="view-title">
              {activePatient && selectedPatient ? (
                `${selectedPatient.name || selectedPatient.email}'s Health`
              ) : (
                'Caregiver Dashboard'
              )}
            </h1>
            <p className="text-secondary text-sm">
              {activePatient && selectedPatient 
                ? `Managing health data for ${selectedPatient.name || selectedPatient.email}`
                : 'Select a patient to view their health data'
              }
            </p>
          </div>
          
          <div className="header-actions">
            {activePatient && (
              <button className="btn btn-primary" id="btn-add-reading" onClick={() => onOpenLogModal()}>
                <span className="d-flex align-center gap-2"><Sparkles size={18} /> Add Reading</span>
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Render of Selected view */}
        <div className="view-content-wrapper">
          {renderView()}
        </div>
      </main>

      {/* Patient Selector Modal */}
      {showPatientSelector && (
        <div className="modal-overlay active" onClick={() => setShowPatientSelector(false)}>
          <div className="modal-content log-modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Users size={20} className="mr-2" style={{ display: 'inline' }} /> My Patients</h2>
              <button className="btn-close" onClick={() => setShowPatientSelector(false)}>&times;</button>
            </div>

            <div className="modal-body p-4">
              <form className="mb-4 d-flex gap-2" onSubmit={handleLink}>
                <input 
                  type="email" 
                  className="form-control" 
                  placeholder="Patient Email to Link" 
                  value={newPatientEmail} 
                  onChange={e => setNewPatientEmail(e.target.value)}
                  required
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-primary" disabled={linking} style={{ minWidth: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  {linking ? <Loader2 className="animate-spin" size={18} /> : <UserPlus size={18} />}
                  {linking ? 'Linking...' : 'Link Patient'}
                </button>
              </form>

              {loading ? (
                <div className="text-center py-8 text-muted"><Loader2 className="animate-spin" size={32} /></div>
              ) : patients.length === 0 ? (
                <div className="text-center py-8 text-muted">
                  <Users size={48} className="mb-3 color-primary" style={{ opacity: 0.5 }} />
                  <p>No patients linked yet.</p>
                  <p className="text-sm">Enter a patient email above to link them.</p>
                </div>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {patients.map(p => (
                    <div key={p.id} className="card p-4 d-flex justify-between align-center" style={{ border: '1px solid var(--border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4 className="m-0 mb-2">{p.name || 'Unnamed'}</h4>
                        <div className="text-sm text-secondary mb-1">{p.email}</div>
                        <span className="text-sm text-secondary">
                          {p.age ? `${p.age} yrs` : 'Age unknown'} • {p.gender || 'Gender unknown'}
                        </span>
                      </div>
                      <div className="d-flex gap-2" style={{ marginLeft: '1rem' }}>
                        <button 
                          className={`btn ${activePatient === p.id.toString() ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => handleSwitchPatient(p.id)}
                          style={{ minWidth: '100px' }}
                        >
                          {activePatient === p.id.toString() ? 'Deselect' : 'View'}
                        </button>
                        <button className="btn btn-danger" title="Unlink" onClick={() => handleUnlink(p.id)} style={{ padding: '0.5rem 1rem' }}>
                          <Link2Off size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};