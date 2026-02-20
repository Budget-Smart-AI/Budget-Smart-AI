import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Users, Shield, ShieldCheck, Check, X, Clock, CreditCard, AlertTriangle, Pause } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface User {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  isAdmin: boolean;
  isApproved: boolean;
  mfaEnabled: boolean;
  createdAt: string | null;
  subscriptionPlanId: string | null;
  subscriptionStatus: string | null;
}

interface Plan {
  id: string;
  name: string;
  price: string;
  billingPeriod: string;
  isActive: string;
}

const createUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  isAdmin: z.boolean().default(false),
  isApproved: z.boolean().default(true),
});

const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;

const updateUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional().or(z.literal("")),
  isAdmin: z.boolean().optional(),
  isApproved: z.boolean().optional(),
  subscriptionPlanId: z.string().optional().nullable(),
  subscriptionStatus: z.string().optional().nullable(),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;
type UpdateUserFormValues = z.infer<typeof updateUserSchema>;

function UserForm({
  user,
  plans,
  onClose,
}: {
  user?: User;
  plans?: Plan[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!user;

  const form = useForm<CreateUserFormValues | UpdateUserFormValues>({
    resolver: zodResolver(isEditing ? updateUserSchema : createUserSchema),
    defaultValues: isEditing
      ? { username: user.username, password: "", isAdmin: user.isAdmin, isApproved: user.isApproved, subscriptionPlanId: user.subscriptionPlanId, subscriptionStatus: user.subscriptionStatus }
      : { username: "", password: "", isAdmin: false, isApproved: true },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateUserFormValues) => {
      const response = await apiRequest("POST", "/api/admin/users", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User created successfully" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create user", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateUserFormValues) => {
      const payload: Record<string, unknown> = {};
      if (data.username && data.username !== user?.username) payload.username = data.username;
      if (data.password && data.password.length > 0) payload.password = data.password;
      if (data.isAdmin !== undefined) payload.isAdmin = data.isAdmin;
      if (data.isApproved !== undefined) payload.isApproved = data.isApproved;
      // Include subscriptionPlanId - can be null to remove plan
      if (data.subscriptionPlanId !== undefined) {
        payload.subscriptionPlanId = data.subscriptionPlanId === "none" ? null : data.subscriptionPlanId;
      }
      // Include subscriptionStatus - can be null to remove status
      if (data.subscriptionStatus !== undefined) {
        payload.subscriptionStatus = data.subscriptionStatus === "none" ? null : data.subscriptionStatus;
      }

      const response = await apiRequest("PATCH", `/api/admin/users/${user!.id}`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated successfully" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update user", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: CreateUserFormValues | UpdateUserFormValues) => {
    if (isEditing) {
      updateMutation.mutate(data as UpdateUserFormValues);
    } else {
      createMutation.mutate(data as CreateUserFormValues);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="Enter username" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{isEditing ? "New Password (leave blank to keep current)" : "Password"}</FormLabel>
              <FormControl>
                <Input type="password" placeholder={isEditing ? "Enter new password" : "Enter password"} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isApproved"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Approved</FormLabel>
                <FormDescription>
                  User can only log in once their account is approved.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isAdmin"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Administrator</FormLabel>
                <FormDescription>
                  Admins can manage all users and have full access to the system.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {isEditing && plans && plans.length > 0 && (
          <>
            <FormField
              control={form.control}
              name="subscriptionPlanId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subscription Plan</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || "none"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a plan" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No Plan</SelectItem>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name} - ${plan.price}/{plan.billingPeriod}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Manually assign a subscription plan to this user.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="subscriptionStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subscription Status</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || "none"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No Status</SelectItem>
                      {SUBSCRIPTION_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Manually set the subscription status for this user.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {isEditing ? "Update User" : "Create User"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function AdminUsers() {
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | undefined>();
  const [deletingUser, setDeletingUser] = useState<User | undefined>();

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ["/api/admin/landing/pricing"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User deleted successfully" });
      setDeletingUser(undefined);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete user", description: error.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${id}`, { isApproved: true });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User approved", description: "The user can now log in to the system." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to approve user", description: error.message, variant: "destructive" });
    },
  });

  const handleApprove = (user: User) => {
    approveMutation.mutate(user.id);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingUser(undefined);
  };

  return (
    <div className="space-y-4 sm:space-y-6 px-1 sm:px-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            User Management
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage system users and permissions</p>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingUser(undefined)} size="sm" className="text-xs sm:text-sm w-fit">
              <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingUser ? "Edit User" : "Create New User"}</DialogTitle>
            </DialogHeader>
            <UserForm user={editingUser} plans={plans} onClose={handleCloseForm} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-xl">All Users</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 sm:h-12 w-full" />
              <Skeleton className="h-10 sm:h-12 w-full" />
              <Skeleton className="h-10 sm:h-12 w-full" />
            </div>
          ) : !users || users.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-muted-foreground">
              <Users className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-50" />
              <p className="text-sm sm:text-base">No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sm:text-sm">Username</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden md:table-cell">Name</TableHead>
                    <TableHead className="text-xs sm:text-sm">Status</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Role</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden md:table-cell">Plan</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden lg:table-cell">MFA</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden lg:table-cell">Created</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell className="font-medium text-xs sm:text-sm p-2 sm:p-4">{user.username}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs sm:text-sm p-2 sm:p-4">
                        {user.firstName || user.lastName
                          ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
                          : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="p-2 sm:p-4">
                        {user.isApproved ? (
                          <Badge variant="default" className="bg-green-600 text-[10px] sm:text-xs">
                            <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                            <span className="hidden sm:inline">Approved</span>
                            <span className="sm:hidden">OK</span>
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500 text-amber-500 text-[10px] sm:text-xs">
                            <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                            <span className="hidden sm:inline">Pending</span>
                            <span className="sm:hidden">Wait</span>
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell p-2 sm:p-4">
                        {user.isAdmin ? (
                          <Badge variant="default" className="bg-emerald-600 text-[10px] sm:text-xs">
                            <ShieldCheck className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] sm:text-xs">
                            <Shield className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                            User
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell p-2 sm:p-4">
                        {user.subscriptionPlanId ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant="default" className="bg-blue-600 text-[10px] sm:text-xs w-fit">
                              <CreditCard className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                              {plans?.find(p => p.id === user.subscriptionPlanId)?.name || "Unknown"}
                            </Badge>
                            {user.subscriptionStatus && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] sm:text-xs w-fit ${
                                  user.subscriptionStatus === "active"
                                    ? "border-green-500 text-green-600"
                                    : user.subscriptionStatus === "trialing"
                                    ? "border-blue-500 text-blue-600"
                                    : user.subscriptionStatus === "past_due" || user.subscriptionStatus === "unpaid"
                                    ? "border-red-500 text-red-600"
                                    : user.subscriptionStatus === "canceled"
                                    ? "border-gray-500 text-gray-600"
                                    : user.subscriptionStatus === "paused"
                                    ? "border-yellow-500 text-yellow-600"
                                    : "border-gray-400 text-gray-500"
                                }`}
                              >
                                {user.subscriptionStatus === "active" && <Check className="w-2.5 h-2.5 mr-0.5" />}
                                {user.subscriptionStatus === "trialing" && <Clock className="w-2.5 h-2.5 mr-0.5" />}
                                {(user.subscriptionStatus === "past_due" || user.subscriptionStatus === "unpaid") && <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />}
                                {user.subscriptionStatus === "canceled" && <X className="w-2.5 h-2.5 mr-0.5" />}
                                {user.subscriptionStatus === "paused" && <Pause className="w-2.5 h-2.5 mr-0.5" />}
                                {user.subscriptionStatus}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px] sm:text-xs text-muted-foreground">
                            No Plan
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell p-2 sm:p-4">
                        {user.mfaEnabled ? (
                          <Badge variant="default" className="bg-green-600 text-[10px] sm:text-xs">Enabled</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] sm:text-xs">Disabled</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs sm:text-sm p-2 sm:p-4">
                        {user.createdAt
                          ? new Date(user.createdAt).toLocaleDateString()
                          : "N/A"}
                      </TableCell>
                      <TableCell className="text-right p-2 sm:p-4">
                        <div className="flex justify-end gap-1 sm:gap-2">
                          {!user.isApproved && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 sm:h-9 sm:w-9 p-0"
                              onClick={() => handleApprove(user)}
                              data-testid={`button-approve-${user.id}`}
                            >
                              <Check className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 sm:h-9 sm:w-9 p-0"
                            onClick={() => handleEdit(user)}
                            data-testid={`button-edit-${user.id}`}
                          >
                            <Pencil className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 sm:h-9 sm:w-9 p-0"
                            onClick={() => setDeletingUser(user)}
                            data-testid={`button-delete-${user.id}`}
                          >
                            <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingUser} onOpenChange={() => setDeletingUser(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the user "{deletingUser?.username}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingUser && deleteMutation.mutate(deletingUser.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
