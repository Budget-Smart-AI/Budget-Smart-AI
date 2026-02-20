import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAStatus {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  platform: 'ios' | 'android' | 'desktop' | 'unknown';
}

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [status, setStatus] = useState<PWAStatus>({
    isInstallable: false,
    isInstalled: false,
    isIOS: false,
    isAndroid: false,
    isStandalone: false,
    platform: 'unknown',
  });

  useEffect(() => {
    // Detect platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    let platform: PWAStatus['platform'] = 'desktop';
    if (isIOS) platform = 'ios';
    else if (isAndroid) platform = 'android';

    setStatus(prev => ({
      ...prev,
      isIOS,
      isAndroid,
      isStandalone,
      isInstalled: isStandalone,
      platform,
      // iOS doesn't support beforeinstallprompt, but can still be installed
      isInstallable: isIOS && !isStandalone,
    }));

    // Listen for the beforeinstallprompt event (Chrome, Edge, etc.)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setStatus(prev => ({ ...prev, isInstallable: true }));
    };

    // Listen for successful installation
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setStatus(prev => ({
        ...prev,
        isInstalled: true,
        isInstallable: false,
        isStandalone: true,
      }));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return { success: false, reason: 'No install prompt available' };
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
        return { success: true, reason: 'User accepted installation' };
      } else {
        return { success: false, reason: 'User dismissed installation' };
      }
    } catch (error) {
      return { success: false, reason: 'Installation failed' };
    }
  }, [deferredPrompt]);

  return {
    ...status,
    promptInstall,
    canPrompt: !!deferredPrompt,
  };
}

// Register service worker
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });
        console.log('[PWA] Service worker registered:', registration.scope);

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available
                console.log('[PWA] New version available');
              }
            });
          }
        });
      } catch (error) {
        console.error('[PWA] Service worker registration failed:', error);
      }
    });
  }
}
