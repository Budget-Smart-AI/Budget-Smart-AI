import { useState, useEffect, useRef } from "react";
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
import {
  Loader2, Shield, ShieldCheck, ShieldOff, QrCode, LogOut, User, Save, Trash2,
  AlertTriangle, Database, CreditCard, Calendar, Sparkles, ExternalLink, Copy,
  Download, Check, Camera, Globe, Cake,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocation } from "wouter";
import { HouseholdSettings } from "@/components/household-settings";
import { PWAInstallCard } from "@/components/pwa-install-prompt";

// ─── IANA Timezone list (common subset) ───────────────────────────────────────
const TIMEZONES = [
  "America/Toronto", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Vancouver", "America/Edmonton", "America/Winnipeg",
  "America/Halifax", "America/St_Johns", "America/Phoenix", "America/Anchorage",
  "America/Honolulu", "America/Sao_Paulo", "America/Argentina/Buenos_Aires",
  "America/Bogota", "America/Lima", "America/Mexico_City", "America/Caracas",
  "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Rome",
  "Europe/Madrid", "Europe/Amsterdam", "Europe/Brussels", "Europe/Stockholm",
  "Europe/Oslo", "Europe/Copenhagen", "Europe/Zurich", "Europe/Warsaw",
  "Europe/Prague", "Europe/Budapest", "Europe/Vienna", "Europe/Athens",
  "Europe/Helsinki", "Europe/Bucharest", "Europe/Istanbul", "Europe/Moscow",
  "Africa/Johannesburg", "Africa/Lagos", "Africa/Cairo", "Africa/Nairobi",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Karachi", "Asia/Dhaka", "Asia/Bangkok",
  "Asia/Singapore", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Tokyo",
  "Asia/Seoul", "Asia/Jakarta", "Asia/Manila", "Asia/Taipei", "Asia/Kuala_Lumpur",
  "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth",
  "Australia/Adelaide", "Pacific/Auckland", "Pacific/Fiji",
  "UTC",
];

function getTimezoneLabel(tz: string): string {
  try {
    const offset = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value || "";
    return `${tz.replace(/_/g, " ")} (${offset})`;
  } catch {
    return tz.replace(/_/g, " ");
  }
}

// Returns a consistent color based on the first letter of a name
function getInitialColor(name: string): string {
  const colors = [
    "bg-emerald-500", "bg-teal-500", "bg-cyan-500", "bg-blue-500",
    "bg-indigo-500", "bg-violet-500", "bg-purple-500", "bg-pink-500",
    "bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-green-500",
  ];
  const idx = (name.charCodeAt(0) || 0) % colors.length;
  return colors[idx];
}

const mfaCodeSchema = z.object({
  code: z.string().length(6, "Code must be 6 digits"),
});

const profileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email("Valid email required").optional().or(z.literal("")),
  phone: z.string().optional(),
  country: z.string().optional(),
  displayName: z.string().max(100).optional(),
  birthday: z.string().optional(),
  timezone: z.string().optional(),
});

type MfaCodeFormData = z.infer<typeof mfaCodeSchema>;
type ProfileFormData = z.infer<typeof profileSchema>;

type MfaModalStep = "qr" | "verify" | "backup";

// Month names and days helpers
const MONTHS = [
  { value: "01", label: "January" }, { value: "02", label: "February" },
  { value: "03", label: "March" }, { value: "04", label: "April" },
  { value: "05", label: "May" }, { value: "06", label: "June" },
  { value: "07", label: "July" }, { value: "08", label: "August" },
  { value: "09", label: "September" }, { value: "10", label: "October" },
  { value: "11", label: "November" }, { value: "12", label: "December" },
];

function getDaysInMonth(month: string, year: string): number {
  if (!month || !year) return 31;
  return new Date(parseInt(year), parseInt(month), 0).getDate();
}

interface SettingsProps {
  onLogout: () => void;
}

