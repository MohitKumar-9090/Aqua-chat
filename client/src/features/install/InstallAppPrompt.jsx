import { useState } from 'react';
import { Bell, Download, X } from 'lucide-react';
import { requestNotificationPermission } from '../../pwa.js';

export default function InstallAppPrompt({ canInstall, onInstall, onClose }) {
  const [notifications, setNotifications] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  const enableNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotifications(permission);
  };

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-50 mx-auto max-w-md animate-pop rounded-3xl border border-aqua-100 bg-white/95 p-4 shadow-soft-xl backdrop-blur">
      <div className="flex items-start gap-3">
        <img src="/app-icon.svg" alt="" className="h-12 w-12 rounded-2xl" loading="lazy" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-black text-cyan-950">Install AquaChat</h2>
              <p className="mt-1 text-sm leading-5 text-slate-500">{canInstall ? 'Use AquaChat fullscreen with faster launches and offline access.' : 'Use your browser menu to add AquaChat to your home screen.'}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-aqua-50" title="Close">
              <X size={18} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onInstall} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-black text-white shadow-lg shadow-cyan-100 transition hover:bg-cyan-600">
              <Download size={16} />
              {canInstall ? 'Install App' : 'Got it'}
            </button>
            <button type="button" onClick={enableNotifications} className="inline-flex items-center gap-2 rounded-2xl bg-aqua-50 px-4 py-2 text-sm font-black text-cyan-800 transition hover:bg-aqua-100">
              <Bell size={16} />
              {notifications === 'granted' ? 'Notifications on' : 'Enable alerts'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
