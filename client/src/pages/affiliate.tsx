import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  DollarSign, Users, TrendingUp, Gift, Copy, Check, Mail,
  ChevronDown, ChevronUp, Zap, Trophy, Star, ArrowRight,
  Rocket, Target, Clock, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

// Two-tier lifetime-recurring model (locked-in 2026-04-17).
// Standard 40% on every active referral, boosted to 50% once an affiliate
// has 250+ active referrals (boost applies to ALL referrals, not just new ones).
interface AffiliateSettings {
  commissionPercent: number;
  boostedCommissionPercent: number;
  boostedAfterReferrals: number;
  cookieDurationDays: number;
  payoutMethod: string;
  payoutMinimum: number;
  commissionRecurrence: string;
  partneroUrl: string;
}

// Email funnel templates
const emailTemplates = [
  {
    day: 1,
    subject: "Are you tired of living paycheck to paycheck?",
    preview: "Introduce the problem and hint at a solution",
    body: `Subject: Are you tired of living paycheck to paycheck?

Hi [First Name],

I know how frustrating it is to feel like your money disappears before the month ends. Trust me, I've been there.

But what if I told you there's a way to finally take control of your finances without spending hours on spreadsheets or complicated budgeting apps?

I recently discovered BudgetSmart AI, and it's completely changed how I manage my money. It uses artificial intelligence to:

✓ Automatically track and categorize your spending
✓ Predict upcoming bills so you're never caught off guard
✓ Find subscriptions you forgot about (I saved $47/month!)
✓ Give personalized tips to help you save more

The best part? It takes less than 5 minutes to set up.

Tomorrow, I'll share how it helped me save my first $1,000 in just 3 months.

Talk soon,
[Your Name]

P.S. If you want to check it out now, here's my link: [YOUR AFFILIATE LINK]`
  },
  {
    day: 2,
    subject: "How I saved $1,000 in 90 days (no extreme budgeting)",
    preview: "Share your success story",
    body: `Subject: How I saved $1,000 in 90 days (no extreme budgeting)

Hi [First Name],

Yesterday I mentioned I'd share how I saved $1,000 in just 3 months. Here's the truth...

I didn't cut out coffee. I didn't stop eating out. I didn't deprive myself.

What I DID do was start using BudgetSmart AI to actually understand where my money was going.

Here's what happened in my first week:
- It found 3 subscriptions I'd completely forgotten about ($67/month)
- It showed me I was spending $400/month on "miscellaneous" (yikes!)
- It created a simple savings plan based on MY actual income

The AI literally told me: "Based on your spending patterns, you can save $350/month without changing your lifestyle."

It was right.

No guilt. No shame. Just clarity.

Want to see what it finds for you? Try it free for 14 days: [YOUR AFFILIATE LINK]

To your financial freedom,
[Your Name]

P.S. Tomorrow I'll reveal the #1 money mistake most people make (and how to fix it instantly).`
  },
  {
    day: 3,
    subject: "The #1 money mistake (and the 2-minute fix)",
    preview: "Address a common problem",
    body: `Subject: The #1 money mistake (and the 2-minute fix)

Hi [First Name],

Want to know the biggest money mistake I see people make?

They don't know their numbers.

- How much do you actually spend on food each month?
- What's your average utility bill?
- How much "random" spending happens weekly?

Most people guess... and they're usually WAY off.

I was spending $600/month on food when I thought it was $300. That's $3,600 a year I could have saved!

BudgetSmart AI fixed this for me in 2 minutes. It:
1. Connected to my bank (securely, read-only)
2. Analyzed 6 months of transactions
3. Showed me exactly where every dollar went

No judgment. Just facts.

And once I had the facts, making better decisions was easy.

Ready to see YOUR numbers? [YOUR AFFILIATE LINK]

Best,
[Your Name]

P.S. Start with the Free Plan - no credit card needed to get started.`
  },
  {
    day: 4,
    subject: "My friend asked me this question yesterday...",
    preview: "Handle objections naturally",
    body: `Subject: My friend asked me this question yesterday...

Hi [First Name],

My friend Sarah asked me something yesterday that I bet you're wondering too:

"Is another budgeting app really going to help? I've tried Mint, YNAB, spreadsheets... nothing works."

I get it. I felt the same way.

But here's what makes BudgetSmart AI different:

1. It's ACTUALLY intelligent. Not just categories and charts. It learns YOUR patterns and gives personalized advice.

2. It predicts the future. It knows when your bills are coming and warns you before you overspend.

3. It's built for real life. Forgot to log something? It already knows. Split a bill with friends? It handles it.

4. It saves you time. The AI does 90% of the work. You just make decisions.

Sarah tried it after our conversation. Her text 2 weeks later?

"Why didn't I do this sooner? Found $200/month I was wasting!"

Your turn: [YOUR AFFILIATE LINK]

Cheers,
[Your Name]`
  },
  {
    day: 5,
    subject: "The 'set it and forget it' approach to saving money",
    preview: "Highlight automation benefits",
    body: `Subject: The "set it and forget it" approach to saving money

Hi [First Name],

What if you could save money without thinking about it?

That's exactly what BudgetSmart AI's automation does:

🤖 Auto-categorizes every transaction (99% accuracy)
🤖 Sends smart alerts before you overspend
🤖 Tracks bills and reminds you before due dates
🤖 Monitors subscriptions and finds increases
🤖 Creates weekly spending summaries automatically

I spend maybe 5 minutes a week checking my dashboard. That's it.

The AI handles everything else.

Compare that to the OLD way:
❌ Manually logging receipts
❌ Updating spreadsheets
❌ Forgetting transactions
❌ Missing bill payments
❌ Wondering where your money went

Life's too short for that.

Let the AI do the heavy lifting: [YOUR AFFILIATE LINK]

To working smarter,
[Your Name]

P.S. Tomorrow I'm sharing something special for families and couples. Stay tuned!`
  },
  {
    day: 6,
    subject: "For couples and families (this changes everything)",
    preview: "Target families with the Family plan",
    body: `Subject: For couples and families (this changes everything)

Hi [First Name],

If you manage finances with a partner or family, this is for you.

Money is the #1 cause of stress in relationships. But it doesn't have to be.

BudgetSmart AI's Family Plan ($14.99/month or $129/year) includes:

👨‍👩‍👧‍👦 Up to 5 family members
🏦 Up to 3 bank accounts connected
📊 Shared household dashboard
💬 Split expense tracking
🎯 Collaborative savings goals
📱 Everyone stays on the same page

Imagine:
- No more "I thought YOU paid that bill!"
- No more hidden spending surprises
- No more money arguments

Just clarity, transparency, and teamwork.

My wife and I started using this, and our money conversations went from stressful to... actually enjoyable?

We're finally working together toward our goals.

Try the Family Plan free for 14 days: [YOUR AFFILIATE LINK]

Best,
[Your Name]

P.S. Tomorrow is the last email in this series, and I'm sharing something you won't want to miss.`
  },
  {
    day: 7,
    subject: "Your last chance (plus a gift from me)",
    preview: "Create urgency and final CTA",
    body: `Subject: Your last chance (plus a gift from me)

Hi [First Name],

This is my final email about BudgetSmart AI, so I wanted to make it count.

Here's what you get when you start today:

✅ Free Plan to get started (no credit card required)
✅ AI-powered spending analysis
✅ Bill prediction and reminders
✅ Subscription tracking
✅ Personalized savings recommendations
✅ Bank-level security

Plans start at just $7.99/month (Pro) or $14.99/month (Family).

That's less than one coffee run per week.

But here's what it SAVES you:
💰 Average user finds $150+/month in wasted spending
💰 Avoid $30+ late fees with bill reminders
💰 Cut forgotten subscriptions ($50+/month average)

The ROI is insane.

I've shared everything I know. Now it's your turn to take action.

👉 Get started with the Free Plan: [YOUR AFFILIATE LINK]

Your future self will thank you.

To your success,
[Your Name]

P.S. Still on the fence? Reply to this email and I'll answer any questions you have. I'm here to help!`
  }
];

