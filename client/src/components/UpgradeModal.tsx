/**
 * Mini upgrade modal shown when a free user clicks a locked nav item.
 * Shows feature name, benefits, and a single CTA to /upgrade.
 */
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { trackUpgradeCta, type UpgradeCtaSource } from "@/lib/trackUpgradeCta";

export interface UpgradeModalFeature {
  featureKey: string;
  displayName: string;
  benefits: string[];
  priceLabel?: string; // e.g. "$9/mo"
}

const DEFAULT_BENEFITS: Record<string, string[]> = {
  ai_assistant: [
    "Unlimited AI financial advice",
    "Personalized insights and recommendations",
    "No monthly message cap",
  ],
  debt_payoff_planner: [
    "Avalanche & snowball payoff strategies",
    "Personalized payoff timeline",
    "Track all debts in one place",
  ],
  financial_vault: [
    "Encrypted document storage",
    "Secure financial document backup",
    "AI search over your documents",
  ],
  what_if_simulator: [
    "Model savings, income, and expense changes",
    "See impact on your finances over time",
    "Unlimited scenarios",
  ],
  financial_reports: [
    "Advanced analytics and custom date ranges",
    "Export and share reports",
    "Deeper insights into your money",
  ],
};

const FALLBACK_BENEFITS = [
  "Unlock this feature and more",
  "Get the full BudgetSmart experience",
  "No limits on your financial tools",
];

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: UpgradeModalFeature;
  source?: UpgradeCtaSource;
}

export function UpgradeModal({
  open,
  onOpenChange,
  feature,
  source = "locked_nav",
}: UpgradeModalProps) {
  const [, navigate] = useLocation();
  const benefits =
    feature.benefits.length > 0
      ? feature.benefits
      : DEFAULT_BENEFITS[feature.featureKey.toLowerCase()] ?? FALLBACK_BENEFITS;
  const priceLabel = feature.priceLabel ?? "See plans";

  const handleUpgrade = () => {
    trackUpgradeCta(source);
    onOpenChange(false);
    navigate("/upgrade");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-lg font-semibold">{feature.displayName}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Upgrade to access this feature
          </DialogDescription>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 mt-2" aria-hidden="true">
            {benefits.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </DialogHeader>
        <Button
          className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl h-10"
          onClick={handleUpgrade}
        >
          Upgrade to Pro — {priceLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          Cancel anytime. Unlock all features with Pro.
        </p>
      </DialogContent>
    </Dialog>
  );
}
