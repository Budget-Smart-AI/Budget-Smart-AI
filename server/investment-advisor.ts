/**
 * AI Investment Advisor
 * Analyzes portfolio holdings and provides buy/sell recommendations
 */

import { openai } from "./openai";
import { storage } from "./storage";
import { getStockAnalysis, generateAnalysisSummary, type StockQuote, type CompanyOverview, type TechnicalIndicator } from "./alpha-vantage";
import type { Holding, InvestmentAccount } from "@shared/schema";

export interface HoldingAnalysis {
  holdingId: string;
  symbol: string;
  name: string;
  currentPrice: number | null;
  yourCostBasis: number;
  quantity: number;
  currentValue: number;
  gainLoss: number;
  gainLossPercent: number;
  technicalAnalysis: string;
  recommendation: "strong_buy" | "buy" | "hold" | "sell" | "strong_sell";
  reasoning: string;
  riskLevel: "low" | "medium" | "high";
  confidence: number; // 0-100
}

export interface PortfolioAnalysis {
  totalValue: number;
  totalCostBasis: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  holdings: HoldingAnalysis[];
  overallRecommendation: string;
  diversificationScore: number; // 0-100
  riskAssessment: string;
  actionItems: string[];
  marketOutlook: string;
  generatedAt: string;
}

/**
 * Analyze a single holding with technical indicators
 */
async function analyzeHolding(holding: Holding): Promise<HoldingAnalysis> {
  const analysis = await getStockAnalysis(holding.symbol);
  const technicalSummary = analysis ? generateAnalysisSummary(analysis) : "Technical data unavailable";

  const currentPrice = analysis?.quote?.price || parseFloat(holding.currentPrice || "0");
  const costBasis = parseFloat(holding.costBasis || "0");
  const quantity = parseFloat(holding.quantity);
  const currentValue = currentPrice * quantity;
  const gainLoss = currentValue - costBasis;
  const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

  // Default values - AI will override these
  let recommendation: HoldingAnalysis["recommendation"] = "hold";
  let reasoning = "Analysis pending";
  let riskLevel: HoldingAnalysis["riskLevel"] = "medium";
  let confidence = 50;

  // Generate recommendation based on technical indicators
  if (analysis?.rsi && analysis?.sma50 && analysis?.sma200 && analysis?.quote) {
    const rsi = analysis.rsi.value;
    const price = analysis.quote.price;
    const sma50 = analysis.sma50.value;
    const sma200 = analysis.sma200.value;

    // Technical scoring
    let score = 0;

    // RSI signals
    if (rsi < 30) score += 2; // Oversold - buy signal
    else if (rsi < 40) score += 1;
    else if (rsi > 70) score -= 2; // Overbought - sell signal
    else if (rsi > 60) score -= 1;

    // Moving average signals
    if (price > sma50 && price > sma200) score += 1; // Above both MAs - bullish
    else if (price < sma50 && price < sma200) score -= 1; // Below both MAs - bearish

    // Golden/Death Cross
    if (sma50 > sma200) score += 1; // Golden Cross - bullish
    else score -= 1; // Death Cross - bearish

    // Analyst target (if available)
    if (analysis.overview?.analystTargetPrice) {
      const upside = (analysis.overview.analystTargetPrice - price) / price;
      if (upside > 0.2) score += 2;
      else if (upside > 0.1) score += 1;
      else if (upside < -0.1) score -= 1;
      else if (upside < -0.2) score -= 2;
    }

    // Map score to recommendation
    if (score >= 3) {
      recommendation = "strong_buy";
      confidence = 80;
    } else if (score >= 1) {
      recommendation = "buy";
      confidence = 65;
    } else if (score <= -3) {
      recommendation = "strong_sell";
      confidence = 80;
    } else if (score <= -1) {
      recommendation = "sell";
      confidence = 65;
    } else {
      recommendation = "hold";
      confidence = 50;
    }

    // Risk assessment based on beta and volatility
    const beta = analysis.overview?.beta || 1;
    if (beta > 1.5) riskLevel = "high";
    else if (beta < 0.8) riskLevel = "low";
    else riskLevel = "medium";

    // Generate reasoning
    const reasons: string[] = [];
    if (rsi < 30) reasons.push("RSI indicates oversold conditions");
    if (rsi > 70) reasons.push("RSI indicates overbought conditions");
    if (price > sma200) reasons.push("Price above 200-day moving average (bullish)");
    if (price < sma200) reasons.push("Price below 200-day moving average (bearish)");
    if (sma50 > sma200) reasons.push("Golden Cross pattern detected");
    if (sma50 < sma200) reasons.push("Death Cross pattern detected");
    if (analysis.overview?.analystTargetPrice) {
      const upside = ((analysis.overview.analystTargetPrice - price) / price * 100).toFixed(1);
      reasons.push(`Analyst target suggests ${upside}% potential`);
    }

    reasoning = reasons.length > 0 ? reasons.join(". ") + "." : "Insufficient signals for strong conviction.";
  }

  return {
    holdingId: holding.id,
    symbol: holding.symbol,
    name: holding.name,
    currentPrice,
    yourCostBasis: costBasis,
    quantity,
    currentValue,
    gainLoss,
    gainLossPercent,
    technicalAnalysis: technicalSummary,
    recommendation,
    reasoning,
    riskLevel,
    confidence,
  };
}

