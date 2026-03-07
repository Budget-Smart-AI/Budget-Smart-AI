# Business Continuity Plan

**Company:** BudgetSmart  
**Owner:** Ryan Mahabir, CEO  
**Email:** ryan@mahabir.pro  
**Version:** 1.0  
**Effective Date:** March 7, 2026  
**Review Schedule:** Annual or after any disaster recovery event  

---

## 1. Purpose

This Business Continuity Plan (BCP) defines how BudgetSmart maintains or rapidly restores critical services following a disruptive event. It establishes recovery objectives, backup procedures, and communication plans to minimise the impact of outages on customers.

---

## 2. Recovery Objectives

| Objective | Target |
|-----------|--------|
| **Recovery Time Objective (RTO)** | 4 hours — maximum time to restore critical services after a disaster |
| **Recovery Point Objective (RPO)** | 1 hour — maximum acceptable data loss (i.e., backups must be available within the last hour) |

---

## 3. Backup Infrastructure

| Asset | Backup Method | Retention | Location |
|-------|-------------|----------|----------|
| **NeonDB (production database)** | Point-in-Time Recovery (PITR) — continuous WAL archiving | 7-day PITR window | NeonDB managed infrastructure (Canada / U.S.) |
| **Application code** | GitHub repository | Full history; all branches | GitHub (cloud) |
| **Static assets / file storage** | Cloudflare R2 object storage | Per R2 retention policy | Cloudflare (distributed CDN) |
| **Railway environment variables** | 1Password vault — manual export | Updated on any env var change | 1Password (cloud, Canada region preferred) |
| **Railway deployment history** | Railway platform history | 30+ previous deployments | Railway dashboard |
| **Encryption keys** | `FIELD_ENCRYPTION_KEY` stored in Railway env + 1Password | Indefinite | 1Password |
| **Third-party API keys** | 1Password vault | Indefinite | 1Password |

---

## 4. Critical Systems and Dependencies

| System | Criticality | Recovery Priority |
|--------|------------|-----------------|
| NeonDB (database) | Critical | 1st |
| Railway (application hosting) | Critical | 2nd |
| Cloudflare (DNS, CDN, TLS) | Critical | 3rd |
| Plaid / MX (bank data sync) | High | 4th |
| Postmark (email delivery) | High | 5th |
| Stripe (billing) | High | 6th |
| OpenAI / Anthropic (AI features) | Medium | 7th |

---

## 5. Disaster Scenarios and Recovery Steps

### Scenario 1: NeonDB Database Outage or Data Loss

**Detection:** Application error logs showing database connection failures; Railway health check failures; user-reported inability to access account data.

**Recovery steps:**
1. Log in to NeonDB dashboard.
2. If the database is operational but data is corrupted: use **PITR** to restore to a point-in-time before the corruption event.
3. If the primary branch is unavailable: activate NeonDB's branch failover (if configured) or restore from the most recent backup.
4. Update Railway environment variable `DATABASE_URL` if the connection string changes after restore.
5. Redeploy the application via Railway to reconnect to the restored database.
6. Verify functionality via smoke testing (user login, transaction sync, dashboard load).
7. Notify customers via email and/or in-app notification if data loss exceeds the RPO.

**Estimated recovery time:** 1–4 hours (within RTO).

---

### Scenario 2: Railway Application Outage

**Detection:** Application unavailable; Railway dashboard showing deployment failure or unhealthy service.

**Recovery steps:**
1. Log in to Railway dashboard.
2. Check deployment logs for error details.
3. If the current deployment is faulty: use **Railway instant rollback** to revert to the last known-good deployment.
4. If Railway infrastructure is unavailable: monitor Railway status page (status.railway.app); await restoration.
5. If prolonged Railway outage (>2 hours): evaluate deploying to an alternative platform (e.g., Fly.io, Render) using the GitHub repository and environment variables from 1Password.
6. Verify functionality after restoration.

**Estimated recovery time:** 15 minutes (rollback) to 4 hours (platform migration — last resort).

---

### Scenario 3: Cloudflare Outage (DNS / CDN)

**Detection:** budgetsmart.io / app.budgetsmart.io unreachable; Cloudflare status page incident.

**Recovery steps:**
1. Monitor Cloudflare status page (cloudflarestatus.com).
2. If Cloudflare is partially available, disable caching/proxy temporarily (orange cloud → grey cloud in DNS) to route traffic directly to Railway.
3. If Cloudflare is fully unavailable: evaluate using an alternative DNS provider temporarily (update Railway-assigned domain).
4. Notify customers via social media or alternative communication channel.

**Estimated recovery time:** Typically Cloudflare restores within 30–60 minutes. Direct routing can be enabled within 15 minutes.

---

### Scenario 4: Compromised Credentials / Security Incident

Refer to the [Incident Response Plan](./incident-response-plan.md) for full procedures.

Summary:
1. Immediately revoke compromised credentials.
2. Rotate all associated secrets in Railway and 1Password.
3. Redeploy to ensure clean environment.
4. Review audit logs for extent of compromise.
5. Notify affected customers and regulators as required.

---

### Scenario 5: Third-Party Provider Failure (Plaid / MX)

**Detection:** Bank sync failures reported by users; API errors in application logs.

**Recovery steps:**
1. Verify the provider's status page.
2. If Plaid is unavailable: switch affected users to MX (if configured) — BudgetSmart supports dual bank data providers.
3. If MX is unavailable: switch to Plaid.
4. If both are unavailable: notify users of temporary sync unavailability; manual transaction entry remains available.
5. Resume automatic sync when provider is restored.

**Estimated recovery time:** Depends on provider; BudgetSmart fallback available within 1 hour.

---

### Scenario 6: Solo Founder Incapacitation

**Risk:** Ryan Mahabir is the sole administrator for all BudgetSmart systems. Incapacitation could prevent access to production systems.

**Mitigation steps:**
1. All credentials are documented in 1Password, accessible via an emergency kit held by a designated trusted person (to be identified).
2. GitHub repository is the authoritative source for all application code.
3. Recovery from documented state is possible by any qualified engineer with access to 1Password and the GitHub repository.
4. **Planned improvement:** Designate a backup contact with read-only access to critical systems and a documented emergency access procedure. Target: Q3 2026.

---

## 6. Communication Plan

| Event | Audience | Channel | Responsible Party |
|-------|----------|---------|-----------------|
| Outage detected | Internal monitoring | Railway / NeonDB alerts → email | Automated |
| Outage confirmed (>15 min) | Affected customers | In-app notification / email | Ryan Mahabir |
| Estimated resolution time | Affected customers | Email / status update | Ryan Mahabir |
| Service restored | Affected customers | Email / in-app notification | Ryan Mahabir |
| Post-incident summary | Customers (if significant) | Email | Ryan Mahabir |
| Data breach | Affected customers + OPC | Email + regulatory notification | Ryan Mahabir |

**Customer communication email:** ryan@mahabir.pro (until a support@ alias is established)  
**Public status:** Planned — status.budgetsmart.io (to be implemented)

---

## 7. Business Continuity Testing

- The BCP is reviewed annually.
- Recovery procedures should be tested at least once per year via a tabletop exercise or live drill.
- Results of drills are documented and used to improve this plan.

---

## 8. Policy Review

This plan is reviewed annually or after any disaster recovery event or material infrastructure change. Ryan Mahabir is responsible for maintaining this plan.

---

*BudgetSmart — Hamilton, Ontario, Canada | budgetsmart.io*
