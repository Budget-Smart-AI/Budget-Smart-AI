# Cline prompt — add /affiliate and /affiliate-terms to marketing site

> Paste everything below this line into Cline inside the **marketing-site repo** (the React app deployed to www.budgetsmart.io). The canonical content is pulled from the main `Budget-Smart-AI/Budget-Smart-AI` app repo's `client/src/pages/affiliate.tsx` (968 lines) and `client/src/pages/affiliate-terms.tsx` (269 lines); this prompt inlines every hardcoded string so you don't need to pull that repo.

---

## Context

The Budget Smart AI app at `app.budgetsmart.io` just shipped a redirect that sends `/affiliate` and `/affiliate-terms` off the app domain and onto the marketing site at `www.budgetsmart.io` (same pattern as `/pricing`, for SEO consolidation). But the marketing site doesn't have those routes yet — both URLs 404 right now. Please add them.

Two pages to build. Match the existing marketing-site conventions for routing, header/footer layout, nav integration, and theming. The screenshots on the app side use a dark slate hero with emerald/teal gradient accents — the marketing site's top nav is already mint-green on white, so feel free to adapt the palette to match the marketing site rather than copying the dark app treatment. The priority is that the marketing-site pages look like they belong on the marketing site, not that they pixel-match the app pages.

**Hardcode all numbers.** The marketing site won't have access to the app's `/api/affiliate/settings` endpoint, and Partnero is source-of-truth for what actually pays out. Locked-in values as of 2026-04-17:

- `commissionPercent` = **40**
- `boostedCommissionPercent` = **50**
- `boostedAfterReferrals` = **250**
- `cookieDurationDays` = **180**
- `payoutMethod` = **PayPal**
- `payoutMinimum` = **$100**
- `commissionRecurrence` = **lifetime recurring**
- `partneroUrl` = **https://affiliate.budgetsmart.io** (custom-domain CNAME, use for every "Join Now" / "Become an Affiliate" CTA — `target="_blank" rel="noopener noreferrer"`)

---

## Page 1: `/affiliate`

### Hero
- Eyebrow badge: "Affiliate Program" (gift icon optional)
- H1: **Earn 40% Lifetime Recurring Commissions** — the "40% Lifetime" bit is the emerald/teal gradient highlight on the app side; do whatever matches the marketing-site hero treatment for emphasis
- Subhead: "Join our affiliate program and earn passive income by helping others take control of their finances. Get paid every month, for as long as your referrals stay subscribed."
- Primary CTA: "Become an Affiliate" → `https://affiliate.budgetsmart.io`
- Secondary CTA: "Calculate Earnings" → anchor link to an on-page calculator section (if you choose to build one; see "optional" note below)

### Stats row (4 cards, below hero)
| Label | Value |
|---|---|
| Commission Rate | 40% |
| Cookie Duration | 180 Days |
| Recurring | Lifetime |
| Payout | $100 PayPal |

### How It Works (3 steps)
1. **Sign Up** — "Join our affiliate program for free through Partnero. Get your unique referral link instantly."
2. **Share** — "Share your link with your audience through your blog, social media, email list, or YouTube channel."
3. **Earn** — "Earn 40% of every payment your referrals make — for the full lifetime of their subscription. Payouts via PayPal once you reach $100."

### Commission Boost section
- Badge: "Commission Boost" (trophy icon optional)
- H2: **Hit 250 Referrals, Earn 50% Forever** (the "Earn 50% Forever" portion is the highlighted/gradient text)
- Subhead: "Two tiers, no gimmicks. Everyone starts at 40% lifetime recurring. Reach 250 active paying referrals and your rate jumps to 50% — applied to **every** referral on your account, including the ones already paying you."

Two cards side by side:

**Standard card** (default state, from day one)
- Subtitle: "From day one — no minimums"
- Big number: **40%**
- Caption under number: "Lifetime recurring commission"
- Bullets:
  - ✓ Paid every month a referral stays active
  - ✓ 180-day attribution cookie
  - ✓ $100 minimum payout via PayPal

**Boosted card** (highlighted as the upgrade — use a warmer gold/amber treatment to distinguish; "BOOSTED" corner ribbon optional)
- Subtitle: "250+ active referrals"
- Big number: **50%**
- Caption under number: "Lifetime recurring commission"
- Bullets:
  - ✓ Boost applies to **all** your referrals
  - ✓ Old + new — everyone re-rates to 50%
  - ✓ Locked in once unlocked

### Earnings Calculator (OPTIONAL — only if marketing site has similar interactive components)
If it feels right for the marketing site, add an interactive slider:
- Range slider: 1–500 referrals
- Display current value prominently
- Compute: `referrals × $14.99 × 0.40` as "Monthly earnings (Standard)" and `referrals × $14.99 × 0.50` as "Monthly earnings (Boosted 50%)"
- $14.99 is the Pro plan price — if the marketing site has a richer pricing config, use whatever price tier the affiliate copy refers to
- If skipping, remove the "Calculate Earnings" secondary CTA from the hero

