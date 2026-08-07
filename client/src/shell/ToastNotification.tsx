import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle, Info, WarningCircle, X, XCircle } from '@phosphor-icons/react';
import styles from './ToastNotification.module.css';

export type ToastSeverity = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  readonly id: number;
  readonly message: string;
  readonly severity: ToastSeverity;
  readonly duration: number;
}

interface ToastContextType {
  showToast: (message: string, severity?: ToastSeverity, duration?: number) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showWarning: (message: string) => void;
  showInfo: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

const ICON: Readonly<Record<ToastSeverity, typeof CheckCircle>> = {
  success: CheckCircle,
  error: XCircle,
  warning: WarningCircle,
  info: Info,
};

interface ToastItemProps {
  readonly toast: Toast;
  readonly onClose: (id: number) => void;
}

function ToastItem({ toast, onClose }: ToastItemProps): React.JSX.Element {
  const { id, message, severity, duration } = toast;
  const Icon = ICON[severity];

  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => onClose(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  return (
    <div className={styles.toast} data-severity={severity} role="status">
      <Icon size={18} weight="fill" className={styles.icon} aria-hidden />
      <p className={styles.message}>{message}</p>
      <button type="button" className={styles.close} onClick={() => onClose(id)} aria-label="Dismiss">
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

interface ToastProviderProps {
  readonly children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps): React.JSX.Element {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const nextIdRef = useRef(0);

  const handleClose = useCallback((id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, severity: ToastSeverity = 'info', duration = 4000) => {
      const id = nextIdRef.current++;
      setToasts(prev => [...prev, { id, message, severity, duration }]);
    },
    []
  );

  const showSuccess = useCallback((message: string) => showToast(message, 'success'), [showToast]);
  const showError = useCallback((message: string) => showToast(message, 'error', 6000), [showToast]);
  const showWarning = useCallback((message: string) => showToast(message, 'warning', 5000), [showToast]);
  const showInfo = useCallback((message: string) => showToast(message, 'info'), [showToast]);

  // Stable identity: consumers list these callbacks in dependency arrays, and an
  // unmemoised value would re-render every `useToast` consumer on each toast.
  const value = useMemo<ToastContextType>(
    () => ({ showToast, showSuccess, showError, showWarning, showInfo }),
    [showToast, showSuccess, showError, showWarning, showInfo]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.stack}>
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onClose={handleClose} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
