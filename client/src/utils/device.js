/**
 * Smart Download & Install — Device detection and platform-aware install router.
 *
 * Reuses existing helpers from pwa.js (isAndroid, isIos, promptInstall,
 * getDeferredInstallPrompt, getInstallInstructions) — zero duplication.
 */

import { GITHUB_RELEASES_API, GITHUB_RELEASES_PAGE, APP_STORE_URL } from '../config/download.js';
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
 * Resolve the direct APK download URL from the latest GitHub release.
 * Finds the first .apk asset dynamically — no hardcoded filenames.
 * Falls back to the GitHub releases page if the API call fails.
 *
 * @returns {Promise<string>}
 */
const resolveApkUrl = async () => {
  try {
    const res = await fetch(GITHUB_RELEASES_API, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const release = await res.json();
    const apkAsset = release.assets?.find((a) => a.name?.endsWith('.apk'));
    if (apkAsset?.browser_download_url) {
      return apkAsset.browser_download_url;
    }
  } catch (err) {
    console.warn('[Smart Install] GitHub API failed, using fallback:', err.message);
  }
  // Fallback: open the releases page so the user can download manually.
  return GITHUB_RELEASES_PAGE;
};

/**
 * Platform-aware install router.
 *
 * Android        → resolves latest APK from GitHub API and opens download.
 * iOS            → redirects to App Store or returns "coming soon".
 * Desktop / other → triggers PWA install prompt or returns manual instructions.
 *
 * @returns {Promise<{ outcome: string, instructions?: string }>}
 */
export const installOrDownload = async () => {
  // ── Android ──────────────────────────────────────────────
  if (isAndroid()) {
    const url = await resolveApkUrl();
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // Popup-blocked fallback — navigate the current tab.
      window.location.href = url;
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
