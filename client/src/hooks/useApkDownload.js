import { useCallback, useEffect, useState } from 'react';
import { isAndroid, isPwaDisplayMode, isSecureContext } from '../pwa.js';
import { installOrDownload } from '../utils/device.js';

const APK_DISMISS_KEY = 'aquachat_apk_dismissed_at';
const APK_DISMISS_TTL = 24 * 60 * 60 * 1000; // 24 hours

const isDismissedWithin24Hours = () => {
  try {
    const dismissedAt = Number(localStorage.getItem(APK_DISMISS_KEY) || 0);
    return dismissedAt && Date.now() - dismissedAt < APK_DISMISS_TTL;
  } catch {
    return false;
  }
};

export const useApkDownload = () => {
  const [apkMetadata, setApkMetadata] = useState({
    name: 'AquaChat Android App',
    version: 'v1.0.0',
    size: '93.6 MB',
    available: true
  });
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const isAndroidDevice = isAndroid();

  // Show first-visit prompt on Android devices
  useEffect(() => {
    if (isAndroidDevice && !isDismissedWithin24Hours()) {
      console.log('[APK Install] Android device detected - showing first-visit prompt');
      // Show immediately on Android (3.5s delay for better UX)
      const timer = window.setTimeout(() => {
        console.log('[APK Install] Popup shown');
        setShowPrompt(true);
      }, 3500);

      return () => window.clearTimeout(timer);
    } else if (isAndroidDevice && isDismissedWithin24Hours()) {
      console.log('[APK Install] Dismissed within 24 hours - hiding prompt');
    } else if (!isAndroidDevice) {
      console.log('[APK Install] Not an Android device - hiding prompt');
    }
  }, [metadataLoading, isAndroidDevice]);

  const dismissPrompt = useCallback((reason = 'user_closed') => {
    console.log(`[APK Install] Popup hidden - reason: ${reason}`);
    setShowPrompt(false);
    // Store dismiss timestamp for 24-hour cooldown
    try {
      localStorage.setItem(APK_DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }, []);

  const smartInstall = useCallback(async () => {
    console.log('[Smart Install] Button clicked');
    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      const result = await installOrDownload();
      console.log('[Smart Install] Outcome:', result.outcome);

      if (result.outcome === 'apk_started') {
        setDownloadProgress(100);
        dismissPrompt('download_completed');
      }

      return result;
    } catch (error) {
      console.error('[Smart Install] Failed:', error);
      return { outcome: 'error', instructions: error.message };
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  }, [dismissPrompt]);

  // Show install button on all platforms (not just Android)
  const showInstallButton = isSecureContext();

  return {
    apkMetadata,
    metadataLoading,
    metadataError,
    downloadProgress,
    isDownloading,
    showPrompt: showPrompt && isAndroidDevice,
    smartInstall,
    dismissPrompt,
    showInstallButton,
    isAndroid: isAndroidDevice,
    isSecure: isSecureContext()
  };
};
