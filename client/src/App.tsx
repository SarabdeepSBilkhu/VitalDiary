import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, LineChart as ChartIcon, Calendar, Clock, Settings as SettingsIcon, 
  HeartPulse, PlusCircle, LogOut, Sun, Moon, Sparkles, Loader2, UserCircle2, Pill 
} from 'lucide-react';
import { api, getCurrentUser, removeToken, migrateProfileAndMedicationsFromLocalStorage } from './utils/api';
import type { VitalsRecord, GlucoseRecord } from './utils/evaluators';
import type { WeightRecord, ReportRecord } from './utils/api';
import { Login } from './components/Login';
import { Register } from './components/Register';
import { Dashboard } from './components/Dashboard';
import { Profile } from './components/Profile';
import { Medications } from './components/Medications';
import { Analytics } from './components/Analytics';
import { CalendarView } from './components/CalendarView';
import { HistoryView } from './components/HistoryView';
import { Settings } from './components/Settings';
import { LogModal } from './components/LogModal';
import { Toast } from './components/Toast';
import type { ToastType } from './components/Toast';

export const App: React.FC = () => {
  // Auth state
  const [user, setUser] = useState<any>(getCurrentUser());
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  
  // Navigation & UI state
  const [activeView, setActiveView] = useState<string>('dashboard-view');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('vital_diary_theme') as 'dark' | 'light') || 'dark';
  });

  // Data state
  const [vitals, setVitals] = useState<VitalsRecord[]>([]);
  const [glucose, setGlucose] = useState<GlucoseRecord[]>([]);
  const [weights, setWeights] = useState<WeightRecord[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // DB Cold-start state
  const [dbWaking, setDbWaking] = useState<{ attempt: number, maxAttempts: number } | null>(null);

  // Modal Dialogs state
  const [modalOpen, setModalOpen] = useState(false);
  const [logToEdit, setLogToEdit] = useState<any>(null);
  const [calendarDate, setCalendarDate] = useState<Date | null>(null);

  // Toast state
  const [toasts, setToasts] = useState<ToastType[]>([]);

  // Sync theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vital_diary_theme', theme);
  }, [theme]);

  // Toast display trigger
  const showToast = (message: string, type: 'success' | 'danger' | 'warning' | 'info' = 'info') => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Sync auth expiration listener
  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null);
      setAuthView('login');
      showToast('Session expired. Please log in again.', 'warning');
    };
    window.addEventListener('auth-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-expired', handleAuthExpired);
  }, []);

  // Listen for database warming state
  useEffect(() => {
    const handleDbWaking = (e: any) => {
      setDbWaking(e.detail);
    };
    const handleDbReady = () => {
      setDbWaking(null);
      showToast('Database connected successfully!', 'success');
      handleRefreshData();
    };
    window.addEventListener('db-waking-up', handleDbWaking);
    window.addEventListener('db-ready', handleDbReady);
    return () => {
      window.removeEventListener('db-waking-up', handleDbWaking);
      window.removeEventListener('db-ready', handleDbReady);
    };
  }, []);

  // Fetch all health logs
  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const migration = await migrateProfileAndMedicationsFromLocalStorage();
      if (migration.profileMigrated || migration.medicationsMigrated > 0) {
        const parts: string[] = [];
        if (migration.profileMigrated) parts.push('profile');
        if (migration.medicationsMigrated > 0) {
          parts.push(`${migration.medicationsMigrated} medication${migration.medicationsMigrated === 1 ? '' : 's'}`);
        }
        showToast(`Migrated ${parts.join(' and ')} from this device to your account.`, 'success');
      }

      const [vitalsData, glucoseData, weightData, reportsData] = await Promise.all([
        api.getVitals(),
        api.getGlucose(),
        api.getWeight(),
        api.getReports()
      ]);
      setVitals(vitalsData);
      setGlucose(glucoseData);
      setWeights(weightData);
      setReports(reportsData);
    } catch (err: any) {
      showToast(err.message || 'Error loading records.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  // Fetch data on login or refresh trigger
  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, refreshTrigger]);

  const handleRefreshData = async () => {
    setRefreshTrigger(p => p + 1);
  };

  // Compile chronological list of all logs
  const allLogs = useMemo(() => {
    const combined = [
      ...vitals.map(v => ({ ...v, type: 'vitals' })),
      ...glucose.map(g => ({ ...g, type: 'glucose' })),
      ...weights.map(w => ({ ...w, type: 'weight' })),
      ...reports.map(r => ({ ...r, type: 'reports' }))
    ];
    // Sort descending by timestamp
    return combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [vitals, glucose, weights, reports]);

  // Modal open helper
  const handleOpenLogModal = (log: any = null, defaultDate: Date | null = null) => {
    setLogToEdit(log);
    setCalendarDate(defaultDate);
    setModalOpen(true);
  };

  const handleCloseLogModal = () => {
    setLogToEdit(null);
    setCalendarDate(null);
    setModalOpen(false);
  };

  // Save Handlers
  const handleSaveVitals = async (data: any) => {
    if (data.id) {
      const updated = await api.updateVitals(data.id, data);
      setVitals(prev => prev.map(v => v.id === data.id ? updated : v));
      showToast('Vitals record updated successfully.', 'success');
    } else {
      const created = await api.createVitals(data);
      setVitals(prev => [created, ...prev]);
      showToast('Vitals record logged successfully.', 'success');
    }
  };

  const handleSaveGlucose = async (data: any) => {
    if (data.id) {
      const updated = await api.updateGlucose(data.id, data);
      setGlucose(prev => prev.map(g => g.id === data.id ? updated : g));
      showToast('Glucose record updated successfully.', 'success');
    } else {
      const created = await api.createGlucose(data);
      setGlucose(prev => [created, ...prev]);
      showToast('Glucose record logged successfully.', 'success');
    }
  };

  const handleSaveWeight = async (data: any) => {
    if (data.id) {
      const updated = await api.updateWeight(data.id, data);
      setWeights(prev => prev.map(w => w.id === data.id ? updated : w));
      showToast('Weight record updated successfully.', 'success');
    } else {
      const created = await api.createWeight(data);
      setWeights(prev => [created, ...prev]);
      showToast('Weight record logged successfully.', 'success');
    }
  };

  const handleSaveReport = async (data: any) => {
    if (data.id) {
      const updated = await api.updateReport(data.id, data);
      setReports(prev => prev.map(r => r.id === data.id ? updated : r));
      showToast('Medical report updated successfully.', 'success');
    } else {
      const created = await api.createReport(data);
      setReports(prev => [created, ...prev]);
      showToast('Medical report logged successfully.', 'success');
    }
  };

  // Delete Handler
  const handleDeleteLog = async (id: string, type: 'vitals' | 'glucose' | 'weight' | 'reports') => {
    if (window.confirm('Are you sure you want to permanently delete this record?')) {
      try {
        if (type === 'vitals') {
          await api.deleteVitals(id);
          setVitals(prev => prev.filter(v => v.id !== id));
        } else if (type === 'glucose') {
          await api.deleteGlucose(id);
          setGlucose(prev => prev.filter(g => g.id !== id));
        } else if (type === 'weight') {
          await api.deleteWeight(id);
          setWeights(prev => prev.filter(w => w.id !== id));
        } else if (type === 'reports') {
          await api.deleteReport(id);
          setReports(prev => prev.filter(r => r.id !== id));
        }
        showToast('Record deleted successfully.', 'success');
      } catch (err: any) {
        showToast('Failed to delete record.', 'danger');
      }
    }
  };

  const handleLogout = () => {
    removeToken();
    setUser(null);
    showToast('Signed out successfully.', 'info');
  };

  // Render view dispatcher
  const renderView = () => {
    if (loading && vitals.length === 0 && glucose.length === 0 && weights.length === 0 && reports.length === 0) {
      return (
        <div className="d-flex flex-column align-center justify-center py-5 h-100 text-muted">
          <Loader2 size={40} className="animate-spin color-primary mb-3" />
          <p>Loading database records...</p>
        </div>
      );
    }

    switch (activeView) {
      case 'dashboard-view':
        return (
          <Dashboard 
            vitals={vitals} 
            glucose={glucose} 
            weights={weights}
            reports={reports}
            allLogs={allLogs}
            onOpenLogModal={handleOpenLogModal}
            onDeleteLog={handleDeleteLog}
            onNavigate={setActiveView}
          />
        );
      case 'profile-view':
        return <Profile showToast={showToast} />;
      case 'medications-view':
        return <Medications showToast={showToast} />;
      case 'analytics-view':
        return <Analytics vitals={vitals} glucose={glucose} weights={weights} reports={reports} />;
      case 'calendar-view':
        return (
          <CalendarView 
            vitals={vitals} 
            glucose={glucose} 
            weights={weights}
            reports={reports}
            allLogs={allLogs}
            onOpenLogModal={handleOpenLogModal}
            onDeleteLog={handleDeleteLog}
          />
        );
      case 'history-view':
        return (
          <HistoryView 
            allLogs={allLogs}
            onOpenLogModal={handleOpenLogModal}
            onDeleteLog={handleDeleteLog}
          />
        );
      case 'settings-view':
        return (
          <Settings 
            vitals={vitals} 
            glucose={glucose} 
            weights={weights}
            reports={reports}
            allLogs={allLogs}
            userEmail={user?.email || 'User Account'}
            onLogout={handleLogout}
            onRefreshData={handleRefreshData}
            showToast={showToast}
          />
        );
      default:
        return <div>View not found.</div>;
    }
  };

  // Auth Layout
  if (!user) {
    return (
      <div className="app-container justify-center align-center min-h-screen">
        {authView === 'login' ? (
          <Login 
            onLoginSuccess={setUser}
            onNavigateToRegister={() => setAuthView('register')}
            showToast={showToast}
          />
        ) : (
          <Register 
            onRegisterSuccess={setUser}
            onNavigateToLogin={() => setAuthView('login')}
            showToast={showToast}
          />
        )}
        
        {/* Toast Container */}
        <div className="toast-container">
          {toasts.map(toast => (
            <Toast key={toast.id} toast={toast} onClose={removeToast} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      
      {/* Sidebar Navigation (Hidden on mobile via CSS) */}
      <aside className="sidebar">
        <div className="logo-area">
          <div className="logo-icon">
            <HeartPulse size={20} />
          </div>
          <span className="logo-text">Vital<span>Diary</span></span>
        </div>
        
        <nav className="nav-menu">
          <button 
            className={`nav-item ${activeView === 'dashboard-view' ? 'active' : ''}`}
            onClick={() => setActiveView('dashboard-view')}
          >
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </button>

          <button 
            className={`nav-item ${activeView === 'profile-view' ? 'active' : ''}`}
            onClick={() => setActiveView('profile-view')}
          >
            <UserCircle2 size={20} />
            <span>Profile</span>
          </button>

          <button 
            className={`nav-item ${activeView === 'medications-view' ? 'active' : ''}`}
            onClick={() => setActiveView('medications-view')}
          >
            <Pill size={20} />
            <span>Medications</span>
          </button>
          
          <button 
            className={`nav-item ${activeView === 'analytics-view' ? 'active' : ''}`}
            onClick={() => setActiveView('analytics-view')}
          >
            <ChartIcon size={20} />
            <span>Analytics</span>
          </button>
          
          <button 
            className={`nav-item ${activeView === 'calendar-view' ? 'active' : ''}`}
            onClick={() => setActiveView('calendar-view')}
          >
            <Calendar size={20} />
            <span>Calendar</span>
          </button>
          
          <button 
            className={`nav-item ${activeView === 'history-view' ? 'active' : ''}`}
            onClick={() => setActiveView('history-view')}
          >
            <Clock size={20} />
            <span>History</span>
          </button>
          
          <button 
            className={`nav-item ${activeView === 'settings-view' ? 'active' : ''}`}
            onClick={() => setActiveView('settings-view')}
          >
            <SettingsIcon size={20} />
            <span>Settings</span>
          </button>
        </nav>
        
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">
              <Sparkles size={16} className="color-primary" />
            </div>
            <div className="user-details">
              <span className="user-name">{user.email.split('@')[0]}</span>
              <span className="user-role">Premium Active</span>
            </div>
          </div>
          
          <div className="sidebar-actions">
            <button 
              className="btn-action" 
              id="theme-toggle" 
              title="Toggle Light/Dark Theme"
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button 
              className="btn-action logout-action" 
              id="btn-logout" 
              title="Sign Out"
              onClick={handleLogout}
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
              {activeView === 'dashboard-view' && 'Health Dashboard'}
              {activeView === 'profile-view' && 'Profile'}
              {activeView === 'medications-view' && 'Medications'}
              {activeView === 'analytics-view' && 'Medical Analytics'}
              {activeView === 'calendar-view' && 'Log Calendar'}
              {activeView === 'history-view' && 'Records Logs History'}
              {activeView === 'settings-view' && 'System Settings'}
            </h1>
            <p className="text-secondary text-sm">Welcome back, {user.email}. Keep your vitals updated.</p>
          </div>
          
          <div className="header-actions">
            <button className="btn btn-primary" id="btn-add-reading" onClick={() => handleOpenLogModal()}>
              <PlusCircle size={18} />
              <span>Add Reading</span>
            </button>
          </div>
        </header>

        {/* Dynamic Render of Selected view */}
        <div className="view-content-wrapper">
          {renderView()}
        </div>
      </main>

      {/* Mobile Sticky Tab Bar Navigation */}
      <nav className="mobile-nav-bar">
        <button 
          className={`mobile-nav-item ${activeView === 'dashboard-view' ? 'active' : ''}`}
          onClick={() => setActiveView('dashboard-view')}
        >
          <LayoutDashboard size={22} />
          <span>Dashboard</span>
        </button>

        <button 
          className={`mobile-nav-item ${activeView === 'profile-view' ? 'active' : ''}`}
          onClick={() => setActiveView('profile-view')}
        >
          <UserCircle2 size={22} />
          <span>Profile</span>
        </button>

        <button 
          className={`mobile-nav-item ${activeView === 'medications-view' ? 'active' : ''}`}
          onClick={() => setActiveView('medications-view')}
        >
          <Pill size={22} />
          <span>Medications</span>
        </button>
        
        <button 
          className={`mobile-nav-item ${activeView === 'analytics-view' ? 'active' : ''}`}
          onClick={() => setActiveView('analytics-view')}
        >
          <ChartIcon size={22} />
          <span>Analytics</span>
        </button>
        
        <button 
          className={`mobile-nav-item ${activeView === 'calendar-view' ? 'active' : ''}`}
          onClick={() => setActiveView('calendar-view')}
        >
          <Calendar size={22} />
          <span>Calendar</span>
        </button>
        
        <button 
          className={`mobile-nav-item ${activeView === 'history-view' ? 'active' : ''}`}
          onClick={() => setActiveView('history-view')}
        >
          <Clock size={22} />
          <span>History</span>
        </button>
        
        <button 
          className={`mobile-nav-item ${activeView === 'settings-view' ? 'active' : ''}`}
          onClick={() => setActiveView('settings-view')}
        >
          <SettingsIcon size={22} />
          <span>Settings</span>
        </button>
      </nav>

      {/* Unified Log Entry Modal popup */}
      <LogModal 
        isOpen={modalOpen}
        onClose={handleCloseLogModal}
        logToEdit={logToEdit}
        onSaveVitals={handleSaveVitals}
        onSaveGlucose={handleSaveGlucose}
        onSaveWeight={handleSaveWeight}
        onSaveReport={handleSaveReport}
        showToast={showToast}
        selectedCalendarDate={calendarDate}
      />

      {/* Database waking status loader for cold-starts */}
      {dbWaking && (
        <div className="db-waking-overlay">
          <div className="db-waking-card">
            <Loader2 className="animate-spin color-primary mb-3" size={36} />
            <h3>Database is warming up</h3>
            <p>Railway database container is waking up from sleeping mode. This occurs on initial request and takes 10–25 seconds.</p>
            <div className="progress-badge">
              Connecting attempt {dbWaking.attempt} of {dbWaking.maxAttempts}...
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      <div className="toast-container">
        {toasts.map(toast => (
          <Toast key={toast.id} toast={toast} onClose={removeToast} />
        ))}
      </div>

    </div>
  );
};
