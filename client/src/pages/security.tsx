import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Shield, Lock, Database, Server, Globe, Key, Fingerprint, Bug, Search, FileCheck } from "lucide-react";

export default function SecurityCompliance() {
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
            <Lock className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">Security & Compliance</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-6 h-6 text-primary" />
              Security & Compliance
            </CardTitle>
            <p className="text-lg font-medium text-muted-foreground">Budget Smart AI</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Last Updated: January 2026</p>
              <p>Owner: Ryan Mahabir</p>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-muted-foreground text-base">
              Budget Smart AI is designed from the ground up to protect your financial data with bank-grade security,
              regulatory-grade controls, and enterprise-level infrastructure. We follow a zero-trust, least-privilege,
              encrypted-by-default security architecture.
            </p>
            <p className="text-muted-foreground">
              This document explains how we safeguard your information.
            </p>

            {/* Section 1: Financial Data Security */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              1. Financial Data Security (Plaid Integration)
            </h2>
            <p className="text-muted-foreground font-medium">
              Budget Smart AI does not store or handle your online banking credentials.
            </p>
            <p className="text-muted-foreground">
              All financial data is accessed through <strong>Plaid</strong>, the world's leading financial connectivity platform
              used by companies such as Venmo, Robinhood, Coinbase, SoFi, and American Express.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">Plaid Security Standards</h3>
            <p className="text-muted-foreground">Plaid is:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>SOC 2 Type II compliant</li>
              <li>ISO 27001 aligned</li>
              <li>GDPR & CCPA compliant</li>
              <li>Audited annually by independent third-party firms</li>
            </ul>

            <p className="text-muted-foreground mt-4">Plaid uses:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>TLS 1.2+ encryption for all data in transit</li>
              <li>AES-256 encryption for all data at rest</li>
              <li>Tokenized credentials, meaning your bank login is never shared with Budget Smart AI</li>
            </ul>

            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mt-4">
              <p className="text-muted-foreground mb-2">
                Budget Smart AI receives only <strong>permission-based access tokens</strong> from Plaid.
                These tokens allow read-only access to balances and transactions — not account control.
              </p>
              <p className="text-muted-foreground font-medium">
                Your bank login information is never visible, stored, or accessible to Budget Smart AI.
              </p>
            </div>

            {/* Section 2: Application & Database Security */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              2. Application & Database Security
            </h2>
            <p className="text-muted-foreground">
              All customer data inside Budget Smart AI is protected by multiple layers of encryption and isolation.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">Encryption at Rest</h3>
            <p className="text-muted-foreground">All data stored in our systems is encrypted using:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>AES-256 server-side encryption</li>
              <li>Hardware-backed key management</li>
              <li>Automated key rotation</li>
            </ul>
            <p className="text-muted-foreground mt-2">This protects:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>User profiles</li>
              <li>Financial records</li>
              <li>AI-generated insights</li>
              <li>Application logs</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">Encryption in Transit</h3>
            <p className="text-muted-foreground">All connections between your browser, our application, and our databases are protected using:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>TLS 1.2+ / TLS 1.3</li>
              <li>Forward secrecy</li>
              <li>Certificate-based authentication</li>
            </ul>
            <p className="text-muted-foreground mt-2">This prevents man-in-the-middle attacks and data interception.</p>

            {/* Section 3: Secrets & Credential Protection */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              3. Secrets & Credential Protection
            </h2>
            <p className="text-muted-foreground">
              Budget Smart AI never stores passwords, API keys, or credentials in application code.
            </p>
            <p className="text-muted-foreground mt-2">All secrets are stored in a dedicated encrypted Secrets Vault:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>AES-256 encryption</li>
              <li>Restricted access by environment</li>
              <li>Automatic rotation support</li>
              <li>Audit logging</li>
            </ul>
            <p className="text-muted-foreground mt-2">This protects:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Database credentials</li>
              <li>Plaid API tokens</li>
              <li>Payment processor keys</li>
              <li>Internal service credentials</li>
            </ul>
            <p className="text-muted-foreground mt-2 font-medium">
              Even developers cannot view raw secrets without explicit authorization.
            </p>

            {/* Section 4: Infrastructure Security */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
              4. Infrastructure Security
            </h2>
            <p className="text-muted-foreground">Budget Smart AI runs on enterprise-grade cloud infrastructure with:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>SOC 2 compliant hosting</li>
              <li>24/7 monitoring</li>
              <li>Automated patching</li>
              <li>DDoS protection</li>
              <li>Hardware-isolated virtual machines</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              Our databases are powered by <strong>PostgreSQL 16</strong> on hardened cloud infrastructure, offering:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Encryption at rest</li>
              <li>Encrypted replication</li>
              <li>Point-in-time recovery</li>
              <li>Automated backups</li>
              <li>Access control lists</li>
              <li>Role-based permissions</li>
            </ul>

            {/* Section 5: Network Security */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              5. Network Security & Isolation
            </h2>
            <p className="text-muted-foreground">
              All data processing occurs inside a private, segmented cloud network protected by:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Web Application Firewalls (WAF)</li>
              <li>Load balancers</li>
              <li>IP filtering</li>
              <li>Intrusion detection systems</li>
              <li>Rate-limiting</li>
            </ul>
            <p className="text-muted-foreground mt-2 font-medium">
              No database or internal service is directly exposed to the public internet.
            </p>

            {/* Section 6: Secure Connection Management */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              6. Secure Connection Management
            </h2>
            <p className="text-muted-foreground">
              Budget Smart AI uses scoped database connections via secure DATABASE_URL credentials that:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Are valid only for Budget Smart AI</li>
              <li>Cannot be reused by outside systems</li>
              <li>Are isolated by environment (production, staging, testing)</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Our production environment uses <strong>isolated production databases</strong> that are fully separated
              from development systems to prevent cross-access or data leakage.
            </p>

            {/* Section 7: MFA */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Fingerprint className="w-5 h-5 text-primary" />
              7. Multi-Factor Authentication (MFA)
            </h2>
            <p className="text-muted-foreground">Budget Smart AI enforces strong identity security.</p>

            <h3 className="text-lg font-medium mt-6 mb-3">Email-based Accounts</h3>
            <p className="text-muted-foreground">All users who sign up with email are required to:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Verify their email address</li>
              <li>Enable Two-Factor Authentication (2FA)</li>
            </ul>
            <p className="text-muted-foreground mt-2">This ensures:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Password theft cannot compromise accounts</li>
              <li>Login attempts require both something you know (password) and something you have (OTP or device)</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">Google Sign-In</h3>
            <p className="text-muted-foreground">Users who log in with Google automatically benefit from:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Google's built-in 2FA</li>
              <li>Google's anti-phishing and account risk detection</li>
              <li>Device trust validation</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              This ensures enterprise-grade identity security without added friction.
            </p>

            {/* Section 8: Malicious Code Detection */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Bug className="w-5 h-5 text-primary" />
              8. Malicious Code & Threat Detection
            </h2>
            <p className="text-muted-foreground">
              Budget Smart AI operates in an environment protected by real-time malware detection.
            </p>
            <p className="text-muted-foreground mt-2">This includes:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Automatic scanning of uploaded files</li>
              <li>Detection of known malware families</li>
              <li>Behavioral anomaly monitoring</li>
              <li>Automated threat containment</li>
            </ul>
            <p className="text-muted-foreground mt-2">If a malicious file or exploit is detected, it can be:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Quarantined</li>
              <li>Removed</li>
              <li>Blocked</li>
              <li>Automatically remediated</li>
            </ul>
            <p className="text-muted-foreground mt-2">This protects both users and platform infrastructure.</p>

            {/* Section 9: Secret & Prompt Protection */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-primary" />
              9. Secret & Prompt Protection
            </h2>
            <p className="text-muted-foreground">Budget Smart AI uses an advanced Secret Scanner that detects:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>API keys</li>
              <li>Passwords</li>
              <li>Private keys</li>
              <li>Database credentials</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              If a user or developer attempts to paste sensitive data into source code, prompts, or files, the system automatically:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Detects the secret</li>
              <li>Blocks exposure</li>
              <li>Prompts secure storage in the encrypted Secrets Vault</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              This prevents accidental leaks through logs, AI prompts, or version control.
            </p>

            {/* Section 10: Compliance & Governance */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-primary" />
              10. Compliance & Governance
            </h2>
            <p className="text-muted-foreground">Budget Smart AI follows:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>SOC 2-aligned security architecture</li>
              <li>GDPR & CCPA privacy principles</li>
              <li>Least-privilege access control</li>
              <li>Zero-trust network design</li>
            </ul>
            <p className="text-muted-foreground mt-2 font-medium">
              We only collect data required to provide financial insights and never sell or monetize personal financial information.
            </p>

            {/* Security Philosophy */}
            <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Security Philosophy
            </h2>
            <p className="text-muted-foreground">
              Budget Smart AI was built with the same principles used by modern fintech platforms:
            </p>
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mt-4">
              <p className="text-muted-foreground font-medium text-center italic">
                "Your financial data is more sensitive than money — and we treat it that way."
              </p>
            </div>
            <p className="text-muted-foreground mt-4">Everything is:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Encrypted</li>
              <li>Isolated</li>
              <li>Logged</li>
              <li>Monitored</li>
              <li>Verified</li>
            </ul>

            {/* Contact */}
            <div className="mt-12 pt-8 border-t">
              <h2 className="text-lg font-semibold mb-4">Questions about our security?</h2>
              <p className="text-muted-foreground">
                If you have any questions about our security practices, please contact us at{" "}
                <a href="mailto:security@budgetsmart.ai" className="text-primary hover:underline">
                  security@budgetsmart.ai
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
