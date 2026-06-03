import { useCallback, useEffect, useState } from 'react';
import { isAndroid, isIos, isPwaDisplayMode, isSecureContext } from '../pwa.js';
import { requestNotificationPermission } from '../pwa.js';

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
    name: 'AquaChat',
    version: 'Latest',
    size: 'Loading...',
    available: true
  });
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [metadataError, setMetadataError] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const isAndroidDevice = isAndroid();

  // Fetch APK metadata on mount
  useEffect(() => {
    const fetchApkMetadata = async () => {
      try {
        setMetadataLoading(true);
        setMetadataError(false);
        console.log('[APK] Fetching metadata...');
        
        const response = await fetch('/api/apk-info');
        if (!response.ok) {
          throw new Error(`Failed to fetch APK metadata: ${response.statusText}`);
        }
        const metadata = await response.json();
        console.log('[APK] Metadata loaded:', metadata);
        setApkMetadata(metadata);
        
        if (!metadata.available) {
          setMetadataError(true);
        }
      } catch (error) {
        console.error('[APK] Metadata fetch failed:', error);
        setMetadataError(true);
        setApkMetadata(prev => ({
          ...prev,
          size: 'Latest Version',
          available: true // Still allow download even if metadata fails
        }));
      } finally {
        setMetadataLoading(false);
      }
    };

    fetchApkMetadata();
  }, []);

  // Show first-visit prompt on Android devices
  useEffect(() => {
    if (metadataLoading) return;
    
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

  const downloadApk = useCallback(async () => {
    if (isDownloading || !apkMetadata.available) return;
    
    console.log('[APK Install] Download started');
    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      const response = await fetch('/downloads/AquaChat.apk');
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Get total size for progress tracking
      const contentLength = response.headers.get('content-length');
      const total = parseInt(contentLength, 10);

      // Create readable stream for progress tracking
      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        loaded += value.length;
        
        if (total) {
          const percentComplete = Math.round((loaded / total) * 100);
          setDownloadProgress(percentComplete);
        }
      }

      // Combine chunks into blob
      const blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' });
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'AquaChat.apk';
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      window.URL.revokeObjectURL(url);

      // Open Android installer if on Android
      if (isAndroidDevice) {
        // Attempt to open the file with system handler
        setTimeout(() => {
          window.location.href = 'content://downloads/AquaChat.apk';
        }, 1000);
      }

      setDownloadProgress(100);
      console.log('[APK Install] Download completed');
      dismissPrompt('download_completed');
      
      return { success: true };
    } catch (error) {
      console.error('APK download failed:', error);
      setDownloadProgress(0);
      return { success: false, error: error.message };
    } finally {
      setIsDownloading(false);
      // Reset progress after delay
      setTimeout(() => {
        setDownloadProgress(0);
      }, 2000);
    }
  }, [isDownloading, dismissPrompt, apkMetadata.available, isAndroidDevice]);

  const showInstallButton = isAndroidDevice;

  return {
    apkMetadata,
    metadataLoading,
    metadataError,
    downloadProgress,
    isDownloading,
    showPrompt: showPrompt && isAndroidDevice,
    downloadApk,
    dismissPrompt,
    showInstallButton,
    isAndroid: isAndroidDevice,
    isSecure: isSecureContext()
  };
};