export default function AffiliatePage() {
  const { toast } = useToast();
  const [copiedEmail, setCopiedEmail] = useState<number | null>(null);
  const [referralCount, setReferralCount] = useState(10);

  // Fetch affiliate settings
  const { data: settings } = useQuery<AffiliateSettings>({
    queryKey: ["/api/affiliate/settings"],
    queryFn: async () => {
      const res = await fetch("/api/affiliate/settings");
      if (!res.ok) {
        // Hardcoded fallback — must match server/routes.ts /api/affiliate/settings defaults.
        return {
          commissionPercent: 40,
          boostedCommissionPercent: 50,
          boostedAfterReferrals: 250,
          cookieDurationDays: 180,
          payoutMethod: "PayPal",
          payoutMinimum: 100,
          commissionRecurrence: "lifetime",
          partneroUrl: "https://affiliate.budgetsmart.io",
        };
      }
      return res.json();
    },
  });

  const commissionPercent = settings?.commissionPercent ?? 40;
  const boostedCommissionPercent = settings?.boostedCommissionPercent ?? 50;
  const boostedAfterReferrals = settings?.boostedAfterReferrals ?? 250;
  const cookieDurationDays = settings?.cookieDurationDays ?? 180;
  const payoutMethod = settings?.payoutMethod ?? "PayPal";
  const payoutMinimum = settings?.payoutMinimum ?? 100;
  const partneroUrl = settings?.partneroUrl || "https://affiliate.budgetsmart.io";

  // Pricing
  const proMonthly = 7.99;
  const proYearly = 67;
  const familyMonthly = 14.99;
  const familyYearly = 129;

  // Calculate earnings
  const calculateMonthlyEarnings = (customers: number, plan: "family" | "pro", period: "monthly" | "yearly") => {
    const price = plan === "family"
      ? (period === "monthly" ? familyMonthly : familyYearly / 12)
      : (period === "monthly" ? proMonthly : proYearly / 12);
    return (customers * price * (commissionPercent / 100)).toFixed(2);
  };

  const calculateYearlyEarnings = (customers: number, plan: "family" | "pro", period: "monthly" | "yearly") => {
    const price = plan === "family"
      ? (period === "monthly" ? familyMonthly * 12 : familyYearly)
      : (period === "monthly" ? proMonthly * 12 : proYearly);
    return (customers * price * (commissionPercent / 100)).toFixed(2);
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedEmail(index);
    toast({ title: "Email copied to clipboard!" });
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  // Profit table data
  const profitTableData = [
    { customers: 10 },
    { customers: 25 },
    { customers: 50 },
    { customers: 100 },
    { customers: 250 },
    { customers: 500 },
    { customers: 1000 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/">
              <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent cursor-pointer">
                BudgetSmart AI
              </span>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" className="text-slate-300 hover:text-white">
                  Home
                </Button>
              </Link>
              <a href={partneroUrl} target="_blank" rel="noopener noreferrer">
                <Button className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600">
                  Join Now
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge className="mb-6 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-4 py-1">
              <Gift className="h-4 w-4 mr-2" />
              Affiliate Program
            </Badge>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
              Earn{" "}
              <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                {commissionPercent}% Lifetime
              </span>
              <br />
              Recurring Commissions
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
              Join our affiliate program and earn passive income by helping others take control of their finances.
              Get paid every month, for as long as your referrals stay subscribed.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href={partneroUrl} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-lg px-8">
                  Become an Affiliate
                  <Rocket className="ml-2 h-5 w-5" />
                </Button>
              </a>
              <Button size="lg" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800" onClick={() => document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth' })}>
                Calculate Earnings
                <DollarSign className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16"
          >
            {[
              { label: "Commission Rate", value: `${commissionPercent}%`, icon: DollarSign },
              { label: "Cookie Duration", value: `${cookieDurationDays} Days`, icon: Clock },
              { label: "Recurring", value: "Lifetime", icon: TrendingUp },
              { label: "Payout", value: `$${payoutMinimum} ${payoutMethod}`, icon: CheckCircle2 },
            ].map((stat, i) => (
              <Card key={i} className="bg-slate-900/50 border-slate-800">
                <CardContent className="pt-6 text-center">
                  <stat.icon className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{stat.value}</div>
                  <div className="text-sm text-slate-400">{stat.label}</div>
                </CardContent>
              </Card>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-900/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-slate-400">Start earning in 3 simple steps</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: 1,
                title: "Sign Up",
                description: "Join our affiliate program for free through Partnero. Get your unique referral link instantly.",
                icon: Users,
              },
              {
                step: 2,
                title: "Share",
                description: "Share your link with your audience through your blog, social media, email list, or YouTube channel.",
                icon: Target,
              },
              {
                step: 3,
                title: "Earn",
                description: `Earn ${commissionPercent}% of every payment your referrals make — for the full lifetime of their subscription. Payouts via ${payoutMethod} once you reach $${payoutMinimum}.`,
                icon: DollarSign,
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="bg-slate-900 border-slate-800 h-full relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-emerald-500/20 to-transparent rounded-bl-full" />
                  <CardHeader>
                    <div className="w-12 h-12 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-xl mb-4">
                      {item.step}
                    </div>
                    <CardTitle className="text-white flex items-center gap-2">
                      <item.icon className="h-5 w-5 text-emerald-400" />
                      {item.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-slate-400">{item.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Commission Boost — single milestone replaces the old 3-tier bonus grid */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
              <Trophy className="h-4 w-4 mr-2" />
              Commission Boost
            </Badge>
            <h2 className="text-3xl font-bold text-white mb-4">
              Hit {boostedAfterReferrals} Referrals,{" "}
              <span className="bg-gradient-to-r from-yellow-300 to-amber-400 bg-clip-text text-transparent">
                Earn {boostedCommissionPercent}% Forever
              </span>
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Two tiers, no gimmicks. Everyone starts at {commissionPercent}% lifetime recurring.
              Reach {boostedAfterReferrals} active paying referrals and your rate jumps to{" "}
              {boostedCommissionPercent}% — applied to <strong className="text-white">every</strong>{" "}
              referral on your account, including the ones already paying you.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-slate-900 border-slate-800 h-full">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center mb-3">
                  <Star className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-white text-2xl">Standard</CardTitle>
                <CardDescription>From day one — no minimums</CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-3 pt-4">
                <div>
                  <div className="text-5xl font-bold text-emerald-400">{commissionPercent}%</div>
                  <div className="text-slate-400 text-sm mt-1">Lifetime recurring commission</div>
                </div>
                <ul className="text-sm text-slate-300 space-y-1 pt-4 border-t border-slate-800 text-left mx-auto inline-block">
                  <li>✓ Paid every month a referral stays active</li>
                  <li>✓ {cookieDurationDays}-day attribution cookie</li>
                  <li>✓ ${payoutMinimum} minimum payout via {payoutMethod}</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-yellow-500/10 to-amber-500/5 border-2 border-yellow-500/30 h-full relative overflow-hidden">
              <div className="absolute -top-2 -right-2 bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-900 text-xs font-bold px-3 py-1 rounded-bl-lg">
                BOOSTED
              </div>
              <CardHeader className="text-center pb-2">
                <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 flex items-center justify-center mb-3">
                  <Trophy className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-white text-2xl">Boosted</CardTitle>
                <CardDescription>{boostedAfterReferrals}+ active referrals</CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-3 pt-4">
                <div>
                  <div className="text-5xl font-bold text-yellow-400">{boostedCommissionPercent}%</div>
                  <div className="text-slate-400 text-sm mt-1">Lifetime recurring commission</div>
                </div>
                <ul className="text-sm text-slate-300 space-y-1 pt-4 border-t border-yellow-500/20 text-left mx-auto inline-block">
                  <li>✓ Boost applies to <strong>all</strong> your referrals</li>
                  <li>✓ Old + new — everyone re-rates to {boostedCommissionPercent}%</li>
                  <li>✓ Locked in once unlocked</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Earnings Calculator */}
      <section id="calculator" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">Calculate Your Earnings</h2>
            <p className="text-slate-400">See how much you could earn based on referrals</p>
          </div>

          {/* Interactive Slider */}
          <Card className="bg-slate-900 border-slate-800 mb-8">
            <CardContent className="pt-6">
              <div className="text-center mb-6">
                <div className="text-5xl font-bold text-white mb-2">{referralCount}</div>
                <div className="text-slate-400">Referred Customers</div>
              </div>
              <input
                type="range"
                min="1"
                max="500"
                value={referralCount}
                onChange={(e) => setReferralCount(parseInt(e.target.value))}
                className="w-full h-3 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <div className="flex justify-between text-sm text-slate-500 mt-2">
                <span>1</span>
                <span>100</span>
                <span>250</span>
                <span>500</span>
              </div>

              <div className="grid md:grid-cols-2 gap-6 mt-8">
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-lg text-white">Family Plan Earnings</CardTitle>
                    <CardDescription>${familyMonthly}/mo or ${familyYearly}/yr</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Monthly (per customer)</span>
                      <span className="text-emerald-400 font-bold">${(familyMonthly * commissionPercent / 100).toFixed(2)}/mo</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Your Monthly Total</span>
                      <span className="text-emerald-400 font-bold text-xl">${calculateMonthlyEarnings(referralCount, "family", "monthly")}/mo</span>
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-slate-700">
                      <span className="text-slate-400">Your Yearly Total</span>
                      <span className="text-emerald-400 font-bold text-2xl">${calculateYearlyEarnings(referralCount, "family", "monthly")}/yr</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-lg text-white">Pro Plan Earnings</CardTitle>
                    <CardDescription>${proMonthly}/mo or ${proYearly}/yr</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Monthly (per customer)</span>
                      <span className="text-emerald-400 font-bold">${(proMonthly * commissionPercent / 100).toFixed(2)}/mo</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Your Monthly Total</span>
                      <span className="text-emerald-400 font-bold text-xl">${calculateMonthlyEarnings(referralCount, "pro", "monthly")}/mo</span>
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-slate-700">
                      <span className="text-slate-400">Your Yearly Total</span>
                      <span className="text-emerald-400 font-bold text-2xl">${calculateYearlyEarnings(referralCount, "pro", "monthly")}/yr</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Profit Table */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Potential Earnings Table</CardTitle>
              <CardDescription>Based on {commissionPercent}% commission rate</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800">
                      <TableHead className="text-slate-400">Customers</TableHead>
                      <TableHead className="text-slate-400 text-right">Family Monthly</TableHead>
                      <TableHead className="text-slate-400 text-right">Family Yearly</TableHead>
                      <TableHead className="text-slate-400 text-right">Pro Monthly</TableHead>
                      <TableHead className="text-slate-400 text-right">Pro Yearly</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profitTableData.map((row, i) => (
                      <TableRow key={i} className="border-slate-800">
                        <TableCell className="font-medium text-white">{row.customers}</TableCell>
                        <TableCell className="text-right text-emerald-400">
                          ${calculateMonthlyEarnings(row.customers, "family", "monthly")}/mo
                          <span className="block text-xs text-slate-500">${calculateYearlyEarnings(row.customers, "family", "monthly")}/yr</span>
                        </TableCell>
                        <TableCell className="text-right text-emerald-400">
                          ${(row.customers * familyYearly * commissionPercent / 100 / 12).toFixed(2)}/mo
                          <span className="block text-xs text-slate-500">${(row.customers * familyYearly * commissionPercent / 100).toFixed(2)}/yr</span>
                        </TableCell>
                        <TableCell className="text-right text-teal-400">
                          ${calculateMonthlyEarnings(row.customers, "pro", "monthly")}/mo
                          <span className="block text-xs text-slate-500">${calculateYearlyEarnings(row.customers, "pro", "monthly")}/yr</span>
                        </TableCell>
                        <TableCell className="text-right text-teal-400">
                          ${(row.customers * proYearly * commissionPercent / 100 / 12).toFixed(2)}/mo
                          <span className="block text-xs text-slate-500">${(row.customers * proYearly * commissionPercent / 100).toFixed(2)}/yr</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Email Funnel Templates */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-purple-500/10 text-purple-400 border-purple-500/20">
              <Mail className="h-4 w-4 mr-2" />
              Ready-to-Use Templates
            </Badge>
            <h2 className="text-3xl font-bold text-white mb-4">7-Day Email Funnel</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Copy and paste these proven email templates to convert your subscribers into customers.
              Just replace [YOUR AFFILIATE LINK] with your unique referral link and [First Name] with personalization.
            </p>
          </div>

          <div className="space-y-4">
            {emailTemplates.map((email, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <Accordion type="single" collapsible>
                  <AccordionItem value={`email-${i}`} className="bg-slate-900 border-slate-800 rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-4 text-left">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold shrink-0">
                          {email.day}
                        </div>
                        <div>
                          <div className="font-semibold text-white">{email.subject}</div>
                          <div className="text-sm text-slate-400">{email.preview}</div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="relative">
                        <pre className="bg-slate-950 rounded-lg p-4 text-sm text-slate-300 whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
                          {email.body}
                        </pre>
                        <Button
                          size="sm"
                          variant="outline"
                          className="absolute top-2 right-2 border-slate-700"
                          onClick={() => copyToClipboard(email.body, i)}
                        >
                          {copiedEmail === i ? (
                            <Check className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <div className="mt-4 p-4 bg-slate-800/50 rounded-lg">
                        <h4 className="font-semibold text-white mb-2">📝 Tips for Day {email.day}:</h4>
                        <ul className="text-sm text-slate-400 space-y-1">
                          {email.day === 1 && (
                            <>
                              <li>• Send on a Tuesday or Wednesday for best open rates</li>
                              <li>• Personalize the subject line if possible</li>
                              <li>• Don't include your link in the first email to build curiosity</li>
                            </>
                          )}
                          {email.day === 2 && (
                            <>
                              <li>• Share real numbers if you have them (or use hypothetical)</li>
                              <li>• Keep the story relatable and authentic</li>
                              <li>• This is your first soft pitch with the link</li>
                            </>
                          )}
                          {email.day === 3 && (
                            <>
                              <li>• Education builds trust before asking for the sale</li>
                              <li>• The "know your numbers" angle resonates with everyone</li>
                              <li>• Include a clear call-to-action</li>
                            </>
                          )}
                          {email.day === 4 && (
                            <>
                              <li>• Address objections before they become obstacles</li>
                              <li>• Social proof (Sarah's story) adds credibility</li>
                              <li>• Keep it conversational, not salesy</li>
                            </>
                          )}
                          {email.day === 5 && (
                            <>
                              <li>• Highlight the time-saving benefits</li>
                              <li>• Compare old way vs. new way for impact</li>
                              <li>• Automation is a key selling point</li>
                            </>
                          )}
                          {email.day === 6 && (
                            <>
                              <li>• This targets couples/families (higher-value plan)</li>
                              <li>• Emotional angle: reduce money stress in relationships</li>
                              <li>• Specific features for the Family plan</li>
                            </>
                          )}
                          {email.day === 7 && (
                            <>
                              <li>• Create urgency without being pushy</li>
                              <li>• Summarize all benefits one last time</li>
                              <li>• Offer to answer questions (builds relationship)</li>
                            </>
                          )}
                        </ul>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </motion.div>
            ))}
          </div>

          <div className="mt-8 p-6 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl border border-purple-500/20">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-400" />
              Pro Tips for Email Success
            </h3>
            <ul className="text-slate-300 space-y-2 text-sm">
              <li>✓ Space emails 1 day apart (can extend to 2 days for less aggressive approach)</li>
              <li>✓ Always test your links before sending</li>
              <li>✓ Segment your list: personal finance interested subscribers convert best</li>
              <li>✓ Track opens and clicks to optimize future campaigns</li>
              <li>✓ Follow up with non-openers after 24 hours with a different subject line</li>
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-900/50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">Frequently Asked Questions</h2>
          </div>
          <Accordion type="single" collapsible className="space-y-4">
            {[
              {
                q: "How do I get paid?",
                a: `We pay affiliates monthly via ${payoutMethod} through Partnero. You'll receive your earnings by the 15th of each month for the previous month's commissions.`
              },
              {
                q: "Is there a minimum payout?",
                a: `Yes, the minimum payout threshold is $${payoutMinimum}. If you haven't reached $${payoutMinimum}, your earnings will roll over to the next month.`
              },
              {
                q: "How long does the cookie last?",
                a: `Our attribution cookie lasts ${cookieDurationDays} days. If someone clicks your link and signs up within ${cookieDurationDays} days, you get credit for the referral.`
              },
              {
                q: "Do I earn commission on renewals?",
                a: `Yes — every renewal pays. You earn ${commissionPercent}% on EVERY payment your referrals make for the lifetime of their subscription. Hit ${boostedAfterReferrals} active referrals and your rate jumps to ${boostedCommissionPercent}% on all of them, old and new.`
              },
              {
                q: `How does the ${boostedCommissionPercent}% boost work?`,
                a: `Once you have ${boostedAfterReferrals} active paying referrals on your account, your commission rate increases from ${commissionPercent}% to ${boostedCommissionPercent}% — and the new rate applies to every referral you've ever brought in, not just the ones from that point forward.`
              },
              {
                q: "Can I promote on social media?",
                a: "Absolutely! You can share your affiliate link on any platform—social media, YouTube, TikTok, blogs, email, podcasts, and more. Just follow our brand guidelines."
              },
              {
                q: "What marketing materials do you provide?",
                a: "We provide banners, social media graphics, email templates (like the ones on this page), landing page copy, and more through the Partnero dashboard."
              },
              {
                q: "How do I track my referrals?",
                a: "The Partnero dashboard gives you real-time tracking of clicks, signups, conversions, and earnings. You can see exactly how your campaigns are performing."
              },
            ].map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="bg-slate-900 border-slate-800 rounded-lg px-4">
                <AccordionTrigger className="text-white hover:no-underline text-left">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-slate-400">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/20">
            <CardContent className="pt-10 pb-10 text-center">
              <h2 className="text-3xl font-bold text-white mb-4">
                Ready to Start Earning?
              </h2>
              <p className="text-slate-300 mb-8 max-w-xl mx-auto">
                Join thousands of affiliates earning passive income with BudgetSmart AI.
                Sign up takes less than 2 minutes.
              </p>
              <a href={partneroUrl} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-lg px-10">
                  Join the Affiliate Program
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </a>
              <p className="text-slate-500 text-sm mt-4">
                Free to join • No approval required • Start earning today
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-slate-800">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-center md:text-left">
              <Link href="/">
                <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent cursor-pointer">
                  BudgetSmart AI
                </span>
              </Link>
              <p className="text-slate-500 text-sm mt-2">
                AI-Powered Personal Finance Management
              </p>
            </div>
            <div className="flex flex-wrap justify-center md:justify-end gap-6 text-sm text-slate-400">
              <Link href="/">
                <span className="hover:text-white cursor-pointer">Home</span>
              </Link>
              <Link href="/terms">
                <span className="hover:text-white cursor-pointer">Terms</span>
              </Link>
              <Link href="/privacy">
                <span className="hover:text-white cursor-pointer">Privacy</span>
              </Link>
              <Link href="/affiliate-terms">
                <span className="hover:text-white cursor-pointer">Affiliate Terms</span>
              </Link>
              <Link href="/security">
                <span className="hover:text-white cursor-pointer">Security</span>
              </Link>
              <Link href="/trust">
                <span className="hover:text-white cursor-pointer">Trust Center</span>
              </Link>
              <Link href="/contact">
                <span className="hover:text-white cursor-pointer">Contact</span>
              </Link>
            </div>
          </div>
          <div className="text-center text-slate-600 text-sm mt-8">
            © {new Date().getFullYear()} BudgetSmart AI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
