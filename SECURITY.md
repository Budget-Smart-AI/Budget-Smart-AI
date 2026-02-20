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
   - Never commit secrets to version control
   - Rotate secrets periodically

2. **Infrastructure**:
   - Deploy behind HTTPS load balancer
   - Enable HSTS headers
   - Configure CSP headers
   - Enable audit logging

3. **Monitoring**:
   - Log authentication attempts
   - Alert on unusual access patterns
   - Regular security audits

## 7. Contact

For security concerns or to report vulnerabilities:
- Email: info@budgetpal.sbs
- Response time: Within 24 hours for security issues
