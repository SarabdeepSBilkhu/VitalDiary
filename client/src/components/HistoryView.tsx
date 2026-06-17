import React, { useState, useMemo } from 'react';
import { Filter, Search, RotateCcw, Activity, Thermometer, Edit3, Trash2, ChevronLeft, ChevronRight, Weight, FileText } from 'lucide-react';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';
import type { WeightRecord, ReportRecord } from '../utils/api';
import { evaluateBP, evaluateGlucose } from '../utils/evaluators';

const fmtDT = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

interface HistoryViewProps {
  allLogs: any[];
  onOpenLogModal: (log: any) => void;
  onDeleteLog: (id: string, type: 'vitals' | 'glucose' | 'weight' | 'reports') => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  allLogs,
  onOpenLogModal,
  onDeleteLog
}) => {
  const [filterType, setFilterType] = useState<'all' | 'vitals' | 'glucose' | 'weight' | 'reports'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // 1. Filtered Logs List
  const filteredLogs = useMemo(() => {
    let result = [...allLogs];

    // Filter by Type
    if (filterType !== 'all') {
      result = result.filter(log => log.type === filterType);
    }

    // Filter by Search Note query (including titles and report data)
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(log => 
        (log.notes && log.notes.toLowerCase().includes(q)) ||
        (log.title && log.title.toLowerCase().includes(q)) ||
        (log.data && log.data.toLowerCase().includes(q))
      );
    }

    // Filter by Start Date
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      result = result.filter(log => new Date(log.timestamp) >= start);
    }

    // Filter by End Date
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter(log => new Date(log.timestamp) <= end);
    }

    // Reset pagination to first page when filters change
    setCurrentPage(1);

    return result;
  }, [allLogs, filterType, searchQuery, startDate, endDate]);

  // 2. Paginated sub-section
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLogs, currentPage]);

  const handleResetFilters = () => {
    setFilterType('all');
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  const showingStart = filteredLogs.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const showingEnd = Math.min(currentPage * itemsPerPage, filteredLogs.length);

  return (
    <section id="history-view" className="view-section active">
      {/* Search & Filter Header Panel */}
      <div className="panel panel-glass mb-4">
        <div className="panel-header border-bottom">
          <div className="panel-title-group">
            <Filter className="color-primary" size={22} />
            <h3>Filter History Logs</h3>
          </div>
          <button className="btn btn-outline btn-sm" onClick={handleResetFilters}>
            <RotateCcw size={14} style={{ marginRight: '4px' }} /> Reset Filters
          </button>
        </div>
        
        <div className="filters-grid">
          <div className="filter-group">
            <label htmlFor="history-search">Search Notes &amp; Lab Data</label>
            <div className="input-unit-wrapper">
              <input 
                type="text" 
                id="history-search" 
                className="form-control" 
                placeholder="Search notes, report titles, or results..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
              />
              <span style={{ position: 'absolute', left: '0.85rem', color: 'var(--text-muted)' }}>
                <Search size={16} />
              </span>
            </div>
          </div>

          <div className="filter-group">
            <label htmlFor="history-filter-type">Type</label>
            <select 
              id="history-filter-type" 
              className="form-control"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
            >
              <option value="all">All Readings</option>
              <option value="vitals">Vitals Only (BP, HR, SpO₂)</option>
              <option value="glucose">Glucose Only</option>
              <option value="weight">Weight Only</option>
              <option value="reports">Medical Reports Only</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="history-start-date">Start Date</label>
            <input 
              type="date" 
              id="history-start-date" 
              className="form-control"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label htmlFor="history-end-date">End Date</label>
            <input 
              type="date" 
              id="history-end-date" 
              className="form-control"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Main Logs Chronological Table */}
      <div className="panel panel-glass">
        <div className="table-responsive">
          <table className="table" id="history-logs-table">
            <thead>
              <tr>
                <th>Date &amp; Time</th>
                <th>Metric / Type</th>
                <th>Recorded Value</th>
                <th>Evaluation Status</th>
                <th>Notes / Comments</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
                    No logs found matching selected filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedLogs.map(log => {
                  let metricLabel;
                  let valueLabel;
                  let badgeText = '';
                  let badgeClass = '';
                  const logType = log.type;

                  if (logType === 'vitals') {
                    const vitalLog = log as VitalsRecord;
                    metricLabel = (
                      <div className="d-flex align-center gap-2">
                        <span className="badge bg-red">
                          <Activity size={12} style={{ marginRight: '4px' }} /> Vitals
                        </span>
                      </div>
                    );
                    valueLabel = (
                      <div>
                        <div><strong>BP:</strong> {vitalLog.systolic}/{vitalLog.diastolic} mmHg</div>
                        <div className="text-sm text-secondary">
                          <strong>HR:</strong> {vitalLog.hr} bpm | <strong>SpO₂:</strong> {vitalLog.spo2 || '--'}%
                        </div>
                      </div>
                    );
                    const evalRes = evaluateBP(vitalLog.systolic, vitalLog.diastolic);
                    badgeText = evalRes.status;
                    badgeClass = evalRes.className;
                  } else if (logType === 'glucose') {
                    const glucoseLog = log as GlucoseRecord;
                    metricLabel = (
                      <div className="d-flex align-center gap-2">
                        <span className="badge bg-purple">
                          <Thermometer size={12} style={{ marginRight: '4px' }} /> Glucose
                        </span>
                        <span className="text-sm text-secondary capitalize">{glucoseLog.context}</span>
                      </div>
                    );
                    valueLabel = <span><strong>{glucoseLog.value}</strong> mg/dL</span>;
                    const evalRes = evaluateGlucose(glucoseLog.value, glucoseLog.context);
                    badgeText = evalRes.status;
                    badgeClass = evalRes.className;
                  } else if (logType === 'weight') {
                    const weightLog = log as WeightRecord;
                    metricLabel = (
                      <div className="d-flex align-center gap-2">
                        <span className="badge bg-green" style={{ backgroundColor: 'hsla(150, 80%, 40%, 0.15)', color: 'hsl(150, 80%, 40%)' }}>
                          <Weight size={12} style={{ marginRight: '4px' }} /> Weight
                        </span>
                      </div>
                    );
                    valueLabel = <span><strong>{weightLog.value}</strong> kg</span>;
                    badgeText = 'Logged';
                    badgeClass = 'status-normal';
                  } else {
                    const reportLog = log as ReportRecord;
                    metricLabel = (
                      <div className="d-flex align-center gap-2">
                        <span className="badge bg-orange" style={{ backgroundColor: 'hsla(30, 90%, 50%, 0.15)', color: 'hsl(30, 90%, 50%)' }}>
                          <FileText size={12} style={{ marginRight: '4px' }} /> Report ({reportLog.report_type})
                        </span>
                      </div>
                    );
                    badgeText = 'Saved';
                    badgeClass = 'status-info';
                  }

                  return (
                    <tr key={log.id}>
                      <td>{fmtDT(log.timestamp)}</td>
                      <td>{metricLabel}</td>
                      <td>{valueLabel}</td>
                      <td><span className={`status-indicator ${badgeClass}`}>{badgeText}</span></td>
                      <td 
                        className="text-secondary" 
                        style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} 
                        title={log.notes || ''}
                      >
                        {logType === 'reports' ? (log.data ? `Results: ${log.data} | ` : '') + (log.notes || '') : (log.notes || '--')}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button 
                            className="btn-table-action edit-action" 
                            title="Edit Entry"
                            onClick={() => onOpenLogModal(log)}
                          >
                            <Edit3 size={16} />
                          </button>
                          <button 
                            className="btn-table-action delete-action" 
                            title="Delete Entry"
                            onClick={() => onDeleteLog(log.id, logType)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Dynamic Pagination Controls */}
        {filteredLogs.length > 0 && (
          <div className="pagination-wrapper border-top">
            <div className="pagination-info">
              Showing <span id="pagination-start">{showingStart}</span> to <span id="pagination-end">{showingEnd}</span> of{' '}
              <span id="pagination-total">{filteredLogs.length}</span> readings
            </div>
            
            <div className="pagination-buttons">
              <button 
                className="btn btn-icon btn-sm" 
                id="pagination-prev" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft size={16} />
              </button>
              
              <span className="pagination-page-label">
                Page <span id="pagination-current">{currentPage}</span> of <span id="pagination-pages">{totalPages}</span>
              </span>
              
              <button 
                className="btn btn-icon btn-sm" 
                id="pagination-next" 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
