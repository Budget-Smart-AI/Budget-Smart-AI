import { useState, useEffect } from "react";
import { Switch, Route, useLocation, Redirect, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { CookieConsent } from "@/components/cookie-consent";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationsDropdown } from "@/components/notifications-dropdown";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { FloatingChatbot } from "@/components/floating-chatbot";
import { SubscriptionGate } from "@/components/subscription-gate";
import Dashboard from "@/pages/dashboard";
import Bills from "@/pages/bills";
import Income from "@/pages/income";
import Budgets from "@/pages/budgets";
import SavingsGoals from "@/pages/savings-goals";
import Reports from "@/pages/reports";
import Settings from "@/pages/settings";
import BankAccounts from "@/pages/bank-accounts";
import AdminUsers from "@/pages/admin-users";
import AIAssistant from "@/pages/ai-assistant";
import Subscriptions from "@/pages/subscriptions";
import Categories from "@/pages/categories";
import EmailSettings from "@/pages/email-settings";
import Login from "@/pages/login";
import Privacy from "@/pages/privacy";
import Terms from "@/pages/terms";
import CookiePolicy from "@/pages/cookies";
import GdprPolicy from "@/pages/gdpr";
import CcpaPolicy from "@/pages/ccpa";
import Contact from "@/pages/contact";
import DataRetention from "@/pages/data-retention";
import Security from "@/pages/security";
import TrustCenter from "@/pages/trust";
import Support from "@/pages/support";
import Help from "@/pages/help";
import InvitationPage from "@/pages/invitation";
import VerifyEmailPendingPage from "@/pages/verify-email-pending";
import VerifyEmailPage from "@/pages/verify-email";
import SetupMfaPage from "@/pages/setup-mfa";
import DebtPayoff from "@/pages/debt-payoff";
import Debts from "@/pages/debts";
import Investments from "@/pages/investments";
import Assets from "@/pages/assets";
import NetWorth from "@/pages/net-worth";
import FinancialCalendar from "@/pages/calendar";
import SplitExpenses from "@/pages/split-expenses";
import LandingPage from "@/pages/landing";
import AdminLanding from "@/pages/admin-landing";
import AdminSalesChat from "@/pages/admin-sales-chat";
import AdminSupport from "@/pages/admin-support";
import AdminAIManagement from "@/pages/admin-ai-management";
import AnomaliesPage from "@/pages/anomalies";
import AffiliatePage from "@/pages/affiliate";
import AffiliateTerms from "@/pages/affiliate-terms";
import SignupPage from "@/pages/signup";
import Simulator from "@/pages/simulator";
import Receipts from "@/pages/receipts";
import VaultPage from "@/pages/vault";
import NotFound from "@/pages/not-found";
import DemoPage from "@/pages/demo";
import { Loader2 } from "lucide-react";

