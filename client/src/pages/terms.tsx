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
            <p className="text-lg font-medium text-muted-foreground">Budget Smart AI</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Effective Date: January 2026</p>
              <p>Last Updated: January 2026</p>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-muted-foreground">
              By accessing or using Budget Smart AI, you agree to these Terms.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">1. Eligibility</h2>
            <p className="text-muted-foreground">
              You must be at least 18 years old to use the platform.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">2. No Financial Advice</h2>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-800 dark:text-amber-200 font-medium">Important Disclaimer</p>
                <p className="text-amber-700 dark:text-amber-300 text-sm mt-1">
                  Budget Smart AI provides informational tools only. We are not financial advisors.
                </p>
              </div>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-4">3. Subscriptions & Billing</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Plans are billed in advance</li>
              <li>Payments are non-refundable unless required by law</li>
              <li>Pricing may change with notice</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">4. Acceptable Use</h2>
            <p className="text-muted-foreground mb-3">You may not:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Abuse the system</li>
              <li>Attempt unauthorized access</li>
              <li>Upload illegal content</li>
              <li>Misuse financial data</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              We may suspend or terminate accounts for violations.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">5. Intellectual Property</h2>
            <p className="text-muted-foreground">
              All content, branding, and software belong to Budget Smart AI and Ryan Mahabir.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">6. Limitation of Liability</h2>
            <p className="text-muted-foreground mb-3">We are not responsible for:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Financial losses</li>
              <li>Inaccurate data</li>
              <li>Third-party failures</li>
            </ul>
            <p className="text-muted-foreground mt-3 font-medium">
              Use the service at your own risk.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">7. Termination</h2>
            <p className="text-muted-foreground">
              We may suspend or terminate access at any time for violations.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">8. Governing Law</h2>
            <p className="text-muted-foreground">
              These Terms are governed by the laws of your operating jurisdiction.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">9. Contact</h2>
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
