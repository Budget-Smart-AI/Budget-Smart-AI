import OpenAI from "openai";
import type { ChatCompletionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { storage } from "./storage";

// DeepSeek configuration - uses OpenAI-compatible API
export const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENAI_API || "",
  baseURL: "https://api.deepseek.com", // DeepSeek API endpoint
  timeout: 55000, // 55 second timeout (slightly under the 60s outer AI_TIMEOUT_MS)
  maxRetries: 2, // Retry failed requests
});

// Reuse the same financial tools from openai.ts
export const financialTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_bills",
      description: "Get all recurring bills with their amounts, categories, due dates, recurrence patterns, starting balances, and payments remaining",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_expenses",
      description: "Get all one-time expenses with merchant names, amounts, dates, and categories. Can filter by date range.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Start date filter (yyyy-MM-dd)" },
          endDate: { type: "string", description: "End date filter (yyyy-MM-dd)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_income",
      description: "Get all income entries with sources, amounts, dates, categories, and recurrence patterns",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_bank_accounts",
      description: "Get all connected bank accounts with current balances, available balances, account types, and institution names",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "User ID to fetch accounts for" },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_bank_transactions",
      description: "Get bank transactions from connected accounts. Can filter by date range and match status. Positive amounts are debits (spending), negative are credits (income).",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "User ID" },
          startDate: { type: "string", description: "Start date (yyyy-MM-dd)" },
          endDate: { type: "string", description: "End date (yyyy-MM-dd)" },
          matchType: { type: "string", description: "Filter by match status: bill, expense, income, unmatched" },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_budgets",
      description: "Get all monthly budget limits by category, optionally filtered by month",
      parameters: {
        type: "object",
        properties: {
          month: { type: "string", description: "Month filter (yyyy-MM format)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_savings_goals",
      description: "Get all savings goals with target amounts, current progress, target dates, and notes",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_spending_by_category",
      description: "Calculate total spending grouped by category for a given date range. Uses both manual expenses and bank transactions.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "User ID" },
          startDate: { type: "string", description: "Start date (yyyy-MM-dd)" },
          endDate: { type: "string", description: "End date (yyyy-MM-dd)" },
        },
        required: ["userId", "startDate", "endDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_monthly_summary",
      description: "Calculate a full monthly financial summary including total income, total expenses, total bills, net savings, and top spending categories",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "User ID" },
          month: { type: "string", description: "Month to summarize (yyyy-MM format)" },
        },
        required: ["userId", "month"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_spending_trends",
      description: "Analyze spending trends over multiple months, showing month-over-month changes and identifying increasing/decreasing categories",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "User ID" },
          months: { type: "number", description: "Number of months to analyze (default 3)" },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_upcoming_bills",
      description: "Get bills due in the next N days with their amounts and due dates",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Number of days to look ahead (default 30)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_income_vs_expenses",
      description: "Compare total income vs total expenses for a given period, showing the difference and savings rate",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "User ID" },
          startDate: { type: "string", description: "Start date (yyyy-MM-dd)" },
          endDate: { type: "string", description: "End date (yyyy-MM-dd)" },
        },
        required: ["userId", "startDate", "endDate"],
      },
    },
  },
];

