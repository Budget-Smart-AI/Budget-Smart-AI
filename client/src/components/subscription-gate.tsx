import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Loader2, Brain, Zap, Sparkles, Check, Shield, Star, CreditCard,
  Calendar, Lock, ArrowRight, LogOut
} from "lucide-react";

interface SubscriptionGateProps {
  children: React.ReactNode;
  isAdmin?: boolean;
}

interface SubscriptionData {
  hasSubscription: boolean;
  status: string | null;
  planId: string | null;
  plan: {
    id: string;
    name: string;
    price: string;
    billingPeriod: string;
  } | null;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
}

interface PlanData {
  id: string;
  name: string;
  price: string;
  billingPeriod: string;
  description: string | null;
  features: string;
  isPopular: string;
  stripePriceId: string | null;
  trialDays: number | null;
}

export function SubscriptionGate({ children, isAdmin, isDemo }: SubscriptionGateProps & { isDemo?: boolean }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // When the user returns from Stripe checkout with ?subscription=success,
  // the webhook may not have fired yet. Proactively sync the subscription
  // directly from Stripe before deciding whether to show the paywall.
  const [syncingSubscription, setSyncingSubscription] = useState(false);
  const [syncAttempted, setSyncAttempted] = useState(false);

  useEffect(() => {
    // Skip sync for admin and demo users
    if (isAdmin || isDemo) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscription') === 'success' && !syncAttempted) {
      setSyncAttempted(true);
      setSyncingSubscription(true);
      fetch('/api/stripe/sync-subscription', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
        .then(() => {
          // Refresh subscription data after sync so the gate re-evaluates
          return queryClient.invalidateQueries({ queryKey: ['/api/stripe/subscription'] });
        })
        .catch(err => console.error('Subscription sync error:', err))
        .finally(() => setSyncingSubscription(false));
    }
  }, [queryClient, syncAttempted, isAdmin, isDemo]);

  const { data: stripeStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/stripe/status"],
  });

  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("yearly");

  // Unconditionally call all hooks — only enable subscription queries for non-admin users
  const { data: subscription, isLoading: subLoading } = useQuery<SubscriptionData>({
    queryKey: ["/api/stripe/subscription"],
    enabled: !isAdmin && !isDemo,
  });

  const { data: landingData, isLoading: plansLoading } = useQuery<{ pricing: PlanData[] }>({
    queryKey: ["/api/landing"],
    enabled: !isAdmin && !isDemo && (!subscription?.hasSubscription || !["active", "trialing"].includes(subscription?.status || "")),
  });

  const checkoutMutation = useMutation({
    mutationFn: async (plan: PlanData) => {
      if (!plan.stripePriceId) {
        throw new Error("This plan is not available for purchase yet.");
      }
      const response = await apiRequest("POST", "/api/stripe/create-checkout-session", {
        priceId: plan.stripePriceId,
        planId: plan.id,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        toast({ title: "Checkout Failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Checkout Failed", description: error.message, variant: "destructive" });
    },
  });

  // Admin users and demo users bypass subscription check
  if (isAdmin || isDemo) {
    return <>{children}</>;
  }

  // Show spinner while syncing subscription state after Stripe redirect
  if (syncingSubscription) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  // Check if user has an active subscription or is in trial
  const hasAccess = subscription?.hasSubscription &&
    ["active", "trialing"].includes(subscription?.status || "");

  if (hasAccess) {
    return <>{children}</>;
  }

  // Get available plans (with Stripe price IDs)
  const plans = landingData?.pricing?.filter(p => p.stripePriceId) || [];
  // Filter plans by selected billing period
  const filteredPlans = plans.filter(p => p.billingPeriod === billingPeriod);
  // Family plan for yearly (or isPopular) is the recommended choice from filtered list
  const popularPlan = filteredPlans.find(p =>
    p.name.toLowerCase().includes('family')
  ) || filteredPlans.find(p => p.isPopular === "true") || filteredPlans[0];

  // Check if Stripe is configured and plans are available
  const stripeNotConfigured = stripeStatus?.configured === false;
  const noPlansAvailable = !plansLoading && plans.length === 0;

  // Show setup required message if Stripe not configured or no plans
  if (stripeNotConfigured || noPlansAvailable) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900/50 border-slate-800">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 relative flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 shadow-lg shadow-emerald-500/30">
              <Brain className="h-8 w-8 text-white" />
              <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gradient-to-r from-yellow-400 to-amber-400 flex items-center justify-center shadow-sm">
                <Zap className="h-3 w-3 text-white" />
              </div>
            </div>
            <CardTitle className="text-white">Setup Required</CardTitle>
            <CardDescription className="text-slate-400">
              {stripeNotConfigured
                ? "Payment processing needs to be configured by the administrator."
                : "No subscription plans are available yet. Please contact the administrator."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-400">
                {stripeNotConfigured ? (
                  <>
                    <strong>Admin:</strong> Set the <code className="bg-slate-800 px-1 rounded">STRIPE_SECRET_KEY</code> environment variable and add Stripe Price IDs to your plans.
                  </>
                ) : (
                  <>
                    <strong>Admin:</strong> Add Stripe Price IDs to your subscription plans in the admin panel.
                  </>
                )}
              </p>
            </div>
            <Button variant="outline" className="border-slate-700 text-white hover:bg-slate-800" onClick={() => navigate("/upgrade")}>
              View Plans
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show paywall
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 relative flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 shadow-lg shadow-emerald-500/30">
            <Brain className="h-8 w-8 text-white" />
            <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gradient-to-r from-yellow-400 to-amber-400 flex items-center justify-center shadow-sm">
              <Zap className="h-3 w-3 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2 text-white">Start Your Free Trial</h1>
          <p className="text-slate-400 max-w-md mx-auto">
            Get full access to Budget Smart AI with a free trial. Cancel anytime.
          </p>
        </div>

        {plansLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Benefits */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  What You'll Get
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Check className="h-4 w-4 text-emerald-400" />
                  </div>
                  <span className="text-sm text-slate-300">AI-powered financial insights</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Check className="h-4 w-4 text-emerald-400" />
                  </div>
                  <span className="text-sm text-slate-300">Automatic bank syncing</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Check className="h-4 w-4 text-emerald-400" />
                  </div>
                  <span className="text-sm text-slate-300">Budget tracking & goals</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Check className="h-4 w-4 text-emerald-400" />
                  </div>
                  <span className="text-sm text-slate-300">Bill reminders & tracking</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Check className="h-4 w-4 text-emerald-400" />
                  </div>
                  <span className="text-sm text-slate-300">Net worth tracking</span>
                </div>

                <div className="pt-4 space-y-2 border-t border-slate-700">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Calendar className="w-4 h-4" />
                    <span>We'll remind you before trial ends</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Shield className="w-4 h-4" />
                    <span>Cancel anytime, no hassle</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Plan Selection */}
            <Card className="bg-slate-900/50 border-emerald-500/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white">Choose Your Plan</CardTitle>
                  {popularPlan?.trialDays && (
                    <Badge className="bg-emerald-500">
                      {popularPlan.trialDays}-day free trial
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-slate-400">
                  Start free, upgrade anytime
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Billing Period Toggle */}
                <div>
                  <p className="text-sm font-medium text-slate-400 mb-2">Billing cycle:</p>
                  <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
                    <button
                      onClick={() => setBillingPeriod("monthly")}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${
                        billingPeriod === "monthly"
                          ? "bg-emerald-500 text-white"
                          : "bg-transparent text-slate-400 hover:text-white"
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setBillingPeriod("yearly")}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${
                        billingPeriod === "yearly"
                          ? "bg-emerald-500 text-white"
                          : "bg-transparent text-slate-400 hover:text-white"
                      }`}
                    >
                      Annual
                      <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Save up to 30%
                      </span>
                    </button>
                  </div>
                </div>

                {filteredPlans.length > 0 ? filteredPlans.map((plan) => {
                  const price = parseFloat(plan.price);
                  const monthlyPrice = plan.billingPeriod === "yearly"
                    ? (price / 12).toFixed(2)
                    : price.toFixed(2);
                  const isFamilyPlan = plan.name.toLowerCase().includes('family');
                  // Family plans and any plan marked popular are highlighted
                  const isPopular = isFamilyPlan || plan.isPopular === "true";

                  return (
                    <button
                      key={plan.id}
                      onClick={() => checkoutMutation.mutate(plan)}
                      disabled={checkoutMutation.isPending}
                      className={`w-full p-4 rounded-lg border text-left transition-all hover:border-emerald-500 ${
                        isPopular ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/50" : "border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white">{plan.name}</span>
                          {isPopular && (
                            <Badge className="text-xs bg-emerald-500 text-white">Most Popular</Badge>
                          )}
                          {isFamilyPlan && plan.billingPeriod === "yearly" && (
                            <Badge className="text-xs bg-amber-500 text-white">2 Months FREE</Badge>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-lg text-white">${monthlyPrice}</span>
                          <span className="text-slate-400 text-sm">/mo</span>
                        </div>
                      </div>
                      {plan.billingPeriod === "yearly" && (
                        <p className="text-xs text-slate-400">
                          Billed annually (${price.toFixed(2)}/year)
                        </p>
                      )}
                      {plan.trialDays && plan.trialDays > 0 && (
                        <p className="text-xs text-emerald-400 mt-1">
                          {plan.trialDays}-day free trial included
                        </p>
                      )}
                    </button>
                  );
                }) : (
                  <p className="text-sm text-slate-500 italic">No {billingPeriod} plans available.</p>
                )}

                {checkoutMutation.isPending && (
                  <div className="flex items-center justify-center py-2 text-slate-300">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    <span className="text-sm">Preparing checkout...</span>
                  </div>
                )}

                <div className="flex items-center justify-center gap-4 text-xs text-slate-500 pt-2">
                  <div className="flex items-center gap-1">
                    <Lock className="h-3.5 w-3.5" />
                    <span>Secure checkout</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CreditCard className="h-3.5 w-3.5" />
                    <span>Powered by Stripe</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* View all plans link */}
        <div className="text-center mt-6 flex flex-col items-center gap-2">
          <Button variant="ghost" className="text-slate-400 hover:text-white hover:bg-slate-800" onClick={() => navigate("/upgrade")}>
            View all plan details
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
            onClick={async () => {
              try {
                await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
              } catch {
                // Ignore network errors – redirect to login regardless
              }
              queryClient.clear();
              window.location.href = "/login";
            }}
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
