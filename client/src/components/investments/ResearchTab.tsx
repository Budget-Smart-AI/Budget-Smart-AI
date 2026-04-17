// FEATURE: INVESTOR_RESEARCH | tier: free (v1) — will paywall once AV commercial license signs
//
// Research tab for the Investments page. Powered by Alpha Vantage via the
// /api/investments/research/* routes in server/routes.ts. Themed entirely via
// shadcn/Tailwind CSS variables (bg-background, text-foreground, bg-card,
// border, text-primary, text-muted-foreground, etc.) so it respects all five
// themes (Midnight, Aurora, Ocean, Nebula, Slate) without hardcoded hex.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Search, X, Plus, TrendingUp, TrendingDown, Send, Loader2, Sparkles, ExternalLink, BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Types mirroring the server responses ───────────────────────────────────

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  region: string;
  currency: string;
  matchScore: number;
}
interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  latestTradingDay: string;
  previousClose: number;
  open: number;
  high: number;
  low: number;
}
interface Overview {
  symbol: string;
  name: string;
  description: string;
  sector: string;
  industry: string;
  marketCap: number;
  peRatio: number;
  pegRatio: number;
  dividendYield: number;
  eps: number;
  beta: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  fiftyDayMA: number;
  twoHundredDayMA: number;
  analystTargetPrice: number;
}
interface TimeSeriesPoint {
  date: string; open: number; high: number; low: number; close: number; volume: number;
}
interface NewsArticle {
  symbol: string; headline: string; source: string; sentiment: string; timePublished: string; url: string;
}
interface EarningsQuarter {
  fiscalDateEnding: string; reportedDate: string;
  reportedEPS: number | null; estimatedEPS: number | null;
  surprise: number | null; surprisePercentage: number | null;
}
interface PortfolioPosition {
  symbol: string; shares: number; costBasis: number; currentPrice: number;
  currentValue: number; gainLoss: number; gainLossPct: number; accountCount: number;
}

type Range = "1D" | "1W" | "1M" | "6M" | "1Y" | "5Y" | "ALL";
const RANGES: Range[] = ["1D", "1W", "1M", "6M", "1Y", "5Y", "ALL"];

