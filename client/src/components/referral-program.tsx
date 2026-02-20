import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Gift,
  Copy,
  Send,
  Users,
  CheckCircle2,
  Clock,
  UserPlus,
  Share2,
  Loader2,
} from "lucide-react";

const inviteSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type InviteFormData = z.infer<typeof inviteSchema>;

interface ReferralStats {
  code: string | null;
  totalInvites: number;
  successfulReferrals: number;
  pendingReferrals: number;
  registeredReferrals: number;
  activeReferrals: number;
}

interface Referral {
  id: string;
  referredEmail: string;
  status: string;
  invitedAt: string;
  registeredAt: string | null;
}

export function ReferralProgram() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "" },
  });

  const { data: codeData, isLoading: codeLoading } = useQuery<{ code: string }>({
    queryKey: ["/api/referrals/code"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<ReferralStats>({
    queryKey: ["/api/referrals/stats"],
  });

  const { data: referrals, isLoading: referralsLoading } = useQuery<Referral[]>({
    queryKey: ["/api/referrals"],
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: InviteFormData) => {
      const response = await apiRequest("POST", "/api/referrals/invite", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invitation Sent!",
        description: "Your friend will receive an email invitation.",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/referrals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/stats"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send Invitation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const referralCode = codeData?.code || stats?.code;
  const referralLink = referralCode
    ? `${window.location.origin}/?ref=${referralCode}`
    : "";

  const handleCopyLink = async () => {
    if (referralLink) {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast({
        title: "Link Copied!",
        description: "Share this link with friends to invite them.",
      });
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleCopyCode = async () => {
    if (referralCode) {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      toast({
        title: "Code Copied!",
        description: "Share this code with friends.",
      });
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleShare = async () => {
    if (navigator.share && referralLink) {
      try {
        await navigator.share({
          title: "Join Budget Smart AI",
          text: "I've been using Budget Smart AI to manage my finances. Join me!",
          url: referralLink,
        });
      } catch (error) {
        // User cancelled or share not supported
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="text-xs">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case "registered":
        return (
          <Badge variant="default" className="bg-blue-600 text-xs">
            <UserPlus className="w-3 h-3 mr-1" />
            Signed Up
          </Badge>
        );
      case "active":
      case "rewarded":
        return (
          <Badge variant="default" className="bg-green-600 text-xs">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Active
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (codeLoading || statsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5" />
            Refer a Friend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="w-5 h-5" />
          Refer a Friend
        </CardTitle>
        <CardDescription>
          Invite friends to Budget Smart AI and help them manage their finances better
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Referral Code Section */}
        <div className="p-4 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Your referral code</p>
              <p className="text-2xl font-bold tracking-wider">{referralCode || "Loading..."}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyCode} disabled={!referralCode}>
                <Copy className="w-4 h-4 mr-1" />
                Copy Code
              </Button>
              <Button size="sm" onClick={handleShare} disabled={!referralCode}>
                <Share2 className="w-4 h-4 mr-1" />
                Share
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-lg bg-muted/50">
            <Users className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{stats?.totalInvites || 0}</p>
            <p className="text-xs text-muted-foreground">Invited</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <UserPlus className="w-5 h-5 mx-auto mb-1 text-blue-500" />
            <p className="text-2xl font-bold">{stats?.registeredReferrals || 0}</p>
            <p className="text-xs text-muted-foreground">Signed Up</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-green-500" />
            <p className="text-2xl font-bold">{stats?.activeReferrals || 0}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
        </div>

        {/* Invite by Email Form */}
        <div className="pt-4 border-t">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Send className="w-4 h-4" />
            Invite by Email
          </h4>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => inviteMutation.mutate(data))}
              className="flex gap-2"
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="friend@example.com"
                        disabled={inviteMutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-1" />
                    Invite
                  </>
                )}
              </Button>
            </form>
          </Form>
        </div>

        {/* Referrals List */}
        {referrals && referrals.length > 0 && (
          <div className="pt-4 border-t">
            <h4 className="font-medium mb-3">Your Referrals</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {referrals.map((referral) => (
                <div
                  key={referral.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                >
                  <div>
                    <p className="text-sm font-medium">{referral.referredEmail}</p>
                    <p className="text-xs text-muted-foreground">
                      Invited {new Date(referral.invitedAt).toLocaleDateString()}
                    </p>
                  </div>
                  {getStatusBadge(referral.status)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {(!referrals || referrals.length === 0) && !referralsLoading && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>You haven't invited anyone yet.</p>
            <p>Share your code to get started!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
