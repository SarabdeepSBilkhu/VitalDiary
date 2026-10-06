import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

export interface ToastType {
  id: string;
  message: string;
  type: 'success' | 'danger' | 'warning' | 'info';
}

interface ToastProps {
  toast: ToastType;
  onClose: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle size={20} />;
      case 'danger':
        return <AlertCircle size={20} />;
      case 'warning':
        return <AlertTriangle size={20} />;
      case 'info':
        return <Info size={20} />;
    }
  };

  return (
    <div className={`toast toast-${toast.type}`} style={{ cursor: 'pointer' }} onClick={() => onClose(toast.id)}>
      {getIcon()}
      <span>{toast.message}</span>
    </div>
  );
};
