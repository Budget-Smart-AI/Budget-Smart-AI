# BudgetPal Security & Encryption Documentation

This document describes the security measures and encryption protocols implemented in BudgetPal, specifically for Plaid integration compliance.

## 1. Data Encryption

### 1.1 Encryption in Transit (TLS)

All data transmitted between the application and external services uses industry-standard TLS (Transport Layer Security) encryption:

- **HTTPS Protocol**: All client-server communication is encrypted using TLS 1.2/1.3
- **Plaid API Communication**: All requests to Plaid's API are made over HTTPS
- **Email Communication**: SMTP connections to Postmark use STARTTLS encryption on port 587

**How it works:**
```
Browser <--HTTPS/TLS--> BudgetPal Server <--HTTPS/TLS--> Plaid API
                                         <--STARTTLS---> Postmark SMTP
```

### 1.2 Encryption at Rest

Sensitive data stored in the application is protected:

- **Password Storage**: User passwords are hashed using bcrypt with a salt factor of 12
  - Passwords are never stored in plaintext
  - Each password has a unique salt
  - Bcrypt is computationally expensive, making brute-force attacks impractical

- **MFA Secrets**: TOTP secrets are stored encrypted and only accessible after authentication

- **Session Data**: Session tokens are signed with SESSION_SECRET and use HTTP-only cookies

### 1.3 Plaid Security Model

BudgetPal follows Plaid's security best practices:

1. **No Credential Storage**: Bank login credentials are never stored on BudgetPal servers
   - Users authenticate directly with Plaid Link
   - BudgetPal receives only access tokens, not credentials

2. **Token-Based Access**: 
   - Plaid provides an `access_token` for each connected account
   - Tokens can be revoked at any time
   - Tokens provide read-only access to account data

3. **Data Minimization**:
   - Only necessary data (balances, transactions) is retrieved
   - Raw bank credentials are handled entirely by Plaid

## 2. Authentication Security

### 2.1 Password Security

- **Hashing Algorithm**: bcrypt with 12 rounds
- **Minimum Complexity**: Enforced at application level
- **No Password Recovery by Admin**: Passwords cannot be retrieved or decrypted

### 2.2 Multi-Factor Authentication (MFA)

BudgetPal implements TOTP-based MFA compatible with:
- Google Authenticator
- Authy
- Microsoft Authenticator
- Any TOTP-compliant app

**TOTP Implementation:**
- Algorithm: SHA-1 (per RFC 6238)
- Token length: 6 digits
- Time step: 30 seconds
- Secret length: 160 bits (base32 encoded)

### 2.3 Session Management

- **Session Duration**: 24 hours maximum
- **Cookie Attributes**:
  - `httpOnly: true` - Prevents JavaScript access
  - `secure: true` (production) - HTTPS only
  - `sameSite: lax` - CSRF protection
- **Session Invalidation**: Logout destroys server-side session

## 3. API Security

### 3.1 Input Validation

All API inputs are validated using Zod schemas:
- Type checking
- Length limits
- Format validation
- SQL injection prevention

### 3.2 Protected Routes

Routes requiring authentication check:
1. Valid session exists
2. MFA verified (if enabled)
3. Session not expired

### 3.3 Rate Limiting Recommendations

For production deployment, implement:
- Login attempt limiting (5 attempts per 15 minutes)
- API rate limiting per authenticated user
- CAPTCHA for repeated failed attempts

## 4. Plaid Integration Security

### 4.1 Data Flow

```
1. User clicks "Connect Bank Account"
2. Plaid Link opens in secure iframe
3. User authenticates with bank (credentials go directly to Plaid)
4. Plaid returns public_token to BudgetPal
5. BudgetPal exchanges public_token for access_token via secure API
6. access_token stored securely for future data retrieval
```

### 4.2 What BudgetPal Receives from Plaid

- Account balances (read-only)
- Transaction history (read-only)
- Account metadata (name, type, mask)

### 4.3 What BudgetPal Never Receives

- Bank login credentials
- Full account numbers
- Routing numbers
- Security questions/answers

## 5. Compliance

### 5.1 Privacy Regulations

BudgetPal's data handling complies with:
- **PIPEDA** (Canada)
- **GDPR** (European users)
- **CCPA** (California residents)

### 5.2 Data Retention

Per our Data Retention Policy:
- User data retained while account is active
- 30-day deletion window after account termination
- Automatic session expiration after 24 hours
- Transaction data: 90-day rolling window

### 5.3 User Rights

Users can:
- Export their data
- Request account deletion
- Disconnect bank accounts at any time
- Disable MFA if needed

## 6. Security Recommendations for Production

1. **Environment Variables**:
   - Use strong, random values for SESSION_SECRET
   - **Never commit secrets to version control** — use Railway environment variables and GitHub Actions secrets instead
   - Rotate secrets periodically, and immediately if they are ever accidentally exposed

