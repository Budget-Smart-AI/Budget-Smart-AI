import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Check, Loader2, Zap, X } from "lucide-react";

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
  maxBankAccounts: number | null;
  maxFamilyMembers: number | null;
}

const FREE_FEATURES = [
  "Manual transaction entry",
  "Bill & income tracking",
  "Basic budgets",
  "Savings goals",
  "Basic reports",
  "5 AI queries/month",
  "1 bank account connection",
];

const FREE_LIMITS = [
  "No automated bank sync",
  "Limited AI queries",
];

function getPlanFeatures(plan: PlanData): string[] {
  try {
    return JSON.parse(plan.features);
  } catch {
    return plan.features ? plan.features.split(",").map(f => f.trim()) : [];
  }
}

export default function UpgradePage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: landingData, isLoading } = useQuery<{ pricing: PlanData[] }>({
    queryKey: ["/api/landing"],
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

  // Check if user was redirected here after cancelling
  const wasCancelled = new URLSearchParams(window.location.search).get("cancelled") === "true";

  const allPlans = landingData?.pricing?.filter(p => p.stripePriceId) || [];
  const filteredPlans = allPlans.filter(p => p.billingPeriod === billingPeriod);

  // Compute annual savings message per plan (in months free)
  const getAnnualSavings = (plan: PlanData): string | null => {
    if (plan.billingPeriod !== "yearly") return null;
    const monthlyPlan = allPlans.find(
      p => p.billingPeriod === "monthly" && p.name === plan.name
    );
    if (!monthlyPlan) return null;
    const monthlyPrice = parseFloat(monthlyPlan.price);
    const yearlyTotal = parseFloat(plan.price);
    const monthsFree = Math.round((monthlyPrice * 12 - yearlyTotal) / monthlyPrice);
    return monthsFree > 0 ? `Save ${monthsFree} months free` : null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {wasCancelled && (
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm">
          No worries — you weren't charged. You can upgrade whenever you're ready.
        </div>
      )}

      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Upgrade your plan</h1>
        <p className="text-muted-foreground">
          Unlock unlimited bank accounts, AI queries, and more.
        </p>
      </div>

      {/* Billing toggle */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-lg border overflow-hidden">
          <button
            onClick={() => setBillingPeriod("monthly")}
            className={`px-6 py-2.5 text-sm font-medium transition-colors ${
              billingPeriod === "monthly"
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingPeriod("yearly")}
            className={`px-6 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 ${
              billingPeriod === "yearly"
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Annual
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/30">
              Save up to 4 months
            </span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className={`grid gap-6 ${
        filteredPlans.length === 0
          ? "grid-cols-1 md:grid-cols-2"
          : filteredPlans.length === 1
          ? "grid-cols-1 md:grid-cols-2"
          : "grid-cols-1 md:grid-cols-3"
      }`}>
        {/* Free tier — always shown */}
        <div className="rounded-xl border p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold">Free</h2>
            <div className="mt-2">
              <span className="text-3xl font-bold">$0</span>
              <span className="text-muted-foreground">/{billingPeriod === "yearly" ? "year" : "month"}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">No credit card required</p>
          </div>
          <ul className="space-y-2">
            {FREE_FEATURES.map(f => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
            {FREE_LIMITS.map(f => (
              <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                <X className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Button variant="outline" className="w-full" onClick={() => navigate("/dashboard")}>
            Current Plan
          </Button>
        </div>

        {/* Paid plans */}
        {filteredPlans.map(plan => {
          const features = getPlanFeatures(plan);
          const isPopular = plan.isPopular === "true" || plan.name.toLowerCase().includes("family");
          const savingsBadge = getAnnualSavings(plan);
          const price = parseFloat(plan.price);
          const monthlyEquivalent = billingPeriod === "yearly"
            ? (price / 12).toFixed(2)
            : price.toFixed(2);

          return (
            <div
              key={plan.id}
              className={`rounded-xl border p-6 space-y-4 relative ${
                isPopular
                  ? "border-primary ring-2 ring-primary/20"
                  : ""
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-3 py-1">
                    <Zap className="h-3 w-3 mr-1" />
                    Most Popular
                  </Badge>
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold">{plan.name}</h2>
                <div className="mt-2 flex items-end gap-1">
                  {billingPeriod === "yearly" ? (
                    <>
                      <span className="text-3xl font-bold">${monthlyEquivalent}</span>
                      <span className="text-muted-foreground mb-1">/month</span>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl font-bold">${price.toFixed(2)}</span>
                      <span className="text-muted-foreground mb-1">/month</span>
                    </>
                  )}
                </div>
                {billingPeriod === "yearly" && (
                  <p className="text-sm text-muted-foreground">
                    Billed as ${price.toFixed(2)}/year
                    {savingsBadge && (
                      <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-medium">
                        · {savingsBadge}
                      </span>
                    )}
                  </p>
                )}
                {billingPeriod === "monthly" && (
                  <p className="text-sm text-muted-foreground">Billed monthly, cancel anytime</p>
                )}
              </div>

              <ul className="space-y-2">
                {features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="w-full"
                onClick={() => checkoutMutation.mutate(plan)}
                disabled={checkoutMutation.isPending || !plan.stripePriceId}
              >
                {checkoutMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Preparing checkout...
                  </>
                ) : (
                  `Upgrade to ${plan.name}`
                )}
              </Button>
            </div>
          );
        })}

        {filteredPlans.length === 0 && !isLoading && (
          <div className="col-span-full text-center text-muted-foreground py-8">
            No paid plans available at this time. Please check back soon.
          </div>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        All plans include SSL encryption and secure data handling.{" "}
        Have a license code?{" "}
        <a href="/redeem" className="underline hover:text-foreground">
          Redeem it here
        </a>
      </p>
    </div>
  );
}
