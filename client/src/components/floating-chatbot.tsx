import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  Send,
  User,
  X,
  Minimize2,
  Loader2,
  Sparkles,
  MessageCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Tag,
  ArrowLeftRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  suggestedAction?: TellerSuggestedAction | null;
}

export interface TransactionContext {
  id: string;
  merchant: string;
  amount: string | number;
  date: string;
  category: string;
  notes?: string;
  source?: string; // "plaid" | "mx" | "manual"
  isoCurrencyCode?: string;
}

interface TellerSuggestedAction {
  type: "recategorize" | "match_transfer" | "bulk_reconcile" | "none";
  label?: string;
  newCategory?: string;
  transferPairId?: string;
  confidence?: string;
  reason?: string;
}

interface TellerFlag {
  id: string;
  transaction_id: string;
  flag_type: "transfer_pair" | "miscategory" | "anomaly";
  message: string;
  suggested_action?: TellerSuggestedAction | null;
  is_dismissed: boolean;
  created_at: string;
}

// Enhanced message formatting function
function formatMessageContent(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let inList = false;

  const processInlineFormatting = (line: string): React.ReactNode => {
    // Process bold text **text**
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 my-2 ml-1">
          {listItems.map((item, i) => (
            <li key={i} className="text-sm">{processInlineFormatting(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();

    // Empty line
    if (!trimmedLine) {
      flushList();
      elements.push(<div key={`br-${index}`} className="h-2" />);
      return;
    }

    // Headers (## Header)
    if (trimmedLine.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={`h-${index}`} className="font-semibold text-sm mt-3 mb-1 text-primary">
          {trimmedLine.slice(3)}
        </h3>
      );
      return;
    }

    // List items (- item or * item or numbered 1. item)
    if (/^[-*•]\s/.test(trimmedLine) || /^\d+\.\s/.test(trimmedLine)) {
      inList = true;
      const content = trimmedLine.replace(/^[-*•]\s|^\d+\.\s/, '');
      listItems.push(content);
      return;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${index}`} className="text-sm leading-relaxed">
        {processInlineFormatting(trimmedLine)}
      </p>
    );
  });

  flushList();
  return <div className="space-y-1">{elements}</div>;
}

// ── Teller Action Card ────────────────────────────────────────────────────────

function TellerActionCard({
  action,
  transactionId,
  onActionComplete,
}: {
  action: TellerSuggestedAction;
  transactionId: string;
  onActionComplete: (result: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (action.type === "none" || isDismissed) return null;

  const getActionIcon = () => {
    switch (action.type) {
      case "recategorize": return <Tag className="h-3.5 w-3.5" />;
      case "match_transfer": return <ArrowLeftRight className="h-3.5 w-3.5" />;
      case "bulk_reconcile": return <CheckCircle2 className="h-3.5 w-3.5" />;
      default: return <Sparkles className="h-3.5 w-3.5" />;
    }
  };

  const getActionLabel = () => {
    if (action.label) return action.label;
    switch (action.type) {
      case "recategorize": return `Recategorize to "${action.newCategory}"`;
      case "match_transfer": return "Mark as Transfer";
      case "bulk_reconcile": return "Reconcile Transaction";
      default: return "Apply Suggestion";
    }
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      let endpoint = "";
      let body: Record<string, any> = { transaction_id: transactionId };

      if (action.type === "recategorize") {
        endpoint = "/api/ai/teller/recategorize";
        body.new_category = action.newCategory;
        body.reason = action.reason;
      } else if (action.type === "match_transfer") {
        endpoint = "/api/ai/teller/match-transfer";
        body.transfer_pair_id = action.transferPairId;
      } else if (action.type === "bulk_reconcile") {
        endpoint = "/api/ai/teller/bulk-reconcile";
        body.transaction_ids = [transactionId];
      }

      const res = await apiRequest("POST", endpoint, body);
      const data = await res.json();

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });

      toast({ title: "Action applied", description: data.message || "Transaction updated successfully." });
      onActionComplete(data.message || "Done.");
      setIsDismissed(true);
    } catch (err: any) {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
        <Sparkles className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold uppercase tracking-wide">AI Suggestion</span>
      </div>
      <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
        {action.reason || getActionLabel()}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1"
          onClick={handleConfirm}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            getActionIcon()
          )}
          {getActionLabel()}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => setIsDismissed(true)}
          disabled={isLoading}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

// ── Chat Message ──────────────────────────────────────────────────────────────

function ChatMessage({
  message,
  transactionId,
}: {
  message: Message;
  transactionId?: string;
}) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "")}>
      <div className={cn(
        "flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center shadow-sm",
        isUser ? "bg-primary" : "bg-gradient-to-br from-emerald-500 to-teal-600"
      )}>
        {isUser ? (
          <User className="h-3.5 w-3.5 text-primary-foreground" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 text-white" />
        )}
      </div>
      <div className={cn(
        "max-w-[85%]",
        isUser ? "" : ""
      )}>
        <div className={cn(
          "rounded-2xl px-3 py-2 shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted rounded-bl-md"
        )}>
          <div className={cn(
            "text-sm",
            isUser ? "" : "text-foreground"
          )}>
            {isUser ? message.content : formatMessageContent(message.content)}
          </div>
          <div className={cn(
            "text-[10px] mt-1",
            isUser ? "text-primary-foreground/60" : "text-muted-foreground"
          )}>
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        {/* Teller action card below assistant message */}
        {!isUser && message.suggestedAction && message.suggestedAction.type !== "none" && transactionId && (
          <TellerActionCard
            action={message.suggestedAction}
            transactionId={transactionId}
            onActionComplete={(result) => {
              // Result is shown via toast in TellerActionCard
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface FloatingChatbotProps {
  /** When provided, the component is controlled externally â€" the floating
   *  trigger button is hidden and the caller manages open/close. */
  externalOpen?: boolean;
  onExternalClose?: () => void;
  /** Teller mode: pass a transaction to ask AI about it */
  transactionContext?: TransactionContext | null;
  /** Whether to operate in teller mode (uses /api/ai/teller) */
  tellerMode?: boolean;
  /** Which teller API mode to use: "transaction" | "health_summary" | "bulk_triage" */
  tellerApiMode?: "transaction" | "health_summary" | "bulk_triage";
  /** Optional message to auto-send as the first user turn when the chat
   *  opens. Used by the "Ask Budget Smart AI" input in the TopNavBar so
   *  the user's question lands directly in the thread instead of
   *  requiring them to retype it after the panel opens. */
  initialMessage?: string | null;
  /** Fires once the initialMessage has been handed off to sendMessage.
   *  Callers should clear their pending-prompt state here so the same
   *  message isn't resent on the next open. */
  onInitialMessageSent?: () => void;
}

export function FloatingChatbot({
  externalOpen,
  onExternalClose,
  transactionContext,
  tellerMode = false,
  tellerApiMode = "transaction",
  initialMessage,
  onInitialMessageSent,
}: FloatingChatbotProps = {}) {
  const isControlled = externalOpen !== undefined;
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const autoSentRef = useRef(false);

  // Sync external open state
  const effectiveOpen = isControlled ? externalOpen! : isOpen;
  const handleClose = () => {
    if (isControlled) {
      onExternalClose?.();
    } else {
      setIsOpen(false);
    }
    setIsMinimized(false);
    // Reset auto-send flags when closed so the next open (teller or
    // TopNavBar Ask AI) can fire its initial message cleanly.
    autoSentRef.current = false;
    sentInitialMessageRef.current = null;
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Reset messages when transaction context or teller mode changes
  useEffect(() => {
    if (tellerMode) {
      setMessages([]);
      autoSentRef.current = false;
    }
  }, [transactionContext?.id, tellerApiMode, tellerMode]);

  // ── Regular chat mutation ──────────────────────────────────────────────────
  const chatMutation = useMutation({
    mutationFn: async (userMessages: { role: string; content: string }[]) => {
      const res = await apiRequest("POST", "/api/ai/chat", { messages: userMessages });
      return res.json();
    },
    onSuccess: (data) => {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: data.response || data.content || data.message || "Sorry, I could not generate a response. Please try again.",
          timestamp: new Date(),
        },
      ]);
    },
    onError: (error: any) => {
      if (error?.status === 402 || error?.message?.includes("402")) {
        toast({
          title: "Upgrade Required",
          description: "AI Bank Teller is available on Pro and Family plans.",
          variant: "destructive",
        });
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: "⭐ **AI Bank Teller** is a Pro feature. Upgrade your plan to ask AI about individual transactions.",
            timestamp: new Date(),
          },
        ]);
      } else {
        toast({ title: "Failed to get response", description: error.message, variant: "destructive" });
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: "Sorry, I encountered an error. Please try again.", timestamp: new Date() },
        ]);
      }
    },
  });

  // ── Teller mutation ────────────────────────────────────────────────────────
  const tellerMutation = useMutation({
    mutationFn: async ({
      userMessage,
      conversationHistory,
    }: {
      userMessage: string;
      conversationHistory: { role: string; content: string }[];
    }) => {
      const res = await apiRequest("POST", "/api/ai/teller", {
        mode: tellerApiMode,
        transaction_id: transactionContext?.id,
        user_message: userMessage,
        conversation_history: conversationHistory,
        transaction_context: transactionContext,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 402) {
          throw Object.assign(new Error("upgrade_required"), { status: 402, data: errData });
        }
        throw new Error(errData.error || "Request failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: data.response || "I couldn't analyze this transaction. Please try again.",
          timestamp: new Date(),
          suggestedAction: data.suggested_action || null,
        },
      ]);
    },
    onError: (error: any) => {
      if (error?.status === 402) {
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: "⭐ **AI Bank Teller** is available on **Pro** and **Family** plans.\n\nUpgrade to get AI-powered transaction analysis, anomaly detection, and smart recategorization.",
            timestamp: new Date(),
          },
        ]);
      } else {
        toast({ title: "Teller error", description: error.message, variant: "destructive" });
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: "Sorry, I encountered an error analyzing this transaction. Please try again.", timestamp: new Date() },
        ]);
      }
    },
  });

  const isPending = tellerMode ? tellerMutation.isPending : chatMutation.isPending;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isPending]);

  useEffect(() => {
    if (effectiveOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [effectiveOpen, isMinimized]);

  // Auto-send initial teller message when opened in teller mode
  useEffect(() => {
    if (
      tellerMode &&
      effectiveOpen &&
      !isMinimized &&
      !autoSentRef.current &&
      messages.length === 0 &&
      !isPending
    ) {
      // transaction mode requires a transactionContext
      if (tellerApiMode === "transaction" && !transactionContext) return;

      autoSentRef.current = true;
      let tellerInitialMessage = "Explain this transaction to me and tell me if anything looks wrong.";
      if (tellerApiMode === "health_summary") {
        tellerInitialMessage = "Give me a full health summary of my accounts and transactions.";
      } else if (tellerApiMode === "bulk_triage") {
        tellerInitialMessage = "Review all my unmatched transactions and tell me what to do with each one.";
      }
      sendMessage(tellerInitialMessage);
    }
  }, [tellerMode, tellerApiMode, transactionContext, effectiveOpen, isMinimized, messages.length, isPending]);

  // Track the last initialMessage we forwarded to sendMessage so repeat
  // uses of the "Ask Budget Smart AI" input (while the chat is already
  // open) fire each new question instead of being suppressed by the
  // autoSentRef used for teller mode.
  const sentInitialMessageRef = useRef<string | null>(null);

  // Auto-send an initialMessage prop when the chat opens outside teller mode.
  // Powers the "Ask Budget Smart AI" input in the TopNavBar: the input
  // dispatches a bsai:ask-ai event, AppSidebar stashes the prompt and
  // flips chatOpen, and this effect fires the first user turn so the
  // answer starts streaming immediately.
  useEffect(() => {
    if (tellerMode) return;
    if (!effectiveOpen || isMinimized) return;
    if (isPending) return;
    if (typeof initialMessage !== "string") return;
    const prompt = initialMessage.trim();
    if (!prompt) return;
    // Only send each distinct prompt once — AppSidebar clears the
    // pending-prompt state to null after we acknowledge it, so identical
    // repeat questions still flow through because the prop momentarily
    // drops back to null between dispatches.
    if (sentInitialMessageRef.current === prompt) return;
    sentInitialMessageRef.current = prompt;
    sendMessage(prompt);
    onInitialMessageSent?.();
  }, [tellerMode, effectiveOpen, isMinimized, isPending, initialMessage, onInitialMessageSent]);

  const sendMessage = (text: string) => {
    if (!text.trim() || isPending) return;

    const userMessage: Message = { role: "user", content: text.trim(), timestamp: new Date() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");

    if (tellerMode && (transactionContext || tellerApiMode !== "transaction")) {
      const conversationHistory = messages.map(m => ({ role: m.role, content: m.content }));
      tellerMutation.mutate({ userMessage: text.trim(), conversationHistory });
    } else {
      const apiMessages = updatedMessages.map(m => ({ role: m.role, content: m.content }));
      chatMutation.mutate(apiMessages);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const quickPrompts = [
    "Monthly summary",
    "Upcoming bills",
    "Spending tips",
  ];

  // ── Teller header subtitle ─────────────────────────────────────────────────
  const tellerSubtitle = tellerApiMode === "health_summary"
    ? "Account Health Check"
    : tellerApiMode === "bulk_triage"
    ? "Unmatched Transaction Review"
    : transactionContext
    ? `${transactionContext.merchant} · ${
        typeof transactionContext.amount === "number"
          ? new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(transactionContext.amount)
          : transactionContext.amount
      }`
    : null;

  if (!effectiveOpen) {
    // In controlled mode, never show the floating button — caller handles trigger
    if (isControlled) return null;

    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 group"
        aria-label="Open AI Chat"
      >
        <div className="relative">
          {/* Animated ring */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 animate-pulse opacity-30 scale-110" />

          {/* Main button */}
          <div className="relative h-14 w-14 rounded-full bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-emerald-500/25">
            {/* Inner glow */}
            <div className="absolute inset-1 rounded-full bg-gradient-to-br from-white/20 to-transparent" />

            {/* Icon container */}
            <div className="relative flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-white drop-shadow-sm" />
            </div>
          </div>

          {/* Badge */}
          <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary flex items-center justify-center shadow-md">
            <MessageCircle className="h-3 w-3 text-primary-foreground" />
          </div>
        </div>

        {/* Tooltip */}
        <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-foreground text-background text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg">
          AI Financial Assistant
          <div className="absolute top-full right-4 border-4 border-transparent border-t-foreground" />
        </div>
      </button>
    );
  }

  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-50 transition-all duration-300 ease-out",
      isMinimized ? "w-72" : "w-96"
    )}>
      <div className={cn(
        "bg-background rounded-2xl shadow-2xl border overflow-hidden",
        "transition-all duration-300 ease-out",
        isMinimized ? "h-14" : "h-[520px]"
      )}>
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between px-4 py-3 text-white",
          tellerMode
            ? "bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600"
            : "bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"
        )}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              {tellerMode ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm">
                {tellerMode ? "AI Bank Teller" : "AI Assistant"}
              </h3>
              {!isMinimized && (
                <p className="text-[10px] text-white/80 truncate max-w-[200px]">
                  {tellerMode && tellerSubtitle
                    ? tellerSubtitle
                    : "Your financial advisor"}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white hover:bg-white/20"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white hover:bg-white/20"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Teller context banner */}
            {tellerMode && transactionContext && (
              <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                  You asked about:{" "}
                  <span className="font-semibold">{transactionContext.merchant}</span>
                  {" · "}
                  <span>
                    {typeof transactionContext.amount === "number"
                      ? new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(transactionContext.amount)
                      : transactionContext.amount}
                  </span>
                  {" on "}
                  <span>
                    {new Date(transactionContext.date + "T00:00:00").toLocaleDateString("en-CA", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </p>
              </div>
            )}

            {/* Messages */}
            <div
              ref={scrollRef}
              className={cn(
                "flex-1 overflow-y-auto p-3 space-y-3",
                tellerMode && transactionContext ? "h-[330px]" : "h-[350px]"
              )}
            >
              {messages.length === 0 && !isPending ? (
                tellerMode ? (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-3 px-4">
                    <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <AlertTriangle className="h-6 w-6 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Analyzing transaction…</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Your AI Bank Teller is reviewing this transaction
                      </p>
                    </div>
                    <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4 px-4">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
                      <Bot className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Hi! How can I help?</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Ask me about your finances
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {quickPrompts.map((prompt, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 px-2 rounded-full"
                          onClick={() => sendMessage(prompt)}
                        >
                          {prompt}
                        </Button>
                      ))}
                    </div>
                  </div>
                )
              ) : (
                <>
                  {messages.map((msg, i) => (
                    <ChatMessage
                      key={i}
                      message={msg}
                      transactionId={tellerMode ? transactionContext?.id : undefined}
                    />
                  ))}
                  {isPending && (
                    <div className="flex gap-2">
                      <div className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center shadow-sm",
                        tellerMode
                          ? "bg-gradient-to-br from-amber-500 to-orange-600"
                          : "bg-gradient-to-br from-emerald-500 to-teal-600"
                      )}>
                        <Sparkles className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="bg-muted rounded-2xl rounded-bl-md px-3 py-2 shadow-sm">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>{tellerMode ? "Analyzing…" : "Thinking…"}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Input */}
            <div className="border-t p-3 bg-muted/30">
              <div className="flex gap-2 items-end">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={tellerMode ? "Ask about this transaction…" : "Type a message..."}
                  className="min-h-[38px] max-h-[80px] resize-none text-sm rounded-xl bg-background"
                  rows={1}
                  disabled={isPending}
                />
                <Button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isPending}
                  size="icon"
                  className={cn(
                    "h-[38px] w-[38px] flex-shrink-0 rounded-xl",
                    tellerMode
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                      : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                  )}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
