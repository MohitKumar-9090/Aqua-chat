import { useCallback, useEffect, useState } from 'react';
import {
  clearDeferredInstallPrompt,
  getInstallInstructions,
  isIos,
  isPwaDisplayMode,
  isSecureContext,
  promptInstall,
  subscribeInstallPrompt
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
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const onDisplayChange = () => setIsStandalone(isPwaDisplayMode());
    media.addEventListener?.('change', onDisplayChange);

    const unsubscribe = subscribeInstallPrompt((event) => {
      setDeferredPrompt(event);
      if (event && !isPwaDisplayMode()) {
        setShowPrompt(true);
      }
    });

    const onInstalled = () => {
      setIsStandalone(true);
      setShowPrompt(false);
      clearDeferredInstallPrompt();
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', onInstalled);

    const timer = window.setTimeout(() => {
      if (!isPwaDisplayMode() && isSecureContext() && !wasDismissedRecently()) {
        setShowPrompt(true);
      }
    }, 2000);

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
    dismissPrompt();
    return { outcome: 'manual', instructions: getInstallInstructions() };
  }, [deferredPrompt, dismissPrompt]);

  const openPrompt = useCallback(() => {
    if (!isStandalone) setShowPrompt(true);
  }, [isStandalone]);

  return {
    canInstall: Boolean(deferredPrompt),
    isStandalone,
    isIos: isIos(),
    showPrompt: showPrompt && !isStandalone,
    installInstructions: getInstallInstructions(),
    install,
    dismissPrompt,
    openPrompt,
    isSecure: isSecureContext()
  };
};
