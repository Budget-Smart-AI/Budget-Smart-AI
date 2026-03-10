# Privacy Policy

**Company:** BudgetSmart AI  
**Operator:** Ryan Mahabir  
**Email:** admin@budgetsmart.io  
**Website:** budgetsmart.io  
**Version:** 1.1  
**Effective Date:** March 7, 2026  
**Last Updated:** March 9, 2026  

> This is the public-facing privacy policy for budgetsmart.io/privacy. It is written in plain English.

---

## We Respect Your Privacy

BudgetSmart AI is a personal finance tool operated by Ryan Mahabir in Hamilton, Ontario, Canada. We take your privacy seriously. This policy explains what information we collect, how we use it, and the choices you have.

✔ We collect only what we need to run the service.  
✔ We never sell your data — to anyone, ever.  
✔ We keep your data secure with AES-256-GCM encryption.  
✔ You can request deletion of your data at any time.  

---

## 1. What Data We Collect

### Account Information
When you sign up, we collect:
- Your name and email address
- Your password (stored as a secure one-way hash — we never see it in plain text)

### Financial Data (with your permission)
When you connect your bank accounts, we collect:
- Account balances and transaction history
- Account names and types

We connect to your bank through **Plaid** or **MX** — trusted financial data platforms. **We never see or store your bank login credentials.** Your bank login happens directly with your bank through their secure portal.

### Receipt Scan Images
If you use the receipt scanning feature, we store your uploaded receipt images in secure cloud object storage (Cloudflare R2). Receipt images:
- Are encrypted at rest using server-side encryption.
- Are retained for up to 7 years as financial source documents (consistent with Canadian tax record-keeping requirements).
- Are deleted upon account deletion, subject to the retention period above.

### Usage Data
We automatically collect:
- Pages visited and features used within the app
- Device type and browser (to ensure compatibility)
- IP address (for security and fraud prevention purposes)
- Cookies and session tokens (to keep you logged in)

### AI Interactions
If you use BudgetSmart AI's AI features (budgeting insights, portfolio analysis, receipt scanning), we may log your prompts and the AI responses for a limited period to improve quality and debug issues. These logs are:
- Retained for 90 days, then automatically deleted.
- Never shared externally or used to train AI models.
- Processed by our AI providers (see Section 3) under their data processing terms.

### Support Communications
If you contact us for support, we retain records of that communication for **3 years** to help resolve future questions.

---

## 2. How We Use Your Data

We use your data to:
- Provide the budgeting, transaction tracking, and AI insights features you signed up for
- Send you important service notifications (e.g., security alerts, billing receipts)
- Improve the product based on aggregated, anonymised usage patterns
- Detect and prevent fraud and unauthorised access
- Comply with our legal obligations under PIPEDA and applicable law

We **do not**:
- Sell your data to anyone, ever
- Use your financial data for advertising targeting
- Share your data with third parties beyond what is necessary to run the service

---

## 3. Who Can Access Your Data

### BudgetSmart AI Team
BudgetSmart AI is currently operated by Ryan Mahabir. Access to production data is restricted to authorised personnel with multi-factor authentication (MFA). All access is logged for security and audit purposes.

### Third-Party Processors
We share data with the following service providers, who are contractually required to protect it:

| Provider | Purpose | SOC 2 Certified | Data Location |
|----------|---------|----------------|--------------|
| **NeonDB** | Database storage | ✅ Yes | Canada / U.S. |
| **Railway** | Application hosting | ✅ Yes | Canada |
| **Cloudflare** | CDN, security, DNS, file storage (R2) | ✅ Yes | Distributed / Global |
| **Plaid** | Bank account connection | ✅ Yes | U.S. |
| **MX** | Bank account connection (primary) | ✅ Yes | U.S. |
| **Stripe** | Subscription billing | ✅ Yes | U.S. |
| **Postmark** | Transactional email | ✅ Yes | U.S. |
| **OpenAI** | AI features (fallback) | ✅ Yes | U.S. |
| **Anthropic** | AI features (receipt scanning, vision) | ✅ Yes | U.S. |
| **DeepSeek** | AI features (fallback inference via AWS Bedrock) | ✅ Yes (via AWS Bedrock) | China / Global |
| **Comp AI** | SOC 2 compliance platform | ✅ Yes | U.S. |

> ⚠️ **DeepSeek:** DeepSeek is an AI model developed by a Chinese company. However, BudgetSmart AI does not connect to DeepSeek directly or send any data to servers in China. Instead, DeepSeek is accessed exclusively through AWS Bedrock — Amazon's managed AI platform — which hosts and serves the model entirely within AWS's infrastructure in the United States. This means all data remains within AWS's environment at all times and never leaves AWS to reach DeepSeek or any servers in China. AWS is SOC 2 Type II certified and subject to U.S. data protection standards. BudgetSmart AI is also actively planning to migrate to AWS Bedrock's own native models, which will replace DeepSeek entirely.

