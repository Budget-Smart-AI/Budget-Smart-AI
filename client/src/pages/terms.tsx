import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Mail, User, AlertTriangle, Info } from "lucide-react";

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
            <p className="text-lg font-medium text-muted-foreground">BudgetSmart AI</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Version 1.1</p>
              <p>Effective Date: March 7, 2026</p>
              <p>Last Updated: March 9, 2026</p>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start gap-3 mb-6">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-blue-800 dark:text-blue-200 text-sm">
                This is the public-facing Terms of Service available at budgetsmart.io/terms. It governs access to and use of the BudgetSmart AI personal finance platform.
              </p>
            </div>

            <p className="text-muted-foreground">
              These Terms of Service ("Terms") govern your access to and use of BudgetSmart AI, a personal finance platform
              operated by Ryan Mahabir in Hamilton, Ontario, Canada ("we," "us," or "our"). By creating an account or using the service, you agree to these Terms.
            </p>
            <p className="text-muted-foreground mt-2">If you do not agree, do not use BudgetSmart AI.</p>

            <h2 className="text-xl font-semibold mt-8 mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground mb-3">
              By clicking "Sign Up," creating an account, or continuing to use BudgetSmart AI after changes to these Terms are posted, you confirm that:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>You have read and understood these Terms</li>
              <li>You are at least <strong>18 years of age</strong></li>
              <li>You are legally capable of entering into a binding agreement</li>
              <li>If using the service on behalf of a business, you have authority to bind that business to these Terms</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">2. Service Description</h2>
            <p className="text-muted-foreground mb-3">BudgetSmart AI is a personal finance and budgeting platform that:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Connects to your bank accounts via MX Technologies (primary) and/or Plaid to import transactions and account balances</li>
              <li>Helps you track spending, set budgets, and identify financial patterns</li>
              <li>Provides AI-powered insights, transaction categorisation, and spending analysis</li>
              <li>Offers AI-powered receipt scanning — you can photograph receipts to automatically extract and categorise transactions</li>
              <li>Provides an AI portfolio advisor that offers informational analysis of investment holdings, with awareness of Canadian tax account types (TFSA, RRSP)</li>
              <li>Sends optional notifications, bill reminders, and financial summaries</li>
            </ul>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3 mt-4">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-amber-800 dark:text-amber-200 text-sm">
                BudgetSmart AI is a software tool, not a financial services company, bank, or licensed financial advisor. See Section 8 (Not Financial Advice) and Section 9 (AI Features) for important disclaimers.
              </p>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-4">3. Account Security</h2>
            <p className="text-muted-foreground mb-3">You are responsible for:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Keeping your login credentials confidential</li>
              <li>All activity that occurs under your account</li>
              <li>Notifying us immediately at <a href="mailto:admin@budgetsmart.io" className="text-primary hover:underline">admin@budgetsmart.io</a> if you suspect unauthorised access to your account</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              Two-factor authentication (2FA) is available in your account settings. We strongly recommend enabling it for additional security.
            </p>
            <p className="text-muted-foreground mt-2">
              We may suspend or terminate your account if we detect suspicious activity or a security risk.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">4. Subscription and Billing</h2>

            <h3 className="text-lg font-medium mt-4 mb-2">4.1 Plans and Pricing</h3>
            <p className="text-muted-foreground">
              BudgetSmart AI offers both free and paid subscription plans. Paid features and current pricing are described on the pricing page at budgetsmart.io. Prices are displayed in Canadian dollars (CAD) unless otherwise stated. Pricing may change with reasonable notice.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">4.2 Billing</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Paid plans are billed in advance (monthly or annually, as selected at checkout)</li>
              <li>Billing is processed by <strong>Stripe</strong>, our payment processor. Your payment information is stored securely by Stripe, not BudgetSmart AI. Charges will appear on your statement as BUDGETSMART AI</li>
              <li>By subscribing, you authorise BudgetSmart AI to charge the payment method on file on a recurring basis until cancelled</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">4.3 Cancellation</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>You may cancel your subscription at any time from your account settings</li>
              <li>Upon cancellation, your paid access continues until the end of the current billing period</li>
              <li>After the billing period ends, your account reverts to the free tier or becomes inactive</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">4.4 Refunds</h3>
            <p className="text-muted-foreground">
              Payments are generally non-refundable. Exceptions may apply where required by applicable consumer protection law,
              including the Ontario Consumer Protection Act, 2002. To request a refund, contact{" "}
              <a href="mailto:admin@budgetsmart.io" className="text-primary hover:underline">admin@budgetsmart.io</a>.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">4.5 Subscription Billing</h3>
            <p className="leading-relaxed mb-4">
              When you upgrade to a paid subscription, you will be charged the subscription fee at the beginning of each billing cycle (monthly or annually, based on your selected plan). If you cancel, your paid subscription remains active until the end of the current billing period, after which your account reverts to the Free Plan.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">5. Prohibited Uses</h2>
            <p className="text-muted-foreground mb-3">You may not use BudgetSmart AI to:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Violate any applicable law or regulation</li>
              <li>Attempt to gain unauthorised access to BudgetSmart AI's systems, infrastructure, or another user's account</li>
              <li>Upload, transmit, or store malicious code, viruses, or harmful content</li>
              <li>Scrape, copy, or redistribute BudgetSmart AI's data or platform features without written permission</li>
              <li>Impersonate another person or entity</li>
              <li>Use the platform to facilitate financial fraud, money laundering, or any illegal financial activity</li>
              <li>Misuse or abuse bank connection features (MX Technologies, Plaid) in violation of their terms of service</li>
              <li>Reverse engineer, decompile, or attempt to extract source code from BudgetSmart AI</li>
              <li>Use automated scripts, bots, or crawlers to access or interact with the service without authorisation</li>
            </ul>
            <p className="text-muted-foreground mt-3">Violations may result in immediate suspension or termination of your account without refund.</p>

            <h2 className="text-xl font-semibold mt-8 mb-4">6. Bank Account Connections</h2>
            <p className="text-muted-foreground mb-3">
              To sync your transactions, BudgetSmart AI connects to your financial institutions via MX Technologies (primary provider) and/or Plaid. By connecting your bank account:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>You authorise BudgetSmart AI to access your transaction history and account balances for the purpose of providing the service</li>
              <li><strong>We never access or store your bank login credentials.</strong> Authentication happens directly between you and your financial institution via MX Technologies or Plaid. Neither BudgetSmart AI nor our connection providers store your banking passwords</li>
              <li>You can disconnect your bank accounts at any time from your account settings</li>
              <li>Disconnecting removes BudgetSmart AI's access to future transaction data. Previously imported transactions remain in your account unless you request deletion per our Privacy Policy</li>
              <li>BudgetSmart AI is not responsible for errors, delays, or interruptions in data from MX Technologies, Plaid, or your financial institution</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">7. Intellectual Property</h2>
            <p className="text-muted-foreground mb-3">
              BudgetSmart AI's software, design, branding, and content are owned by BudgetSmart AI and protected by applicable intellectual property laws, including Canadian copyright and trademark law.
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>You are granted a limited, non-exclusive, non-transferable licence to use BudgetSmart AI for your personal, non-commercial use</li>
              <li>You may not copy, reproduce, distribute, or create derivative works from BudgetSmart AI's content or software without written permission</li>
              <li>Your data (transactions, budgets, notes, uploaded receipts) remains yours. We do not claim ownership of your personal financial data. See our Privacy Policy for how we handle your data</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">8. Not Financial Advice</h2>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-800 dark:text-amber-200 font-medium">Important Disclaimer</p>
                <p className="text-amber-700 dark:text-amber-300 text-sm mt-1">
                  BudgetSmart AI is a budgeting and financial tracking tool. It does <strong>NOT</strong> provide financial advice,
                  investment advice, tax advice, or any other professional financial services.
                </p>
              </div>
            </div>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-4">
              <li>AI-generated insights, transaction categorisations, portfolio analysis, and receipt interpretations are informational only and may contain errors or inaccuracies</li>
              <li>BudgetSmart AI is not a licensed financial advisor, investment dealer, broker, or bank</li>
              <li>Financial decisions — including investment, tax, and spending decisions — are solely your responsibility</li>
              <li>Consult a qualified financial professional before making significant financial decisions</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              We are not liable for any financial losses resulting from reliance on information, analysis, or insights provided by BudgetSmart AI.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">9. AI Features</h2>
            <p className="text-muted-foreground mb-4">
              BudgetSmart AI uses artificial intelligence and machine learning to power several features. By using these features, you acknowledge and agree to the following:
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">9.1 What AI Powers</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Transaction categorisation and spending pattern analysis</li>
              <li>Receipt scanning — AI extracts merchant name, date, amount, and category from photos of receipts you submit</li>
              <li>Portfolio advisor — AI provides informational analysis of investment holdings, including Canadian tax account context (TFSA, RRSP). This is not investment advice</li>
              <li>General financial insights, budget recommendations, and anomaly detection</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">9.2 Accuracy Limitations</h3>
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start gap-3 mb-4">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-blue-800 dark:text-blue-200 text-sm">
                AI-generated outputs may be incomplete, incorrect, or outdated. Receipt scanning accuracy depends on image quality. Portfolio analysis does not account for all individual financial circumstances. Always verify AI outputs independently.
              </p>
            </div>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>AI outputs are provided on an informational basis only. They do not constitute financial, tax, or investment advice</li>
              <li>Receipt scan results may contain errors in extracted amounts, dates, or categories. You are responsible for reviewing and correcting any errors before relying on the data</li>
              <li>AI models used by BudgetSmart AI are provided by third-party providers (OpenAI, Anthropic, AWS). These providers process limited, necessary data pursuant to their own terms and privacy policies</li>
              <li>AI models are updated periodically. This may affect output style, accuracy, or available features</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">9.3 Data Used in AI Features</h3>
            <p className="text-muted-foreground">
              When you use AI features, limited financial data (such as transaction descriptions, receipt images, or account summaries) is transmitted to our AI providers to generate the requested output. We do not send your name, government ID, or banking credentials to AI providers. See our Privacy Policy for full details.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">10. Disclaimer of Warranties</h2>
            <p className="text-muted-foreground mb-3">
              BudgetSmart AI is provided <strong>"as is"</strong> and <strong>"as available"</strong> without warranties of any kind, express or implied.
              We do not warrant that:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>The service will be uninterrupted, error-free, or completely secure at all times</li>
              <li>Transaction data imported from financial institutions will be complete or 100% accurate</li>
              <li>AI-generated insights, categorisations, or receipt scans will be free of errors</li>
              <li>The service will meet your specific requirements or expectations</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              We make reasonable commercial efforts to maintain availability and accuracy, including through our uptime monitoring and security controls, but cannot guarantee them.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">11. Limitation of Liability</h2>
            <p className="text-muted-foreground mb-3">To the maximum extent permitted by applicable law:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>BudgetSmart AI's total liability for any claim arising out of or related to these Terms or the service shall not exceed the amount you paid to BudgetSmart AI in the <strong>12 months prior</strong> to the claim</li>
              <li>We are not liable for indirect, incidental, special, consequential, or punitive damages, including loss of data, loss of profits, or financial losses arising from use of the service</li>
              <li>We are not responsible for failures, delays, or errors of third-party services, including financial institutions, MX Technologies, Plaid, Stripe, or AI providers</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              Some jurisdictions, including Ontario under the Consumer Protection Act, 2002, do not allow certain limitations on liability or implied warranties. Some of the above limitations may not apply to you.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">12. Privacy and Data</h2>
            <p className="text-muted-foreground mb-3">
              Your use of BudgetSmart AI is governed by our{" "}
              <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
              , available at budgetsmart.io/privacy, which is incorporated into these Terms by reference. By using BudgetSmart AI, you consent to our data practices as described in the Privacy Policy.
            </p>
            <p className="text-muted-foreground">
              As a Canadian service, BudgetSmart AI complies with the Personal Information Protection and Electronic Documents Act (PIPEDA) and applicable provincial privacy legislation. You have the right to access, correct, and request deletion of your personal data. Contact{" "}
              <a href="mailto:admin@budgetsmart.io" className="text-primary hover:underline">admin@budgetsmart.io</a>{" "}
              to exercise these rights.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">13. Changes to the Service</h2>
            <p className="text-muted-foreground mb-3">
              We reserve the right to modify, suspend, or discontinue any part of BudgetSmart AI at any time. We are not liable to you or any third party for any modification, suspension, or discontinuation of the service.
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Significant feature changes will be communicated with at least <strong>30 days' notice</strong> via email or in-app notification</li>
              <li>Pricing changes will be communicated with at least <strong>30 days' notice</strong></li>
              <li>Minor bug fixes, security updates, and UI improvements may be deployed without notice</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">14. Termination</h2>
            <h3 className="text-lg font-medium mt-4 mb-2">14.1 By You</h3>
            <p className="text-muted-foreground mb-3">
              You may cancel your account at any time from account settings or by emailing{" "}
              <a href="mailto:admin@budgetsmart.io" className="text-primary hover:underline">admin@budgetsmart.io</a>.
              Data deletion will occur per our Privacy Policy and Data Retention Policy (budgetsmart.io/privacy).
            </p>
            <h3 className="text-lg font-medium mt-4 mb-2">14.2 By Us</h3>
            <p className="text-muted-foreground mb-2">We may suspend or terminate your account with reasonable notice if:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>You violate these Terms</li>
              <li>Your account has been inactive for an extended period (we will provide advance notice before deactivating inactive accounts)</li>
              <li>We are required to do so by applicable law or court order</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              For serious violations — including fraud, security attacks, or illegal activity — we may terminate your account immediately without notice.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">15. Governing Law</h2>
            <p className="text-muted-foreground mb-3">
              These Terms are governed by and construed in accordance with the laws of the{" "}
              <strong>Province of Ontario, Canada</strong>, and the federal laws of Canada applicable therein, without regard to conflict of law principles.
            </p>
            <p className="text-muted-foreground">
              Nothing in these Terms limits any rights you may have under the Ontario Consumer Protection Act, 2002, or other applicable mandatory consumer protection legislation.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">16. Dispute Resolution</h2>
            <p className="text-muted-foreground mb-3">
              Before initiating formal legal proceedings, both parties agree to attempt to resolve disputes informally. Contact us at{" "}
              <a href="mailto:admin@budgetsmart.io" className="text-primary hover:underline">admin@budgetsmart.io</a>{" "}
              with a written description of the dispute.
            </p>
            <p className="text-muted-foreground mb-3">If informal resolution is not achieved within 30 days:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Disputes shall be resolved through binding arbitration or litigation in the courts of Ontario, Canada</li>
              <li>You consent to the exclusive jurisdiction of courts located in <strong>Hamilton, Ontario, Canada</strong></li>
            </ul>
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start gap-3 mt-4">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-blue-800 dark:text-blue-200 text-sm">
                <strong>Class action waiver:</strong> To the extent permitted by applicable law, you agree to resolve disputes individually and waive the right to participate in class action lawsuits. This waiver does not apply where prohibited by mandatory consumer protection legislation.
              </p>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-4">17. Changes to These Terms</h2>
            <p className="text-muted-foreground mb-3">We may update these Terms from time to time. When we do, we will:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Update the "Last Updated" date at the top of this document</li>
              <li>Notify you via email or in-app notification for material changes at least <strong>14 days</strong> before they take effect</li>
              <li>For non-material changes (grammar, formatting, clarifications), updates take effect upon posting</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              Continued use of BudgetSmart AI after material changes take effect constitutes acceptance of the updated Terms.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">18. Contact</h2>
            <p className="text-muted-foreground mb-3">For questions, complaints, or requests related to these Terms:</p>
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground"><strong>BudgetSmart AI</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">
                  Primary: <a href="mailto:admin@budgetsmart.io" className="text-primary hover:underline">admin@budgetsmart.io</a>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">
                  CEO: Ryan Mahabir — <a href="mailto:ryan@mahabir.pro" className="text-primary hover:underline">ryan@mahabir.pro</a>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">
                  COO / Backup: Wendy Mahabir — <a href="mailto:wendy@artivio.ai" className="text-primary hover:underline">wendy@artivio.ai</a>
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
              <p className="text-sm text-muted-foreground mt-2">
                BudgetSmart AI — Hamilton, Ontario, Canada · budgetsmart.io/terms · Version 1.1 · Effective March 7, 2026 · Last Updated March 9, 2026
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
