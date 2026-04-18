/**
 * Alpha Vantage API Integration
 * Provides stock quotes, technical indicators, and fundamental data
 */

const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";
const API_KEY = process.env.ALPHA_ADVANTAGE_API || "";

// Rate limiting: Free tier allows 25 requests/day, 5 requests/minute
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 12000; // 12 seconds between requests (5/min limit)

async function rateLimitedFetch(url: string): Promise<any> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Alpha Vantage API error: ${response.status}`);
  }

  const data = await response.json();

  // Check for API error messages
  if (data["Error Message"]) {
    throw new Error(data["Error Message"]);
  }
  if (data["Note"]) {
    console.warn("Alpha Vantage rate limit warning:", data["Note"]);
  }

  return data;
}

export interface StockQuote {
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

export interface TechnicalIndicator {
  symbol: string;
  indicator: string;
  value: number;
  timestamp: string;
}

export interface CompanyOverview {
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

/**
 * Get real-time quote for a stock symbol
 */
export async function getStockQuote(symbol: string): Promise<StockQuote | null> {
  if (!API_KEY) {
    console.warn("Alpha Vantage API key not configured");
    return null;
  }

  try {
    const url = `${ALPHA_VANTAGE_BASE_URL}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`;
    const data = await rateLimitedFetch(url);

    const quote = data["Global Quote"];
    if (!quote || !quote["05. price"]) {
      return null;
    }

    return {
      symbol: quote["01. symbol"],
      price: parseFloat(quote["05. price"]),
      change: parseFloat(quote["09. change"]),
      changePercent: parseFloat(quote["10. change percent"]?.replace("%", "") || "0"),
      volume: parseInt(quote["06. volume"]),
      latestTradingDay: quote["07. latest trading day"],
      previousClose: parseFloat(quote["08. previous close"]),
      open: parseFloat(quote["02. open"]),
      high: parseFloat(quote["03. high"]),
      low: parseFloat(quote["04. low"]),
    };
  } catch (error) {
    console.error(`Error fetching quote for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get RSI (Relative Strength Index) for a symbol
 */
