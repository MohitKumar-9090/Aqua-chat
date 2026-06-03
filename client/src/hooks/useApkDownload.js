import { useCallback, useEffect, useState } from 'react';
import { isAndroid, isIos, isPwaDisplayMode, isSecureContext } from '../pwa.js';
import { requestNotificationPermission } from '../pwa.js';

const APK_DOWNLOAD_KEY = 'aquachat_apk_dismissed_at';
const DISMISS_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

const wasDismissedRecently = () => {
  try {
    const dismissedAt = Number(localStorage.getItem(APK_DOWNLOAD_KEY) || 0);
    return dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS;
  } catch {
    return false;
  }
};

export const useApkDownload = () => {
  const [apkMetadata, setApkMetadata] = useState({
    name: 'AquaChat',
    version: 'v1.0.0',
    size: 'Loading...',
    available: true
  });
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [metadataError, setMetadataError] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  // Fetch APK metadata on mount
  useEffect(() => {
    const fetchApkMetadata = async () => {
      try {
        setMetadataLoading(true);
        setMetadataError(false);
        const response = await fetch('/api/apk-info');
        if (!response.ok) {
          throw new Error(`Failed to fetch APK metadata: ${response.statusText}`);
        }
        const metadata = await response.json();
        setApkMetadata(metadata);
        
        if (!metadata.available) {
          setMetadataError(true);
        }
      } catch (error) {
        console.error('[APK] Metadata fetch failed:', error);
        setMetadataError(true);
        setApkMetadata(prev => ({
          ...prev,
          size: 'unavailable',
          available: false
        }));
      } finally {
        setMetadataLoading(false);
      }
    };

    fetchApkMetadata();
  }, []);

  // Show prompt after metadata loads
  useEffect(() => {
    if (metadataLoading) return;
    
    const timer = window.setTimeout(() => {
      if (!isPwaDisplayMode() && isSecureContext() && !wasDismissedRecently() && apkMetadata.available) {
        setShowPrompt(true);
      }
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [metadataLoading, apkMetadata.available]);

  const dismissPrompt = useCallback(() => {
    setShowPrompt(false);
    try {
      localStorage.setItem(APK_DOWNLOAD_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }, []);

  const downloadApk = useCallback(async () => {
    if (isDownloading || !apkMetadata.available) return;
    
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
      if (isAndroid()) {
        // Attempt to open the file with system handler
        setTimeout(() => {
          window.location.href = 'content://downloads/AquaChat.apk';
        }, 1000);
      }

      setDownloadProgress(100);
      dismissPrompt();
      
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
  }, [isDownloading, dismissPrompt, apkMetadata.available]);

  const showInstallButton = !isPwaDisplayMode() && isSecureContext() && apkMetadata.available;

  return {
    apkMetadata,
    metadataLoading,
    metadataError,
    downloadProgress,
    isDownloading,
    showPrompt: showPrompt && !isPwaDisplayMode() && apkMetadata.available,
    downloadApk,
    dismissPrompt,
    showInstallButton,
    isIos: isIos(),
    isAndroid: isAndroid(),
    isSecure: isSecureContext()
  };
};