function ProtectedRouter({ onLogout, isAdmin }: { onLogout: () => void; isAdmin: boolean }) {
  return (
    <Switch>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/"><Redirect to="/dashboard" /></Route>
      <Route path="/bills" component={Bills} />
      <Route path="/income" component={Income} />
      <Route path="/budgets" component={Budgets} />
      <Route path="/savings" component={SavingsGoals} />
      <Route path="/reports" component={Reports} />
      <Route path="/accounts" component={BankAccounts} />
      {/* Backwards compatibility redirects */}
      <Route path="/bank-accounts"><Redirect to="/accounts" /></Route>
      <Route path="/expenses"><Redirect to="/accounts" /></Route>
      <Route path="/other-expenses"><Redirect to="/accounts" /></Route>
      <Route path="/subscriptions" component={Subscriptions} />
      <Route path="/categories" component={Categories} />
      <Route path="/email-settings" component={EmailSettings} />
      <Route path="/settings">
        <Settings onLogout={onLogout} />
      </Route>
      <Route path="/ai-assistant" component={AIAssistant} />
      <Route path="/debts" component={Debts} />
      <Route path="/debt-payoff" component={DebtPayoff} />
      <Route path="/investments" component={Investments} />
      <Route path="/assets" component={Assets} />
      <Route path="/net-worth" component={NetWorth} />
      <Route path="/calendar" component={FinancialCalendar} />
      <Route path="/split-expenses" component={SplitExpenses} />
      <Route path="/simulator" component={Simulator} />
      <Route path="/receipts" component={Receipts} />
      <Route path="/vault" component={VaultPage} />
      <Route path="/anomalies" component={AnomaliesPage} />
      <Route path="/support" component={Support} />
      <Route path="/help" component={Help} />
      {isAdmin && (
        <>
          <Route path="/admin/users" component={AdminUsers} />
          <Route path="/admin/landing" component={AdminLanding} />
          <Route path="/admin/sales-chat" component={AdminSalesChat} />
          <Route path="/admin/support" component={AdminSupport} />
          <Route path="/admin/ai-management" component={AdminAIManagement} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp({ onLogout, isAdmin, username, isDemo }: { onLogout: () => void; isAdmin: boolean; username: string; isDemo: boolean }) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checkingPendingCheckout, setCheckingPendingCheckout] = useState(true);
  const [location, setLocation] = useLocation();

  const { data: onboardingStatus } = useQuery<{ onboardingComplete: boolean }>({
    queryKey: ["/api/onboarding/status"],
  });

  // Check for pending checkout after OAuth login
  useEffect(() => {
    const checkPendingCheckout = async () => {
      const pendingCheckoutStr = localStorage.getItem("pendingCheckout");
      if (pendingCheckoutStr) {
        try {
          const pendingCheckout = JSON.parse(pendingCheckoutStr);
          // Clear the pending checkout immediately to prevent loops
          localStorage.removeItem("pendingCheckout");

          if (pendingCheckout.priceId && pendingCheckout.planId) {
            // Create checkout session and redirect
            const response = await fetch("/api/stripe/create-checkout-session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                priceId: pendingCheckout.priceId,
                planId: pendingCheckout.planId,
              }),
            });

            if (response.ok) {
              const data = await response.json();
              if (data.url) {
                window.location.href = data.url;
                return; // Don't set checkingPendingCheckout to false, we're redirecting
              }
            }
          }
        } catch (e) {
          console.error("Error processing pending checkout:", e);
          localStorage.removeItem("pendingCheckout");
        }
      }
      setCheckingPendingCheckout(false);
    };

    checkPendingCheckout();
  }, []);

  useEffect(() => {
    if (onboardingStatus && !onboardingStatus.onboardingComplete) {
      setShowOnboarding(true);
    }
  }, [onboardingStatus]);

  useEffect(() => {
    if (location === "/setup-wizard") {
      setShowOnboarding(true);
      setLocation("/");
    }
  }, [location, setLocation]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
  };

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  // Show loading while checking for pending checkout
  if (checkingPendingCheckout) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SubscriptionGate isAdmin={isAdmin} isDemo={isDemo}>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar isAdmin={isAdmin} username={username} />
          <div className="flex flex-col flex-1 overflow-hidden">
            {isDemo && (
              <div className="bg-amber-500/90 text-amber-950 px-4 py-2 text-center text-sm font-medium" data-testid="banner-demo-mode">
                <span className="inline-flex items-center gap-2 flex-wrap justify-center">
                  You're viewing the demo with sample data. This is read-only mode.
                  <Link href="/signup" className="underline font-semibold" data-testid="link-demo-signup">
                    Sign up for full access
                  </Link>
                </span>
              </div>
            )}
            <header className="flex items-center justify-between gap-2 p-3 border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-2">
                <NotificationsDropdown />
                <ThemeToggle />
              </div>
            </header>
            <main className="flex-1 overflow-auto p-6">
              <ProtectedRouter onLogout={onLogout} isAdmin={isAdmin} />
            </main>
          </div>
        </div>
        <OnboardingWizard open={showOnboarding} onComplete={handleOnboardingComplete} isDemo={isDemo} />
        <PWAInstallPrompt />
        <FloatingChatbot />
      </SidebarProvider>
    </SubscriptionGate>
  );
}