export async function getRSI(symbol: string, interval: string = "daily", timePeriod: number = 14): Promise<TechnicalIndicator | null> {
  if (!API_KEY) return null;

  try {
    const url = `${ALPHA_VANTAGE_BASE_URL}?function=RSI&symbol=${encodeURIComponent(symbol)}&interval=${interval}&time_period=${timePeriod}&series_type=close&apikey=${API_KEY}`;
    const data = await rateLimitedFetch(url);

    const technicalData = data["Technical Analysis: RSI"];
    if (!technicalData) return null;

    const latestDate = Object.keys(technicalData)[0];
    const latestValue = technicalData[latestDate];

    return {
      symbol,
      indicator: "RSI",
      value: parseFloat(latestValue.RSI),
      timestamp: latestDate,
    };
  } catch (error) {
    console.error(`Error fetching RSI for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get SMA (Simple Moving Average) for a symbol
 */
export async function getSMA(symbol: string, interval: string = "daily", timePeriod: number = 50): Promise<TechnicalIndicator | null> {
  if (!API_KEY) return null;

  try {
    const url = `${ALPHA_VANTAGE_BASE_URL}?function=SMA&symbol=${encodeURIComponent(symbol)}&interval=${interval}&time_period=${timePeriod}&series_type=close&apikey=${API_KEY}`;
    const data = await rateLimitedFetch(url);

    const technicalData = data["Technical Analysis: SMA"];
    if (!technicalData) return null;

    const latestDate = Object.keys(technicalData)[0];
    const latestValue = technicalData[latestDate];

    return {
      symbol,
      indicator: `SMA${timePeriod}`,
      value: parseFloat(latestValue.SMA),
      timestamp: latestDate,
    };
  } catch (error) {
    console.error(`Error fetching SMA for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get company overview/fundamental data
 */
export async function getCompanyOverview(symbol: string): Promise<CompanyOverview | null> {
  if (!API_KEY) return null;

  try {
    const url = `${ALPHA_VANTAGE_BASE_URL}?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`;
    const data = await rateLimitedFetch(url);

    if (!data.Symbol) return null;

    return {
      symbol: data.Symbol,
      name: data.Name,
      description: data.Description,
      sector: data.Sector,
      industry: data.Industry,
      marketCap: parseFloat(data.MarketCapitalization) || 0,
      peRatio: parseFloat(data.PERatio) || 0,
      pegRatio: parseFloat(data.PEGRatio) || 0,
      dividendYield: parseFloat(data.DividendYield) || 0,
      eps: parseFloat(data.EPS) || 0,
      beta: parseFloat(data.Beta) || 0,
      fiftyTwoWeekHigh: parseFloat(data["52WeekHigh"]) || 0,
      fiftyTwoWeekLow: parseFloat(data["52WeekLow"]) || 0,
      fiftyDayMA: parseFloat(data["50DayMovingAverage"]) || 0,
      twoHundredDayMA: parseFloat(data["200DayMovingAverage"]) || 0,
      analystTargetPrice: parseFloat(data.AnalystTargetPrice) || 0,
    };
  } catch (error) {
    console.error(`Error fetching overview for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get comprehensive analysis for a stock (quote + indicators)
 */
export async function getStockAnalysis(symbol: string): Promise<{
  quote: StockQuote | null;
  rsi: TechnicalIndicator | null;
  sma50: TechnicalIndicator | null;
  sma200: TechnicalIndicator | null;
  overview: CompanyOverview | null;
} | null> {
  if (!API_KEY) {
    console.warn("Alpha Vantage API key not configured");
    return null;
  }

  // Fetch data sequentially to respect rate limits
  const quote = await getStockQuote(symbol);
  const rsi = await getRSI(symbol);
  const sma50 = await getSMA(symbol, "daily", 50);
  const sma200 = await getSMA(symbol, "daily", 200);
  const overview = await getCompanyOverview(symbol);

  return { quote, rsi, sma50, sma200, overview };
}

/**
 * Batch update prices for multiple holdings (respects rate limits)
 */
export async function batchUpdatePrices(symbols: string[]): Promise<Map<string, StockQuote>> {
  const results = new Map<string, StockQuote>();

  for (const symbol of symbols) {
    const quote = await getStockQuote(symbol);
    if (quote) {
      results.set(symbol, quote);
    }
  }

  return results;
}

/**
 * Check if a symbol is valid/exists
 */
export async function validateSymbol(symbol: string): Promise<boolean> {
  const quote = await getStockQuote(symbol);
  return quote !== null;
}

export interface NewsArticle {
  symbol: string;
  headline: string;
  source: string;
  sentiment: string;
  timePublished: string;
  url: string;
}

/**
 * Fetch news sentiment articles for a given ticker symbol from Alpha Vantage
 */
export async function fetchNewsSentiment(symbol: string, limit = 3): Promise<NewsArticle[]> {
  if (!API_KEY) return [];

  try {
    const url = `${ALPHA_VANTAGE_BASE_URL}?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(symbol)}&limit=${limit}&apikey=${API_KEY}`;
    const data = await rateLimitedFetch(url);

    const feed: any[] = data?.feed ?? [];
    return feed.slice(0, limit).map((item: any) => {
      // Alpha Vantage returns per-ticker sentiment inside ticker_sentiment array
      const tickerSentiment = (item.ticker_sentiment as any[])?.find(
        (t: any) => t.ticker?.toUpperCase() === symbol.toUpperCase(),
      );
      const sentimentLabel: string =
        tickerSentiment?.ticker_sentiment_label ?? item.overall_sentiment_label ?? "Neutral";
      return {
        symbol,
        headline: item.title ?? "",
        source: item.source ?? "",
        sentiment: sentimentLabel,
        timePublished: item.time_published ?? "",
        url: item.url ?? "",
      };
    });
  } catch (error) {
    console.error(`Error fetching news for ${symbol}:`, error);
    return [];
  }
}


// ─── New functions for Research tab ──────────────────────────────────────────

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  type: string;
  region: string;
  currency: string;
  matchScore: number;
}

/**
 * Search for symbols matching a query (SYMBOL_SEARCH endpoint)
 */
export async function searchSymbols(query: string): Promise<SymbolSearchResult[]> {
  if (!API_KEY || !query.trim()) return [];

  try {
    const url = `${ALPHA_VANTAGE_BASE_URL}?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${API_KEY}`;
    const data = await rateLimitedFetch(url);

    const matches: any[] = data?.bestMatches ?? [];
    return matches.map((m: any) => ({
      symbol: m["1. symbol"] ?? "",
      name: m["2. name"] ?? "",
      type: m["3. type"] ?? "",
      region: m["4. region"] ?? "",
      currency: m["8. currency"] ?? "USD",
      matchScore: parseFloat(m["9. matchScore"] ?? "0"),
    })).filter((r) => r.symbol);
  } catch (error) {
    console.error(`Error searching symbols for "${query}":`, error);
    return [];
  }
}

export interface TimeSeriesPoint {
  date: string;       // yyyy-MM-dd
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Get daily time series for a symbol (TIME_SERIES_DAILY endpoint)
 * outputSize: "compact" = last 100 points, "full" = 20+ years
 */
export async function getDailyTimeSeries(
  symbol: string,
  outputSize: "compact" | "full" = "compact",
): Promise<TimeSeriesPoint[]> {
  if (!API_KEY) return [];

  try {
    const url = `${ALPHA_VANTAGE_BASE_URL}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=${outputSize}&apikey=${API_KEY}`;
    const data = await rateLimitedFetch(url);

    const series = data["Time Series (Daily)"];
    if (!series) return [];

    const points: TimeSeriesPoint[] = Object.entries(series).map(([date, values]: [string, any]) => ({
      date,
      open: parseFloat(values["1. open"]) || 0,
      high: parseFloat(values["2. high"]) || 0,
      low: parseFloat(values["3. low"]) || 0,
      close: parseFloat(values["4. close"]) || 0,
      volume: parseInt(values["5. volume"]) || 0,
    }));

    // Sort ascending by date
    points.sort((a, b) => a.date.localeCompare(b.date));
    return points;
  } catch (error) {
    console.error(`Error fetching time series for ${symbol}:`, error);
    return [];
  }
}

export interface EarningsQuarter {
  fiscalDateEnding: string;
  reportedDate: string;
  reportedEPS: number | null;
  estimatedEPS: number | null;
  surprise: number | null;
  surprisePercentage: number | null;
}

export interface EarningsData {
  symbol: string;
  quarterlyEarnings: EarningsQuarter[];
}

/**
 * Get earnings data for a symbol (EARNINGS endpoint)
 */
export async function getEarnings(symbol: string): Promise<EarningsData | null> {
  if (!API_KEY) return null;

  try {
    const url = `${ALPHA_VANTAGE_BASE_URL}?function=EARNINGS&symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`;
    const data = await rateLimitedFetch(url);

    if (!data.symbol) return null;

    const q: any[] = data.quarterlyEarnings ?? [];
    const quarterlyEarnings: EarningsQuarter[] = q.slice(0, 8).map((item: any) => {
      const parseOrNull = (v: any): number | null => {
        if (v === undefined || v === null || v === "None" || v === "") return null;
        const n = parseFloat(v);
        return isNaN(n) ? null : n;
      };
      return {
        fiscalDateEnding: item.fiscalDateEnding ?? "",
        reportedDate: item.reportedDate ?? "",
        reportedEPS: parseOrNull(item.reportedEPS),
        estimatedEPS: parseOrNull(item.estimatedEPS),
        surprise: parseOrNull(item.surprise),
        surprisePercentage: parseOrNull(item.surprisePercentage),
      };
    });

    return {
      symbol: data.symbol,
      quarterlyEarnings,
    };
  } catch (error) {
    console.error(`Error fetching earnings for ${symbol}:`, error);
    return null;
  }
}


/**
 * Generate AI-friendly analysis summary for a stock
 */
export function generateAnalysisSummary(analysis: {
  quote: StockQuote | null;
  rsi: TechnicalIndicator | null;
  sma50: TechnicalIndicator | null;
  sma200: TechnicalIndicator | null;
  overview: CompanyOverview | null;
}): string {
  const parts: string[] = [];

  if (analysis.quote) {
    parts.push(`Current Price: $${analysis.quote.price.toFixed(2)}`);
    parts.push(`Daily Change: ${analysis.quote.change >= 0 ? '+' : ''}${analysis.quote.change.toFixed(2)} (${analysis.quote.changePercent.toFixed(2)}%)`);
    parts.push(`52-Week Range: $${analysis.overview?.fiftyTwoWeekLow?.toFixed(2) || 'N/A'} - $${analysis.overview?.fiftyTwoWeekHigh?.toFixed(2) || 'N/A'}`);
  }

  if (analysis.rsi) {
    const rsiValue = analysis.rsi.value;
    let rsiSignal = "Neutral";
    if (rsiValue > 70) rsiSignal = "Overbought (potential sell signal)";
    else if (rsiValue < 30) rsiSignal = "Oversold (potential buy signal)";
    parts.push(`RSI (14): ${rsiValue.toFixed(2)} - ${rsiSignal}`);
  }

  if (analysis.sma50 && analysis.quote) {
    const priceVsSma50 = ((analysis.quote.price - analysis.sma50.value) / analysis.sma50.value * 100).toFixed(2);
    parts.push(`50-Day SMA: $${analysis.sma50.value.toFixed(2)} (Price is ${priceVsSma50}% ${parseFloat(priceVsSma50) >= 0 ? 'above' : 'below'})`);
  }

  if (analysis.sma200 && analysis.quote) {
    const priceVsSma200 = ((analysis.quote.price - analysis.sma200.value) / analysis.sma200.value * 100).toFixed(2);
    parts.push(`200-Day SMA: $${analysis.sma200.value.toFixed(2)} (Price is ${priceVsSma200}% ${parseFloat(priceVsSma200) >= 0 ? 'above' : 'below'})`);
  }

  if (analysis.sma50 && analysis.sma200) {
    const goldenCross = analysis.sma50.value > analysis.sma200.value;
    parts.push(`Trend: ${goldenCross ? 'Bullish (50-day above 200-day - Golden Cross)' : 'Bearish (50-day below 200-day - Death Cross)'}`);
  }

  if (analysis.overview) {
    if (analysis.overview.peRatio > 0) parts.push(`P/E Ratio: ${analysis.overview.peRatio.toFixed(2)}`);
    if (analysis.overview.eps > 0) parts.push(`EPS: $${analysis.overview.eps.toFixed(2)}`);
    if (analysis.overview.dividendYield > 0) parts.push(`Dividend Yield: ${(analysis.overview.dividendYield * 100).toFixed(2)}%`);
    if (analysis.overview.beta > 0) parts.push(`Beta: ${analysis.overview.beta.toFixed(2)}`);
    if (analysis.overview.analystTargetPrice > 0) {
      const upside = ((analysis.overview.analystTargetPrice - (analysis.quote?.price || 0)) / (analysis.quote?.price || 1) * 100).toFixed(2);
      parts.push(`Analyst Target: $${analysis.overview.analystTargetPrice.toFixed(2)} (${parseFloat(upside) >= 0 ? '+' : ''}${upside}% potential)`);
    }
  }

  return parts.join('\n');
}

export interface HistoricalPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Get historical daily prices for a symbol.
 * Uses TIME_SERIES_DAILY for 1M/3M, TIME_SERIES_MONTHLY for 1Y/5Y.
 * @param symbol - Stock ticker symbol
 * @param range - Time range: "1M", "3M", "1Y", "5Y"
 */
export async function getHistoricalPrices(
  symbol: string,
  range: "1M" | "3M" | "1Y" | "5Y" = "1M"
): Promise<HistoricalPrice[]> {
  if (!API_KEY) {
    console.warn("Alpha Vantage API key not configured");
    return [];
  }

  try {
    let fn: string;
    let timeSeriesKey: string;
    let outputsize = "compact"; // compact = last 100 data points

    if (range === "1Y" || range === "5Y") {
      fn = "TIME_SERIES_MONTHLY";
      timeSeriesKey = "Monthly Time Series";
      outputsize = "full";
    } else {
      fn = "TIME_SERIES_DAILY";
      timeSeriesKey = "Time Series (Daily)";
      outputsize = range === "3M" ? "full" : "compact";
    }

    const url = `${ALPHA_VANTAGE_BASE_URL}?function=${fn}&symbol=${encodeURIComponent(symbol)}&outputsize=${outputsize}&apikey=${API_KEY}`;
    const data = await rateLimitedFetch(url);

    const timeSeries = data[timeSeriesKey];
    if (!timeSeries) return [];

    const entries = Object.entries(timeSeries) as [string, any][];
    // Sort by date descending
    entries.sort((a, b) => b[0].localeCompare(a[0]));

    // Limit based on range
    const limitMap: Record<string, number> = {
      "1M": 22,   // ~22 trading days
      "3M": 66,   // ~66 trading days
      "1Y": 12,   // 12 months
      "5Y": 60,   // 60 months
    };
    const limit = limitMap[range] || 22;
    const limited = entries.slice(0, limit);

    // Return in chronological order (oldest first) for charting
    return limited.reverse().map(([date, values]: [string, any]) => ({
      date,
      open: parseFloat(values["1. open"]),
      high: parseFloat(values["2. high"]),
      low: parseFloat(values["3. low"]),
      close: parseFloat(values["4. close"]),
      volume: parseInt(values["5. volume"]),
    }));
  } catch (error) {
    console.error(`Error fetching historical prices for ${symbol}:`, error);
    return [];
  }
}
