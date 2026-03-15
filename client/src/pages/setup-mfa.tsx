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
import {
  Loader2, Shield, Smartphone, Copy, CheckCircle, LogOut,
  Download, KeyRound, AlertTriangle, CheckCircle2
} from "lucide-react";

const mfaCodeSchema = z.object({
  code: z.string().length(6, "Code must be 6 digits").regex(/^\d+$/, "Code must contain only numbers"),
});

type MfaCodeFormData = z.infer<typeof mfaCodeSchema>;

export default function SetupMfaPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [backupCodesDownloaded, setBackupCodesDownloaded] = useState(false);
  const [backupCodesCopied, setBackupCodesCopied] = useState(false);

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
    onSuccess: (data) => {
      if (data.backupCodes && data.backupCodes.length > 0) {
        // Show backup codes before proceeding
        setBackupCodes(data.backupCodes);
        toast({
          title: "2FA Enabled!",
          description: "Please save your backup codes before continuing.",
        });
      } else {
        toast({
          title: "2FA Enabled!",
          description: "Your account is now protected with two-factor authentication.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
        setTimeout(() => navigate("/"), 500);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Invalid Code",
        description: error.message || "Please check your authenticator app and try again.",
        variant: "destructive",
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

  const copyBackupCodes = () => {
    if (backupCodes) {
      navigator.clipboard.writeText(backupCodes.join("\n"));
      setBackupCodesCopied(true);
      setTimeout(() => setBackupCodesCopied(false), 2000);
      toast({ title: "Copied", description: "Backup codes copied to clipboard" });
    }
  };

  const downloadBackupCodes = () => {
    if (!backupCodes) return;
    const content = [
      "Budget Smart AI - 2FA Backup Codes",
      "====================================",
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "Keep these codes in a safe place. Each code can only be used once.",
      "Use these codes to sign in if you lose access to your authenticator app.",
      "",
      ...backupCodes.map((code, i) => `${i + 1}. ${code}`),
      "",
      "After using a backup code, set up a new authenticator app immediately.",
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "budgetsmart-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBackupCodesDownloaded(true);
    toast({ title: "Downloaded", description: "Backup codes saved to your device" });
  };

  const handleContinue = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
    setTimeout(() => navigate("/"), 500);
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

  // ── Backup codes screen ──────────────────────────────────────────────────
  if (backupCodes) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
              <KeyRound className="w-8 h-8 text-emerald-500" />
            </div>
            <CardTitle className="text-2xl">Save Your Backup Codes</CardTitle>
            <CardDescription>
              Store these codes somewhere safe. You can use them to sign in if you ever lose access to your authenticator app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Warning */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-amber-700 dark:text-amber-300">
                <p className="font-medium">Important — save these now!</p>
                <p className="text-xs mt-0.5">Each code can only be used once. These codes will not be shown again.</p>
              </div>
            </div>

            {/* Backup codes grid */}
            <div className="bg-muted rounded-lg p-4">
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code, i) => (
                  <div
                    key={i}
                    className="font-mono text-sm bg-background border rounded px-3 py-2 text-center tracking-widest"
                  >
                    {code}
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={copyBackupCodes}
              >
                {backupCodesCopied ? (
                  <><CheckCircle className="w-4 h-4 mr-2 text-emerald-500" />Copied!</>
                ) : (
                  <><Copy className="w-4 h-4 mr-2" />Copy All</>
                )}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={downloadBackupCodes}
              >
                {backupCodesDownloaded ? (
                  <><CheckCircle className="w-4 h-4 mr-2 text-emerald-500" />Downloaded!</>
                ) : (
                  <><Download className="w-4 h-4 mr-2" />Download</>
                )}
              </Button>
            </div>

            {/* Confirmation checkbox */}
            <div className="flex items-start gap-3 bg-muted/50 rounded-lg p-3">
              <CheckCircle2 className={`w-5 h-5 mt-0.5 shrink-0 ${backupCodesDownloaded || backupCodesCopied ? "text-emerald-500" : "text-muted-foreground"}`} />
              <p className="text-sm text-muted-foreground">
                {backupCodesDownloaded || backupCodesCopied
                  ? "Great! Your backup codes have been saved."
                  : "Please download or copy your backup codes before continuing."}
              </p>
            </div>

            <Button
              className="w-full"
              onClick={handleContinue}
              disabled={!backupCodesDownloaded && !backupCodesCopied}
            >
              I've Saved My Backup Codes — Continue
            </Button>

            {/* Allow skipping with a warning */}
            <button
              type="button"
              className="w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              onClick={() => {
                if (confirm("Are you sure? Without backup codes, you may be permanently locked out if you lose your authenticator app.")) {
                  handleContinue();
                }
              }}
            >
              Skip for now (not recommended)
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main MFA setup screen ────────────────────────────────────────────────
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
              Use <strong>Google Authenticator</strong>, <strong>Authy</strong>, <strong>Microsoft Authenticator</strong>, or any TOTP app.
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
                  <img src={mfaSetup.qrCode} alt="MFA QR Code — scan with your authenticator app" className="w-48 h-48" />
                </div>
              </div>
            )}

            {/* Manual entry option */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2">Or enter this code manually:</p>
              <div className="flex items-center justify-center gap-2">
                <code className="bg-muted px-3 py-1.5 rounded text-sm font-mono break-all">
                  {mfaSetup?.secret}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={copySecret}
                  aria-label="Copy secret key"
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
              <span className="font-medium">Enter the 6-digit code to confirm</span>
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
                            inputMode="numeric"
                            pattern="[0-9]*"
                            onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
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

          {/* Backup codes info */}
          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground flex gap-2">
            <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
            <p>After enabling 2FA, you'll receive <strong>8 backup codes</strong> to save. These let you sign in if you ever lose your phone.</p>
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
