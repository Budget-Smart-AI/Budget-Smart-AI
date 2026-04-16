import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  ArrowUpDown,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// ─── Tax Config ────────────────────────────────────────────────────────────────

const MARGINAL_RATE_BRACKETS = {
  US: [
    { label: "10% — up to $11,925", rate: 10 },
    { label: "12% — $11,926–$48,475", rate: 12 },
    { label: "22% — $48,476–$103,350", rate: 22 },
    { label: "24% — $103,351–$197,300", rate: 24 },
    { label: "32% — $197,301–$250,525", rate: 32 },
    { label: "35% — $250,526–$626,350", rate: 35 },
    { label: "37% — $626,351+", rate: 37 },
  ],
  CA: [
    { label: "15% — up to $57,375 (Federal)", rate: 15 },
    { label: "20.5% — $57,376–$114,750 (Federal)", rate: 20.5 },
    { label: "26% — $114,751–$158,468 (Federal)", rate: 26 },
    { label: "29% — $158,469–$220,000 (Federal)", rate: 29 },
    { label: "33% — $220,001+ (Federal)", rate: 33 },
  ],
  UK: [
    { label: "20% — Basic Rate (£12,571–£50,270)", rate: 20 },
    { label: "40% — Higher Rate (£50,271–£125,140)", rate: 40 },
    { label: "45% — Additional Rate (£125,141+)", rate: 45 },
  ],
};

const TAXSMART_CONFIG = {
  US: {
    name: "United States (IRS)",
    currency: "USD",
    symbol: "$",
    locale: "en-US",
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
    quickQuestions: [
      "What home office expenses can I deduct?",
      "How do I calculate the standard mileage rate?",
      "What medical expenses are deductible?",
      "Can I deduct my home internet for work?",
      "What records do I need for charitable donations?",
    ],
    taxAuthority: "IRS",
    taxAuthorityUrl: "https://www.irs.gov",
  },
  CA: {
    name: "Canada (CRA)",
    currency: "CAD",
    symbol: "CA$",
    locale: "en-CA",
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
    quickQuestions: [
      "What is the T2200 form and when do I need it?",
      "How do I claim home office expenses as an employee?",
      "What medical expenses qualify for the CRA medical credit?",
      "How does the RRSP deduction work?",
      "What vehicle expenses can I deduct for business?",
    ],
    taxAuthority: "CRA",
    taxAuthorityUrl: "https://www.canada.ca/en/revenue-agency.html",
  },
  UK: {
    name: "United Kingdom (HMRC)",
    currency: "GBP",
    symbol: "£",
    locale: "en-GB",
    guidance: [
      {
        title: "Self Assessment",
        body: "Self-employed with income over £1,000? Register for Self Assessment and file by 31 January following the tax year.",
        link: "https://www.gov.uk/self-assessment-tax-returns",
        warning: false,
      },
      {
        title: "Marriage Allowance",
        body: "Transfer up to £1,260 of unused Personal Allowance to your spouse. Worth up to £252 per year.",
        link: null,
        warning: false,
      },
      {
        title: "Working From Home",
        body: "Employees required to work from home can claim £6/week tax relief without receipts, or exact costs with evidence.",
        link: null,
        warning: false,
      },
      {
        title: "Gift Aid",
        body: "Charitable donations via Gift Aid let charities claim 25p per £1. Higher-rate taxpayers can claim the difference.",
        link: null,
        warning: false,
      },
      {
        title: "Pension Tax Relief",
        body: "Contributions to registered pensions get tax relief at your marginal rate. Annual allowance is £60,000.",
        link: null,
        warning: true,
      },
      {
        title: "Keep Records 5+ Years",
        body: "HMRC can investigate up to 4 years back (6 for carelessness, 20 for fraud). Keep all receipts and records.",
        link: null,
        warning: false,
      },
    ],
    quickQuestions: [
      "What expenses can I claim as self-employed?",
      "How does the Marriage Allowance work?",
      "Can I claim working from home tax relief?",
      "What pension contributions are tax-deductible?",
      "How do I register for Self Assessment?",
    ],
    taxAuthority: "HMRC",
    taxAuthorityUrl: "https://www.gov.uk/hmrc",
  },
};

// ─── Types ─────────────────────────────────────────────────────────────────────

type Country = "US" | "CA" | "UK";
type SortKey = "date" | "merchant" | "amount" | "category" | "taxCategory";
type SortDir = "asc" | "desc";

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

