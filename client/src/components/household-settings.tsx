import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Loader2, Users, UserPlus, Crown, Eye, LogOut, Trash2, Mail,
  Home, Shield, ShieldCheck, ShieldOff, RefreshCw,
} from "lucide-react";

const CANADIAN_PROVINCES = [
  "Alberta", "British Columbia", "Manitoba", "New Brunswick",
  "Newfoundland and Labrador", "Northwest Territories", "Nova Scotia",
  "Nunavut", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon",
];

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
  "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
  "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming",
];

const householdGeneralSchema = z.object({
  householdName: z.string().max(200).optional(),
  country: z.string().optional(),
  addressLine1: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  provinceState: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
});

const createHouseholdSchema = z.object({
  name: z.string().min(1, "Household name is required").max(100, "Name too long"),
});

const inviteSchema = z.object({
  email: z.string().email("Valid email required"),
  role: z.enum(["member", "advisor"]),
});

const grantAccessSchema = z.object({
  professionalEmail: z.string().email("Valid email required"),
  professionalName: z.string().max(255).optional(),
});

type HouseholdGeneralForm = z.infer<typeof householdGeneralSchema>;
type CreateHouseholdForm = z.infer<typeof createHouseholdSchema>;
type InviteForm = z.infer<typeof inviteSchema>;
type GrantAccessForm = z.infer<typeof grantAccessSchema>;

interface HouseholdMember {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  user: {
    id: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
}

interface HouseholdInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
}

interface HouseholdData {
  household: { id: string; name: string; createdAt: string } | null;
  members: HouseholdMember[];
  invitations: HouseholdInvitation[];
  currentUserRole: string;
}

interface HouseholdAddressData {
  householdName: string | null;
  country: string | null;
  addressLine1: string | null;
  city: string | null;
  provinceState: string | null;
  postalCode: string | null;
}

interface FinancialProfessional {
  id: string;
  professionalEmail: string;
  professionalName: string | null;
  accessToken: string;
  grantedAt: string | null;
  expiresAt: string;
  isActive: string;
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function HouseholdSettings() {
  const { toast } = useToast();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showGrantDialog, setShowGrantDialog] = useState(false);

  const generalForm = useForm<HouseholdGeneralForm>({
    resolver: zodResolver(householdGeneralSchema),
    defaultValues: {
      householdName: "", country: "Canada", addressLine1: "",
      city: "", provinceState: "", postalCode: "",
    },
  });

  const createHouseholdForm = useForm<CreateHouseholdForm>({
    resolver: zodResolver(createHouseholdSchema),
    defaultValues: { name: "" },
  });

