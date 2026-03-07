# Incident Response Plan

**Company:** BudgetSmart  
**Owner:** Ryan Mahabir, CEO  
**Email:** ryan@mahabir.pro  
**Version:** 1.0  
**Effective Date:** March 7, 2026  
**Review Schedule:** Annual or after any P1 or P2 incident  

---

## 1. Purpose

This plan defines how BudgetSmart detects, responds to, and recovers from security incidents. It ensures that incidents are handled consistently, customer impact is minimised, and legal obligations — including the 72-hour breach notification requirement under PIPEDA — are met.

---

## 2. Scope

This plan covers all incidents affecting BudgetSmart's systems, data, and services, including:
- Unauthorised access to customer data.
- Data breaches involving personal information or financial data.
- Service outages caused by security events.
- Malware, phishing, or credential compromise.
- Third-party vendor incidents affecting BudgetSmart customers.

---

## 3. Incident Severity Levels

| Level | Name | Description | Response Time |
|-------|------|-------------|--------------|
| **P1** | Critical | Active breach or confirmed unauthorised access to customer PII or financial data; service completely unavailable; data exfiltration suspected | Immediate — within 1 hour |
| **P2** | High | Suspected breach; partial data exposure; major service degradation; compromised admin credentials | Within 4 hours |
| **P3** | Medium | Attempted intrusion (blocked); minor data exposure limited to non-sensitive data; significant but not critical service issues | Within 24 hours |
| **P4** | Low | Security policy violation with no data exposure; informational security alerts; minor anomalies | Within 72 hours |

---

## 4. Incident Response Process

### Phase 1: Detection

**Trigger sources:**
- Automated monitoring alerts (Railway, NeonDB, Cloudflare WAF).
- Customer reports via support channels.
- Third-party vendor notifications.
- Internal discovery during routine operations.
- GitHub secret scanning alerts.

**Immediate actions:**
1. Log the incident with timestamp, description, and discovery source.
2. Assign a severity level (P1–P4) based on Section 3.
3. Notify Ryan Mahabir (ryan@mahabir.pro) immediately for P1/P2 incidents.

---

### Phase 2: Containment

**Goal:** Stop the spread; prevent further data exposure or system compromise.

**Actions:**
1. Isolate affected systems if possible (e.g., disable compromised Railway service, revoke API keys, suspend affected user accounts).
2. Revoke and rotate any exposed credentials, tokens, or API keys immediately.
3. Block malicious IPs via Cloudflare firewall rules if applicable.
4. Preserve system state before making changes — capture logs, screenshots, and relevant evidence (see Section 8).
5. Do not delete or overwrite potentially compromised data until evidence is preserved.
6. For NeonDB: restrict connection access to trusted IPs only.

---

### Phase 3: Eradication

**Goal:** Remove the root cause of the incident.

**Actions:**
1. Identify the attack vector or failure mode.
2. Apply security patches or configuration changes to close the vulnerability.
3. Remove any malicious code, unauthorised accounts, or rogue configurations.
4. Verify the environment is clean before proceeding to recovery.
5. Review all audit logs for the affected time period for lateral movement or additional exposure.

---

### Phase 4: Recovery

**Goal:** Restore normal service with confidence that the threat is removed.

**Actions:**
1. Restore from the last known good backup if data was corrupted or deleted (NeonDB PITR).
2. Re-enable services and verify functionality via smoke testing.
3. Monitor closely for 24–48 hours post-recovery for signs of recurrence.
4. Confirm all revoked credentials have been reissued to authorised users only.
5. Update Railway environment variables and 1Password vault with any new credentials.

---

### Phase 5: Post-Incident Review

**Goal:** Learn from the incident and prevent recurrence.

**Actions (within 7 days of incident closure):**
1. Conduct a post-incident review documenting:
   - Timeline of events.
   - Root cause analysis.
   - Actions taken at each phase.
   - Systems, data, and users affected.
   - Regulatory notifications made (if any).
2. Identify corrective actions and assign owners and due dates.
3. Update this plan and related policies as needed.
4. Retain the incident report for a minimum of **2 years** per the audit log retention policy.

