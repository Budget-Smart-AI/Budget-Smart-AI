import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Gift, Loader2, Check } from "lucide-react";

export default function RedeemPage() {
  const [code, setCode] = useState("");
  const [redeemed, setRedeemed] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const redeemMutation = useMutation({
    mutationFn: async (licenseCode: string) => {
      const response = await apiRequest("POST", "/api/stripe/redeem-code", { code: licenseCode.trim().toUpperCase() });
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.error) {
        toast({ title: "Invalid Code", description: data.error, variant: "destructive" });
        return;
      }
      setRedeemed(true);
      toast({
        title: "Code Redeemed!",
        description: "Your plan has been upgraded. Welcome aboard!",
      });
      setTimeout(() => navigate("/dashboard?subscription=success"), 2000);
    },
    onError: (error: Error) => {
      toast({ title: "Redemption Failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Gift className="h-6 w-6 text-emerald-500" />
          </div>
          <CardTitle>Redeem Your License Code</CardTitle>
          <CardDescription>
            Have an AppSumo or lifetime access code? Enter it below to activate your plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {redeemed ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Check className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="text-center font-medium">Code redeemed successfully!</p>
              <p className="text-sm text-muted-foreground text-center">
                Redirecting you to the dashboard...
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor="code" className="text-sm font-medium">
                  License / Coupon Code
                </label>
                <Input
                  id="code"
                  placeholder="e.g. APPSUMO-XXXXX"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && code) redeemMutation.mutate(code);
                  }}
                />
              </div>

              <Button
                className="w-full"
                onClick={() => redeemMutation.mutate(code)}
                disabled={redeemMutation.isPending || !code}
              >
                {redeemMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <Gift className="mr-2 h-4 w-4" />
                    Redeem Code
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Need help?{" "}
                <a href="/support" className="underline hover:text-foreground">
                  Contact support
                </a>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
