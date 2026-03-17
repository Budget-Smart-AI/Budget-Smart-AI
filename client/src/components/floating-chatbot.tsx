import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
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
        isUser ? "bg-primary" : "bg-gradient-to-br from-emerald-500 to-teal-600"
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

export function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const chatMutation = useMutation({
    mutationFn: async (userMessages: { role: string; content: string }[]) => {
      const res = await apiRequest("POST", "/api/ai/chat", { messages: userMessages });
      return res.json();
    },
    onSuccess: (data) => {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: data.response || data.content || data.message || "Sorry, I could not generate a response. Please try again.", timestamp: new Date() },
      ]);
    },
    onError: (error: any) => {
      toast({ title: "Failed to get response", description: error.message, variant: "destructive" });
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again.", timestamp: new Date() },
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
    if (!text.trim() || chatMutation.isPending) return;

    const userMessage: Message = { role: "user", content: text.trim(), timestamp: new Date() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");

    const apiMessages = updatedMessages.map(m => ({ role: m.role, content: m.content }));
    chatMutation.mutate(apiMessages);
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

  if (!isOpen) {
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
        isMinimized ? "h-14" : "h-[500px]"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">AI Assistant</h3>
              {!isMinimized && (
                <p className="text-[10px] text-white/80">Your financial advisor</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
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
              onClick={() => {
                setIsOpen(false);
                setIsMinimized(false);
              }}
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
              ) : (
                <>
                  {messages.map((msg, i) => (
                    <ChatMessage key={i} message={msg} />
                  ))}
                  {chatMutation.isPending && (
                    <div className="flex gap-2">
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
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
                  disabled={chatMutation.isPending}
                />
                <Button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || chatMutation.isPending}
                  size="icon"
                  className="h-[38px] w-[38px] flex-shrink-0 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
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
