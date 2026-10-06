import React from 'react';
import { PatientHealthView } from './PatientHealthView';
import type { VitalsRecord, GlucoseRecord } from '../utils/evaluators';
import type { WeightRecord, ReportRecord } from '../utils/api';

interface DashboardProps {
  vitals: VitalsRecord[];
  glucose: GlucoseRecord[];
  weights: WeightRecord[];
  reports: ReportRecord[];
  allLogs: any[];
  healthAlerts?: { type: 'info' | 'warning' | 'danger', message: string }[];
  onOpenLogModal: (log?: any) => void;
  onDeleteLog: (id: string, type: 'vitals' | 'glucose' | 'weight' | 'reports') => void;
  onNavigate: (view: string) => void;
}

export const PatientDashboard: React.FC<DashboardProps> = ({
  vitals,
  glucose,
  weights,
  reports,
  allLogs,
  healthAlerts = [],
  onOpenLogModal,
  onDeleteLog,
  onNavigate
}) => {
  return (
    <PatientHealthView
      vitals={vitals}
      glucose={glucose}
      weights={weights}
      reports={reports}
      allLogs={allLogs}
      healthAlerts={healthAlerts}
      onOpenLogModal={onOpenLogModal}
      onDeleteLog={onDeleteLog}
      onNavigate={onNavigate}
    />
  );
};