### FAQ (accordion, 8 items)
1. **Q: How do I get paid?**
   A: "We pay affiliates monthly via PayPal through Partnero. You'll receive your earnings by the 15th of each month for the previous month's commissions."

2. **Q: Is there a minimum payout?**
   A: "Yes, the minimum payout threshold is $100. If you haven't reached $100, your earnings will roll over to the next month."

3. **Q: How long does the cookie last?**
   A: "Our attribution cookie lasts 180 days. If someone clicks your link and signs up within 180 days, you get credit for the referral."

4. **Q: Do I earn commission on renewals?**
   A: "Yes — every renewal pays. You earn 40% on EVERY payment your referrals make for the lifetime of their subscription. Hit 250 active referrals and your rate jumps to 50% on all of them, old and new."

5. **Q: How does the 50% boost work?**
   A: "Once you have 250 active paying referrals on your account, your commission rate increases from 40% to 50% — and the new rate applies to every referral you've ever brought in, not just the ones from that point forward."

6. **Q: Can I promote on social media?**
   A: "Absolutely! You can share your affiliate link on any platform — social media, YouTube, TikTok, blogs, email, podcasts, and more. Just follow our brand guidelines."

7. **Q: What marketing materials do you provide?**
   A: "We provide banners, social media graphics, email templates, landing page copy, and more through the Partnero dashboard."

8. **Q: How do I track my referrals?**
   A: "The Partnero dashboard gives you real-time tracking of clicks, signups, conversions, and earnings. You can see exactly how your campaigns are performing."

### Bottom CTA
- H2: "Ready to Start Earning?"
- Body: "Join thousands of affiliates earning passive income with BudgetSmart AI. Sign up takes less than 2 minutes."
- CTA button: "Join the Affiliate Program" → `https://affiliate.budgetsmart.io`
- Small caption under button: "Free to join • No approval required • Start earning today"

---

## Page 2: `/affiliate-terms`

Long-form legal terms page. Use the marketing site's existing long-form/legal layout (same as /terms, /privacy — follow the same container, typography, and heading treatment). Last Updated date: **April 2026**.

### Header
- Title: "Affiliate Program Terms & Conditions"
- Subtitle: "Budget Smart AI"
- Last Updated: April 2026

### Intro paragraphs
> These Affiliate Program Terms ("Agreement") govern your participation in the Budget Smart AI Affiliate Program. By registering as an affiliate or promoting Budget Smart AI, you agree to these terms.
>
> Budget Smart AI is owned and operated by Ryan Mahabir ("Company," "we," "us," "our").

### Section 1 — Program Overview
> The Budget Smart AI Affiliate Program allows approved partners ("Affiliates") to earn commissions by referring new paying customers to Budget Smart AI using a unique tracking link.
>
> Commissions are paid only on verified, successful subscriptions.

### Section 2 — Commission Structure
Intro: "Affiliates earn lifetime recurring commissions on every active paying customer they refer. The program has two rates:"

| Tier | Active Referrals | Commission |
|---|---|---|
| Standard | 1–249 | 40% lifetime recurring |
| Boosted | 250+ | 50% lifetime recurring |

Follow-up paragraphs:
> "Lifetime recurring" means the affiliate will receive a commission on every successful payment for as long as the referred customer remains an active paying subscriber of Budget Smart AI, including renewals.
>
> When an affiliate reaches 250 active paying referrals, the boosted 50% rate applies to **all** of that affiliate's referrals — including those acquired before the boost was unlocked. The boost remains active for the lifetime of the affiliate account.
>
> Attribution uses a 180-day first-click cookie. If a visitor clicks an affiliate link and signs up for a paid plan within 180 days, the referral is credited to that affiliate.

### Section 3 — Payouts
> Commissions are paid via PayPal once an affiliate's accrued balance reaches the $100 minimum payout threshold. Balances below $100 roll over to the next month.
>
> All commissions are subject to a 30-day holding period to allow for refunds, chargebacks, fraud detection, and billing verification. Payouts are released only after:
> - The customer payment has cleared and remains valid 30 days after the charge
> - The referral is not flagged for fraud or self-referral
> - No refunds or chargebacks have been issued against the payment
>
> Refunds, chargebacks, or subscription cancellations within the holding period reverse the associated commission. Refunds processed after the holding period are deducted from the affiliate's next payout.

### Section 4 — What Counts as a Qualified Referral
Intro: "A referral is valid only if:"
- The user clicks your unique affiliate link within the 180-day attribution window
- Creates a new Budget Smart AI account using a different email than the affiliate's
- Purchases a paid plan and the payment successfully clears
- Does not request a refund within the 30-day holding period
- Does not violate fraud, abuse, or self-referral rules

Callout (warning/amber styling):
> **Important:** Self-referrals are prohibited.

### Section 5 — Prohibited Activities
Intro: "Affiliates may NOT engage in:"