We do **not** share your personal information with any marketing companies, data brokers, or advertising networks.

---

## 4. Data Storage and Security

- Your data is stored on servers in **Canada and the United States**.
- Sensitive data (such as bank connection tokens) is encrypted using **AES-256-GCM** field-level encryption before being stored in our database.
- Receipt scan images are encrypted at rest in Cloudflare R2 using server-side encryption.
- All data in transit is protected using **TLS 1.2 or higher (HTTPS)**. HTTP connections are automatically redirected to HTTPS.
- We enforce multi-factor authentication (MFA) for all administrative access.
- Two-factor authentication (2FA) is available to all customers via Settings → Security → 2FA. We strongly encourage you to enable it.
- We are pursuing **SOC 2 Type I certification** (target: August 2026) through our compliance partner Comp AI.

> 🇪🇺 **GDPR:** BudgetSmart AI does not currently serve users in the European Union or European Economic Area. If this changes, this policy will be updated to reflect GDPR obligations, including additional rights and data transfer safeguards.

---

## 5. How Long We Keep Your Data

| Data Type | How Long We Keep It |
|-----------|-------------------|
| Account information | Until you delete your account (+ 30-day grace period before permanent deletion) |
| Financial transactions | Up to 7 years (for your own records and Canadian tax purposes) |
| Receipt scan images | Up to 7 years (financial source documents) |
| AI conversation logs | 90 days, then automatically deleted |
| Support tickets | 3 years |
| Login sessions | 30 days after expiry, then automatically deleted |
| Billing records | 7 years |
| Bank connection tokens | Deleted immediately when you disconnect your bank account |

You can request deletion of your data at any time (see Section 7). Some data may be retained longer if required by law or if a legal hold is in effect.

---

## 6. Cookies

We use cookies to:
- Keep you signed in (essential — required for the service to work)
- Remember your preferences (e.g., display theme)
- Understand how people use BudgetSmart AI (analytics — you can opt out)

You can manage cookie preferences from the cookie banner when you first visit the site, or by contacting us at admin@budgetsmart.io.

---

## 7. Your Rights

You have the right to:

| Right | What It Means |
|-------|--------------|
| **Access** | Request a copy of the personal data we hold about you |
| **Correct** | Ask us to fix inaccurate or incomplete information |
| **Delete** | Request deletion of your account and personal data |
| **Export** | Receive your data in a portable, machine-readable format |
| **Withdraw consent** | Opt out of optional data processing (e.g., analytics cookies) |
| **Object** | Object to how we process your data in certain circumstances |

To exercise any of these rights, email **admin@budgetsmart.io** with the subject line "Privacy Request." We will acknowledge your request within **5 business days** and complete it within **30 days**.

---

## 8. PIPEDA Compliance (Canada)

BudgetSmart AI is subject to Canada's **Personal Information Protection and Electronic Documents Act (PIPEDA)**. We:
- Collect only the information we need for the specified purpose.
- Obtain your consent before collecting personal information.
- Keep your information accurate and up to date.
- Protect your information with appropriate security safeguards, including AES-256-GCM encryption and MFA.
- Give you access to your information upon request.
- Report data breaches to the Office of the Privacy Commissioner of Canada (OPC) as soon as feasible when required.

To reach the OPC: www.priv.gc.ca | 1-800-282-1376

---

## 9. CCPA Compliance (California Residents)

If you are a California resident, you have additional rights under the **California Consumer Privacy Act (CCPA)**:
- **Right to Know:** You may request what personal information we have collected about you.
- **Right to Delete:** You may request deletion of your personal information.
- **Right to Opt-Out of Sale:** We **do not sell** your personal information.
- **Right to Non-Discrimination:** We will not discriminate against you for exercising your rights.

To submit a CCPA request, email **admin@budgetsmart.io** with "CCPA Request" in the subject line.

---

## 10. Children's Privacy

BudgetSmart AI is a personal finance tool intended for adults. We do not knowingly collect personal information from anyone under the age of 18. If you believe we have inadvertently collected information from a minor, please contact us immediately at admin@budgetsmart.io and we will delete it promptly.

---

## 11. Changes to This Policy

We may update this policy from time to time. When we do, we will update the "Last Updated" date at the top of this page. If the changes are material, we will notify you via email or an in-app notice before the changes take effect.

---

## 12. Contact Us

For privacy questions, requests, or concerns:

**BudgetSmart AI**  
Hamilton, Ontario, Canada  
Email: admin@budgetsmart.io  
Website: budgetsmart.io  

---

*BudgetSmart AI — Hamilton, Ontario, Canada | budgetsmart.io | admin@budgetsmart.io*

*This policy is available at budgetsmart.io/privacy*
