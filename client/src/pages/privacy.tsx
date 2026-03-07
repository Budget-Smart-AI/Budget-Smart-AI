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
            <p className="text-lg font-medium text-muted-foreground">BudgetSmart</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Effective Date: March 7, 2026</p>
              <p>Last Updated: March 7, 2026</p>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <div className="p-3 bg-muted rounded-lg mb-6">
              <p className="text-muted-foreground font-medium">We Respect Your Privacy</p>
              <p className="text-muted-foreground mt-1">
                BudgetSmart is operated by Ryan Mahabir in Hamilton, Ontario, Canada.
                We collect only what we need to run the service. <strong>We never sell your data.</strong> We keep it secure.
              </p>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-4">1. What Data We Collect</h2>

            <h3 className="text-lg font-medium mt-6 mb-3">Account Information</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Your name and email address</li>
              <li>Your password (stored as a secure hash — we never see it in plain text)</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">Financial Data (with your permission)</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Account balances and transaction history</li>
              <li>Account names and types</li>
            </ul>
            <p className="text-muted-foreground mt-3 p-3 bg-muted rounded-lg">
              <strong>Important:</strong> We connect to your bank through Plaid or MX — trusted financial data platforms.
              We never see or store your bank login credentials. Your bank login happens directly with your bank through their secure portal.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">Usage Data</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Pages visited and features used within the app</li>
              <li>Device type and browser (to ensure compatibility)</li>
              <li>IP address (for security purposes)</li>
              <li>Cookies and session tokens (to keep you logged in)</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">AI Interactions</h3>
            <p className="text-muted-foreground">
              If you use BudgetSmart's AI features, we may log your prompts and the AI's responses for a limited period
              to improve quality and debug issues. These logs are retained for <strong>90 days</strong> and never shared externally.
              We do not use your data to train AI models.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">Support Communications</h3>
            <p className="text-muted-foreground">
              If you contact us for support, we retain records of that communication for <strong>3 years</strong> to help resolve future questions.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">2. How We Use Your Data</h2>
            <p className="text-muted-foreground mb-3">We use your data to:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Provide budgeting, transaction tracking, and AI insights features</li>
              <li>Send important service notifications (security alerts, billing receipts)</li>
              <li>Improve the product based on aggregated, anonymised usage patterns</li>
              <li>Detect and prevent fraud and unauthorised access</li>
              <li>Comply with our legal obligations</li>
            </ul>
            <div className="mt-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-primary font-medium">We do not sell your data. We do not use your financial data for advertising.</p>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-4">3. Who Can Access Your Data</h2>
            <p className="text-muted-foreground mb-3">
              Only the following can access your personal or financial data:
            </p>

            <h3 className="text-lg font-medium mt-4 mb-3">BudgetSmart Team</h3>
            <p className="text-muted-foreground">
              BudgetSmart is operated by Ryan Mahabir (<a href="mailto:ryan@mahabir.pro" className="text-primary hover:underline">ryan@mahabir.pro</a>).
              Access to production data is restricted to authorised personnel with multi-factor authentication.
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
                    <th className="text-left py-2 font-medium">SOC 2 Certified</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: "NeonDB", purpose: "Database storage", soc2: true },
                    { name: "Railway", purpose: "Application hosting", soc2: true },
                    { name: "Cloudflare", purpose: "CDN, security, DNS", soc2: true },
                    { name: "Plaid", purpose: "Bank account connection", soc2: true },
                    { name: "MX", purpose: "Bank account connection", soc2: true },
                    { name: "Stripe", purpose: "Subscription billing", soc2: true },
                    { name: "Postmark", purpose: "Transactional email", soc2: true },
                    { name: "OpenAI", purpose: "AI features", soc2: true },
                    { name: "Anthropic", purpose: "AI features", soc2: true },
                  ].map((vendor) => (
                    <tr key={vendor.name} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{vendor.name}</td>
                      <td className="py-2 pr-4">{vendor.purpose}</td>
                      <td className="py-2">{vendor.soc2 ? "✅ Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground mt-3">
              We do <strong>not</strong> share your personal information with any marketing companies, data brokers, or advertising networks.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">4. Data Storage and Security</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Your data is stored on servers in <strong>Canada and the United States</strong></li>
              <li>Sensitive data (like bank connection tokens) is encrypted using <strong>AES-256</strong> encryption</li>
              <li>All data in transit is protected using <strong>TLS (HTTPS)</strong></li>
              <li>We enforce multi-factor authentication for all administrative access</li>
              <li>We are pursuing <strong>SOC 2 Type I certification</strong> (scheduled June/July 2026, expected August 2026) through Comp AI</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">5. How Long We Keep Your Data</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-muted-foreground border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium">Data Type</th>
                    <th className="text-left py-2 font-medium">Retention Period</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { type: "Account information", period: "Until you delete your account" },
                    { type: "Financial transactions", period: "Up to 7 years" },
                    { type: "AI conversation logs", period: "90 days" },
                    { type: "Support tickets", period: "3 years" },
                    { type: "Login sessions", period: "30 days after expiry" },
                    { type: "Billing records", period: "7 years" },
                  ].map((row) => (
                    <tr key={row.type} className="border-b last:border-0">
                      <td className="py-2 pr-4">{row.type}</td>
                      <td className="py-2">{row.period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-4">6. Cookies</h2>
            <p className="text-muted-foreground mb-3">We use cookies to:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Keep you signed in (essential — required for the service to work)</li>
              <li>Remember your preferences (functional)</li>
              <li>Understand how people use BudgetSmart (analytics — you can opt out)</li>
            </ul>
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
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li><strong>Access</strong> your personal information — request a copy of the data we hold about you</li>
              <li><strong>Correct</strong> inaccurate information</li>
              <li><strong>Delete</strong> your account and personal data</li>
              <li><strong>Export</strong> your data in a portable format</li>
              <li><strong>Withdraw consent</strong> for optional data processing (e.g., analytics cookies)</li>
              <li><strong>Object</strong> to how we use your data</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              To exercise any of these rights, email{" "}
              <a href="mailto:ryan@mahabir.pro" className="text-primary hover:underline">ryan@mahabir.pro</a>{" "}
              with the subject line "Privacy Request." We will respond within <strong>5 business days</strong> and complete your request within <strong>30 days</strong>.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">8. PIPEDA Compliance (Canada)</h2>
            <p className="text-muted-foreground mb-3">
              BudgetSmart is subject to Canada's <strong>Personal Information Protection and Electronic Documents Act (PIPEDA)</strong>. We:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Collect only the information we need for the specified purpose</li>
              <li>Obtain your consent before collecting personal information</li>
              <li>Keep your information accurate and up to date</li>
              <li>Protect your information with appropriate security safeguards</li>
              <li>Give you access to your information upon request</li>
              <li>Report data breaches to the Office of the Privacy Commissioner of Canada when required</li>
            </ul>

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
              <a href="mailto:ryan@mahabir.pro" className="text-primary hover:underline">ryan@mahabir.pro</a>{" "}
              with "CCPA Request" in the subject line.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">10. Children's Privacy</h2>
            <p className="text-muted-foreground">
              BudgetSmart is not directed at children under 18. We do not knowingly collect personal information from anyone under 18.
              If you believe we have inadvertently collected information from a minor, please contact us immediately.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">11. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this policy from time to time. When we do, we will update the "Last Updated" date above and notify you via email
              or in-app notice if the changes are material.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">12. Contact</h2>
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
