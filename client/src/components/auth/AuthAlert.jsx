import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { useEffect } from 'react';

const styles = {
  error: {
    icon: AlertCircle,
    wrap: 'border-rose-200/70 bg-rose-50/80 text-rose-800',
    iconColor: 'text-rose-500'
  },
  success: {
    icon: CheckCircle,
    wrap: 'border-emerald-200/70 bg-emerald-50/80 text-emerald-800',
    iconColor: 'text-emerald-500'
  },
  info: {
    icon: Info,
    wrap: 'border-cyan-200/70 bg-cyan-50/80 text-cyan-900',
    iconColor: 'text-cyan-500'
  }
};

export default function AuthAlert({ type = 'error', message, onDismiss, autoDismissMs = 6000 }) {
  const config = styles[type] || styles.error;
  const Icon = config.icon;

  useEffect(() => {
    if (!autoDismissMs || !onDismiss || type === 'error') return;
    const timer = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [message, autoDismissMs, onDismiss, type]);

  if (!message) return null;

  return (
    <div
      role="alert"
      className={`animate-pop flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-soft backdrop-blur-md ${config.wrap}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${config.iconColor}`} />
      <p className="flex-1 text-sm font-medium leading-5">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-1 opacity-70 transition hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
