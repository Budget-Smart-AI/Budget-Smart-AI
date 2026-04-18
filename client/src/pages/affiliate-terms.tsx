import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Mail, User, AlertTriangle, Ban, CheckCircle2 } from "lucide-react";

export default function AffiliateTerms() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-muted/30 py-4">
        <div className="container mx-auto px-4 flex items-center gap-4">
          <Link href="/affiliate">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">Affiliate Program Terms & Conditions</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              Affiliate Program Terms & Conditions
            </CardTitle>
            <p className="text-lg font-medium text-muted-foreground">Budget Smart AI</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Last Updated: April 2026</p>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-muted-foreground">
              These Affiliate Program Terms ("Agreement") govern your participation in the Budget Smart AI Affiliate Program. By registering as an affiliate or promoting Budget Smart AI, you agree to these terms.
            </p>
            <p className="text-muted-foreground">
              Budget Smart AI is owned and operated by Ryan Mahabir ("Company," "we," "us," "our").
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">1. Program Overview</h2>
            <p className="text-muted-foreground">
              The Budget Smart AI Affiliate Program allows approved partners ("Affiliates") to earn commissions by referring new paying customers to Budget Smart AI using a unique tracking link.
            </p>
            <p className="text-muted-foreground">
              Commissions are paid only on verified, successful subscriptions.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">2. Commission Structure</h2>
            <p className="text-muted-foreground mb-4">
              Affiliates earn lifetime recurring commissions on every active paying customer they refer. The program has two rates:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-border rounded-lg">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="border border-border p-3 text-left font-semibold">Tier</th>
                    <th className="border border-border p-3 text-left font-semibold">Active Referrals</th>
                    <th className="border border-border p-3 text-left font-semibold">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-border p-3">Standard</td>
                    <td className="border border-border p-3">1–249</td>
                    <td className="border border-border p-3 font-medium text-primary">40% lifetime recurring</td>
                  </tr>
                  <tr className="bg-muted/30">
                    <td className="border border-border p-3">Boosted</td>
                    <td className="border border-border p-3">250+</td>
                    <td className="border border-border p-3 font-medium text-primary">50% lifetime recurring</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground mt-4">
              "Lifetime recurring" means the affiliate will receive a commission on every successful payment for as long as the referred customer remains an active paying subscriber of Budget Smart AI, including renewals.
            </p>
            <p className="text-muted-foreground mt-3">
              When an affiliate reaches 250 active paying referrals, the boosted 50% rate applies to <strong>all</strong> of that affiliate's referrals — including those acquired before the boost was unlocked. The boost remains active for the lifetime of the affiliate account.
            </p>
            <p className="text-muted-foreground mt-3">
              Attribution uses a 180-day first-click cookie. If a visitor clicks an affiliate link and signs up for a paid plan within 180 days, the referral is credited to that affiliate.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">3. Payouts</h2>
            <p className="text-muted-foreground">
              Commissions are paid via PayPal once an affiliate's accrued balance reaches the $100 minimum payout threshold. Balances below $100 roll over to the next month.
            </p>
            <p className="text-muted-foreground mt-3">
              All commissions are subject to a 30-day holding period to allow for refunds, chargebacks, fraud detection, and billing verification. Payouts are released only after:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>The customer payment has cleared and remains valid 30 days after the charge</li>
              <li>The referral is not flagged for fraud or self-referral</li>
              <li>No refunds or chargebacks have been issued against the payment</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              Refunds, chargebacks, or subscription cancellations within the holding period reverse the associated commission. Refunds processed after the holding period are deducted from the affiliate's next payout.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">4. What Counts as a Qualified Referral</h2>
            <p className="text-muted-foreground mb-3">A referral is valid only if:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>The user clicks your unique affiliate link within the 180-day attribution window</li>
              <li>Creates a new Budget Smart AI account using a different email than the affiliate's</li>
              <li>Purchases a paid plan and the payment successfully clears</li>
              <li>Does not request a refund within the 30-day holding period</li>
              <li>Does not violate fraud, abuse, or self-referral rules</li>
            </ul>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3 mt-4">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-800 dark:text-amber-200 font-medium">Important</p>
                <p className="text-amber-700 dark:text-amber-300 text-sm mt-1">
                  Self-referrals are prohibited.
                </p>
              </div>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-4">5. Prohibited Activities</h2>
            <p className="text-muted-foreground mb-4">Affiliates may NOT engage in:</p>

            <h3 className="text-lg font-medium mt-6 mb-3 flex items-center gap-2">
              <Ban className="w-5 h-5 text-destructive" />
              Paid Ad Violations
            </h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Bidding on "Budget Smart AI", "BudgetSmart", or brand-related keywords</li>
              <li>Running ads that impersonate or compete with official Budget Smart AI advertising</li>
              <li>Redirecting paid ads to your affiliate links</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3 flex items-center gap-2">
              <Ban className="w-5 h-5 text-destructive" />
              Spam & Unethical Promotion
            </h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Sending unsolicited emails or messages (CAN-SPAM violations)</li>
              <li>Posting affiliate links in spammy forums, comment sections, or bot traffic</li>
              <li>Using fake reviews, false claims, or misleading statements</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3 flex items-center gap-2">
              <Ban className="w-5 h-5 text-destructive" />
              Fraud & Abuse
            </h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Creating fake accounts</li>
              <li>Self-referrals</li>
              <li>Incentivized signups that mislead users</li>
              <li>Using VPNs, bots, or click farms</li>
            </ul>

            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 mt-4">
              <p className="text-red-800 dark:text-red-200 font-medium">
                Violations result in immediate termination and forfeiture of commissions.
              </p>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-4">6. Marketing Guidelines</h2>
            <h3 className="text-lg font-medium mt-6 mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              Affiliates may:
            </h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Promote via blogs, YouTube, social media, newsletters, and websites</li>
              <li>Share real testimonials and honest reviews</li>
              <li>Use approved brand assets</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3 flex items-center gap-2">
              <Ban className="w-5 h-5 text-destructive" />
              Affiliates may NOT:
            </h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Misrepresent features, pricing, or guarantees</li>
              <li>Claim Budget Smart AI is a bank or financial institution</li>
              <li>Promise returns, savings, or financial outcomes</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">7. Intellectual Property</h2>
            <p className="text-muted-foreground">
              Affiliates may use Budget Smart AI logos and branding only for promotion and may not:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
              <li>Alter branding</li>
              <li>Register similar domains</li>
              <li>Impersonate the company</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              All trademarks remain the property of Budget Smart AI.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">8. Termination</h2>
            <p className="text-muted-foreground mb-3">We may suspend or terminate any affiliate at any time if:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Fraud is suspected</li>
              <li>These terms are violated</li>
              <li>Brand integrity is harmed</li>
            </ul>
            <p className="text-muted-foreground mt-3">Upon termination:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Unpaid fraudulent commissions are void</li>
              <li>Tracking links are disabled</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">9. Relationship</h2>
            <p className="text-muted-foreground">
              Affiliates are independent contractors, not employees, partners, or representatives of Budget Smart AI.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">10. Liability</h2>
            <p className="text-muted-foreground mb-3">Budget Smart AI is not liable for:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Lost commissions due to tracking errors</li>
              <li>Platform outages</li>
              <li>Changes to pricing or product</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">11. Program Changes</h2>
            <p className="text-muted-foreground mb-3">We reserve the right to modify:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Commission rates</li>
              <li>Payout terms</li>
              <li>Program rules</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              Notice will be provided when changes occur.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">12. Governing Law</h2>
            <p className="text-muted-foreground">
              This Agreement is governed by the laws of Canada.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">13. Contact</h2>
            <p className="text-muted-foreground mb-3">For affiliate support:</p>
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground"><strong>Owner:</strong> Ryan Mahabir</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground"><strong>Email:</strong> <a href="mailto:hello@budgetsmart.io" className="text-primary hover:underline">hello@budgetsmart.io</a></span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground"><strong>Support:</strong> <a href="mailto:support@budgetsmart.io" className="text-primary hover:underline">support@budgetsmart.io</a></span>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t">
              <p className="text-sm text-muted-foreground">
                See also our{" "}
                <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
                {" "}and{" "}
                <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
