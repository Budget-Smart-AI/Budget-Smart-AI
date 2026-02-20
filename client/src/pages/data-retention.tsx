import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Database } from "lucide-react";

export default function DataRetention() {
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
            <Database className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">Data Retention Policy</h1>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Data Retention and Deletion Policy</CardTitle>
            <p className="text-sm text-muted-foreground">Last updated: January 2026</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <h2>1. Overview</h2>
            <p>
              Budget Smart AI maintains a comprehensive data retention and deletion policy in compliance with applicable data privacy laws, including the Canadian Personal Information Protection and Electronic Documents Act (PIPEDA) and the General Data Protection Regulation (GDPR) for European users.
            </p>

            <h2>2. Data Categories and Retention Periods</h2>
            
            <h3>2.1 Account Information</h3>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left p-2 border-b">Data Type</th>
                  <th className="text-left p-2 border-b">Retention Period</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2 border-b">Username and credentials</td>
                  <td className="p-2 border-b">Duration of account + 30 days</td>
                </tr>
                <tr>
                  <td className="p-2 border-b">Email address</td>
                  <td className="p-2 border-b">Duration of account + 30 days</td>
                </tr>
                <tr>
                  <td className="p-2 border-b">MFA configuration</td>
                  <td className="p-2 border-b">Until disabled or account deletion</td>
                </tr>
              </tbody>
            </table>

            <h3>2.2 Financial Data</h3>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left p-2 border-b">Data Type</th>
                  <th className="text-left p-2 border-b">Retention Period</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2 border-b">Bill records</td>
                  <td className="p-2 border-b">Duration of account + 30 days</td>
                </tr>
                <tr>
                  <td className="p-2 border-b">Expense records</td>
                  <td className="p-2 border-b">Duration of account + 30 days</td>
                </tr>
                <tr>
                  <td className="p-2 border-b">Bank connection tokens (Plaid)</td>
                  <td className="p-2 border-b">Until disconnected by user</td>
                </tr>
                <tr>
                  <td className="p-2 border-b">Transaction history (from Plaid)</td>
                  <td className="p-2 border-b">90 days rolling window</td>
                </tr>
                <tr>
                  <td className="p-2 border-b">Account balances (from Plaid)</td>
                  <td className="p-2 border-b">Real-time only, not stored</td>
                </tr>
              </tbody>
            </table>

            <h3>2.3 Technical Data</h3>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left p-2 border-b">Data Type</th>
                  <th className="text-left p-2 border-b">Retention Period</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2 border-b">Session data</td>
                  <td className="p-2 border-b">24 hours from last activity</td>
                </tr>
                <tr>
                  <td className="p-2 border-b">Access logs</td>
                  <td className="p-2 border-b">90 days</td>
                </tr>
                <tr>
                  <td className="p-2 border-b">Error logs</td>
                  <td className="p-2 border-b">30 days</td>
                </tr>
              </tbody>
            </table>

            <h2>3. Data Deletion Procedures</h2>
            
            <h3>3.1 User-Initiated Deletion</h3>
            <p>Users can request deletion of their data through:</p>
            <ul>
              <li>Account settings (when available)</li>
              <li>Email request to <a href="mailto:support@budgetsmart.io" className="text-primary hover:underline">support@budgetsmart.io</a></li>
              <li>Contact form on our website</li>
            </ul>

            <h3>3.2 Deletion Timeline</h3>
            <ul>
              <li><strong>Acknowledgment:</strong> Within 24 hours of receiving request</li>
              <li><strong>Data Removal:</strong> Within 30 days of verified request</li>
              <li><strong>Backup Purge:</strong> Within 90 days of initial deletion</li>
            </ul>

            <h3>3.3 What Gets Deleted</h3>
            <p>Upon account deletion, we permanently remove:</p>
            <ul>
              <li>All personal identification information</li>
              <li>All financial records (bills, expenses)</li>
              <li>Bank connection tokens and cached data</li>
              <li>MFA secrets and authentication data</li>
              <li>Email reminder preferences</li>
            </ul>

            <h3>3.4 What May Be Retained</h3>
            <p>Certain data may be retained for legal compliance:</p>
            <ul>
              <li>Anonymized usage statistics (no personal identifiers)</li>
              <li>Legal hold data (if subject to ongoing legal proceedings)</li>
              <li>Records required by financial regulations</li>
            </ul>

            <h2>4. Data Portability</h2>
            <p>
              Users may request an export of their data in machine-readable format (JSON) at any time. Export requests are fulfilled within 7 business days.
            </p>

            <h2>5. Third-Party Data Handling</h2>
            
            <h3>5.1 Plaid</h3>
            <p>
              When you disconnect your bank account, we immediately revoke Plaid access tokens. Plaid retains data according to their own retention policy. You can request Plaid delete your data directly through their portal.
            </p>

            <h3>5.2 Email Service (Postmark)</h3>
            <p>
              Email addresses used for bill reminders are transmitted to our email provider. These are not stored by the provider beyond delivery confirmation (maximum 45 days).
            </p>

            <h2>6. Data Security During Retention</h2>
            <p>While data is retained, we ensure:</p>
            <ul>
              <li>AES-256 encryption for data at rest</li>
              <li>TLS 1.3 encryption for data in transit</li>
              <li>Regular security audits and vulnerability assessments</li>
              <li>Access controls limiting who can view user data</li>
              <li>Audit trails for all data access</li>
            </ul>

            <h2>7. Compliance</h2>
            <p>This policy complies with:</p>
            <ul>
              <li><strong>PIPEDA:</strong> Canadian Personal Information Protection and Electronic Documents Act</li>
              <li><strong>GDPR:</strong> General Data Protection Regulation (for EU users)</li>
              <li><strong>CCPA:</strong> California Consumer Privacy Act (for California residents)</li>
            </ul>

            <h2>8. Policy Updates</h2>
            <p>
              We review and update this policy annually or when significant changes occur. Users will be notified of material changes via email.
            </p>

            <h2>9. Contact</h2>
            <p>
              For questions about data retention or to request data deletion, contact our Data Protection Officer at{" "}
              <a href="mailto:support@budgetsmart.io" className="text-primary hover:underline">
                support@budgetsmart.io
              </a>.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
