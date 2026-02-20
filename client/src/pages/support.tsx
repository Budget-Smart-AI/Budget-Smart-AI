import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { HelpCircle, Loader2, Send, TicketCheck, Lightbulb, Bug, Clock, Mail, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const supportSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  type: z.enum(["ticket", "feature", "bug"], { required_error: "Please select a request type" }),
  subject: z.string().min(1, "Subject is required"),
  priority: z.enum(["low", "medium", "high"]).optional(),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

type SupportFormData = z.infer<typeof supportSchema>;

const requestTypes = [
  {
    id: "ticket" as const,
    title: "Support Ticket",
    description: "Get help with account issues, billing, or general questions",
    icon: TicketCheck,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
  },
  {
    id: "feature" as const,
    title: "Feature Request",
    description: "Suggest new features or improvements to Budget Smart AI",
    icon: Lightbulb,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
  },
  {
    id: "bug" as const,
    title: "Bug Report",
    description: "Report an issue or unexpected behavior in the application",
    icon: Bug,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
  },
];

export default function Support() {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<SupportFormData>({
    resolver: zodResolver(supportSchema),
    defaultValues: {
      name: "",
      email: "",
      type: undefined,
      subject: "",
      priority: "medium",
      message: "",
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (data: SupportFormData) => {
      const response = await apiRequest("POST", "/api/support", data);
      return response.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Submit",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleTypeSelect = (type: "ticket" | "feature" | "bug") => {
    setSelectedType(type);
    form.setValue("type", type);
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-6">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Request Submitted Successfully</h2>
          <p className="text-muted-foreground mb-2">
            Thank you for reaching out. Our support team has received your request.
          </p>
          <div className="inline-flex items-center gap-2 text-sm bg-muted/50 rounded-full px-4 py-2 mt-2 mb-6">
            <Clock className="h-4 w-4 text-primary" />
            <span>You can expect a response within <strong>2-4 hours</strong>, and no later than 24 hours.</span>
          </div>
          <div className="mt-4">
            <Button onClick={() => { setSubmitted(false); setSelectedType(null); }}>
              Submit Another Request
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 shadow-lg shadow-indigo-500/20">
            <HelpCircle className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Support Portal</h1>
            <p className="text-sm text-muted-foreground">How can we help you today?</p>
          </div>
        </div>
      </div>

      {/* Response Time Banner */}
      <Card className="mb-6 border-indigo-500/20 bg-gradient-to-r from-indigo-500/5 to-violet-500/5">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-500/10">
              <Clock className="h-5 w-5 text-indigo-500" />
            </div>
            <div>
              <p className="font-medium text-sm">Fast Response Guaranteed</p>
              <p className="text-sm text-muted-foreground">
                Our team typically responds within <strong className="text-foreground">2-4 hours</strong>. All requests are guaranteed a response within 24 hours.
              </p>
            </div>
            <div className="ml-auto hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>support@budgetsmart.io</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Request Type Selection */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        {requestTypes.map((type) => (
          <Card
            key={type.id}
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedType === type.id
                ? `ring-2 ring-primary ${type.bgColor}`
                : "hover:border-primary/30"
            }`}
            onClick={() => handleTypeSelect(type.id)}
          >
            <CardContent className="pt-6 text-center">
              <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${type.bgColor} mb-3`}>
                <type.icon className={`h-6 w-6 ${type.color}`} />
              </div>
              <h3 className="font-semibold mb-1">{type.title}</h3>
              <p className="text-xs text-muted-foreground">{type.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Support Form */}
      {selectedType && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {requestTypes.find(t => t.id === selectedType)?.icon && (() => {
                const Icon = requestTypes.find(t => t.id === selectedType)!.icon;
                return <Icon className="h-5 w-5" />;
              })()}
              {selectedType === "ticket" && "Submit a Support Ticket"}
              {selectedType === "feature" && "Submit a Feature Request"}
              {selectedType === "bug" && "Report a Bug"}
            </CardTitle>
            <CardDescription>
              {selectedType === "ticket" && "Describe your issue and we'll get back to you promptly."}
              {selectedType === "feature" && "Tell us about the feature you'd like to see in Budget Smart AI."}
              {selectedType === "bug" && "Help us improve by describing the issue you encountered."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => sendMutation.mutate(data))} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="John Doe" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" placeholder="john@example.com" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subject</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={
                              selectedType === "ticket" ? "Brief description of your issue" :
                              selectedType === "feature" ? "Feature name or summary" :
                              "What went wrong?"
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {selectedType === "bug" && (
                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priority</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select priority" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="low">Low - Minor inconvenience</SelectItem>
                              <SelectItem value="medium">Medium - Affects functionality</SelectItem>
                              <SelectItem value="high">High - Blocks usage</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {selectedType === "ticket" && "Describe your issue"}
                        {selectedType === "feature" && "Describe the feature"}
                        {selectedType === "bug" && "Steps to reproduce"}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder={
                            selectedType === "ticket" ? "Please provide as much detail as possible about your issue..." :
                            selectedType === "feature" ? "Describe what you'd like to see and how it would help you..." :
                            "1. Go to...\n2. Click on...\n3. Expected behavior vs actual behavior..."
                          }
                          rows={6}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Typical response: 2-4 hours
                  </p>
                  <Button type="submit" disabled={sendMutation.isPending}>
                    {sendMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Submit Request
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
