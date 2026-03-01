import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Shield, Mail, User, AlertTriangle } from "lucide-react";

export default function CcpaPolicy() {
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
            <h1 className="text-xl font-semibold">CCPA Policy</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" />
              CCPA — California Consumer Privacy Act
            </CardTitle>
            <p className="text-lg font-medium text-muted-foreground">Budget Smart AI</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Effective Date: January 2026</p>
              <p>Last Updated: January 2026</p>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-muted-foreground">
              This CCPA Privacy Notice ("Notice") supplements our{" "}
              <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>{" "}
              and applies to residents of California, USA. Budget Smart AI ("we," "us," or "our"), operated by
              Ryan Mahabir, is committed to complying with the California Consumer Privacy Act of 2018 (CCPA)
              and the California Privacy Rights Act (CPRA).
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">1. Personal Information We Collect</h2>
            <p className="text-muted-foreground mb-3">
              In the past 12 months, we have collected the following categories of personal information:
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-muted-foreground border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-semibold">Category</th>
                    <th className="text-left py-2 pr-4 font-semibold">Examples</th>
                    <th className="text-left py-2 font-semibold">Collected</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 pr-4">Identifiers</td>
                    <td className="py-2 pr-4">Name, email address, IP address</td>
                    <td className="py-2">Yes</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4">Financial Information</td>
                    <td className="py-2 pr-4">Bank transactions, budget data, bills</td>
                    <td className="py-2">Yes</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4">Internet Activity</td>
                    <td className="py-2 pr-4">Browsing history on our site, feature usage</td>
                    <td className="py-2">Yes</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4">Inferences</td>
                    <td className="py-2 pr-4">Financial health profile, spending patterns</td>
                    <td className="py-2">Yes</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4">Geolocation</td>
                    <td className="py-2 pr-4">General location (from IP address only)</td>
                    <td className="py-2">Limited</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Sensitive Personal Info</td>
                    <td className="py-2 pr-4">Financial account details (via Plaid)</td>
                    <td className="py-2">Yes (via third party)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-4">2. How We Use Personal Information</h2>
            <p className="text-muted-foreground mb-3">We use the personal information we collect for the following business purposes:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>To provide, maintain, and improve our budgeting service</li>
              <li>To process payments and manage subscriptions</li>
              <li>To provide AI-powered financial insights and recommendations</li>
              <li>To communicate with you about your account and service updates</li>
              <li>To detect and prevent fraud and security threats</li>
              <li>To comply with legal obligations</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">3. Sharing of Personal Information</h2>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-800 dark:text-amber-200 font-medium">We Do Not Sell Your Personal Information</p>
                <p className="text-amber-700 dark:text-amber-300 text-sm mt-1">
                  Budget Smart AI does not sell or share your personal information with third parties for
                  cross-context behavioral advertising.
                </p>
              </div>
            </div>
            <p className="text-muted-foreground mb-3">We share personal information only with:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Service providers who assist in operating our platform (under contract)</li>
              <li>Payment processors (Stripe) for billing</li>
              <li>Bank connection services (Plaid) for account linking</li>
              <li>Legal authorities when required by law</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">4. Your Rights Under the CCPA / CPRA</h2>
            <p className="text-muted-foreground mb-3">As a California resident, you have the following rights:</p>

            <h3 className="text-lg font-medium mt-6 mb-3">Right to Know</h3>
            <p className="text-muted-foreground">
              You have the right to request that we disclose what personal information we collect, use, disclose,
              and sell about you, including the categories and specific pieces of personal information.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">Right to Delete</h3>
            <p className="text-muted-foreground">
              You have the right to request that we delete personal information we have collected from you,
              subject to certain exceptions (e.g., where we need the information to complete a transaction or
              comply with a legal obligation).
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">Right to Correct</h3>
            <p className="text-muted-foreground">
              You have the right to request that we correct inaccurate personal information we maintain about you.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">Right to Opt Out of Sale / Sharing</h3>
            <p className="text-muted-foreground">
              We do not sell personal information. However, if this practice changes, you will have the right
              to opt out at any time.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">Right to Limit Use of Sensitive Personal Information</h3>
            <p className="text-muted-foreground">
              You have the right to limit our use of sensitive personal information to only that which is
              necessary to provide the requested service.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">Right to Non-Discrimination</h3>
            <p className="text-muted-foreground">
              We will not discriminate against you for exercising any of your CCPA rights. We will not deny
              goods or services, charge different prices, or provide a different level of service based on
              your exercise of privacy rights.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">5. How to Submit a Request</h2>
            <p className="text-muted-foreground mb-3">To exercise your rights, you may:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Email us at: <a href="mailto:privacy@budgetsmart.io" className="text-primary hover:underline">privacy@budgetsmart.io</a></li>
              <li>Submit a request via our <Link href="/contact" className="text-primary hover:underline">Contact page</Link></li>
            </ul>
            <p className="text-muted-foreground mt-3">
              We will verify your identity before processing the request. We aim to respond within 45 days.
              If we need more time, we will inform you of the reason and extension period.
            </p>
            <p className="text-muted-foreground mt-3">
              You may designate an authorized agent to make a request on your behalf. The agent must provide
              written authorization and we may require verification of your identity directly.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">6. Data Retention</h2>
            <p className="text-muted-foreground">
              We retain personal information for as long as necessary to provide our services and comply with
              legal requirements. Upon deletion of your account, we remove or anonymize your data within 30 days.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">7. Updates to This Notice</h2>
            <p className="text-muted-foreground">
              We may update this Notice periodically. We will post changes on this page with an updated
              effective date. If changes are material, we will notify you via email or a prominent notice on
              our service.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">8. Contact</h2>
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground"><strong>Owner:</strong> Ryan Mahabir — Budget Smart AI</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground"><strong>Privacy:</strong> <a href="mailto:privacy@budgetsmart.io" className="text-primary hover:underline">privacy@budgetsmart.io</a></span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground"><strong>Support:</strong> <a href="mailto:support@budgetsmart.io" className="text-primary hover:underline">support@budgetsmart.io</a></span>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t">
              <p className="text-sm text-muted-foreground">
                See also our{" "}
                <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                ,{" "}
                <Link href="/cookies" className="text-primary hover:underline">Cookie Policy</Link>
                ,{" "}
                <Link href="/gdpr" className="text-primary hover:underline">GDPR Policy</Link>
                , and{" "}
                <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
