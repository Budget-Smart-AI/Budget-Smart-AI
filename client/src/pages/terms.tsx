import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Mail, User, AlertTriangle } from "lucide-react";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-muted/30 py-4">
        <div className="container mx-auto px-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">Terms of Service</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              Terms of Service
            </CardTitle>
            <p className="text-lg font-medium text-muted-foreground">BudgetSmart</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Effective Date: March 7, 2026</p>
              <p>Last Updated: March 7, 2026</p>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-muted-foreground">
              These Terms of Service ("Terms") govern your access to and use of BudgetSmart, a personal finance platform
              operated by Ryan Mahabir in Hamilton, Ontario, Canada. By creating an account or using the service, you agree to these Terms.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground mb-3">By clicking "Sign Up" or using BudgetSmart, you confirm that:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>You have read and understood these Terms</li>
              <li>You are at least <strong>18 years of age</strong></li>
              <li>You are legally capable of entering into a binding agreement</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">2. Service Description</h2>
            <p className="text-muted-foreground mb-3">BudgetSmart is a personal finance and budgeting tool that:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Connects to your bank accounts via Plaid and MX to import transactions</li>
              <li>Helps you track spending, set budgets, and identify financial patterns</li>
              <li>Provides AI-powered insights and categorisation</li>
              <li>Sends optional notifications and financial summaries</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              BudgetSmart is a <strong>software tool</strong>, not a financial services company.
              See Section 8 (Not Financial Advice) for important disclaimers.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">3. Account Security</h2>
            <p className="text-muted-foreground mb-3">You are responsible for:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Keeping your login credentials confidential</li>
              <li>All activity that occurs under your account</li>
              <li>Notifying us immediately at <a href="mailto:ryan@mahabir.pro" className="text-primary hover:underline">ryan@mahabir.pro</a> if you suspect unauthorised access</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              We recommend enabling <strong>two-factor authentication (2FA)</strong> in your account settings for additional security.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">4. Subscription and Billing</h2>

            <h3 className="text-lg font-medium mt-4 mb-2">Plans and Pricing</h3>
            <p className="text-muted-foreground">
              BudgetSmart offers both free and paid subscription plans. Pricing may change with reasonable notice.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">Billing</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Paid plans are billed in advance (monthly or annually, as selected)</li>
              <li>Billing is processed by <strong>Stripe</strong>. Your payment information is stored by Stripe, not BudgetSmart</li>
              <li>By subscribing, you authorise BudgetSmart to charge the payment method on file on a recurring basis</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">Cancellation</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>You may cancel your subscription at any time from your account settings</li>
              <li>Upon cancellation, your paid access continues until the end of the current billing period</li>
              <li>After the billing period ends, your account reverts to the free tier or becomes inactive</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">Refunds</h3>
            <p className="text-muted-foreground">
              Payments are generally non-refundable. Exceptions may apply where required by applicable consumer protection law
              (including Ontario, Canada). To request a refund, contact{" "}
              <a href="mailto:ryan@mahabir.pro" className="text-primary hover:underline">ryan@mahabir.pro</a>.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">5. Prohibited Uses</h2>
            <p className="text-muted-foreground mb-3">You may not use BudgetSmart to:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Violate any applicable law or regulation</li>
              <li>Attempt to gain unauthorised access to BudgetSmart's systems or another user's account</li>
              <li>Upload, transmit, or store malicious code, viruses, or harmful content</li>
              <li>Scrape, copy, or redistribute BudgetSmart's data or platform features without permission</li>
              <li>Impersonate another person or entity</li>
              <li>Use the platform to facilitate financial fraud or money laundering</li>
              <li>Misuse or abuse bank connection features (Plaid, MX) in violation of their terms</li>
              <li>Reverse engineer, decompile, or attempt to extract source code from BudgetSmart</li>
            </ul>
            <p className="text-muted-foreground mt-3">Violations may result in immediate suspension or termination of your account.</p>

            <h2 className="text-xl font-semibold mt-8 mb-4">6. Bank Account Connections</h2>
            <p className="text-muted-foreground mb-3">By connecting your bank account:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>You authorise BudgetSmart to access your transaction history and account balances</li>
              <li><strong>We never access or store your bank login credentials</strong> — authentication happens directly with your bank</li>
              <li>You can disconnect your bank accounts at any time from account settings</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">7. Intellectual Property</h2>
            <p className="text-muted-foreground">
              BudgetSmart's software, design, branding, and content are owned by Ryan Mahabir and protected by applicable intellectual property laws.
              You are granted a limited, non-exclusive licence to use BudgetSmart for your personal use.
              Your data (transactions, budgets, notes) remains yours — we do not claim ownership of your personal financial data.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">8. Not Financial Advice</h2>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-800 dark:text-amber-200 font-medium">Important Disclaimer</p>
                <p className="text-amber-700 dark:text-amber-300 text-sm mt-1">
                  BudgetSmart is a budgeting and financial tracking tool. It does <strong>not</strong> provide financial advice,
                  investment advice, tax advice, or any other professional financial services.
                  AI-generated insights are informational only and may contain errors.
                  Consult a qualified financial professional before making significant financial decisions.
                  We are not liable for any financial losses resulting from reliance on information provided by BudgetSmart.
                </p>
              </div>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-4">9. Disclaimer of Warranties</h2>
            <p className="text-muted-foreground mb-3">
              BudgetSmart is provided <strong>"as is"</strong> and <strong>"as available"</strong> without warranties of any kind.
              We do not warrant that:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>The service will be uninterrupted, error-free, or completely secure</li>
              <li>Transaction data imported from banks will be complete or 100% accurate</li>
              <li>AI-generated insights or categorisations will be free of errors</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">10. Limitation of Liability</h2>
            <p className="text-muted-foreground mb-3">To the maximum extent permitted by applicable law:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>BudgetSmart's total liability shall not exceed the amount you paid in the <strong>12 months prior</strong> to the claim</li>
              <li>We are not liable for indirect, incidental, special, consequential, or punitive damages, including financial losses</li>
              <li>We are not responsible for failures of third-party services (banks, Plaid, MX, Stripe, etc.)</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">11. Termination</h2>
            <p className="text-muted-foreground mb-3">
              You may cancel your account at any time from account settings or by emailing{" "}
              <a href="mailto:ryan@mahabir.pro" className="text-primary hover:underline">ryan@mahabir.pro</a>.
            </p>
            <p className="text-muted-foreground">
              We may suspend or terminate your account with notice for violations of these Terms, extended inactivity, or as required by law.
              For serious violations (e.g., fraud, security attacks), we may terminate without notice.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">12. Governing Law</h2>
            <p className="text-muted-foreground">
              These Terms are governed by and construed in accordance with the laws of the{" "}
              <strong>Province of Ontario, Canada</strong> and the federal laws of Canada applicable therein.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">13. Dispute Resolution</h2>
            <p className="text-muted-foreground mb-3">
              Before initiating formal legal proceedings, both parties agree to attempt to resolve disputes informally
              by contacting <a href="mailto:ryan@mahabir.pro" className="text-primary hover:underline">ryan@mahabir.pro</a>.
            </p>
            <p className="text-muted-foreground">
              If informal resolution is not achieved within 30 days, disputes shall be resolved through binding arbitration
              or litigation in the courts of <strong>Hamilton, Ontario, Canada</strong>.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">14. Changes to These Terms</h2>
            <p className="text-muted-foreground">
              We may update these Terms from time to time. We will update the "Last Updated" date above and notify you
              via email or in-app notification for material changes, with at least <strong>14 days' notice</strong> before
              material changes take effect. Continued use constitutes acceptance.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">15. Contact</h2>
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground"><strong>Ryan Mahabir</strong> — BudgetSmart</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">
                  <a href="mailto:ryan@mahabir.pro" className="text-primary hover:underline">ryan@mahabir.pro</a>
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Hamilton, Ontario, Canada · budgetsmart.io</p>
            </div>

            <div className="mt-8 pt-6 border-t">
              <p className="text-sm text-muted-foreground">
                See also our{" "}
                <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                ,{" "}
                <Link href="/data-retention" className="text-primary hover:underline">Data Retention Policy</Link>
                , and{" "}
                <Link href="/affiliate-terms" className="text-primary hover:underline">Affiliate Program Terms</Link>.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