// ─── Formatting helpers ─────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const fmtNumber = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { maximumFractionDigits: digits });
const fmtCompact = (n: number) => {
  if (!isFinite(n) || n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
};
const fmtVolume = (n: number) => {
  if (!isFinite(n) || n === 0) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${n}`;
};
const parseAvTime = (raw: string): Date | null => {
  // Alpha Vantage time_published format: "20251013T143022"
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!m) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
};
const relativeTime = (raw: string): string => {
  const d = parseAvTime(raw);
  if (!d) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
};

// Normalize Alpha Vantage sentiment labels to a tri-state.
const sentimentClass = (s: string): "bullish" | "bearish" | "neutral" => {
  const low = (s || "").toLowerCase();
  if (low.includes("bullish") || low.includes("positive")) return "bullish";
  if (low.includes("bearish") || low.includes("negative")) return "bearish";
  return "neutral";
};

// ─── Debounce hook ──────────────────────────────────────────────────────────

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Research Tab component
// ═══════════════════════════════════════════════════════════════════════════

export default function ResearchTab() {
  const { toast } = useToast();
  const [symbol, setSymbol] = useState<string>(() => {
    if (typeof window === "undefined") return "AAPL";
    return localStorage.getItem("bsai-research-last-symbol") || "AAPL";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [range, setRange] = useState<Range>("1M");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const debouncedSearch = useDebounced(searchQuery, 300);

  // Persist last-viewed symbol
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("bsai-research-last-symbol", symbol);
    }
  }, [symbol]);

  // Cmd+K / Ctrl+K focuses the search bar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Data fetching ────────────────────────────────────────────────────────

  const searchResultsQuery = useQuery({
    queryKey: ["/api/investments/research/search", debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 1) return { results: [] as SearchResult[] };
      const res = await apiRequest(
        "GET",
        `/api/investments/research/search?q=${encodeURIComponent(debouncedSearch)}`,
      );
      return (await res.json()) as { results: SearchResult[] };
    },
    enabled: debouncedSearch.length > 0,
    staleTime: 60_000,
  });

  const quoteQuery = useQuery({
    queryKey: ["/api/investments/research/quote", symbol],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/investments/research/quote/${encodeURIComponent(symbol)}`);
      return (await res.json()) as { quote: Quote };
    },
    enabled: !!symbol,
  });

  const overviewQuery = useQuery({
    queryKey: ["/api/investments/research/overview", symbol],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/investments/research/overview/${encodeURIComponent(symbol)}`);
      return (await res.json()) as { overview: Overview };
    },
    enabled: !!symbol,
  });

  const timeseriesQuery = useQuery({
    queryKey: ["/api/investments/research/timeseries", symbol, range],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/investments/research/timeseries/${encodeURIComponent(symbol)}?range=${range}`,
      );
      return (await res.json()) as { series: TimeSeriesPoint[]; range: string };
    },
    enabled: !!symbol,
  });

  const newsQuery = useQuery({
    queryKey: ["/api/investments/research/news", symbol],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/investments/research/news/${encodeURIComponent(symbol)}?limit=5`);
      return (await res.json()) as { articles: NewsArticle[] };
    },
    enabled: !!symbol,
  });

  const earningsQuery = useQuery({
    queryKey: ["/api/investments/research/earnings", symbol],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/investments/research/earnings/${encodeURIComponent(symbol)}`);
      return (await res.json()) as { earnings: { symbol: string; quarterlyEarnings: EarningsQuarter[] } };
    },
    enabled: !!symbol,
  });

  const positionQuery = useQuery({
    queryKey: ["/api/investments/research/portfolio-position", symbol],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/investments/research/portfolio-position/${encodeURIComponent(symbol)}`,
      );
      return (await res.json()) as { position: PortfolioPosition | null };
    },
    enabled: !!symbol,
  });

  const watchlistQuery = useQuery({
    queryKey: ["/api/investments/research/watchlist"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/investments/research/watchlist");
      return (await res.json()) as { watchlist: string[] };
    },
  });

  // ── Mutations ────────────────────────────────────────────────────────────

  const addToWatchlistMutation = useMutation({
    mutationFn: async (sym: string) => {
      const res = await apiRequest("POST", "/api/investments/research/watchlist", { symbol: sym });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investments/research/watchlist"] });
      toast({ title: "Added to watchlist", description: `${symbol} is now in your watchlist.` });
    },
    onError: () => toast({ title: "Failed to add", variant: "destructive" }),
  });

  const removeFromWatchlistMutation = useMutation({
    mutationFn: async (sym: string) => {
      const res = await apiRequest("DELETE", `/api/investments/research/watchlist/${encodeURIComponent(sym)}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investments/research/watchlist"] });
    },
  });

  const aiMutation = useMutation({
    mutationFn: async (question: string) => {
      const res = await apiRequest("POST", "/api/investments/research/ai-query", { symbol, question });
      return (await res.json()) as { answer: string; symbol: string; generatedAt: string };
    },
    onSuccess: (data: { answer: string; symbol: string; generatedAt: string }) => setAiAnswer(data.answer),
    onError: () => toast({ title: "Research assistant is unavailable", variant: "destructive" }),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  const handleSelectSymbol = useCallback((s: string) => {
    setSymbol(s.toUpperCase());
    setSearchQuery("");
    setSearchOpen(false);
    setAiAnswer(null);
  }, []);

  const isWatched = useMemo(
    () => (watchlistQuery.data?.watchlist || []).includes(symbol),
    [watchlistQuery.data, symbol],
  );

  const quote = quoteQuery.data?.quote;
  const overview = overviewQuery.data?.overview;
  const series = timeseriesQuery.data?.series || [];
  const articles = newsQuery.data?.articles || [];
  const earnings = earningsQuery.data?.earnings;
  const position = positionQuery.data?.position;
  const watchlist = watchlistQuery.data?.watchlist || [];

  const changePositive = (quote?.change ?? 0) >= 0;
  const isLoading = quoteQuery.isLoading || overviewQuery.isLoading;

  // Chart data — use lightweight shape
  const chartData = useMemo(() => series.map((p: TimeSeriesPoint) => ({ date: p.date, close: p.close })), [series]);

  // UAT-6 P3-21: fall back to max/min of the 52W (1Y) timeseries when the
  // overview endpoint is missing `fiftyTwoWeekHigh/Low` — Alpha Vantage's
  // OVERVIEW sometimes returns nulls for smaller tickers or during off-hours.
  // We still prefer the authoritative overview value when present.
  const fiftyTwoWeekRangeFromSeries = useMemo(() => {
    if (!series || series.length === 0) return null;
    // Only use this fallback when the current range covers at least a year
    // (shorter ranges don't have 52 weeks of data; we still clamp to 365 days
    // below so 5Y/ALL don't pull far older extrema and mislead the user).
    if (range !== "1Y" && range !== "5Y" && range !== "ALL") return null;
    let high = -Infinity;
    let low = Infinity;
    // Bound to the last 365 days so 3Y/5Y ranges still give a true 52W number.
    const cutoffMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
    for (const p of series) {
      const ts = Date.parse(p.date);
      if (Number.isFinite(ts) && ts < cutoffMs) continue;
      if (p.close > high) high = p.close;
      if (p.close < low) low = p.close;
    }
    if (!Number.isFinite(high) || !Number.isFinite(low)) return null;
    return { high, low };
  }, [series, range]);

  const effectiveFiftyTwoWeekHigh =
    overview?.fiftyTwoWeekHigh && overview.fiftyTwoWeekHigh > 0
      ? overview.fiftyTwoWeekHigh
      : fiftyTwoWeekRangeFromSeries?.high ?? 0;
  const effectiveFiftyTwoWeekLow =
    overview?.fiftyTwoWeekLow && overview.fiftyTwoWeekLow > 0
      ? overview.fiftyTwoWeekLow
      : fiftyTwoWeekRangeFromSeries?.low ?? 0;

  // Earnings chart — show last 4 quarters ascending
  const earningsChartData = useMemo(() => {
    if (!earnings?.quarterlyEarnings) return [];
    return [...earnings.quarterlyEarnings]
      .slice(0, 4)
      .reverse()
      .map((q) => ({
        quarter: q.fiscalDateEnding.slice(0, 7),
        reported: q.reportedEPS ?? 0,
        estimated: q.estimatedEPS ?? 0,
      }));
  }, [earnings]);

  const latestEarnings = earnings?.quarterlyEarnings?.[0];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Search bar + watchlist chips ─────────────────────────────────── */}
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchQuery.trim()) {
                  handleSelectSymbol(searchQuery.trim());
                } else if (e.key === "Escape") {
                  setSearchOpen(false);
                  setSearchQuery("");
                }
              }}
              placeholder="Search ticker or company (⌘K)"
              className="pl-9 pr-3"
              data-testid="research-search-input"
            />
            {searchOpen && debouncedSearch.length > 0 && (
              <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-lg max-h-72 overflow-y-auto">
                {searchResultsQuery.isFetching ? (
                  <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                  </div>
                ) : (searchResultsQuery.data?.results || []).length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">No matches for "{debouncedSearch}"</div>
                ) : (
                  (searchResultsQuery.data?.results || []).slice(0, 8).map((r: SearchResult) => (
                    <button
                      key={`${r.symbol}-${r.region}`}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectSymbol(r.symbol)}
                      className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between gap-3 border-b last:border-b-0"
                      data-testid={`research-search-result-${r.symbol}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm">{r.symbol}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.name}</div>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 shrink-0">
                        <span>{r.region}</span>
                        <span>·</span>
                        <span>{r.currency}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-muted-foreground">Watchlist:</span>
            {watchlist.length === 0 ? (
              <span className="text-muted-foreground italic">None yet</span>
            ) : (
              watchlist.map((s: string) => (
                <button
                  key={s}
                  type="button"
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border bg-muted/40 hover:bg-muted transition-colors ${
                    s === symbol ? "ring-1 ring-primary" : ""
                  }`}
                  onClick={() => handleSelectSymbol(s)}
                  data-testid={`research-watchlist-chip-${s}`}
                >
                  <span className="font-medium">{s}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromWatchlistMutation.mutate(s);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </button>
              ))
            )}
            {symbol && !isWatched && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2"
                onClick={() => addToWatchlistMutation.mutate(symbol)}
                disabled={addToWatchlistMutation.isPending}
                data-testid="research-add-watchlist"
              >
                <Plus className="h-3 w-3 mr-1" /> Add {symbol}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Main grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT column (2fr = 2/3 of grid) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Quote + chart card */}
          <Card>
            <CardContent className="p-4 sm:p-6 space-y-4">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-10 w-32" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : !quote ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Market data temporarily unavailable.{" "}
                  <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs underline" onClick={() => quoteQuery.refetch()}>
                    Retry
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-lg sm:text-xl font-semibold truncate">
                          {overview?.name || symbol}
                        </span>
                        <Badge variant="secondary" className="text-[10px] uppercase">{symbol}</Badge>
                        {overview?.industry && (
                          <Badge variant="outline" className="text-[10px]">
                            {overview.sector}
                          </Badge>
                        )}
                      </div>
                      {overview && (
                        <div className="text-xs text-muted-foreground">
                          {overview.industry} · Market cap {fmtCompact(overview.marketCap)}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl sm:text-3xl font-semibold tracking-tight">
                        {fmtCurrency(quote.price)}
                      </div>
                      <div
                        className={`flex items-center gap-1 justify-end text-sm ${
                          changePositive ? "text-[hsl(var(--chart-3))]" : "text-destructive"
                        }`}
                      >
                        {changePositive ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        <span className="font-medium">
                          {changePositive ? "+" : ""}
                          {fmtNumber(quote.change)}
                        </span>
                        <span>
                          ({changePositive ? "+" : ""}
                          {fmtNumber(quote.changePercent)}%)
                        </span>
                        <span className="text-muted-foreground text-[10px] ml-1">
                          {quote.latestTradingDay}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Timeframe pills */}
                  <div className="flex gap-1 flex-wrap">
                    {RANGES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRange(r)}
                        className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                          range === r
                            ? "bg-primary text-primary-foreground font-medium"
                            : "bg-muted/50 hover:bg-muted text-muted-foreground"
                        } ${["1D", "5Y"].includes(r) ? "hidden sm:inline-flex" : ""}`}
                        data-testid={`research-range-${r}`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>

                  {/* Price chart */}
                  <div className="h-40 sm:h-52">
                    {timeseriesQuery.isLoading ? (
                      <Skeleton className="h-full w-full" />
                    ) : chartData.length < 2 ? (
                      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                        Not enough history to chart.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id="research-chart-grad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="2 4" opacity={0.2} />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v: string) => v.slice(5)}
                            interval="preserveStartEnd"
                            minTickGap={32}
                          />
                          <YAxis
                            tick={{ fontSize: 10 }}
                            domain={["auto", "auto"]}
                            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                            width={48}
                          />
                          <RechartsTooltip
                            contentStyle={{
                              background: "hsl(var(--popover))",
                              border: "1px solid hsl(var(--border))",
                              fontSize: 11,
                              color: "hsl(var(--popover-foreground))",
                            }}
                            formatter={(v: number) => [fmtCurrency(v), "Close"]}
                          />
                          <Area
                            type="monotone"
                            dataKey="close"
                            stroke="hsl(var(--primary))"
                            strokeWidth={1.5}
                            fill="url(#research-chart-grad)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Quote stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t text-xs">
                    <div>
                      <div className="text-muted-foreground">Day range</div>
                      <div className="font-medium text-sm">
                        ${fmtNumber(quote.low)} – ${fmtNumber(quote.high)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">52W range</div>
                      <div className="font-medium text-sm">
                        ${fmtNumber(effectiveFiftyTwoWeekLow)} – ${fmtNumber(effectiveFiftyTwoWeekHigh)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Volume</div>
                      <div className="font-medium text-sm">{fmtVolume(quote.volume)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Prev close</div>
                      <div className="font-medium text-sm">{fmtCurrency(quote.previousClose)}</div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Key Fundamentals */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" /> Key fundamentals
              </CardTitle>
            </CardHeader>
            <CardContent>
              {overviewQuery.isLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : !overview ? (
                <div className="py-4 text-sm text-muted-foreground">Fundamentals unavailable for this symbol.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Stat label="P/E ratio" value={overview.peRatio ? overview.peRatio.toFixed(2) : "—"} />
                  <Stat label="EPS (TTM)" value={overview.eps ? `$${overview.eps.toFixed(2)}` : "—"} />
                  <Stat label="Market cap" value={fmtCompact(overview.marketCap)} />
                  <Stat
                    label="Div yield"
                    value={overview.dividendYield > 0 ? `${(overview.dividendYield * 100).toFixed(2)}%` : "—"}
                  />
                  <Stat label="Beta" value={overview.beta ? overview.beta.toFixed(2) : "—"} />
                  <Stat label="50-day MA" value={overview.fiftyDayMA ? `$${overview.fiftyDayMA.toFixed(2)}` : "—"} />
                  <Stat label="200-day MA" value={overview.twoHundredDayMA ? `$${overview.twoHundredDayMA.toFixed(2)}` : "—"} />
                  <Stat
                    label="Analyst target"
                    value={overview.analystTargetPrice ? `$${overview.analystTargetPrice.toFixed(2)}` : "—"}
                  />
                  <Stat label="PEG ratio" value={overview.pegRatio ? overview.pegRatio.toFixed(2) : "—"} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ask BudgetSmart AI */}
          <Card className="border-primary/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Ask BudgetSmart AI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && aiQuestion.trim() && !aiMutation.isPending) {
                      aiMutation.mutate(aiQuestion.trim());
                    }
                  }}
                  placeholder={`Ask anything about ${symbol}…`}
                  data-testid="research-ai-input"
                />
                <Button
                  onClick={() => aiQuestion.trim() && aiMutation.mutate(aiQuestion.trim())}
                  disabled={aiMutation.isPending || !aiQuestion.trim()}
                  data-testid="research-ai-submit"
                >
                  {aiMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {["Summarize recent news", "Compare to peers", "Explain the business", "What are the main risks?"].map(
                  (p) => (
                    <button
                      key={p}
                      type="button"
                      className="text-[11px] px-2 py-1 rounded-md border bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => {
                        setAiQuestion(p);
                        if (!aiMutation.isPending) aiMutation.mutate(p);
                      }}
                    >
                      {p}
                    </button>
                  ),
                )}
              </div>

              {aiAnswer && (
                <div className="text-sm bg-muted/30 rounded-md p-3 border border-border whitespace-pre-wrap leading-relaxed">
                  {aiAnswer}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT column (1fr = 1/3 of grid) */}
        <div className="space-y-4">
          {/* Portfolio position — only if user holds the symbol */}
          {position && (
            <Card className="border-primary/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">In your portfolio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Shares held" value={fmtNumber(position.shares, 4)} />
                <Row label="Current value" value={fmtCurrency(position.currentValue)} />
                <Row label="Cost basis" value={fmtCurrency(position.costBasis)} />
                <Row
                  label="Unrealized P/L"
                  value={
                    <span className={position.gainLoss >= 0 ? "text-[hsl(var(--chart-3))]" : "text-destructive"}>
                      {position.gainLoss >= 0 ? "+" : ""}
                      {fmtCurrency(position.gainLoss)} ({position.gainLoss >= 0 ? "+" : ""}
                      {position.gainLossPct.toFixed(2)}%)
                    </span>
                  }
                />
                <div className="text-[11px] text-muted-foreground pt-1">
                  Across {position.accountCount} account{position.accountCount === 1 ? "" : "s"}
                </div>
              </CardContent>
            </Card>
          )}

          {/* News & sentiment */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">News & sentiment</CardTitle>
            </CardHeader>
            <CardContent>
              {newsQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : articles.length === 0 ? (
                <div className="py-3 text-xs text-muted-foreground">No recent news for {symbol}.</div>
              ) : (
                <ul className="space-y-2">
                  {articles.map((a: NewsArticle, i: number) => {
                    const cls = sentimentClass(a.sentiment);
                    const borderCls =
                      cls === "bullish"
                        ? "border-l-[hsl(var(--chart-3))]"
                        : cls === "bearish"
                        ? "border-l-destructive"
                        : "border-l-muted-foreground/30";
                    const pillCls =
                      cls === "bullish"
                        ? "bg-[hsl(var(--chart-3))]/15 text-[hsl(var(--chart-3))]"
                        : cls === "bearish"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-muted-foreground";
                    return (
                      <li key={i} className={`border-l-2 ${borderCls} pl-2.5`}>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium hover:underline inline-flex items-start gap-1"
                        >
                          <span>{a.headline}</span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                        </a>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <span>{a.source}</span>
                          <span>·</span>
                          <span>{relativeTime(a.timePublished)}</span>
                          <span
                            className={`ml-auto inline-flex px-1.5 py-0.5 rounded-sm text-[10px] font-medium ${pillCls}`}
                          >
                            {a.sentiment || "Neutral"}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Earnings */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Earnings</CardTitle>
            </CardHeader>
            <CardContent>
              {earningsQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : earningsChartData.length === 0 ? (
                <div className="py-3 text-xs text-muted-foreground">No earnings data available.</div>
              ) : (
                <>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={earningsChartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="2 4" opacity={0.2} />
                        <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} width={32} />
                        <RechartsTooltip
                          contentStyle={{
                            background: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            fontSize: 11,
                          }}
                          formatter={(v: number, name: string) => [`$${v.toFixed(2)}`, name]}
                        />
                        <Bar dataKey="reported" fill="hsl(var(--primary))" name="Reported" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {latestEarnings && (
                    <div className="text-[11px] text-muted-foreground mt-2 border-t pt-2">
                      Last EPS:{" "}
                      <span className="text-foreground font-medium">
                        {latestEarnings.reportedEPS != null ? `$${latestEarnings.reportedEPS.toFixed(2)}` : "—"}
                      </span>
                      {" · "}Est:{" "}
                      <span className="font-medium">
                        {latestEarnings.estimatedEPS != null ? `$${latestEarnings.estimatedEPS.toFixed(2)}` : "—"}
                      </span>
                      {latestEarnings.surprisePercentage != null && (
                        <span
                          className={
                            latestEarnings.surprisePercentage >= 0
                              ? "text-[hsl(var(--chart-3))] ml-1"
                              : "text-destructive ml-1"
                          }
                        >
                          {latestEarnings.surprisePercentage >= 0 ? "+" : ""}
                          {latestEarnings.surprisePercentage.toFixed(1)}%{" "}
                          {latestEarnings.surprisePercentage >= 0 ? "beat" : "miss"}
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Footer attribution (Alpha Vantage) ───────────────────────────── */}
      <div className="text-[11px] text-muted-foreground text-center border-t pt-3">
        Data by Alpha Vantage · 15-min delayed · For informational use only
      </div>
    </div>
  );
}

// ─── Small presentational helpers ──────────────────────────────────────────

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md bg-muted/30 border border-border p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
