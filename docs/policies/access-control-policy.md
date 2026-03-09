# Access Control Policy

**Company:** BudgetSmart  
**Owner:** Ryan Mahabir, CEO  
**Email:** ryan@mahabir.pro  
**Version:** 1.1  
**Effective Date:** March 7, 2026  
**Last Updated:** March 9, 2026  
**Review Schedule:** Annual or upon material change  

---

## 1. Purpose

This policy defines how access to BudgetSmart's systems, applications, and data is granted, managed, monitored, and revoked. It ensures that only authorised individuals have access to sensitive systems and data, consistent with the principle of least privilege and SOC 2 Common Criteria CC6.

---

## 2. Scope

This policy applies to:
- All production and non-production BudgetSmart systems.
- All internal users, contractors, and third parties with system access.
- All systems listed in the Systems Inventory (Section 6).

---

## 3. Access Request and Provisioning

### 3.1 Requesting Access
All access requests must:
- Be submitted to the system owner (Ryan Mahabir) via email or a tracked communication channel.
- Specify the system, role, and business justification.
- Be approved by Ryan Mahabir before credentials are issued.

### 3.2 Provisioning
- Accounts are provisioned using the minimum permissions necessary for the role (least privilege).
- Administrative accounts are provisioned separately from standard user accounts where the system supports it.
- Shared accounts are prohibited. Each individual must have a unique account.
- New access credentials must be communicated via a secure channel (e.g., 1Password secure share).

### 3.3 Privileged Access
- Production database access (NeonDB) is restricted to the application service account (`DATABASE_URL`). Any administrative or support access uses the `readonly_user` read-only role, which has no write privileges. No contractor or support engineer is given the main application service account credentials.
- Infrastructure access (Railway) is restricted to Ryan Mahabir.
- GitHub repository admin access is restricted to Ryan Mahabir.
- Privileged access requires MFA (see Section 7).

---

## 4. Access Review

- Access rights are reviewed quarterly and upon any role change.
- Any access that is no longer required must be revoked within **24 hours** of identification.
- Access reviews are documented and retained for SOC 2 audit purposes.

---

## 5. Access Revocation

Access must be revoked **immediately** upon:
- Termination of employment or contract.
- Role change that no longer requires the access.
- Suspected account compromise.
- Violation of BudgetSmart's Information Security Policy.

Revocation process:
1. Disable or delete the account in the affected system.
2. Rotate any shared secrets or tokens if the departing user had knowledge of them.
3. Document the revocation in the access log (maintained by Ryan Mahabir).

---

## 6. Password Requirements

All accounts used to access BudgetSmart systems must meet the following password standards:

| Requirement | Standard |
|------------|---------|
| Minimum length | 8 characters |
| Complexity | Must include uppercase, lowercase, a number, and a special character |
| Reuse | Passwords must not be reused from the previous 10 passwords |
| Storage | Must be stored in a password manager (e.g., 1Password); never written in plain text |
| Sharing | Passwords must not be shared between users or systems |

Passphrases of 16+ characters (e.g., four random words) are encouraged as an alternative to complex shorter passwords.

---

## 7. Multi-Factor Authentication (MFA) Requirements

MFA is **required** for all administrative and production access. MFA has been enabled and verified on all systems below as of March 9, 2026:

| Access Type | MFA Required | Status |
|------------|-------------|--------|
| Production database (NeonDB) | ✅ Yes | ✅ Enabled |
| Hosting platform (Railway) | ✅ Yes | ✅ Enabled |
| Source code (GitHub) | ✅ Yes | ✅ Enabled |
| DNS / CDN (Cloudflare) | ✅ Yes | ✅ Enabled |
| Financial data provider (Plaid) | ✅ Yes | ✅ Enabled |
| Financial data provider (MX) | ✅ Yes | ⚠️ MFA not available on MX platform — compensating control: strong unique password stored in 1Password |
| BudgetSmart admin panel | ✅ Yes | ✅ Enabled |
| Email service provider (Postmark) | ✅ Yes | ✅ Enabled |
| Payment processor (Stripe) | ✅ Yes | ✅ Enabled |
| Google (email / workspace) | ✅ Yes | ✅ Enabled |

Acceptable MFA methods (in order of preference):
1. Hardware security key (FIDO2/WebAuthn)
2. Authenticator app (TOTP — e.g., Google Authenticator, Authy)
3. SMS one-time password (permitted as fallback only; not preferred)

---

## 8. Systems Inventory and Access Map

The following is the current inventory of systems with their access classification:

| System | Purpose | Current Admin | Access Tier |
|--------|---------|--------------|------------|
| **Railway** | Application hosting / deployment | Ryan Mahabir | Production — MFA required |
| **NeonDB** | Primary PostgreSQL database | Ryan Mahabir | Production — MFA required; IP restricted to Railway Web App; branch set as protected (cannot be deleted, archived, or reset) |
| **GitHub** | Source code, CI/CD pipeline | Ryan Mahabir | Production — MFA required; branch protection enforced on `main` |
| **Cloudflare** | CDN, DNS, WAF, HTTPS termination | Ryan Mahabir | Production — MFA required |
| **Plaid** | Bank account data aggregation | Ryan Mahabir | Production — MFA required |
| **MX** | Bank account data aggregation | Ryan Mahabir | Production — MFA required (MFA not available on platform; compensating control in place) |
| **Stripe** | Subscription billing and payments | Ryan Mahabir | Production — MFA required |
| **Postmark** | Transactional email delivery | Ryan Mahabir | Production — MFA required |
| **Google** | Email and workspace services | Ryan Mahabir | Admin — MFA required |
| **OpenAI** | Primary AI inference | Ryan Mahabir | API Key — stored in Railway env |
| **Anthropic** | Claude AI inference | Ryan Mahabir | API Key — stored in Railway env |
| **Deepseek** | AI fallback (chat only) | Ryan Mahabir | API Key — stored in Railway env |
| **Comp AI** | SOC 2 compliance platform | Ryan Mahabir | Admin |
| **1Password** | Secrets and credential management | Ryan Mahabir | Admin — MFA required |
| **Brandfetch** | Logo enrichment API | Ryan Mahabir | API Key — stored in Railway env |
| **Snyk** | Dependency vulnerability scanning | Ryan Mahabir | Admin — GitHub OAuth |
| **UptimeRobot** | Application uptime monitoring | Ryan Mahabir | Admin — MFA required |

---

## 9. API Key and Secret Management

- All API keys and secrets are stored as environment variables in Railway (production) and backed up in 1Password.
- API keys must never be committed to version control (GitHub).
- GitHub secret scanning is enabled to detect accidental credential exposure.
- API keys should be rotated:
  - Annually as part of routine key management.
  - Immediately upon suspected compromise.
  - Upon termination of any person with knowledge of the key.

---

## 10. Remote Access

- All production system access occurs over HTTPS or SSH with key-based authentication.
- Direct database access (NeonDB) is restricted at the network level: NeonDB allows connections only from the Railway Web App IP address. No other IP addresses are permitted to connect to the production database. Any administrative access uses the `readonly_user` role (read-only; no write privileges).
- Console access to Railway environment is restricted to authorised accounts only.

---

## 11. Violations

Violation of this policy may result in immediate access revocation and escalation per the [Information Security Policy](./information-security-policy.md).

---

## 12. Policy Review

Reviewed annually or upon material change to systems or personnel. Ryan Mahabir is responsible for maintaining this policy.

---

*BudgetSmart — Hamilton, Ontario, Canada | budgetsmart.io*
