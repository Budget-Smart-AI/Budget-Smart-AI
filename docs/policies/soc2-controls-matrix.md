# SOC 2 Controls Matrix

**Company:** BudgetSmart  
**Owner:** Ryan Mahabir, CEO  
**Email:** ryan@mahabir.pro  
**Version:** 1.1  
**Effective Date:** March 7, 2026  
**Last Updated:** March 9, 2026  
**Review Schedule:** Prior to each SOC 2 audit and annually thereafter  

> **SOC 2 Type I certification is scheduled for June/July 2026 with Comp AI as the compliance platform and audit facilitator. Expected certified date: August 2026.**

---

## 1. Purpose

This matrix maps SOC 2 Trust Services Criteria (TSC) Common Criteria (CC1–CC9) and Availability Criteria (A1) to BudgetSmart's implemented controls. It serves as the primary reference for audit evidence during the SOC 2 Type I examination.

---

## 2. Controls Matrix

### CC1 — Control Environment

| CC | Criteria | Control | Implementation | Evidence |
|----|---------|---------|---------------|---------|
| CC1.1 | COSO Principle 1: Commitment to integrity and ethical values | Information Security Policy published and acknowledged | Information Security Policy v1.0 in /docs/policies/; policy acknowledgement by all system users | Policy document; acknowledgement records |
| CC1.2 | COSO Principle 2: Board oversight of controls | CEO (Ryan Mahabir) responsible for security governance | Ryan Mahabir performs all system access reviews, incident response, and policy approvals | Policy documents; access review records |
| CC1.3 | COSO Principle 3: Organisational structure, authority, responsibility | Roles and responsibilities defined in policy documentation | Information Security Policy and Access Control Policy define roles; Ryan Mahabir is sole system admin | Policy documents |
| CC1.4 | COSO Principle 4: Commitment to competence | Security awareness and training for personnel with system access | Policy acknowledgement required before system access; annual review | Training records; policy acknowledgement |
| CC1.5 | COSO Principle 5: Accountability | Audit logging for all significant system events | Audit log table captures user actions, auth events, data access, admin actions with timestamps | Audit log records; server/audit-logger.ts |

---

### CC2 — Communication and Information

| CC | Criteria | Control | Implementation | Evidence |
|----|---------|---------|---------------|---------|
| CC2.1 | Uses relevant, quality information | Logging and monitoring of application and security events | Application logs in Railway; audit log in NeonDB; security alerts monitored | Railway logs; audit_log table |
| CC2.2 | Communicates internally | Security policies communicated to personnel | Policy documents in /docs/policies/ accessible to all authorised personnel | Policy documents in GitHub |
| CC2.3 | Communicates externally | Privacy Policy and Terms of Service published | Privacy Policy at budgetsmart.io/privacy; Terms at budgetsmart.io/terms | Public-facing web pages |

---

### CC3 — Risk Assessment

| CC | Criteria | Control | Implementation | Evidence |
|----|---------|---------|---------------|---------|
| CC3.1 | Specifies suitable objectives | Business objectives tied to security and compliance requirements | Risk Register documents risk appetite; SOC 2 audit underway | Risk Register v1.0 |
| CC3.2 | Identifies and analyses risk | Risk Register maintained and reviewed quarterly | Risk Register in /docs/policies/risk-register.md; reviewed quarterly | Risk Register; review records |
| CC3.3 | Assesses fraud risk | Fraud risk considered in Risk Register | Credential compromise, data breach, and financial data exposure risks documented | Risk Register |
| CC3.4 | Identifies and assesses significant changes | Change management process requires review of security impact | Change Management Policy; GitHub PR review process | GitHub PR history; Change Management Policy |

---

### CC4 — Monitoring Activities

| CC | Criteria | Control | Implementation | Evidence |
|----|---------|---------|---------------|---------|
| CC4.1 | Selects, develops, and performs ongoing monitoring | Automated monitoring of application health and security | Railway health checks; NeonDB monitoring; Cloudflare WAF alerts; GitHub secret scanning; UptimeRobot external uptime monitoring at https://stats.uptimerobot.com/kR5HAwu7qW (5-minute check interval on /health endpoint; alerts to ryan@mahabir.pro) | Railway dashboard; NeonDB metrics; Cloudflare WAF logs; UptimeRobot dashboard |
| CC4.2 | Evaluates and communicates deficiencies | Security issues escalated and resolved; post-incident reviews documented | Incident Response Plan defines review process; post-incident reports documented | Incident reports; post-incident review records |

