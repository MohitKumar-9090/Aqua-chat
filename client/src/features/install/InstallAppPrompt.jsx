import { useState } from 'react';
import { Bell, Download, X, AlertCircle, Check } from 'lucide-react';
import { requestNotificationPermission } from '../../pwa.js';

export default function InstallAppPrompt({
  apkMetadata,
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Modal Card */}
      <div className="relative w-full max-w-md animate-pop rounded-3xl border border-white/20 bg-gradient-to-br from-white/95 via-white/90 to-cyan-50/50 p-6 shadow-2xl backdrop-blur-xl sm:max-h-[90vh] sm:overflow-y-auto">
        {/* Close Button */}
        <button 
          type="button" 
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-2 text-slate-400 hover:bg-white/50 hover:text-slate-600 transition"
          title="Close"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Header with Icon */}
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0">
            <img 
              src="/icon-192.png" 
              alt="AquaChat" 
              className="h-16 w-16 rounded-3xl shadow-lg border border-white/50"
              width={64}
              height={64}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-black text-cyan-950">AquaChat Android App</h2>
            <p className="mt-1 text-sm text-slate-600">Fast • Secure • Real-time Messaging</p>
          </div>
        </div>

        {/* Metadata Section */}
        <div className="mb-5 rounded-2xl bg-gradient-to-br from-cyan-50 to-aqua-50 p-4 border border-cyan-100/50">
          {isUnavailable ? (
            <div className="flex items-center gap-3 text-red-700">
              <AlertCircle size={18} className="flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm">APK temporarily unavailable</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 font-medium">Version</span>
                <span className="text-cyan-900 font-bold">{apkMetadata.version}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 font-medium">Size</span>
                <span className="text-cyan-900 font-bold">{apkMetadata.size}</span>
              </div>
            </div>
          )}
        </div>

        {/* Download Progress */}
        {isDownloading && !isUnavailable && (
          <div className="mb-5 space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
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

        {/* Buttons */}
        <div className="space-y-2">
          {/* Download Button */}
          <button
            type="button"
            onClick={onDownload}
            disabled={isDownloading || isUnavailable}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-cyan-200/50 transition hover:from-cyan-600 hover:to-cyan-700 disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none disabled:cursor-not-allowed active:scale-95"
          >
            {isDownloading ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Downloading APK
              </>
            ) : isUnavailable ? (
              <>
                <AlertCircle size={18} />
                Unavailable
              </>
            ) : (
              <>
                <Download size={18} />
                Download APK
              </>
            )}
          </button>

          {/* Notification Button */}
          <button
            type="button"
            onClick={enableNotifications}
            disabled={isDownloading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-aqua-50 to-cyan-50 px-5 py-3 text-sm font-black text-cyan-900 border border-cyan-200/50 shadow-sm transition hover:from-aqua-100 hover:to-cyan-100 hover:border-cyan-300/50 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            {notifications === 'granted' ? (
              <>
                <Check size={18} className="text-green-600" />
                <span className="text-green-700">Notifications on</span>
              </>
            ) : (
              <>
                <Bell size={18} />
                Enable Alerts
              </>
            )}
          </button>

          {/* Later Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-full px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-2xl transition active:scale-95"
          >
            Later
          </button>
        </div>

        {/* Footer Info */}
        <p className="mt-4 text-center text-xs text-slate-500">
          🔒 Secure. No account required. Install in seconds.
        </p>
      </div>
    </div>
  );
}
