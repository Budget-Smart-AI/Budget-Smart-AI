import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Cookie, Mail, User, Settings } from "lucide-react";
import { openCookieSettings } from "@/components/cookie-consent";

export default function CookiePolicy() {
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
            <Cookie className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">Cookie Policy</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cookie className="w-6 h-6 text-primary" />
              Cookie Policy
            </CardTitle>
            <p className="text-lg font-medium text-muted-foreground">Budget Smart AI</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Effective Date: January 2026</p>
              <p>Last Updated: January 2026</p>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-muted-foreground">
              This Cookie Policy explains how Budget Smart AI ("we," "us," or "our"), operated by Ryan Mahabir,
              uses cookies and similar tracking technologies when you visit or use our services.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">1. What Are Cookies?</h2>
            <p className="text-muted-foreground">
              Cookies are small text files placed on your device (computer, tablet, or mobile) when you visit a
              website. They help the site remember your preferences and actions over time, or they may be used
              to track your browsing activity for analytics or advertising purposes.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">2. Types of Cookies We Use</h2>

            <h3 className="text-lg font-medium mt-6 mb-3">a) Essential Cookies</h3>
            <p className="text-muted-foreground mb-2">
              These cookies are necessary for the website to function properly and cannot be switched off.
              They are usually set in response to actions you take such as logging in or filling in forms.
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Session management (keeping you logged in)</li>
              <li>Security tokens and CSRF protection</li>
              <li>Load balancing and server routing</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">b) Functional Cookies</h3>
            <p className="text-muted-foreground mb-2">
              These cookies allow us to remember choices you make and provide enhanced, more personalized features.
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Theme preferences (light/dark mode)</li>
              <li>Language and regional settings</li>
              <li>Dashboard layout and widget preferences</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">c) Performance / Analytics Cookies</h3>
            <p className="text-muted-foreground mb-2">
              These cookies help us understand how visitors interact with our website so we can improve performance.
              All information collected is aggregated and anonymous.
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Page visit counts and traffic sources</li>
              <li>Feature usage statistics</li>
              <li>Error and crash reporting</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">d) Targeting / Marketing Cookies</h3>
            <p className="text-muted-foreground mb-2">
              These cookies may be set through our site by our advertising partners to build a profile of your
              interests and show you relevant ads on other sites. They do not store personal information directly.
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Referral source tracking</li>
              <li>Affiliate program attribution</li>
              <li>Retargeting pixel data (where applicable)</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">3. Third-Party Cookies</h2>
            <p className="text-muted-foreground mb-3">
              Some of our pages display content from third-party providers who may set their own cookies.
              We have no control over third-party cookies. Examples include:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Stripe (payment processing)</li>
              <li>Plaid (bank account connection)</li>
              <li>Analytics providers</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              Please refer to the respective privacy policies of these third parties for more information.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">4. Your Cookie Choices</h2>
            <p className="text-muted-foreground mb-3">
              When you first visit our site, you are shown a cookie consent banner. You may choose to accept
              all cookies or configure your preferences. You can change your preferences at any time using the
              button below.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-1 mb-4"
              onClick={openCookieSettings}
            >
              <Settings className="w-4 h-4 mr-2" />
              Manage Cookie Settings
            </Button>
            <p className="text-muted-foreground">
              You can also control cookies through your browser settings. Note that disabling certain cookies
              may affect the functionality of our service. Essential cookies cannot be disabled as they are
              required for the service to operate.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">5. Cookie Retention</h2>
            <p className="text-muted-foreground mb-3">Cookies are stored for varying durations:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li><strong>Session cookies</strong> — deleted when you close your browser</li>
              <li><strong>Persistent cookies</strong> — stored for up to 12 months</li>
              <li><strong>Third-party cookies</strong> — duration set by the third party</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">6. Updates to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this Cookie Policy from time to time. We will notify you of any significant
              changes by posting the new policy on this page with an updated effective date.
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
                <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                ,{" "}
                <Link href="/gdpr" className="text-primary hover:underline">GDPR Policy</Link>
                ,{" "}
                <Link href="/ccpa" className="text-primary hover:underline">CCPA Policy</Link>
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
