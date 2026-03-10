import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Shield, Mail, User, Settings } from "lucide-react";
import { openCookieSettings } from "@/components/cookie-consent";

export default function PrivacyPolicy() {
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
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">Privacy Policy</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" />
              Privacy Policy
            </CardTitle>
            <p className="text-lg font-medium text-muted-foreground">BudgetSmart AI</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Version: 1.1 | Effective Date: March 7, 2026</p>
              <p>Last Updated: March 9, 2026</p>
              <p>Operated by Ryan Mahabir | Hamilton, Ontario, Canada</p>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <div className="p-3 bg-muted rounded-lg mb-6">
              <p className="text-muted-foreground font-medium">We Respect Your Privacy</p>
              <p className="text-muted-foreground mt-1">
                BudgetSmart AI is a personal finance tool operated by Ryan Mahabir in Hamilton, Ontario, Canada.
                We take your privacy seriously. This policy explains what information we collect, how we use it, and the choices you have.
              </p>
              <ul className="list-none text-muted-foreground mt-2 space-y-1">
                <li>✔ We collect only what we need to run the service.</li>
                <li>✔ We never sell your data — to anyone, ever.</li>
                <li>✔ We keep your data secure with AES-256-GCM encryption.</li>
                <li>✔ You can request deletion of your data at any time.</li>
              </ul>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-4">1. What Data We Collect</h2>

            <h3 className="text-lg font-medium mt-6 mb-3">Account Information</h3>
            <p className="text-muted-foreground mb-2">When you sign up, we collect:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Your name and email address</li>
              <li>Your password (stored as a secure one-way hash — we never see it in plain text)</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">Financial Data (with your permission)</h3>
            <p className="text-muted-foreground mb-2">When you connect your bank accounts, we collect:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Account balances and transaction history</li>
              <li>Account names and types</li>
            </ul>
            <p className="text-muted-foreground mt-3 p-3 bg-muted rounded-lg">
              <strong>Important:</strong> We connect to your bank through Plaid or MX — trusted financial data platforms.
              We never see or store your bank login credentials. Your bank login happens directly with your bank through their secure portal.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">Receipt Scan Images</h3>
            <p className="text-muted-foreground mb-2">
              If you use the receipt scanning feature, we store your uploaded receipt images in secure cloud object storage (Cloudflare R2). Receipt images:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Are encrypted at rest using server-side encryption.</li>
              <li>Are retained for up to 7 years as financial source documents (consistent with Canadian tax record-keeping requirements).</li>
              <li>Are deleted upon account deletion, subject to the retention period above.</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">Usage Data</h3>
            <p className="text-muted-foreground mb-2">We automatically collect:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Pages visited and features used within the app</li>
              <li>Device type and browser (to ensure compatibility)</li>
              <li>IP address (for security and fraud prevention purposes)</li>
              <li>Cookies and session tokens (to keep you logged in)</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">AI Interactions</h3>
            <p className="text-muted-foreground mb-2">
              If you use BudgetSmart AI's AI features (budgeting insights, portfolio analysis, receipt scanning), we may log your prompts and the AI responses for a limited period to improve quality and debug issues. These logs are:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Retained for <strong>90 days</strong>, then automatically deleted.</li>
              <li>Never shared externally or used to train AI models.</li>
              <li>Processed by our AI providers (see Section 3) under their data processing terms.</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">Support Communications</h3>
            <p className="text-muted-foreground">
              If you contact us for support, we retain records of that communication for <strong>3 years</strong> to help resolve future questions.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">2. How We Use Your Data</h2>
            <p className="text-muted-foreground mb-3">We use your data to:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Provide the budgeting, transaction tracking, and AI insights features you signed up for</li>
              <li>Send you important service notifications (e.g., security alerts, billing receipts)</li>
              <li>Improve the product based on aggregated, anonymised usage patterns</li>
              <li>Detect and prevent fraud and unauthorised access</li>
              <li>Comply with our legal obligations under PIPEDA and applicable law</li>
            </ul>
            <div className="mt-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-primary font-medium">We do not sell your data. We do not use your financial data for advertising. We do not share your data with third parties beyond what is necessary to run the service.</p>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-4">3. Who Can Access Your Data</h2>

            <h3 className="text-lg font-medium mt-4 mb-3">BudgetSmart AI Team</h3>
            <p className="text-muted-foreground">
              BudgetSmart AI is currently operated by Ryan Mahabir. Access to production data is restricted to authorised personnel
              with multi-factor authentication (MFA). All access is logged for security and audit purposes.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-3">Third-Party Processors</h3>
            <p className="text-muted-foreground mb-3">
              We share data with the following service providers, who are contractually required to protect it:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-muted-foreground border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium">Provider</th>
                    <th className="text-left py-2 pr-4 font-medium">Purpose</th>
                    <th className="text-left py-2 pr-4 font-medium">SOC 2 Certified</th>
                    <th className="text-left py-2 font-medium">Data Location</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: "NeonDB", purpose: "Database storage", soc2: "✅ Yes", location: "Canada / U.S." },
                    { name: "Railway", purpose: "Application hosting", soc2: "✅ Yes", location: "Canada" },
                    { name: "Cloudflare", purpose: "CDN, security, DNS, file storage (R2)", soc2: "✅ Yes", location: "Distributed / Global" },
                    { name: "Plaid", purpose: "Bank account connection", soc2: "✅ Yes", location: "U.S." },
                    { name: "MX", purpose: "Bank account connection (primary)", soc2: "✅ Yes", location: "U.S." },
                    { name: "Stripe", purpose: "Subscription billing", soc2: "✅ Yes", location: "U.S." },
                    { name: "Postmark", purpose: "Transactional email", soc2: "✅ Yes", location: "U.S." },
                    { name: "OpenAI", purpose: "AI features (fallback)", soc2: "✅ Yes", location: "U.S." },
                    { name: "Anthropic", purpose: "AI features (receipt scanning, vision)", soc2: "✅ Yes", location: "U.S." },
                    { name: "DeepSeek", purpose: "AI features (fallback inference via AWS Bedrock)", soc2: "✅ Yes (via AWS Bedrock)", location: "China / Global" },
                    { name: "Comp AI", purpose: "SOC 2 compliance platform", soc2: "✅ Yes", location: "U.S." },
                  ].map((vendor) => (
                    <tr key={vendor.name} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{vendor.name}</td>
                      <td className="py-2 pr-4">{vendor.purpose}</td>
                      <td className="py-2 pr-4">{vendor.soc2}</td>
                      <td className="py-2">{vendor.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <p className="text-sm text-muted-foreground">
                <strong>⚠️ DeepSeek:</strong> DeepSeek is an AI model developed by a Chinese company. However, BudgetSmart AI does not connect
                to DeepSeek directly or send any data to servers in China. Instead, DeepSeek is accessed exclusively through AWS Bedrock —
                Amazon's managed AI platform — which hosts and serves the model entirely within AWS's infrastructure in the United States.
                This means all data remains within AWS's environment at all times and never leaves AWS to reach DeepSeek or any servers in China.
                AWS is SOC 2 Type II certified and subject to U.S. data protection standards. BudgetSmart AI is also actively planning to migrate
                to AWS Bedrock's own native models, which will replace DeepSeek entirely.
              </p>
            </div>
            <p className="text-muted-foreground mt-3">
              We do <strong>not</strong> share your personal information with any marketing companies, data brokers, or advertising networks.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">4. Data Storage and Security</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Your data is stored on servers in <strong>Canada and the United States</strong></li>
              <li>Sensitive data (such as bank connection tokens) is encrypted using <strong>AES-256-GCM</strong> field-level encryption before being stored in our database</li>
              <li>Receipt scan images are encrypted at rest in Cloudflare R2 using server-side encryption</li>
              <li>All data in transit is protected using <strong>TLS 1.2 or higher (HTTPS)</strong>. HTTP connections are automatically redirected to HTTPS.</li>
              <li>We enforce multi-factor authentication (MFA) for all administrative access</li>
              <li>Two-factor authentication (2FA) is available to all customers via Settings → Security → 2FA. We strongly encourage you to enable it.</li>
              <li>We are pursuing <strong>SOC 2 Type I certification</strong> (target: August 2026) through our compliance partner Comp AI</li>
            </ul>
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-muted-foreground">
                🇪🇺 <strong>GDPR:</strong> BudgetSmart AI does not currently serve users in the European Union or European Economic Area.
                If this changes, this policy will be updated to reflect GDPR obligations, including additional rights and data transfer safeguards.
              </p>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-4">5. How Long We Keep Your Data</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-muted-foreground border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium">Data Type</th>
                    <th className="text-left py-2 font-medium">How Long We Keep It</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { type: "Account information", period: "Until you delete your account (+ 30-day grace period before permanent deletion)" },
                    { type: "Financial transactions", period: "Up to 7 years (for your own records and Canadian tax purposes)" },
                    { type: "Receipt scan images", period: "Up to 7 years (financial source documents)" },
                    { type: "AI conversation logs", period: "90 days, then automatically deleted" },
                    { type: "Support tickets", period: "3 years" },
                    { type: "Login sessions", period: "30 days after expiry, then automatically deleted" },
                    { type: "Billing records", period: "7 years" },
                    { type: "Bank connection tokens", period: "Deleted immediately when you disconnect your bank account" },
                  ].map((row) => (
                    <tr key={row.type} className="border-b last:border-0">
                      <td className="py-2 pr-4">{row.type}</td>
                      <td className="py-2">{row.period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground mt-3 text-sm">
              You can request deletion of your data at any time (see Section 7). Some data may be retained longer if required by law or if a legal hold is in effect.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">6. Cookies</h2>
            <p className="text-muted-foreground mb-3">We use cookies to:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Keep you signed in (essential — required for the service to work)</li>
              <li>Remember your preferences (e.g., display theme)</li>
              <li>Understand how people use BudgetSmart AI (analytics — you can opt out)</li>
            </ul>
            <p className="text-muted-foreground mt-3 text-sm">
              You can manage cookie preferences from the cookie banner when you first visit the site, or by contacting us at{" "}
              <a href="mailto:admin@budgetsmart.io" className="text-primary hover:underline">admin@budgetsmart.io</a>.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={openCookieSettings}
            >
              <Settings className="w-4 h-4 mr-2" />
              Manage Cookie Settings
            </Button>

            <h2 className="text-xl font-semibold mt-8 mb-4">7. Your Rights</h2>
            <p className="text-muted-foreground mb-3">You have the right to:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-muted-foreground border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium">Right</th>
                    <th className="text-left py-2 font-medium">What It Means</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { right: "Access", meaning: "Request a copy of the personal data we hold about you" },
                    { right: "Correct", meaning: "Ask us to fix inaccurate or incomplete information" },
                    { right: "Delete", meaning: "Request deletion of your account and personal data" },
                    { right: "Export", meaning: "Receive your data in a portable, machine-readable format" },
                    { right: "Withdraw consent", meaning: "Opt out of optional data processing (e.g., analytics cookies)" },
                    { right: "Object", meaning: "Object to how we process your data in certain circumstances" },
                  ].map((row) => (
                    <tr key={row.right} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{row.right}</td>
                      <td className="py-2">{row.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground mt-3">
              To exercise any of these rights, email{" "}
              <a href="mailto:admin@budgetsmart.io" className="text-primary hover:underline">admin@budgetsmart.io</a>{" "}
              with the subject line "Privacy Request." We will acknowledge your request within <strong>5 business days</strong> and complete it within <strong>30 days</strong>.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">8. PIPEDA Compliance (Canada)</h2>
            <p className="text-muted-foreground mb-3">
              BudgetSmart AI is subject to Canada's <strong>Personal Information Protection and Electronic Documents Act (PIPEDA)</strong>. We:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Collect only the information we need for the specified purpose</li>
              <li>Obtain your consent before collecting personal information</li>
              <li>Keep your information accurate and up to date</li>
              <li>Protect your information with appropriate security safeguards, including AES-256-GCM encryption and MFA</li>
              <li>Give you access to your information upon request</li>
              <li>Report data breaches to the Office of the Privacy Commissioner of Canada (OPC) as soon as feasible when required</li>
            </ul>
            <p className="text-muted-foreground mt-3 text-sm">
              To reach the OPC: <a href="https://www.priv.gc.ca" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">www.priv.gc.ca</a> | 1-800-282-1376
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">9. CCPA Compliance (California Residents)</h2>
            <p className="text-muted-foreground mb-3">
              If you are a California resident, you have additional rights under the <strong>California Consumer Privacy Act (CCPA)</strong>:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li><strong>Right to Know:</strong> You may request what personal information we have collected about you</li>
              <li><strong>Right to Delete:</strong> You may request deletion of your personal information</li>
              <li><strong>Right to Opt-Out of Sale:</strong> We <strong>do not sell</strong> your personal information</li>
              <li><strong>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising your rights</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              To submit a CCPA request, email{" "}
              <a href="mailto:admin@budgetsmart.io" className="text-primary hover:underline">admin@budgetsmart.io</a>{" "}
              with "CCPA Request" in the subject line.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">10. Children's Privacy</h2>
            <p className="text-muted-foreground">
              BudgetSmart AI is a personal finance tool intended for adults. We do not knowingly collect personal information from anyone under the age of 18.
              If you believe we have inadvertently collected information from a minor, please contact us immediately at{" "}
              <a href="mailto:admin@budgetsmart.io" className="text-primary hover:underline">admin@budgetsmart.io</a>{" "}
              and we will delete it promptly.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">11. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this policy from time to time. When we do, we will update the "Last Updated" date above and notify you via email
              or in-app notice if the changes are material.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">12. Contact Us</h2>
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground"><strong>BudgetSmart AI</strong> — operated by Ryan Mahabir</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">
                  <a href="mailto:admin@budgetsmart.io" className="text-primary hover:underline">admin@budgetsmart.io</a>
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Hamilton, Ontario, Canada · budgetsmart.io</p>
            </div>

            <div className="mt-8 pt-6 border-t">
              <p className="text-sm text-muted-foreground">
                See also our{" "}
                <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
                {" "}and{" "}
                <Link href="/data-retention" className="text-primary hover:underline">Data Retention Policy</Link>.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
