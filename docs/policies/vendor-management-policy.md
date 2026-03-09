# Vendor Management Policy

**Company:** BudgetSmart  
**Owner:** Ryan Mahabir, CEO  
**Email:** ryan@mahabir.pro  
**Version:** 1.1  
**Effective Date:** March 7, 2026  
**Last Updated:** March 9, 2026  
**Review Schedule:** Annual or upon onboarding/offboarding of a significant vendor  

---

## 1. Purpose

This policy establishes how BudgetSmart evaluates, approves, monitors, and offboards third-party vendors and service providers. It ensures that vendors handling BudgetSmart data or supporting critical operations meet appropriate security and compliance standards, consistent with SOC 2 Common Criteria CC9.

---

## 2. Scope

This policy applies to all third-party vendors, cloud service providers, SaaS platforms, and subprocessors that:
- Process, store, or transmit BudgetSmart customer data or internal data.
- Provide critical infrastructure or operational services to BudgetSmart.

---

## 3. Vendor Risk Assessment Process

### 3.1 Pre-Onboarding Assessment
Before engaging a new vendor with access to Tier 1 (Critical) or Tier 2 (Confidential) data, BudgetSmart evaluates:

| Criterion | Details |
|-----------|---------|
| **Security certifications** | Does the vendor hold SOC 2 Type II, ISO 27001, or equivalent? |
| **Data handling** | Where is data stored? What encryption is used? Who can access it? |
| **Data residency** | Does the vendor store data in Canada, the U.S., or other jurisdictions? |
| **Breach history** | Has the vendor experienced material security incidents? How were they handled? |
| **Contractual protections** | Does the vendor offer a Data Processing Agreement (DPA) or equivalent? |
| **Access controls** | Does the vendor support MFA? Role-based access? Audit logs? |
| **Sub-processors** | Does the vendor use sub-processors? Are they disclosed? |

### 3.2 Risk Rating
Each vendor is assigned a risk rating:
- **High:** Handles Tier 1 (Critical) data (e.g., bank tokens, credentials) or is a single point of failure.
- **Medium:** Handles Tier 2 (Confidential) data or provides important but substitutable services.
- **Low:** Handles only Tier 3/4 (Internal/Public) data; limited business impact if unavailable.

### 3.3 Ongoing Monitoring
- High-risk vendors: reviewed **annually** or upon any material security event.
- Medium-risk vendors: reviewed **annually**.
- Low-risk vendors: reviewed **every two years**.
- BudgetSmart monitors vendor security announcements and breach notifications.

### 3.4 Vendor Offboarding
Upon terminating a vendor relationship:
1. Revoke all API keys and access credentials.
2. Request data deletion confirmation from the vendor.
3. Transition dependent systems to an alternative provider.
4. Document the offboarding in the vendor register.

---

## 4. Vendor Register

The following table lists all current vendors, their function, compliance certifications, risk rating, and any known gaps:

| Vendor | Function | SOC 2 Status | Risk Level | Notes |
|--------|---------|-------------|-----------|-------|
| **Railway** | Application hosting and deployment | SOC 2 Type II ✅ | Medium | Primary hosting platform; env vars backed up in 1Password |
| **NeonDB** | PostgreSQL database (production) | SOC 2 Type II ✅ | High | Stores all customer financial and personal data; PITR enabled; IP restricted to Railway Web App; branch set as protected |
| **Cloudflare** | CDN, DNS, WAF, HTTPS termination | SOC 2 Type II ✅ | Low | Terminates TLS; enforces HSTS; WAF active |
| **Plaid** | Bank account data aggregation | SOC 2 Type II ✅ | High | Handles bank OAuth tokens; access tokens encrypted at rest |
| **MX** | Bank account data aggregation | SOC 2 Type II ✅ | High | Alternative bank data provider; production key dependency risk — see Risk Register |
| **OpenAI** | Primary AI inference (GPT models) | SOC 2 Type II ✅ | Medium | Data sent: transaction descriptions, user prompts. API key in Railway env vars |
| **Anthropic** | Claude AI inference | SOC 2 Type II ✅ | Medium | Data sent: transaction descriptions, user prompts. API key in Railway env vars |
| **Deepseek** | AI fallback — chat only | ❌ No SOC 2 | High | **Documented gap.** China-based data handling. Mitigation planned: restrict to non-PII prompts; evaluate replacement. See Risk Register |
| **Postmark** | Transactional email delivery | SOC 2 Type II ✅ | Low | Sends password reset, security alerts, and notifications |
| **Stripe** | Subscription billing and payments | SOC 2 Type II ✅ | Medium | Handles payment card data; PCI DSS Level 1 certified |
| **Brandfetch** | Merchant logo enrichment | Not assessed | Low | Non-sensitive lookup API; no customer PII shared |
| **Comp AI** | SOC 2 compliance platform | Engaged for BudgetSmart SOC 2 certification | Medium | Compliance partner; audit scheduled June/July 2026 |
| **1Password** | Secrets and credential management | SOC 2 Type II ✅ | Medium | Stores backup of all production credentials and env vars |
| **Snyk** | Dependency and code vulnerability scanning | SOC 2 Type II ✅ | Low | Integrated with GitHub repository via OAuth; scans for vulnerabilities in dependencies and code; no customer data shared |
| **UptimeRobot** | Application uptime monitoring | Not assessed | Low | External health check monitoring on /health endpoint; no customer data shared; public status page at https://stats.uptimerobot.com/kR5HAwu7qW |

---

## 5. Documented Gaps and Mitigations

### Deepseek — No SOC 2 Certification (High Risk)
- **Gap:** Deepseek is a China-based AI provider without SOC 2 certification. Data handling practices and government access risks are not independently verified.
- **Current mitigation:** Deepseek is used only for non-sensitive chat fallback functionality. No customer PII or financial account data is sent to Deepseek.
- **Planned mitigation:** Evaluate replacement with a SOC 2-certified AI provider. Timeline: Q3 2026 (prior to SOC 2 Type II audit).
- **Status:** Open — mitigation in progress.

---

## 6. Contractual Requirements

Before a vendor is approved to handle Tier 1 or Tier 2 data, a written agreement must be in place that includes:
- Data Processing Agreement (DPA) or equivalent data protection terms.
- Breach notification obligations (not less than 72-hour notice to BudgetSmart).
- Restrictions on sub-processing without prior consent.
- Data deletion upon contract termination.
- Audit rights or equivalent (e.g., SOC 2 report availability).

---

## 7. Policy Review

This policy is reviewed annually. Ryan Mahabir is responsible for maintaining the vendor register and conducting risk assessments.

---

*BudgetSmart — Hamilton, Ontario, Canada | budgetsmart.io*
