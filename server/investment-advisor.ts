/**
 * AI Investment Advisor — rebuilt with genuine personalized analysis
 * Uses real portfolio data, news sentiment, cost basis context, and
 * portfolio history to produce a rich AI narrative.
 */

import { routeAI } from "./ai-router";
import { storage } from "./storage";
import { db } from "./db";
import { getCompanyOverview, fetchNewsSentiment, type NewsArticle } from "./alpha-vantage";
import type { Holding } from "@shared/schema";

// ─── In-memory cache (30-minute TTL) ────────────────────────────────────────
interface CacheEntry {
  data: AdvisorData;
  expiresAt: number;
}
const advisorCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ─── News cache (4-hour TTL per symbol) ─────────────────────────────────────
interface NewsCacheEntry {
  articles: NewsArticle[];
  expiresAt: number;
}
const newsCache = new Map<string, NewsCacheEntry>();
const NEWS_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// ─── Types ────────────────────────────────────────────────────────────────────
export interface EnrichedHolding {
  symbol: string;
  shares: number;
  currentPrice: number;
  avgCost: number;         // cost basis per share
  marketValue: number;
  gainLossDollars: number;
  gainLossPct: number;
  week52High: number;
  week52Low: number;
  vsHighPct: number;       // (currentPrice - 52wHigh) / 52wHigh * 100  (negative = below peak)
  name: string;
}

export interface PortfolioSnapshot {
  date: string;
  totalValue: number;
  totalCostBasis: number;
}

export interface ActionItem {
  symbol: string;
  action: string;
  reasoning: string;
}

export interface AdvisorData {
  portfolio: {
    totalValue: number;
    totalCostBasis: number;
    totalGainLoss: number;
    totalGainLossPct: number;
    holdings: EnrichedHolding[];
  };
  history: PortfolioSnapshot[];
  news: NewsArticle[];
  analysis: {
    content: string;
    generatedAt: string;
    fromCache: boolean;
  };
  actions: ActionItem[];
}

// ─── Portfolio Snapshot helpers ──────────────────────────────────────────────
async function ensureSnapshotTable(): Promise<void> {
  try {
    await (db as any).$client.query(`
      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL,
        total_value DECIMAL(15,2) NOT NULL,
        total_cost_basis DECIMAL(15,2),
        total_gain_loss DECIMAL(15,2),
        snapshot_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_date
        ON portfolio_snapshots(user_id, snapshot_date);
    `);
  } catch (e) {
    // Non-fatal: table may already exist or DB may be read-only
    console.warn("[investment-advisor] Could not ensure portfolio_snapshots table:", e);
  }
}

export async function savePortfolioSnapshot(
  userId: string,
  totalValue: number,
  totalCostBasis: number,
): Promise<void> {
  try {
    await ensureSnapshotTable();
    const totalGainLoss = totalValue - totalCostBasis;
    const today = new Date().toISOString().split("T")[0];
    await (db as any).$client.query(
      `INSERT INTO portfolio_snapshots (user_id, total_value, total_cost_basis, total_gain_loss, snapshot_date)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, snapshot_date)
       DO UPDATE SET total_value = EXCLUDED.total_value,
                     total_cost_basis = EXCLUDED.total_cost_basis,
                     total_gain_loss = EXCLUDED.total_gain_loss`,
      [userId, totalValue, totalCostBasis, totalGainLoss, today],
    );
  } catch (e) {
    console.warn("[investment-advisor] Could not save portfolio snapshot:", e);
  }
}

async function getPortfolioHistory(userId: string): Promise<PortfolioSnapshot[]> {
  try {
    await ensureSnapshotTable();
    const result = await (db as any).$client.query(
      `SELECT snapshot_date, total_value, total_cost_basis
       FROM portfolio_snapshots
       WHERE user_id = $1
       ORDER BY snapshot_date DESC
       LIMIT 365`,
      [userId],
    );
    return (result.rows as any[]).map((r: any) => ({
      date: r.snapshot_date instanceof Date
        ? r.snapshot_date.toISOString().split("T")[0]
        : String(r.snapshot_date),
      totalValue: parseFloat(r.total_value),
      totalCostBasis: parseFloat(r.total_cost_basis ?? "0"),
    }));
  } catch {
    return [];
  }
}

