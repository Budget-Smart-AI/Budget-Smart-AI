# Information Security Policy

**Company:** BudgetSmart  
**Owner:** Ryan Mahabir, CEO  
**Email:** ryan@mahabir.pro  
**Version:** 1.1  
**Effective Date:** March 7, 2026  
**Last Updated:** March 9, 2026  
**Review Schedule:** Annual or upon material change  

> **SOC 2 Status:** SOC 2 Type I certification is in progress via Comp AI. Audit scheduled June/July 2026. Expected certified: August 2026.

---

## 1. Purpose

This Information Security Policy establishes the principles, requirements, and responsibilities for protecting the confidentiality, integrity, and availability of BudgetSmart's information assets and customer data. It supports BudgetSmart's commitment to SOC 2 compliance and applicable privacy regulations including PIPEDA (Canada) and applicable U.S. state privacy laws.

---

## 2. Scope

This policy applies to:

- All BudgetSmart systems, applications, and infrastructure (production and non-production).
- All personnel with access to BudgetSmart systems, including employees, contractors, and third-party service providers.
- All data processed, stored, or transmitted by BudgetSmart, including customer financial data, personally identifiable information (PII), and internal operational data.
- Systems hosted in Canada and the United States.

---

## 3. Data Classification

BudgetSmart classifies all data into four tiers:

| Tier | Label | Description | Examples |
|------|-------|-------------|---------|
| 1 | **Critical** | Highest sensitivity; exposure causes severe regulatory, legal, or financial harm | Bank access tokens, encryption keys, user credentials, raw financial account data |
| 2 | **Confidential** | Sensitive business or personal data; access restricted to authorised personnel | PII (name, email, address), transaction data, support tickets, audit logs |
| 3 | **Internal** | Business data not intended for public disclosure | Internal documentation, system architecture, vendor contracts |
| 4 | **Public** | Information approved for public release | Marketing content, public privacy policy, terms of service |

All data must be handled in accordance with its classification tier. Critical and Confidential data require encryption at rest and in transit.

---

## 4. Access Control Requirements

4.1 Access to BudgetSmart systems and data shall be granted on the principle of **least privilege** — personnel receive only the minimum access required to perform their job functions.

4.2 Access must be formally requested and approved by the system owner (currently Ryan Mahabir as sole administrator).

4.3 Access must be reviewed and revoked promptly upon role change, contract termination, or when no longer required.

4.4 **Multi-factor authentication (MFA)** is required for all administrative and production access. See the [Access Control Policy](./access-control-policy.md) for full requirements.

4.5 Shared credentials are prohibited. Each user must have a unique account identifier.

4.6 All access events to Tier 1 and Tier 2 data are logged in the BudgetSmart audit log.

---

## 5. Encryption Requirements

### 5.1 Data at Rest
- All Tier 1 (Critical) and Tier 2 (Confidential) data stored in databases or object storage must be encrypted using **AES-256-GCM**.
- BudgetSmart implements field-level encryption for sensitive database columns (e.g., bank tokens) using a `FIELD_ENCRYPTION_KEY` stored as a secure environment variable, not hardcoded in source code.
- Database backups are encrypted using the database provider's encryption mechanisms (NeonDB encryption at rest).

### 5.2 Data in Transit
- All data transmitted over public networks must use **TLS 1.2 or higher**.
- HTTP connections are redirected to HTTPS. HTTP Strict Transport Security (HSTS) is enforced via Cloudflare.
- Internal service-to-service communication uses encrypted connections where technically feasible.

### 5.3 Key Management
- Encryption keys are stored as environment variables in Railway (production) and 1Password (backup).
- Key rotation is performed annually or upon suspected compromise.
- Encryption keys must never be committed to source code or version control.

---

## 6. Incident Response Overview

BudgetSmart maintains a formal [Incident Response Plan](./incident-response-plan.md). Summary:

- Security incidents are classified into four severity levels (P1–P4).
- The incident response lifecycle includes: Detection → Containment → Eradication → Recovery → Post-Incident Review.
- Data breaches affecting personal information must be reported to affected individuals and, where required, to regulators within **72 hours** under PIPEDA.
- All incidents must be documented and retained for audit purposes.
- The responsible contact for security incidents is Ryan Mahabir (ryan@mahabir.pro).

---

## 7. Acceptable Use

7.1 BudgetSmart systems and data may only be used for legitimate business purposes.

7.2 Personnel must not:
- Access, copy, or transmit customer data outside of authorised workflows.
- Use personal devices to store unencrypted Tier 1 or Tier 2 data.
- Share credentials or authentication tokens.
- Attempt to bypass security controls or access systems beyond their authorised scope.
- Install unauthorised software or services on production systems.

7.3 BudgetSmart infrastructure (Railway, NeonDB, GitHub, Cloudflare, etc.) must be accessed using authorised accounts with MFA enabled.

---

## 8. Security Awareness

- All personnel with access to production systems must acknowledge this policy prior to gaining access.
- Security awareness training is conducted at onboarding and reviewed annually.
- Personnel are expected to report suspected security incidents, phishing attempts, or policy violations to ryan@mahabir.pro immediately.

---

## 9. Vulnerability Management

- Application dependencies are monitored for known vulnerabilities using automated scanning tools:
  - **GitHub Dependabot** — alerts and automatic security update PRs for vulnerable dependencies.
  - **Snyk** — continuous vulnerability scanning integrated with the GitHub repository via GitHub OAuth; scans for vulnerabilities in dependencies, code, and container configurations.
  - **GitHub CodeQL** — code scanning workflow that analyses source code for security vulnerabilities and coding errors on every pull request and push to `main`.
- **GitHub secret scanning and push protection** are enabled — GitHub blocks commits containing secrets before they are pushed to the repository and alerts on any detected credentials.
- Critical and high-severity vulnerabilities in production systems must be remediated within **7 days** of identification.
- Medium-severity vulnerabilities must be remediated within **30 days**.
- Security patches for operating systems and infrastructure are applied through provider-managed channels (Railway, NeonDB, Cloudflare).

---

## 10. Violations

Violation of this policy may result in:
- Immediate suspension of system access.
- Escalation to legal counsel.
- Notification of regulators where required by law.
- Termination of employment or contract.

Suspected violations should be reported to ryan@mahabir.pro.

---

## 11. Policy Review

This policy is reviewed:
- Annually, or
- Upon a material change to BudgetSmart's systems, data practices, or regulatory environment.

Ryan Mahabir is responsible for maintaining and approving this policy.

---

*BudgetSmart — Hamilton, Ontario, Canada | budgetsmart.io*
