import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COUNTRIES } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Shield, ShieldCheck, ShieldOff, QrCode, LogOut, User, Save, Trash2, AlertTriangle, Database, CreditCard, Calendar, Sparkles, ExternalLink } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocation } from "wouter";
import { HouseholdSettings } from "@/components/household-settings";
import { PWAInstallCard } from "@/components/pwa-install-prompt";
import { ReferralProgram } from "@/components/referral-program";

const mfaCodeSchema = z.object({
  code: z.string().length(6, "Code must be 6 digits"),
});

const profileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email("Valid email required").optional().or(z.literal("")),
  phone: z.string().optional(),
  country: z.string().optional(),
});

type MfaCodeFormData = z.infer<typeof mfaCodeSchema>;
type ProfileFormData = z.infer<typeof profileSchema>;

interface SettingsProps {
  onLogout: () => void;
}

export default function Settings({ onLogout }: SettingsProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const mfaForm = useForm<MfaCodeFormData>({
    resolver: zodResolver(mfaCodeSchema),
    defaultValues: { code: "" },
  });

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      country: "US",
    },
  });

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["/api/auth/session"],
  });

  const { data: mfaSetup, refetch: refetchMfaSetup } = useQuery({
    queryKey: ["/api/auth/mfa/setup"],
    enabled: showMfaSetup,
  });

  // Subscription status query
  const { data: subscriptionData, isLoading: subscriptionLoading } = useQuery({
    queryKey: ["/api/stripe/subscription"],
  });

  // Billing portal mutation
  const billingPortalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/create-portal-session");
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.open(data.url, "_blank");
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (session && (session as any).authenticated) {
      profileForm.reset({
        firstName: (session as any).firstName || "",
        lastName: (session as any).lastName || "",
        email: (session as any).email || "",
        phone: (session as any).phone || "",
        country: (session as any).country || "US",
      });
    }
  }, [session]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const response = await apiRequest("PATCH", "/api/auth/profile", {
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        email: data.email || null,
        phone: data.phone || null,
        country: data.country || null,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Profile Updated", description: "Your profile has been saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
    },
    onError: (error: Error) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const enableMfaMutation = useMutation({
    mutationFn: async (data: MfaCodeFormData) => {
      const response = await apiRequest("POST", "/api/auth/mfa/enable", { code: data.code });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "MFA Enabled", description: "Two-factor authentication is now active" });
      setShowMfaSetup(false);
      mfaForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Enable MFA", description: error.message, variant: "destructive" });
    },
  });

  const disableMfaMutation = useMutation({
    mutationFn: async (data: MfaCodeFormData) => {
      const response = await apiRequest("POST", "/api/auth/mfa/disable", { code: data.code });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "MFA Disabled", description: "Two-factor authentication has been removed" });
      mfaForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Disable MFA", description: error.message, variant: "destructive" });
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
      toast({ title: "Logged Out", description: "You have been logged out successfully" });
      onLogout();
      navigate("/");
    },
    onError: (error: Error) => {
      toast({ title: "Logout Failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/auth/account");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Account Deleted", description: "Your account and all associated data have been permanently deleted" });
      onLogout();
      navigate("/");
    },
    onError: (error: Error) => {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSetupMfa = () => {
    setShowMfaSetup(true);
    refetchMfaSetup();
  };

  const mfaEnabled = (session as any)?.mfaEnabled || (mfaSetup as any)?.mfaEnabled || false;
  const sessionData = session as any;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold" data-testid="text-settings-title">Settings</h1>
          <HelpTooltip
            title="About Settings"
            content="Manage your profile information, change your password, and configure multi-factor authentication (MFA) for enhanced security. Use a TOTP authenticator app like Google Authenticator or Authy."
          />
        </div>
        <p className="text-muted-foreground">Manage your account and security settings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile Information
          </CardTitle>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent>
          {sessionLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit((data) => updateProfileMutation.mutate(data))} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={profileForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="John" data-testid="input-first-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Doe" data-testid="input-last-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={profileForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="john@example.com" data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} type="tel" placeholder="+1 (555) 123-4567" data-testid="input-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "US"}>
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
                <Button 
                  type="submit" 
                  disabled={updateProfileMutation.isPending}
                  data-testid="button-save-profile"
                >
                  {updateProfileMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Profile
                    </>
                  )}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Account Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Username</p>
              <p className="text-sm text-muted-foreground" data-testid="text-username">
                {sessionData?.username || "Loading..."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Subscription & Billing
          </CardTitle>
          <CardDescription>Manage your subscription and billing information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscriptionLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (subscriptionData as any)?.hasSubscription ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Plan</p>
                  <p className="text-sm text-muted-foreground">
                    {(subscriptionData as any)?.plan?.name || "Premium"}
                  </p>
                </div>
                <Badge
                  variant={(subscriptionData as any)?.status === "active" ? "default" : "secondary"}
                  className={(subscriptionData as any)?.status === "trialing" ? "bg-amber-500" : ""}
                >
                  {(subscriptionData as any)?.status === "trialing" && (
                    <Sparkles className="w-3 h-3 mr-1" />
                  )}
                  {(subscriptionData as any)?.status === "trialing"
                    ? "Trial"
                    : (subscriptionData as any)?.status === "active"
                    ? "Active"
                    : (subscriptionData as any)?.status}
                </Badge>
              </div>

              {(subscriptionData as any)?.status === "trialing" && (subscriptionData as any)?.trialEndsAt && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <Calendar className="w-4 h-4 text-amber-500" />
                  <span className="text-sm">
                    Trial ends on{" "}
                    {new Date((subscriptionData as any)?.trialEndsAt).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              )}

              {(subscriptionData as any)?.subscriptionEndsAt && (subscriptionData as any)?.status !== "trialing" && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Next billing date</span>
                  <span>
                    {new Date((subscriptionData as any)?.subscriptionEndsAt).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              )}

              <Button
                variant="outline"
                onClick={() => billingPortalMutation.mutate()}
                disabled={billingPortalMutation.isPending}
                className="w-full"
              >
                {billingPortalMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Opening...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Manage Subscription
                  </>
                )}
              </Button>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground mb-4">No active subscription</p>
              <Button
                onClick={() => navigate("/pricing#pricing")}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                View Plans
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <PWAInstallCard />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Two-Factor Authentication (MFA)
          </CardTitle>
          <CardDescription>
            Add an extra layer of security to your account using an authenticator app like Google Authenticator or Authy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium">Status:</span>
              {mfaEnabled ? (
                <Badge variant="default" className="bg-green-600">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  Enabled
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <ShieldOff className="w-3 h-3 mr-1" />
                  Disabled
                </Badge>
              )}
            </div>
          </div>

          {!showMfaSetup && !mfaEnabled && (
            <Button onClick={handleSetupMfa} data-testid="button-setup-mfa">
              <QrCode className="w-4 h-4 mr-2" />
              Set Up MFA
            </Button>
          )}

          {showMfaSetup && !mfaEnabled && mfaSetup && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="text-center">
                <p className="font-medium mb-2">Scan this QR code with your authenticator app:</p>
                <img 
                  src={(mfaSetup as any).qrCode} 
                  alt="MFA QR Code" 
                  className="mx-auto border rounded-lg bg-white p-2"
                  data-testid="img-mfa-qrcode"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Or enter this secret manually: <code className="bg-muted px-1 rounded">{(mfaSetup as any).secret}</code>
                </p>
              </div>

              <Form {...mfaForm}>
                <form onSubmit={mfaForm.handleSubmit((data) => enableMfaMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={mfaForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Enter the 6-digit code from your app to verify:</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="000000" 
                            maxLength={6}
                            className="text-center text-lg tracking-widest"
                            data-testid="input-mfa-setup-code"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-2">
                    <Button 
                      type="submit" 
                      disabled={enableMfaMutation.isPending}
                      data-testid="button-enable-mfa"
                    >
                      {enableMfaMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        "Enable MFA"
                      )}
                    </Button>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      onClick={() => setShowMfaSetup(false)}
                      data-testid="button-cancel-mfa-setup"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          )}

          {mfaEnabled && (
            <Form {...mfaForm}>
              <form onSubmit={mfaForm.handleSubmit((data) => disableMfaMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={mfaForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Enter your MFA code to disable:</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="000000" 
                          maxLength={6}
                          className="text-center text-lg tracking-widest max-w-48"
                          data-testid="input-mfa-disable-code"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button 
                  type="submit" 
                  variant="destructive"
                  disabled={disableMfaMutation.isPending}
                  data-testid="button-disable-mfa"
                >
                  {disableMfaMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Disabling...
                    </>
                  ) : (
                    <>
                      <ShieldOff className="w-4 h-4 mr-2" />
                      Disable MFA
                    </>
                  )}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      <HouseholdSettings />

      <ReferralProgram />

      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Account Data
          </CardTitle>
          <CardDescription>
            Manage your account data and deletion options
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-destructive">Delete Account</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Delete your account and all associated data. This action is permanent and cannot be undone.
                </p>
                <div className="flex items-start gap-2 mt-3 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    You must cancel your subscription or trial before you can delete your account.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  className="mt-4"
                  onClick={() => setShowDeleteConfirm(true)}
                  data-testid="button-delete-account"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete My Account
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogOut className="w-5 h-5" />
            Session
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button 
            variant="outline" 
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-logout"
          >
            {logoutMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Logging out...
              </>
            ) : (
              <>
                <LogOut className="w-4 h-4 mr-2" />
                Log Out
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Delete Account Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Account Permanently?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This action will permanently delete your account and all associated data, including:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>All bank account connections and transaction history</li>
                <li>Bills, expenses, and income records</li>
                <li>Budgets, savings goals, and financial reports</li>
                <li>Categories and reconciliation rules</li>
                <li>All personal and profile information</li>
              </ul>
              <p className="font-medium text-destructive">
                This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteAccountMutation.mutate()}
              disabled={deleteAccountMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteAccountMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Yes, Delete My Account
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