// ─── News helpers ────────────────────────────────────────────────────────────
async function getCachedNews(symbol: string): Promise<NewsArticle[]> {
  const cached = newsCache.get(symbol);
  if (cached && Date.now() < cached.expiresAt) return cached.articles;

  const articles = await fetchNewsSentiment(symbol, 3);
  newsCache.set(symbol, { articles, expiresAt: Date.now() + NEWS_CACHE_TTL_MS });
  return articles;
}

// ─── Portfolio history narrative ──────────────────────────────────────────────
function buildHistoryNarrative(history: PortfolioSnapshot[], currentValue: number): string {
  if (history.length < 2) {
    return "Portfolio history is building up — check back tomorrow for trend data.";
  }

  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const now = sorted[sorted.length - 1];

  const ago = (days: number): PortfolioSnapshot | null => {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    return sorted.findLast((s) => s.date <= cutoff) ?? null;
  };

  const parts: string[] = [];

  const p7 = ago(7);
  if (p7) {
    const chg = ((currentValue - p7.totalValue) / p7.totalValue) * 100;
    parts.push(`7 days ago: $${p7.totalValue.toLocaleString()} → today: $${currentValue.toLocaleString()} (${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%)`);
  }
  const p30 = ago(30);
  if (p30) {
    const chg = ((currentValue - p30.totalValue) / p30.totalValue) * 100;
    parts.push(`30 days ago: $${p30.totalValue.toLocaleString()} → today: $${currentValue.toLocaleString()} (${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%)`);
  }

  const peak = Math.max(...sorted.map((s) => s.totalValue));
  const peakEntry = sorted.find((s) => s.totalValue === peak);
  if (peakEntry && peak > currentValue * 1.05) {
    const drop = ((currentValue - peak) / peak) * 100;
    parts.push(`Down ${Math.abs(drop).toFixed(1)}% from peak of $${peak.toLocaleString()} on ${peakEntry.date}`);
  } else if (sorted.length >= 3) {
    const trough = Math.min(...sorted.slice(0, -1).map((s) => s.totalValue));
    if (currentValue > trough * 1.05) {
      const recovery = ((currentValue - trough) / trough) * 100;
      parts.push(`Up ${recovery.toFixed(1)}% recovery from recent low of $${trough.toLocaleString()}`);
    }
  }

  return parts.length > 0 ? parts.join("\n") : "Insufficient history for trend analysis.";
}

// ─── Loss context rules ──────────────────────────────────────────────────────
function buildLossContextRules(holdings: EnrichedHolding[]): string {
  const rules = holdings
    .filter((h) => h.gainLossPct < -25)
    .map((h) => {
      if (h.gainLossPct < -50) {
        return `IMPORTANT: User is down ${h.gainLossPct.toFixed(1)}% on ${h.symbol} ($${Math.abs(h.gainLossDollars).toLocaleString()} loss). Address tax-loss harvesting and whether averaging down makes sense at this level of loss.`;
      }
      return `NOTE: User is down ${h.gainLossPct.toFixed(1)}% on ${h.symbol} ($${Math.abs(h.gainLossDollars).toLocaleString()} loss). Give loss-aware advice, not a generic buy signal.`;
    });
  return rules.join("\n");
}

