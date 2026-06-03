import { useState } from 'react';
import { Bell, Download, X, AlertCircle } from 'lucide-react';
import { requestNotificationPermission } from '../../pwa.js';

export default function InstallAppPrompt({
  apkMetadata,
  metadataLoading,
  metadataError,
  isDownloading,
  downloadProgress,
  onDownload,
  onClose
}) {
  const [notifications, setNotifications] = useState(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  );

  const enableNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotifications(permission);
  };

  const isUnavailable = metadataError || !apkMetadata.available;

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-50 mx-auto max-w-md animate-pop rounded-3xl border border-aqua-100 bg-white/95 p-4 shadow-soft-xl backdrop-blur sm:bottom-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div className="flex items-start gap-3">
        <img src="/icon-192.png" alt="" className="h-12 w-12 rounded-2xl shadow-sm" width={48} height={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-black text-cyan-950">Get AquaChat</h2>
              {isUnavailable ? (
                <div className="mt-2 flex items-center gap-2 rounded-2xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  <AlertCircle size={14} className="shrink-0" />
                  APK temporarily unavailable
                </div>
              ) : (
                <div className="mt-1 space-y-1 text-sm leading-5 text-slate-500">
                  <p>{apkMetadata.name}</p>
                  <p className="text-xs text-slate-400">
                    {apkMetadata.version} • {metadataLoading ? 'Loading...' : apkMetadata.size}
                  </p>
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-aqua-50" title="Close" aria-label="Close download prompt">
              <X size={18} />
            </button>
          </div>

          {isDownloading && !isUnavailable && (
            <div className="mt-3 space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-aqua-100">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-400 to-cyan-600 transition-all duration-300 ease-out"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <p className="text-xs font-semibold text-cyan-700 text-center">
                Downloading {downloadProgress}%
              </p>
            </div>
          )}

          {metadataLoading && !isUnavailable && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-500">
              <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onDownload}
              disabled={isDownloading || metadataLoading || isUnavailable}
              className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-black text-white shadow-lg shadow-cyan-100 transition hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              <Download size={16} />
              {isUnavailable ? 'Unavailable' : isDownloading ? 'Downloading...' : 'Download APK'}
            </button>
            <button
              type="button"
              onClick={enableNotifications}
              disabled={isDownloading || isUnavailable}
              className="inline-flex items-center gap-2 rounded-2xl bg-aqua-50 px-4 py-2 text-sm font-black text-cyan-800 transition hover:bg-aqua-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Bell size={16} />
              {notifications === 'granted' ? 'Notifications on' : 'Enable alerts'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
