import { useState, useEffect } from "react";
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
  Loader2,
  FileText,
  DollarSign,
  TrendingDown,
  Info,
  BookOpen,
  RefreshCw,
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
        title: "Standard vs. Itemized Deductions",
        body: "For 2024, the standard deduction is $14,600 (single) or $29,200 (married filing jointly). Itemize only if your deductions exceed these amounts.",
      },
      {
        title: "Business Meals (50% Rule)",
        body: "Only 50% of qualifying business meal expenses are deductible. Keep receipts and note the business purpose.",
      },
      {
        title: "Home Office Deduction",
        body: "Must be used regularly and exclusively for business. You can use the simplified method ($5/sq ft, max 300 sq ft) or actual expense method.",
      },
      {
        title: "Medical Expense Threshold",
        body: "Only medical expenses exceeding 7.5% of your Adjusted Gross Income (AGI) are deductible on Schedule A.",
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
        title: "T2200 – Employment Expenses",
        body: "Employees must have a signed T2200 from their employer to claim home office or vehicle expenses. The flat-rate method allows $2/day (max $500) without T2200.",
      },
      {
        title: "Business Meals (50% Rule)",
        body: "CRA allows only 50% of meal and entertainment expenses for business purposes. Keep all receipts and document the business purpose.",
      },
      {
        title: "Medical Expense Tax Credit",
        body: "You can claim eligible medical expenses exceeding the lesser of 3% of your net income or $2,635 (2024). Claim the lower-income spouse's expenses for maximum benefit.",
      },
      {
        title: "RRSP Deduction",
        body: "RRSP contributions reduce your taxable income dollar-for-dollar. Your contribution room is 18% of prior year earned income (max $31,560 for 2024).",
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

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const { data: allExpenses = [] } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
  });

  // Filter to tax-deductible expenses for the selected year
  const taxExpenses = allExpenses.filter((e) => {
    const isDeductible = e.taxDeductible === "true" || e.taxDeductible === true as any;
    const expYear = e.date ? parseInt(e.date.substring(0, 4)) : 0;
    return isDeductible && expYear === taxYear;
  });

  const totalDeductible = taxExpenses.reduce(
    (sum, e) => sum + parseFloat(e.amount as string || "0"),
    0
  );

  const estimatedSavings = (totalDeductible * marginalRate) / 100;

  // Category breakdown
  const categoryTotals: Record<string, number> = {};
  taxExpenses.forEach((e) => {
    const cat = e.taxCategory || "other_deductible";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(e.amount as string || "0");
  });

  const sortedCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  // ─── AI Functions ───────────────────────────────────────────────────────────

  const generateProactiveInsight = async () => {
    if (taxExpenses.length === 0) return;
    setInsightLoading(true);
    try {
      const summary = `${taxExpenses.length} deductible expenses totaling $${totalDeductible.toFixed(2)} for tax year ${taxYear}. Top categories: ${sortedCategories.slice(0, 3).map(([cat, amt]) => `${cat} ($${amt.toFixed(0)})`).join(", ")}.`;
      const res = await apiRequest("POST", "/api/tax/ai-assistant", {
        country,
        taxYear,
        question: `Based on this expense summary, give me 2-3 brief tax organization tips: ${summary}`,
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

  useEffect(() => {
    if (taxExpenses.length > 0 && !proactiveInsight) {
      generateProactiveInsight();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxYear, country, taxExpenses.length]);

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
        messages: newMessages.slice(-6), // last 6 messages for context
      });
      const data = await res.json();
      setMessages([
        ...newMessages,
        { role: "assistant", content: data.response || "I couldn't generate a response." },
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
      parseFloat(e.amount as string || "0").toFixed(2),
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

    toast({ title: "CSV Downloaded", description: `${taxExpenses.length} deductible expenses exported.` });
  };

  // ─── Disclaimer Accept ──────────────────────────────────────────────────────

  const acceptDisclaimer = () => {
    localStorage.setItem("taxsmart-disclaimer-v1", "accepted");
    setShowDisclaimer(false);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Disclaimer Modal */}
      <Dialog open={showDisclaimer} onOpenChange={() => {}}>
        <DialogContent className="max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              Important Disclaimer
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-3">
            <p className="font-medium text-foreground">TaxSmart AI is an educational tool only.</p>
            <p>{config.disclaimer}</p>
            <p className="font-medium text-foreground">
              By continuing, you acknowledge that this tool does not replace professional tax advice.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={acceptDisclaimer} className="w-full">
              I Understand – Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">TaxSmart AI</h1>
            <Badge variant="secondary" className="text-xs">Pro</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Organize tax-deductible expenses &amp; get AI-powered tax education
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Country Selector */}
          <Select value={country} onValueChange={(v) => setCountry(v as Country)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="US">🇺🇸 United States</SelectItem>
              <SelectItem value="CA">🇨🇦 Canada</SelectItem>
            </SelectContent>
          </Select>

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

          <Button variant="outline" size="sm" onClick={downloadCSV} disabled={taxExpenses.length === 0}>
            <Download className="w-4 h-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Disclaimer Banner */}
      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          <strong>Educational tool only.</strong> TaxSmart AI does not provide tax advice. Always consult a licensed tax professional for your specific situation.
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Deductible</p>
                <p className="text-2xl font-bold">
                  {config.currency === "CAD" ? "CA" : ""}${totalDeductible.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Deductible Expenses</p>
                <p className="text-2xl font-bold">{taxExpenses.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <TrendingDown className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Est. Tax Savings
                  <span className="ml-1 text-xs">
                    (
                    <input
                      type="number"
                      value={marginalRate}
                      onChange={(e) => setMarginalRate(Math.min(60, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-8 text-center bg-transparent border-b border-muted-foreground/40 focus:outline-none"
                      min={0}
                      max={60}
                    />
                    % rate)
                  </span>
                </p>
                <p className="text-2xl font-bold text-purple-600">
                  {config.currency === "CAD" ? "CA" : ""}${estimatedSavings.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Chat */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-primary" />
              Ask TaxSmart AI
              <Badge variant="outline" className="text-xs ml-auto">{config.name}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 flex-1">
            {/* Proactive Insight */}
            {(proactiveInsight || insightLoading) && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm">
                <div className="flex items-center gap-1 text-primary font-medium mb-1">
                  <Sparkles className="w-3 h-3" />
                  AI Insight
                  {insightLoading && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                </div>
                {insightLoading ? (
                  <p className="text-muted-foreground">Analyzing your expenses...</p>
                ) : (
                  <p className="text-muted-foreground">{proactiveInsight}</p>
                )}
              </div>
            )}

            {/* Quick Questions */}
            <div className="flex flex-wrap gap-1">
              {config.quickQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => handleQuestion(q)}
                  className="text-xs px-2 py-1 bg-muted hover:bg-muted/80 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  disabled={isLoading}
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Chat Messages */}
            <div className="flex-1 min-h-[200px] max-h-[300px] overflow-y-auto space-y-3 border rounded-lg p-3 bg-muted/20">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Ask a question about {country === "US" ? "IRS" : "CRA"} tax deductions above, or click a quick question.
                </p>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background border text-foreground"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-background border rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Thinking...
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
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
              <Button size="sm" onClick={() => handleQuestion()} disabled={isLoading || !question.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>

            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="w-3 h-3" />
              Educational only. Not tax advice. Consult a tax professional.
            </p>
          </CardContent>
        </Card>

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
                  const label = (config.categoryLabels as Record<string, string>)[cat] || cat;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium">
                          ${amt.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <span className="text-muted-foreground ml-1 text-xs">({pct.toFixed(0)}%)</span>
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
      </div>

      {/* Expense Table */}
      {taxExpenses.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Tax-Deductible Expenses – {taxYear}
              </CardTitle>
              <Badge variant="outline">{taxExpenses.length} expenses</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Tax Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Business</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxExpenses
                    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                    .slice(0, 50)
                    .map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {expense.date
                            ? format(parseISO(expense.date), "MMM d, yyyy")
                            : "—"}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {expense.merchant}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {expense.category}
                        </TableCell>
                        <TableCell className="text-sm">
                          {expense.taxCategory ? (
                            <Badge variant="secondary" className="text-xs">
                              {(config.categoryLabels as Record<string, string>)[expense.taxCategory] || expense.taxCategory}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          ${parseFloat(expense.amount as string || "0").toLocaleString("en", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell>
                          {expense.isBusinessExpense === "true" ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-muted-foreground/40" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
              {taxExpenses.length > 50 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Showing 50 of {taxExpenses.length} expenses. Export CSV for full list.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tax Guidance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="w-4 h-4" />
            {config.name} Tax Guidance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {config.guidance.map((g) => (
              <div
                key={g.title}
                className="p-4 border rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors"
              >
                <h4 className="font-semibold text-sm mb-1">{g.title}</h4>
                <p className="text-sm text-muted-foreground">{g.body}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Footer Disclaimer */}
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
