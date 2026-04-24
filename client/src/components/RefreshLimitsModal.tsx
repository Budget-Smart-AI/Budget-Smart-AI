import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, Lock, Clock, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";

export type RefreshModalMode = "info" | "upsell" | "exhausted" | "cooldown";

interface RefreshLimitsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: RefreshModalMode;
  used?: number;
  limit?: number;
  cooldownSeconds?: number;
}

export function RefreshLimitsModal({
  open,
  onOpenChange,
  mode,
  used = 0,
  limit = 0,
  cooldownSeconds = 0,
}: RefreshLimitsModalProps) {
  const [, navigate] = useLocation();

  const remaining = Math.max(0, limit - used);
  const cooldownMin = Math.ceil(cooldownSeconds / 60);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "info" && (
              <>
                <RefreshCw className="h-5 w-5 text-emerald-500" />
                Live refresh
              </>
            )}
            {mode === "upsell" && (
              <>
                <Lock className="h-5 w-5 text-amber-500" />
                Live refresh is a Pro feature
              </>
            )}
            {mode === "exhausted" && (
              <>
                <AlertTriangle className="h-5 w-5 text-red-500" />
                You're out of refreshes this month
              </>
            )}
            {mode === "cooldown" && (
              <>
                <Clock className="h-5 w-5 text-blue-500" />
                Just a moment
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {mode === "info" && (
            <>
              <p className="text-sm text-muted-foreground">
                You have <strong>{remaining}</strong> of{" "}
                <strong>{limit}</strong> manual refreshes left this month.
                Each refresh pulls your newest transactions and balances
                straight from your bank.
              </p>
              <p className="text-xs text-muted-foreground">
                Your quota resets on the 1st. Our automatic overnight sync
                keeps running either way, and it doesn't count against this
                number.
              </p>
            </>
          )}

          {mode === "upsell" && (
            <>
              <p className="text-sm text-muted-foreground">
                Manual refresh pulls your latest transactions on demand —
                no waiting for the next overnight sync. It's included on{" "}
                <strong>Pro</strong> and <strong>Family</strong>.
              </p>
              <div className="rounded-lg border p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Pro</span>
                  <span className="font-medium">10 refreshes / month</span>
                </div>
                <div className="flex justify-between">
                  <span>Family</span>
                  <span className="font-medium">15 refreshes / month</span>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  navigate("/upgrade");
                }}
              >
                See plans
              </Button>
            </>
          )}

          {mode === "exhausted" && (
            <>
              <p className="text-sm text-muted-foreground">
                You've used all <strong>{limit}</strong> manual refreshes
                this month. The counter resets on the 1st.
              </p>
              <p className="text-xs text-muted-foreground">
                Your accounts keep syncing automatically in the background —
                you won't miss anything.
              </p>
              {limit < 15 && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    onOpenChange(false);
                    navigate("/upgrade");
                  }}
                >
                  Get more refreshes
                </Button>
              )}
            </>
          )}

          {mode === "cooldown" && (
            <>
              <p className="text-sm text-muted-foreground">
                Give it{" "}
                <strong>
                  {cooldownMin} minute{cooldownMin !== 1 ? "s" : ""}
                </strong>{" "}
                before the next refresh. Back-to-back pulls can trip your
                bank's rate limits.
              </p>
              <p className="text-xs text-muted-foreground">
                <strong>{remaining}</strong> of <strong>{limit}</strong>{" "}
                refreshes left this month.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
