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
import { Loader2, Lock, User, Shield, Mail, UserPlus, Brain, Zap } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const mfaSchema = z.object({
  mfaCode: z.string().length(6, "MFA code must be 6 digits"),
});

type LoginFormData = z.infer<typeof loginSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;
type MfaFormData = z.infer<typeof mfaSchema>;

interface LoginProps {
  onLoginSuccess: () => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showMfa, setShowMfa] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  // Check for OAuth error in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");
    if (error === "google_auth_failed") {
      toast({
        title: "Google Sign-In Failed",
        description: "Unable to sign in with Google. Please try again.",
        variant: "destructive",
      });
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  // Fetch available auth providers
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

  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { 
      firstName: "", 
      lastName: "", 
      email: "", 
      username: "", 
      password: "",
      confirmPassword: "",
    },
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
      // Clear ALL cached data after successful login to prevent data leakage between users.
      // This must happen AFTER the login response is received, not before, to avoid a race
      // condition where clearing the cache triggers a session refetch that returns
      // {authenticated: false} and gets cached, causing AuthenticatedOrRedirect to
      // immediately redirect back to /login even though login just succeeded.
      queryClient.clear();
      if (data.mfaSetupRequired) {
        // Redirect to mandatory MFA setup
        toast({ title: "2FA Setup Required", description: "Please set up two-factor authentication to continue" });
        navigate("/setup-mfa");
      } else if (data.mfaRequired) {
        setShowMfa(true);
        toast({ title: "Enter MFA Code", description: "Please enter your authenticator code" });
      } else {
        toast({ title: "Welcome back!", description: "You have been logged in successfully" });
        onLoginSuccess();
        navigate("/dashboard");
      }
    },
    onError: (error: Error & { emailVerificationRequired?: boolean; email?: string }) => {
      // Check if the error message indicates email verification required
      if (error.message.includes("verify your email")) {
        toast({
          title: "Email Verification Required",
          description: "Please check your email to verify your account.",
        });
        // Try to extract email from error if available
        const email = (error as any).email || loginForm.getValues("username");
        navigate(`/verify-email-pending?email=${encodeURIComponent(email)}`);
      } else if (error.message.includes("pending approval")) {
        toast({
          title: "Account Pending Approval",
          description: "Your account is awaiting admin approval. Please try again later.",
        });
      } else {
        toast({ title: "Login Failed", description: error.message, variant: "destructive" });
      }
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterFormData) => {
      const { confirmPassword, ...registerData } = data;
      const response = await apiRequest("POST", "/api/auth/register", registerData);
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Track signup with Partnero for affiliate attribution
      if (typeof window !== 'undefined' && (window as any).po) {
        try {
          (window as any).po('customer', 'signup', {
            email: variables.email,
            name: `${variables.firstName || ''} ${variables.lastName || ''}`.trim() || variables.username,
          });
        } catch (e) {
          console.log('Partnero tracking error:', e);
        }
      }

      // Email verification required - redirect to verification pending page
      if (data.emailVerificationRequired) {
        toast({
          title: "Account Created",
          description: "Please check your email to verify your account.",
        });
        navigate(`/verify-email-pending?email=${encodeURIComponent(variables.email)}`);
        return;
      }

      if (data.pending) {
        toast({
          title: "Account Created",
          description: data.message || "Please wait for admin approval before logging in.",
        });
        setShowRegister(false);
        registerForm.reset();
      } else {
        toast({ title: "Welcome to Budget Smart AI!", description: "Your account has been created" });
        onLoginSuccess();
        navigate("/dashboard");
      }
    },
    onError: (error: Error) => {
      toast({ title: "Registration Failed", description: error.message, variant: "destructive" });
    },
  });

  const mfaMutation = useMutation({
    mutationFn: async (data: MfaFormData) => {
      const response = await apiRequest("POST", "/api/auth/verify-mfa", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Welcome back!", description: "MFA verified successfully" });
      onLoginSuccess();
      navigate("/");
    },
    onError: (error: Error) => {
      toast({ title: "MFA Failed", description: error.message, variant: "destructive" });
    },
  });

  const renderLoginForm = () => (
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
                  <Input 
                    {...field} 
                    placeholder="Enter username" 
                    className="pl-10"
                    autoComplete="username"
                    data-testid="input-username"
                  />
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
              <FormLabel>Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                  <Input 
                    {...field} 
                    type="password" 
                    placeholder="Enter password"
                    className="pl-10"
                    autoComplete="current-password"
                    data-testid="input-password"
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
          disabled={loginMutation.isPending}
          data-testid="button-login"
        >
          {loginMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Signing in...
            </>
          ) : (
            "Sign In"
          )}
        </Button>
        <div className="text-center">
          <Button
            type="button"
            variant="ghost"
            className="text-emerald-400 underline-offset-4 hover:underline"
            onClick={() => setShowRegister(true)}
            data-testid="button-show-register"
          >
            Don't have an account? Sign up
          </Button>
        </div>
      </form>
    </Form>
    </div>
  );

  const renderRegisterForm = () => (
    <div className="space-y-4">
      {providers?.google && (
        <>
          <Button
            type="button"
            variant="outline"
            className="w-full flex items-center justify-center gap-3 py-5 border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-white"
            onClick={handleGoogleSignIn}
            data-testid="button-google-signup"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
              <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
              </g>
            </svg>
            Sign up with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full bg-slate-700" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-slate-900 px-2 text-slate-400">Or sign up with email</span>
            </div>
          </div>
        </>
      )}

      <Form {...registerForm}>
        <form onSubmit={registerForm.handleSubmit((data) => registerMutation.mutate(data))} className="space-y-4" aria-label="Create account form">
          <div className="grid grid-cols-2 gap-4">
          <FormField
            control={registerForm.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="John" autoComplete="given-name" data-testid="input-register-firstname" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={registerForm.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Doe" autoComplete="family-name" data-testid="input-register-lastname" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={registerForm.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                  <Input 
                    {...field} 
                    type="email" 
                    placeholder="john@example.com"
                    className="pl-10"
                    autoComplete="email"
                    data-testid="input-register-email"
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={registerForm.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                  <Input 
                    {...field} 
                    placeholder="Choose a username"
                    className="pl-10"
                    autoComplete="username"
                    data-testid="input-register-username"
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={registerForm.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                  <Input 
                    {...field} 
                    type="password" 
                    placeholder="Create a password (min 8 characters)"
                    className="pl-10"
                    autoComplete="new-password"
                    data-testid="input-register-password"
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={registerForm.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                  <Input 
                    {...field} 
                    type="password" 
                    placeholder="Confirm your password"
                    className="pl-10"
                    autoComplete="new-password"
                    data-testid="input-register-confirm-password"
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
          disabled={registerMutation.isPending}
          data-testid="button-register"
        >
          {registerMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Creating account...
            </>
          ) : (
            <>
              <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
              Create Account
            </>
          )}
        </Button>
        <div className="text-center">
          <Button
            type="button"
            variant="ghost"
            className="text-emerald-400 underline-offset-4 hover:underline"
            onClick={() => setShowRegister(false)}
            data-testid="button-show-login"
          >
            Already have an account? Sign in
          </Button>
        </div>
      </form>
    </Form>
    </div>
  );

  const renderMfaForm = () => (
    <Form {...mfaForm}>
      <form onSubmit={mfaForm.handleSubmit((data) => mfaMutation.mutate(data))} className="space-y-4" aria-label="Two-factor authentication form">
        <FormField
          control={mfaForm.control}
          name="mfaCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Authenticator Code</FormLabel>
              <FormControl>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                  <Input 
                    {...field} 
                    placeholder="Enter 6-digit code" 
                    maxLength={6}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="pl-10 text-center text-lg tracking-widest"
                    data-testid="input-mfa-code"
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
          disabled={mfaMutation.isPending}
          data-testid="button-verify-mfa"
        >
          {mfaMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Verifying...
            </>
          ) : (
            "Verify Code"
          )}
        </Button>
        <Button 
          type="button" 
          variant="ghost" 
          className="w-full"
          onClick={() => setShowMfa(false)}
          data-testid="button-back-to-login"
        >
          Back to Login
        </Button>
      </form>
    </Form>
  );

  const getTitle = () => {
    if (showMfa) return "Two-Factor Authentication";
    if (showRegister) return "Create Account";
    return "Budget Smart AI";
  };

  const getDescription = () => {
    if (showMfa) return "Enter your authenticator code";
    if (showRegister) return "Sign up to start managing your budget";
    return "Sign in to manage your budget";
  };

  const getIcon = () => {
    if (showMfa) return <Shield className="w-8 h-8 text-emerald-400" />;
    if (showRegister) return <UserPlus className="w-8 h-8 text-emerald-400" />;
    return null;
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900/50 border-slate-800">
          <CardHeader className="text-center">
            {!showMfa && !showRegister ? (
              <>
                <div className="mx-auto mb-3 relative flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 shadow-lg shadow-emerald-500/30">
                  <Brain className="h-7 w-7 text-white" aria-hidden="true" />
                  <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-gradient-to-r from-yellow-400 to-amber-400 flex items-center justify-center shadow-sm" aria-hidden="true">
                    <Zap className="h-2.5 w-2.5 text-white" aria-hidden="true" />
                  </div>
                </div>
                <CardTitle className="text-2xl font-extrabold bg-gradient-to-r from-emerald-400 via-green-400 to-teal-400 bg-clip-text text-transparent">
                  Budget Smart AI
                </CardTitle>
                <p className="text-xs text-slate-400 font-medium tracking-wide mt-1">Smarter Money, Brighter Future</p>
                <CardDescription className="mt-2 text-slate-400">{getDescription()}</CardDescription>
              </>
            ) : (
              <>
                <div className="mx-auto mb-4 w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center">
                  {getIcon()}
                </div>
                <CardTitle className="text-2xl font-bold text-white">{getTitle()}</CardTitle>
                <CardDescription className="text-slate-400">{getDescription()}</CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {showMfa ? renderMfaForm() : showRegister ? renderRegisterForm() : renderLoginForm()}
          </CardContent>
        </Card>
      </div>
      
      <footer className="border-t border-slate-800 bg-slate-950/50 py-4">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-4 text-sm text-slate-400">
            <Link href="/privacy" className="hover:text-white transition-colors" data-testid="link-privacy">
              Privacy Policy
            </Link>
            <span className="text-slate-600" aria-hidden="true">|</span>
            <Link href="/terms" className="hover:text-white transition-colors" data-testid="link-terms">
              Terms of Service
            </Link>
            <span className="text-slate-600" aria-hidden="true">|</span>
            <Link href="/security" className="hover:text-white transition-colors" data-testid="link-security">
              Security
            </Link>
            <span className="text-slate-600" aria-hidden="true">|</span>
            <Link href="/trust" className="hover:text-white transition-colors" data-testid="link-trust">
              Trust Center
            </Link>
            <span className="text-slate-600" aria-hidden="true">|</span>
            <Link href="/contact" className="hover:text-white transition-colors" data-testid="link-contact">
              Contact
            </Link>
            <span className="text-slate-600" aria-hidden="true">|</span>
            <Link href="/data-retention" className="hover:text-white transition-colors" data-testid="link-data-retention">
              Data Retention Policy
            </Link>
          </div>
          <p className="text-center text-xs text-slate-500 mt-2">
            &copy; {new Date().getFullYear()} Budget Smart AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
