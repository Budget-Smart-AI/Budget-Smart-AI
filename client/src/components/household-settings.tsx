import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Users, UserPlus, Crown, Eye, LogOut, Trash2, Mail } from "lucide-react";

const createHouseholdSchema = z.object({
  name: z.string().min(1, "Household name is required").max(100, "Name too long"),
});

const inviteSchema = z.object({
  email: z.string().email("Valid email required"),
  role: z.enum(["member", "advisor"]),
});

type CreateHouseholdForm = z.infer<typeof createHouseholdSchema>;
type InviteForm = z.infer<typeof inviteSchema>;

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

export function HouseholdSettings() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<HouseholdMember | null>(null);

  const createForm = useForm<CreateHouseholdForm>({
    resolver: zodResolver(createHouseholdSchema),
    defaultValues: { name: "" },
  });

  const inviteForm = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "member" },
  });

  const { data: householdData, isLoading } = useQuery<HouseholdData>({
    queryKey: ["/api/households/current"],
  });

  const createHouseholdMutation = useMutation({
    mutationFn: async (data: CreateHouseholdForm) => {
      const response = await apiRequest("POST", "/api/households", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Household Created", description: "Your household has been created successfully" });
      setShowCreateDialog(false);
      createForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/households/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Create Household", description: error.message, variant: "destructive" });
    },
  });

  const inviteMemberMutation = useMutation({
    mutationFn: async (data: InviteForm) => {
      const response = await apiRequest("POST", "/api/households/invite", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Invitation Sent", description: "An invitation email has been sent" });
      setShowInviteDialog(false);
      inviteForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/households/current"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Send Invitation", description: error.message, variant: "destructive" });
    },
  });

  const leaveHouseholdMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/households/leave");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Left Household", description: "You have left the household" });
      queryClient.invalidateQueries({ queryKey: ["/api/households/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Leave", description: error.message, variant: "destructive" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/households/members/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Member Removed", description: "The member has been removed from the household" });
      setMemberToRemove(null);
      queryClient.invalidateQueries({ queryKey: ["/api/households/current"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Remove Member", description: error.message, variant: "destructive" });
    },
  });

  const deleteHouseholdMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/households/${householdData?.household?.id}`);
      return response;
    },
    onSuccess: () => {
      toast({ title: "Household Deleted", description: "The household has been deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/households/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Delete", description: error.message, variant: "destructive" });
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await apiRequest("DELETE", `/api/households/invitations/${invitationId}`);
      return response;
    },
    onSuccess: () => {
      toast({ title: "Invitation Cancelled", description: "The invitation has been cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/households/current"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Cancel", description: error.message, variant: "destructive" });
    },
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "owner":
        return <Badge className="bg-amber-500"><Crown className="w-3 h-3 mr-1" />Owner</Badge>;
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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
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

  // No household - show create option
  if (!householdData?.household) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Household
          </CardTitle>
          <CardDescription>
            Create a household to share your finances with a partner or invite a financial advisor
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Users className="w-4 h-4 mr-2" />
                Create Household
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a Household</DialogTitle>
                <DialogDescription>
                  Create a household to share finances with your partner or family. You'll be the owner and can invite others.
                </DialogDescription>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit((data) => createHouseholdMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={createForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Household Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="The Smith Family" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setShowCreateDialog(false)}>
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
        </CardContent>
      </Card>
    );
  }

  // Has household - show members and invite option
  const isOwner = householdData.currentUserRole === "owner";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {householdData.household.name}
            </CardTitle>
            <CardDescription>
              You are a {householdData.currentUserRole} of this household
            </CardDescription>
          </div>
          {getRoleBadge(householdData.currentUserRole)}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Members List */}
        <div>
          <h4 className="font-medium mb-3">Members ({householdData.members.length})</h4>
          <div className="space-y-2">
            {householdData.members.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium">{getMemberName(member)}</p>
                    <p className="text-sm text-muted-foreground">{member.user.email || member.user.username}</p>
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

        {/* Pending Invitations (owner only) */}
        {isOwner && householdData.invitations.length > 0 && (
          <div>
            <h4 className="font-medium mb-3">Pending Invitations</h4>
            <div className="space-y-2">
              {householdData.invitations.map((invitation) => (
                <div key={invitation.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-dashed">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{invitation.email}</p>
                      <p className="text-sm text-muted-foreground">
                        Invited as {invitation.role} • Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cancelInvitationMutation.mutate(invitation.id)}
                    disabled={cancelInvitationMutation.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-4 border-t">
          {isOwner && (
            <>
              <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invite Member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite to Household</DialogTitle>
                    <DialogDescription>
                      Send an invitation to join your household. Members can view and edit finances. Advisors have read-only access.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...inviteForm}>
                    <form onSubmit={inviteForm.handleSubmit((data) => inviteMemberMutation.mutate(data))} className="space-y-4">
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
                                    <span className="text-muted-foreground">- Full access</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="advisor">
                                  <div className="flex items-center gap-2">
                                    <Eye className="w-4 h-4" />
                                    <span>Advisor</span>
                                    <span className="text-muted-foreground">- View only</span>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setShowInviteDialog(false)}>
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
                  <Button variant="destructive">
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
      </CardContent>
    </Card>
  );
}
