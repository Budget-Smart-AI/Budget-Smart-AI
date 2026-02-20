import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, Settings, Shield, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface CookiePreferences {
  essential: boolean; // Always true, cannot be disabled
  functional: boolean;
  performance: boolean;
  targeting: boolean;
}

const COOKIE_CONSENT_KEY = "budgetsmart_cookie_consent";
const COOKIE_PREFERENCES_KEY = "budgetsmart_cookie_preferences";

const defaultPreferences: CookiePreferences = {
  essential: true,
  functional: true,
  performance: true,
  targeting: true,
};

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(defaultPreferences);

  useEffect(() => {
    // Check if user has already consented
    const hasConsented = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!hasConsented) {
      // Small delay to avoid showing immediately on page load
      const timer = setTimeout(() => setShowBanner(true), 1000);
      return () => clearTimeout(timer);
    } else {
      // Load saved preferences
      const savedPreferences = localStorage.getItem(COOKIE_PREFERENCES_KEY);
      if (savedPreferences) {
        try {
          setPreferences(JSON.parse(savedPreferences));
        } catch {
          setPreferences(defaultPreferences);
        }
      }
    }
  }, []);

  // Listen for custom event to open settings
  useEffect(() => {
    const handleOpenSettings = () => setShowSettings(true);
    window.addEventListener("openCookieSettings", handleOpenSettings);
    return () => window.removeEventListener("openCookieSettings", handleOpenSettings);
  }, []);

  const savePreferences = (prefs: CookiePreferences) => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "true");
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify(prefs));
    setPreferences(prefs);
    setShowBanner(false);
    setShowSettings(false);
  };

  const handleAcceptAll = () => {
    savePreferences({
      essential: true,
      functional: true,
      performance: true,
      targeting: true,
    });
  };

  const handleRejectAll = () => {
    savePreferences({
      essential: true,
      functional: false,
      performance: false,
      targeting: false,
    });
  };

  const handleSavePreferences = () => {
    savePreferences(preferences);
  };

  const updatePreference = (key: keyof CookiePreferences, value: boolean) => {
    if (key === "essential") return; // Cannot disable essential cookies
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  const cookieTypes = [
    {
      key: "essential" as const,
      title: "Essential Cookies",
      description:
        "These cookies are necessary for the website to function and cannot be switched off. They are usually set in response to actions you take, such as setting your privacy preferences, logging in, or filling in forms.",
      alwaysActive: true,
    },
    {
      key: "functional" as const,
      title: "Functional Cookies",
      description:
        "These cookies enable personalized features and functionality. They may be set by us or by third-party providers whose services we have added to our pages. If you disable these cookies, some or all of these services may not function properly.",
      alwaysActive: false,
    },
    {
      key: "performance" as const,
      title: "Performance Cookies",
      description:
        "These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site. They help us know which pages are the most and least popular and see how visitors move around the site.",
      alwaysActive: false,
    },
    {
      key: "targeting" as const,
      title: "Targeting Cookies",
      description:
        "These cookies may be set through our site by our advertising partners. They may be used by those companies to build a profile of your interests and show you relevant advertisements on other sites.",
      alwaysActive: false,
    },
  ];

  if (!showBanner && !showSettings) return null;

  return (
    <>
      {/* Cookie Banner */}
      <AnimatePresence>
        {showBanner && !showSettings && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6"
          >
            <div className="max-w-4xl mx-auto bg-background border border-border rounded-lg shadow-2xl p-4 md:p-6">
              <div className="flex items-start gap-4">
                <div className="hidden sm:flex w-12 h-12 rounded-full bg-primary/10 items-center justify-center flex-shrink-0">
                  <Cookie className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Cookie className="w-5 h-5 sm:hidden text-primary" />
                      Cookies at Budget Smart AI
                    </h3>
                    <button
                      onClick={handleRejectAll}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-muted-foreground text-sm mb-4">
                    We respect your right to privacy, so you can choose which types of cookies to allow.
                    Click each cookie type below for details on how we use them to improve your experience.{" "}
                    <Link href="/privacy" className="text-primary hover:underline">
                      Cookie Policy
                    </Link>
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button onClick={handleAcceptAll} className="flex-1 sm:flex-none">
                      Accept All
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowSettings(true)}
                      className="flex-1 sm:flex-none"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Manage Preferences
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleRejectAll}
                      className="flex-1 sm:flex-none text-muted-foreground"
                    >
                      Reject All
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cookie Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Manage Consent Preferences
            </DialogTitle>
            <DialogDescription>
              Choose which types of cookies you want to allow. Your preferences will be saved for future visits.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <Accordion type="single" collapsible className="space-y-2">
              {cookieTypes.map((cookie) => (
                <AccordionItem
                  key={cookie.key}
                  value={cookie.key}
                  className="border rounded-lg px-4"
                >
                  <div className="flex items-center justify-between py-4">
                    <AccordionTrigger className="hover:no-underline flex-1 text-left">
                      <span className="font-medium">{cookie.title}</span>
                    </AccordionTrigger>
                    <div className="flex items-center gap-3 ml-4">
                      {cookie.alwaysActive ? (
                        <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded">
                          Always Active
                        </span>
                      ) : (
                        <Switch
                          checked={preferences[cookie.key]}
                          onCheckedChange={(checked) => updatePreference(cookie.key, checked)}
                          aria-label={`Toggle ${cookie.title}`}
                        />
                      )}
                    </div>
                  </div>
                  <AccordionContent className="pb-4">
                    <p className="text-muted-foreground text-sm">{cookie.description}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-6 pt-4 border-t">
            <Button onClick={handleSavePreferences} className="flex-1">
              Save Preferences
            </Button>
            <Button variant="outline" onClick={handleAcceptAll} className="flex-1">
              Accept All
            </Button>
            <Button variant="ghost" onClick={handleRejectAll} className="flex-1">
              Reject All
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center mt-4">
            See our{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>{" "}
            for more information about how we use your data.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Hook to check cookie preferences programmatically
export function useCookiePreferences(): CookiePreferences {
  const [preferences, setPreferences] = useState<CookiePreferences>(defaultPreferences);

  useEffect(() => {
    const savedPreferences = localStorage.getItem(COOKIE_PREFERENCES_KEY);
    if (savedPreferences) {
      try {
        setPreferences(JSON.parse(savedPreferences));
      } catch {
        setPreferences(defaultPreferences);
      }
    }
  }, []);

  return preferences;
}

// Function to open cookie settings (can be called from footer links)
export function openCookieSettings() {
  // Dispatch a custom event that the CookieConsent component can listen to
  window.dispatchEvent(new CustomEvent("openCookieSettings"));
}
