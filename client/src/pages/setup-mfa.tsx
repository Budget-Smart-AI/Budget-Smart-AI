import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Shield, Smartphone, Copy, CheckCircle, LogOut } from "lucide-react";

const mfaCodeSchema = z.object({
  code: z.string().length(6, "Code must be 6 digits").regex(/^\d+$/, "Code must contain only numbers"),
});

type MfaCodeFormData = z.infer<typeof mfaCodeSchema>;

export default function SetupMfaPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const mfaForm = useForm<MfaCodeFormData>({
    resolver: zodResolver(mfaCodeSchema),
    defaultValues: { code: "" },
  });

  // Check session state
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["/api/auth/session"],
  });

  // Fetch MFA setup data
  const { data: mfaSetup, isLoading: mfaLoading, error: mfaError } = useQuery<{ qrCode: string; secret: string }>({
    queryKey: ["/api/auth/mfa/setup"],
    enabled: !!(session as any)?.mfaSetupRequired || !!(session as any)?.authenticated,
  });

  const enableMfaMutation = useMutation({
    mutationFn: async (data: MfaCodeFormData) => {
      const response = await apiRequest("POST", "/api/auth/mfa/enable", { code: data.code });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "2FA Enabled!",
        description: "Your account is now protected with two-factor authentication."
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      // Navigate to dashboard after successful MFA setup
      setTimeout(() => navigate("/"), 500);
    },
    onError: (error: Error) => {
      toast({
        title: "Invalid Code",
        description: error.message || "Please check your authenticator app and try again.",
        variant: "destructive"
      });
      mfaForm.reset();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/logout");
      return response.json();
    },
    onSuccess: () => {
      // Clear ALL cached data to prevent data leakage between users
      queryClient.clear();
      navigate("/login");
    },
  });

  const copySecret = () => {
    if (mfaSetup?.secret) {
      navigator.clipboard.writeText(mfaSetup.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied", description: "Secret key copied to clipboard" });
    }
  };

  // Redirect if not in MFA setup required state
  if (!sessionLoading && session && !(session as any).mfaSetupRequired && (session as any).authenticated) {
    navigate("/");
    return null;
  }

  // Redirect to login if not authenticated at all
  if (!sessionLoading && (!session || (!(session as any).mfaSetupRequired && !(session as any).authenticated))) {
    navigate("/login");
    return null;
  }

  if (sessionLoading || mfaLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mfaError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Setup Error</CardTitle>
            <CardDescription>
              Unable to load MFA setup. Please try logging in again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => logoutMutation.mutate()} className="w-full">
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Set Up Two-Factor Authentication</CardTitle>
          <CardDescription>
            Two-factor authentication is required to protect your financial data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Why 2FA is required */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-sm">
            <p className="text-amber-600 dark:text-amber-400 font-medium mb-1">Why is this required?</p>
            <p className="text-muted-foreground">
              To keep your financial information secure, we require all accounts to use two-factor authentication.
              This adds an extra layer of protection beyond just your password.
            </p>
          </div>

          {/* Step 1: Download app */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">1</div>
              <span className="font-medium">Download an authenticator app</span>
            </div>
            <p className="text-sm text-muted-foreground pl-8">
              Use Google Authenticator, Authy, or any TOTP authenticator app.
            </p>
          </div>

          {/* Step 2: Scan QR code */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">2</div>
              <span className="font-medium">Scan this QR code</span>
            </div>

            {mfaSetup?.qrCode && (
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <img src={mfaSetup.qrCode} alt="MFA QR Code" className="w-48 h-48" />
                </div>
              </div>
            )}

            {/* Manual entry option */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2">Or enter this code manually:</p>
              <div className="flex items-center justify-center gap-2">
                <code className="bg-muted px-3 py-1.5 rounded text-sm font-mono">
                  {mfaSetup?.secret}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={copySecret}
                >
                  {copied ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Step 3: Enter code */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">3</div>
              <span className="font-medium">Enter the 6-digit code</span>
            </div>

            <Form {...mfaForm}>
              <form onSubmit={mfaForm.handleSubmit((data) => enableMfaMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={mfaForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="relative">
                          <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            {...field}
                            placeholder="000000"
                            maxLength={6}
                            className="pl-10 text-center text-2xl tracking-widest font-mono"
                            autoComplete="one-time-code"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={enableMfaMutation.isPending}
                >
                  {enableMfaMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Enable Two-Factor Authentication
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </div>

          {/* Logout option */}
          <div className="pt-2 border-t">
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Cancel and Log Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
