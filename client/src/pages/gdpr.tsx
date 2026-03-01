import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Shield, Mail, User, Globe } from "lucide-react";

export default function GdprPolicy() {
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
            <Globe className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">GDPR Policy</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-6 h-6 text-primary" />
              GDPR — General Data Protection Regulation
            </CardTitle>
            <p className="text-lg font-medium text-muted-foreground">Budget Smart AI</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Effective Date: January 2026</p>
              <p>Last Updated: January 2026</p>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-muted-foreground">
              Budget Smart AI ("we," "us," or "our"), operated by Ryan Mahabir, is committed to protecting
              the personal data of users in the European Union (EU) and European Economic Area (EEA) in
              accordance with the General Data Protection Regulation (GDPR) (EU) 2016/679.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">1. Data Controller</h2>
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground"><strong>Data Controller:</strong> Ryan Mahabir — Budget Smart AI</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground"><strong>Contact:</strong> <a href="mailto:privacy@budgetsmart.io" className="text-primary hover:underline">privacy@budgetsmart.io</a></span>
              </div>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-4">2. Personal Data We Process</h2>
            <p className="text-muted-foreground mb-3">Under the GDPR, we process the following categories of personal data:</p>

            <h3 className="text-lg font-medium mt-6 mb-3">a) Identity &amp; Contact Data</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Name and email address (provided at registration)</li>
              <li>Profile information you choose to add</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">b) Financial Data</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Budgets, bills, and expense records you create</li>
              <li>Bank account transaction data (where linked via Plaid, with your explicit consent)</li>
            </ul>
            <p className="text-muted-foreground mt-2 p-3 bg-muted rounded-lg">
              <strong>Note:</strong> We never store your banking credentials. Financial connections are handled
              securely by Plaid under their own data processing agreements.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">c) Technical Data</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>IP address, browser type, and device identifiers</li>
              <li>Usage logs and session data</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">3. Lawful Basis for Processing</h2>
            <p className="text-muted-foreground mb-3">We rely on the following lawful bases under GDPR Article 6:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li><strong>Contract performance</strong> — to provide the budgeting service you signed up for</li>
              <li><strong>Legitimate interests</strong> — for fraud prevention, security, and platform improvement</li>
              <li><strong>Consent</strong> — for non-essential cookies and optional marketing communications</li>
              <li><strong>Legal obligation</strong> — where required by applicable law</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8 mb-4">4. Your Rights Under GDPR</h2>
            <p className="text-muted-foreground mb-3">As a data subject in the EU/EEA, you have the following rights:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li><strong>Right of Access (Art. 15)</strong> — Request a copy of the personal data we hold about you</li>
              <li><strong>Right to Rectification (Art. 16)</strong> — Request correction of inaccurate or incomplete data</li>
              <li><strong>Right to Erasure (Art. 17)</strong> — Request deletion of your personal data ("right to be forgotten")</li>
              <li><strong>Right to Restrict Processing (Art. 18)</strong> — Request that we limit how we use your data</li>
              <li><strong>Right to Data Portability (Art. 20)</strong> — Receive your data in a portable, machine-readable format</li>
              <li><strong>Right to Object (Art. 21)</strong> — Object to processing based on legitimate interests</li>
              <li><strong>Right to Withdraw Consent</strong> — Where processing is based on consent, you may withdraw at any time</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              To exercise any of these rights, email us at{" "}
              <a href="mailto:privacy@budgetsmart.io" className="text-primary hover:underline">privacy@budgetsmart.io</a>.
              We will respond within 30 days.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">5. Data Retention</h2>
            <p className="text-muted-foreground">
              We retain your personal data only as long as necessary to fulfil the purposes for which it was
              collected, including for legal, accounting, or reporting requirements. When your account is deleted,
              we remove or anonymize your data within 30 days, unless legal obligations require otherwise.
            </p>
            <p className="text-muted-foreground mt-2">
              See our full{" "}
              <Link href="/data-retention" className="text-primary hover:underline">Data Retention Policy</Link>
              {" "}for details.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">6. International Data Transfers</h2>
            <p className="text-muted-foreground">
              Budget Smart AI is operated from outside the EU. When personal data of EU/EEA residents is
              transferred to third countries, we ensure appropriate safeguards are in place, such as Standard
              Contractual Clauses (SCCs) approved by the European Commission, or we rely on adequacy decisions
              where applicable.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">7. Data Processors &amp; Sub-processors</h2>
            <p className="text-muted-foreground mb-3">
              We use the following categories of processors who may handle your personal data on our behalf:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Cloud infrastructure and hosting providers</li>
              <li>Payment processors (Stripe)</li>
              <li>Bank connection services (Plaid)</li>
              <li>AI/ML service providers (for budgeting insights)</li>
              <li>Email delivery services</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              All processors are bound by Data Processing Agreements (DPAs) and are required to implement
              appropriate security measures.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">8. Security Measures</h2>
            <p className="text-muted-foreground">
              We implement appropriate technical and organizational measures to protect your personal data,
              including encryption in transit (TLS) and at rest, access controls, and regular security reviews.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">9. Right to Lodge a Complaint</h2>
            <p className="text-muted-foreground">
              If you believe your data protection rights have been violated, you have the right to lodge a
              complaint with your local supervisory authority. For EU residents, this is typically your
              national Data Protection Authority (DPA).
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-4">10. Contact</h2>
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground"><strong>Data Controller:</strong> Ryan Mahabir — Budget Smart AI</span>
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