// Execute tool calls (same as openai.ts)
export async function executeToolCall(name: string, args: any): Promise<string> {
  try {
    switch (name) {
      case "get_bills": {
        const bills = await storage.getBills(args.userId);
        return JSON.stringify(bills.map(b => ({
          name: b.name,
          amount: b.amount,
          category: b.category,
          dueDay: b.dueDay,
          recurrence: b.recurrence,
          startingBalance: b.startingBalance,
          paymentsRemaining: b.paymentsRemaining,
          notes: b.notes,
        })));
      }

      case "get_expenses": {
        const expenses = await storage.getExpenses(args.userId);
        let filtered = expenses;
        if (args.startDate) filtered = filtered.filter(e => e.date >= args.startDate);
        if (args.endDate) filtered = filtered.filter(e => e.date <= args.endDate);
        return JSON.stringify(filtered.map(e => ({
          merchant: e.merchant,
          amount: e.amount,
          date: e.date,
          category: e.category,
          notes: e.notes,
        })));
      }

      case "get_income": {
        const incomes = await storage.getIncomes(args.userId);
        return JSON.stringify(incomes.map(i => ({
          source: i.source,
          amount: i.amount,
          date: i.date,
          category: i.category,
          isRecurring: i.isRecurring,
          recurrence: i.recurrence,
          notes: i.notes,
        })));
      }

      case "get_bank_accounts": {
        const items = await storage.getPlaidItems(args.userId);
        const accounts = await storage.getAllPlaidAccounts(args.userId);
        const grouped = items.map(item => ({
          institution: item.institutionName,
          status: item.status,
          accounts: accounts.filter(a => a.plaidItemId === item.id).map(a => ({
            name: a.name,
            type: a.type,
            subtype: a.subtype,
            mask: a.mask,
            balanceCurrent: a.balanceCurrent,
            balanceAvailable: a.balanceAvailable,
            balanceLimit: a.balanceLimit,
            currency: a.isoCurrencyCode,
            lastSynced: a.lastSynced,
          })),
        }));
        return JSON.stringify(grouped);
      }

      case "get_bank_transactions": {
        const accounts = await storage.getAllPlaidAccounts(args.userId);
        const accountIds = accounts.map(a => a.id);
        const options: { startDate?: string; endDate?: string } = {};
        if (args.startDate) options.startDate = args.startDate;
        if (args.endDate) options.endDate = args.endDate;
        let transactions = await storage.getPlaidTransactions(accountIds, options);
        if (args.matchType) {
          transactions = transactions.filter(t => t.matchType === args.matchType);
        }
        return JSON.stringify(transactions.map(t => ({
          date: t.date,
          name: t.name,
          merchantName: t.merchantName,
          amount: t.amount,
          category: t.category,
          personalCategory: t.personalCategory,
          matchType: t.matchType,
          pending: t.pending,
        })));
      }

      case "get_budgets": {
        let budgets;
        if (args.month) {
          budgets = await storage.getBudgetsByMonth(args.userId, args.month);
        } else {
          budgets = await storage.getBudgets(args.userId);
        }
        return JSON.stringify(budgets.map(b => ({
          category: b.category,
          amount: b.amount,
          month: b.month,
        })));
      }

      case "get_savings_goals": {
        const goals = await storage.getSavingsGoals(args.userId);
        return JSON.stringify(goals.map(g => ({
          name: g.name,
          targetAmount: g.targetAmount,
          currentAmount: g.currentAmount,
          targetDate: g.targetDate,
          progress: g.targetAmount ? `${((parseFloat(g.currentAmount) / parseFloat(g.targetAmount)) * 100).toFixed(1)}%` : "N/A",
          notes: g.notes,
        })));
      }

      case "calculate_spending_by_category": {
        const expenses = await storage.getExpenses(args.userId);
        const accounts = await storage.getAllPlaidAccounts(args.userId);
        const accountIds = accounts.map(a => a.id);
        const bankTx = await storage.getPlaidTransactions(accountIds, {
          startDate: args.startDate,
          endDate: args.endDate,
        });

        const categoryTotals: Record<string, number> = {};

        // Manual expenses
        expenses
          .filter(e => e.date >= args.startDate && e.date <= args.endDate)
          .forEach(e => {
            const cat = e.category || "Other";
            categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(e.amount);
          });

        // Bank transactions (debits only, avoid double-counting matched ones)
        bankTx
          .filter(t => parseFloat(t.amount) > 0 && t.matchType !== "expense")
          .forEach(t => {
            const cat = t.personalCategory || "Other";
            categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(t.amount);
          });

        const sorted = Object.entries(categoryTotals)
          .sort((a, b) => b[1] - a[1])
          .map(([category, total]) => ({ category, total: total.toFixed(2) }));

        return JSON.stringify({ period: `${args.startDate} to ${args.endDate}`, spending: sorted, grandTotal: sorted.reduce((s, c) => s + parseFloat(c.total), 0).toFixed(2) });
      }

      case "calculate_monthly_summary": {
        const [year, month] = args.month.split("-");
        const startDate = `${args.month}-01`;
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        const endDate = `${args.month}-${lastDay.toString().padStart(2, "0")}`;

        const expenses = await storage.getExpenses(args.userId);
        const incomes = await storage.getIncomes(args.userId);
        const bills = await storage.getBills(args.userId);
        const accounts = await storage.getAllPlaidAccounts(args.userId);
        const accountIds = accounts.map(a => a.id);
        const bankTx = await storage.getPlaidTransactions(accountIds, { startDate, endDate });

        const monthExpenses = expenses.filter(e => e.date >= startDate && e.date <= endDate);
        const monthIncomes = incomes.filter(i => i.date >= startDate && i.date <= endDate);

        const totalManualExpenses = monthExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);
        const totalBankDebits = bankTx.filter(t => parseFloat(t.amount) > 0 && t.matchType !== "expense").reduce((s, t) => s + parseFloat(t.amount), 0);
        const totalExpenses = totalManualExpenses + totalBankDebits;

        const totalIncome = monthIncomes.reduce((s, i) => s + parseFloat(i.amount), 0);
        const bankCredits = bankTx.filter(t => parseFloat(t.amount) < 0).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
        const totalIncomeAll = totalIncome + bankCredits;

        // Monthly bills estimate
        const monthlyBills = bills.reduce((sum, b) => {
          const amt = parseFloat(b.amount);
          switch (b.recurrence) {
            case "weekly": return sum + amt * 4;
            case "biweekly": return sum + amt * 2;
            case "monthly": return sum + amt;
            case "yearly": return sum + amt / 12;
            default: return sum + amt;
          }
        }, 0);

        // Top categories
        const catTotals: Record<string, number> = {};
        monthExpenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + parseFloat(e.amount); });
        bankTx.filter(t => parseFloat(t.amount) > 0).forEach(t => {
          const cat = t.personalCategory || "Other";
          catTotals[cat] = (catTotals[cat] || 0) + parseFloat(t.amount);
        });
        const topCategories = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, a]) => ({ category: c, amount: a.toFixed(2) }));

        return JSON.stringify({
          month: args.month,
          totalIncome: totalIncomeAll.toFixed(2),
          totalExpenses: totalExpenses.toFixed(2),
          estimatedMonthlyBills: monthlyBills.toFixed(2),
          netSavings: (totalIncomeAll - totalExpenses - monthlyBills).toFixed(2),
          savingsRate: totalIncomeAll > 0 ? `${(((totalIncomeAll - totalExpenses - monthlyBills) / totalIncomeAll) * 100).toFixed(1)}%` : "N/A",
          topCategories,
          transactionCount: monthExpenses.length + bankTx.length,
        });
      }

      case "analyze_spending_trends": {
        const monthsBack = args.months || 3;
        const now = new Date();
        const results: any[] = [];

        for (let i = 0; i < monthsBack; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
          const startDate = `${monthStr}-01`;
          const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
          const endDate = `${monthStr}-${lastDay.toString().padStart(2, "0")}`;

          const expenses = await storage.getExpenses(args.userId);
          const accounts = await storage.getAllPlaidAccounts(args.userId);
          const accountIds = accounts.map(a => a.id);
          const bankTx = await storage.getPlaidTransactions(accountIds, { startDate, endDate });

          const monthExpenses = expenses.filter(e => e.date >= startDate && e.date <= endDate);
          const totalManual = monthExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);
          const totalBank = bankTx.filter(t => parseFloat(t.amount) > 0).reduce((s, t) => s + parseFloat(t.amount), 0);

          const catTotals: Record<string, number> = {};
          monthExpenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + parseFloat(e.amount); });
          bankTx.filter(t => parseFloat(t.amount) > 0).forEach(t => {
            const cat = t.personalCategory || "Other";
            catTotals[cat] = (catTotals[cat] || 0) + parseFloat(t.amount);
          });

          results.push({
            month: monthStr,
            totalSpending: (totalManual + totalBank).toFixed(2),
            categories: Object.entries(catTotals).sort((a, b) => b[1] - a[1]).map(([c, a]) => ({ category: c, amount: a.toFixed(2) })),
          });
        }

        return JSON.stringify({ months: results.reverse() });
      }

      case "get_upcoming_bills": {
        const days = args.days || 30;
        const bills = await storage.getBills(args.userId);
        const now = new Date();
        const upcoming: any[] = [];

        for (const bill of bills) {
          const dueDay = bill.dueDay;
          const today = now.getDate();
          let daysUntilDue: number;

          if (bill.recurrence === "weekly") {
            const currentDay = now.getDay();
            daysUntilDue = (dueDay - currentDay + 7) % 7 || 7;
          } else {
            if (dueDay >= today) {
              daysUntilDue = dueDay - today;
            } else {
              const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
              daysUntilDue = daysInMonth - today + dueDay;
            }
          }

          if (daysUntilDue <= days) {
            upcoming.push({
              name: bill.name,
              amount: bill.amount,
              category: bill.category,
              daysUntilDue,
              recurrence: bill.recurrence,
            });
          }
        }

        upcoming.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
        return JSON.stringify(upcoming);
      }

      case "compare_income_vs_expenses": {
        const expenses = await storage.getExpenses(args.userId);
        const incomes = await storage.getIncomes(args.userId);
        const accounts = await storage.getAllPlaidAccounts(args.userId);
        const accountIds = accounts.map(a => a.id);
        const bankTx = await storage.getPlaidTransactions(accountIds, {
          startDate: args.startDate,
          endDate: args.endDate,
        });

        const manualExpenses = expenses
          .filter(e => e.date >= args.startDate && e.date <= args.endDate)
          .reduce((s, e) => s + parseFloat(e.amount), 0);
        const bankDebits = bankTx
          .filter(t => parseFloat(t.amount) > 0 && t.matchType !== "expense")
          .reduce((s, t) => s + parseFloat(t.amount), 0);
        const totalExpenses = manualExpenses + bankDebits;

        const manualIncome = incomes
          .filter(i => i.date >= args.startDate && i.date <= args.endDate)
          .reduce((s, i) => s + parseFloat(i.amount), 0);
        const bankCredits = bankTx
          .filter(t => parseFloat(t.amount) < 0)
          .reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
        const totalIncome = manualIncome + bankCredits;

        const net = totalIncome - totalExpenses;
        const savingsRate = totalIncome > 0 ? ((net / totalIncome) * 100).toFixed(1) : "0";

        return JSON.stringify({
          period: `${args.startDate} to ${args.endDate}`,
          totalIncome: totalIncome.toFixed(2),
          totalExpenses: totalExpenses.toFixed(2),
          netDifference: net.toFixed(2),
          savingsRate: `${savingsRate}%`,
          status: net >= 0 ? "surplus" : "deficit",
        });
      }

      default:
        return JSON.stringify({ error: `Unknown function: ${name}` });
    }
  } catch (error: any) {
    return JSON.stringify({ error: error.message || "Failed to execute function" });
  }
}