  const inviteForm = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "member" },
  });

  const grantForm = useForm<GrantAccessForm>({
    resolver: zodResolver(grantAccessSchema),
    defaultValues: { professionalEmail: "", professionalName: "" },
  });

  const selectedCountry = generalForm.watch("country");

  const { data: householdData, isLoading: householdLoading } = useQuery<HouseholdData>({
    queryKey: ["/api/households/current"],
  });

  const { data: addressData, isLoading: addressLoading } = useQuery<HouseholdAddressData>({
    queryKey: ["/api/user/household"],
  });

  useEffect(() => {
    if (addressData) {
      generalForm.reset({
        householdName: addressData.householdName || "",
        country: addressData.country || "Canada",
        addressLine1: addressData.addressLine1 || "",
        city: addressData.city || "",
        provinceState: addressData.provinceState || "",
        postalCode: addressData.postalCode || "",
      });
    }
  }, [addressData, generalForm]);

  const { data: professionalData, isLoading: professionalLoading } = useQuery<{ professional: FinancialProfessional | null }>({
    queryKey: ["/api/financial-professional"],
  });

  const updateHouseholdMutation = useMutation({
    mutationFn: (data: HouseholdGeneralForm) => apiRequest("PATCH", "/api/user/household", data),
    onSuccess: () => {
      toast({ title: "Household Updated", description: "Your household information has been saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/user/household"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to update household info";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const createHouseholdMutation = useMutation({
    mutationFn: (data: CreateHouseholdForm) => apiRequest("POST", "/api/households", data),
    onSuccess: () => {
      toast({ title: "Household Created", description: "Your household has been created." });
      setShowCreateDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/households/current"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to create household";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const inviteMemberMutation = useMutation({
    mutationFn: (data: InviteForm) => apiRequest("POST", "/api/households/invite", data),
    onSuccess: () => {
      toast({ title: "Invitation Sent", description: "An invitation email has been sent." });
      setShowInviteDialog(false);
      inviteForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/households/current"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to send invitation";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: (invitationId: string) => apiRequest("POST", `/api/households/invitations/${invitationId}/resend`),
    onSuccess: () => {
      toast({ title: "Invitation Resent", description: "The invitation email has been resent." });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to resend invitation";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const cancelInviteMutation = useMutation({
    mutationFn: (invitationId: string) => apiRequest("DELETE", `/api/households/invitations/${invitationId}`),
    onSuccess: () => {
      toast({ title: "Invitation Cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/households/current"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to cancel invitation";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => apiRequest("DELETE", `/api/households/members/${userId}`),
    onSuccess: () => {
      toast({ title: "Member Removed", description: "The member has been removed from the household." });
      queryClient.invalidateQueries({ queryKey: ["/api/households/current"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to remove member";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const leaveHouseholdMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/households/leave"),
    onSuccess: () => {
      toast({ title: "Left Household", description: "You have left the household." });
      queryClient.invalidateQueries({ queryKey: ["/api/households/current"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to leave household";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const deleteHouseholdMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/households/${householdData?.household?.id}`),
    onSuccess: () => {
      toast({ title: "Household Deleted", description: "The household has been deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/households/current"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to delete household";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const grantAccessMutation = useMutation({
    mutationFn: (data: GrantAccessForm) => apiRequest("POST", "/api/financial-professional/grant", data),
    onSuccess: () => {
      toast({ title: "Access Granted", description: "The financial professional has been invited via email." });
      setShowGrantDialog(false);
      grantForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/financial-professional"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to grant access";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const revokeAccessMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/financial-professional/revoke"),
    onSuccess: () => {
      toast({ title: "Access Revoked", description: "Financial professional access has been revoked." });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-professional"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to revoke access";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "owner":
        return <Badge className="bg-amber-500"><Crown className="w-3 h-3 mr-1" />Admin</Badge>;
      case "member":
        return <Badge className="bg-blue-500"><Users className="w-3 h-3 mr-1" />Member</Badge>;
      case "advisor":
        return <Badge variant="outline"><Eye className="w-3 h-3 mr-1" />Advisor</Badge>;
      default:
        return <Badge variant="secondary">{role}</Badge>;
    }
  };

  const getMemberName = (member: HouseholdMember) => {
    if (member.user.firstName && member.user.lastName) {
      return `${member.user.firstName} ${member.user.lastName}`;
    }
    return member.user.username;
  };

  const getMemberInitials = (member: HouseholdMember) => {
    if (member.user.firstName && member.user.lastName) {
      return `${member.user.firstName[0]}${member.user.lastName[0]}`.toUpperCase();
    }
    return member.user.username.slice(0, 2).toUpperCase();
  };

  const getProvinceStateList = (country: string) => {
    if (country === "Canada") return CANADIAN_PROVINCES;
    if (country === "United States") return US_STATES;
    return [];
  };

  const postalCodeLabel = selectedCountry === "United States" ? "Zip Code" : "Postal Code";
  const provinceStateLabel =
    selectedCountry === "United States"
      ? "State"
      : selectedCountry === "Canada"
      ? "Province / Territory"
      : "Province / State";

  const isLoading = householdLoading || addressLoading || professionalLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="w-5 h-5" />
            Household
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const professional = professionalData?.professional;
  const isOwner = householdData?.currentUserRole === "owner";

  return (
    <div className="space-y-6">
      {/* Section 1: Household General */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="w-5 h-5" />
            Household
          </CardTitle>
          <CardDescription>Your household name, country, and mailing address</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...generalForm}>
            <form
              onSubmit={generalForm.handleSubmit((data) => updateHouseholdMutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={generalForm.control}
                name="householdName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Household Name</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} placeholder="e.g. The Smith Family" />
                    </FormControl>
                    <FormDescription>Used to identify your household in shared views</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={generalForm.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? "Canada"}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Canada">Canada</SelectItem>
                        <SelectItem value="United States">United States</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={generalForm.control}
                name="addressLine1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 1</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} placeholder="123 Main Street" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={generalForm.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} placeholder="Toronto" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={generalForm.control}
                  name="provinceState"
                  render={({ field }) => {
                    const provinces = getProvinceStateList(selectedCountry ?? "Canada");
                    return (
                      <FormItem>
                        <FormLabel>{provinceStateLabel}</FormLabel>
                        {provinces.length > 0 ? (
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={`Select ${provinceStateLabel}`} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {provinces.map((p) => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <FormControl>
                            <Input {...field} value={field.value ?? ""} placeholder={provinceStateLabel} />
                          </FormControl>
                        )}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>

              <FormField
                control={generalForm.control}
                name="postalCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{postalCodeLabel}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder={selectedCountry === "United States" ? "12345" : "A1A 1A1"}
                        className="max-w-[200px]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={updateHouseholdMutation.isPending}>
                {updateHouseholdMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Update Household
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Section 2: Household Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Household Members
          </CardTitle>
          <CardDescription>Manage who has access to your shared household finances</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!householdData?.household ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Create a household to share your finances with a partner or family member.
              </p>
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Users className="w-4 h-4 mr-2" />
                    Create Household
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Household</DialogTitle>
                    <DialogDescription>
                      Create a household to share finances with your partner or family. You will be the owner and can invite others.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...createHouseholdForm}>
                    <form
                      onSubmit={createHouseholdForm.handleSubmit((data) => createHouseholdMutation.mutate(data))}
                      className="space-y-4"
                    >
                      <FormField
                        control={createHouseholdForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Household Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g. The Smith Family" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createHouseholdMutation.isPending}>
                          {createHouseholdMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Create
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{householdData.household.name}</p>
                  <p className="text-sm text-muted-foreground">
                    You are a <span className="capitalize">{householdData.currentUserRole}</span> of this household
                  </p>
                </div>
                {getRoleBadge(householdData.currentUserRole)}
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-3">Members ({householdData.members.length})</h4>
                <div className="space-y-2">
                  {householdData.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold">
                          {getMemberInitials(member)}
                        </div>
                        <div>
                          <p className="font-medium flex items-center gap-2">
                            {getMemberName(member)}
                            {member.role === "owner" && (
                              <Badge className="bg-amber-500 text-xs">Admin</Badge>
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {member.user.email || member.user.username}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getRoleBadge(member.role)}
                        {isOwner && member.role !== "owner" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Member</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove {getMemberName(member)} from the household? They will lose access to shared finances.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => removeMemberMutation.mutate(member.userId)}
                                  className="bg-destructive text-destructive-foreground"
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {isOwner && householdData.invitations.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Pending Invitations</h4>
                  <div className="space-y-2">
                    {householdData.invitations.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between p-3 bg-muted/30 border border-dashed rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Mail className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">{inv.email}</p>
                            <p className="text-xs text-muted-foreground capitalize">{inv.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => resendInviteMutation.mutate(inv.id)}
                            disabled={resendInviteMutation.isPending}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Resend
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => cancelInviteMutation.mutate(inv.id)}
                            disabled={cancelInviteMutation.isPending}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              <div className="flex flex-wrap gap-2">
                {isOwner && (
                  <>
                    <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
                      <DialogTrigger asChild>
                        <Button>
                          <UserPlus className="w-4 h-4 mr-2" />
                          Invite Another Member
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Invite to Household</DialogTitle>
                          <DialogDescription>
                            Send an invitation to join your household. Members can log in with their own credentials at no extra cost.
                          </DialogDescription>
                        </DialogHeader>
                        <Form {...inviteForm}>
                          <form
                            onSubmit={inviteForm.handleSubmit((data) => inviteMemberMutation.mutate(data))}
                            className="space-y-4"
                          >
                            <FormField
                              control={inviteForm.control}
                              name="email"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Email Address</FormLabel>
                                  <FormControl>
                                    <Input {...field} type="email" placeholder="partner@example.com" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={inviteForm.control}
                              name="role"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Role</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select a role" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="member">
                                        <div className="flex items-center gap-2">
                                          <Users className="w-4 h-4" />
                                          <span>Member</span>
                                          <span className="text-muted-foreground text-xs">{"— Full access"}</span>
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="advisor">
                                        <div className="flex items-center gap-2">
                                          <Eye className="w-4 h-4" />
                                          <span>Advisor</span>
                                          <span className="text-muted-foreground text-xs">{"— Read-only"}</span>
                                        </div>
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <p className="text-xs text-muted-foreground">
                              Members can log in with their own credentials at no extra cost.
                            </p>
                            <div className="flex gap-2 justify-end">
                              <Button type="button" variant="outline" onClick={() => setShowInviteDialog(false)}>
                                Cancel
                              </Button>
                              <Button type="submit" disabled={inviteMemberMutation.isPending}>
                                {inviteMemberMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Send Invitation
                              </Button>
                            </div>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Household
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Household</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this household? All members will lose access to shared finances. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteHouseholdMutation.mutate()}
                            className="bg-destructive text-destructive-foreground"
                          >
                            Delete Household
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}

                {!isOwner && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline">
                        <LogOut className="w-4 h-4 mr-2" />
                        Leave Household
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Leave Household</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to leave this household? You will lose access to shared finances.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => leaveHouseholdMutation.mutate()}>
                          Leave
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Financial Professional Access */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Financial Professional Access
          </CardTitle>
          <CardDescription>
            Grant a financial advisor read-only access to your account.
            Access automatically expires after 60 days.
            You can revoke access at any time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!professional ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <ShieldOff className="w-8 h-8 text-muted-foreground" />
                <div>
                  <p className="font-medium">No professional access granted</p>
                  <p className="text-sm text-muted-foreground">
                    No financial advisor currently has access to your account.
                  </p>
                </div>
              </div>

              <Dialog open={showGrantDialog} onOpenChange={setShowGrantDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <ShieldCheck className="w-4 h-4 mr-2" />
                    Grant Access
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Grant Financial Advisor Access</DialogTitle>
                    <DialogDescription>
                      Enter your financial advisor details. They will receive an email with a secure read-only access link. Access expires automatically after 60 days.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...grantForm}>
                    <form
                      onSubmit={grantForm.handleSubmit((data) => grantAccessMutation.mutate(data))}
                      className="space-y-4"
                    >
                      <FormField
                        control={grantForm.control}
                        name="professionalEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Advisor Email Address</FormLabel>
                            <FormControl>
                              <Input {...field} type="email" placeholder="advisor@firm.com" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={grantForm.control}
                        name="professionalName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Advisor Name (optional)</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Jane Doe" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" onClick={() => setShowGrantDialog(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={grantAccessMutation.isPending}>
                          {grantAccessMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Grant Access
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                <ShieldCheck className="w-8 h-8 text-green-600" />
                <div className="flex-1">
                  <p className="font-medium">
                    {professional.professionalName || professional.professionalEmail}
                  </p>
                  <p className="text-sm text-muted-foreground">{professional.professionalEmail}</p>
                  <p className="text-sm text-muted-foreground">
                    {"Access expires in "}
                    <span className="font-medium text-foreground">
                      {daysUntil(professional.expiresAt)} days
                    </span>
                    {" (" + new Date(professional.expiresAt).toLocaleDateString() + ")"}
                  </p>
                </div>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <ShieldOff className="w-4 h-4 mr-2" />
                    Revoke Access
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke Financial Professional Access</AlertDialogTitle>
                    <AlertDialogDescription>
                      {"Are you sure you want to revoke access for "}
                      {professional.professionalName || professional.professionalEmail}
                      {"? They will immediately lose access to your account."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => revokeAccessMutation.mutate()}
                      className="bg-destructive text-destructive-foreground"
                    >
                      Revoke Access
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
