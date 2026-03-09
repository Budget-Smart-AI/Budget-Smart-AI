# Change Management Policy

**Company:** BudgetSmart  
**Owner:** Ryan Mahabir, CEO  
**Email:** ryan@mahabir.pro  
**Version:** 1.1  
**Effective Date:** March 7, 2026  
**Last Updated:** March 9, 2026  
**Review Schedule:** Annual or upon material change to deployment pipeline  

---

## 1. Purpose

This policy defines how changes to BudgetSmart's application code, infrastructure, and configuration are planned, reviewed, approved, deployed, and validated. It ensures that changes are controlled, traceable, and reversible, consistent with SOC 2 Common Criteria CC8.

---

## 2. Scope

This policy applies to all changes to:
- Application source code (client, server, shared).
- Infrastructure configuration (Railway, NeonDB, Cloudflare).
- Database schema (migrations).
- Third-party integration configurations (API keys, webhooks).
- Security configurations and access controls.

---

## 3. Change Request Process

### 3.1 All Changes via GitHub Pull Requests

All code changes to BudgetSmart must be submitted as a **GitHub Pull Request (PR)** against the `main` branch. Direct commits to `main` are prohibited and enforced via **GitHub branch protection rules** configured on the `main` branch (see Section 3.2).

A PR must include:
- A descriptive title explaining what is changing.
- A description of the change, why it is needed, and what was tested.
- Reference to the related issue, task, or ticket if applicable.

### 3.2 Review and Approval

GitHub branch protection rules enforce the following requirements on the `main` branch (bypassing these settings is not permitted):
- **Pull request required before merging** — no direct pushes to `main`.
- **At least 1 approval required** — all PRs must be reviewed and approved before merging.
- **Status checks must pass** — required CI checks must pass before a PR may be merged.
- **Bypass not allowed** — branch protection settings cannot be bypassed, including by admins.

Ryan Mahabir is the designated approver for all production changes. Any change affecting security controls, authentication, data access, or encryption requires explicit review and approval before deployment.

### 3.3 Pre-Merge Requirements
Before a PR may be merged:
- [ ] **TypeScript compilation** must succeed (`tsc --noEmit` or equivalent CI check passes with no errors).
- [ ] All existing automated tests must pass.
- [ ] **Manual smoke testing** of all directly affected features must be completed and noted in the PR description.
- [ ] Any new dependencies must be reviewed for known vulnerabilities (via `npm audit` or GitHub Dependabot alerts).
- [ ] Database migrations must be reviewed to confirm they are backwards-compatible or have a defined rollback path.

---

## 4. Deployment Process

### 4.1 Automatic Deployment from Main
- Merging a PR to `main` triggers an **automatic deployment via Railway**.
- The Railway pipeline builds the application, runs any configured checks, and deploys to production.
- Deployment status is visible in the Railway dashboard and GitHub Actions.

### 4.2 Deployment Monitoring
- After each deployment, the deploying engineer (Ryan Mahabir) must:
  1. Verify the Railway deployment completed successfully.
  2. Confirm the application is running via the Railway health check or manual smoke test.
  3. Monitor error logs for the first 15 minutes post-deployment.

### 4.3 Database Migrations
- Database schema changes are applied via the migration framework and run as part of the deployment process.
- Migrations must be reviewed for data integrity impact before deployment.
- Destructive migrations (dropping columns or tables) require explicit acknowledgement in the PR.

---

## 5. Rollback Procedure

### 5.1 Railway Instant Rollback
Railway supports **instant rollback** to any previous deployment. In the event of a failed or problematic deployment:

1. Navigate to the Railway dashboard → Project → Deployments.
2. Identify the last known-good deployment.
3. Click **Rollback** to immediately revert to that deployment.
4. Railway will redeploy the prior build without any code changes.

Rollback target time: **within 15 minutes** of identifying a deployment issue.

### 5.2 Database Rollback
- If a migration causes data issues, use NeonDB's **Point-in-Time Recovery (PITR)** to restore the database to a pre-migration state.
- PITR is available for the configured retention window (see [Business Continuity Plan](./business-continuity-plan.md)).
- Database rollbacks must be coordinated with a corresponding application rollback to ensure schema/code compatibility.

### 5.3 Environment Variable Rollback
- Previous environment variable values are maintained in 1Password.
- If a configuration change causes issues, revert environment variables via the Railway dashboard and 1Password reference.

---

## 6. Configuration Changes

Changes to environment variables, secrets, and infrastructure configuration are treated as production changes and require:
- Documentation of the change (what changed, why, when).
- Backup of the previous value in 1Password before making the change.
- Verification that the change has the intended effect post-deployment.

Configuration changes that affect security (e.g., encryption keys, API access controls) require explicit approval from Ryan Mahabir.

---

## 7. Emergency Changes

In rare cases where an emergency fix is required outside of the normal PR review process (e.g., active security incident, critical production outage):

1. The change may be deployed directly or with expedited review.
2. The change must be documented immediately after deployment, including justification for bypassing normal review.
3. A follow-up PR must be created within 24 hours to formalise the change in the codebase.
4. Ryan Mahabir must review and approve the follow-up PR.

Emergency changes must be logged in the audit trail.

---

## 8. Change Log

All changes to production are implicitly tracked via:
- GitHub commit history and PR records.
- Railway deployment history.
- NeonDB migration history.

No separate change log is required, provided GitHub PR and Railway deployment records are maintained and accessible for audit.

---

## 9. Policy Review

This policy is reviewed annually or upon material change to the deployment pipeline. Ryan Mahabir is responsible for maintaining this policy.

---

*BudgetSmart — Hamilton, Ontario, Canada | budgetsmart.io*