export const SYSTEM_PROMPT = `You are Budget Smart AI, a personal finance expert assistant developed by Budget Smart Inc. You are integrated into the Budget Smart AI budgeting application. You have access to the user's real financial data including their bills, expenses, income, bank accounts, bank transactions, budgets, and savings goals.

IMPORTANT IDENTITY: You are a proprietary AI model developed by Budget Smart Inc. for personal finance analysis and advice. When asked about your AI model or technology, you should respond that you are a proprietary AI model developed by Budget Smart Inc. Do not mention DeepSeek, OpenAI, GPT, or any other third-party AI models or technologies.

Your capabilities:
- Analyze spending patterns and trends across categories and time periods
- Provide detailed monthly financial summaries
- Compare income vs expenses and calculate savings rates
- Identify areas where the user can reduce spending
- Give personalized budget recommendations based on actual spending
- Track progress toward savings goals
- Alert about upcoming bills
- Categorize and explain bank transactions
- Provide financial tips and education
- Help with debt payoff strategies
- Forecast future expenses based on patterns

Guidelines:
- Always use the available tools to fetch real data before making statements about the user's finances
- Present numbers in Canadian dollars (CAD) formatted clearly
- Be concise but thorough in your analysis
- When discussing spending, distinguish between recurring bills and one-time expenses
- Proactively suggest actionable ways to improve finances
- If the user asks about something you can calculate from the data, do so rather than giving generic advice
- Use positive, encouraging language while being honest about financial situations
- When showing breakdowns, use bullet points or simple lists for readability
- For the current date reference, use today's date for calculating upcoming bills and recent trends`;