---

## 5. PIPEDA Breach Notification Requirements

Under Canada's Personal Information Protection and Electronic Documents Act (PIPEDA) and the Breach of Security Safeguards Regulations:

### 5.1 Notification Triggers
A breach notification is required when there is a breach of security safeguards involving personal information that **creates a real risk of significant harm** to an individual.

### 5.2 Regulator Notification — 72 Hours
- BudgetSmart must notify the **Office of the Privacy Commissioner of Canada (OPC)** as soon as feasible after determining a reportable breach has occurred.
- Target: within **72 hours** of confirming the breach meets the reportable threshold.
- Notification must include: nature of the breach, personal information involved, number of affected individuals (estimated), steps taken to contain it, and steps taken to reduce risk to individuals.

### 5.3 Individual Notification
- Affected individuals must be notified directly and promptly.
- Notification must be in plain language, provide context for the breach, and explain what individuals can do to protect themselves.
- Notification may be direct (email) or indirect (public notice) if direct contact is not reasonably possible.

### 5.4 Record Retention
All breaches (even those below the reportable threshold) must be recorded. Records must be retained for a minimum of **24 months** and made available to the OPC upon request.

---

## 6. User Notification Procedure

When a data breach affects BudgetSmart customers, the following procedure applies:

1. **Assess scope:** Identify which user accounts and data types were affected.
2. **Draft notification:** Use the breach notification email template in Section 7. Have it reviewed before sending.
3. **Notify affected users** via the email address registered to their BudgetSmart account.
4. **Post a status update** to BudgetSmart's status page or send an in-app notification if available.
5. **Provide a support channel:** Direct affected users to contact ryan@mahabir.pro for questions.
6. **Log all notifications** with timestamps for regulatory records.

---

## 7. Breach Notification Email Template

```
Subject: Important Security Notice — Your BudgetSmart Account

Dear [First Name],

We are writing to inform you of a security incident that may have affected your BudgetSmart account.

What happened:
[Brief description of the incident — what data was involved and how it occurred]

What data was affected:
[List specific data types — e.g., email address, transaction data. Be specific.]

What we have done:
- [Action taken to contain the incident]
- [Action taken to secure systems]
- [Any patches or fixes applied]

What you should do:
- Change your BudgetSmart password immediately at app.budgetsmart.io/settings
- Enable two-factor authentication if not already active
- Monitor your linked bank accounts for unusual activity
- Be cautious of phishing emails that may exploit this situation

We take your privacy and security seriously. We sincerely apologise for this incident.

If you have any questions, please contact us at ryan@mahabir.pro.

Sincerely,
Ryan Mahabir
CEO, BudgetSmart
ryan@mahabir.pro
budgetsmart.io
Hamilton, Ontario, Canada
```

---

## 8. Evidence Preservation

To preserve evidence for forensic investigation and regulatory compliance:

1. **Do not** delete, alter, or overwrite logs or files in the affected system.
2. Export and securely store:
   - Relevant database audit logs.
   - Application server logs from Railway.
   - Cloudflare WAF and access logs.
   - NeonDB query logs for the affected period.
3. Document all containment actions taken and the sequence of events.
4. Retain evidence for a minimum of **2 years** or as required by applicable law.
5. If legal action is anticipated, initiate a legal hold (see [Data Retention Policy](./data-retention-policy.md), Section 6).

---

## 9. Key Contacts

| Role | Name | Contact |
|------|------|---------|
| Incident Commander | Ryan Mahabir | ryan@mahabir.pro |
| Office of the Privacy Commissioner (Canada) | OPC | www.priv.gc.ca |
| Legal Counsel | TBD | TBD |

---

## 10. Testing and Maintenance

- This plan is reviewed annually or after any P1 or P2 incident.
- A tabletop exercise simulating a P1 or P2 incident should be conducted annually.
- Ryan Mahabir is responsible for maintaining this plan and ensuring it reflects current systems.

---

*BudgetSmart — Hamilton, Ontario, Canada | budgetsmart.io*
