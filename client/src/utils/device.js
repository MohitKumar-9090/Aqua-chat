/**
 * Smart Download & Install — Device detection and platform-aware install router.
 *
 * Reuses existing helpers from pwa.js (isAndroid, isIos, promptInstall,
 * getDeferredInstallPrompt, getInstallInstructions) — zero duplication.
 */

import { APK_DOWNLOAD_URL, APP_STORE_URL } from '../config/download.js';
import {
  isAndroid as pwaIsAndroid,
  isIos as pwaIsIos,
  getDeferredInstallPrompt,
  getInstallInstructions,
  promptInstall
} from '../pwa.js';

/** True when the visitor is on an Android device. */
export const isAndroid = () => pwaIsAndroid();

/** True when the visitor is on an iPhone or iPad (including iPad Pro). */
export const isIOS = () => pwaIsIos();

/** True when the visitor is on a desktop / laptop (not Android, not iOS). */
export const isDesktop = () => !isAndroid() && !isIOS();

/** True when the browser's beforeinstallprompt event has been captured. */
export const supportsPWAInstall = () => Boolean(getDeferredInstallPrompt());

/**
 * Platform-aware install router.
 *
 * Android        → opens APK download in a new tab.
 * iOS            → redirects to App Store or returns "coming soon".
 * Desktop / other → triggers PWA install prompt or returns manual instructions.
 *
 * @returns {Promise<{ outcome: string, instructions?: string }>}
 */
export const installOrDownload = async () => {
  // ── Android ──────────────────────────────────────────────
  if (isAndroid()) {
    try {
      window.open(APK_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
    } catch {
      // Popup-blocked fallback — navigate the current tab.
      window.location.href = APK_DOWNLOAD_URL;
    }
    return { outcome: 'apk_started' };
  }

  // ── iOS (iPhone / iPad) ──────────────────────────────────
  if (isIOS()) {
    if (APP_STORE_URL) {
      window.open(APP_STORE_URL, '_blank', 'noopener,noreferrer');
      return { outcome: 'app_store' };
    }
    return { outcome: 'ios_coming_soon' };
  }

  // ── Desktop / ChromeOS / Linux / Unknown ─────────────────
  if (supportsPWAInstall()) {
    const choice = await promptInstall();
    if (choice.outcome === 'accepted') {
      return { outcome: 'pwa_installed' };
    }
    // User dismissed the native prompt — still provide fallback hint.
    return { outcome: 'pwa_manual', instructions: getInstallInstructions() };
  }

  // beforeinstallprompt not available — show manual instructions.
  return { outcome: 'pwa_manual', instructions: getInstallInstructions() };
};
