import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';
import { subscribeToasts, removeToast, toastConfig } from '../utils/toast.js';

const toastIcons = {
  success: <CheckCircle className="w-5 h-5 text-green-600" />,
  error: <AlertCircle className="w-5 h-5 text-red-600" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-600" />,
  info: <Info className="w-5 h-5 text-blue-600" />
};

const toastColors = {
  success: 'border-green-200 bg-green-50 text-green-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800'
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeToasts(({ action, toast, id }) => {
      if (action === 'add') {
        setToasts(current => {
          const updated = [...current, toast];
          // Limit to maxToasts
          return updated.slice(-toastConfig.maxToasts);
        });
      } else if (action === 'remove') {
        setToasts(current => current.filter(t => t.id !== id));
      }
    });

    return unsubscribe;
  }, []);

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-xs mx-auto space-y-2 sm:left-6 sm:bottom-6 lg:left-auto lg:right-6">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur animate-pop ${toastColors[toast.type]}`}
          role="alert"
        >
          <div className="flex-shrink-0 mt-0.5">
            {toastIcons[toast.type]}
          </div>
          <p className="flex-1 text-sm font-medium">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 p-1 hover:opacity-70 transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