2. **Secrets Management — Correct Architecture**:
   - **Railway** is the authoritative store for all runtime secrets (database URLs, API keys, etc.)
     - Set them in the Railway dashboard: _Project → Variables_
     - Railway encrypts variables at rest and injects them into containers at runtime
   - **GitHub Actions secrets** hold the same values so that the `setup.yml` workflow can push them into Railway programmatically
     - Navigate to _Repository → Settings → Secrets and variables → Actions → New repository secret_
     - **GitHub Actions secrets are NOT the same as Railway variables** — they must be kept in sync manually
     - If they drift (e.g. a secret is rotated in Railway but not updated in GitHub Actions), the next `setup.yml` run will overwrite Railway with the stale value; always update both at the same time
     - **Recommended rotation workflow**: (1) generate new credential, (2) update GitHub Actions secret, (3) update Railway dashboard variable, (4) re-deploy
   - All CI/CD workflows reference secrets via `${{ secrets.VAR_NAME }}` — never hardcoded values
   - See `.env.example` for the complete list of required variable names

3. **AWS KMS Encryption at Rest**:
   - Plaid `access_token` values are encrypted with AWS KMS before being written to the database
   - To activate: set `AWS_KMS_KEY_ID`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` in Railway
   - Verify encryption is active: `GET /api/kms/status` (admin-only endpoint)
   - The KMS key ARN and AWS account ID must never be hardcoded in source files

4. **Infrastructure**:
   - Deploy behind HTTPS load balancer
   - Enable HSTS headers
   - Configure CSP headers
   - Enable audit logging

5. **Monitoring**:
   - Log authentication attempts
   - Alert on unusual access patterns
   - Regular security audits

## 7. SOC 2 & NIST Compliance — Secrets Management

BudgetSmart AI is designed to meet SOC 2 Type II and NIST SP 800-53 / NIST CSF requirements for credential and secret management.

### Relevant NIST Controls

| Control | Requirement | Implementation |
|---------|-------------|----------------|
| IA-5 | Authenticator Management — no default passwords | `ADMIN_USERNAME` / `USER_PASSWORD` / `DEMO_PASSWORD` are **required** env vars; the application refuses to create accounts if they are absent |
| SC-28 | Protection of Information at Rest | Plaid access tokens encrypted with AWS KMS before DB storage; passwords hashed with bcrypt (12 rounds) |
| SC-8 | Transmission Confidentiality | All traffic over TLS 1.2/1.3; HTTPS enforced |
| SA-3 / CM-3 | Secrets in source code | Zero hardcoded credentials; all secrets injected at runtime via Railway env vars |
| AU-2 | Audit Events | Authentication attempts logged; KMS operations logged via AWS CloudTrail |
| AC-2 | Account Management | Admin accounts only created when explicit credentials are set; no default/fallback passwords |

### SOC 2 Trust Service Criteria

| Criteria | How it is met |
|----------|---------------|
| CC6.1 — Logical access controls | Credentials stored exclusively in Railway (encrypted at rest); never in source code or build artifacts |
| CC6.2 — Credential management | No shared/default passwords; each credential is unique and rotated on a defined schedule |
| CC6.3 — Access removal | Railway variables can be instantly revoked; AWS IAM policies enforce least-privilege KMS access |
| CC7.2 — System monitoring | Missing credentials log clear errors at startup; `GET /api/kms/status` provides real-time encryption verification |
| CC9.2 — Vendor risk management | Third-party credentials (Plaid, Stripe, OpenAI, etc.) are each isolated in their own env var with no cross-service defaults |

### Credential Inventory

All credentials are documented in `.env.example` with placeholder values. The following categories must each be set in Railway:

- **Database**: `DATABASE_URL`
- **Session**: `SESSION_SECRET`
- **Admin account**: `ADMIN_USERNAME`, `USER_PASSWORD`, `DEMO_PASSWORD`
- **Banking**: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `MX_CLIENT_ID`, `MX_API_KEY`
- **Payments**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- **AI services**: `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- **Email**: `POSTMARK_USERNAME`, `POSTMARK_PASSWORD`
- **OAuth**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
- **Storage**: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET_NAME`
- **Encryption**: `AWS_KMS_KEY_ID`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

### Prohibited Practices

The following are strictly prohibited and enforced by code and `.gitignore` rules:
- Hardcoding any credential value in source files
- Using predictable default passwords (e.g. `changeme`, `demo123`, `admin`)
- Committing `.env` files, `SESSION_SECRET.txt`, or any file containing real credentials
- Using the same credential across multiple environments (prod / staging / dev)

## 8. Contact

For security concerns or to report vulnerabilities:
- Email: info@budgetpal.sbs
- Response time: Within 24 hours for security issues
