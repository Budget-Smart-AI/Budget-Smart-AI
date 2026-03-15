import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { BudgetSmartLogo } from "@/components/logo";

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: ForgotPasswordFormData) => {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to send reset email");
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      setSubmittedEmail(variables.email);
      setSubmitted(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-slate-900/50 border-slate-800">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <CardTitle className="text-2xl font-bold text-white">Check Your Email</CardTitle>
              <CardDescription className="text-slate-400">
                If an account exists for <span className="text-emerald-400 font-medium">{submittedEmail}</span>, we've sent a password reset link.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-800/50 rounded-lg p-4 text-sm text-slate-300 space-y-2">
                <p>• The link will expire in <strong className="text-white">1 hour</strong></p>
                <p>• Check your spam/junk folder if you don't see it</p>
                <p>• You can only request one reset every 15 minutes</p>
              </div>
              <Button
                variant="outline"
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => {
                  setSubmitted(false);
                  form.reset();
                }}
              >
                Try a different email
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

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900/50 border-slate-800">
          <CardHeader className="text-center">
            <BudgetSmartLogo className="h-12 w-12 mx-auto mb-3" />
            <CardTitle className="text-2xl font-bold text-white">Forgot Password?</CardTitle>
            <CardDescription className="text-slate-400">
              Enter your email address and we'll send you a link to reset your password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => forgotPasswordMutation.mutate(data))}
                className="space-y-4"
                aria-label="Forgot password form"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                          <Input
                            {...field}
                            type="email"
                            placeholder="you@example.com"
                            className="pl-10"
                            autoComplete="email"
                            autoFocus
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500"
                  disabled={forgotPasswordMutation.isPending}
                >
                  {forgotPasswordMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending Reset Link...</>
                  ) : (
                    "Send Reset Link"
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

            {/* Help section */}
            <div className="mt-6 pt-4 border-t border-slate-800">
              <p className="text-xs text-slate-500 text-center">
                Don't have an account?{" "}
                <Link href="/signup" className="text-emerald-400 hover:text-emerald-300">
                  Sign up for free
                </Link>
              </p>
              <p className="text-xs text-slate-500 text-center mt-2">
                Lost access to your authenticator app?{" "}
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