export default function Settings({ onLogout }: SettingsProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 2FA modal state
  const [mfaModalOpen, setMfaModalOpen] = useState(false);
  const [mfaModalStep, setMfaModalStep] = useState<MfaModalStep>("qr");
  const [mfaSetupData, setMfaSetupData] = useState<{ qrCode: string; secret: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disableMfaModalOpen, setDisableMfaModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Avatar state
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  // Birthday separate state (month, day, year)
  const [bdMonth, setBdMonth] = useState("");
  const [bdDay, setBdDay] = useState("");
  const [bdYear, setBdYear] = useState("");

  // Timezone search
  const [tzSearch, setTzSearch] = useState("");

  const mfaForm = useForm<MfaCodeFormData>({
    resolver: zodResolver(mfaCodeSchema),
    defaultValues: { code: "" },
  });

  const disableMfaForm = useForm<MfaCodeFormData>({
    resolver: zodResolver(mfaCodeSchema),
    defaultValues: { code: "" },
  });

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: "", lastName: "", email: "", phone: "", country: "US",
      displayName: "", birthday: "", timezone: "America/Toronto",
    },
  });

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["/api/auth/session"],
  });

  const { data: mfaStatus, refetch: refetchMfaStatus } = useQuery({
    queryKey: ["/api/auth/2fa/status"],
  });

  const { data: subscriptionData, isLoading: subscriptionLoading } = useQuery({
    queryKey: ["/api/stripe/subscription"],
  });

  const billingPortalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/create-portal-session");
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.url) window.open(data.url, "_blank");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (session && (session as any).authenticated) {
      const s = session as any;
      // Parse birthday into parts
      if (s.birthday) {
        const parts = s.birthday.split("-");
        if (parts.length === 3) {
          setBdYear(parts[0]);
          setBdMonth(parts[1]);
          setBdDay(parts[2]);
        }
      }
      profileForm.reset({
        firstName: s.firstName || "",
        lastName: s.lastName || "",
        email: s.email || "",
        phone: s.phone || "",
        country: s.country || "US",
        displayName: s.displayName || "",
        birthday: s.birthday || "",
        timezone: s.timezone || "America/Toronto",
      });
      if (s.avatarUrl) setAvatarPreview(s.avatarUrl);
    }
  }, [session]);

  // Build birthday string whenever parts change
  useEffect(() => {
    if (bdYear && bdMonth && bdDay) {
      profileForm.setValue("birthday", `${bdYear}-${bdMonth}-${bdDay}`);
    } else {
      profileForm.setValue("birthday", "");
    }
  }, [bdYear, bdMonth, bdDay]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const response = await apiRequest("PATCH", "/api/auth/profile", {
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        email: data.email || null,
        phone: data.phone || null,
        country: data.country || null,
        displayName: data.displayName || null,
        birthday: data.birthday || null,
        timezone: data.timezone || null,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Profile Saved", description: "Your profile has been updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
    },
    onError: (error: Error) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("avatar", file);
      const response = await fetch("/api/user/avatar", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Upload failed");
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      setAvatarPreview(data.avatarUrl);
      setAvatarFile(null);
      toast({ title: "Photo Saved", description: "Your profile photo has been updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
    },
    onError: (error: Error) => {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    },
  });

  const removeAvatarMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/user/avatar");
      return response.json();
    },
    onSuccess: () => {
      setAvatarPreview(null);
      setAvatarFile(null);
      toast({ title: "Photo Removed", description: "Your profile photo has been removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
    },
    onError: (error: Error) => {
      toast({ title: "Remove Failed", description: error.message, variant: "destructive" });
    },
  });

  const setupMfaMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/auth/mfa/setup");
      return response.json();
    },
    onSuccess: (data: any) => {
      setMfaSetupData({ qrCode: data.qrCode, secret: data.manualEntryKey || data.secret });
      setMfaModalStep("qr");
      setMfaModalOpen(true);
    },
    onError: (error: Error) => {
      toast({ title: "Setup Failed", description: error.message, variant: "destructive" });
    },
  });

  const enableMfaMutation = useMutation({
    mutationFn: async (data: MfaCodeFormData) => {
      const response = await apiRequest("POST", "/api/auth/mfa/enable", { code: data.code });
      return response.json();
    },
    onSuccess: (data: any) => {
      setBackupCodes(data.backupCodes || []);
      setMfaModalStep("backup");
      mfaForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      refetchMfaStatus();
    },
    onError: (error: Error) => {
      toast({ title: "Invalid Code", description: error.message, variant: "destructive" });
    },
  });

  const disableMfaMutation = useMutation({
    mutationFn: async (data: MfaCodeFormData) => {
      const response = await apiRequest("POST", "/api/auth/mfa/disable", { code: data.code });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "2FA Disabled", description: "Two-factor authentication has been removed" });
      disableMfaForm.reset();
      setDisableMfaModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      refetchMfaStatus();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Disable 2FA", description: error.message, variant: "destructive" });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/logout");
      return response.json();
    },
    onSuccess: () => {
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

  const handleDownloadBackupCodes = () => {
    const content = [
      "BudgetSmart 2FA Backup Codes", "============================",
      "Keep these codes safe. Each code can only be used once.", "",
      ...backupCodes.map((c, i) => `${i + 1}. ${c}`), "",
      `Generated: ${new Date().toLocaleString()}`,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "budgetsmart-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setAvatarFile(file);
  };

  const mfaEnabled = (mfaStatus as any)?.enabled ?? (session as any)?.mfaEnabled ?? false;
  const sessionData = session as any;

  // Initials and color for avatar fallback
  const firstName = sessionData?.firstName || "";
  const lastName = sessionData?.lastName || "";
  const initials = firstName && lastName
    ? `${firstName[0]}${lastName[0]}`.toUpperCase()
    : (firstName || sessionData?.username || "?")[0]?.toUpperCase() || "?";
  const avatarColor = getInitialColor(firstName || sessionData?.username || "");

  // Current local time for timezone display
  const watchTz = profileForm.watch("timezone") || "America/Toronto";
  const [localTime, setLocalTime] = useState("");
  useEffect(() => {
    const tick = () => {
      try {
        setLocalTime(new Intl.DateTimeFormat("en-US", {
          timeZone: watchTz,
          hour: "numeric", minute: "2-digit", second: "2-digit",
          hour12: true, weekday: "short",
        }).format(new Date()));
      } catch { setLocalTime(""); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [watchTz]);

  // Current year for birthday year range
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 120 }, (_, i) => String(currentYear - i));
  const daysInMonth = getDaysInMonth(bdMonth, bdYear);
  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, "0"));

  const filteredTimezones = TIMEZONES.filter((tz) =>
    tz.toLowerCase().replace(/_/g, " ").includes(tzSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold" data-testid="text-settings-title">Settings</h1>
          <HelpTooltip
            title="About Settings"
            content="Manage your profile information, change your password, and configure multi-factor authentication (MFA) for enhanced security."
          />
        </div>
        <p className="text-muted-foreground">Manage your account and security settings</p>
      </div>

      {/* ── Profile Information Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile Information
          </CardTitle>
          <CardDescription>Update your personal information and how BudgetSmart addresses you</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {sessionLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <>
              {/* ── Avatar Section ── */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <div className={`w-24 h-24 rounded-full overflow-hidden flex items-center justify-center text-white text-2xl font-bold shadow-lg ${!avatarPreview ? avatarColor : ""}`}>
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>
                  <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                    <Camera className="w-5 h-5 text-white" />
                    <span className="text-white text-xs font-medium">Change photo</span>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="flex gap-2">
                  {avatarFile && (
                    <Button
                      size="sm"
                      onClick={() => uploadAvatarMutation.mutate(avatarFile)}
                      disabled={uploadAvatarMutation.isPending}
                      data-testid="button-save-photo"
                    >
                      {uploadAvatarMutation.isPending ? (
                        <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Saving...</>
                      ) : (
                        <><Camera className="w-3 h-3 mr-1" />Save Photo</>
                      )}
                    </Button>
                  )}
                  {(avatarPreview && !avatarFile) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => removeAvatarMutation.mutate()}
                      disabled={removeAvatarMutation.isPending}
                      data-testid="button-remove-photo"
                    >
                      {removeAvatarMutation.isPending ? (
                        <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Removing...</>
                      ) : (
                        "Remove Photo"
                      )}
                    </Button>
                  )}
                  {!avatarPreview && !avatarFile && (
                    <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Camera className="w-3 h-3 mr-1" />Upload Photo
                    </Button>
                  )}
                </div>
              </div>

              {/* ── Profile Form ── */}
              <Form {...profileForm}>
                <form onSubmit={profileForm.handleSubmit((data) => updateProfileMutation.mutate(data))} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                          Display Name
                        </FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Johnny" data-testid="input-display-name" />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">We'll address you by this name in the app and emails</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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

                  {/* Birthday */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Cake className="w-3.5 h-3.5 text-pink-500" />
                      Birthday
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <Select value={bdMonth} onValueChange={setBdMonth}>
                        <SelectTrigger data-testid="select-bd-month">
                          <SelectValue placeholder="Month" />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={bdDay} onValueChange={setBdDay}>
                        <SelectTrigger data-testid="select-bd-day">
                          <SelectValue placeholder="Day" />
                        </SelectTrigger>
                        <SelectContent>
                          {days.map((d) => (
                            <SelectItem key={d} value={d}>{parseInt(d)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={bdYear} onValueChange={setBdYear}>
                        <SelectTrigger data-testid="select-bd-year">
                          <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent>
                          {years.map((y) => (
                            <SelectItem key={y} value={y}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">Helps us personalize your experience</p>
                  </div>

                  {/* Timezone */}
                  <FormField
                    control={profileForm.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5 text-blue-500" />
                          Timezone
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "America/Toronto"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-timezone">
                              <SelectValue placeholder="Select timezone" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <div className="p-2">
                              <input
                                className="w-full px-2 py-1 text-sm border rounded mb-1 bg-background"
                                placeholder="Search timezones..."
                                value={tzSearch}
                                onChange={(e) => setTzSearch(e.target.value)}
                              />
                            </div>
                            {filteredTimezones.map((tz) => (
                              <SelectItem key={tz} value={tz}>
                                {getTimezoneLabel(tz)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {localTime && (
                          <p className="text-xs text-muted-foreground">
                            Current local time: <span className="font-medium text-foreground">{localTime}</span>
                          </p>
                        )}
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
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" />Save Changes</>
                    )}
                  </Button>
                </form>
              </Form>
            </>
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
                      month: "long", day: "numeric", year: "numeric",
                    })}
                  </span>
                </div>
              )}

              {(subscriptionData as any)?.subscriptionEndsAt && (subscriptionData as any)?.status !== "trialing" && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Next billing date</span>
                  <span>
                    {new Date((subscriptionData as any)?.subscriptionEndsAt).toLocaleDateString("en-US", {
                      month: "long", day: "numeric", year: "numeric",
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
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Opening...</>
                ) : (
                  <><ExternalLink className="w-4 h-4 mr-2" />Manage Subscription</>
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

      {/* ── Two-Factor Authentication Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Add an extra layer of security using an authenticator app like Google Authenticator or Authy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium">Status:</span>
              {mfaEnabled ? (
                <Badge variant="default" className="bg-green-600">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  Enabled ✓
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <ShieldOff className="w-3 h-3 mr-1" />
                  Disabled
                </Badge>
              )}
            </div>
          </div>

          {!mfaEnabled && (
            <Button
              onClick={() => setupMfaMutation.mutate()}
              disabled={setupMfaMutation.isPending}
              data-testid="button-setup-mfa"
            >
              {setupMfaMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...</>
              ) : (
                <><QrCode className="w-4 h-4 mr-2" />Enable 2FA</>
              )}
            </Button>
          )}

          {mfaEnabled && (
            <Button
              variant="destructive"
              onClick={() => setDisableMfaModalOpen(true)}
              data-testid="button-disable-mfa"
            >
              <ShieldOff className="w-4 h-4 mr-2" />
              Disable 2FA
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── 2FA Setup Modal ── */}
      <Dialog open={mfaModalOpen} onOpenChange={(open) => {
        if (!open) { setMfaModalOpen(false); setMfaSetupData(null); mfaForm.reset(); }
      }}>
        <DialogContent className="sm:max-w-md">
          {mfaModalStep === "qr" && mfaSetupData && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <QrCode className="w-5 h-5" />
                  Step 1: Scan QR Code
                </DialogTitle>
                <DialogDescription>
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex justify-center">
                  <img
                    src={mfaSetupData.qrCode}
                    alt="2FA QR Code"
                    className="border rounded-lg bg-white p-2 w-48 h-48"
                    data-testid="img-mfa-qrcode"
                  />
                </div>
                <div className="p-3 rounded-lg bg-muted text-sm">
                  <p className="text-muted-foreground mb-1">Or enter this key manually:</p>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs break-all flex-1">{mfaSetupData.secret}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(mfaSetupData.secret);
                        toast({ title: "Copied", description: "Secret key copied to clipboard" });
                      }}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <Button className="w-full" onClick={() => setMfaModalStep("verify")}>Continue</Button>
              </div>
            </>
          )}

          {mfaModalStep === "verify" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Step 2: Verify Code
                </DialogTitle>
                <DialogDescription>
                  Enter the 6-digit code from your authenticator app to confirm setup.
                </DialogDescription>
              </DialogHeader>
              <Form {...mfaForm}>
                <form onSubmit={mfaForm.handleSubmit((data) => enableMfaMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={mfaForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>6-digit code</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="000000"
                            maxLength={6}
                            inputMode="numeric"
                            autoFocus
                            className="text-center text-2xl tracking-[0.5em] font-mono"
                            data-testid="input-mfa-setup-code"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setMfaModalStep("qr")} className="flex-1">Back</Button>
                    <Button type="submit" disabled={enableMfaMutation.isPending} className="flex-1" data-testid="button-enable-mfa">
                      {enableMfaMutation.isPending ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</>
                      ) : "Verify"}
                    </Button>
                  </div>
                </form>
              </Form>
            </>
          )}

          {mfaModalStep === "backup" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  2FA is now enabled!
                </DialogTitle>
                <DialogDescription>
                  Save these backup codes in a safe place. You will not see them again.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Save these codes in a safe place — they can recover your account if you lose access to your authenticator app. Each code can only be used once.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code) => (
                    <code key={code} className="text-center font-mono text-sm bg-muted rounded px-2 py-1">{code}</code>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleDownloadBackupCodes} className="flex-1">
                    <Download className="w-4 h-4 mr-2" />Download
                  </Button>
                  <Button onClick={() => { setMfaModalOpen(false); setMfaSetupData(null); setBackupCodes([]); }} className="flex-1">
                    Done
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Disable 2FA Modal ── */}
      <Dialog open={disableMfaModalOpen} onOpenChange={(open) => {
        if (!open) { setDisableMfaModalOpen(false); disableMfaForm.reset(); }
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldOff className="w-5 h-5" />
              Disable Two-Factor Authentication
            </DialogTitle>
            <DialogDescription>
              Enter your current 6-digit authenticator code to disable 2FA.
            </DialogDescription>
          </DialogHeader>
          <Form {...disableMfaForm}>
            <form onSubmit={disableMfaForm.handleSubmit((data) => disableMfaMutation.mutate(data))} className="space-y-4">
              <FormField
                control={disableMfaForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Authenticator code</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="000000"
                        maxLength={6}
                        inputMode="numeric"
                        autoFocus
                        className="text-center text-2xl tracking-[0.5em] font-mono"
                        data-testid="input-mfa-disable-code"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setDisableMfaModalOpen(false)} className="flex-1">Cancel</Button>
                <Button type="submit" variant="destructive" disabled={disableMfaMutation.isPending} className="flex-1">
                  {disableMfaMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Disabling...</>
                  ) : "Disable 2FA"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <HouseholdSettings />

      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Account Data
          </CardTitle>
          <CardDescription>Manage your account data and deletion options</CardDescription>
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
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Logging out...</>
            ) : (
              <><LogOut className="w-4 h-4 mr-2" />Log Out</>
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
              <p className="font-medium text-destructive">This action cannot be undone.</p>
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
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" />Yes, Delete My Account</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
