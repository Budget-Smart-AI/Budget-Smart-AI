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
            <p className="text-lg font-medium text-muted-foreground">Budget Smart AI</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Effective Date: January 2026</p>
              <p>Last Updated: January 2026</p>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-muted-foreground">
              Budget Smart AI ("we," "us," or "our") is operated by Ryan Mahabir.
              This Privacy Policy describes how we collect, use, and protect your information when you use:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mb-6">
              <li><a href="https://budgetsmart.ai" className="text-primary hover:underline">https://budgetsmart.ai</a></li>
              <li><a href="https://app.budgetsmart.ai" className="text-primary hover:underline">https://app.budgetsmart.ai</a></li>
              <li><a href="https://budgetsmart.io" className="text-primary hover:underline">https://budgetsmart.io</a></li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">1. Information We Collect</h2>

            <h3 className="text-lg font-medium mt-6 mb-3">a) Personal Information</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Name</li>
              <li>Email address</li>
              <li>Login credentials</li>
              <li>Billing information (processed by third-party providers)</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">b) Financial Data (with your permission)</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Account balances</li>
              <li>Transactions</li>
              <li>Budget categories</li>
            </ul>
            <p className="text-muted-foreground mt-3 p-3 bg-muted rounded-lg">
              <strong>Important:</strong> We never store your bank login credentials. All financial data is accessed securely through third-party providers such as Plaid.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">c) Technical Data</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>IP address</li>
              <li>Device and browser type</li>
              <li>Usage activity</li>
              <li>Cookies and similar tracking tools</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">2. How We Use Your Data</h2>
            <p className="text-muted-foreground mb-3">We use your information to:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Provide budgeting and AI insights</li>
              <li>Improve our platform</li>
              <li>Process subscriptions</li>
              <li>Send service notifications</li>
              <li>Prevent fraud</li>
            </ul>
            <p className="text-primary font-medium mt-3">We do not sell your data.</p>

            <h2 className="text-xl font-semibold mt-8 mb-4">3. Data Sharing</h2>
            <p className="text-muted-foreground mb-3">We only share data with:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Payment processors</li>
              <li>Cloud and hosting providers</li>
              <li>Analytics tools</li>
              <li>Customer support services</li>
            </ul>
            <p className="text-muted-foreground mt-3">All partners are contractually required to protect your data.</p>

            <h2 className="text-xl font-semibold mt-8 mb-4">4. Cookies</h2>
            <p className="text-muted-foreground mb-3">We use cookies to:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Keep you logged in (Essential)</li>
              <li>Enable personalized features (Functional)</li>
              <li>Measure performance (Performance)</li>
              <li>Improve features and user experience (Targeting)</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              You can manage your cookie preferences at any time.
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

            <h2 className="text-xl font-semibold mt-8 mb-4">5. Data Security</h2>
            <p className="text-muted-foreground">
              We use encryption, access controls, and secure infrastructure.
              However, no method of transmission is 100% secure.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">6. Your Rights</h2>
            <p className="text-muted-foreground mb-3">You may request:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Data access</li>
              <li>Corrections</li>
              <li>Deletion</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              Email: <a href="mailto:support@budgetsmart.io" className="text-primary hover:underline">support@budgetsmart.io</a>
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">7. Contact</h2>
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground"><strong>Owner:</strong> Ryan Mahabir</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground"><strong>Support:</strong> <a href="mailto:support@budgetsmart.io" className="text-primary hover:underline">support@budgetsmart.io</a></span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground"><strong>General:</strong> <a href="mailto:hello@budgetsmart.io" className="text-primary hover:underline">hello@budgetsmart.io</a></span>
              </div>
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
