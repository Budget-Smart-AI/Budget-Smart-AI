# Risk Register

**Company:** BudgetSmart  
**Owner:** Ryan Mahabir, CEO  
**Email:** ryan@mahabir.pro  
**Version:** 1.0  
**Effective Date:** March 7, 2026  
**Review Schedule:** Quarterly or upon identification of new material risk  

---

## 1. Purpose

This Risk Register documents identified risks to BudgetSmart's operations, security, and compliance. For each risk, it records the likelihood, impact, risk score, current mitigation status, and any open remediation items.

**Risk Score = Likelihood × Impact** (using the scale: Low=1, Medium=2, High=3)

---

## 2. Risk Register

| Risk | Category | Likelihood | Impact | Risk Score | Mitigation | Status |
|------|----------|-----------|--------|-----------|------------|--------|
| **Data breach via compromised credentials** | Security | High (3) | High (3) | 9 | MFA required on all production systems; password manager enforced; audit logging active; rate limiting on auth endpoints; credentials never stored in source code | ✅ Mitigated |
| **Bank token exposure** | Security | Medium (2) | High (3) | 6 | Plaid and MX access tokens encrypted at rest using AES-256-GCM field-level encryption; encryption key stored as Railway environment variable, not in code; tokens never logged or exposed via API | ✅ Mitigated via encryption |
| **MX production key denial / revocation** | Availability | Medium (2) | Medium (2) | 4 | Dual bank data provider architecture (Plaid + MX); if MX key is revoked or unavailable, Plaid serves as fallback; affected users notified to reconnect via available provider | ✅ Mitigated via Plaid fallback |
| **Deepseek data handling — China-based provider** | Compliance / Security | Medium (2) | High (3) | 6 | Deepseek used only for chat fallback; no PII or financial account data sent; prompts are limited to non-sensitive interactions; use is disclosed in vendor register; replacement vendor evaluation planned | ⚠️ Open — mitigation planned (Q3 2026) |
| **Solo founder key person dependency** | Operational | High (3) | High (3) | 9 | All credentials documented in 1Password; codebase in GitHub (documented and recoverable); designated emergency access plan to be implemented; successor access plan under development | ⚠️ Partially mitigated — emergency access plan pending |
| **Railway application outage** | Availability | Medium (2) | High (3) | 6 | Railway instant rollback available for deployment failures; NeonDB PITR available for database recovery; RTO target 4 hours; RPO target 1 hour; backup env vars in 1Password | ✅ Mitigated via NeonDB PITR and Railway rollback |
| **Regulatory non-compliance — PIPEDA** | Compliance | Medium (2) | High (3) | 6 | Privacy Policy published; data retention automation implemented; breach notification procedure documented in Incident Response Plan; SOC 2 audit in progress (Comp AI, June/July 2026) | ⚠️ In Progress — SOC 2 Type I scheduled August 2026 |
| **SQL injection / application vulnerability** | Security | Low (1) | High (3) | 3 | Drizzle ORM used exclusively (parameterised queries); no raw SQL with user input; CodeQL scanning enabled on GitHub repository | ✅ Mitigated |
| **Stripe payment data breach** | Security | Low (1) | High (3) | 3 | Payment card data handled entirely by Stripe (PCI DSS Level 1); BudgetSmart does not store card numbers; only Stripe customer/subscription IDs stored | ✅ Mitigated |
| **NeonDB data loss** | Availability | Low (1) | High (3) | 3 | NeonDB PITR (Point-in-Time Recovery) enabled; RPO 1 hour; encryption at rest; regular backups; data hosted in managed cloud environment | ✅ Mitigated |
| **Phishing attack targeting admin credentials** | Security | Medium (2) | High (3) | 6 | Hardware/TOTP MFA required on all admin accounts; 1Password used to prevent credential reuse; awareness of phishing indicators | ✅ Mitigated |
| **API abuse / DDoS** | Security / Availability | Medium (2) | Medium (2) | 4 | Cloudflare WAF and DDoS protection active; custom rate limiting middleware on auth and sensitive API endpoints; Cloudflare Under Attack mode available | ✅ Mitigated |
| **Third-party AI provider data exposure** | Privacy | Medium (2) | Medium (2) | 4 | No raw PII sent to AI providers; prompts use anonymised/aggregated transaction descriptions; OpenAI and Anthropic have zero data retention API options (to be configured) | ⚠️ Partially mitigated — zero retention API option to be configured |
| **CCPA non-compliance (California users)** | Compliance | Low (1) | Medium (2) | 2 | Privacy Policy includes CCPA rights section; no data selling; deletion requests honoured; data inventory maintained | ✅ Mitigated |
| **Cloudflare outage / DNS failure** | Availability | Low (1) | High (3) | 3 | Direct-to-Railway domain fallback possible; Railway provides app URL independent of Cloudflare; standard Cloudflare SLA | ✅ Mitigated |

---

## 3. Risk Scoring Reference

| Score | Level | Action |
|-------|-------|--------|
| 7–9 | **Critical** | Immediate remediation required |
| 4–6 | **High** | Remediation planned with defined timeline |
| 2–3 | **Medium** | Monitored; addressed in next review cycle |
| 1 | **Low** | Accepted; documented |

---

## 4. Open Risk Items

| Risk | Owner | Target Date |
|------|-------|------------|
| Deepseek replacement / restriction enforcement | Ryan Mahabir | Q3 2026 |
| Solo founder emergency access plan | Ryan Mahabir | Q3 2026 |
| PIPEDA / SOC 2 formal certification | Ryan Mahabir / Comp AI | August 2026 |
| AI provider zero-retention API configuration | Ryan Mahabir | Q2 2026 |

---

## 5. Policy Review

This register is reviewed quarterly and updated upon identification of new material risks or resolution of existing items. Ryan Mahabir is responsible for maintaining this register.

---

*BudgetSmart — Hamilton, Ontario, Canada | budgetsmart.io*
