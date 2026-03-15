# BudgetSmart AI — Plaid API Integration Reference

**Developer Technical Specification**  
March 2026 | Confidential

---

> **Purpose of This Document**
>
> This document is the authoritative technical reference for the BudgetSmart AI Plaid integration. It covers the correct implementation of transactions fetching, Item/product registration, webhook handling, and error recovery — with specific attention to the bugs currently affecting production: empty transaction arrays after bank connect, and products not being acknowledged on Item creation.

---

## Table of Contents

1. [API Fundamentals](#1-api-fundamentals)
2. [The Token Exchange Flow](#2-the-token-exchange-flow-critical--do-this-first)
3. [Transactions API](#3-transactions-api)
4. [Items API](#4-items-api)
5. [Webhooks](#5-webhooks)
6. [Error Handling Reference](#6-error-handling-reference)
7. [BudgetSmart AI — Implementation Checklist](#7-budgetsmart-ai--implementation-checklist)
8. [Sandbox Testing](#8-sandbox-testing)
9. [Quick Reference: Endpoint Summary](#9-quick-reference-endpoint-summary)
10. [Support & Resources](#10-support--resources)

---

## 1. API Fundamentals

### 1.1 Environments & Hosts

| Environment | Base URL |
|---|---|
| Sandbox | `https://sandbox.plaid.com` |
| Production | `https://production.plaid.com` |

> Items **cannot** be moved between environments. Sandbox Items must be recreated in Production.

### 1.2 Authentication

Every request must include `client_id` and `secret`. Send in either the request body or HTTP headers:

```
PLAID-CLIENT-ID: your_client_id
PLAID-SECRET: your_secret
```

Every response includes a `request_id`. Always log this — it is required when contacting Plaid support about a specific call.

### 1.3 Protocol Rules

- All requests are `POST` with `Content-Type: application/json`
- All responses are JSON — errors are in the response body as `error_code` and `error_type`. Do **not** rely on HTTP status codes alone
- HTTPS TLS v1.2 only — do not use HTTP or other TLS versions
- Never pin certificates — use the standard root certificate bundle

---

## 2. The Token Exchange Flow (Critical — Do This First)

Every Plaid integration starts with this 3-step flow. Getting this wrong is the root cause of missing transactions and unregistered products.

---

### Step 1: Create a Link Token (Backend)

**Endpoint:** `POST /link/token/create`

Required fields: `client_id`, `secret`, `client_name`, `language`, `country_codes`, `user.client_user_id`

> **CRITICAL:** Declare products **here**, not later. If you want transactions, specify it in the `products` array at this step. Products declared at link token creation time appear in `billed_products` on the Item after connection. Products NOT declared here appear only in `available_products` and are not initialized.

---

### Step 2: User Completes Link (Frontend)

Initialize Plaid Link with the `link_token`. When the user connects their bank, Link fires the `onSuccess` callback with a `public_token`. The `public_token` is short-lived (30 minutes) — exchange it immediately.

---

### Step 3: Exchange public_token for access_token (Backend)

**Endpoint:** `POST /item/public_token/exchange`

```json
{
  "client_id": "YOUR_CLIENT_ID",
  "secret": "YOUR_SECRET",
  "public_token": "<from_onSuccess>"
}
```

**Response:**

```json
{
  "access_token": "access-sandbox-xxx",
  "item_id": "xxx",
  "request_id": "xxx"
}
```

Store `access_token` and `item_id` securely in your database. The `access_token` is permanent. **Never expose it on the frontend.**

---

### 2.1 Link Token — Full Required Body

```json
{
  "client_id": "YOUR_CLIENT_ID",
  "secret": "YOUR_SECRET",
  "client_name": "BudgetSmart AI",
  "language": "en",
  "country_codes": ["US", "CA"],
  "products": ["transactions"],
  "transactions": {
    "days_requested": 730
  },
  "user": {
    "client_user_id": "<your_internal_user_id>"
  },
  "webhook": "https://api.budgetsmart.io/webhooks/plaid"
}
```

---

> ### ⚠️ Known Bug Fix: Products Not Registered
>
> **Symptom:** Transactions product shows in `available_products` but not `billed_products` after bank connect.
>
> **Cause:** `"transactions"` was not included in the `products` array when calling `/link/token/create`.
>
> **Fix:** Always include required products in the `products` array of `/link/token/create`. Verify the fix by calling `/item/get` and checking `billed_products` vs `available_products`.

---

## 3. Transactions API

### 3.1 Two Approaches — Use /transactions/sync

| Endpoint | Use Case |
|---|---|
| `/transactions/sync` | **RECOMMENDED.** Cursor-based incremental updates. Use this. |
| `/transactions/get` | Legacy. Date-range polling. Avoid for new integrations. |
| `/transactions/recurring/get` | Detect recurring/subscription transactions. |
| `/transactions/refresh` | Force Plaid to re-fetch from the institution immediately. |

---

### 3.2 /transactions/sync — Correct Implementation

The cursor tracks exactly where you left off. Missing the cursor logic is the #1 cause of empty or incomplete transaction data.

```javascript
// 1. On first call: omit cursor (returns full history)
// 2. Paginate with has_more until false
// 3. Save next_cursor to DB after each full page

let cursor = db.getLatestCursor(itemId) ?? undefined;
let added = [], modified = [], removed = [];
let hasMore = true;

while (hasMore) {
  const response = await plaidClient.transactionsSync({
    access_token: accessToken,
    cursor: cursor,
    count: 500,   // max per page
    options: {
      days_requested: 730,  // only applies if transactions not yet initialized
      include_original_description: true
    }
  });

  added    = added.concat(response.data.added);
  modified = modified.concat(response.data.modified);
  removed  = removed.concat(response.data.removed);
  hasMore  = response.data.has_more;
  cursor   = response.data.next_cursor;
}

// Save AFTER pagination is complete
db.applyUpdates(itemId, added, modified, removed, cursor);
```

---

> ### ⚠️ Critical: Cursor Restart on Pagination Error
>
> If `/transactions/sync` fails **during** pagination (e.g. `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION` error), you **must** restart the **entire** pagination loop from the **first cursor** of that update — not just retry the failed page.
>
> Store the starting cursor before the loop begins, and reset to it on error. Do **not** implement simple retry on the single failed request.

---

### 3.3 Request Fields Reference

| Field | Details |
|---|---|
| `access_token` | **Required.** The token for the linked Item. |
| `cursor` | Omit for first call (returns full history). Pass `next_cursor` on subsequent calls. Max 256 chars base64. |
| `count` | Number of updates per page. Default 100, max 500. |
| `options.days_requested` | **Only applies if transactions not yet initialized.** Min 1, max 730. Default 90. Set to 730 for full history. |
| `options.include_original_description` | Set `true` to get raw bank description alongside Plaid's cleaned name. |
| `options.personal_finance_category_version` | Set to `v2` for new taxonomy (required if enabled Dec 2025+). |
| `options.account_id` | Filter to a single account. Creates a separate cursor stream per `account_id`. |

### 3.4 Response — transactions_update_status

Check this field to understand why transactions may be empty immediately after connection:

| Status Value | Meaning / Action |
|---|---|
| `NOT_READY` | Initial pull not yet started. Wait for `INITIAL_UPDATE` webhook before calling sync. |
| `INITIAL_UPDATE_COMPLETE` | First 90 days fetched. Historical pull still running. Partial data available. |
| `HISTORICAL_UPDATE_COMPLETE` | All requested history is available. Full sync can be performed. |
| `TRANSACTIONS_UPDATE_STATUS_UNKNOWN` | Unable to determine status. Call `/item/get` for more detail. |

---

### 3.5 Known Bug: Empty Transactions After Bank Connect

> **Symptom:** `/transactions/sync` returns empty `added[]` immediately after user connects bank.
>
> **Cause 1 — Too early:** `/transactions/sync` called within seconds of Item creation before Plaid has fetched any data.
> **Fix:** Only call sync **after** receiving the `INITIAL_UPDATE` webhook, or poll `transactions_update_status` until it is not `NOT_READY`.
>
> **Cause 2 — Wrong history window:** Transactions initialized without `days_requested` in `/link/token/create`, defaulting to 90 days.
> **Fix:** Add `transactions.days_requested: 730` to the `/link/token/create` request.
>
> **Cause 3 — Cursor already advanced:** A previous sync call advanced the cursor past the initial data.
> **Fix:** Delete the stored cursor and call sync with no cursor to replay full history. **Warning:** This will re-add all transactions — implement deduplication by `transaction_id`.
>
> **Cause 4 — Transactions product not in products[]:** See Section 2 Known Bug Fix.

---

### 3.6 /transactions/refresh

Forces Plaid to immediately re-fetch data from the institution. Use when users report missing recent transactions.

```
POST /transactions/refresh
Body: { "access_token": "..." }
```

**Response:** HTTP 200 with empty body. Triggers async fetch — listen for `SYNC_UPDATES_AVAILABLE` webhook.

> **Rate limit:** Do not call more than once per hour per Item.

---

## 4. Items API

### 4.1 What is an Item?

An Item is a login at a financial institution. Every user's bank connection = one Item. Items have a unique `item_id` and are accessed via their `access_token`.

---

### 4.2 /item/get — Diagnosing Item State

Call this to understand the current state of any Item. Invaluable for debugging.

```
POST /item/get
Body: { "access_token": "..." }
```

#### Key Response Fields to Check

| Field | What It Tells You |
|---|---|
| `item.error` | Non-null if the Item is in an error state (e.g. `ITEM_LOGIN_REQUIRED`). Always check this first. |
| `item.billed_products` | Products initialized and billed. `transactions` **must** appear here for sync to work. |
| `item.available_products` | Products available but **not yet initialized**. If `transactions` is here, it was not declared at link creation. |
| `item.products` | All products added to the Item (superset of `billed_products` before first API call). |
| `item.webhook` | The webhook URL registered for this Item. Verify this matches your endpoint. |
| `status.transactions.last_successful_update` | Timestamp of last successful transaction fetch. Use to diagnose staleness. |
| `status.transactions.last_failed_update` | Timestamp of last failed fetch. Indicates institution connectivity issues. |
| `item.update_type` | `background` or `user_present_required`. The latter means the user must re-auth. |

---

### 4.3 /item/remove

Permanently removes an Item and stops all billing. Use when a user disconnects their bank.

```
POST /item/remove
Body: { "access_token": "..." }
```

> **Important:** Once an Item is removed, its `access_token` is invalidated immediately. The user must go through Link again to reconnect. You **cannot** update transaction history depth on an existing Item — to get more historical data, remove the Item and have the user reconnect with `days_requested: 730` in the new link token.

---

### 4.4 /item/webhook/update

Updates the webhook URL for an existing Item without requiring user re-auth.

```
POST /item/webhook/update
Body: { "access_token": "...", "webhook": "https://api.budgetsmart.io/webhooks/plaid" }
```

---

## 5. Webhooks

### 5.1 Configuration

Webhook URL is set in the `webhook` field of `/link/token/create`. It can be updated per-Item via `/item/webhook/update`.

Plaid sends POST requests with raw JSON from these IP addresses — whitelist these on your server:

```
52.21.26.131
52.21.47.157
52.41.247.19
52.88.82.239
```

> Note: These IPs are subject to change. Do not rely solely on IP filtering.

---

### 5.2 Transactions Webhooks — Full Reference

| Webhook Type | When It Fires / What To Do |
|---|---|
| `SYNC_UPDATES_AVAILABLE` | New transaction data is available. Call `/transactions/sync` immediately. **This is your primary trigger.** |
| `INITIAL_UPDATE` | First batch of transactions ready (~1–3 min after Item creation). Perform first sync here. |
| `HISTORICAL_UPDATE` | All historical data (up to `days_requested`) is now available. Perform a full sync. |
| `DEFAULT_UPDATE` | Routine new transactions available (fires 1–4x/day). Call `/transactions/sync`. |
| `TRANSACTIONS_REMOVED` | Transactions were deleted at the institution level. Remove them from your DB using the `removed_transactions` array. |
| `RECURRING_TRANSACTIONS_UPDATE` | New recurring transaction patterns detected. Call `/transactions/recurring/get`. |

---

### 5.3 Item Webhooks — Full Reference

| Webhook Type | Action Required |
|---|---|
| `ERROR` | Item entered error state. Check `error.error_code`. If `ITEM_LOGIN_REQUIRED`, send user through Link update mode. |
| `LOGIN_REPAIRED` | Item self-healed from `ITEM_LOGIN_REQUIRED`. Resume normal syncing. |
| `NEW_ACCOUNTS_AVAILABLE` | User added a new account at institution. Optionally prompt user to connect new accounts. |
| `PENDING_DISCONNECT` | Item access about to expire (US/CA). Notify user to re-authenticate before expiry. |
| `USER_PERMISSION_REVOKED` | User revoked access via institution. Remove Item from DB and notify user. |
| `USER_ACCOUNT_REVOKED` | User revoked access to a specific account. Update account list accordingly. |
| `WEBHOOK_UPDATE_ACKNOWLEDGED` | Confirmation that webhook URL update was received. No action needed. |

---

### 5.4 Webhook Best Practices

> **Production Requirements for BudgetSmart AI:**
>
> 1. **Respond with HTTP 200 within 10 seconds.** Do not do heavy work in the handler.
>    Correct pattern: write webhook payload to a queue (e.g. Railway job queue), return 200 immediately, process in background worker.
>
> 2. **Implement idempotency.** The same webhook may fire multiple times. Use `item_id` + `webhook_type` + timestamp as a deduplication key.
>
> 3. **Do not rely on webhook ordering.** Process each webhook independently.
>
> 4. **Plaid retries for up to 24 hours** on non-200 responses, starting at 30s, 4x longer each retry. Retries stop if >90% of recent webhooks were rejected.
>
> 5. **Verify webhook signatures** using Plaid's JWT verification: https://plaid.com/docs/api/webhooks/webhook-verification/

---

### 5.5 Webhook Payload Structure

All Plaid webhooks include these base fields:

```json
{
  "webhook_type": "TRANSACTIONS",
  "webhook_code": "SYNC_UPDATES_AVAILABLE",
  "item_id": "<item_id>",
  "error": null
}
```

`SYNC_UPDATES_AVAILABLE` also includes:
- `initial_update_complete` (boolean)
- `historical_update_complete` (boolean)

---

## 6. Error Handling Reference

### 6.1 Error Response Structure

```json
{
  "error_type": "ITEM_ERROR",
  "error_code": "ITEM_LOGIN_REQUIRED",
  "error_message": "the login details of this item have changed...",
  "display_message": "We weren't able to access your account...",
  "request_id": "abc123xyz"
}
```

Always use `error_code` for programmatic handling — not HTTP status codes or `error_message`.

---

### 6.2 Critical Error Codes for Transactions

| Error Code | Cause & Fix |
|---|---|
| `ITEM_LOGIN_REQUIRED` | User's bank credentials changed or session expired. Send user through Link update mode to re-auth. |
| `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION` | Data changed while paginating. Restart full pagination loop from first cursor — do **not** retry single page. |
| `PRODUCT_NOT_READY` | Transactions requested before initial pull complete. Wait for `INITIAL_UPDATE` webhook then retry. |
| `NO_ACCOUNTS` | No compatible accounts found. May be account type filter mismatch in `/link/token/create`. |
| `INVALID_ACCESS_TOKEN` | Token is invalid or Item was removed. Check if Item was deleted; if so, re-link user. |
| `RATE_LIMIT_EXCEEDED` | Too many requests. Implement exponential backoff. `/transactions/refresh` max 1x/hour/Item. |
| `INSTITUTION_ERROR` | Plaid cannot connect to institution. Temporary. Retry with backoff; check status.plaid.com. |
| `OAUTH_INVALID_TOKEN` | OAuth connection invalidated by institution. User must re-authorize via Link update mode. |

---

### 6.3 Link Update Mode — Re-authenticating an Item

When an Item enters `ITEM_LOGIN_REQUIRED`, do **not** create a new Item. Use update mode to preserve the existing `item_id` and `access_token`:

```json
POST /link/token/create
{
  "client_id": "YOUR_CLIENT_ID",
  "secret": "YOUR_SECRET",
  "access_token": "<existing_access_token>",
  "user": { "client_user_id": "..." },
  "client_name": "BudgetSmart AI",
  "language": "en",
  "country_codes": ["US", "CA"]
}
```

> Do **not** include the `products` array in update mode.

Pass the resulting `link_token` to Link on the frontend. The user re-authenticates, and the same `access_token` continues to work.

---

## 7. BudgetSmart AI — Implementation Checklist

### 7.1 Link Token Creation

- [ ] Include `"transactions"` in the `products` array
- [ ] Include `transactions.days_requested: 730` for maximum history
- [ ] Include `webhook` URL pointing to your Plaid webhook endpoint
- [ ] Include `country_codes: ["US", "CA"]` for Canadian users
- [ ] Use internal user ID (not email/PII) for `user.client_user_id`

### 7.2 Token Exchange

- [ ] Exchange `public_token` to `access_token` within 30 minutes of user completing Link
- [ ] Store `access_token` and `item_id` securely (encrypted at rest)
- [ ] Never log or expose `access_token` on the frontend or in browser console

### 7.3 Transaction Sync

- [ ] Do **not** call `/transactions/sync` immediately after Item creation — wait for `INITIAL_UPDATE` webhook
- [ ] Implement full cursor pagination loop (`while has_more`)
- [ ] Store `next_cursor` in DB after each complete pagination loop
- [ ] On `TRANSACTIONS_SYNC_MUTATION` error: restart from first cursor, not just retry failed page
- [ ] Implement transaction deduplication by `transaction_id` in DB
- [ ] Handle `TRANSACTIONS_REMOVED` webhook: delete removed transaction IDs from DB

### 7.4 Webhook Handler

- [ ] Webhook endpoint responds HTTP 200 within 10 seconds
- [ ] Process webhooks asynchronously (queue-based, not inline)
- [ ] Implement idempotency — skip already-processed webhooks
- [ ] Handle all 6 transaction webhook types + all 7 item webhook types
- [ ] Log webhook payload with `item_id` and `request_id` for debugging

### 7.5 Diagnostics

- [ ] Call `/item/get` when debugging — always check `billed_products`, `available_products`, `item.error`
- [ ] Log `request_id` from every Plaid API response
- [ ] Check status.plaid.com before escalating institution errors to Plaid support

---

## 8. Sandbox Testing

### 8.1 Test Credentials

Use these credentials in the Link UI when testing in Sandbox:

| Field | Value |
|---|---|
| Username | `user_good` |
| Password | `pass_good` |
| MFA Code (if prompted) | `1234` |

---

### 8.2 Useful Sandbox Endpoints

| Endpoint | What It Does |
|---|---|
| `/sandbox/public_token/create` | Create a test Item without going through Link UI. Specify `institution_id` and `initial_products`. |
| `/sandbox/item/fire_webhook` | Manually fire any webhook (`SYNC_UPDATES_AVAILABLE`, `INITIAL_UPDATE`, etc.) for testing. |
| `/sandbox/item/reset_login` | Force Item into `ITEM_LOGIN_REQUIRED` error state to test re-auth flow. |
| `/sandbox/transactions/create` | Create custom transactions on a sandbox Item for edge-case testing. |

---

### 8.3 Simulating the Full Transaction Flow in Sandbox

1. Create public token: `POST /sandbox/public_token/create` with `institution_id: ins_109508` and `initial_products: ["transactions"]`
2. Exchange for `access_token` via `/item/public_token/exchange`
3. Fire `INITIAL_UPDATE` webhook: `POST /sandbox/item/fire_webhook` with `webhook_code: INITIAL_UPDATE`
4. Call `/transactions/sync` with no cursor — should return transactions
5. Fire `SYNC_UPDATES_AVAILABLE` — call sync again with stored cursor — should return empty or incremental

---

### 8.4 Sandbox Institution IDs

| Institution | institution_id |
|---|---|
| Chase | `ins_56` |
| Bank of America | `ins_127989` |
| Wells Fargo | `ins_127991` |
| TD Canada Trust | `ins_116927` |
| RBC Royal Bank | `ins_116928` |
| OAuth Sandbox (testing OAuth) | `ins_127287` |

---

## 9. Quick Reference: Endpoint Summary

| Endpoint | Primary Use |
|---|---|
| `/link/token/create` | Generate token to initialize Plaid Link for user |
| `/item/public_token/exchange` | Exchange `public_token` (from Link) for `access_token` |
| `/item/get` | Inspect Item status, products, errors, last update timestamps |
| `/item/remove` | Permanently delete an Item and stop billing |
| `/item/webhook/update` | Change webhook URL for an existing Item |
| `/transactions/sync` | Get all transactions + incremental updates via cursor |
| `/transactions/get` | Legacy: date-range transaction fetch (avoid for new code) |
| `/transactions/refresh` | Force immediate re-fetch from institution (max 1x/hour) |
| `/transactions/recurring/get` | Get recurring/subscription transaction streams |
| `/sandbox/item/fire_webhook` | Trigger any webhook manually in Sandbox |
| `/sandbox/public_token/create` | Create test Item in Sandbox without Link UI |

---

## 10. Support & Resources

| Resource | URL |
|---|---|
| Plaid API Status | https://status.plaid.com |
| Plaid Dashboard (Logs) | https://dashboard.plaid.com/activity/logs |
| Item Debugger Tool | https://dashboard.plaid.com/activity/items |
| Transactions Docs | https://plaid.com/docs/transactions/ |
| Webhook Verification | https://plaid.com/docs/api/webhooks/webhook-verification/ |
| OpenAPI Spec | https://github.com/plaid/plaid-openapi |
| Postman Collection | https://github.com/plaid/plaid-postman |
| Plaid Pattern (sample app) | https://github.com/plaid/pattern |
| Plaid Discord Community | https://discord.gg/sf57M8DW3y |

---

> When contacting Plaid support, always include: the `request_id` from the failed response, the `item_id`, your `client_id`, approximate timestamp, and the full error response body.

---

*BudgetSmart AI | Plaid API Integration Reference | March 2026 | Confidential*
