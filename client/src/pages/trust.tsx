import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Shield, Lock, Database, Server, Globe, Key, Fingerprint, Bug, Search, FileCheck, Building2, Mail } from "lucide-react";

export default function TrustCenter() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-muted/30 py-4">
        <div className="container mx-auto px-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">Trust Center</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-2xl">
              <Shield className="w-7 h-7 text-primary" />
              Budget Smart AI – Trust Center
            </CardTitle>
            <p className="text-xl font-medium text-muted-foreground mt-4">
              Your Financial Data. Secured Like a Bank.
            </p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-muted-foreground text-base">
              Budget Smart AI is a financial technology platform built to help people understand, optimize, and automate their money.
              Because we handle highly sensitive financial information, we operate under the same security principles used by banks,
              fintechs, and payment networks.
            </p>
            <p className="text-muted-foreground">
              This Trust Center explains how your data is protected, how access is controlled, and how compliance is enforced.
            </p>

            {/* Security First Architecture */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              Security First Architecture
            </h2>
            <p className="text-muted-foreground">
              Budget Smart AI is built on a <strong>zero-trust, encrypted-by-default infrastructure</strong>.
              Every request, every data transfer, and every action is verified, logged, and protected.
            </p>
            <p className="text-muted-foreground mt-2">We implement:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>End-to-end encryption</li>
              <li>Role-based access controls</li>
              <li>Continuous monitoring</li>
              <li>Network isolation</li>
              <li>Threat detection</li>
              <li>Regular security audits</li>
            </ul>
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mt-4">
              <p className="text-muted-foreground font-medium text-center">
                Security is not a feature — it is our foundation.
              </p>
            </div>

            {/* Bank Data Protection */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Bank Data Protection (Plaid)
            </h2>
            <p className="text-muted-foreground font-medium">
              Budget Smart AI never receives or stores your online banking username or password.
            </p>
            <p className="text-muted-foreground mt-2">
              We connect to your financial institutions through <strong>Plaid</strong>, the industry-standard platform trusted by companies such as:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Venmo</li>
              <li>Coinbase</li>
              <li>Robinhood</li>
              <li>SoFi</li>
              <li>American Express</li>
            </ul>
            <p className="text-muted-foreground mt-4">Plaid provides:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>SOC 2 Type II compliance</li>
              <li>AES-256 encryption</li>
              <li>TLS-encrypted data transfers</li>
              <li>Tokenized credentials</li>
            </ul>
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mt-4 space-y-2">
              <p className="text-muted-foreground">
                <strong>Your bank login stays with your bank and Plaid.</strong>
              </p>
              <p className="text-muted-foreground">
                Budget Smart AI only receives permission-based, read-only tokens that allow us to retrieve balances and transactions.
              </p>
              <p className="text-muted-foreground font-medium">
                We cannot move money, initiate transfers, or access accounts without your explicit authorization.
              </p>
            </div>

            {/* Data Encryption */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              Data Encryption
            </h2>

            <h3 className="text-lg font-medium mt-6 mb-3">Encryption in Transit</h3>
            <p className="text-muted-foreground">All data is protected with:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>TLS 1.2+ / TLS 1.3 encryption</li>
              <li>Secure certificates</li>
              <li>Forward secrecy</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              This prevents data from being intercepted while traveling across the internet.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">Encryption at Rest</h3>
            <p className="text-muted-foreground">All stored data is protected using:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>AES-256 encryption</li>
              <li>Hardware-secured encryption keys</li>
              <li>Automatic key rotation</li>
            </ul>
            <p className="text-muted-foreground mt-2">This applies to:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Account data</li>
              <li>Transaction history</li>
              <li>AI insights</li>
              <li>Internal system logs</li>
            </ul>
            <p className="text-muted-foreground mt-2 font-medium">
              Even if storage were compromised, the data would be unreadable.
            </p>

            {/* Infrastructure Security */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
              Infrastructure Security
            </h2>
            <p className="text-muted-foreground">
              Budget Smart AI operates on enterprise-grade cloud infrastructure designed for financial applications.
            </p>
            <p className="text-muted-foreground mt-2">We use:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Encrypted virtual machines</li>
              <li>Hardened databases</li>
              <li>Redundant storage</li>
              <li>Automatic backups</li>
              <li>Disaster recovery systems</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              Our databases run on <strong>PostgreSQL 16</strong> in isolated production environments with:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Encrypted storage</li>
              <li>Secure replication</li>
              <li>Access control lists</li>
              <li>Audit logging</li>
            </ul>
            <p className="text-muted-foreground mt-2 font-medium">
              Development systems are physically separated from production systems to prevent data leakage.
            </p>

            {/* Network Protection */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              Network Protection
            </h2>
            <p className="text-muted-foreground">Our platform is protected by:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Web Application Firewalls (WAF)</li>
              <li>DDoS protection</li>
              <li>Rate limiting</li>
              <li>Traffic filtering</li>
              <li>Intrusion detection systems</li>
            </ul>
            <p className="text-muted-foreground mt-2 font-medium">
              Internal services and databases are not accessible from the public internet.
            </p>

            {/* Identity & Account Protection */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              Identity & Account Protection
            </h2>

            <h3 className="text-lg font-medium mt-6 mb-3">Two-Factor Authentication (2FA)</h3>
            <p className="text-muted-foreground">
              All users who sign up with email are <strong>required to enable 2FA</strong>, protecting accounts even if a password is compromised.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">Google Sign-In</h3>
            <p className="text-muted-foreground">Users who sign in with Google benefit from:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Google's built-in 2FA</li>
              <li>Device trust checks</li>
              <li>Suspicious login detection</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              This ensures every login meets bank-grade security standards.
            </p>

            {/* Malware & Threat Detection */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Bug className="w-5 h-5 text-primary" />
              Malware & Threat Detection
            </h2>
            <p className="text-muted-foreground">Our platform continuously scans for:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Malicious files</li>
              <li>Malware</li>
              <li>Exploit patterns</li>
              <li>Unauthorized code</li>
            </ul>
            <p className="text-muted-foreground mt-2">Threats are automatically:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Detected</li>
              <li>Blocked</li>
              <li>Quarantined</li>
              <li>Removed</li>
            </ul>
            <p className="text-muted-foreground mt-2">This protects both users and infrastructure.</p>

            {/* Secret & Credential Protection */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-primary" />
              Secret & Credential Protection
            </h2>
            <p className="text-muted-foreground">
              We use an automated <strong>Secret Detection System</strong> that prevents sensitive data such as:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>API keys</li>
              <li>Passwords</li>
              <li>Private keys</li>
              <li>Database credentials</li>
            </ul>
            <p className="text-muted-foreground mt-2">from being accidentally exposed in:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Code</li>
              <li>Files</li>
              <li>AI prompts</li>
              <li>Logs</li>
            </ul>
            <p className="text-muted-foreground mt-2 font-medium">
              If a secret is detected, it is immediately secured and encrypted.
            </p>

            {/* Compliance & Privacy */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-primary" />
              Compliance & Privacy
            </h2>
            <p className="text-muted-foreground">Budget Smart AI follows:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>SOC 2-aligned security controls</li>
              <li>GDPR privacy principles</li>
              <li>CCPA consumer protections</li>
              <li>Least-privilege access policies</li>
              <li>Data minimization standards</li>
            </ul>
            <p className="text-muted-foreground mt-2 font-medium">
              We never sell or monetize your financial data.
            </p>

            {/* Our Promise */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Our Promise
            </h2>
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 mt-4">
              <p className="text-muted-foreground font-medium text-center text-lg italic">
                "Your trust is more valuable than your data."
              </p>
            </div>
            <p className="text-muted-foreground mt-4">
              Budget Smart AI was built to be as secure as a modern financial institution.
              Every decision we make prioritizes privacy, encryption, and safety.
            </p>

            {/* Contact */}
            <div className="mt-12 pt-8 border-t">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary" />
                Contact
              </h2>
              <p className="text-muted-foreground">
                Security or privacy questions?
              </p>
              <p className="mt-2">
                <a href="mailto:support@budgetsmart.io" className="text-primary hover:underline font-medium">
                  support@budgetsmart.io
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
