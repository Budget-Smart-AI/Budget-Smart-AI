# Data Retention Policy

**Company:** BudgetSmart  
**Owner:** Ryan Mahabir, CEO  
**Email:** ryan@mahabir.pro  
**Version:** 1.0  
**Effective Date:** March 7, 2026  
**Review Schedule:** Annual or upon regulatory change  

---

## 1. Purpose

This policy defines how long BudgetSmart retains different categories of data, how data is securely disposed of when no longer needed, and how users can request deletion of their personal information. It supports BudgetSmart's obligations under PIPEDA, applicable U.S. privacy laws, and SOC 2 Common Criteria.

---

## 2. Scope

This policy applies to all data processed, stored, or transmitted by BudgetSmart, including customer data, operational logs, and system data.

---

## 3. Retention Schedule

| Data Category | Retention Period | Justification | Deletion Method |
|--------------|-----------------|---------------|----------------|
| **Financial transactions** (Plaid, MX, manual) | **7 years** | Canadian tax and accounting record-keeping requirements | Flagged for legal hold; only deleted via verified user request after retention period |
| **Audit logs** | **2 years** | SOC 2 evidence requirements; PIPEDA accountability | Automated deletion via scheduled job |
| **Support tickets** | **3 years** | Customer dispute resolution; regulatory accountability | Automated deletion via scheduled job (closed tickets only) |
| **User sessions** | **30 days** (expired sessions) | Session security; minimal data retention | Automated deletion via scheduled job |
| **AI inference logs** | **90 days** | Debugging and quality assurance; minimal retention | Automated deletion via scheduled job |
| **Notifications** | **90 days** (read/dismissed) | Inbox hygiene; minimal data retention | Automated deletion via scheduled job |
| **Anomaly alerts** | **180 days** (closed/dismissed) | Operational monitoring history | Automated deletion via scheduled job |
| **User account data** | Duration of account + 30 days post-deletion | Service delivery; then deleted per request | Soft-delete then hard-delete after 30-day grace period |
| **Bank tokens / credentials** | Duration of active connection | Required for bank sync; revoked upon disconnection | Immediate deletion upon account disconnect |
| **Billing and payment records** | **7 years** | Financial record-keeping; Stripe compliance | Retained in Stripe per their policy; BudgetSmart internal records retained 7 years |
| **Security incident records** | **2 years** (minimum) | PIPEDA breach record-keeping; SOC 2 evidence | Manual review before deletion |
| **Marketing consent records** | Duration of consent + 2 years | CASL compliance (Canada) | Manual deletion |

> **Note:** The automated retention enforcement job (`runDataRetentionCleanup()`) runs on a scheduled basis and applies the retention periods above for: expired sessions (30d), AI logs (90d), read notifications (90d), dismissed anomaly alerts (180d), closed support tickets (3y), and audit logs (2y). Transaction records are **never** automatically deleted.

---

## 4. Secure Disposal

When data reaches the end of its retention period or is subject to a user deletion request:

### 4.1 Database Records
- Records are deleted using hard-delete database operations (`DELETE` statements) after any required soft-delete grace period.
- For user accounts: a soft-delete flag (`is_deleted = true`, `deleted_at = timestamp`) is set first. Hard deletion occurs 30 days after the soft-delete, unless a legal hold is in place.

### 4.2 File and Object Storage
- Files in object storage (e.g., Cloudflare R2) are deleted using the provider's secure delete API.
- Deletion is confirmed via the provider's deletion response.

### 4.3 Encrypted Data
- Encrypted data rendered inaccessible through key deletion is considered effectively deleted for regulatory purposes, provided the key material is securely destroyed.

### 4.4 Backups
- Backup data is subject to the same retention periods. NeonDB Point-in-Time Recovery (PITR) data is retained for the period configured in NeonDB (typically 7 days for PITR snapshots). Long-term backups follow the retention schedule above.

### 4.5 Third-Party Processors
- Deletion requests are forwarded to relevant third-party processors (Plaid, MX, Stripe, etc.) where applicable and technically feasible.

---

## 5. Data Deletion Request Process

Users have the right to request deletion of their personal information under PIPEDA and applicable law.

### 5.1 How to Submit a Request
Users may request data deletion by:
- Email: ryan@mahabir.pro with subject line "Data Deletion Request"
- In-app account deletion via Settings → Account → Delete Account

### 5.2 Processing Timeline
- Requests are acknowledged within **5 business days**.
- Deletion is completed within **30 days** of a verified request.
- Users are notified upon completion.

### 5.3 Scope of Deletion
- Account data: name, email, preferences, and associated personal information.
- Transaction data: deleted at user request, subject to any active legal hold.
- Connected bank accounts: tokens revoked and connection data deleted.

### 5.4 Exceptions
Data may be retained beyond a user's deletion request if:
- A legal hold is in effect (see Section 6).
- Retention is required to comply with applicable law or regulatory obligation.
- The data is necessary to resolve an open dispute or outstanding support ticket.

Users will be informed of any exceptions and the estimated retention period.

---

## 6. Legal Hold Procedures

A legal hold suspends normal data deletion schedules when data may be relevant to litigation, regulatory investigation, or law enforcement request.

### 6.1 Triggering a Legal Hold
Legal holds are triggered by:
- Receipt of a court order, subpoena, or formal legal process.
- Reasonable anticipation of litigation involving BudgetSmart.
- Regulatory investigation or audit request.

### 6.2 Implementing a Legal Hold
1. Ryan Mahabir is notified of the legal hold requirement.
2. Automated deletion jobs are paused for affected data categories.
3. Affected data is flagged in the database with a `legal_hold` marker.
4. A record of the legal hold — including scope, date, and justification — is maintained.

### 6.3 Lifting a Legal Hold
- Legal holds are lifted by Ryan Mahabir upon confirmation that the underlying legal matter is resolved.
- Affected data returns to the standard retention schedule upon lift.
- If the data has passed its normal retention period, it is deleted promptly after the hold is lifted.

---

## 7. Data Minimisation

BudgetSmart collects only the personal information necessary to provide its services. Unnecessary data is not collected or retained. Data collection practices are reviewed annually to identify and remove data elements that are no longer needed.

---

## 8. Policy Review

This policy is reviewed annually or upon any material change to BudgetSmart's data practices or regulatory environment. Ryan Mahabir is responsible for maintaining this policy.

---

*BudgetSmart — Hamilton, Ontario, Canada | budgetsmart.io*
