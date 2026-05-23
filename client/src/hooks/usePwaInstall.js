import { useCallback, useEffect, useState } from 'react';
import {
  clearDeferredInstallPrompt,
  getInstallInstructions,
  hasActiveServiceWorker,
  isDesktopChromium,
  isIos,
  isPwaDisplayMode,
  isSecureContext,
  promptInstall,
  subscribeInstallPrompt,
  waitForServiceWorker
} from '../pwa.js';

const INSTALL_DISMISS_KEY = 'aquachat_install_dismissed_at';
const DISMISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const wasDismissedRecently = () => {
  try {
    const dismissedAt = Number(localStorage.getItem(INSTALL_DISMISS_KEY) || 0);
    return dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS;
  } catch {
    return false;
  }
};

export const usePwaInstall = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(isPwaDisplayMode);
  const [swReady, setSwReady] = useState(hasActiveServiceWorker);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const onDisplayChange = () => setIsStandalone(isPwaDisplayMode());
    media.addEventListener?.('change', onDisplayChange);

    const unsubscribe = subscribeInstallPrompt((event) => {
      setDeferredPrompt(event);
      if (event && !isPwaDisplayMode()) setShowPrompt(true);
    });

    const onInstalled = () => {
      setIsStandalone(true);
      setShowPrompt(false);
      clearDeferredInstallPrompt();
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', onInstalled);

    waitForServiceWorker().then(() => {
      setSwReady(hasActiveServiceWorker());
    });

    const timer = window.setTimeout(() => {
      if (!isPwaDisplayMode() && isSecureContext() && !wasDismissedRecently()) {
        setShowPrompt(true);
      }
    }, 3500);

    return () => {
      media.removeEventListener?.('change', onDisplayChange);
      unsubscribe();
      window.removeEventListener('appinstalled', onInstalled);
      window.clearTimeout(timer);
    };
  }, []);

  const dismissPrompt = useCallback(() => {
    setShowPrompt(false);
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }, []);

  const install = useCallback(async () => {
    if (deferredPrompt) {
      const choice = await promptInstall();
      setDeferredPrompt(null);
      setShowPrompt(false);
      return choice;
    }
    return { outcome: 'manual', instructions: getInstallInstructions() };
  }, [deferredPrompt]);

  const openPrompt = useCallback(() => {
    if (!isStandalone) setShowPrompt(true);
  }, [isStandalone]);

  const canInstall = Boolean(deferredPrompt);
  const showInstallButton = !isStandalone && isSecureContext();
  const installHint =
    canInstall
      ? 'Install AquaChat as a desktop app'
      : isDesktopChromium()
        ? 'Install via Chrome menu (⋮) → Install AquaChat, or look for the install icon in the address bar'
        : getInstallInstructions();

  return {
    canInstall,
    showInstallButton,
    swReady,
    isStandalone,
    isIos: isIos(),
    isDesktopChromium: isDesktopChromium(),
    showPrompt: showPrompt && !isStandalone,
    installInstructions: installHint,
    install,
    dismissPrompt,
    openPrompt,
    isSecure: isSecureContext()
  };
};