**Paid Ad Violations**
- Bidding on "Budget Smart AI", "BudgetSmart", or brand-related keywords
- Running ads that impersonate or compete with official Budget Smart AI advertising
- Redirecting paid ads to your affiliate links

**Spam & Unethical Promotion**
- Sending unsolicited emails or messages (CAN-SPAM violations)
- Posting affiliate links in spammy forums, comment sections, or bot traffic
- Using fake reviews, false claims, or misleading statements

**Fraud & Abuse**
- Creating fake accounts
- Self-referrals
- Incentivized signups that mislead users
- Using VPNs, bots, or click farms

Callout (red/destructive styling):
> Violations result in immediate termination and forfeiture of commissions.

### Section 6 — Marketing Guidelines
**Affiliates may:**
- Promote via blogs, YouTube, social media, newsletters, and websites
- Share real testimonials and honest reviews
- Use approved brand assets

**Affiliates may NOT:**
- Misrepresent features, pricing, or guarantees
- Claim Budget Smart AI is a bank or financial institution
- Promise returns, savings, or financial outcomes

### Section 7 — Intellectual Property
> Affiliates may use Budget Smart AI logos and branding only for promotion and may not:
> - Alter branding
> - Register similar domains
> - Impersonate the company
>
> All trademarks remain the property of Budget Smart AI.

### Section 8 — Termination
Intro: "We may suspend or terminate any affiliate at any time if:"
- Fraud is suspected
- These terms are violated
- Brand integrity is harmed

"Upon termination:"
- Unpaid fraudulent commissions are void
- Tracking links are disabled

### Section 9 — Relationship
> Affiliates are independent contractors, not employees, partners, or representatives of Budget Smart AI.

### Section 10 — Liability
Intro: "Budget Smart AI is not liable for:"
- Lost commissions due to tracking errors
- Platform outages
- Changes to pricing or product

### Section 11 — Program Changes
Intro: "We reserve the right to modify:"
- Commission rates
- Payout terms
- Program rules

> Notice will be provided when changes occur.

### Section 12 — Governing Law
> This Agreement is governed by the laws of Canada.

### Section 13 — Contact
For affiliate support:
- **Owner:** Ryan Mahabir
- **Email:** hello@budgetsmart.io
- **Support:** support@budgetsmart.io

Bottom link block:
> See also our [Terms of Service](/terms) and [Privacy Policy](/privacy).

---

## Routing & navigation integration

- Add both routes to the marketing site's router so `www.budgetsmart.io/affiliate` and `www.budgetsmart.io/affiliate-terms` resolve
- Ensure the existing top nav and footer render on both pages
- In the footer, add two links: **"Affiliate Program"** → `/affiliate` and **"Affiliate Terms"** → `/affiliate-terms`. Put them alongside existing legal links (Terms, Privacy). If the site is in a "legal" column, put Affiliate Terms there; Affiliate Program can live under a "Company" / "Resources" / "Product" column, whichever fits the existing IA
- On the `/affiliate` page, the final "Affiliate Terms" cross-link in the body should point to `/affiliate-terms`
- Both pages should set appropriate `<title>` and meta description tags for SEO (e.g. "Affiliate Program — Budget Smart AI" / "Earn 40% lifetime recurring commissions. Join the Budget Smart AI affiliate program.")

## QA checklist
- [ ] Both routes load with a 200 (not 404)
- [ ] Hero CTA button on `/affiliate` opens `https://affiliate.budgetsmart.io` in a new tab
- [ ] No broken cross-links (`/affiliate-terms`, `/terms`, `/privacy`, `/`)
- [ ] Responsive on mobile (hero, stats row, two-card tier section, FAQ accordion)
- [ ] Lighthouse/axe: no regressions vs existing marketing pages
- [ ] Footer now has "Affiliate Program" + "Affiliate Terms" links visible on all pages

## Suggested commit
One commit, two files (plus router/footer edits). Message template:

```
feat(marketing): add /affiliate and /affiliate-terms pages

Creates the landing and legal pages for the Partnero affiliate program
on the marketing site. The app at app.budgetsmart.io now 301-redirects
both routes to www, so these pages are what affiliates actually see.

Content locked-in 2026-04-17:
* 2-tier: Standard 40% lifetime recurring, Boosted 50% at 250 active referrals
* 180-day first-click attribution cookie
* $100 PayPal minimum payout, monthly (15th of following month)
* 30-day holding period; refunds reverse commissions

CTA destination: https://affiliate.budgetsmart.io (Partnero custom domain)

Footer gains "Affiliate Program" + "Affiliate Terms" links.
```

Push to main so Railway auto-deploys. After deploy, confirm live:
- https://www.budgetsmart.io/affiliate → 200, hero loads
- https://www.budgetsmart.io/affiliate-terms → 200, ToS renders
- https://app.budgetsmart.io/affiliate → 301 → www (already wired on the app side)
