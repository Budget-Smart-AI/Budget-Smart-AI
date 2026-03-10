import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Lock, User, Mail, UserPlus, Brain, Zap, Sparkles,
  Shield, Check, Star, CreditCard, Calendar, ArrowRight, ArrowLeft, Gift
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

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

interface PlanData {
  id: string;
  name: string;
  price: string;
  billingPeriod: string;
  description: string | null;
  features: string;
  trialDays: number | null;
  stripePriceId: string | null;
}

export default function SignupPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [emailReminder, setEmailReminder] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PlanData | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [registeredUser, setRegisteredUser] = useState<{ firstName: string; userId: string } | null>(null);

  // Get plan ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const planId = urlParams.get("plan");

  // Fetch available auth providers
  const { data: providers } = useQuery({
    queryKey: ["auth-providers"],
    queryFn: async () => {
      const response = await fetch("/api/auth/providers");
      return response.json();
    },
  });

  // Fetch plan details if planId is provided
  const { data: planData, isLoading: planLoading } = useQuery<PlanData>({
    queryKey: ["/api/landing/pricing", planId],
    queryFn: async () => {
      const response = await fetch(`/api/landing/pricing/${planId}`);
      if (!response.ok) throw new Error("Plan not found");
      return response.json();
    },
    enabled: !!planId,
  });

  // Fetch all plans if no planId provided (for plan selection)
  const { data: landingData, isLoading: allPlansLoading } = useQuery<{ pricing: PlanData[] }>({
    queryKey: ["/api/landing"],
    enabled: !planId,
  });

  // All plans with a Stripe price ID
  const allAvailablePlans = landingData?.pricing?.filter(p => p.stripePriceId) || [];

  // Plans filtered by the chosen billing period
  const availablePlans = allAvailablePlans.filter(p => p.billingPeriod === billingPeriod);

  useEffect(() => {
    if (planData) {
      setSelectedPlan(planData);
    } else if (!planId && availablePlans.length > 0) {
      // Auto-select the most popular plan or first available plan for current billing period
      const popularPlan = availablePlans.find(p => (p as any).isPopular === "true") || availablePlans[0];
      setSelectedPlan(popularPlan);
    }
  }, [planData, planId, billingPeriod, availablePlans.length]);

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
        trialEmailReminder: emailReminder,
        selectedPlanId: planId,
        country: data.country,
      });
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
        navigate("/login");
      } else {
        setRegisteredUser({ firstName: variables.firstName, userId: data.userId || data.id });
        // Move to checkout step
        setStep(3);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Registration Failed", description: error.message, variant: "destructive" });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/create-checkout-session", {
        priceId: selectedPlan?.stripePriceId,
        planId: selectedPlan?.id,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast({ title: "Checkout Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleGoogleSignIn = () => {
    // Store plan info for after OAuth (using localStorage to persist across redirect)
    if (selectedPlan) {
      localStorage.setItem("pendingCheckout", JSON.stringify({
        planId: selectedPlan.id,
        priceId: selectedPlan.stripePriceId,
        emailReminder: emailReminder,
        timestamp: Date.now(),
      }));
    }
    window.location.href = "/api/auth/google";
  };

  const price = selectedPlan ? parseFloat(selectedPlan.price) : 0;
  const monthlyEquivalent = selectedPlan?.billingPeriod === "yearly" ? (price / 12).toFixed(2) : price.toFixed(2);
  const trialDays = selectedPlan?.trialDays || 14;

  // Step 1: Trial Introduction
  const renderTrialIntro = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-white">
          Try Budget Smart AI for free
        </h1>
        <p className="text-slate-400">
          You won't be charged anything today
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-start gap-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Jump right in</h3>
            <p className="text-sm text-slate-400">
              Connect your accounts today and start getting insights in minutes.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <Star className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Get a new level of clarity</h3>
            <p className="text-sm text-slate-400">
              Members report saving $200+ per month on average after joining.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
            <Shield className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h3 className="font-semibold text-white">We've got your back</h3>
            <p className="text-sm text-slate-400">
              Try Budget Smart AI risk-free. Cancel anytime with our money-back guarantee.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-lg border border-slate-700 bg-slate-800/50">
        <Checkbox
          id="emailReminder"
          checked={emailReminder}
          onCheckedChange={(checked) => setEmailReminder(checked === true)}
          className="border-slate-600 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
        />
        <label htmlFor="emailReminder" className="text-sm text-slate-400 cursor-pointer">
          Email me before my trial ends so I can cancel if Budget Smart AI isn't right for me
        </label>
      </div>

      <Button
        onClick={() => setStep(2)}
        className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white py-6 text-lg"
      >
        Continue
        <ArrowRight className="ml-2 h-5 w-5" />
      </Button>

      <p className="text-center text-xs text-slate-500">
        By continuing, you agree to our{" "}
        <a href="/terms" className="underline hover:text-white">Terms of Service</a>
        {" "}and{" "}
        <a href="/privacy" className="underline hover:text-white">Privacy Policy</a>
      </p>
    </motion.div>
  );

  // Step 2: Account Creation
  const renderAccountCreation = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-white">Create your account</h1>
        <p className="text-slate-400">
          Set up your free {trialDays}-day trial
        </p>
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
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      {...field}
                      type="email"
                      placeholder="john@example.com"
                      className="pl-10"
                      autoComplete="email"
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

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(1)}
              className="flex-1 border-slate-700 text-white hover:bg-slate-800"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>

      <p className="text-center text-sm text-slate-400">
        Already have an account?{" "}
        <a href="/login" className="text-emerald-400 underline-offset-4 hover:underline">
          Sign in
        </a>
      </p>
    </motion.div>
  );

  // Step 3: Checkout with Trust Signals
  const renderCheckout = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-white">
          {registeredUser?.firstName ? `${registeredUser.firstName},` : ""} Experience Budget Smart AI today
        </h1>
        <div className="flex items-center justify-center gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
          ))}
          <span className="text-sm text-slate-400 ml-1">(60K+ reviews)</span>
        </div>
      </div>

      {/* Trust signals */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Check className="h-4 w-4 text-emerald-400" />
          </div>
          <span className="text-sm text-slate-300">Cancel anytime, no pressure or hassle</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Calendar className="h-4 w-4 text-emerald-400" />
          </div>
          <span className="text-sm text-slate-300">We'll remind you before your trial ends</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Shield className="h-4 w-4 text-emerald-400" />
          </div>
          <span className="text-sm text-slate-300">Not for you? Get a refund for the unused time</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <CreditCard className="h-4 w-4 text-emerald-400" />
          </div>
          <span className="text-sm text-slate-300">Easily track your trial days in your dashboard</span>
        </div>
      </div>

      {/* Plan selection if multiple plans available */}
      {allAvailablePlans.length > 0 && !planId && (
        <div className="space-y-3">
          {/* Billing Period Toggle */}
          <div>
            <p className="text-sm font-medium text-slate-400 mb-2">Billing cycle:</p>
            <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
              <button
                onClick={() => setBillingPeriod("monthly")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  billingPeriod === "monthly"
                    ? "bg-emerald-500 text-white"
                    : "bg-transparent text-slate-400 hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod("yearly")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  billingPeriod === "yearly"
                    ? "bg-emerald-500 text-white"
                    : "bg-transparent text-slate-400 hover:text-white"
                }`}
              >
                Annual
                <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Save up to 30%
                </span>
              </button>
            </div>
          </div>

          {/* Plan Cards for chosen billing period */}
          {availablePlans.length > 0 ? (
            <div className="grid gap-2">
              {availablePlans.map((plan) => {
                const planPrice = parseFloat(plan.price);
                const isSelected = selectedPlan?.id === plan.id;
                const isFamilyPlan = plan.name.toLowerCase().includes('family');
                return (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className={`relative p-4 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-slate-700 hover:border-emerald-500/50"
                    } ${isFamilyPlan ? "ring-2 ring-emerald-500/50" : ""}`}
                  >
                    {isFamilyPlan && (
                      <div className="absolute -top-2.5 left-4">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium">
                          Most Popular
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{plan.name}</span>
                        {isFamilyPlan && billingPeriod === "yearly" && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            <Gift className="h-3 w-3" />
                            +2 Months Free
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-white font-bold">${planPrice.toFixed(2)}/mo</span>
                      </div>
                    </div>
                    {billingPeriod === "yearly" && (
                      <p className="text-xs text-emerald-400 mt-1">Billed as one annual payment</p>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">No {billingPeriod} plans available.</p>
          )}
        </div>
      )}

      {/* Pricing display */}
      {selectedPlan && (
        <div className="p-6 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
          <div className="text-center space-y-2">
            <p className="text-sm text-slate-400">{selectedPlan.name}</p>
            <div className="text-3xl font-bold text-white">
              ${price.toFixed(2)}{" "}
              <span className="text-lg font-normal text-slate-400">
                / {selectedPlan.billingPeriod === "yearly" ? "year" : "month"}
              </span>
            </div>
            {selectedPlan.billingPeriod === "yearly" && (
              <p className="text-sm text-emerald-400">
                ${monthlyEquivalent}/month — billed as a single annual payment
              </p>
            )}
            {selectedPlan.billingPeriod === "monthly" && (
              <p className="text-sm text-slate-400">Billed monthly, cancel anytime</p>
            )}
            <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-sm font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              {trialDays}-day free trial
            </div>
          </div>
        </div>
      )}

      <Button
        onClick={() => checkoutMutation.mutate()}
        disabled={checkoutMutation.isPending || !selectedPlan?.stripePriceId}
        className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white py-6 text-lg"
      >
        {checkoutMutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Preparing checkout...
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-5 w-5" />
            Start Free Trial
          </>
        )}
      </Button>

      <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <Shield className="h-3.5 w-3.5" />
          <span>SSL Secured</span>
        </div>
        <div className="flex items-center gap-1">
          <Lock className="h-3.5 w-3.5" />
          <span>256-bit encryption</span>
        </div>
      </div>
    </motion.div>
  );

  if (planLoading || allPlansLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900/50 border-slate-800">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 relative flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 shadow-lg shadow-emerald-500/30">
              <Brain className="h-7 w-7 text-white" />
              <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-gradient-to-r from-yellow-400 to-amber-400 flex items-center justify-center shadow-sm">
                <Zap className="h-2.5 w-2.5 text-white" />
              </div>
            </div>
            <CardTitle className="text-xl font-extrabold bg-gradient-to-r from-emerald-400 via-green-400 to-teal-400 bg-clip-text text-transparent">
              Budget Smart AI
            </CardTitle>
            <p className="text-xs text-muted-foreground font-medium tracking-wide">
              Smarter Money, Brighter Future
            </p>

            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 pt-4">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`h-2 rounded-full transition-all ${
                    s === step
                      ? "w-8 bg-emerald-500"
                      : s < step
                      ? "w-2 bg-emerald-500/50"
                      : "w-2 bg-muted"
                  }`}
                />
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <AnimatePresence mode="wait">
              {step === 1 && renderTrialIntro()}
              {step === 2 && renderAccountCreation()}
              {step === 3 && renderCheckout()}
            </AnimatePresence>
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
