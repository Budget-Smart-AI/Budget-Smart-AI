import { useState, useEffect } from "react";
import { usePWA } from "@/hooks/use-pwa";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Smartphone,
  Monitor,
  Share,
  Plus,
  MoreVertical,
  X,
  CheckCircle2,
  Zap,
  Wifi,
  Bell
} from "lucide-react";

export function PWAInstallPrompt() {
  const { isInstallable, isInstalled, isIOS, platform, promptInstall, canPrompt } = usePWA();
  const [showBanner, setShowBanner] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user previously dismissed the banner
    const wasDismissed = localStorage.getItem('pwa-banner-dismissed');
    if (wasDismissed) {
      const dismissedTime = parseInt(wasDismissed, 10);
      // Show again after 7 days
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
        setDismissed(true);
        return;
      }
    }

    // Show banner if installable and not already installed
    if (isInstallable && !isInstalled && !dismissed) {
      // Delay showing the banner for better UX
      const timer = setTimeout(() => setShowBanner(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [isInstallable, isInstalled, dismissed]);

  const handleInstall = async () => {
    if (canPrompt) {
      const result = await promptInstall();
      if (result.success) {
        setShowBanner(false);
      }
    } else if (isIOS) {
      setShowInstructions(true);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setDismissed(true);
    localStorage.setItem('pwa-banner-dismissed', Date.now().toString());
  };

  if (isInstalled || (!isInstallable && !canPrompt)) {
    return null;
  }

  return (
    <>
      {/* Floating Install Banner */}
      {showBanner && (
        <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96 animate-in slide-in-from-bottom-4">
          <Card className="shadow-lg border-primary/20 bg-gradient-to-r from-background to-primary/5">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Download className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Install Budget Smart AI</CardTitle>
                    <CardDescription className="text-xs">
                      Get the full app experience
                    </CardDescription>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 -mt-1 -mr-2"
                  onClick={handleDismiss}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2 mb-3">
                <Badge variant="secondary" className="text-xs">
                  <Zap className="w-3 h-3 mr-1" />
                  Faster
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  <Wifi className="w-3 h-3 mr-1" />
                  Offline
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  <Bell className="w-3 h-3 mr-1" />
                  Notifications
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleInstall} size="sm" className="flex-1">
                  {isIOS ? "How to Install" : "Install Now"}
                </Button>
                <Button onClick={handleDismiss} variant="outline" size="sm">
                  Later
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* iOS Installation Instructions Dialog */}
      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5" />
              Install on {isIOS ? "iPhone/iPad" : "Your Device"}
            </DialogTitle>
            <DialogDescription>
              Follow these steps to add Budget Smart AI to your home screen
            </DialogDescription>
          </DialogHeader>

          {isIOS ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  1
                </div>
                <div className="flex-1">
                  <p className="font-medium">Tap the Share button</p>
                  <p className="text-sm text-muted-foreground">
                    Look for the <Share className="w-4 h-4 inline mx-1" /> icon at the bottom of Safari
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-medium">Select "Add to Home Screen"</p>
                  <p className="text-sm text-muted-foreground">
                    Scroll down and tap <Plus className="w-4 h-4 inline mx-1" /> Add to Home Screen
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  3
                </div>
                <div className="flex-1">
                  <p className="font-medium">Tap "Add"</p>
                  <p className="text-sm text-muted-foreground">
                    Confirm by tapping Add in the top right corner
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <p className="text-sm text-green-700 dark:text-green-300">
                  The app will appear on your home screen!
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  1
                </div>
                <div className="flex-1">
                  <p className="font-medium">Tap the menu button</p>
                  <p className="text-sm text-muted-foreground">
                    Look for <MoreVertical className="w-4 h-4 inline mx-1" /> in your browser
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-medium">Select "Install app" or "Add to Home screen"</p>
                  <p className="text-sm text-muted-foreground">
                    The option may vary by browser
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <p className="text-sm text-green-700 dark:text-green-300">
                  The app will be installed on your device!
                </p>
              </div>
            </div>
          )}

          <Button onClick={() => setShowInstructions(false)} className="w-full mt-2">
            Got it!
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Card for Settings page showing install status and instructions
export function PWAInstallCard() {
  const { isInstalled, isInstallable, isIOS, platform, promptInstall, canPrompt } = usePWA();
  const [showInstructions, setShowInstructions] = useState(false);

  const handleInstall = async () => {
    if (canPrompt) {
      await promptInstall();
    } else {
      setShowInstructions(true);
    }
  };

  const getPlatformIcon = () => {
    switch (platform) {
      case 'ios':
      case 'android':
        return <Smartphone className="w-5 h-5" />;
      default:
        return <Monitor className="w-5 h-5" />;
    }
  };

  const getPlatformName = () => {
    switch (platform) {
      case 'ios':
        return 'iPhone/iPad';
      case 'android':
        return 'Android';
      default:
        return 'Desktop';
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Install App
          </CardTitle>
          <CardDescription>
            Install Budget Smart AI on your device for the best experience
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getPlatformIcon()}
              <div>
                <p className="font-medium">
                  {isInstalled ? "App Installed" : `Install on ${getPlatformName()}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isInstalled
                    ? "You're using the installed app"
                    : "Add to your home screen for quick access"}
                </p>
              </div>
            </div>
            {isInstalled ? (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Installed
              </Badge>
            ) : null}
          </div>

          {!isInstalled && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-lg bg-muted/50">
                  <Zap className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-xs font-medium">Faster</p>
                  <p className="text-xs text-muted-foreground">Quick loading</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <Wifi className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-xs font-medium">Offline</p>
                  <p className="text-xs text-muted-foreground">Works offline</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <Bell className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-xs font-medium">Alerts</p>
                  <p className="text-xs text-muted-foreground">Push notifications</p>
                </div>
              </div>

              <Button onClick={handleInstall} className="w-full">
                <Download className="w-4 h-4 mr-2" />
                {canPrompt ? "Install Now" : "How to Install"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Installation Instructions Dialog */}
      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getPlatformIcon()}
              Install on {getPlatformName()}
            </DialogTitle>
            <DialogDescription>
              Follow these steps to install Budget Smart AI
            </DialogDescription>
          </DialogHeader>

          {platform === 'ios' ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                  1
                </div>
                <div className="flex-1">
                  <p className="font-medium">Tap the Share button</p>
                  <p className="text-sm text-muted-foreground">
                    Look for the <Share className="w-4 h-4 inline mx-1" /> icon at the bottom of Safari
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-medium">Scroll and tap "Add to Home Screen"</p>
                  <p className="text-sm text-muted-foreground">
                    Look for <Plus className="w-4 h-4 inline mx-1" /> Add to Home Screen
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                  3
                </div>
                <div className="flex-1">
                  <p className="font-medium">Tap "Add" to confirm</p>
                  <p className="text-sm text-muted-foreground">
                    The app icon will appear on your home screen
                  </p>
                </div>
              </div>
            </div>
          ) : platform === 'android' ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                  1
                </div>
                <div className="flex-1">
                  <p className="font-medium">Tap the menu button</p>
                  <p className="text-sm text-muted-foreground">
                    Look for <MoreVertical className="w-4 h-4 inline mx-1" /> in Chrome
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-medium">Tap "Install app" or "Add to Home screen"</p>
                  <p className="text-sm text-muted-foreground">
                    Follow the prompts to install
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                  1
                </div>
                <div className="flex-1">
                  <p className="font-medium">Look for the install icon</p>
                  <p className="text-sm text-muted-foreground">
                    In Chrome/Edge, look for <Download className="w-4 h-4 inline mx-1" /> in the address bar
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-medium">Click "Install"</p>
                  <p className="text-sm text-muted-foreground">
                    The app will be added to your applications
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <p className="text-sm text-green-700 dark:text-green-300">
              Once installed, open the app from your home screen for the best experience!
            </p>
          </div>

          <Button onClick={() => setShowInstructions(false)} className="w-full">
            Got it!
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