---

### CC5 — Control Activities

| CC | Criteria | Control | Implementation | Evidence |
|----|---------|---------|---------------|---------|
| CC5.1 | Selects and develops control activities | Controls defined and implemented per policy | Information Security Policy defines control requirements; implemented in code and infrastructure | Policy documents; code (server/auth.ts, server/encryption.ts, server/audit-logger.ts) |
| CC5.2 | Selects and develops technology controls | Technical controls implemented in application | MFA via TOTP (server/auth.ts); AES-256-GCM encryption (server/encryption.ts); rate limiting (server/rate-limiter.ts); audit logging (server/audit-logger.ts) | Code review; deployed application |
| CC5.3 | Deploys through policies and procedures | Policies governing control deployment | Change Management Policy; all changes via GitHub PRs; CI/CD via Railway | GitHub PR history; Railway deployment logs |

---

### CC6 — Logical and Physical Access

| CC | Criteria | Control | Implementation | Evidence |
|----|---------|---------|---------------|---------|
| CC6.1 | Implements logical access security | Access controls defined and enforced | Access Control Policy; MFA required for all production systems; least-privilege access | Access Control Policy; system configurations |
| CC6.2 | Authenticates with credentials | Strong authentication required | Minimum 8-character passwords with complexity; MFA required for all admin access; TOTP-based 2FA for BudgetSmart user accounts | Auth implementation; access control policy |
| CC6.3 | Authorises access based on authorised individuals | Role-based access; access reviews | Access to each system restricted to authorised accounts; access inventory maintained | Access Control Policy; system access inventory |
| CC6.4 | Considers network segmentation | Network-level controls via Cloudflare | Cloudflare WAF; HTTPS-only; direct IP access to Railway restricted | Cloudflare configuration |
| CC6.5 | Identifies and authenticates users | Unique user accounts; session management | No shared accounts; unique user IDs; session tokens with 30-day expiry for expired sessions | Code; Access Control Policy |
| CC6.6 | Restricts access to authorised users | Access to sensitive data restricted | Tier 1 data (bank tokens, keys) accessible only via authenticated API; NeonDB production database not publicly accessible — IP access restricted to Railway Web App IP address only; any administrative access uses a read-only role (`readonly_user`) with no write privileges | Code; NeonDB IP allowlist configuration |
| CC6.7 | Restricts unauthorised access | Security monitoring for unauthorised access attempts | Rate limiting on auth endpoints; audit logging of failed auth attempts; Cloudflare WAF blocking malicious traffic | Rate limiter logs; audit logs; Cloudflare WAF |
| CC6.8 | Prevents unauthorised physical access | Physical access managed by cloud providers | Data hosted on Railway (cloud); NeonDB (cloud); physical security is provider responsibility (both SOC 2 certified) | Railway SOC 2 report; NeonDB SOC 2 report |

---

### CC7 — System Operations

| CC | Criteria | Control | Implementation | Evidence |
|----|---------|---------|---------------|---------|
| CC7.1 | Detects and monitors for vulnerabilities | Dependency vulnerability scanning | GitHub Dependabot (alerts and automatic security PRs) enabled; GitHub secret scanning and push protection active (blocks commits containing secrets); GitHub CodeQL code scanning active on all PRs and pushes to main; Snyk continuous vulnerability scanning enabled via GitHub integration | GitHub Security tab; Dependabot alerts; Snyk dashboard |
| CC7.2 | Monitors system components | Application and infrastructure monitoring | Railway monitoring and health checks; NeonDB metrics; error logging | Railway metrics; application logs |
| CC7.3 | Evaluates security events | Security events reviewed and escalated | Audit log reviewed for anomalies; rate limit violations generate alerts; Incident Response Plan defines escalation | Audit log; Incident Response Plan |
| CC7.4 | Responds to security incidents | Incident Response Plan defined and documented | Incident Response Plan v1.0 in /docs/policies/; severity levels P1–P4 defined; PIPEDA 72-hour notification requirement included | Incident Response Plan |
| CC7.5 | Identifies and addresses known vulnerabilities | Vulnerability remediation process | Critical/high vulnerabilities remediated within 7 days; medium within 30 days (per Information Security Policy) | Information Security Policy; Dependabot records |

