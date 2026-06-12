import React, { useState, useMemo } from 'react';
import { Filter, Search, RotateCcw, Activity, Thermometer, Edit3, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';
import { evaluateBP, evaluateGlucose } from '../utils/evaluators';

const fmtDT = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

interface HistoryViewProps {
  allLogs: any[];
  onOpenLogModal: (log: any) => void;
  onDeleteLog: (id: string, type: 'vitals' | 'glucose') => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  allLogs,
  onOpenLogModal,
  onDeleteLog
}) => {
  const [filterType, setFilterType] = useState<'all' | 'vitals' | 'glucose'>('all');
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
    if (filterType === 'vitals') {
      result = result.filter(log => log.type === 'vitals' || 'systolic' in log);
    } else if (filterType === 'glucose') {
      result = result.filter(log => log.type === 'glucose' || 'value' in log);
    }

    // Filter by Search Note query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(log => log.notes && log.notes.toLowerCase().includes(q));
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
            <label htmlFor="history-search">Search Notes</label>
            <div className="input-unit-wrapper">
              <input 
                type="text" 
                id="history-search" 
                className="form-control" 
                placeholder="Search notes / dietary observations..." 
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
                <th>Date & Time</th>
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
                  const isVital = log.type === 'vitals' || 'systolic' in log;
                  let metricLabel;
                  let valueLabel;
                  let badgeText = '';
                  let badgeClass = '';

                  if (isVital) {
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
                  } else {
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
                        {log.notes || '--'}
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
                            onClick={() => onDeleteLog(log.id, isVital ? 'vitals' : 'glucose')}
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
