import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard,
  Bot,
  BarChart3,
  DollarSign,
  CreditCard,
  Receipt,
  RefreshCw,
  Building2,
  Wallet,
  PieChart,
  Target,
  Tag,
  Settings,
  Mail,
  HelpCircle,
  Search,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Brain,
  Zap,
  Sparkles,
} from "lucide-react";

interface HelpSection {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  summary: string;
  content: {
    description: string;
    features: string[];
    tips: string[];
  };
}

const helpSections: HelpSection[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    icon: LayoutDashboard,
    color: "text-blue-500",
    summary: "Your financial overview at a glance",
    content: {
      description:
        "The Dashboard provides a comprehensive snapshot of your financial health. View your total income, expenses, upcoming bills, and net savings all in one place. The dashboard updates in real-time as you add or modify transactions.",
      features: [
        "Monthly income and expense totals with trend indicators",
        "Upcoming bills due within the next 7 days",
        "Net savings calculation (income minus expenses)",
        "Quick access to recent transactions",
        "Visual spending breakdown by category",
      ],
      tips: [
        "Check your dashboard daily to stay on top of upcoming bills",
        "Use the trend indicators to see if your spending is increasing or decreasing month over month",
        "The net savings card shows your overall financial direction",
      ],
    },
  },
  {
    id: "ai-assistant",
    title: "AI Assistant",
    icon: Bot,
    color: "text-violet-500",
    summary: "Get personalized financial advice powered by AI",
    content: {
      description:
        "The AI Assistant is your personal finance advisor. It has access to your real financial data and can analyze spending patterns, suggest budget optimizations, and answer questions about your finances. Ask it anything about your money.",
      features: [
        "Natural language conversations about your finances",
        "Spending pattern analysis and insights",
        "Budget optimization suggestions",
        "Bill payment reminders and alerts",
        "Savings goal recommendations",
        "Category-wise expense breakdowns on demand",
      ],
      tips: [
        "Try asking 'How much did I spend on dining this month?'",
        "Ask for a monthly financial summary to get an overview",
        "Request savings tips based on your actual spending patterns",
        "Use suggested prompts for quick insights",
      ],
    },
  },
  {
    id: "reports",
    title: "Reports",
    icon: BarChart3,
    color: "text-emerald-500",
    summary: "Detailed financial analytics and visualizations",
    content: {
      description:
        "Reports provide detailed analytics about your income, expenses, and financial trends over time. View monthly and yearly breakdowns, compare spending across categories, and export data for external use.",
      features: [
        "Monthly and yearly income/expense summaries",
        "Category-wise spending breakdown with visual charts",
        "Month-over-month trend analysis",
        "Income vs. expense comparison",
        "Data export functionality",
        "Navigate between months and years easily",
      ],
      tips: [
        "Review reports monthly to identify spending trends",
        "Compare categories month-over-month to spot unusual spending",
        "Export reports for tax preparation or financial planning",
      ],
    },
  },
  {
    id: "income",
    title: "Income",
    icon: DollarSign,
    color: "text-green-500",
    summary: "Track all your income sources",
    content: {
      description:
        "The Income section lets you record all sources of income including salary, freelance work, investments, and more. Support for both one-time and recurring income helps you maintain an accurate financial picture.",
      features: [
        "Add one-time or recurring income entries",
        "Categorize income by source type",
        "Set recurrence patterns (weekly, bi-weekly, monthly, yearly)",
        "Track income trends over time",
        "Edit or delete income records as needed",
      ],
      tips: [
        "Set up recurring income for your regular salary to avoid manual entry each month",
        "Include all income sources for an accurate financial picture",
        "Use categories to distinguish between different income types",
      ],
    },
  },
  {
    id: "expenses",
    title: "Expenses",
    icon: CreditCard,
    color: "text-red-500",
    summary: "Log and categorize your spending",
    content: {
      description:
        "Track your day-to-day spending by logging expenses with merchant details, amounts, and categories. Expenses are displayed in a monthly view and can be filtered and sorted to help you understand your spending habits.",
      features: [
        "Log expenses with merchant, amount, date, and category",
        "Monthly view with easy month-to-month navigation",
        "Category-based organization for spending analysis",
        "Edit or delete expense entries",
        "Running monthly total displayed prominently",
        "Notes field for additional context",
      ],
      tips: [
        "Log expenses as they happen to maintain accuracy",
        "Use consistent category names for better reporting",
        "Add notes to remember what purchases were for",
        "Review monthly totals against your budget targets",
      ],
    },
  },
  {
    id: "bills",
    title: "Bills",
    icon: Receipt,
    color: "text-orange-500",
    summary: "Manage scheduled recurring payments",
    content: {
      description:
        "Bills are meant for scheduled, recurring payments that you manage outside the app - things like rent, utilities, insurance, and loan payments. Enter them here to match what you've set up through your bank or payment provider, so Budget Smart AI can track due dates and send you reminders before payments are due.",
      features: [
        "Track recurring bills with custom due dates",
        "Set recurrence patterns (monthly, weekly, bi-weekly, yearly)",
        "Categorize bills (utilities, insurance, rent, etc.)",
        "Receive email reminders before bills are due",
        "Mark bills as paid to track payment status",
        "View upcoming bills on your dashboard",
      ],
      tips: [
        "Enter bills to match what you have set up in your banking platform",
        "Set reminder preferences in Email Settings to get notified before due dates",
        "Use categories to group similar bills together",
        "Review bills monthly to catch any price changes",
      ],
    },
  },
  {
    id: "subscriptions",
    title: "Subscriptions",
    icon: RefreshCw,
    color: "text-purple-500",
    summary: "Monitor recurring subscription services",
    content: {
      description:
        "Keep track of all your recurring subscriptions and services in one place. Unlike bills which are traditional payments, subscriptions are for services like streaming, software, gym memberships, and other recurring digital or service-based charges.",
      features: [
        "Track active subscriptions with renewal dates",
        "View total monthly subscription cost",
        "Toggle subscriptions active/inactive without deleting",
        "Set renewal frequency (monthly, yearly, etc.)",
        "Categorize subscriptions by type",
        "See total yearly cost projection",
      ],
      tips: [
        "Review subscriptions quarterly to cancel unused services",
        "Track free trial end dates to avoid unexpected charges",
        "Use the total monthly cost to understand your subscription burden",
      ],
    },
  },
  {
    id: "bank-accounts",
    title: "Bank Accounts",
    icon: Building2,
    color: "text-cyan-500",
    summary: "Connect and sync your bank accounts via Plaid",
    content: {
      description:
        "Securely connect your bank accounts using Plaid to automatically import transactions and view account balances. Your banking credentials are never stored by Budget Smart AI - all connections are handled securely through Plaid's encrypted infrastructure.",
      features: [
        "Secure bank connection via Plaid",
        "Automatic transaction import and categorization",
        "Real-time account balance display",
        "Support for multiple bank accounts",
        "Transaction sync on demand",
        "Disconnect accounts at any time",
        "AI-powered transaction categorization",
      ],
      tips: [
        "Connect your primary spending accounts for the best insights",
        "Sync transactions regularly for up-to-date data",
        "Review auto-categorized transactions to ensure accuracy",
        "Your banking credentials are never stored on our servers",
      ],
    },
  },
  {
    id: "other-expenses",
    title: "Other Expenses",
    icon: Wallet,
    color: "text-pink-500",
    summary: "View bank-imported transactions",
    content: {
      description:
        "Other Expenses shows transactions that were automatically imported from your connected bank accounts. These are separated from manually-entered expenses to give you a clear view of bank-sourced spending data that you can review and categorize.",
      features: [
        "View all bank-imported transactions",
        "Filter and sort by date, amount, or category",
        "Automatic categorization from Plaid data",
        "Monthly navigation for historical views",
        "Running totals for imported transactions",
      ],
      tips: [
        "Review imported transactions to verify categories",
        "Use this view to catch transactions you might have missed logging manually",
        "Compare with your manual expenses to avoid double-counting",
      ],
    },
  },
  {
    id: "budgets",
    title: "Budgets",
    icon: PieChart,
    color: "text-indigo-500",
    summary: "Set spending limits by category",
    content: {
      description:
        "Create category-based budgets to control your spending. Set monthly limits for different expense categories and track your progress with visual indicators. Get alerts when you're approaching or exceeding your budget limits.",
      features: [
        "Set monthly budget limits per category",
        "Visual progress bars showing spending vs. budget",
        "Color-coded status (on track, warning, over budget)",
        "AI-powered budget suggestions based on spending history",
        "Month-to-month budget tracking",
        "Easy budget adjustment",
      ],
      tips: [
        "Start with budgets for your top 3-5 spending categories",
        "Use the AI suggestion feature to set realistic budget amounts",
        "Review budget progress weekly to stay on track",
        "Adjust budgets as your spending patterns change",
      ],
    },
  },
  {
    id: "savings",
    title: "Savings Goals",
    icon: Target,
    color: "text-amber-500",
    summary: "Set and track savings targets",
    content: {
      description:
        "Define savings goals with target amounts and deadlines. Track your progress visually and stay motivated with clear milestones. Whether saving for a vacation, emergency fund, or major purchase, organize your savings objectives here.",
      features: [
        "Create goals with target amounts and dates",
        "Visual progress tracking with percentage complete",
        "Color-coded goals for easy identification",
        "Update current savings amounts as you contribute",
        "Multiple simultaneous goals supported",
        "Completion celebrations when goals are met",
      ],
      tips: [
        "Set realistic target dates based on your income and expenses",
        "Update your progress regularly to stay motivated",
        "Break large goals into smaller milestones",
        "Use color coding to prioritize your goals visually",
      ],
    },
  },
  {
    id: "categories",
    title: "Categories",
    icon: Tag,
    color: "text-teal-500",
    summary: "Customize expense and income categories",
    content: {
      description:
        "Create custom categories to organize your finances the way that makes sense for you. Add categories for expenses, income, or bills, each with a custom color for easy visual identification throughout the app.",
      features: [
        "Create custom categories for expenses, income, and bills",
        "Assign colors for visual identification",
        "Categories appear in all relevant dropdowns",
        "Edit or delete custom categories",
        "Works alongside default built-in categories",
      ],
      tips: [
        "Create categories that match your lifestyle and spending habits",
        "Use consistent naming for better reporting accuracy",
        "Don't create too many categories - aim for 8-12 meaningful groups",
        "Colors help you quickly identify categories in charts and lists",
      ],
    },
  },
  {
    id: "settings",
    title: "Settings",
    icon: Settings,
    color: "text-gray-500",
    summary: "Manage your account and security",
    content: {
      description:
        "Configure your account settings including profile information, security options, and multi-factor authentication. Keep your account secure with TOTP-based two-factor authentication.",
      features: [
        "Update profile information (name, email)",
        "Change password securely",
        "Enable/disable multi-factor authentication (MFA)",
        "TOTP-based MFA with authenticator app support",
        "QR code setup for MFA",
        "Session management and logout",
      ],
      tips: [
        "Enable MFA for enhanced account security",
        "Use a reputable authenticator app (Google Authenticator, Authy, etc.)",
        "Keep your recovery codes in a safe place",
        "Update your email to ensure you receive bill reminders",
      ],
    },
  },
  {
    id: "email-settings",
    title: "Email Settings",
    icon: Mail,
    color: "text-rose-500",
    summary: "Configure notification preferences",
    content: {
      description:
        "Customize when and how you receive email notifications for bill reminders and other alerts. Set your preferred reminder timing, notification frequency, and quiet hours to get notified on your schedule.",
      features: [
        "Toggle email notifications on/off",
        "Set reminder timing (days before due date)",
        "Configure notification frequency",
        "Set preferred notification time of day",
        "Choose specific days for weekly digests",
        "Bill-specific reminder preferences",
      ],
      tips: [
        "Set reminders 2-3 days before bills are due for enough time to act",
        "Choose a notification time when you typically check email",
        "Enable weekly digests for a summary of upcoming payments",
      ],
    },
  },
];

