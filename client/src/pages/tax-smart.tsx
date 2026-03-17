import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  Sparkles,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Send,
  Download,
  FileText,
  DollarSign,
  TrendingDown,
  Info,
  BookOpen,
  Briefcase,
  ExternalLink,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Expense } from "@shared/schema";

// ─── Tax Config ────────────────────────────────────────────────────────────────

const TAXSMART_CONFIG = {
  US: {
    name: "United States (IRS)",
    currency: "USD",
    categories: [
      "business_expense",
      "home_office",
      "medical",
      "charitable",
      "education",
      "business_travel",
      "business_meals",
      "vehicle_expense",
      "professional_services",
      "office_supplies",
      "other_deductible",
    ],
    categoryLabels: {
      business_expense: "Business Expense",
      home_office: "Home Office",
      medical: "Medical & Dental",
      charitable: "Charitable Donations",
      education: "Education",
      business_travel: "Business Travel",
      business_meals: "Business Meals (50%)",
      vehicle_expense: "Vehicle / Mileage",
      professional_services: "Professional Services",
      office_supplies: "Office Supplies",
      other_deductible: "Other Deductible",
    },
    quickQuestions: [
      "What home office expenses can I deduct?",
      "How do I calculate the standard mileage rate?",
      "What medical expenses are deductible?",
      "Can I deduct my home internet for work?",
      "What records do I need for charitable donations?",
    ],
    systemContext: `You are TaxSmart AI, a tax education assistant for US taxpayers. 
You help users understand IRS tax deduction concepts and organize their tax-deductible expenses. 
You are NOT a licensed tax professional and do NOT provide personalized tax advice.
Always remind users to consult a CPA or tax professional for their specific situation.
Focus on: Schedule C (self-employment), Schedule A (itemized deductions), home office deduction, 
business mileage, medical expense threshold (7.5% of AGI), charitable contribution limits, 
education credits (American Opportunity, Lifetime Learning), and standard vs itemized deductions.
Keep responses concise (3-5 sentences) and always include a disclaimer to consult a tax professional.`,
    guidance: [
      {
        title: "Schedule C — Self-Employment",
        body: "Report self-employment income and deductible business expenses on Schedule C of Form 1040.",
        link: "https://www.irs.gov/forms-pubs/about-schedule-c-form-1040",
        warning: false,
      },
      {
        title: "Home Office Deduction (Form 8829)",
        body: "Space used regularly and exclusively for business may qualify. Calculate as % of home square footage.",
        link: "https://www.irs.gov/businesses/small-businesses-self-employed/home-office-deduction",
        warning: false,
      },
      {
        title: "Quarterly Estimated Taxes",
        body: "Self-employed? Pay quarterly: April 15, June 15, September 15, January 15.",
        link: null,
        warning: true,
      },
      {
        title: "Meals — 50% Rule",
        body: "Only 50% of qualifying business meals deductible. Document the business purpose for each receipt.",
        link: null,
        warning: true,
      },
      {
        title: "Keep Records 3–7 Years",
        body: "IRS generally audits within 3 years. Keep records 7 years for bad debt or worthless securities.",
        link: null,
        warning: false,
      },
      {
        title: "Self-Employment Tax",
        body: "SE tax is 15.3% on net earnings. You can deduct half on your Form 1040.",
        link: null,
        warning: false,
      },
    ],
    disclaimer: `IMPORTANT DISCLAIMER: TaxSmart AI is an educational tool only. It does NOT provide personalized tax advice, legal advice, or accounting services. The information provided is for general educational purposes about US (IRS) tax concepts only. Tax laws change frequently and your individual situation may differ. Always consult a licensed CPA, Enrolled Agent, or tax attorney for advice specific to your situation. BudgetSmart AI is not responsible for any tax decisions made based on this tool.`,
  },
  CA: {
    name: "Canada (CRA)",
    currency: "CAD",
    categories: [
      "business_expense",
      "home_office",
      "medical",
      "charitable",
      "education",
      "business_travel",
      "business_meals",
      "vehicle_expense",
      "professional_services",
      "office_supplies",
      "other_deductible",
    ],
    categoryLabels: {
      business_expense: "Business Expense",
      home_office: "Home Office (T2200)",
      medical: "Medical Expenses",
      charitable: "Charitable Donations",
      education: "Tuition / Education",
      business_travel: "Business Travel",
      business_meals: "Business Meals (50%)",
      vehicle_expense: "Vehicle Expenses",
      professional_services: "Professional Services",
      office_supplies: "Office Supplies",
      other_deductible: "Other Deductible",
    },
    quickQuestions: [
      "What is the T2200 form and when do I need it?",
      "How do I claim home office expenses as an employee?",
      "What medical expenses qualify for the CRA medical credit?",
      "How does the RRSP deduction work?",
      "What vehicle expenses can I deduct for business?",
    ],
    systemContext: `You are TaxSmart AI, a tax education assistant for Canadian taxpayers. 
You help users understand CRA tax deduction concepts and organize their tax-deductible expenses. 
You are NOT a licensed tax professional and do NOT provide personalized tax advice.
Always remind users to consult a CPA or tax professional for their specific situation.
Focus on: T2200 (employment expenses), T2125 (self-employment), home office deduction (detailed vs flat rate), 
CRA medical expense tax credit (3% of net income threshold), charitable donation tax credit, 
RRSP/TFSA/FHSA contributions, vehicle log requirements, GST/HST input tax credits for self-employed.
Keep responses concise (3-5 sentences) and always include a disclaimer to consult a tax professional.`,
    guidance: [
      {
        title: "T2125 — Self-Employment Income",
        body: "Report business or professional income and expenses on Form T2125. Attach to your T1 personal tax return.",
        link: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t2125.html",
        warning: false,
      },
      {
        title: "T777 — Employment Expenses",
        body: "Employees with a signed T2200 can claim home office, vehicle, and other employment expenses on T777.",
        link: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t777.html",
        warning: false,
      },
      {
        title: "Business Meals (50% Rule)",
        body: "CRA allows only 50% of meal and entertainment expenses for business purposes. Keep all receipts and document the business purpose.",
        link: null,
        warning: true,
      },
      {
        title: "Medical Expense Tax Credit",
        body: "You can claim eligible medical expenses exceeding the lesser of 3% of your net income or $2,635 (2024). Claim the lower-income spouse's expenses for maximum benefit.",
        link: null,
        warning: false,
      },
      {
        title: "RRSP Deduction",
        body: "RRSP contributions reduce your taxable income dollar-for-dollar. Your contribution room is 18% of prior year earned income (max $31,560 for 2024).",
        link: null,
        warning: false,
      },
      {
        title: "HST Input Tax Credits",
        body: "Self-employed individuals registered for GST/HST can claim input tax credits (ITCs) to recover GST/HST paid on business expenses.",
        link: null,
        warning: false,
      },
      {
        title: "Vehicle — Keep a Logbook",
        body: "CRA requires a mileage logbook to claim vehicle expenses. Record date, destination, purpose, and km for every business trip.",
        link: null,
        warning: true,
      },
      {
        title: "Keep Records 6 Years",
        body: "CRA requires you to keep all tax records and supporting documents for at least 6 years from the end of the tax year they relate to.",
        link: null,
        warning: false,
      },
    ],
    disclaimer: `IMPORTANT DISCLAIMER: TaxSmart AI is an educational tool only. It does NOT provide personalized tax advice, legal advice, or accounting services. The information provided is for general educational purposes about Canadian (CRA) tax concepts only. Tax laws change frequently and your individual situation may differ. Always consult a licensed CPA, CGA, or tax professional for advice specific to your situation. BudgetSmart AI is not responsible for any tax decisions made based on this tool.`,
  },
};

