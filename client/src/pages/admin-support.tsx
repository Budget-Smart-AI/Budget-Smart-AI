import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, ArrowLeft, Send, Bot, ChevronDown, ChevronUp,
  Ticket, Search, Filter, X,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Ticket {
  id: string;
  ticketNumber: string;
  userId: string | null;
  name: string | null;
  email: string;
  type: string | null;
  subject: string;
  message: string;
  status: string;
  priority: string;
  adminResponse: string | null;
  adminResponseAt: string | null;
  respondedBy: string | null;
  category: string | null;
  confidenceScore: number | null;
  tier: string | null;
  aiSummary: string | null;
  aiResponseSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  ticketId: string;
  senderType: string;
  senderId: string | null;
  message: string;
  createdAt: string;
}

function statusBadge(status: string) {
  switch (status) {
    case "open": return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 border">Open</Badge>;
    case "waiting_for_user": return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 border">Waiting for User</Badge>;
    case "waiting_for_admin": return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 border">Waiting for Admin</Badge>;
    case "escalated": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 border">Escalated</Badge>;
    case "closed": return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 border">Closed</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function priorityBadge(priority: string) {
  switch (priority) {
    case "urgent": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 border">Urgent</Badge>;
    case "high": return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 border">High</Badge>;
    case "normal": return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30 border">Normal</Badge>;
    case "low": return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30 border">Low</Badge>;
    default: return <Badge variant="outline">{priority || "Normal"}</Badge>;
  }
}

function TicketDetail({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiPanelOpen, setAiPanelOpen] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  const { data, isLoading } = useQuery<{ ticket: Ticket; messages: Message[] }>({
    queryKey: [`/api/admin/support/tickets/${ticketId}`],
  });

  const replyMutation = useMutation({
    mutationFn: async (message: string) => {
      const r = await apiRequest("POST", `/api/admin/support/tickets/${ticketId}/reply`, { message });
      return r.json();
    },
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: [`/api/admin/support/tickets/${ticketId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/tickets"] });
      toast({ title: "Reply sent" });
    },
    onError: () => toast({ title: "Failed to send reply", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: { status?: string; priority?: string }) => {
      const r = await apiRequest("PATCH", `/api/admin/support/tickets/${ticketId}`, updates);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/support/tickets/${ticketId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/tickets"] });
      toast({ title: "Ticket updated" });
    },
    onError: () => toast({ title: "Failed to update ticket", variant: "destructive" }),
  });

  const handleAiAssist = async () => {
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    setAiResponse("");
    try {
      const r = await apiRequest("POST", "/api/admin/support/ai-assist", {
        ticketId,
        question: aiQuestion.trim(),
      });
      const data = await r.json();
      setAiResponse(data.response || "No response");
    } catch {
      toast({ title: "AI assistant failed", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const ticket = data?.ticket;
  const messages = data?.messages || [];

  if (!ticket) return <p className="text-muted-foreground">Ticket not found.</p>;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Tickets
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Ticket Details + Thread */}
        <div className="lg:col-span-2 space-y-4">
          {/* Ticket info */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-mono text-muted-foreground mb-1">{ticket.ticketNumber}</p>
                  <CardTitle className="text-lg">{ticket.subject}</CardTitle>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {statusBadge(ticket.status)}
                  {priorityBadge(ticket.priority)}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">User</span>
                  <p className="font-medium">{ticket.name || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{ticket.email}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Type</span>
                  <p className="font-medium capitalize">{ticket.type || "N/A"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Submitted</span>
                  <p className="font-medium">{new Date(ticket.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Updated</span>
                  <p className="font-medium">{new Date(ticket.updatedAt || ticket.createdAt).toLocaleString()}</p>
                </div>
              </div>

              {/* AI Triage info */}
              {(ticket.category || ticket.tier || ticket.aiSummary) && (
                <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border text-sm space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">AI Triage</p>
                  {ticket.category && <p><span className="text-muted-foreground">Category: </span><span className="font-medium">{ticket.category}</span></p>}
                  {ticket.tier && <p><span className="text-muted-foreground">Tier: </span><Badge variant="outline" className={ticket.tier === "LEVEL_2" ? "border-red-500/50 text-red-400" : "border-green-500/50 text-green-400"}>{ticket.tier}</Badge>{ticket.confidenceScore != null && <span className="text-muted-foreground ml-2 text-xs">{ticket.confidenceScore}% confidence</span>}</p>}
                  {ticket.aiSummary && <p className="text-muted-foreground text-xs">{ticket.aiSummary}</p>}
                  {ticket.aiResponseSentAt && <p className="text-xs text-muted-foreground">AI auto-response sent: {new Date(ticket.aiResponseSentAt).toLocaleString()}</p>}
                </div>
              )}

              {/* Status / Priority controls */}
              <div className="flex gap-3 pt-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                  <Select
                    value={ticket.status}
                    onValueChange={(v) => updateMutation.mutate({ status: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="waiting_for_user">Waiting for User</SelectItem>
                      <SelectItem value="waiting_for_admin">Waiting for Admin</SelectItem>
                      <SelectItem value="escalated">Escalated</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
                  <Select
                    value={ticket.priority || "normal"}
                    onValueChange={(v) => updateMutation.mutate({ priority: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => updateMutation.mutate({ status: "closed" })}
                    disabled={ticket.status === "closed" || updateMutation.isPending}
                  >
                    Close Ticket
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Message thread */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Conversation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mb-6">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.senderType === "admin" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                        msg.senderType === "admin"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted border border-border"
                      }`}
                    >
                      <p className="font-semibold text-xs opacity-70 mb-1">
                        {msg.senderType === "admin" ? "Support Team" : "User"}
                      </p>
                      <p className="whitespace-pre-wrap">{msg.message}</p>
                      <p className="text-xs opacity-50 mt-1">{new Date(msg.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-4">No messages yet.</p>
                )}
              </div>

              {/* Reply box */}
              <div className="space-y-2">
                <Textarea
                  placeholder="Type your reply to the user..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={4}
                />
                <div className="flex justify-end">
                  <Button
                    onClick={() => replyMutation.mutate(replyText)}
                    disabled={replyMutation.isPending || !replyText.trim()}
                  >
                    {replyMutation.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>
                    ) : (
                      <><Send className="mr-2 h-4 w-4" />Send Reply</>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: AI Assistant Panel */}
        <div>
          <Card>
            <CardHeader
              className="pb-3 cursor-pointer"
              onClick={() => setAiPanelOpen(p => !p)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  AI Assistant
                </CardTitle>
                {aiPanelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
            {aiPanelOpen && (
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Ask the AI assistant about this ticket. E.g., "Summarize this ticket", "Suggest a response", "Is this a known bug?"
                </p>
                <Textarea
                  placeholder="Ask AI assistant..."
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  rows={3}
                />
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={handleAiAssist}
                  disabled={aiLoading || !aiQuestion.trim()}
                >
                  {aiLoading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Thinking...</>
                  ) : (
                    <><Bot className="mr-2 h-4 w-4" />Ask AI</>
                  )}
                </Button>

                {aiResponse && (
                  <div className="space-y-2">
                    <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap border border-border">
                      {aiResponse}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => setReplyText(aiResponse)}
                    >
                      Use this response
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function AdminSupport() {
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: tickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["/api/admin/support/tickets"],
  });

  const filtered = tickets.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (priorityFilter !== "all" && (t.priority || "normal") !== priorityFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        (t.ticketNumber || "").toLowerCase().includes(q) ||
        (t.subject || "").toLowerCase().includes(q) ||
        (t.email || "").toLowerCase().includes(q) ||
        (t.name || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (selectedTicketId) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <TicketDetail ticketId={selectedTicketId} onBack={() => setSelectedTicketId(null)} />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 shadow-lg shadow-indigo-500/20">
          <Ticket className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Support Portal</h1>
          <p className="text-sm text-muted-foreground">Manage user support tickets</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by ticket #, subject, or user..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {searchQuery && (
                <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSearchQuery("")}>
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="waiting_for_user">Waiting for User</SelectItem>
                  <SelectItem value="waiting_for_admin">Waiting for Admin</SelectItem>
                  <SelectItem value="escalated">Escalated</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ticket table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Ticket className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>{tickets.length === 0 ? "No support tickets yet." : "No tickets match the current filters."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Ticket #</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">User</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Subject</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Type</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Priority</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Created</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="border-b border-border/50 hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => setSelectedTicketId(ticket.id)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-primary">{ticket.ticketNumber || ticket.id.slice(0, 8)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{ticket.name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{ticket.email}</p>
                      </td>
                      <td className="px-4 py-3 max-w-[200px] truncate">{ticket.subject}</td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">{ticket.type || "—"}</td>
                      <td className="px-4 py-3">{priorityBadge(ticket.priority || "normal")}</td>
                      <td className="px-4 py-3">{statusBadge(ticket.status)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(ticket.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(ticket.updatedAt || ticket.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
