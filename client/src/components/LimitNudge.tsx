import { Link } from "wouter";

interface LimitNudgeProps {
  featureKey: string;
  displayName: string;
  used: number;
  limit: number;
}

export function LimitNudge({ featureKey, displayName, used, limit }: LimitNudgeProps) {
  const percentage = limit > 0 ? (used / limit) * 100 : 0;
  if (percentage < 80) return null;

  const isAtLimit = used >= limit;

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-sm mb-4">
      <span className="text-muted-foreground">
        {isAtLimit
          ? `${displayName} limit reached (${used}/${limit})`
          : `${used}/${limit} ${displayName} used this month`}
      </span>
      <Link
        href="/upgrade"
        className="text-amber-500 hover:underline text-xs font-medium whitespace-nowrap ml-3"
      >
        Upgrade →
      </Link>
    </div>
  );
}
