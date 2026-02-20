import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Bot,
  Send,
  User,
  X,
  Minimize2,
  Loader2,
  MessageSquare,
  Sparkles,
  Mail,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// Generate or retrieve visitor ID for session tracking
function getOrCreateVisitorId(): string {
  const key = "budgetsmart_visitor_id";
  let visitorId = localStorage.getItem(key);
  if (!visitorId) {
    visitorId = `v_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem(key, visitorId);
  }
  return visitorId;
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

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "")}>
      <div className={cn(
        "flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center shadow-sm",
        isUser ? "bg-primary" : "bg-gradient-to-br from-violet-500 to-purple-600"
      )}>
        {isUser ? (
          <User className="h-3.5 w-3.5 text-primary-foreground" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 text-white" />
        )}
      </div>
      <div className={cn(
        "max-w-[85%] rounded-2xl px-3 py-2 shadow-sm",
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
    </div>
  );
}

interface LeadFormData {
  name: string;
  email: string;
  question: string;
}

function LeadCaptureDialog({
  open,
  onOpenChange,
  sessionId,
  lastMessage,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  lastMessage: string;
  onSuccess: (message: string) => void;
}) {
  const [formData, setFormData] = useState<LeadFormData>({
    name: "",
    email: "",
    question: lastMessage,
  });
  const { toast } = useToast();

  useEffect(() => {
    if (open && lastMessage) {
      setFormData(prev => ({ ...prev, question: lastMessage }));
    }
  }, [open, lastMessage]);

  const submitMutation = useMutation({
    mutationFn: async (data: LeadFormData) => {
      const res = await fetch("/api/sales-chat/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, ...data }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to submit");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Message sent!", description: "Our team will reach out soon." });
      onOpenChange(false);
      onSuccess(`Thanks ${formData.name}! I've sent your question to our team. They'll reach out to you at ${formData.email} shortly. Is there anything else I can help you with?`);
      setFormData({ name: "", email: "", question: "" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to send", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-violet-500" />
            Connect with Our Team
          </DialogTitle>
          <DialogDescription>
            Leave your details and we'll get back to you with an answer!
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitMutation.mutate(formData);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Your Name</Label>
            <Input
              id="name"
              placeholder="John Smith"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="question">Your Question</Label>
            <Textarea
              id="question"
              placeholder="What would you like to know?"
              value={formData.question}
              onChange={(e) => setFormData(prev => ({ ...prev, question: e.target.value }))}
              rows={3}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitMutation.isPending}
              className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Message
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SalesChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const visitorId = useRef(getOrCreateVisitorId());

  // Initialize session
  const initSession = useCallback(async () => {
    if (sessionId) return;

    try {
      const res = await fetch("/api/sales-chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId: visitorId.current,
          metadata: {
            userAgent: navigator.userAgent,
            referrer: document.referrer,
            page: window.location.pathname,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSessionId(data.sessionId);

        // Show greeting only for new sessions
        if (data.isNew) {
          setMessages([{
            role: "assistant",
            content: data.greeting,
            timestamp: new Date(),
          }]);
        }
      }
    } catch (error) {
      console.error("Failed to initialize chat session:", error);
    }
  }, [sessionId]);

  // Initialize session when chat opens
  useEffect(() => {
    if (isOpen && !sessionId) {
      initSession();
    }
  }, [isOpen, sessionId, initSession]);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch("/api/sales-chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to send message");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: data.response, timestamp: new Date() },
      ]);

      if (data.showLeadForm) {
        // Show lead form after a brief delay
        setTimeout(() => setShowLeadForm(true), 500);
      }
    },
    onError: (error: any) => {
      toast({ title: "Failed to get response", description: error.message, variant: "destructive" });
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Sorry, I had trouble processing that. Please try again!", timestamp: new Date() },
      ]);
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatMutation.isPending]);

  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  const sendMessage = (text: string) => {
    if (!text.trim() || chatMutation.isPending || !sessionId) return;

    const userMessage: Message = { role: "user", content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setLastUserMessage(text.trim());
    setInput("");
    chatMutation.mutate(text.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleLeadFormSuccess = (message: string) => {
    setMessages(prev => [
      ...prev,
      { role: "assistant", content: message, timestamp: new Date() },
    ]);
  };

  const quickPrompts = [
    "What features do you offer?",
    "How much does it cost?",
    "Is my data secure?",
  ];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 group"
        aria-label="Open Sales Chat"
        data-testid="button-open-chat"
      >
        <div className="relative">
          {/* Animated ring */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500 to-purple-500 animate-pulse opacity-30 scale-110" />

          {/* Main button */}
          <div className="relative h-14 w-14 rounded-full bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-violet-500/25">
            {/* Inner glow */}
            <div className="absolute inset-1 rounded-full bg-gradient-to-br from-white/20 to-transparent" />

            {/* Icon container */}
            <div className="relative flex items-center justify-center">
              <MessageSquare className="h-6 w-6 text-white drop-shadow-sm" />
            </div>
          </div>

          {/* Badge */}
          <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-green-500 flex items-center justify-center shadow-md animate-bounce">
            <span className="text-[10px] text-white font-bold">Hi</span>
          </div>
        </div>

        {/* Tooltip */}
        <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-foreground text-background text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg">
          Chat with us!
          <div className="absolute top-full right-4 border-4 border-transparent border-t-foreground" />
        </div>
      </button>
    );
  }

  return (
    <>
      <div className={cn(
        "fixed bottom-6 right-6 z-50 transition-all duration-300 ease-out",
        isMinimized ? "w-72" : "w-96"
      )}>
        <div className={cn(
          "bg-background rounded-2xl shadow-2xl border overflow-hidden",
          "transition-all duration-300 ease-out",
          isMinimized ? "h-14" : "h-[500px]"
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 text-white">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">BudgetBot</h3>
                {!isMinimized && (
                  <p className="text-[10px] text-white/80">Ask me anything about BudgetSmart</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white hover:bg-white/20"
                onClick={() => setIsMinimized(!isMinimized)}
                data-testid="button-minimize-chat"
                aria-label="Minimize chat"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white hover:bg-white/20"
                onClick={() => {
                  setIsOpen(false);
                  setIsMinimized(false);
                }}
                data-testid="button-close-chat"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Messages */}
              <div ref={scrollRef} className="flex-1 h-[350px] overflow-y-auto p-3 space-y-3">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4 px-4">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
                      <Bot className="h-6 w-6 text-violet-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Hi! I'm BudgetBot</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Ask me about features, pricing, or security
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
                          disabled={!sessionId}
                          data-testid={`button-quick-prompt-${i}`}
                        >
                          {prompt}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((msg, i) => (
                      <ChatMessage key={i} message={msg} />
                    ))}
                    {chatMutation.isPending && (
                      <div className="flex gap-2">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
                          <Sparkles className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="bg-muted rounded-2xl rounded-bl-md px-3 py-2 shadow-sm">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Thinking...</span>
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
                    placeholder="Type a message..."
                    className="min-h-[38px] max-h-[80px] resize-none text-sm rounded-xl bg-background"
                    rows={1}
                    disabled={chatMutation.isPending || !sessionId}
                    data-testid="input-chat-message"
                  />
                  <Button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || chatMutation.isPending || !sessionId}
                    size="icon"
                    className="h-[38px] w-[38px] flex-shrink-0 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600"
                    data-testid="button-send-message"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <LeadCaptureDialog
        open={showLeadForm}
        onOpenChange={setShowLeadForm}
        sessionId={sessionId || ""}
        lastMessage={lastUserMessage}
        onSuccess={handleLeadFormSuccess}
      />
    </>
  );
}
