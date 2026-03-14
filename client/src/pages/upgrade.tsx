import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Check, Zap, Shield, Users, Star, Lock, Loader2 } from "lucide-react";

type BillingCycle = "monthly" | "yearly";

interface Feature {
  text: string;
  locked?: boolean;
}

interface Plan {
  id: string;
  name: string;
  badge?: string;
  badgeColor?: "green" | "gold";
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  yearlyBilled: number | null;
  description: string;
  cta: string;
  ctaVariant: "ghost" | "primary" | "accent";
  features: Feature[];
  limits?: string;
  icon: React.ReactNode;
  highlight?: boolean;
}

const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    yearlyPrice: 0,
    yearlyBilled: 0,
    description: "Start taking control of your money today — no credit card, no catch.",
    cta: "Current Plan",
    ctaVariant: "ghost",
    icon: <Zap size={20} />,
    limits: "1 linked bank account · 10 bills · 3 budgets · 2 savings goals",
    features: [
      { text: "Smart dashboard overview" },
      { text: "Manual expense & income tracking" },
      { text: "Up to 10 bills & reminders" },
      { text: "3 budget categories" },
      { text: "2 savings goals" },
      { text: "Basic spending reports" },
      { text: "Secure data encryption" },
      { text: "AI Financial Coach", locked: true },
      { text: "Bank account sync (MX/Plaid)", locked: true },
      { text: "Receipt scanning (AI)", locked: true },
      { text: "Unlimited bills & budgets", locked: true },
      { text: "Investment portfolio tracker", locked: true },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    badge: "Most Popular · +3 FREE MONTHS 🎉",
    badgeColor: "green",
    monthlyPrice: 7.99,
    yearlyPrice: 5.58,
    yearlyBilled: 67,
    description: "Everything you need to master your finances — and actually stick to it.",
    cta: "Unlock with Pro",
    ctaVariant: "primary",
    highlight: true,
    icon: <Shield size={20} />,
    limits: "Up to 2 linked bank accounts · unlimited bills, budgets & goals",
    features: [
      { text: "Everything in Free, plus:" },
      { text: "AI Financial Coach (Advanced)" },
      { text: "Bank account sync via MX/Plaid" },
      { text: "Unlimited bills & reminders" },
      { text: "Unlimited budgets & categories" },
      { text: "Unlimited savings goals" },
      { text: "Receipt scanning & auto-categorize" },
      { text: "Investment portfolio tracker" },
      { text: "Debt payoff planner" },
      { text: "Full spending trend analysis" },
      { text: "Monthly & custom reports" },
      { text: "Net worth tracker" },
      { text: "Secure document vault" },
      { text: "Multi-family members", locked: true },
      { text: "Shared household budgets", locked: true },
    ],
  },
  {
    id: "family",
    name: "Family",
    badge: "+4 FREE MONTHS 🎉",
    badgeColor: "gold",
    monthlyPrice: 14.99,
    yearlyPrice: 10.75,
    yearlyBilled: 129,
    description: "Best value for households managing finances together — up to 6 members.",
    cta: "Upgrade to Family",
    ctaVariant: "accent",
    icon: <Users size={20} />,
    limits: "Up to 6 members · unlimited bank accounts",
    features: [
      { text: "Everything in Pro, plus:" },
      { text: "Up to 6 family members" },
      { text: "Shared household budgets" },
      { text: "Family spending reports" },
      { text: "Unlimited bank accounts" },
      { text: "Per-member expense tracking" },
      { text: "Shared savings goals" },
      { text: "Family net worth overview" },
      { text: "Advanced AI recommendations" },
      { text: "Priority support" },
      { text: "Access to all current and future features" },
    ],
  },
];

interface PlanData {
  id: string;
  name: string;
  price: string;
  billingPeriod: string;
  stripePriceId: string | null;
}