// ─── Types ─────────────────────────────────────────────────────────────────────

type Country = "US" | "CA";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function TaxSmartPage() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // State
  const [country, setCountry] = useState<Country>(() => {
    return (localStorage.getItem("taxsmart-country") as Country) || "US";
  });
  const [taxYear, setTaxYear] = useState(currentYear - 1);
  const [marginalRate, setMarginalRate] = useState<number>(30);
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    return !localStorage.getItem("taxsmart-disclaimer-v1");
  });
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [proactiveInsight, setProactiveInsight] = useState<string>("");
  const [insightLoading, setInsightLoading] = useState(false);

  const config = TAXSMART_CONFIG[country];

  // Persist country preference
  useEffect(() => {
    localStorage.setItem("taxsmart-country", country);
  }, [country]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const { data: allExpenses = [] } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
  });

  // Filter to tax-deductible expenses for the selected year
  const taxExpenses = allExpenses.filter((e) => {
    const isDeductible = e.taxDeductible === "true" || (e.taxDeductible as any) === true;
    const expYear = e.date ? parseInt(e.date.substring(0, 4)) : 0;
    return isDeductible && expYear === taxYear;
  });

  const totalDeductible = taxExpenses.reduce(
    (sum, e) => sum + parseFloat((e.amount as string) || "0"),
    0
  );

  const businessExpenses = taxExpenses.filter(
    (e) => e.isBusinessExpense === "true" || (e.isBusinessExpense as any) === true
  );
  const totalBusiness = businessExpenses.reduce(
    (sum, e) => sum + parseFloat((e.amount as string) || "0"),
    0
  );

  const estimatedSavings = (totalDeductible * marginalRate) / 100;

  // Category breakdown
  const categoryTotals: Record<string, number> = {};
  taxExpenses.forEach((e) => {
    const cat = e.taxCategory || "other_deductible";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat((e.amount as string) || "0");
  });

  const sortedCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  // ─── AI Functions ───────────────────────────────────────────────────────────

  const generateProactiveInsight = async () => {
    setInsightLoading(true);
    setProactiveInsight("");
    try {
      const summary =
        taxExpenses.length > 0
          ? `${taxExpenses.length} deductible expenses totaling $${totalDeductible.toFixed(2)} for tax year ${taxYear}. Top categories: ${sortedCategories
              .slice(0, 3)
              .map(([cat, amt]) => `${cat} ($${amt.toFixed(0)})`)
              .join(", ")}.`
          : `No deductible expenses found for tax year ${taxYear}.`;

      const res = await apiRequest("POST", "/api/tax/ai-assistant", {
        country,
        taxYear,
        question: `Look at my expense data and give me 2-3 specific observations about expenses that might be worth discussing with my accountant. Reference specific merchant names and amounts if available. Keep it under 70 words. Data: ${summary}`,
        isProactive: true,
      });
      const data = await res.json();
      setProactiveInsight(data.response || "");
    } catch {
      // Silently fail for proactive insights
    } finally {
      setInsightLoading(false);
    }
  };

  // Regenerate when country or taxYear changes
  useEffect(() => {
    generateProactiveInsight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxYear, country]);

  const handleQuestion = async (q?: string) => {
    const userQuestion = q || question;
    if (!userQuestion.trim()) return;

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: userQuestion },
    ];
    setMessages(newMessages);
    setQuestion("");
    setIsLoading(true);

    try {
      const res = await apiRequest("POST", "/api/tax/ai-assistant", {
        country,
        taxYear,
        question: userQuestion,
        messages: newMessages.slice(-6),
      });
      const data = await res.json();
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: data.response || "I couldn't generate a response.",
        },
      ]);
    } catch (err: any) {
      toast({
        title: "AI Error",
        description: err.message || "Failed to get AI response",
        variant: "destructive",
      });
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── CSV Download ───────────────────────────────────────────────────────────

  const downloadCSV = () => {
    const disclaimerRows = [
      `"DISCLAIMER: This export is for organizational purposes only. Not tax advice. Consult a licensed tax professional."`,
      `"Generated by BudgetSmart AI TaxSmart - Tax Year ${taxYear} - ${config.name}"`,
      `""`,
    ];

    const headers = ["Date", "Merchant", "Amount", "Category", "Tax Category", "Notes"];
    const rows = taxExpenses.map((e) => [
      e.date,
      `"${(e.merchant || "").replace(/"/g, '""')}"`,
      parseFloat((e.amount as string) || "0").toFixed(2),
      `"${e.category || ""}"`,
      `"${e.taxCategory || ""}"`,
      `"${(e.notes || "").replace(/"/g, '""')}"`,
    ]);

    const csv = [
      ...disclaimerRows,
      headers.join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `taxsmart-${country}-${taxYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "CSV Downloaded",
      description: `${taxExpenses.length} deductible expenses exported.`,
    });
  };

  // ─── Disclaimer Accept ──────────────────────────────────────────────────────

  const acceptDisclaimer = () => {
    localStorage.setItem("taxsmart-disclaimer-v1", "accepted");
    setShowDisclaimer(false);
  };

  const currencyPrefix = country === "CA" ? "CA$" : "$";

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ── Disclaimer Modal ── */}
      <Dialog open={showDisclaimer} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-lg"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Before you continue
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {/* What it helps with */}
            <div>
              <p className="font-semibold text-foreground mb-2">TaxSmart AI helps you:</p>
              <ul className="space-y-1.5">
                {[
                  "Organize and categorize tax-related expenses",
                  "Understand general US and Canadian tax concepts",
                  "Prepare summaries for your accountant",
                  "Estimate potential deductions to discuss with CPA",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-muted-foreground">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* What it does NOT do */}
            <div>
              <p className="font-semibold text-foreground mb-2">It does NOT:</p>
              <ul className="space-y-1.5">
                {[
                  "Provide professional tax advice",
                  "Prepare or file tax returns",
                  "Replace a qualified CPA or tax professional",
                  "Guarantee accuracy of any estimates",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-muted-foreground">
                    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Amber info box */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                Tax laws change frequently and your individual situation may differ. Always consult
                a licensed CPA, Enrolled Agent, or tax attorney for advice specific to your
                situation.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={acceptDisclaimer} className="w-full">
              I understand — Continue to TaxSmart AI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">TaxSmart AI</h1>
            <Badge variant="secondary" className="text-xs">
              Pro
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Organize tax-deductible expenses &amp; get AI-powered tax education
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Country Toggle */}
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
            <button
              onClick={() => setCountry("US")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                country === "US"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              🇺🇸 United States
            </button>
            <button
              onClick={() => setCountry("CA")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                country === "CA"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              🇨🇦 Canada
            </button>
          </div>

          {/* Tax Year Selector */}
          <Select value={String(taxYear)} onValueChange={(v) => setTaxYear(parseInt(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear - 2, currentYear - 3].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={downloadCSV}
            disabled={taxExpenses.length === 0}
          >
            <Download className="w-4 h-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* ── Disclaimer Banner ── */}
      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          <strong>Educational tool only.</strong> TaxSmart AI does not provide tax advice. Always
          consult a licensed tax professional for your specific situation.
        </span>
      </div>

      {/* ── FIX 1: AI Chat Section — FULL WIDTH, above summary cards ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            Ask TaxSmart AI
            <Badge variant="outline" className="text-xs ml-auto">
              {config.name}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* FIX 2: Proactive Insight */}
          {insightLoading ? (
            <div className="mb-4 p-3.5 rounded-lg bg-background/60 border border-border/50 text-sm text-foreground/80 leading-relaxed">
              <div className="flex items-center gap-2">
                <Sparkles size={13} className="text-primary shrink-0" />
                <div className="flex gap-1">
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          ) : proactiveInsight ? (
            <div className="mb-4 p-3.5 rounded-lg bg-background/60 border border-border/50 text-sm text-foreground/80 leading-relaxed">
              <div className="flex items-start gap-2">
                <Sparkles size={13} className="text-primary shrink-0 mt-0.5" />
                <p>{proactiveInsight}</p>
              </div>
            </div>
          ) : null}

          {/* FIX 9: Chat Message Bubbles */}
          <div className="min-h-[180px] max-h-[320px] overflow-y-auto space-y-3 border rounded-lg p-3 bg-muted/20">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Ask a question about {country === "US" ? "IRS" : "CRA"} tax deductions below, or
                click a quick question.
              </p>
            ) : (
              messages.map((msg, i) => (
                <div key={i}>
                  <div
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                        <Sparkles size={12} className="text-primary" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background border text-foreground"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                  {msg.role === "assistant" && (
                    <p className="text-xs text-muted-foreground/50 mt-1 ml-8">
                      General information only — not tax advice
                    </p>
                  )}
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                  <Sparkles size={12} className="text-primary" />
                </div>
                <div className="bg-background border rounded-lg px-3 py-2 text-sm flex items-center gap-1.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Row */}
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleQuestion()}
              placeholder={`Ask about ${country === "US" ? "IRS" : "CRA"} deductions...`}
              className="flex-1 text-sm px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={isLoading}
            />
            <Button
              size="sm"
              onClick={() => handleQuestion()}
              disabled={isLoading || !question.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          {/* FIX 8: Quick Questions as horizontal chips BELOW input */}
          <div className="flex flex-wrap gap-2 mt-1">
            {config.quickQuestions.map((q) => (
              <button
                key={q}
                onClick={() => handleQuestion(q)}
                disabled={isLoading}
                className="text-xs px-3 py-1.5 rounded-full border border-border bg-background/60 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>

          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="w-3 h-3" />
            Educational only. Not tax advice. Consult a tax professional.
          </p>
        </CardContent>
      </Card>

      {/* ── FIX 5: 4 Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Deductible */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Deductible</p>
                <p className="text-2xl font-bold">
                  {currencyPrefix}
                  {totalDeductible.toLocaleString("en", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className="text-xs text-muted-foreground">Tax year {taxYear}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Business Expenses */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Briefcase className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Business Expenses</p>
                <p className="text-2xl font-bold text-blue-600">
                  {currencyPrefix}
                  {totalBusiness.toLocaleString("en", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className="text-xs text-muted-foreground">Marked as business expense</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Deductible Expenses count */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Deductible Expenses</p>
                <p className="text-2xl font-bold text-purple-600">{taxExpenses.length}</p>
                <p className="text-xs text-muted-foreground">Tagged transactions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Est. Tax Savings */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <TrendingDown className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Est. Tax Savings</p>
                <p className="text-2xl font-bold text-amber-600">
                  {currencyPrefix}
                  {estimatedSavings.toLocaleString("en", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className="text-xs text-muted-foreground">At {marginalRate}% marginal rate</p>
              </div>
            </div>
            {/* FIX 6: Marginal Rate Adjuster */}
            <div className="flex items-center justify-end gap-2 mt-2 text-xs text-muted-foreground">
              <span>Adjust rate:</span>
              <input
                type="number"
                min={1}
                max={60}
                value={Math.round(marginalRate)}
                onChange={(e) =>
                  setMarginalRate(
                    Math.min(60, Math.max(1, parseInt(e.target.value) || 1))
                  )
                }
                className="w-14 text-center border border-border rounded px-2 py-1 bg-background text-xs"
              />
              <span>%</span>
              <span className="text-muted-foreground/50 text-xs">(estimate only)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Expense Breakdown + Table ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Expense Breakdown by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {sortedCategories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No tax-deductible expenses found for {taxYear}.</p>
                <p className="mt-1">Tag expenses as tax-deductible in the Expenses page.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedCategories.map(([cat, amt]) => {
                  const pct = totalDeductible > 0 ? (amt / totalDeductible) * 100 : 0;
                  const label =
                    (config.categoryLabels as Record<string, string>)[cat] || cat;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium">
                          {currencyPrefix}
                          {amt.toLocaleString("en", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          <span className="text-muted-foreground ml-1 text-xs">
                            ({pct.toFixed(0)}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expense Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Tax-Deductible Expenses — {taxYear}
              </CardTitle>
              <Badge variant="outline">{taxExpenses.length} expenses</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {taxExpenses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No deductible expenses for {taxYear}.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Tax Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Biz</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taxExpenses
                      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                      .slice(0, 30)
                      .map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {expense.date
                              ? format(parseISO(expense.date), "MMM d")
                              : "—"}
                          </TableCell>
                          <TableCell className="font-medium text-sm max-w-[120px] truncate">
                            {expense.merchant}
                          </TableCell>
                          <TableCell className="text-xs">
                            {expense.taxCategory ? (
                              <Badge variant="secondary" className="text-xs">
                                {(config.categoryLabels as Record<string, string>)[
                                  expense.taxCategory
                                ] || expense.taxCategory}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium text-sm">
                            {currencyPrefix}
                            {parseFloat((expense.amount as string) || "0").toLocaleString(
                              "en",
                              { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                            )}
                          </TableCell>
                          <TableCell>
                            {expense.isBusinessExpense === "true" ||
                            (expense.isBusinessExpense as any) === true ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-muted-foreground/40" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                {taxExpenses.length > 30 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Showing 30 of {taxExpenses.length} expenses. Export CSV for full list.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── FIX 7: Tax Guidance (US or CA) ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="w-4 h-4" />
            {country === "US" ? "United States (IRS) Tax Guidance" : "Canada (CRA) Tax Guidance"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {config.guidance.map((g) => (
              <div
                key={g.title}
                className="p-4 border rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="font-semibold text-sm flex items-center gap-1.5">
                    {g.warning && (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    )}
                    {g.title}
                  </h4>
                  {g.link && (
                    <a
                      href={g.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80 shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{g.body}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Footer Disclaimer ── */}
      <div className="p-4 border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 text-xs text-amber-700 dark:text-amber-300">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong>Full Disclaimer:</strong> {config.disclaimer}
          </div>
        </div>
      </div>
    </div>
  );
}
