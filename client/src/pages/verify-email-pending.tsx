import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Mail, RefreshCw, ArrowLeft } from "lucide-react";

export default function VerifyEmailPendingPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [cooldown, setCooldown] = useState(0);

  // Get email from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const email = urlParams.get("email") || "";

  // Mask email for display (show first 2 chars and domain)
  const maskedEmail = email ? email.replace(/(.{2})(.*)(@.*)/, "$1***$3") : "";

  const resendMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/resend-verification", { email });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Email Sent",
        description: "A new verification link has been sent to your email."
      });
      // Start 60 second cooldown
      setCooldown(60);
      const interval = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Resend",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Check Your Email</CardTitle>
          <CardDescription className="text-base">
            We've sent a verification link to
          </CardDescription>
          {maskedEmail && (
            <p className="font-medium text-foreground mt-1">{maskedEmail}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm text-muted-foreground">
            <p>Click the link in the email to verify your account.</p>
            <p>The link will expire in 24 hours.</p>
            <p className="text-xs mt-2">
              After verifying your email, you'll be asked to set up two-factor authentication (2FA) to secure your account.
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={() => resendMutation.mutate()}
              disabled={resendMutation.isPending || cooldown > 0 || !email}
              variant="outline"
              className="w-full"
            >
              {resendMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : cooldown > 0 ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Resend in {cooldown}s
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Resend Verification Email
                </>
              )}
            </Button>

            <Button
              onClick={() => navigate("/login")}
              variant="ghost"
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Login
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Didn't receive the email? Check your spam folder or try resending.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
