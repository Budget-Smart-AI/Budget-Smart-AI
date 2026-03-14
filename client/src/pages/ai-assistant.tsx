// FEATURE: AI_ASSISTANT | tier: free | limit: 10 messages/month (free), unlimited (pro/family)
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  Send,
  User,
  Sparkles,
  Trash2,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FeatureGate } from "@/components/FeatureGate";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Suggestion {
  label: string;
  prompt: string;
}

// Enhanced message formatting - parses markdown-like content for better display
function formatAIResponse(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let numberedListItems: string[] = [];
  let inList = false;
  let inNumberedList = false;

  const processInlineFormatting = (line: string): React.ReactNode => {
    // Process bold text **text** and *text*
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
        return <em key={i} className="italic">{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  const flushBulletList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="space-y-1.5 my-3">
          {listItems.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60 flex-shrink-0" />
              <span className="leading-relaxed">{processInlineFormatting(item)}</span>
            </li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  const flushNumberedList = () => {
    if (numberedListItems.length > 0) {
      elements.push(
        <ol key={`olist-${elements.length}`} className="space-y-2 my-3">
          {numberedListItems.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <span className="leading-relaxed flex-1">{processInlineFormatting(item)}</span>
            </li>
          ))}
        </ol>
      );
      numberedListItems = [];
      inNumberedList = false;
    }
  };

  const flushLists = () => {
    flushBulletList();
    flushNumberedList();
  };

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();

    // Empty line
    if (!trimmedLine) {
      flushLists();
      if (elements.length > 0) {
        elements.push(<div key={`br-${index}`} className="h-2" />);
      }
      return;
    }

    // Headers (## Header or ### Header)
    if (trimmedLine.startsWith('### ')) {
      flushLists();
      elements.push(
        <h4 key={`h4-${index}`} className="font-semibold text-sm mt-4 mb-2 text-primary flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          {trimmedLine.slice(4)}
        </h4>
      );
      return;
    }

    if (trimmedLine.startsWith('## ')) {
      flushLists();
      elements.push(
        <h3 key={`h3-${index}`} className="font-bold text-base mt-4 mb-2 text-primary border-b border-primary/20 pb-1">
          {trimmedLine.slice(3)}
        </h3>
      );
      return;
    }

    // Numbered list items (1. item, 2. item, etc.)
    if (/^\d+\.\s/.test(trimmedLine)) {
      if (inList) flushBulletList();
      inNumberedList = true;
      const content = trimmedLine.replace(/^\d+\.\s/, '');
      numberedListItems.push(content);
      return;
    }

    // Bullet list items (- item or * item or • item)
    if (/^[-*•]\s/.test(trimmedLine)) {
      if (inNumberedList) flushNumberedList();
      inList = true;
      const content = trimmedLine.replace(/^[-*•]\s/, '');
      listItems.push(content);
      return;
    }

    // Key-value pairs (Label: Value)
    if (trimmedLine.includes(':') && !trimmedLine.startsWith('http')) {
      const colonIndex = trimmedLine.indexOf(':');
      const label = trimmedLine.slice(0, colonIndex).trim();
      const value = trimmedLine.slice(colonIndex + 1).trim();

      // Check if it looks like a label (short, no spaces or few words)
      if (label.length < 30 && value.length > 0 && !label.includes('  ')) {
        flushLists();
        elements.push(
          <div key={`kv-${index}`} className="flex items-baseline gap-2 text-sm py-0.5">
            <span className="font-medium text-muted-foreground">{label}:</span>
            <span className="text-foreground">{processInlineFormatting(value)}</span>
          </div>
        );
        return;
      }
    }

    // Regular paragraph
    flushLists();
    elements.push(
      <p key={`p-${index}`} className="text-sm leading-relaxed">
        {processInlineFormatting(trimmedLine)}
      </p>
    );
  });

  flushLists();
  return <div className="space-y-1">{elements}</div>;
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""} animate-in fade-in-0 slide-in-from-bottom-2 duration-300`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center shadow-sm transition-transform hover:scale-105 ${
        isUser
          ? "bg-primary"
          : "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500"
      }`}>
        {isUser ? (
          <User className="h-4 w-4 text-primary-foreground" />
        ) : (
          <Sparkles className="h-4 w-4 text-white" />
        )}
      </div>

      {/* Message content */}
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
        isUser
          ? "bg-primary text-primary-foreground rounded-br-md"
          : "bg-card border border-border/50 rounded-bl-md"
      }`}>
        {/* Role label for assistant */}
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-border/50">
            <Bot className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-primary">AI Assistant</span>
          </div>
        )}

        {/* Message text */}
        <div className={`${isUser ? "text-sm whitespace-pre-wrap" : ""}`}>
          {isUser ? message.content : formatAIResponse(message.content)}
        </div>

        {/* Timestamp */}
        <div className={`text-xs mt-2 pt-2 border-t ${
          isUser
            ? "text-primary-foreground/60 border-primary-foreground/20"
            : "text-muted-foreground border-border/50"
        }`}>
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
          })}
        </div>
      </div>
    </div>
  );
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Fetch suggestions
  const { data: suggestions = [] } = useQuery<Suggestion[]>({
    queryKey: ["/api/ai/suggestions"],
  });

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async (userMessages: { role: string; content: string }[]) => {
      const res = await apiRequest("POST", "/api/ai/chat", { messages: userMessages });
      return res.json();
    },
    onSuccess: (data) => {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: data.response, timestamp: new Date() },
      ]);
    },
    onError: (error: any) => {
      toast({ title: "Failed to get response", description: error.message, variant: "destructive" });
      // Remove the loading state by adding error message
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again.", timestamp: new Date() },
      ]);
    },
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatMutation.isPending]);

  const sendMessage = (text: string) => {
    if (!text.trim() || chatMutation.isPending) return;

    const userMessage: Message = { role: "user", content: text.trim(), timestamp: new Date() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");

    // Send only the message content to the API
    const apiMessages = updatedMessages.map(m => ({ role: m.role, content: m.content }));
    chatMutation.mutate(apiMessages);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <FeatureGate
      feature="ai_assistant"
      displayName="AI messages"
      bullets={[
        "Ask unlimited personalized questions about your money",
        "Get instant analysis tied to your real financial data",
        "Receive clear action steps to improve cash flow",
      ]}
    >
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-8 w-8" />
            AI Financial Assistant
            <HelpTooltip
              title="About the AI Assistant"
              content="Your personal finance advisor with access to your real financial data. Ask about spending patterns, request monthly summaries, get budget tips, or ask any question about your finances. Try the suggested prompts to get started."
            />
          </h1>
          <p className="text-muted-foreground mt-1">
            Ask questions about your finances, get insights, and receive personalized advice
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={clearChat} className="gap-1" data-testid="button-clear-chat">
            <Trash2 className="h-4 w-4" />
            Clear Chat
          </Button>
        )}
      </div>

      {/* Chat Area */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-6 animate-in fade-in-0 duration-500">
                {/* Animated icon */}
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-500/30 to-teal-500/30 blur-xl animate-pulse" />
                  <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg">
                    <Sparkles className="h-10 w-10 text-white" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                    How can I help with your finances?
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                    I have access to your bills, expenses, income, bank accounts, and savings goals.
                    Ask me anything about your financial situation.
                  </p>
                </div>

                {/* Suggested Prompts */}
                <div className="grid gap-3 grid-cols-2 max-w-lg w-full">
                  {suggestions.slice(0, 6).map((suggestion, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="text-xs h-auto py-3 px-4 text-left justify-start hover:bg-primary/5 hover:border-primary/30 transition-all duration-200 group"
                      onClick={() => sendMessage(suggestion.prompt)}
                      data-testid={`button-suggestion-${i}`}
                    >
                      <Sparkles className="h-3 w-3 mr-2 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                      {suggestion.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <MessageBubble key={i} message={msg} />
                ))}
                {chatMutation.isPending && (
                  <div className="flex gap-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                    <div className="flex-shrink-0 h-9 w-9 rounded-full bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-sm">
                      <Sparkles className="h-4 w-4 text-white animate-pulse" />
                    </div>
                    <div className="bg-card border border-border/50 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-medium text-primary">AI Assistant</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <div className="flex gap-1">
                          <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span>Analyzing your finances...</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Suggestions when in conversation */}
          {messages.length > 0 && !chatMutation.isPending && (
            <div className="px-4 pb-2">
              <ScrollArea className="w-full">
                <div className="flex gap-2 pb-2">
                  {suggestions.map((suggestion, i) => (
                    <Button
                      key={i}
                      variant="ghost"
                      size="sm"
                      className="text-xs whitespace-nowrap h-7 px-2 bg-muted/50"
                      onClick={() => sendMessage(suggestion.prompt)}
                    >
                      {suggestion.label}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Input Area */}
          <div className="border-t p-4">
            <div className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your finances..."
                className="min-h-[44px] max-h-[120px] resize-none"
                rows={1}
                disabled={chatMutation.isPending}
                data-testid="input-ai-message"
              />
              <Button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || chatMutation.isPending}
                size="icon"
                className="h-[44px] w-[44px] flex-shrink-0"
                data-testid="button-send-ai-message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
    </FeatureGate>
  );
}
