import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, User, Shield, KeyRound, AlertTriangle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BudgetSmartLogo } from "@/components/logo";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const mfaSchema = z.object({
  mfaCode: z.string().min(1, "Code is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;
type MfaFormData = z.infer<typeof mfaSchema>;

interface LoginProps {
  onLoginSuccess: () => void;
}

const LOCKOUT_DURATION_MINUTES = 30;

export default function Login({ onLoginSuccess }: LoginProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showMfa, setShowMfa] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (remainingSeconds <= 0) return;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [remainingSeconds > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");
    if (error === "google_auth_failed") {
      toast({
        title: "Google Sign-In Failed",
        description: "Unable to sign in with Google. Please try again.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
    // Show success message after password reset
    const msg = urlParams.get("msg");
    if (msg === "password_reset") {
      toast({
        title: "Password Reset Successful",
        description: "Your password has been updated. Please sign in.",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  const { data: providers } = useQuery({
    queryKey: ["auth-providers"],
    queryFn: async () => {
      const response = await fetch("/api/auth/providers");
      return response.json();
    },
  });

  const handleGoogleSignIn = () => {
    window.location.href = "/api/auth/google";
  };

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const mfaForm = useForm<MfaFormData>({
    resolver: zodResolver(mfaSchema),
    defaultValues: { mfaCode: "" },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.clear();
      if (data.mfaSetupRequired) {
        toast({ title: "2FA Setup Required", description: "Please set up two-factor authentication to continue" });
        navigate("/setup-mfa");
      } else if (data.mfaRequired) {
        setShowMfa(true);
        setUseBackupCode(false);
        toast({ title: "Enter Verification Code", description: "Please enter your authenticator code to continue" });
      } else {
        toast({ title: "Welcome back!", description: "You have been logged in successfully" });
        onLoginSuccess();
        navigate("/dashboard");
      }
    },
    onError: (error: Error & { emailVerificationRequired?: boolean; email?: string }) => {
      const anyError = error as any;
      // FIX 3: Handle account locked response
      if (anyError.code === "ACCOUNT_LOCKED") {
        setIsLocked(true);
        setRemainingSeconds(anyError.remainingSeconds || LOCKOUT_DURATION_MINUTES * 60);
        return;
      }
      // FIX 4: Progressive attempt warnings — show as amber (default) toast
      if (anyError.attemptsRemaining !== undefined) {
        toast({
          title: "Incorrect Password",
          description: error.message,
        });
        return;
      }
      // Google OAuth users must sign in with Google — not username/password
      if (anyError.googleAuthRequired) {
        toast({
          title: "Use Google Sign-In",
          description: "This account was created with Google. Please click 'Continue with Google' to sign in.",
          variant: "destructive",
        });
        return;
      }
      if (error.message.includes("verify your email")) {
        toast({
          title: "Email Verification Required",
          description: "Please check your email to verify your account before signing in.",
        });
        const email = anyError.email || loginForm.getValues("username");
        navigate(`/verify-email-pending?email=${encodeURIComponent(email)}`);
      } else if (error.message.includes("pending approval")) {
        toast({
          title: "Account Pending Approval",
          description: "Your account is awaiting admin approval. Please try again later.",
        });
      } else if (error.message.toLowerCase().includes("locked")) {
        toast({
          title: "Account Temporarily Locked",
          description: error.message,
          variant: "destructive",
        });
      } else if (error.message.toLowerCase().includes("invalid username or password")) {
        toast({
          title: "Sign-In Failed",
          description: "The username or password you entered is incorrect. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sign-In Failed",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });

  const mfaMutation = useMutation({
    mutationFn: async (data: MfaFormData) => {
      const endpoint = useBackupCode
        ? "/api/auth/verify-backup-code"
        : "/api/auth/verify-mfa";
      const response = await apiRequest("POST", endpoint, { code: data.mfaCode });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.backupCodeUsed) {
        toast({
          title: "Backup Code Used",
          description: `You have ${data.remainingCodes} backup code(s) remaining. Please set up a new authenticator app soon.`,
        });
      } else {
        toast({ title: "Welcome back!", description: "Verification successful" });
      }
      onLoginSuccess();
      navigate("/");
    },
    onError: (error: Error) => {
      toast({
        title: useBackupCode ? "Invalid Backup Code" : "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // FIX 3: Lockout UI with countdown timer
  if (isLocked) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-slate-900/50 border-slate-800">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4 p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Lock className="w-8 h-8 text-amber-500" />
                </div>
                <h2 className="text-xl font-bold text-white">Account Temporarily Locked</h2>
                <p className="text-slate-400 text-sm">
                  Too many failed sign-in attempts. Your account has been locked for security.
                </p>
                <div className="bg-slate-800/60 rounded-xl p-4 w-full text-center border border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">Automatically unlocks in</p>
                  <p className="text-3xl font-mono font-bold text-amber-500">
                    {formatTime(remainingSeconds)}
                  </p>
                </div>
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-500"
                  onClick={() => navigate("/forgot-password")}
                >
                  Reset Password to Unlock Now →
                </Button>
                <p className="text-xs text-slate-500">
                  A security notification has been sent to your email address.
                </p>
                {remainingSeconds === 0 && (
                  <Button
                    variant="outline"
                    className="w-full border-slate-700 text-white hover:bg-slate-800"
                    onClick={() => setIsLocked(false)}
                  >
                    Try Again
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        <PageFooter />
      </div>
    );
  }

  if (showMfa) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-slate-900/50 border-slate-800">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center">
                {useBackupCode ? (
                  <KeyRound className="w-8 h-8 text-emerald-400" />
                ) : (
                  <Shield className="w-8 h-8 text-emerald-400" />
                )}
              </div>
              <CardTitle className="text-2xl font-bold text-white">
                {useBackupCode ? "Use Backup Code" : "Two-Factor Authentication"}
              </CardTitle>
              <CardDescription className="text-slate-400">
                {useBackupCode
                  ? "Enter one of your saved backup codes"
                  : "Enter the 6-digit code from your authenticator app"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...mfaForm}>
                <form
                  onSubmit={mfaForm.handleSubmit((data) => mfaMutation.mutate(data))}
                  className="space-y-4"
                  aria-label="Two-factor authentication form"
                >
                  <FormField
                    control={mfaForm.control}
                    name="mfaCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {useBackupCode ? "Backup Code" : "Authenticator Code"}
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            {useBackupCode ? (
                              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                            ) : (
                              <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                            )}
                            <Input
                              {...field}
                              placeholder={useBackupCode ? "Enter backup code (e.g. A1B2C3D4)" : "Enter 6-digit code"}
                              maxLength={useBackupCode ? 8 : 6}
                              inputMode={useBackupCode ? "text" : "numeric"}
                              pattern={useBackupCode ? undefined : "[0-9]*"}
                              className={`pl-10 text-center text-lg tracking-widest ${useBackupCode ? "uppercase" : ""}`}
                              autoComplete="one-time-code"
                              data-testid="input-mfa-code"
                              onChange={(e) => {
                                const val = useBackupCode
                                  ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                                  : e.target.value.replace(/\D/g, "");
                                field.onChange(val);
                              }}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {useBackupCode && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300">
                      <AlertTriangle className="w-3 h-3 inline mr-1" />
                      Each backup code can only be used once. After signing in, please set up a new authenticator app.
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-500"
                    disabled={mfaMutation.isPending}
                    data-testid="button-verify-mfa"
                  >
                    {mfaMutation.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Verifying...</>
                    ) : (
                      useBackupCode ? "Use Backup Code" : "Verify Code"
                    )}
                  </Button>

                  {/* Toggle between TOTP and backup code */}
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-slate-400 hover:text-white text-sm"
                    onClick={() => {
                      setUseBackupCode(!useBackupCode);
                      mfaForm.reset();
                    }}
                  >
                    {useBackupCode
                      ? "← Use authenticator app instead"
                      : "Lost access to your authenticator? Use a backup code"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-slate-500 hover:text-slate-300 text-sm"
                    onClick={() => {
                      setShowMfa(false);
                      setUseBackupCode(false);
                      mfaForm.reset();
                    }}
                    data-testid="button-back-to-login"
                  >
                    ← Back to Sign In
                  </Button>
                </form>
              </Form>

              {/* Lost all access help */}
              <div className="mt-4 pt-4 border-t border-slate-800 text-center">
                <p className="text-xs text-slate-500">
                  Lost all access to your 2FA?{" "}
                  <Link href="/support" className="text-emerald-400 hover:text-emerald-300">
                    Contact support
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        <PageFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900/50 border-slate-800">
          <CardHeader className="text-center">
            <BudgetSmartLogo className="h-14 w-14 mx-auto mb-3" />
            <CardTitle className="text-2xl font-extrabold bg-gradient-to-r from-emerald-400 via-green-400 to-teal-400 bg-clip-text text-transparent">
              Budget Smart AI
            </CardTitle>
            <p className="text-xs text-slate-400 font-medium tracking-wide mt-1">Smarter Money, Brighter Future</p>
            <CardDescription className="mt-2 text-slate-400">Sign in to manage your budget</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {providers?.google && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full flex items-center justify-center gap-3 py-5 border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-white"
                    onClick={handleGoogleSignIn}
                    data-testid="button-google-signin"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                      <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                        <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                        <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                        <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                        <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
                      </g>
                    </svg>
                    Continue with Google
                  </Button>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <Separator className="w-full bg-slate-700" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-slate-900 px-2 text-slate-400">Or continue with</span>
                    </div>
                  </div>
                </>
              )}

              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4" aria-label="Sign in form">
                  <FormField
                    control={loginForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                            <Input {...field} placeholder="Enter username" className="pl-10" autoComplete="username" data-testid="input-username" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Password</FormLabel>
                          <Link
                            href="/forgot-password"
                            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                            data-testid="link-forgot-password"
                          >
                            Forgot password?
                          </Link>
                        </div>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                            <Input {...field} type="password" placeholder="Enter password" className="pl-10" autoComplete="current-password" data-testid="input-password" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500" disabled={loginMutation.isPending} data-testid="button-login">
                    {loginMutation.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Signing in...</>
                    ) : "Sign In"}
                  </Button>
                  <div className="text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-emerald-400 underline-offset-4 hover:underline"
                      onClick={() => navigate("/signup")}
                      data-testid="button-show-register"
                    >
                      Don't have an account? Sign up
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </CardContent>
        </Card>
      </div>

      <PageFooter />
    </div>
  );
}

function PageFooter() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950/50 py-4">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap justify-center gap-4 text-sm text-slate-400">
          <Link href="/privacy" className="hover:text-white transition-colors" data-testid="link-privacy">Privacy Policy</Link>
          <span className="text-slate-600" aria-hidden="true">|</span>
          <Link href="/terms" className="hover:text-white transition-colors" data-testid="link-terms">Terms of Service</Link>
          <span className="text-slate-600" aria-hidden="true">|</span>
          <Link href="/security" className="hover:text-white transition-colors" data-testid="link-security">Security</Link>
          <span className="text-slate-600" aria-hidden="true">|</span>
          <Link href="/trust" className="hover:text-white transition-colors" data-testid="link-trust">Trust Center</Link>
          <span className="text-slate-600" aria-hidden="true">|</span>
          <Link href="/contact" className="hover:text-white transition-colors" data-testid="link-contact">Contact</Link>
          <span className="text-slate-600" aria-hidden="true">|</span>
          <Link href="/data-retention" className="hover:text-white transition-colors" data-testid="link-data-retention">Data Retention Policy</Link>
        </div>
        <p className="text-center text-xs text-slate-500 mt-2">
          &copy; {new Date().getFullYear()} Budget Smart AI. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