// ─── Core analysis function ──────────────────────────────────────────────────
export async function getAdvisorData(
  userId: string,
  forceRefresh = false,
): Promise<AdvisorData | null> {
  // Check cache
  if (!forceRefresh) {
    const cached = advisorCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
      const result = { ...cached.data };
      result.analysis = { ...result.analysis, fromCache: true };
      return result;
    }
  }

  const rawHoldings = await storage.getHoldingsByUser(userId);
  if (rawHoldings.length === 0) return null;

  // Enrich holdings with 52-week data and cost basis per share
  const enrichedHoldings: EnrichedHolding[] = await Promise.all(
    rawHoldings.map(async (h: Holding) => {
      const shares = parseFloat(h.quantity);
      const currentPrice = parseFloat(h.currentPrice || "0");
      const totalCostBasis = parseFloat(h.costBasis || "0");
      const avgCost = shares > 0 ? totalCostBasis / shares : 0;
      const marketValue = currentPrice * shares;
      const gainLossDollars = marketValue - totalCostBasis;
      const gainLossPct = totalCostBasis > 0 ? (gainLossDollars / totalCostBasis) * 100 : 0;

      // Fetch 52-week data from Alpha Vantage overview (best-effort)
      let week52High = 0;
      let week52Low = 0;
      try {
        const overview = await getCompanyOverview(h.symbol);
        week52High = overview?.fiftyTwoWeekHigh ?? 0;
        week52Low = overview?.fiftyTwoWeekLow ?? 0;
      } catch {
        // ignore — proceed without 52w data
      }

      const vsHighPct =
        week52High > 0 ? ((currentPrice - week52High) / week52High) * 100 : 0;

      return {
        symbol: h.symbol,
        shares,
        currentPrice,
        avgCost,
        marketValue,
        gainLossDollars,
        gainLossPct,
        week52High,
        week52Low,
        vsHighPct,
        name: h.name,
      };
    }),
  );

  // Portfolio-level totals
  const totalValue = enrichedHoldings.reduce((s, h) => s + h.marketValue, 0);
  const totalCostBasis = enrichedHoldings.reduce((s, h) => s + h.avgCost * h.shares, 0);
  const totalGainLoss = totalValue - totalCostBasis;
  const totalGainLossPct = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

  // Save today's snapshot (fire-and-forget)
  savePortfolioSnapshot(userId, totalValue, totalCostBasis).catch((e) => {
    console.warn("[investment-advisor] Snapshot save failed (non-fatal):", e);
  });

  // Fetch portfolio history
  const history = await getPortfolioHistory(userId);

  // Fetch news in parallel (best-effort, rate-limit aware)
  const newsResults = await Promise.allSettled(
    enrichedHoldings.map((h) => getCachedNews(h.symbol)),
  );
  const allNews: NewsArticle[] = newsResults
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((a) => a.headline);

  // ── Build AI prompt ───────────────────────────────────────────────────────
  const lossRules = buildLossContextRules(enrichedHoldings);
  const historyNarrative = buildHistoryNarrative(history, totalValue);

  const systemPrompt = `You are a personalized investment advisor for BudgetSmart. You have access to the user's actual portfolio data including their real cost basis, current gains and losses, recent news about their holdings, and historical portfolio performance.

Your job is to give genuinely personalized advice that acknowledges their specific situation — not generic buy/sell signals. If someone is down significantly on a position, acknowledge that reality directly and give advice in that context. Be honest, empathetic, and specific.

Never give fake precision scores like "Confidence: 65%" or "Diversification Score: 40/100". Instead write like a knowledgeable advisor speaking directly to this specific person about their specific portfolio.

Always cite specific numbers from their portfolio. Always reference recent news when relevant. Format your response in clear sections using markdown headers.${lossRules ? `\n\nCritical loss context for this user:\n${lossRules}` : ""}`;

  const holdingsText = enrichedHoldings
    .map(
      (h) => `
${h.symbol} — ${h.shares} shares (${h.name})
  Current Price: $${h.currentPrice.toFixed(2)}
  My Avg Cost: $${h.avgCost.toFixed(2)}/share
  Current Value: $${h.marketValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  My Gain/Loss: $${h.gainLossDollars >= 0 ? "+" : ""}${h.gainLossDollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${h.gainLossPct >= 0 ? "+" : ""}${h.gainLossPct.toFixed(1)}%) — ${h.gainLossPct < -50 ? "⚠️ SIGNIFICANT LOSS" : h.gainLossPct < 0 ? "at a loss" : "profitable"}
  52-Week Range: $${h.week52Low > 0 ? h.week52Low.toFixed(2) : "N/A"} - $${h.week52High > 0 ? h.week52High.toFixed(2) : "N/A"}
  Current vs 52W High: ${h.vsHighPct !== 0 ? h.vsHighPct.toFixed(1) + "%" : "N/A"}`,
    )
    .join("\n");

  const newsText =
    allNews.length > 0
      ? allNews
          .map(
            (n) =>
              `${n.symbol}: "${n.headline}" (${n.source}, sentiment: ${n.sentiment}, ${n.timePublished})`,
          )
          .join("\n")
      : "No recent news available for your holdings.";

  const userPrompt = `Analyze my investment portfolio and give me personalized advice.

## My Portfolio Summary
Total Value: $${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Total Invested: $${totalCostBasis.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Total Gain/Loss: $${totalGainLoss >= 0 ? "+" : ""}${totalGainLoss.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${totalGainLossPct >= 0 ? "+" : ""}${totalGainLossPct.toFixed(1)}%)
${totalGainLoss >= 0 ? "My portfolio is currently profitable overall." : "My portfolio is currently underwater overall."}

## Portfolio Trend
${historyNarrative}

## My Holdings (with cost basis)
${holdingsText}

## Recent News For My Holdings
${newsText}

## What I Need
Please give me:

### 1. Portfolio Health Narrative
A frank assessment of how my portfolio is doing. Mention specific positions, cite the news, reference the trend. Talk to me like a real advisor, not a robo-advisor.

### 2. My Biggest Concerns (Holdings at a Loss)
For each position where I am down more than 15%:
- Acknowledge my actual loss in dollars
- Give context: is this company-specific or market-wide?
- Should I hold, cut losses, or average down?
- Reference any recent news about this holding
- Be direct and honest, not falsely optimistic

### 3. My Winners — What To Do
For positions where I am profitable:
- Should I take profits, hold, or add more?
- What's the risk of concentration?
- Reference relevant news

### 4. Portfolio Risks I Should Know About
Concentration risk, sector exposure, volatility, anything that stands out.

### 5. One Actionable Recommendation
The single most important thing I should consider doing with my portfolio this week. Be specific — not "consider diversifying" but reference actual positions and dollar amounts.`;

  let analysisContent = "";
  try {
    const result = await routeAI({
      taskSlot: "planning_advisor",
      userId,
      featureContext: "investment_advisor_full_analysis",
      maxTokens: 2000,
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    analysisContent = result.content;
  } catch (err) {
    console.error("[investment-advisor] AI call failed:", err);
    analysisContent = "Unable to generate analysis at this time. Please try again later.";
  }

  // ── Extract structured actions ────────────────────────────────────────────
  let actions: ActionItem[] = [];
  if (analysisContent && analysisContent.length > 100) {
    try {
      const actionResult = await routeAI({
        taskSlot: "planning_advisor",
        userId,
        featureContext: "investment_action_extraction",
        maxTokens: 400,
        temperature: 0.1,
        jsonMode: true,
        messages: [
          {
            role: "system",
            content:
              "Extract investment actions from the analysis. Return JSON only as an array of objects with keys: symbol, action, reasoning. action must be one of: HOLD, BUY_MORE, CONSIDER_SELLING, AVERAGE_DOWN, TAKE_PROFITS, MONITOR.",
          },
          {
            role: "user",
            content: `Based on this analysis:\n${analysisContent}\n\nReturn a JSON array like:\n[{"symbol":"AAPL","action":"HOLD","reasoning":"brief 1 sentence"}]\n\nOnly include symbols mentioned with clear recommendations. If no clear recommendation, use MONITOR.`,
          },
        ],
      });

      const parsed = JSON.parse(actionResult.content);
      if (Array.isArray(parsed)) {
        const validActions = ["HOLD", "BUY_MORE", "CONSIDER_SELLING", "AVERAGE_DOWN", "TAKE_PROFITS", "MONITOR"];
        actions = parsed
          .filter((a: any) => a.symbol && a.action && validActions.includes(a.action))
          .map((a: any) => ({
            symbol: String(a.symbol).toUpperCase(),
            action: String(a.action),
            reasoning: String(a.reasoning ?? ""),
          }));
      }
    } catch {
      // Non-fatal — action extraction is best-effort
    }
  }

  const advisorData: AdvisorData = {
    portfolio: {
      totalValue,
      totalCostBasis,
      totalGainLoss,
      totalGainLossPct,
      holdings: enrichedHoldings,
    },
    history,
    news: allNews,
    analysis: {
      content: analysisContent,
      generatedAt: new Date().toISOString(),
      fromCache: false,
    },
    actions,
  };

  // Cache for 30 minutes
  advisorCache.set(userId, {
    data: advisorData,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return advisorData;
}

export function invalidateAdvisorCache(userId: string): void {
  advisorCache.delete(userId);
}

// ─── Chat helper ─────────────────────────────────────────────────────────────
export interface ChatMessage {
  role: "user" | "advisor";
  content: string;
}

export async function advisorChat(
  userId: string,
  question: string,
  chatHistory: ChatMessage[],
  portfolioContextSummary: string,
  systemPrompt: string,
): Promise<string> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: portfolioContextSummary },
    {
      role: "assistant",
      content:
        "I have reviewed your portfolio and am ready to answer your questions.",
    },
    ...chatHistory.map((m) => ({
      role: (m.role === "advisor" ? "assistant" : "user") as "assistant" | "user",
      content: m.content,
    })),
    { role: "user", content: question },
  ];

  const result = await routeAI({
    taskSlot: "planning_advisor",
    userId,
    featureContext: "investment_chat",
    maxTokens: 800,
    temperature: 0.5,
    messages,
  });

  return result.content;
}