interface TaxSummaryResponse {
  year: number;
  country: string;
  totalDeductible: number;
  totalBusiness: number;
  estimatedSavings: number;
  marginalRate: number;
  transactionCount: number;
  businessCount: number;
  byCategory: Array<{
    category: string;
    label: string;
    total: number;
    count: number;
    transactions: Array<{
      id: string;
      date: string;
      amount: number;
      merchant: string;
      source: string;
    }>;
  }>;
  suggestions: Array<{
    transactionId: string;
    suggestedTaxCategory: string;
    confidence: "high" | "medium";
    reason: string;
  }>;
}

interface TaxTransaction {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  category: string;
  taxCategory: string;
  source: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, locale: string, symbol: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: symbol === "$" ? "USD" : symbol === "CA$" ? "CAD" : "GBP",
  }).format(amount);
}

function exportToCSV(transactions: TaxTransaction[], year: number, country: string) {
  const headers = ["Date", "Merchant", "Amount", "Category", "Tax Category", "Source"];
  const rows = transactions.map((t) => [
    t.date,
    `"${t.merchant.replace(/"/g, '""')}"`,
    t.amount.toFixed(2),
    `"${t.category}"`,
    `"${t.taxCategory || ""}"`,
    `"${t.source || ""}"`,
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tax-smart-${country}-${year}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const parseExtractedData = (raw: any): Record<string, string> => {
  if (!raw) return {};
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
  } catch {
    return {};
  }
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function TaxSmartPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // State
  const [country, setCountry] = useState<Country>("CA");
  const [taxYear, setTaxYear] = useState(currentYear - 1);
  const [marginalRate, setMarginalRate] = useState<number>(
    MARGINAL_RATE_BRACKETS.CA[2].rate
  );
  const [customMarginalRate, setCustomMarginalRate] = useState<number | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [proactiveInsight, setProactiveInsight] = useState<string>("");
  const [insightLoading, setInsightLoading] = useState(false);

  // Vault documents
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [docAnalysis, setDocAnalysis] = useState<Record<string, string>>({});
  const [analyzingDocId, setAnalyzingDocId] = useState<string | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [showAllDocs, setShowAllDocs] = useState(false);

  // Table sorting
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const config = TAXSMART_CONFIG[country];
  const effectiveMarginalRate = customMarginalRate ?? marginalRate;

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const { data: vaultDocsData, isLoading: vaultDocsLoading, refetch: refetchVaultDocs } = useQuery<{
    success: boolean;
    data: VaultTaxDocument[];
  }>({
    queryKey: ["/api/tax/vault-documents"],
    staleTime: 30000,
  });

  const vaultTaxDocs = vaultDocsData?.data ?? [];

  // Fetch tax summary from engine
  const { data: taxSummary, isLoading: summaryLoading } = useQuery<TaxSummaryResponse>({
    queryKey: ["/api/tax/summary", { year: taxYear, country, marginalRate: effectiveMarginalRate }],
    queryFn: async () => {
      const params = new URLSearchParams({
        year: String(taxYear),
        country,
        marginalRate: String(effectiveMarginalRate),
      });
      const res = await fetch(`/api/tax/summary?${params}`);
      if (!res.ok) throw new Error("Failed to fetch tax summary");
      return res.json();
    },
  });

  // Flatten transactions from byCategory for table display
  const allTransactions: TaxTransaction[] = useMemo(() => {
    if (!taxSummary?.byCategory) return [];
    return taxSummary.byCategory.flatMap((cat) =>
      cat.transactions.map((t) => ({
        id: t.id,
        date: t.date,
        merchant: t.merchant,
        amount: t.amount,
        category: cat.category,
        taxCategory: cat.label,
        source: t.source,
      }))
    );
  }, [taxSummary?.byCategory]);

  // Get unique categories for filter
  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(allTransactions.map((t) => t.category)));
  }, [allTransactions]);

  // Filter and sort transactions
  const filteredTransactions = useMemo(() => {
    let result = [...allTransactions];
    if (categoryFilter !== "all") {
      result = result.filter((t) => t.category === categoryFilter);
    }
    result.sort((a, b) => {
      let valA: string | number = a[sortKey];
      let valB: string | number = b[sortKey];
      if (sortKey === "amount") {
        valA = parseFloat(String(valA));
        valB = parseFloat(String(valB));
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [allTransactions, categoryFilter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortHeader = ({ label, sk }: { label: string; sk: SortKey }) => (
    <TableHead
      className="cursor-pointer hover:text-primary transition-colors select-none"
      onClick={() => handleSort(sk)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </div>
    </TableHead>
  );

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

  // Build vault context for AI chat
  const buildVaultContext = (): string => {
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
    if (!taxSummary) return;
    setInsightLoading(true);
    setProactiveInsight("");
    try {
      const vaultContext = buildVaultContext();
      const summary =
        allTransactions.length > 0
          ? `${allTransactions.length} deductible transactions totaling ${config.symbol}${taxSummary.totalDeductible.toFixed(2)} for tax year ${taxYear}. Top categories: ${taxSummary.byCategory
              .slice(0, 3)
              .map((cat) => `${cat.label} (${config.symbol}${cat.total.toFixed(0)})`).join(", ")}.`
          : `No deductible transactions found for tax year ${taxYear}.`;

      const questionText = vaultTaxDocs.length > 0
        ? `I have ${vaultTaxDocs.length} tax document(s) uploaded. ${vaultContext ? "Based on my tax documents and expense data, give me 2-3 specific observations about my tax situation for ${taxYear}. Reference specific figures if available." : "Give me 2-3 specific observations about my expenses that might be worth discussing with my accountant."} Keep it under 80 words. Data: ${summary}`
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
  }, [taxYear, country, vaultTaxDocs.length, taxSummary]);

  const handleQuestion = async (q?: string) => {
    const userQuestion = q || question;
    if (!userQuestion.trim()) return;

    const vaultContext = buildVaultContext();
    const enrichedQuestion = vaultContext
      ? `${userQuestion}\n\n[Context from my uploaded tax documents:${vaultContext}]`
      : userQuestion;

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
        question: enrichedQuestion,
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

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
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
                  "Organize and categorize tax-related transactions",
                  "Analyze uploaded T4/W-2/tax documents with AI",
                  "Understand general tax concepts for multiple countries",
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
                a licensed CPA, Enrolled Agent, tax attorney, or accountant for advice specific to your situation.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowDisclaimer(false)} className="w-full">
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
            <h1 className="text-3xl font-bold">TaxSmart AI</h1>
            <Badge variant="secondary" className="text-xs">Pro</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Engine-powered tax guidance · Analyze documents · Organize deductible transactions
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Country Toggle */}
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
            {(["US", "CA", "UK"] as const).map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCountry(c);
                  // Reset marginal rate to a sensible default for the new country
                  const defaultBracket = MARGINAL_RATE_BRACKETS[c][Math.floor(MARGINAL_RATE_BRACKETS[c].length / 2)];
                  setMarginalRate(defaultBracket.rate);
                  setCustomMarginalRate(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  country === c
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c === "US" && "🇺🇸 United States"}
                {c === "CA" && "🇨🇦 Canada"}
                {c === "UK" && "🇬🇧 United Kingdom"}
              </button>
            ))}
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
            onClick={() => {
              if (allTransactions.length === 0) {
                toast({ title: "No transactions to export", variant: "destructive" });
                return;
              }
              exportToCSV(allTransactions, taxYear, country);
              toast({ title: `CSV exported for ${taxYear}` });
            }}
            disabled={allTransactions.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* ── Disclaimer Banner ── */}
      <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-500/15 bg-amber-500/5 text-xs">
        <AlertTriangle size={13} className="text-amber-500/70 shrink-0 mt-0.5" />
        <p className="text-muted-foreground/70">
          <span className="font-medium text-amber-600/80 dark:text-amber-400/80">Organizational tool only.</span>
          {' '}TaxSmart AI does not provide tax advice. Always consult a qualified tax professional.{' '}
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
                Upload in Vault
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
                        {doc.ai_summary && (
                          <div className="p-3 bg-background rounded-lg border border-border/50">
                            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-primary" />
                              Vault AI Summary
                            </p>
                            <p className="text-sm text-foreground/80">{doc.ai_summary}</p>
                          </div>
                        )}

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

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs gap-1"
                            onClick={() => {
                              const q = `Based on my ${doc.display_name || doc.file_name}, what are the key tax implications and deductions I should discuss with my accountant for ${taxYear}?`;
                              handleQuestion(q);
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
                  Ask a question about {config.name} tax deductions below
                  {vaultTaxDocs.length > 0 && `, or ask about your uploaded tax documents`}.
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
              placeholder={`Ask about ${config.name} deductions...`}
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

      {/* ── Summary Cards ── */}
      {summaryLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <TrendingDown className="h-4 w-4 text-green-500" />
                Total Deductible
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(taxSummary?.totalDeductible || 0, config.locale, config.symbol)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{taxSummary?.transactionCount || 0} transactions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Briefcase className="h-4 w-4 text-blue-500" />
                Business Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">
                {formatCurrency(taxSummary?.totalBusiness || 0, config.locale, config.symbol)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{taxSummary?.businessCount || 0} business expenses</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-purple-500" />
                Categories
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{taxSummary?.byCategory?.length || 0}</p>
              <p className="text-xs text-muted-foreground mt-1">tax categories used</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-amber-500" />
                Est. Tax Savings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-600">
                {formatCurrency(taxSummary?.estimatedSavings || 0, config.locale, config.symbol)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">at {effectiveMarginalRate}% marginal rate</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Marginal Rate Selector ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tax Bracket</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={customMarginalRate !== null ? "custom" : String(marginalRate)}
            onValueChange={(v) => {
              if (v === "custom") {
                setCustomMarginalRate(marginalRate);
              } else {
                const rate = parseFloat(v);
                setMarginalRate(rate);
                setCustomMarginalRate(null);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MARGINAL_RATE_BRACKETS[country].map((bracket) => (
                <SelectItem key={bracket.rate} value={String(bracket.rate)}>
                  {bracket.label}
                </SelectItem>
              ))}
              <SelectItem value="custom">Custom Rate</SelectItem>
            </SelectContent>
          </Select>

          {customMarginalRate !== null && (
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min={1}
                max={100}
                step={0.5}
                value={customMarginalRate}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (val >= 1 && val <= 100) setCustomMarginalRate(val);
                }}
                className="flex-1 text-sm px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Your estimated tax savings is calculated using this marginal rate. This is for informational purposes only.
          </p>
        </CardContent>
      </Card>

      {/* ── AI Suggestions ── */}
      {taxSummary?.suggestions && taxSummary.suggestions.length > 0 && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              AI Suggestions
              <Badge variant="secondary" className="text-xs ml-1">
                {taxSummary.suggestions.length} found
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              These transactions may be tax-deductible based on their category and merchant.
            </p>
            <div className="space-y-2">
              {taxSummary.suggestions.slice(0, 8).map((s) => {
                const matchedTx = allTransactions.find((t) => t.id === s.transactionId);
                return (
                  <div
                    key={s.transactionId}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border bg-muted/20"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {matchedTx?.merchant || "Transaction"}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.reason}</p>
                    </div>
                    <Badge
                      variant={s.confidence === "high" ? "default" : "secondary"}
                      className={`text-xs shrink-0 ${
                        s.confidence === "high"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      }`}
                    >
                      {s.confidence}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs shrink-0"
                      onClick={() =>
                        toast({
                          title: "Coming soon",
                          description: "Auto-tagging will be available in the next update.",
                        })
                      }
                    >
                      Accept
                    </Button>
                  </div>
                );
              })}
              {taxSummary.suggestions.length > 8 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  + {taxSummary.suggestions.length - 8} more suggestions
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Category Breakdown + Table Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Breakdown by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : !taxSummary?.byCategory || taxSummary.byCategory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No deductible transactions found for {taxYear}.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {taxSummary.byCategory.map((cat) => {
                  const pct = taxSummary.totalDeductible > 0
                    ? (cat.total / taxSummary.totalDeductible) * 100
                    : 0;
                  return (
                    <div key={cat.category}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">{cat.label}</span>
                        <span className="font-medium">
                          {formatCurrency(cat.total, config.locale, config.symbol)}
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
              <CardTitle className="text-base">Tax-Deductible Transactions</CardTitle>
              {!summaryLoading && (
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {uniqueCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No transactions for {taxYear}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader label="Date" sk="date" />
                    <SortHeader label="Merchant" sk="merchant" />
                    <SortHeader label="Amount" sk="amount" />
                    <TableHead>Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(parseISO(tx.date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{tx.merchant}</TableCell>
                      <TableCell className="font-semibold text-green-600 whitespace-nowrap">
                        {formatCurrency(tx.amount, config.locale, config.symbol)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {tx.taxCategory}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Total row */}
            {filteredTransactions.length > 0 && (
              <div className="flex items-center justify-between pt-4 border-t mt-4">
                <span className="text-sm font-medium text-muted-foreground">
                  {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? "s" : ""}
                </span>
                <span className="font-bold text-green-600">
                  Total: {formatCurrency(
                    filteredTransactions.reduce((s, t) => s + t.amount, 0),
                    config.locale,
                    config.symbol
                  )}
                </span>
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
          TaxSmart AI is an organizational tool, not tax software. All figures are estimates for general educational purposes only. Always consult a qualified CPA, Enrolled Agent, or tax professional before making any tax decisions or filing your return.{' '}
          <a href={config.taxAuthorityUrl} target="_blank" rel="noopener noreferrer" className="text-primary/60 hover:underline">
            Verify with {config.taxAuthority} ↗
          </a>
        </p>
      </div>
    </div>
  );
}
