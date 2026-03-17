import { useState, useEffect } from "react";
import { Switch, Route, useLocation, Redirect, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeContextProvider } from "@/contexts/ThemeContext";
import { CookieConsent } from "@/components/cookie-consent";
import { ThemeQuickSwitcher } from "@/components/ui/ThemeQuickSwitcher";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TopNavBar } from "@/components/TopNavBar";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { FloatingChatbot } from "@/components/floating-chatbot";
import { FeatureUsageProvider } from "@/contexts/FeatureUsageContext";
import { SubscriptionGate } from "@/components/subscription-gate";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon } from "lucide-react";
import { useLogout } from "@/hooks/use-logout";
import Dashboard from "@/pages/dashboard";
import Bills from "@/pages/bills";
import ExpensesPage from "@/pages/expenses";
import Income from "@/pages/income";
import Budgets from "@/pages/budgets";
import SavingsGoals from "@/pages/savings-goals";
import Reports from "@/pages/reports";
import Settings from "@/pages/settings";
import MerchantsPage from "@/pages/merchants";
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
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import DebtPayoff from "@/pages/debt-payoff";
import Debts from "@/pages/debts";
import Liabilities from "@/pages/liabilities";
import Investments from "@/pages/investments";
import Assets from "@/pages/assets";
import NetWorth from "@/pages/net-worth";
import FinancialCalendar from "@/pages/calendar";
import SplitExpenses from "@/pages/split-expenses";
import LandingPage from "@/pages/landing";
import AdminSalesChat from "@/pages/admin-sales-chat";
import AdminSupport from "@/pages/admin-support";
import AdminBankProviders from "@/pages/admin-bank-providers";
import AdminAuditLog from "@/pages/admin-audit-log";
import AdminSystemStatus from "@/pages/admin-system-status";
import AdminPlanFeatures from "@/pages/admin-plan-features";
import AdminCommunications from "@/pages/admin-communications";
import AdminAIModels from "@/pages/admin-ai-models";
import AnomaliesPage from "@/pages/anomalies";
import AffiliatePage from "@/pages/affiliate";
import AffiliateTerms from "@/pages/affiliate-terms";
import SignupPage from "@/pages/signup";
import Simulator from "@/pages/simulator";
import Receipts from "@/pages/receipts";
import VaultPage from "@/pages/vault";
import TaxReport from "@/pages/tax-report";
import TaxSmartPage from "@/pages/tax-smart";
import NotFound from "@/pages/not-found";
import DemoPage from "@/pages/demo";
import UpgradePage from "@/pages/upgrade";
import RedeemPage from "@/pages/redeem";
import { Loader2 } from "lucide-react";
import { SystemAlertBanner } from "@/components/system-alert-banner";

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
      <Route path="/expenses" component={ExpensesPage} />
      <Route path="/other-expenses"><Redirect to="/accounts" /></Route>
      <Route path="/subscriptions" component={Subscriptions} />
      <Route path="/categories" component={Categories} />
      <Route path="/email-settings" component={EmailSettings} />
      <Route path="/settings"><Redirect to="/settings/profile" /></Route>
      <Route path="/settings/profile">
        <Settings onLogout={onLogout} />
      </Route>
      <Route path="/settings/security">
        <Settings onLogout={onLogout} />
      </Route>
      <Route path="/settings/household">
        <Settings onLogout={onLogout} />
      </Route>
      <Route path="/settings/preferences">
        <Settings onLogout={onLogout} />
      </Route>
      <Route path="/settings/accounts">
        <Settings onLogout={onLogout} />
      </Route>
      <Route path="/settings/categories">
        <Settings onLogout={onLogout} />
      </Route>
      <Route path="/settings/merchants">
        <Settings onLogout={onLogout} />
      </Route>
      <Route path="/settings/data">
        <Settings onLogout={onLogout} />
      </Route>
      <Route path="/settings/privacy">
        <Settings onLogout={onLogout} />
      </Route>
      <Route path="/settings/billing">
        <Settings onLogout={onLogout} />
      </Route>
      <Route path="/settings/notifications">
        <Settings onLogout={onLogout} />
      </Route>
      <Route path="/ai-assistant" component={AIAssistant} />
      <Route path="/liabilities" component={Liabilities} />
      <Route path="/debts"><Redirect to="/liabilities" /></Route>
      <Route path="/debt-payoff" component={DebtPayoff} />
      <Route path="/investments" component={Investments} />
      <Route path="/assets" component={Assets} />
      <Route path="/net-worth" component={NetWorth} />
      <Route path="/calendar" component={FinancialCalendar} />
      <Route path="/split-expenses" component={SplitExpenses} />
      <Route path="/simulator" component={Simulator} />
      <Route path="/receipts" component={Receipts} />
      <Route path="/vault" component={VaultPage} />
      <Route path="/tax-report" component={TaxReport} />
      <Route path="/tax-smart" component={TaxSmartPage} />
      <Route path="/anomalies" component={AnomaliesPage} />
      <Route path="/upgrade" component={UpgradePage} />
      <Route path="/redeem" component={RedeemPage} />
      <Route path="/support" component={Support} />
      <Route path="/help" component={Help} />
      {isAdmin && (
        <>
          <Route path="/admin/users" component={AdminUsers} />
          <Route path="/admin/sales-chat" component={AdminSalesChat} />
          <Route path="/admin/support" component={AdminSupport} />
          <Route path="/admin/bank-providers" component={AdminBankProviders} />
          <Route path="/admin/audit-log" component={AdminAuditLog} />
          <Route path="/admin/system-status" component={AdminSystemStatus} />
          <Route path="/admin/plan-features" component={AdminPlanFeatures} />
          <Route path="/admin/communications" component={AdminCommunications} />
          <Route path="/admin/ai-models" component={AdminAIModels} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp({ onLogout, isAdmin, username, isDemo }: { onLogout: () => void; isAdmin: boolean; username: string; isDemo: boolean }) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [location, setLocation] = useLocation();

  const { data: onboardingStatus } = useQuery<{ onboardingComplete: boolean }>({
    queryKey: ["/api/onboarding/status"],
  });

  const logoutMutation = useLogout(onLogout);

  // Clean up any leftover pendingCheckout from the old signup flow
  useEffect(() => {
    localStorage.removeItem("pendingCheckout");
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

  return (
    <SubscriptionGate isAdmin={isAdmin} isDemo={isDemo}>
    <FeatureUsageProvider>
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar isAdmin={isAdmin} username={username} onLogout={onLogout} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <SystemAlertBanner />
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
          <TopNavBar />
          <main className="flex-1 overflow-auto p-6">
            <ProtectedRouter onLogout={onLogout} isAdmin={isAdmin} />
          </main>
        </div>
      </div>
      <OnboardingWizard open={showOnboarding} onComplete={handleOnboardingComplete} isDemo={isDemo} />
      <PWAInstallPrompt />
      <FloatingChatbot />
    </SidebarProvider>
    </FeatureUsageProvider>
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

  // Not authenticated: / always redirects to /login (no landing page at /)
  if (!isAuthenticated) {
    // Main domain – admin paths must go through the CMS on the app subdomain
    if (window.location.pathname.startsWith('/admin')) {
      window.location.href = `https://app.budgetsmart.io${window.location.pathname}`;
      return (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2">Redirecting to admin...</span>
        </div>
      );
    }
    // All other paths (including /): redirect to login
    window.location.href = '/login';
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2">Redirecting to login...</span>
      </div>
    );
  }

  return <AuthenticatedApp onLogout={handleLogout} isAdmin={isAdmin} username={username} isDemo={isDemo} />;
}

// On the app subdomain (/app.budgetsmart.io), /pricing should redirect users to
// the marketing site instead of rendering the embedded landing page.
function PricingRoute() {
  const isAppDomain = window.location.hostname === 'app.budgetsmart.io';
  if (isAppDomain) {
    window.location.replace('https://budgetsmart.io/#pricing');
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  return <LandingPage />;
}

function AppContent() {
  return (
    <Switch>
      {/* Public pages */}
      <Route path="/login" component={AuthGatedContent} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/pricing" component={PricingRoute} />
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
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password/:token" component={ResetPasswordPage} />
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
      <ThemeContextProvider>
        <TooltipProvider>
          <AppContent />
          <Toaster />
          <CookieConsent />
        </TooltipProvider>
      </ThemeContextProvider>
    </QueryClientProvider>
  );
}

export default App;
