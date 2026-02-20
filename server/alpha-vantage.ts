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