function FeatureRow({ feature }: { feature: Feature }) {
  return (
    <li
      className={`flex items-start gap-2.5 text-sm ${
        feature.locked ? "opacity-40" : ""
      }`}
    >
      <span
        className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
          feature.locked
            ? "bg-slate-800 text-slate-500"
            : "bg-emerald-500/20 text-emerald-400"
        }`}
      >
        {feature.locked ? (
          <Lock size={9} />
        ) : (
          <Check size={9} strokeWidth={3} />
        )}
      </span>
      <span className={feature.locked ? "line-through text-slate-500" : "text-slate-300"}>
        {feature.text}
      </span>
    </li>
  );
}

function PriceDisplay({ plan, billing }: { plan: Plan; billing: BillingCycle }) {
  const price = billing === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
  const isFree = price === 0;

  return (
    <div className="mb-1">
      {isFree ? (
        <div className="flex items-end gap-1">
          <span className="text-5xl font-black text-white tracking-tight">Free</span>
          <span className="text-slate-400 mb-2 text-sm">forever</span>
        </div>
      ) : (
        <>
          <div className="flex items-end gap-1">
            <span className="text-2xl font-bold text-slate-400 mt-2">$</span>
            <span className="text-5xl font-black text-white tracking-tight">
              {price?.toFixed(2).split(".")[0]}
            </span>
            <span className="text-2xl font-bold text-white mb-1">
              .{price?.toFixed(2).split(".")[1]}
            </span>
            <span className="text-slate-400 mb-2 text-sm">/mo</span>
          </div>
          {billing === "yearly" && plan.yearlyBilled != null && (
            <p className="text-xs text-emerald-400 font-medium mt-0.5">
              Billed ${plan.yearlyBilled}/year
            </p>
          )}
          {billing === "monthly" && (
            <p className="text-xs text-slate-500 mt-0.5 h-4">Switch to yearly & save</p>
          )}
        </>
      )}
    </div>
  );
}

export default function UpgradePage() {
  const [billing, setBilling] = useState<BillingCycle>("yearly");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: landingData, isLoading } = useQuery<{ pricing: PlanData[] }>({
    queryKey: ["/api/landing"],
  });

  const checkoutMutation = useMutation({
    mutationFn: async (apiPlan: PlanData) => {
      if (!apiPlan.stripePriceId) {
        throw new Error("This plan is not available for purchase yet.");
      }
      const response = await apiRequest("POST", "/api/stripe/create-checkout-session", {
        priceId: apiPlan.stripePriceId,
        planId: apiPlan.id,
      });
      return response.json();
    },
    onSuccess: (data: { url?: string; error?: string }) => {
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

  const wasCancelled = new URLSearchParams(window.location.search).get("cancelled") === "true";
  const apiPlans = landingData?.pricing?.filter((p) => p.stripePriceId) || [];

  const findApiPlan = (planId: string): PlanData | null => {
    const nameMatch =
      planId === "pro"
        ? (p: PlanData) => p.name.toLowerCase().includes("pro")
        : planId === "family"
          ? (p: PlanData) => p.name.toLowerCase().includes("family")
          : () => false;
    const periodMatch = (p: PlanData) =>
      billing === "yearly"
        ? (p.billingPeriod === "yearly" || p.billingPeriod === "annual")
        : p.billingPeriod === "monthly";
    return apiPlans.find((p) => nameMatch(p) && periodMatch(p)) ?? null;
  };

  const handleSelectPlan = (id: string) => {
    if (id === "free") {
      navigate("/dashboard");
      return;
    }
    const apiPlan = findApiPlan(id);
    if (!apiPlan) {
      toast({
        title: "Plan not available",
        description: "This plan is not available for purchase yet. Please try another option.",
        variant: "destructive",
      });
      return;
    }
    checkoutMutation.mutate(apiPlan);
  };

  const savingsLabel =
    billing === "yearly" ? "Save 3–4 months vs paying monthly" : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <section className="relative min-h-screen bg-[#040d07] py-20 px-4 overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-emerald-900/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative max-w-6xl mx-auto">
        {wasCancelled && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm text-center">
            No worries — you weren&apos;t charged. You can upgrade whenever you&apos;re ready.
          </div>
        )}

        <div className="flex justify-center mb-5">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-wider uppercase">
            <Star size={12} fill="currentColor" />
            Simple, Transparent Pricing
          </span>
        </div>

        <h1 className="text-center text-4xl sm:text-5xl font-black text-white mb-4 tracking-tight">
          Start Free.{" "}
          <span className="text-emerald-400">Upgrade When You&apos;re Ready.</span>
        </h1>
        <p className="text-center text-slate-400 text-lg mb-10 max-w-xl mx-auto">
          No credit card required. Start on the Free plan, then move to Pro or Family
          whenever you want more automations and insights.
        </p>

        <div className="flex items-center justify-center gap-4 mb-12">
          <span
            className={`text-sm font-medium cursor-pointer transition-colors ${
              billing === "monthly" ? "text-white" : "text-slate-500"
            }`}
            onClick={() => setBilling("monthly")}
          >
            Monthly
          </span>
          <button
            type="button"
            onClick={() => setBilling(billing === "monthly" ? "yearly" : "monthly")}
            className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
              billing === "yearly" ? "bg-emerald-500" : "bg-slate-700"
            }`}
          >
            <span
              className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ${
                billing === "yearly" ? "translate-x-8" : "translate-x-1"
              }`}
            />
          </button>
          <span
            className={`text-sm font-medium cursor-pointer transition-colors ${
              billing === "yearly" ? "text-white" : "text-slate-500"
            }`}
            onClick={() => setBilling("yearly")}
          >
            Yearly
          </span>
          {savingsLabel && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold border border-emerald-500/20">
              {savingsLabel}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isHighlight = plan.highlight;
            const isPaid = plan.id === "pro" || plan.id === "family";
            const apiPlan = isPaid ? findApiPlan(plan.id) : null;
            const checkoutPending = isPaid && checkoutMutation.isPending;
            const badgeText =
              billing === "yearly"
                ? plan.badge
                : plan.id === "pro"
                  ? "Most Popular"
                  : plan.id === "family"
                    ? "Best value"
                    : plan.badge;

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl p-6 transition-all duration-300 ${
                  isHighlight
                    ? "bg-gradient-to-b from-[#0f2518] to-[#0a1a10] border-2 border-emerald-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]"
                    : "bg-slate-900/80 border border-slate-800/60"
                }`}
              >
                {badgeText && (
                  <div
                    className={`absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                      plan.badgeColor === "gold"
                        ? "bg-amber-500 text-amber-950"
                        : "bg-emerald-500 text-emerald-950"
                    }`}
                  >
                    {badgeText}
                  </div>
                )}

                <div className="flex items-center gap-2 mb-3 mt-1">
                  <span className={isHighlight ? "text-emerald-400" : "text-slate-400"}>
                    {plan.icon}
                  </span>
                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                </div>

                <PriceDisplay plan={plan} billing={billing} />

                {plan.limits && (
                  <p className="text-xs text-slate-500 mt-1 mb-3">{plan.limits}</p>
                )}

                <p className="text-sm text-slate-400 mb-5 leading-relaxed min-h-[48px]">
                  {plan.description}
                </p>

                <button
                  type="button"
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={isPaid && (!apiPlan || checkoutPending)}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 mb-6 ${
                    plan.ctaVariant === "primary"
                      ? "bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_4px_20px_rgba(34,197,94,0.3)] hover:shadow-[0_4px_28px_rgba(34,197,94,0.5)] disabled:opacity-50"
                      : plan.ctaVariant === "accent"
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black shadow-[0_4px_20px_rgba(245,158,11,0.25)] disabled:opacity-50"
                        : "bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
                  }`}
                >
                  {checkoutPending ? (
                    <>
                      <Loader2 className="inline-block w-4 h-4 mr-2 animate-spin" />
                      Preparing checkout...
                    </>
                  ) : (
                    plan.cta
                  )}
                </button>

                <div className="border-t border-slate-800/80 mb-5" />

                <ul className="space-y-3 flex-1">
                  {plan.features.map((f, i) => (
                    <FeatureRow key={i} feature={f} />
                  ))}
                </ul>

                {plan.id === "free" && (
                  <div className="mt-6 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center">
                    <p className="text-xs text-emerald-400/80">
                      🔒 Unlock full power with Pro — upgrade anytime
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-slate-500 text-sm">
          <span className="flex items-center gap-2">
            <Shield size={14} className="text-emerald-500" />
            Secured by Stripe
          </span>
          <span className="flex items-center gap-2">
            <Check size={14} className="text-emerald-500" />
            Cancel anytime
          </span>
          <span className="flex items-center gap-2">
            <Check size={14} className="text-emerald-500" />
            No hidden fees
          </span>
          <span className="flex items-center gap-2">
            <Check size={14} className="text-emerald-500" />
            Free plan available — no card needed
          </span>
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          All plans include SSL encryption and secure data handling.{" "}
          <a href="/redeem" className="text-emerald-400 hover:underline">
            Have a license code? Redeem it here
          </a>
        </p>
      </div>
    </section>
  );
}