function AuthGatedContent() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState("");

  const { data: session, isLoading } = useQuery({
    queryKey: ["/api/auth/session"],
    retry: false,
  });

  useEffect(() => {
    if (!isLoading && session) {
      setIsAuthenticated((session as any).authenticated === true);
      setIsAdmin((session as any).isAdmin === true);
      setUsername((session as any).username || "");
    }
  }, [session, isLoading]);

  const handleLoginSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    // Clear ALL cached data to prevent data leakage between users
    queryClient.clear();
    setIsAuthenticated(false);
    setIsAdmin(false);
    setUsername("");
  };

  if (isLoading || isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not authenticated - show login page
  return <Login onLoginSuccess={handleLoginSuccess} />;
}

function AuthenticatedOrRedirect() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [username, setUsername] = useState("");
  const [, setLocation] = useLocation();

  const { data: session, isLoading } = useQuery({
    queryKey: ["/api/auth/session"],
    retry: false,
  });

  useEffect(() => {
    if (!isLoading && session) {
      const authenticated = (session as any).authenticated === true;
      setIsAuthenticated(authenticated);
      setIsAdmin((session as any).isAdmin === true);
      setIsDemo((session as any).isDemo === true);
      setUsername((session as any).username || "");

      // If authenticated and on root, redirect to dashboard
      if (authenticated && window.location.pathname === "/") {
        setLocation("/dashboard");
      }
    }
  }, [session, isLoading, setLocation]);

  const handleLogout = () => {
    // Clear ALL cached data to prevent data leakage between users
    queryClient.clear();
    setIsAuthenticated(false);
    setIsAdmin(false);
    setIsDemo(false);
    setUsername("");
    setLocation("/");
  };

  if (isLoading || isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not authenticated - check domain
  if (!isAuthenticated) {
    // Check if we're on app.budgetsmart.io
    const isAppDomain = window.location.hostname === 'app.budgetsmart.io';
    
    if (isAppDomain) {
      // On app domain but not authenticated - redirect to login
      window.location.href = '/login';
      return (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2">Redirecting to login...</span>
        </div>
      );
    }

    // On main domain – admin paths must go through the CMS on the app subdomain
    // so there is only one management interface and one login.
    if (window.location.pathname.startsWith('/admin')) {
      // Only forward the pathname (no search params) to avoid open-redirect issues.
      window.location.href = `https://app.budgetsmart.io${window.location.pathname}`;
      return (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2">Redirecting to admin...</span>
        </div>
      );
    }
    
    // On main domain (budgetsmart.io) - show landing page
    return <LandingPage />;
  }

  return <AuthenticatedApp onLogout={handleLogout} isAdmin={isAdmin} username={username} isDemo={isDemo} />;
}

function AppContent() {
  return (
    <Switch>
      {/* Public pages */}
      <Route path="/login" component={AuthGatedContent} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/pricing" component={LandingPage} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/cookies" component={CookiePolicy} />
      <Route path="/gdpr" component={GdprPolicy} />
      <Route path="/ccpa" component={CcpaPolicy} />
      <Route path="/affiliate" component={AffiliatePage} />
      <Route path="/affiliate-terms" component={AffiliateTerms} />
      <Route path="/contact" component={Contact} />
      <Route path="/data-retention" component={DataRetention} />
      <Route path="/security" component={Security} />
      <Route path="/trust" component={TrustCenter} />
      <Route path="/invitation/:token" component={InvitationPage} />
      <Route path="/verify-email-pending" component={VerifyEmailPendingPage} />
      <Route path="/verify-email/:token" component={VerifyEmailPage} />
      <Route path="/setup-mfa" component={SetupMfaPage} />
      <Route path="/demo" component={DemoPage} />
      {/* Root and authenticated routes */}
      <Route>
        <AuthenticatedOrRedirect />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="budget-theme">
        <TooltipProvider>
          <AppContent />
          <Toaster />
          <CookieConsent />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