export default function Help() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const filteredSections = helpSections.filter(
    (section) =>
      section.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      section.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      section.content.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      section.content.features.some((f) => f.toLowerCase().includes(searchQuery.toLowerCase())) ||
      section.content.tips.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const toggleSection = (id: string) => {
    setExpandedSection(expandedSection === id ? null : id);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 shadow-lg shadow-indigo-500/20">
            <BookOpen className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Help Center</h1>
            <p className="text-sm text-muted-foreground">Everything you need to know about Budget Smart AI</p>
          </div>
        </div>

        {/* Quick intro */}
        <Card className="mb-6 border-indigo-500/20 bg-gradient-to-r from-indigo-500/5 to-violet-500/5">
          <CardContent className="py-5">
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-500/10 shrink-0">
                <Brain className="h-5 w-5 text-indigo-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
                  Welcome to Budget Smart AI
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Budget Smart AI is your intelligent financial companion. Connect your bank accounts, track income and expenses,
                  set budgets, and get AI-powered insights to make smarter money decisions. Browse the sections below to learn
                  about each feature, or use the search to find exactly what you need.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search help topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Quick Links Grid */}
      {!searchQuery && !expandedSection && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-8">
          {helpSections.slice(0, 8).map((section) => (
            <button
              key={section.id}
              onClick={() => toggleSection(section.id)}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border bg-card hover:bg-muted/50 hover:border-primary/30 transition-all text-center"
            >
              <section.icon className={`h-5 w-5 ${section.color}`} />
              <span className="text-xs font-medium">{section.title}</span>
            </button>
          ))}
        </div>
      )}

      {/* Help Sections */}
      <div className="space-y-3">
        {filteredSections.map((section) => (
          <Card
            key={section.id}
            className={`transition-all ${
              expandedSection === section.id ? "ring-1 ring-primary/30" : ""
            }`}
          >
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full text-left"
            >
              <CardHeader className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted">
                      <section.icon className={`h-4 w-4 ${section.color}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{section.title}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{section.summary}</p>
                    </div>
                  </div>
                  {expandedSection === section.id ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </div>
              </CardHeader>
            </button>

            {expandedSection === section.id && (
              <CardContent className="pt-0 pb-5">
                <div className="border-t pt-4 space-y-4">
                  {/* Description */}
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {section.content.description}
                  </p>

                  {/* Features */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Features
                    </h4>
                    <ul className="space-y-1.5">
                      {section.content.features.map((feature, idx) => (
                        <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/60 mt-1.5 shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Tips */}
                  <div className="bg-muted/40 rounded-lg p-4">
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <HelpCircle className="h-3.5 w-3.5 text-amber-500" />
                      Pro Tips
                    </h4>
                    <ul className="space-y-1.5">
                      {section.content.tips.map((tip, idx) => (
                        <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-amber-500 shrink-0">&#8226;</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {/* No results */}
      {filteredSections.length === 0 && (
        <div className="text-center py-12">
          <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No help topics found for "{searchQuery}"</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Try a different search term</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 text-center border-t pt-6">
        <p className="text-sm text-muted-foreground">
          Can't find what you're looking for?{" "}
          <a href="/support" className="text-primary hover:underline font-medium">
            Contact our support team
          </a>
        </p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          We typically respond within 2-4 hours
        </p>
      </div>
    </div>
  );
}