---

### CC8 — Change Management

| CC | Criteria | Control | Implementation | Evidence |
|----|---------|---------|---------------|---------|
| CC8.1 | Authorises changes | All changes require approval via PR | Change Management Policy; GitHub branch protection enforced on `main` (requires PR, requires 1 approval, requires status checks, bypassing not permitted); Ryan Mahabir approves all production changes | GitHub PR history; Change Management Policy; GitHub branch protection configuration |
| CC8.1 | Tests changes before deployment | Pre-merge requirements include testing | TypeScript compilation required; manual smoke testing of affected features documented in PR | GitHub PR records; CI/CD logs |
| CC8.1 | Maintains rollback capability | Railway instant rollback available | Railway instant rollback documented in Change Management Policy; NeonDB PITR for database rollback | Change Management Policy; Railway dashboard |

---

### CC9 — Risk Mitigation

| CC | Criteria | Control | Implementation | Evidence |
|----|---------|---------|---------------|---------|
| CC9.1 | Identifies and mitigates risks from business disruption | Business Continuity Plan defined | Business Continuity Plan v1.0 in /docs/policies/; RTO 4hr, RPO 1hr; NeonDB PITR; Railway rollback | Business Continuity Plan |
| CC9.2 | Manages vendor risk | Vendor risk assessment and monitoring | Vendor Management Policy v1.0; all critical vendors SOC 2 certified; documented gaps (Deepseek) with mitigation plans | Vendor Management Policy; vendor register |

---

### A1 — Availability

| CC | Criteria | Control | Implementation | Evidence |
|----|---------|---------|---------------|---------|
| A1.1 | Maintains performance to meet availability commitments | Infrastructure designed for availability | Railway auto-deploy; Cloudflare CDN for static assets; NeonDB managed database with PITR | Infrastructure configuration; Railway uptime |
| A1.2 | Monitors to meet availability commitments | Uptime monitoring in place | UptimeRobot external uptime monitoring active — HTTPS monitor on https://app.budgetsmart.io/health, 5-minute check interval, alerts to ryan@mahabir.pro; public status page at https://stats.uptimerobot.com/kR5HAwu7qW; Railway health checks; NeonDB monitoring; Cloudflare availability monitoring | UptimeRobot dashboard; Railway dashboard; NeonDB metrics |
| A1.3 | Recovers to meet availability commitments | Recovery procedures defined and tested | Business Continuity Plan; NeonDB PITR; Railway rollback; documented disaster scenarios | Business Continuity Plan |

---

## 3. Evidence Collection Notes

For the SOC 2 Type I audit, the following evidence types will be required:

| Evidence Type | Location | Responsible |
|-------------|---------|------------|
| Policy documents | /docs/policies/ in GitHub | Ryan Mahabir |
| Audit log records | NeonDB audit_log table | Ryan Mahabir |
| Access review records | Maintained in GitHub issues / 1Password | Ryan Mahabir |
| GitHub PR history | GitHub repository | Ryan Mahabir |
| Railway deployment logs | Railway dashboard | Ryan Mahabir |
| Vendor SOC 2 reports | Obtained from each vendor | Ryan Mahabir |
| Incident records | Documented per Incident Response Plan | Ryan Mahabir |
| MFA configuration screenshots | System screenshots | Ryan Mahabir |
| UptimeRobot uptime records | https://stats.uptimerobot.com/kR5HAwu7qW | Ryan Mahabir |
| GitHub security settings | GitHub Settings → Security & Analysis | Ryan Mahabir |
| NeonDB IP allowlist configuration | NeonDB dashboard → IP Allow | Ryan Mahabir |
| Snyk vulnerability scan reports | Snyk dashboard (snyk.io) | Ryan Mahabir |

---

*BudgetSmart — Hamilton, Ontario, Canada | budgetsmart.io*
