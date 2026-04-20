/**
 * /referrals — full-page customer-referral dashboard.
 *
 * Distinct from /affiliate (public commission-only partner program):
 *   - /referrals is the IN-APP user-to-user referral program
 *   - Friend: 30% off annual plan, year 1 only (Stripe coupon)
 *   - Referrer: $30 cash via PayPal after 30-day hold
 *
 * Data sources:
 *   GET /api/referrals/me   — code, link, lifetime stats
 *   GET /api/referrals/list — the user's own referrals (with obfuscated emails)
 *
 * If PARTNERO_REFERRAL_ENABLED is false server-side, the page still
 * renders with a "Coming soon" notice — no broken buttons.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Heart,
  Copy,
  Check,
  Gift,
  DollarSign,
  Clock,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import {
  FaFacebookF,
  FaLinkedinIn,
  FaInstagram,
  FaXTwitter,
} from "react-icons/fa6";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

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

interface ReferralRow {
  id: string | number;
  status: "pending" | "active" | "paid" | "rejected" | string;
  createdAt?: string;
  paidAt?: string | null;
  amountCents: number;
  refereeEmail: string;
  refereePlan?: string | null;
}

interface ReferralsListResponse {
  referrals: ReferralRow[];
}

export default function ReferralsPage() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  // Instagram has no web share intent, so the IG button copies the link
  // to the clipboard and shows inline feedback instead of opening a sharer.
  const [igCopied, setIgCopied] = useState(false);

  const meQuery = useQuery<ReferralMeResponse>({
    queryKey: ["/api/referrals/me"],
    staleTime: 60_000,
  });

  const listQuery = useQuery<ReferralsListResponse>({
    queryKey: ["/api/referrals/list"],
    staleTime: 60_000,
    enabled: meQuery.data?.enabled === true && meQuery.data?.enrolled === true,
  });

  const enrollMutation = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", "/api/referrals/enroll")).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/me"] });
    },
  });

  const me = meQuery.data;
  const referralUrl = me?.url ?? "";
  const referralCode = me?.code ?? "";
  const stats = me?.stats;

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
      // ignore
    }
  };

  // Share helpers — all open in a new window/tab so the user's current
  // page is preserved.  Facebook and LinkedIn only pass the URL (both
  // sharers strip custom text per platform policy).  X still accepts
  // prefilled tweet text.  Instagram has no web share intent, so we
  // copy the URL to clipboard and flash a confirmation — the user can
  // then paste it into a Story, DM, or bio link.
  const shareFacebook = () => {
    if (!referralUrl) return;
    const u = encodeURIComponent(referralUrl);
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${u}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const shareLinkedIn = () => {
    if (!referralUrl) return;
    const u = encodeURIComponent(referralUrl);
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const shareInstagram = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setIgCopied(true);
      setTimeout(() => setIgCopied(false), 2500);
    } catch {
      // fall back to opening IG — user can paste manually
      window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
    }
  };

  const shareX = () => {
    if (!referralUrl) return;
    const text = encodeURIComponent(
      `Been using Budget Smart AI to get my money in shape — worth a look. 30% off annual plan: ${referralUrl}`,
    );
    window.open(
      `https://twitter.com/intent/tweet?text=${text}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  // Program disabled server-side (env flag off). Show a graceful stub so
  // we don't break routes.
  if (me && !me.enabled) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Card variant="glass" className="p-8 text-center">
          <Sparkles className="h-10 w-10 mx-auto text-amber-500 mb-3" />
          <h1 className="text-2xl font-bold mb-2">Referrals coming soon</h1>
          <p className="text-muted-foreground">
            Our customer referral program is rolling out shortly. Stay tuned!
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6" data-testid="referrals-page">
      {/* Hero */}
      <div
        className={cn(
          "rounded-[var(--radius-island)] p-6 md:p-8",
          "bg-gradient-to-br from-amber-400 via-amber-500 to-yellow-600 text-white",
          "shadow-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 mb-2">
              <Heart className="h-6 w-6 fill-white text-white" />
              <span className="text-xs font-semibold uppercase tracking-wider opacity-90">
                Refer a friend
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold leading-tight">
              Give <span className="underline decoration-white/40">30% off</span>.
              Get <span className="underline decoration-white/40">$30</span>.
            </h1>
            <p className="text-white/90 mt-2 max-w-xl">
              Share Budget Smart AI with a friend. When they sign up for
              annual, they get 30% off their first year and you get $30 cash
              after a 30-day hold.
            </p>
          </div>
          <Sparkles className="h-12 w-12 opacity-30 shrink-0 hidden md:block" />
        </div>
      </div>

      {/* Link + share */}
      <Card variant="glass" className="p-5 md:p-6">
        <CardContent className="p-0 space-y-5">
          {meQuery.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <>
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
                    data-testid="referrals-page-link"
                  >
                    {referralUrl || "Setting up your link…"}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!referralUrl}
                    onClick={handleCopy}
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
                {!me?.enrolled && me?.enabled && (
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={enrollMutation.isPending}
                      onClick={() => enrollMutation.mutate()}
                    >
                      {enrollMutation.isPending
                        ? "Setting up…"
                        : "Get my referral link"}
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Share
                </label>
                <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-md">
                  <Button
                    variant="outline"
                    onClick={shareFacebook}
                    disabled={!referralUrl}
                    data-testid="share-facebook"
                  >
                    <FaFacebookF className="h-4 w-4 mr-2" />
                    Facebook
                  </Button>
                  <Button
                    variant="outline"
                    onClick={shareLinkedIn}
                    disabled={!referralUrl}
                    data-testid="share-linkedin"
                  >
                    <FaLinkedinIn className="h-4 w-4 mr-2" />
                    LinkedIn
                  </Button>
                  <Button
                    variant="outline"
                    onClick={shareInstagram}
                    disabled={!referralUrl}
                    data-testid="share-instagram"
                  >
                    <FaInstagram className="h-4 w-4 mr-2" />
                    {igCopied ? "Copied!" : "Instagram"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={shareX}
                    disabled={!referralUrl}
                    data-testid="share-x"
                  >
                    <FaXTwitter className="h-4 w-4 mr-2" />
                    X
                  </Button>
                </div>
                {igCopied && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Link copied — paste it into a Story, DM, or your bio.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Gift className="h-4 w-4" />}
          label="Referred"
          value={String(stats?.totalReferrals ?? 0)}
          loading={meQuery.isLoading}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Paid"
          value={String(stats?.paidReferrals ?? 0)}
          tone="emerald"
          loading={meQuery.isLoading}
        />
        <StatCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Total earned"
          value={`$${totalEarned}`}
          tone="emerald"
          loading={meQuery.isLoading}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Pending"
          value={`$${pending}`}
          tone="amber"
          loading={meQuery.isLoading}
        />
      </div>

      {/* How it works */}
      <Card variant="glass" className="p-5 md:p-6">
        <CardContent className="p-0">
          <h2 className="text-lg font-bold mb-4">How it works</h2>
          <ol className="space-y-3 text-sm text-muted-foreground">
            <HowStep
              n={1}
              title="Share your link"
              body="Send your personal link or code to a friend. Works over email, SMS, social, or just paste it in chat."
            />
            <HowStep
              n={2}
              title="They save 30%"
              body="When your friend signs up for an annual plan, they automatically get 30% off year 1 at checkout."
            />
            <HowStep
              n={3}
              title="You get $30 cash"
              body="After their 30-day hold period (to protect against chargebacks), you're paid out $30 via PayPal."
            />
          </ol>
          <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
            Only annual-plan customer signups qualify. Monthly plans and
            lifetime deals don't count toward referrals. No cap — refer as
            many friends as you like.
          </p>
        </CardContent>
      </Card>

      {/* Referrals list */}
      <Card variant="glass" className="p-5 md:p-6">
        <CardContent className="p-0">
          <h2 className="text-lg font-bold mb-4">Your referrals</h2>
          {listQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !listQuery.data || listQuery.data.referrals.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No referrals yet. Share your link to get started!
            </div>
          ) : (
            <div className="divide-y divide-border">
              {listQuery.data.referrals.map((r) => (
                <ReferralListRow key={String(r.id)} row={r} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone = "default",
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "emerald" | "amber";
  loading?: boolean;
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";
  return (
    <Card variant="glass" className="p-4">
      <CardContent className="p-0">
        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        {loading ? (
          <Skeleton className="h-7 w-16 mt-1" />
        ) : (
          <div className={cn("mt-0.5 text-2xl font-bold", toneClass)}>{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

function HowStep({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 h-7 w-7 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center justify-center">
        {n}
      </span>
      <div className="pt-0.5">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-sm text-muted-foreground">{body}</div>
      </div>
    </li>
  );
}

function ReferralListRow({ row }: { row: ReferralRow }) {
  const statusInfo = getStatusInfo(row.status);
  const when = row.createdAt
    ? (() => {
        try {
          return format(parseISO(row.createdAt), "MMM d, yyyy");
        } catch {
          return row.createdAt;
        }
      })()
    : "—";

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground truncate">
          {row.refereeEmail || "New referral"}
        </div>
        <div className="text-xs text-muted-foreground">
          {when}
          {row.refereePlan ? ` · ${row.refereePlan}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div
          className={cn(
            "text-sm font-semibold tabular-nums",
            row.status === "paid"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground",
          )}
        >
          ${(row.amountCents / 100).toFixed(0)}
        </div>
        <Badge variant="outline" className={statusInfo.badgeClass}>
          {statusInfo.label}
        </Badge>
      </div>
    </div>
  );
}

function getStatusInfo(status: string): { label: string; badgeClass: string } {
  switch (status) {
    case "paid":
      return {
        label: "Paid",
        badgeClass:
          "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      };
    case "active":
      return {
        label: "Active",
        badgeClass:
          "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
      };
    case "pending":
      return {
        label: "Pending",
        badgeClass:
          "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
      };
    case "rejected":
      return {
        label: "Rejected",
        badgeClass:
          "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
      };
    default:
      return {
        label: status,
        badgeClass: "bg-muted text-muted-foreground",
      };
  }
}
