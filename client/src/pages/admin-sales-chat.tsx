import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare,
  Users,
  Mail,
  Clock,
  Eye,
  Filter,
  RefreshCw,
  Bot,
  User,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface SalesChatSession {
  id: string;
  visitorId: string;
  status: string | null;
  startedAt: string;
  endedAt: string | null;
  messageCount: number | null;
  hasLeadForm: string | null;
  metadata: string | null;
}

interface SalesChatMessage {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  createdAt: string;
}

interface SalesLead {
  id: string;
  sessionId: string;
  name: string;
  email: string;
  question: string;
  status: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusBadge(status: string | null) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>;
    case "completed":
      return <Badge variant="secondary">Completed</Badge>;
    case "escalated":
      return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20">Escalated</Badge>;
    default:
      return <Badge variant="outline">{status || "Unknown"}</Badge>;
  }
}

function getLeadStatusBadge(status: string | null) {
  switch (status) {
    case "new":
      return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">New</Badge>;
    case "contacted":
      return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Contacted</Badge>;
    case "converted":
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Converted</Badge>;
    case "closed":
      return <Badge variant="secondary">Closed</Badge>;
    default:
      return <Badge variant="outline">{status || "Unknown"}</Badge>;
  }
}

function SessionDetailDialog({
  session,
  open,
  onOpenChange,
}: {
  session: SalesChatSession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: messages, isLoading } = useQuery<SalesChatMessage[]>({
    queryKey: ["/api/admin/sales-chat/sessions", session?.id, "messages"],
    enabled: open && !!session?.id,
  });

  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-violet-500" />
            Chat Session Details
          </DialogTitle>
          <DialogDescription>
            Session started {formatDate(session.startedAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Status:</span>{" "}
              {getStatusBadge(session.status)}
            </div>
            <div>
              <span className="text-muted-foreground">Messages:</span>{" "}
              {session.messageCount || 0}
            </div>
            {session.hasLeadForm === "true" && (
              <div>
                <Badge variant="outline" className="text-violet-500 border-violet-500/20">
                  Lead Captured
                </Badge>
              </div>
            )}
          </div>

          <div className="border rounded-lg p-4 max-h-[400px] overflow-y-auto space-y-3 bg-muted/30">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages && messages.length > 0 ? (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-2",
                    msg.role === "user" ? "flex-row-reverse" : ""
                  )}
                >
                  <div
                    className={cn(
                      "flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center",
                      msg.role === "user"
                        ? "bg-primary"
                        : "bg-gradient-to-br from-violet-500 to-purple-600"
                    )}
                  >
                    {msg.role === "user" ? (
                      <User className="h-3.5 w-3.5 text-primary-foreground" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-white" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-2 shadow-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-background border rounded-bl-md"
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p
                      className={cn(
                        "text-[10px] mt-1",
                        msg.role === "user"
                          ? "text-primary-foreground/60"
                          : "text-muted-foreground"
                      )}
                    >
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No messages in this session
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeadEditDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: SalesLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState(lead?.status || "new");
  const [notes, setNotes] = useState(lead?.notes || "");

  const updateMutation = useMutation({
    mutationFn: async (data: { status: string; notes: string }) => {
      return apiRequest("PATCH", `/api/admin/sales-leads/${lead?.id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Lead updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sales-leads"] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update lead",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-violet-500" />
            Lead Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Name</Label>
            <p className="font-medium">{lead.name}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Email</Label>
            <p className="font-medium">
              <a
                href={`mailto:${lead.email}`}
                className="text-primary hover:underline"
              >
                {lead.email}
              </a>
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Question</Label>
            <p className="text-sm bg-muted p-3 rounded-lg">{lead.question}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lead-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="lead-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lead-notes">Notes</Label>
            <Textarea
              id="lead-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this lead..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateMutation.mutate({ status, notes })}
              disabled={updateMutation.isPending}
              className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConversationsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedSession, setSelectedSession] = useState<SalesChatSession | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery<{
    sessions: SalesChatSession[];
    total: number;
  }>({
    queryKey: ["/api/admin/sales-chat/sessions", statusFilter],
  });

  const sessions = data?.sessions || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sessions</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={cn("h-4 w-4 mr-2", isRefetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No chat sessions found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Messages</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id} data-testid={`row-session-${session.id}`}>
                    <TableCell>{formatDate(session.startedAt)}</TableCell>
                    <TableCell>{getStatusBadge(session.status)}</TableCell>
                    <TableCell>{session.messageCount || 0}</TableCell>
                    <TableCell>
                      {session.hasLeadForm === "true" ? (
                        <Badge variant="outline" className="text-green-500 border-green-500/20">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Yes
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedSession(session);
                          setShowDetail(true);
                        }}
                        data-testid={`button-view-session-${session.id}`}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SessionDetailDialog
        session={selectedSession}
        open={showDetail}
        onOpenChange={setShowDetail}
      />
    </div>
  );
}

function LeadsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<SalesLead | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  const { data: leadsResponse, isLoading, refetch, isRefetching } = useQuery<{
    leads: SalesLead[];
    total: number;
  }>({
    queryKey: ["/api/admin/sales-leads", statusFilter],
  });

  const leads = leadsResponse?.leads || [];
  const filteredLeads = leads.filter(
    (lead) => statusFilter === "all" || lead.status === statusFilter
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leads</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={cn("h-4 w-4 mr-2", isRefetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No leads found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((lead) => (
                  <TableRow key={lead.id} data-testid={`row-lead-${lead.id}`}>
                    <TableCell>{formatDate(lead.createdAt)}</TableCell>
                    <TableCell className="font-medium">{lead.name}</TableCell>
                    <TableCell>
                      <a
                        href={`mailto:${lead.email}`}
                        className="text-primary hover:underline"
                      >
                        {lead.email}
                      </a>
                    </TableCell>
                    <TableCell>{getLeadStatusBadge(lead.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedLead(lead);
                          setShowEdit(true);
                        }}
                        data-testid={`button-edit-lead-${lead.id}`}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <LeadEditDialog
        lead={selectedLead}
        open={showEdit}
        onOpenChange={setShowEdit}
      />
    </div>
  );
}

export default function AdminSalesChat() {
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<{
    sessions: SalesChatSession[];
    total: number;
  }>({
    queryKey: ["/api/admin/sales-chat/sessions"],
  });

  const { data: leadsData, isLoading: leadsLoading } = useQuery<{
    leads: SalesLead[];
    total: number;
  }>({
    queryKey: ["/api/admin/sales-leads"],
  });

  const leads = leadsData?.leads || [];
  const totalSessions = sessionsData?.total || 0;
  const activeSessions = sessionsData?.sessions?.filter((s) => s.status === "active").length || 0;
  const totalLeads = leadsData?.total || 0;
  const newLeads = leads.filter((l) => l.status === "new").length || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Bot className="h-6 w-6 text-violet-500" />
            Sales Chatbot
          </h1>
          <p className="text-muted-foreground">
            Manage chat conversations and leads from landing page visitors
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-total-sessions">
                {totalSessions}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Chats</CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-green-500" data-testid="text-active-sessions">
                {activeSessions}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Mail className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            {leadsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-total-leads">
                {totalLeads}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Leads</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {leadsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-blue-500" data-testid="text-new-leads">
                {newLeads}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="conversations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="conversations" data-testid="tab-conversations">
            <MessageSquare className="h-4 w-4 mr-2" />
            Conversations
          </TabsTrigger>
          <TabsTrigger value="leads" data-testid="tab-leads">
            <Mail className="h-4 w-4 mr-2" />
            Leads
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversations">
          <ConversationsTab />
        </TabsContent>

        <TabsContent value="leads">
          <LeadsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
