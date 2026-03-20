import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  FileSearch,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
  Upload,
  Eye,
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
      "business_expense", "home_office", "medical", "charitable", "education",
      "business_travel", "business_meals", "vehicle_expense", "professional_services",
      "office_supplies", "other_deductible",
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
    taxAuthority: "IRS",
    taxAuthorityUrl: "https://www.irs.gov",
    disclaimer: `IMPORTANT DISCLAIMER: TaxSmart AI is an educational tool only. It does NOT provide personalized tax advice, legal advice, or accounting services. The information provided is for general educational purposes about US (IRS) tax concepts only. Tax laws change frequently and your individual situation may differ. Always consult a licensed CPA, Enrolled Agent, or tax attorney for advice specific to your situation. BudgetSmart AI is not responsible for any tax decisions made based on this tool.`,
  },
  CA: {
    name: "Canada (CRA)",
    currency: "CAD",
    categories: [
      "business_expense", "home_office", "medical", "charitable", "education",
      "business_travel", "business_meals", "vehicle_expense", "professional_services",
      "office_supplies", "other_deductible",
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
    taxAuthority: "CRA",
    taxAuthorityUrl: "https://www.canada.ca/en/revenue-agency.html",
    disclaimer: `IMPORTANT DISCLAIMER: TaxSmart AI is an educational tool only. It does NOT provide personalized tax advice, legal advice, or accounting services. The information provided is for general educational purposes about Canadian (CRA) tax concepts only. Tax laws change frequently and your individual situation may differ. Always consult a licensed CPA, CGA, or tax professional for advice specific to your situation. BudgetSmart AI is not responsible for any tax decisions made based on this tool.`,
  },
};

// ─── Types ─────────────────────────────────────────────────────────────────────