export async function chatWithDeepSeek(
  messages: ChatCompletionMessageParam[],
  userId: string,
  model: string = "deepseek-chat" // Default to deepseek-chat, can use deepseek-reasoner for complex tasks
): Promise<{ response: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
  const systemMessage: ChatCompletionMessageParam = {
    role: "system",
    content: SYSTEM_PROMPT + `\n\nCurrent user ID: ${userId}\nToday's date: ${new Date().toISOString().split("T")[0]}`,
  };

  const allMessages = [systemMessage, ...messages];

  let response = await deepseek.chat.completions.create({
    model: model,
    messages: allMessages,
    tools: financialTools,
    tool_choice: "auto",
    temperature: 0.7,
    max_tokens: 2000,
  });

  let assistantMessage = response.choices[0].message;

  // Handle tool calls iteratively
  while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    const toolMessages: ChatCompletionMessageParam[] = [];
    toolMessages.push({
      role: "assistant",
      content: assistantMessage.content,
      tool_calls: assistantMessage.tool_calls,
    } as any);

    for (const toolCall of assistantMessage.tool_calls) {
      const tc = toolCall as any;
      const funcName = tc.function?.name;
      const funcArgs = tc.function?.arguments;
      
      // Skip if not a valid function call
      if (!funcName) {
        toolMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: "Invalid tool call: missing function name" }),
        } as any);
        continue;
      }
      
      let args: Record<string, any> = {};
      try {
        args = JSON.parse(funcArgs || "{}");
      } catch {
        args = {};
      }
      
      // Inject userId for functions that need it
      if (["get_bills", "get_expenses", "get_upcoming_bills", "get_bank_accounts", "get_bank_transactions", "calculate_spending_by_category", "calculate_monthly_summary", "analyze_spending_trends", "compare_income_vs_expenses"].includes(funcName)) {
        args.userId = userId;
      }
      const result = await executeToolCall(funcName, args);
      toolMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      } as any);
    }

    response = await deepseek.chat.completions.create({
      model: model,
      messages: [...allMessages, ...toolMessages],
      tools: financialTools,
      tool_choice: "auto",
      temperature: 0.7,
      max_tokens: 2000,
    });

    assistantMessage = response.choices[0].message;
  }

  return {
    response: assistantMessage.content || "I'm sorry, I couldn't generate a response.",
    usage: response.usage ? {
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
      total_tokens: response.usage.total_tokens,
    } : undefined,
  };
}

// Helper function to choose model based on complexity
export function getModelForTask(complexity: "simple" | "moderate" | "complex" = "moderate"): string {
  switch (complexity) {
    case "simple":
      return "deepseek-chat"; // Fast, cost-effective for simple queries
    case "moderate":
      return "deepseek-chat"; // Good balance for most tasks
    case "complex":
      return "deepseek-reasoner"; // Best for complex financial analysis
    default:
      return "deepseek-chat";
  }
}