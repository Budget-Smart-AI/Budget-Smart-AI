/**
 * ReferralModal — gold-heart in-app referral sharing modal.
 *
 * Opens from the sidebar gold-heart icon. Shows the user's Partnero
 * referral code + shareable link, a copy button, and one-tap share to
 * email / SMS / Twitter. Fetches state from /api/referrals/me.
 *
 * Reward wording here must match Partnero + the marketing site:
 *   - Friend gets 30% off annual plan, year 1
 *   - You get $30 cash after 30-day hold period
 *   - Only annual plan signups qualify
 *
 * If the user isn't yet enrolled (pre-launch signup), we call
 * POST /api/referrals/enroll which is idempotent.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Heart,
  Copy,
  Check,
  Mail,
  MessageSquare,
  Twitter,
  Gift,
  DollarSign,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

interface ReferralMeResponse {
  enabled: boolean;
  enrolled: boolean;
  code?: string;
  url?: string;
  stats?: {
    totalReferrals: number;
    paidReferrals: number;
    pendingReferrals: number;
    totalEarnedCents: number;
    pendingCents: number;
  };
}

interface ReferralModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReferralModal({ open, onOpenChange }: ReferralModalProps) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery<ReferralMeResponse>({
    queryKey: ["/api/referrals/me"],
    enabled: open,
    staleTime: 60_000,
  });

  // Lazy-enroll if first open returned not-enrolled (users who signed up
  // before the program existed). Runs once per modal open.
  const enrollMutation = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", "/api/referrals/enroll")).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/me"] });
    },
  });

  useEffect(() => {
    if (open && data && data.enabled && !data.enrolled && !enrollMutation.isPending) {
      enrollMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data?.enabled, data?.enrolled]);

  const referralUrl = data?.url ?? "";
  const referralCode = data?.code ?? "";

  const stats = data?.stats;
  const totalEarned = useMemo(
    () => ((stats?.totalEarnedCents ?? 0) / 100).toFixed(0),
    [stats],
  );
  const pending = useMemo(
    () => ((stats?.pendingCents ?? 0) / 100).toFixed(0),
    [stats],
  );

  const handleCopy = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore — user can select & copy manually
    }
  };

  // Share helpers use native OS schemes — open in new window/tab so the
  // user's current page is preserved.
  const shareEmail = () => {
    const subject = encodeURIComponent("Try Budget Smart AI — 30% off");
    const body = encodeURIComponent(
      `I've been using Budget Smart AI and it's the best money tool I've ever tried. ` +
        `Here's 30% off your first year on annual plans: ${referralUrl}`,
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const shareSMS = () => {
    const body = encodeURIComponent(
      `Try Budget Smart AI — I love it. 30% off annual: ${referralUrl}`,
    );
    window.open(`sms:?&body=${body}`);
  };

  const shareTwitter = () => {
    const text = encodeURIComponent(
      `Been using Budget Smart AI to get my money in shape — worth a look. 30% off annual plan: ${referralUrl}`,
    );
    window.open(`https://twitter.com/intent/tweet?text=${text}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[520px] p-0 overflow-hidden"
        data-testid="referral-modal"
      >
        {/* Gold gradient header — signals the "reward" feel. Intentionally
         * gold, not emerald, so it feels differentiated from the rest of
         * the app chrome (which is mint-green glass). */}
        <div className="bg-gradient-to-br from-amber-400 via-amber-500 to-yellow-600 px-6 py-6 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 mb-2">
                <Heart className="h-6 w-6 fill-white text-white" />
                <span className="text-xs font-semibold uppercase tracking-wider opacity-90">
                  Refer a friend
                </span>
              </div>
              <DialogTitle className="text-2xl md:text-3xl font-bold leading-tight text-white">
                Give <span className="underline decoration-white/40">30% off</span>.
                Get <span className="underline decoration-white/40">$30</span>.
              </DialogTitle>
              <DialogDescription className="text-white/90 text-sm mt-1.5">
                Annual plan only. Friend gets 30% off year 1, you get $30
                cash after their 30-day hold.
              </DialogDescription>
            </div>
            <Sparkles className="h-10 w-10 opacity-30 shrink-0" />
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Referral link + copy button */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Your referral link
            </label>
            <div
              className={cn(
                "mt-1.5 flex items-center gap-2 p-2 pl-3 rounded-lg",
                "bg-[color:rgb(var(--glass-surface))] border border-[color:rgb(var(--glass-border))]",
              )}
            >
              <code
                className="flex-1 text-sm truncate text-foreground font-mono"
                data-testid="referral-link"
              >
                {isLoading
                  ? "Loading…"
                  : referralUrl || "Setting up your link…"}
              </code>
              <Button
                size="sm"
                variant="outline"
                disabled={!referralUrl}
                onClick={handleCopy}
                data-testid="referral-copy-button"
                className="shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            {referralCode && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Code:{" "}
                <span className="font-mono font-semibold text-foreground">
                  {referralCode}
                </span>
              </p>
            )}
          </div>

          {/* Share buttons */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Share
            </label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                onClick={shareEmail}
                disabled={!referralUrl}
                data-testid="share-email"
              >
                <Mail className="h-4 w-4 mr-2" />
                Email
              </Button>
              <Button
                variant="outline"
                onClick={shareSMS}
                disabled={!referralUrl}
                data-testid="share-sms"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Text
              </Button>
              <Button
                variant="outline"
                onClick={shareTwitter}
                disabled={!referralUrl}
                data-testid="share-twitter"
              >
                <Twitter className="h-4 w-4 mr-2" />
                Tweet
              </Button>
            </div>
          </div>

          {/* Stats mini-row — only show if there's activity */}
          {stats && stats.totalReferrals > 0 && (
            <div className="grid grid-cols-3 gap-2 pt-2">
              <StatTile
                icon={<Gift className="h-4 w-4" />}
                label="Referred"
                value={String(stats.totalReferrals)}
              />
              <StatTile
                icon={<DollarSign className="h-4 w-4" />}
                label="Earned"
                value={`$${totalEarned}`}
                tone="emerald"
              />
              <StatTile
                icon={<DollarSign className="h-4 w-4" />}
                label="Pending"
                value={`$${pending}`}
                tone="amber"
              />
            </div>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
            Rewards apply only to new customer annual-plan signups. $30
            cash is paid via PayPal after a 30-day hold period.{" "}
            <a
              href="/referrals"
              className="underline hover:text-foreground"
              onClick={() => onOpenChange(false)}
            >
              View all referrals
            </a>
            .
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "emerald" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";
  return (
    <div
      className={cn(
        "rounded-lg p-3 text-center",
        "bg-[color:rgb(var(--glass-surface))] border border-[color:rgb(var(--glass-border))]",
      )}
    >
      <div
        className={cn(
          "inline-flex items-center gap-1 text-xs uppercase tracking-wide",
          "text-muted-foreground",
        )}
      >
        {icon}
        {label}
      </div>
      <div className={cn("mt-0.5 text-lg font-bold", toneClass)}>{value}</div>
    </div>
  );
}