type Country = "US" | "CA";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface VaultTaxDocument {
  id: string;
  display_name: string;
  file_name: string;
  category: string;
  subcategory: string | null;
  ai_summary: string | null;
  extracted_data: Record<string, any> | string | null;
  tags: string[] | null;
  ai_processing_status: string;
  uploaded_at: string;
  file_type: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function TaxSmartPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // State
  const [country, setCountry] = useState<Country>(() => {
    return (localStorage.getItem("taxsmart-country") as Country) || "CA";
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

  // T4 / vault document state
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [docAnalysis, setDocAnalysis] = useState<Record<string, string>>({});
  const [analyzingDocId, setAnalyzingDocId] = useState<string | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [showAllDocs, setShowAllDocs] = useState(false);

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

  // Fetch vault tax documents (T4, W-2, etc.)
  const { data: vaultDocsData, isLoading: vaultDocsLoading, refetch: refetchVaultDocs } = useQuery<{
    success: boolean;
    data: VaultTaxDocument[];
  }>({
    queryKey: ["/api/tax/vault-documents"],
    staleTime: 30000,
  });

  const vaultTaxDocs = vaultDocsData?.data ?? [];

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

  // ─── T4 Document Analysis ───────────────────────────────────────────────────

  const analyzeDocument = async (docId: string) => {
    setAnalyzingDocId(docId);
    try {
      const res = await apiRequest("POST", "/api/tax/analyze-document", {
        documentId: docId,
        country,
        taxYear,
      });
      const data = await res.json();
      if (data.success) {
        setDocAnalysis((prev) => ({ ...prev, [docId]: data.analysis }));
        setExpandedDocId(docId);
        toast({
          title: "Document Analyzed",
          description: "AI analysis complete. Review the insights below.",
        });
      } else {
        throw new Error(data.error || "Analysis failed");
      }
    } catch (err: any) {
      toast({
        title: "Analysis Failed",
        description: err.message || "Could not analyze document",
        variant: "destructive",
      });
    } finally {
      setAnalyzingDocId(null);
    }
  };

  // Build T4 context for AI chat
  const buildT4Context = (): string => {
    if (vaultTaxDocs.length === 0) return "";

    const parts: string[] = [];
    for (const doc of vaultTaxDocs) {
      let docInfo = `\n[Tax Document: ${doc.display_name || doc.file_name}]`;
      if (doc.ai_summary) docInfo += `\nSummary: ${doc.ai_summary}`;
      if (doc.extracted_data) {
        try {
          const data = typeof doc.extracted_data === "string"
            ? JSON.parse(doc.extracted_data)
            : doc.extracted_data;
          const fields = Object.entries(data)
            .map(([k, v]) => `  ${k}: ${v}`)
            .join("\n");
          if (fields) docInfo += `\nExtracted data:\n${fields}`;
        } catch { /* ignore */ }
      }
      if (docAnalysis[doc.id]) {
        docInfo += `\nAI Analysis:\n${docAnalysis[doc.id]}`;
      }
      parts.push(docInfo);
    }
    return parts.length > 0
      ? `\n\nUser's uploaded tax documents:${parts.join("\n")}`
      : "";
  };

  // ─── AI Functions ───────────────────────────────────────────────────────────

  const generateProactiveInsight = async () => {
    setInsightLoading(true);
    setProactiveInsight("");
    try {
      const t4Context = buildT4Context();
      const summary =
        taxExpenses.length > 0
          ? `${taxExpenses.length} deductible expenses totaling $${totalDeductible.toFixed(2)} for tax year ${taxYear}. Top categories: ${sortedCategories
              .slice(0, 3)
              .map(([cat, amt]) => `${cat} ($${amt.toFixed(0)})`)
              .join(", ")}.`
          : `No deductible expenses found for tax year ${taxYear}.`;

      const questionText = vaultTaxDocs.length > 0
        ? `I have ${vaultTaxDocs.length} tax document(s) uploaded (${vaultTaxDocs.map(d => d.display_name || d.file_name).join(", ")}). ${t4Context ? "Based on my tax documents and expense data, give me 2-3 specific observations about my tax situation for ${taxYear}. Reference specific figures if available." : "Give me 2-3 specific observations about my expenses that might be worth discussing with my accountant."} Keep it under 80 words. Data: ${summary}`
        : `Look at my expense data and give me 2-3 specific observations about expenses that might be worth discussing with my accountant. Reference specific merchant names and amounts if available. Keep it under 70 words. Data: ${summary}`;

      const res = await apiRequest("POST", "/api/tax/ai-assistant", {
        country,
        taxYear,
        question: questionText,
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

  // Regenerate when country, taxYear, or vault docs change
  useEffect(() => {
    generateProactiveInsight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxYear, country, vaultTaxDocs.length]);

  const handleQuestion = async (q?: string) => {
    const userQuestion = q || question;
    if (!userQuestion.trim()) return;

    // Inject T4 context into the question if we have vault docs
    const t4Context = buildT4Context();
    const enrichedQuestion = t4Context
      ? `${userQuestion}\n\n[Context from my uploaded tax documents:${t4Context}]`
      : userQuestion;

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: userQuestion }, // Show clean question in UI
    ];
    setMessages(newMessages);
    setQuestion("");
    setIsLoading(true);

    try {
      const res = await apiRequest("POST", "/api/tax/ai-assistant", {
        country,
        taxYear,
        question: enrichedQuestion, // Send enriched question to AI
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

  // Helper: parse extracted data
  const parseExtractedData = (raw: any): Record<string, string> => {
    if (!raw) return {};
    try {
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      );
    } catch {
      return {};
    }
  };

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
            <div>
              <p className="font-semibold text-foreground mb-2">TaxSmart AI helps you:</p>
              <ul className="space-y-1.5">
                {[
                  "Organize and categorize tax-related expenses",
                  "Analyze uploaded T4/W-2 documents with AI",
                  "Understand general US and Canadian tax concepts",
                  "Prepare summaries for your accountant",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-muted-foreground">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

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
            <Badge variant="secondary" className="text-xs">Pro</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered tax guidance · Analyze T4/W-2 documents · Organize deductible expenses
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
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
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
      <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-500/15 bg-amber-500/5 text-xs">
        <AlertTriangle size={13} className="text-amber-500/70 shrink-0 mt-0.5" />
        <p className="text-muted-foreground/70">
          <span className="font-medium text-amber-600/80 dark:text-amber-400/80">Organizational tool only.</span>
          {' '}TaxSmart AI does not provide tax advice. Always consult a qualified tax professional before filing.{' '}
          <a href={config.taxAuthorityUrl} target="_blank" rel="noopener noreferrer" className="text-primary/70 hover:text-primary hover:underline transition-colors">
            {config.taxAuthority} →
          </a>
        </p>
      </div>

      {/* ── T4 / Tax Documents Section ── */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSearch className="w-4 h-4 text-primary" />
              Tax Documents from Financial Vault
              {vaultTaxDocs.length > 0 && (
                <Badge variant="default" className="text-xs ml-1">
                  {vaultTaxDocs.length} found
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchVaultDocs()}
                className="h-7 px-2 text-xs"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Refresh
              </Button>
              <a href="/vault" className="text-xs text-primary hover:underline flex items-center gap-1">
                <Upload className="w-3 h-3" />
                Upload T4 in Vault
              </a>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {vaultDocsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading tax documents from vault...
            </div>
          ) : vaultTaxDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-border rounded-lg">
              <FileText className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No tax documents found in your vault</p>
              <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm">
                Upload your T4, W-2, T4A, or other tax documents to the Financial Vault and TaxSmart AI will automatically detect and analyze them here.
              </p>
              <a href="/vault" className="mt-3">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  Go to Financial Vault
                </Button>
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              {(showAllDocs ? vaultTaxDocs : vaultTaxDocs.slice(0, 3)).map((doc) => {
                const extractedData = parseExtractedData(doc.extracted_data);
                const isExpanded = expandedDocId === doc.id;
                const hasAnalysis = !!docAnalysis[doc.id];
                const isAnalyzing = analyzingDocId === doc.id;

                return (
                  <div
                    key={doc.id}
                    className={`border rounded-lg overflow-hidden transition-all ${
                      isExpanded ? "border-primary/40 bg-primary/5" : "border-border bg-muted/20"
                    }`}
                  >
                    {/* Document Header */}
                    <div className="flex items-center gap-3 p-3">
                      <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {doc.display_name || doc.file_name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {doc.subcategory || doc.category}
                          </span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">
                            {doc.uploaded_at ? format(new Date(doc.uploaded_at), "MMM d, yyyy") : ""}
                          </span>
                          {doc.ai_processing_status === "completed" && (
                            <>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-xs text-green-600 flex items-center gap-0.5">
                                <CheckCircle className="w-3 h-3" />
                                AI processed
                              </span>
                            </>
                          )}
                          {doc.ai_processing_status === "pending" && (
                            <>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-xs text-amber-600 flex items-center gap-0.5">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Processing...
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!hasAnalysis ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => analyzeDocument(doc.id)}
                            disabled={isAnalyzing}
                            className="h-7 text-xs gap-1"
                          >
                            {isAnalyzing ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Analyzing...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3 h-3" />
                                Analyze with AI
                              </>
                            )}
                          </Button>
                        ) : (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Sparkles className="w-3 h-3" />
                            Analyzed
                          </Badge>
                        )}
                        <button
                          onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}
                          className="p-1 hover:bg-muted rounded"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="border-t border-border/50 p-3 space-y-3">
                        {/* AI Summary */}
                        {doc.ai_summary && (
                          <div className="p-3 bg-background rounded-lg border border-border/50">
                            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-primary" />
                              Vault AI Summary
                            </p>
                            <p className="text-sm text-foreground/80">{doc.ai_summary}</p>
                          </div>
                        )}

                        {/* Extracted Data */}
                        {Object.keys(extractedData).length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Extracted Data</p>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(extractedData).map(([key, value]) => (
                                <div key={key} className="flex flex-col p-2 bg-background rounded border border-border/50">
                                  <span className="text-xs text-muted-foreground capitalize">
                                    {key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}
                                  </span>
                                  <span className="text-sm font-medium">{value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* TaxSmart AI Analysis */}
                        {hasAnalysis && (
                          <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                            <p className="text-xs font-medium text-primary mb-2 flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              TaxSmart AI Analysis
                            </p>
                            <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                              {docAnalysis[doc.id]}
                            </div>
                          </div>
                        )}

                        {/* Ask about this document */}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs gap-1"
                            onClick={() => {
                              const q = `Based on my ${doc.display_name || doc.file_name}, what are the key tax implications and deductions I should discuss with my accountant for ${taxYear}?`;
                              handleQuestion(q);
                              // Scroll to chat
                              document.getElementById("taxsmart-chat")?.scrollIntoView({ behavior: "smooth" });
                            }}
                          >
                            <Sparkles className="w-3 h-3" />
                            Ask AI about this document
                          </Button>
                          <a href="/vault" target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="ghost" className="text-xs gap-1">
                              <Eye className="w-3 h-3" />
                              View in Vault
                            </Button>
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {vaultTaxDocs.length > 3 && (
                <button
                  onClick={() => setShowAllDocs(!showAllDocs)}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {showAllDocs ? (
                    <><ChevronUp className="w-3 h-3" /> Show less</>
                  ) : (
                    <><ChevronDown className="w-3 h-3" /> Show {vaultTaxDocs.length - 3} more documents</>
                  )}
                </button>
              )}

              {/* T4 context indicator */}
              {vaultTaxDocs.length > 0 && (
                <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
                  <p className="text-xs text-green-700 dark:text-green-400">
                    Your tax documents are loaded into TaxSmart AI. The AI chat below will use this data to provide personalized guidance.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── AI Chat Section ── */}
      <Card id="taxsmart-chat">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            Ask TaxSmart AI
            <Badge variant="outline" className="text-xs ml-auto">
              {config.name}
            </Badge>
            {vaultTaxDocs.length > 0 && (
              <Badge variant="secondary" className="text-xs gap-1">
                <FileText className="w-3 h-3" />
                {vaultTaxDocs.length} doc{vaultTaxDocs.length !== 1 ? "s" : ""} loaded
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Proactive Insight */}
          {insightLoading ? (
            <div className="mb-4 p-3.5 rounded-lg bg-background/60 border border-border/50 text-sm text-foreground/80 leading-relaxed">
              <div className="flex items-center gap-2">
                <Sparkles size={13} className="text-primary shrink-0" />
                <div className="flex gap-1">
                  {[0, 150, 300].map((delay) => (
                    <div
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
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

          {/* Chat Messages */}
          <div className="min-h-[180px] max-h-[320px] overflow-y-auto space-y-3 border rounded-lg p-3 bg-muted/20">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                <Sparkles className="w-8 h-8 text-primary/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  Ask a question about {country === "US" ? "IRS" : "CRA"} tax deductions below
                  {vaultTaxDocs.length > 0 && `, or ask about your uploaded ${vaultTaxDocs.map(d => d.subcategory || "tax document").join(", ")}`}.
                </p>
                {vaultTaxDocs.length > 0 && (
                  <p className="text-xs text-primary/60 mt-1">
                    ✓ Your tax documents are available to the AI
                  </p>
                )}
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i}>
                  <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
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
                  {[0, 150, 300].map((delay) => (
                    <div
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
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
              placeholder={
                vaultTaxDocs.length > 0
                  ? `Ask about your T4 or ${country === "US" ? "IRS" : "CRA"} deductions...`
                  : `Ask about ${country === "US" ? "IRS" : "CRA"} deductions...`
              }
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

          {/* Quick Questions */}
          <div className="flex flex-wrap gap-2 mt-1">
            {/* T4-specific quick questions if docs are loaded */}
            {vaultTaxDocs.length > 0 && country === "CA" && (
              <>
                <button
                  onClick={() => handleQuestion(`Based on my T4 for ${taxYear}, what is my estimated RRSP contribution room?`)}
                  disabled={isLoading}
                  className="text-xs px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                >
                  📄 RRSP room from my T4
                </button>
                <button
                  onClick={() => handleQuestion(`What deductions should I claim based on my T4 income for ${taxYear}?`)}
                  disabled={isLoading}
                  className="text-xs px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                >
                  📄 Deductions for my income
                </button>
              </>
            )}
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

      {/* ── 4 Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Deductible</p>
                <p className="text-2xl font-bold">
                  {currencyPrefix}{totalDeductible.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground">Tax year {taxYear}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Briefcase className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Business Expenses</p>
                <p className="text-2xl font-bold text-blue-600">
                  {currencyPrefix}{totalBusiness.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground">Marked as business expense</p>
              </div>
            </div>
          </CardContent>
        </Card>

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

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <TrendingDown className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Est. Tax Savings</p>
                <p className="text-2xl font-bold text-amber-600">
                  {currencyPrefix}{estimatedSavings.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground">At {marginalRate}% marginal rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Marginal Rate Adjuster */}
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>Adjust your marginal tax rate:</span>
        <input
          type="number"
          min={1}
          max={60}
          step={1}
          value={Math.round(marginalRate)}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            if (val >= 1 && val <= 60) setMarginalRate(val);
          }}
          className="w-16 text-center border border-border rounded px-2 py-1 bg-background text-xs"
        />
        <span>%</span>
        <span className="text-muted-foreground/40">(estimate only)</span>
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
                <p className="mt-1 text-xs">Tag expenses as tax-deductible in the Expenses page.</p>
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
                          {currencyPrefix}{amt.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

        {/* Expense Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Tax-Deductible Expenses — {taxYear}</CardTitle>
              <Badge variant="outline">{taxExpenses.length} expenses</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {taxExpenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText size={32} className="text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No deductible expenses for {taxYear}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Tag expenses as tax-deductible in the Expenses page to see them here
                </p>
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
                            {expense.date ? format(parseISO(expense.date), "MMM d") : "—"}
                          </TableCell>
                          <TableCell className="font-medium text-sm max-w-[120px] truncate">
                            {expense.merchant}
                          </TableCell>
                          <TableCell className="text-xs">
                            {expense.taxCategory ? (
                              <Badge variant="secondary" className="text-xs">
                                {(config.categoryLabels as Record<string, string>)[expense.taxCategory] || expense.taxCategory}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium text-sm">
                            {currencyPrefix}{parseFloat((expense.amount as string) || "0").toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>
                            {expense.isBusinessExpense === "true" || (expense.isBusinessExpense as any) === true ? (
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

      {/* ── Tax Guidance ── */}
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
                    {g.warning && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
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
      <div className="mt-8 pt-5 border-t border-border">
        <p className="text-xs text-muted-foreground/50 text-center leading-relaxed max-w-2xl mx-auto">
          <span className="font-medium">Disclaimer: </span>
          TaxSmart AI is an organizational tool, not tax software. All figures are estimates for general educational purposes only. Always consult a qualified CPA or tax professional before making any tax decisions or filing your return.{' '}
          <a href={config.taxAuthorityUrl} target="_blank" rel="noopener noreferrer" className="text-primary/60 hover:underline">
            Verify with {config.taxAuthority} ↗
          </a>
        </p>
      </div>
    </div>
  );
}
