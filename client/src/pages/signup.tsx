import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Lock, User, Mail, Brain, Zap, ArrowRight
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { BudgetSmartLogo } from "@/components/logo";

import { COUNTRIES } from "@shared/schema";

const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  country: z.string().default("US"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type RegisterFormData = z.infer<typeof registerSchema>;

export default function SignupPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Fetch available auth providers
  const { data: providers } = useQuery({
    queryKey: ["auth-providers"],
    queryFn: async () => {
      const response = await fetch("/api/auth/providers");
      return response.json();
    },
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
      country: "US",
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterFormData) => {
      const { confirmPassword, ...registerData } = data;
      const response = await apiRequest("POST", "/api/auth/register", {
        ...registerData,
        country: data.country,
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Track signup with Partnero for affiliate attribution (only when enabled)
      if (import.meta.env.VITE_PARTNERO_ENABLED === 'true' && typeof window !== 'undefined' && (window as any).po) {
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
        navigate("/login");
      } else {
        // Redirect directly to dashboard — no checkout required
        toast({
          title: "Account Created",
          description: "Welcome to Budget Smart AI!",
        });
        navigate("/dashboard");
      }
    },
    onError: (error: Error) => {
      toast({ title: "Registration Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleGoogleSignIn = () => {
    window.location.href = "/api/auth/google";
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900/50 border-slate-800">
          <CardHeader className="text-center pb-2">
            <BudgetSmartLogo className="h-14 w-14 mx-auto mb-3" />
            <CardTitle className="text-xl font-extrabold bg-gradient-to-r from-emerald-400 via-green-400 to-teal-400 bg-clip-text text-transparent">
              Budget Smart AI
            </CardTitle>
            <p className="text-xs text-muted-foreground font-medium tracking-wide">
              Smarter Money, Brighter Future
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-6">
              <div className="text-center space-y-1">
                <h1 className="text-2xl font-bold text-white">Create your account</h1>
                <p className="text-slate-400 text-sm">Free forever. Upgrade when you're ready.</p>
              </div>

              {providers?.google && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full flex items-center justify-center gap-3 py-5 border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-white"
                    onClick={handleGoogleSignIn}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
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
                <form onSubmit={registerForm.handleSubmit((data) => registerMutation.mutate(data))} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={registerForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="John" />
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
                            <Input {...field} placeholder="Doe" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={registerForm.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-country">
                              <SelectValue placeholder="Select your country" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {COUNTRIES.map((country) => (
                              <SelectItem key={country.code} value={country.code}>
                                {country.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail
                              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                              aria-hidden="true"
                            />
                            <Input
                              {...field}
                              type="email"
                              placeholder="john@example.com"
                              className="pl-10 bg-white text-black"
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
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                              {...field}
                              placeholder="Choose a username"
                              className="pl-10"
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
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                              {...field}
                              type="password"
                              placeholder="Create a password (min 8 characters)"
                              className="pl-10"
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
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                              {...field}
                              type="password"
                              placeholder="Confirm your password"
                              className="pl-10"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
                    disabled={registerMutation.isPending}
                  >
                    {registerMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      <>
                        Create Free Account
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>
              </Form>

              <p className="text-center text-xs text-slate-500">
                By signing up, you agree to our{" "}
                <a href="/terms" className="underline hover:text-white">Terms of Service</a>
                {" "}and{" "}
                <a href="/privacy" className="underline hover:text-white">Privacy Policy</a>
              </p>

              <p className="text-center text-sm text-slate-400">
                Already have an account?{" "}
                <a href="/login" className="text-emerald-400 underline-offset-4 hover:underline">
                  Sign in
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <footer className="border-t border-slate-800 bg-slate-950/50 py-4">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-4 text-sm text-slate-400">
            <a href="/privacy" className="hover:text-white transition-colors">
              Privacy Policy
            </a>
            <span className="text-slate-600">|</span>
            <a href="/terms" className="hover:text-white transition-colors">
              Terms of Service
            </a>
            <span className="text-slate-600">|</span>
            <a href="/security" className="hover:text-white transition-colors">
              Security
            </a>
            <span className="text-slate-600">|</span>
            <a href="/trust" className="hover:text-white transition-colors">
              Trust Center
            </a>
            <span className="text-slate-600">|</span>
            <a href="/contact" className="hover:text-white transition-colors">
              Contact
            </a>
          </div>
          <p className="text-center text-xs text-slate-500 mt-2">
            &copy; {new Date().getFullYear()} Budget Smart AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
