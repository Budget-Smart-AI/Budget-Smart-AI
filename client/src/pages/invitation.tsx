import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Users, UserPlus, UserCheck, XCircle, Clock, Home } from "lucide-react";

interface InvitationData {
  id: string;
  householdName: string;
  inviterName: string;
  role: string;
  status: string;
  expiresAt: string;
}

export default function InvitationPage() {
  const params = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const token = params.token;

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["/api/auth/session"],
  });

  const { data: invitation, isLoading: invitationLoading, error: invitationError } = useQuery<InvitationData>({
    queryKey: ["/api/invitations", token],
    queryFn: async () => {
      const response = await fetch(`/api/invitations/${token}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to load invitation");
      }
      return response.json();
    },
    enabled: !!token,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/invitations/${token}/accept`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invitation Accepted",
        description: "You've joined the household! Redirecting to dashboard..."
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      queryClient.invalidateQueries({ queryKey: ["/api/households/current"] });
      setTimeout(() => navigate("/"), 1500);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Accept",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/invitations/${token}/decline`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invitation Declined",
        description: "The invitation has been declined."
      });
      navigate("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Decline",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const isAuthenticated = (session as any)?.authenticated;
  const isLoading = sessionLoading || invitationLoading;
  const isExpired = invitation?.expiresAt && new Date(invitation.expiresAt) < new Date();
  const isAlreadyProcessed = invitation?.status !== "pending";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invitationError || !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <XCircle className="w-6 h-6 text-destructive" />
            </div>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>
              This invitation link is invalid or has already been used.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate("/")} variant="outline">
              <Home className="w-4 h-4 mr-2" />
              Go to Homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4">
              <Clock className="w-6 h-6 text-yellow-500" />
            </div>
            <CardTitle>Invitation Expired</CardTitle>
            <CardDescription>
              This invitation has expired. Please ask the household owner to send a new invitation.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate("/")} variant="outline">
              <Home className="w-4 h-4 mr-2" />
              Go to Homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isAlreadyProcessed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <UserCheck className="w-6 h-6 text-muted-foreground" />
            </div>
            <CardTitle>
              {invitation.status === "accepted" ? "Already Accepted" : "Invitation Declined"}
            </CardTitle>
            <CardDescription>
              {invitation.status === "accepted"
                ? "You've already accepted this invitation and joined the household."
                : "This invitation has been declined."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate("/")} variant="outline">
              <Home className="w-4 h-4 mr-2" />
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <UserPlus className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Household Invitation</CardTitle>
            <CardDescription>
              You've been invited to join <strong>{invitation.householdName}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Household</span>
                <span className="font-medium">{invitation.householdName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Invited by</span>
                <span className="font-medium">{invitation.inviterName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Your role</span>
                <Badge variant={invitation.role === "advisor" ? "secondary" : "default"}>
                  {invitation.role === "advisor" ? "Financial Advisor" : "Household Member"}
                </Badge>
              </div>
            </div>

            <div className="text-center text-sm text-muted-foreground">
              Please log in or create an account to accept this invitation.
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={() => navigate(`/?redirect=/invitation/${token}`)} className="w-full">
                Log In to Accept
              </Button>
              <Button onClick={() => navigate("/")} variant="outline" className="w-full">
                Go to Homepage
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Join Household</CardTitle>
          <CardDescription>
            You've been invited to join <strong>{invitation.householdName}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Household</span>
              <span className="font-medium">{invitation.householdName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Invited by</span>
              <span className="font-medium">{invitation.inviterName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Your role</span>
              <Badge variant={invitation.role === "advisor" ? "secondary" : "default"}>
                {invitation.role === "advisor" ? "Financial Advisor" : "Household Member"}
              </Badge>
            </div>
          </div>

          {invitation.role === "advisor" && (
            <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              As a financial advisor, you'll have view-only access to the household's finances.
              You won't be able to create, edit, or delete any financial data.
            </div>
          )}

          {invitation.role === "member" && (
            <div className="text-sm text-muted-foreground bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
              As a household member, you'll have full access to view and manage the household's
              finances alongside other members.
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending || declineMutation.isPending}
              className="flex-1"
            >
              {acceptMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Accepting...
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4 mr-2" />
                  Accept
                </>
              )}
            </Button>
            <Button
              onClick={() => declineMutation.mutate()}
              disabled={acceptMutation.isPending || declineMutation.isPending}
              variant="outline"
              className="flex-1"
            >
              {declineMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Declining...
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 mr-2" />
                  Decline
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
