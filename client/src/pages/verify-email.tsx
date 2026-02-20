import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle, Shield, LogIn } from "lucide-react";

interface VerificationResult {
  success: boolean;
  message: string;
  mfaSetupRequired?: boolean;
  error?: string;
}

export default function VerifyEmailPage() {
  const params = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const token = params.token;
  const [verificationComplete, setVerificationComplete] = useState(false);

  const { data, isLoading, error } = useQuery<VerificationResult>({
    queryKey: ["/api/auth/verify-email", token],
    queryFn: async () => {
      const response = await fetch(`/api/auth/verify-email/${token}`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Verification failed");
      }
      return result;
    },
    enabled: !!token && !verificationComplete,
    retry: false,
  });

  useEffect(() => {
    if (data?.success) {
      setVerificationComplete(true);
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Verifying your email...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <XCircle className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle>Verification Failed</CardTitle>
            <CardDescription>
              {(error as Error).message || "This verification link is invalid or has expired."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              Please request a new verification email from the login page.
            </p>
            <Button onClick={() => navigate("/login")} className="w-full">
              <LogIn className="mr-2 h-4 w-4" />
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <CardTitle className="text-2xl">Email Verified!</CardTitle>
          <CardDescription>
            Your email has been successfully verified.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {data?.mfaSetupRequired ? (
            <>
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  <span className="font-medium">One more step</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  For your security, please set up two-factor authentication (2FA) to protect your account.
                </p>
              </div>
              <Button onClick={() => navigate("/login")} className="w-full">
                Continue to Login
              </Button>
            </>
          ) : (
            <Button onClick={() => navigate("/login")} className="w-full">
              <LogIn className="mr-2 h-4 w-4" />
              Continue to Login
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