/**
 * Generate comprehensive portfolio analysis with AI insights
 */
export async function analyzePortfolio(userId: string): Promise<PortfolioAnalysis | null> {
  try {
    const holdings = await storage.getHoldingsByUser(userId);

    if (holdings.length === 0) {
      return null;
    }

    // Analyze each holding
    const holdingAnalyses: HoldingAnalysis[] = [];
    for (const holding of holdings) {
      const analysis = await analyzeHolding(holding);
      holdingAnalyses.push(analysis);
    }

    // Calculate portfolio totals
    const totalValue = holdingAnalyses.reduce((sum, h) => sum + h.currentValue, 0);
    const totalCostBasis = holdingAnalyses.reduce((sum, h) => sum + h.yourCostBasis, 0);
    const totalGainLoss = totalValue - totalCostBasis;
    const totalGainLossPercent = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

    // Calculate diversification score (simple version based on holding count and allocation)
    const holdingCount = holdingAnalyses.length;
    const maxAllocation = holdingAnalyses.length > 0
      ? Math.max(...holdingAnalyses.map(h => h.currentValue / totalValue * 100))
      : 100;

    // Diversification: more holdings and lower max allocation = better
    let diversificationScore = Math.min(100, holdingCount * 10); // Up to 50 points for count
    if (maxAllocation < 20) diversificationScore += 50;
    else if (maxAllocation < 30) diversificationScore += 35;
    else if (maxAllocation < 50) diversificationScore += 20;
    diversificationScore = Math.min(100, diversificationScore);

    // Generate action items
    const actionItems: string[] = [];

    const strongSells = holdingAnalyses.filter(h => h.recommendation === "strong_sell");
    const strongBuys = holdingAnalyses.filter(h => h.recommendation === "strong_buy");
    const sells = holdingAnalyses.filter(h => h.recommendation === "sell");
    const buys = holdingAnalyses.filter(h => h.recommendation === "buy");

    if (strongSells.length > 0) {
      actionItems.push(`Consider selling: ${strongSells.map(h => h.symbol).join(", ")} - showing strong bearish signals`);
    }
    if (sells.length > 0) {
      actionItems.push(`Review for potential sale: ${sells.map(h => h.symbol).join(", ")}`);
    }
    if (strongBuys.length > 0) {
      actionItems.push(`Strong buying opportunity: ${strongBuys.map(h => h.symbol).join(", ")}`);
    }
    if (buys.length > 0) {
      actionItems.push(`Consider adding to: ${buys.map(h => h.symbol).join(", ")}`);
    }

    if (maxAllocation > 30) {
      const topHolding = holdingAnalyses.find(h => h.currentValue / totalValue * 100 >= maxAllocation);
      if (topHolding) {
        actionItems.push(`${topHolding.symbol} represents ${maxAllocation.toFixed(1)}% of portfolio - consider rebalancing`);
      }
    }

    if (diversificationScore < 50) {
      actionItems.push("Portfolio diversification is low - consider adding positions in different sectors");
    }

    // Risk assessment
    const highRiskCount = holdingAnalyses.filter(h => h.riskLevel === "high").length;
    const lowRiskCount = holdingAnalyses.filter(h => h.riskLevel === "low").length;

    let riskAssessment: string;
    if (highRiskCount > holdingAnalyses.length / 2) {
      riskAssessment = "High - Portfolio is heavily weighted toward volatile stocks";
    } else if (lowRiskCount > holdingAnalyses.length / 2) {
      riskAssessment = "Low - Portfolio consists mainly of stable, low-beta investments";
    } else {
      riskAssessment = "Moderate - Portfolio has a balanced mix of risk levels";
    }

    // Overall recommendation
    const avgScore = holdingAnalyses.reduce((sum, h) => {
      const scores = { strong_buy: 2, buy: 1, hold: 0, sell: -1, strong_sell: -2 };
      return sum + scores[h.recommendation];
    }, 0) / holdingAnalyses.length;

    let overallRecommendation: string;
    if (avgScore > 1) overallRecommendation = "Portfolio shows strong bullish signals overall. Consider adding to winning positions.";
    else if (avgScore > 0.3) overallRecommendation = "Portfolio outlook is cautiously optimistic. Hold current positions and watch for buying opportunities.";
    else if (avgScore < -1) overallRecommendation = "Portfolio shows bearish signals. Consider reducing exposure and taking profits where available.";
    else if (avgScore < -0.3) overallRecommendation = "Portfolio has mixed signals with slight bearish tilt. Review underperforming positions.";
    else overallRecommendation = "Portfolio is in a neutral state. Maintain current positions and wait for clearer signals.";

    // Market outlook (simplified)
    const marketOutlook = "Based on your holdings' technical indicators, the overall market sentiment appears mixed. Monitor key economic indicators and earnings reports for directional clarity.";

    return {
      totalValue,
      totalCostBasis,
      totalGainLoss,
      totalGainLossPercent,
      holdings: holdingAnalyses,
      overallRecommendation,
      diversificationScore,
      riskAssessment,
      actionItems,
      marketOutlook,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error analyzing portfolio:", error);
    return null;
  }
}

/**
 * Get AI-generated detailed analysis for a specific holding
 */
export async function getDetailedHoldingAnalysis(
  holding: Holding,
  analysis: HoldingAnalysis
): Promise<string> {
  try {
    const prompt = `You are an expert investment advisor. Analyze this stock holding and provide actionable advice.

Stock: ${holding.symbol} (${holding.name})
Holding Type: ${holding.holdingType}
Quantity: ${analysis.quantity}
Cost Basis: $${analysis.yourCostBasis.toFixed(2)}
Current Value: $${analysis.currentValue.toFixed(2)}
Gain/Loss: ${analysis.gainLoss >= 0 ? '+' : ''}$${analysis.gainLoss.toFixed(2)} (${analysis.gainLossPercent.toFixed(2)}%)

Technical Analysis:
${analysis.technicalAnalysis}

Current Recommendation: ${analysis.recommendation.toUpperCase()}
Risk Level: ${analysis.riskLevel}

Based on this data, provide:
1. A brief analysis of the current position (2-3 sentences)
2. Key factors to watch (3-4 bullet points)
3. Specific action recommendation with reasoning
4. Risk considerations

Be concise and actionable. Focus on practical advice for a retail investor.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    return response.choices[0]?.message?.content || "Unable to generate detailed analysis.";
  } catch (error) {
    console.error("Error generating detailed analysis:", error);
    return "Unable to generate detailed analysis at this time.";
  }
}

/**
 * Get AI investment coaching/advice
 */
export async function getInvestmentAdvice(
  userId: string,
  question: string,
  portfolioContext?: PortfolioAnalysis
): Promise<string> {
  try {
    let contextStr = "";
    if (portfolioContext) {
      const holdingSummary = portfolioContext.holdings
        .map(h => `- ${h.symbol}: ${h.recommendation} (${h.gainLossPercent.toFixed(1)}% gain/loss)`)
        .join("\n");

      contextStr = `
User's Portfolio Summary:
Total Value: $${portfolioContext.totalValue.toFixed(2)}
Total Gain/Loss: ${portfolioContext.totalGainLoss >= 0 ? '+' : ''}$${portfolioContext.totalGainLoss.toFixed(2)} (${portfolioContext.totalGainLossPercent.toFixed(2)}%)
Diversification Score: ${portfolioContext.diversificationScore}/100
Risk Assessment: ${portfolioContext.riskAssessment}

Holdings:
${holdingSummary}

Current Recommendations:
${portfolioContext.actionItems.join("\n")}
`;
    }

    const prompt = `You are a knowledgeable investment advisor helping a retail investor. ${contextStr}

User Question: ${question}

Provide helpful, educational advice. Be specific but remind them that this is not personalized financial advice and they should consider consulting a licensed financial advisor for major decisions. Keep response under 300 words.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    return response.choices[0]?.message?.content || "Unable to generate advice at this time.";
  } catch (error) {
    console.error("Error generating investment advice:", error);
    return "Unable to generate advice at this time. Please try again later.";
  }
}
