import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, Eye, EyeOff, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import { BudgetSmartLogo } from "@/components/logo";

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain at least one uppercase letter")
      .regex(/[a-z]/, "Must contain at least one lowercase letter")
      .regex(/[0-9]/, "Must contain at least one number")
      .regex(/[^A-Za-z0-9]/, "Must contain at least one special character"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

function getPasswordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: "Weak", color: "bg-red-500" };
  if (score <= 4) return { score, label: "Fair", color: "bg-yellow-500" };
  if (score <= 5) return { score, label: "Good", color: "bg-blue-500" };
  return { score, label: "Strong", color: "bg-emerald-500" };
}

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [tokenError, setTokenError] = useState("");

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const watchedPassword = form.watch("password");
  const strength = watchedPassword ? getPasswordStrength(watchedPassword) : null;

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      setTokenError("Invalid reset link. Please request a new one.");
      return;
    }
    fetch(`/api/auth/reset-password/validate/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setTokenValid(true);
        } else {
          setTokenValid(false);
          setTokenError(data.error || "This reset link is invalid or has expired.");
        }
      })
      .catch(() => {
        setTokenValid(false);
        setTokenError("Unable to validate reset link. Please try again.");
      });
  }, [token]);

  const resetMutation = useMutation({
    mutationFn: async (data: ResetPasswordFormData) => {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: data.password }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to reset password");
      }
      return response.json();
    },
    onSuccess: () => {
      setSuccess(true);
      toast({ title: "Password Reset!", description: "Your password has been updated successfully." });
      setTimeout(() => navigate("/login"), 3000);
    },
    onError: (error: Error) => {
      toast({ title: "Reset Failed", description: error.message, variant: "destructive" });
    },
  });

  // Loading state while validating token
  if (tokenValid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  // Invalid token
  if (tokenValid === false) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-slate-900/50 border-slate-800">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
              <CardTitle className="text-2xl font-bold text-white">Link Expired</CardTitle>
              <CardDescription className="text-slate-400">{tokenError}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-500">
                <Link href="/forgot-password">Request a New Reset Link</Link>
              </Button>
              <div className="text-center">
                <Link href="/login" className="text-emerald-400 hover:text-emerald-300 text-sm inline-flex items-center gap-1">
                  <ArrowLeft className="w-3 h-3" />
                  Back to Sign In
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
        <PageFooter />
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-slate-900/50 border-slate-800">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <CardTitle className="text-2xl font-bold text-white">Password Reset!</CardTitle>
              <CardDescription className="text-slate-400">
                Your password has been updated. Redirecting you to sign in…
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-500">
                <Link href="/login">Sign In Now</Link>
              </Button>
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
            <BudgetSmartLogo className="h-12 w-12 mx-auto mb-3" />
            <CardTitle className="text-2xl font-bold text-white">Reset Your Password</CardTitle>
            <CardDescription className="text-slate-400">
              Choose a strong new password for your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => resetMutation.mutate(data))}
                className="space-y-4"
                aria-label="Reset password form"
              >
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                          <Input
                            {...field}
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter new password"
                            className="pl-10 pr-10"
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      {/* Password strength indicator */}
                      {watchedPassword && strength && (
                        <div className="mt-2 space-y-1">
                          <div className="flex gap-1">
                            {[1, 2, 3, 4].map((i) => (
                              <div
                                key={i}
                                className={`h-1 flex-1 rounded-full transition-colors ${
                                  strength.score >= i * 1.5
                                    ? strength.color
                                    : "bg-slate-700"
                                }`}
                              />
                            ))}
                          </div>
                          <p className="text-xs text-slate-400">
                            Strength: <span className={`font-medium ${
                              strength.label === "Weak" ? "text-red-400" :
                              strength.label === "Fair" ? "text-yellow-400" :
                              strength.label === "Good" ? "text-blue-400" :
                              "text-emerald-400"
                            }`}>{strength.label}</span>
                          </p>
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                          <Input
                            {...field}
                            type={showConfirm ? "text" : "password"}
                            placeholder="Confirm new password"
                            className="pl-10 pr-10"
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirm(!showConfirm)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                            aria-label={showConfirm ? "Hide password" : "Show password"}
                          >
                            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Password requirements */}
                <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400 space-y-1">
                  <p className="font-medium text-slate-300 mb-1">Password requirements:</p>
                  {[
                    { test: watchedPassword?.length >= 8, label: "At least 8 characters" },
                    { test: /[A-Z]/.test(watchedPassword || ""), label: "One uppercase letter" },
                    { test: /[a-z]/.test(watchedPassword || ""), label: "One lowercase letter" },
                    { test: /[0-9]/.test(watchedPassword || ""), label: "One number" },
                    { test: /[^A-Za-z0-9]/.test(watchedPassword || ""), label: "One special character" },
                  ].map(({ test, label }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className={test ? "text-emerald-400" : "text-slate-600"}>
                        {test ? "✓" : "○"}
                      </span>
                      <span className={test ? "text-slate-300" : ""}>{label}</span>
                    </div>
                  ))}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500"
                  disabled={resetMutation.isPending}
                >
                  {resetMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Resetting Password...</>
                  ) : (
                    "Reset Password"
                  )}
                </Button>

                <div className="text-center">
                  <Link href="/login" className="text-emerald-400 hover:text-emerald-300 text-sm inline-flex items-center gap-1">
                    <ArrowLeft className="w-3 h-3" />
                    Back to Sign In
                  </Link>
                </div>
              </form>
            </Form>
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
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          <span className="text-slate-600" aria-hidden="true">|</span>
          <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
          <span className="text-slate-600" aria-hidden="true">|</span>
          <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
        </div>
        <p className="text-center text-xs text-slate-500 mt-2">
          &copy; {new Date().getFullYear()} Budget Smart AI. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
