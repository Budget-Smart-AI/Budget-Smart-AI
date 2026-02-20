# BudgetPal - Personal Budgeting & Bill Reminder App

## Overview
A personal budgeting web application that helps track recurring bills and manual expenses, with email alerts sent one day before bill payments are due via Postmark SMTP. Includes secure authentication with MFA support for Plaid integration.

**Domain**: budgetsmart.io

## Tech Stack
- **Frontend**: React + TypeScript, TanStack Query, Wouter routing, Shadcn UI components
- **Backend**: Express.js with in-memory storage, session-based authentication
- **Styling**: Tailwind CSS with custom teal-themed design tokens
- **Email**: Nodemailer with Postmark SMTP for bill reminders and contact form
- **Security**: bcrypt password hashing, TOTP-based MFA, express-session

## Project Structure
```
client/src/
  ├── App.tsx           # Main app with routing, auth, and layout
  ├── components/       # Reusable components
  │   ├── app-sidebar.tsx
  │   ├── theme-provider.tsx
  │   ├── theme-toggle.tsx
  │   └── ui/           # Shadcn UI components
  ├── pages/
  │   ├── dashboard.tsx    # Financial overview with stats
  │   ├── bills.tsx        # Recurring bills CRUD
  │   ├── expenses.tsx     # One-time expenses CRUD
  │   ├── settings.tsx     # Account and MFA settings
  │   ├── login.tsx        # Login page with MFA support
  │   ├── privacy.tsx      # Privacy Policy (public)
  │   ├── terms.tsx        # Terms of Service (public)
  │   ├── contact.tsx      # Contact form (public)
  │   └── data-retention.tsx # Data Retention Policy (public)
  └── lib/              # Utilities
server/
  ├── routes.ts         # API endpoints (bills, expenses, auth, contact)
  ├── storage.ts        # In-memory data storage
  ├── email.ts          # Postmark email scheduler
  ├── auth.ts           # Authentication and MFA utilities
  └── index.ts          # Express server with session middleware
shared/
  └── schema.ts         # Data models and Zod schemas
```

## Features
1. **Dashboard**: Monthly totals for bills and expenses, upcoming payments list
2. **Bills Manager**: Add/edit/delete recurring bills with category, due day, recurrence
3. **Expenses Tracker**: Add/edit/delete one-time purchases with month filtering
4. **CSV Import**: Bulk import bills and expenses from CSV files with downloadable templates
5. **Email Alerts**: Automatic daily check sends reminders 1 day before bills are due
6. **User Registration**: New users can create accounts with name, email, username, password
7. **User Profile**: Editable profile with first name, last name, email, phone in Settings
8. **Secure Login**: Username/password authentication with session management
9. **MFA Support**: TOTP-based two-factor authentication (Google Authenticator compatible)
10. **Admin Users**: Admin users can manage other users via the Users page
11. **Legal Pages**: Privacy Policy, Terms of Service, Contact form, Data Retention Policy
12. **Bank Accounts**: Connect bank accounts via MX (US/Canada) or Plaid (UK and other countries) with geo-based provider selection
13. **Account Toggle**: Disable individual bank accounts to prevent double-counting (e.g., shared mortgage accounts)
14. **AI Assistant**: Chat with an AI financial advisor powered by OpenAI for personalized insights and advice
15. **Email Settings**: Customizable notification preferences per user (bill reminders, budget alerts, digests)
16. **Custom Categories**: User-defined expense categories with color coding
17. **Subscriptions**: Track recurring expenses/subscriptions separate from one-time expenses
18. **Budget Alerts**: Automatic notifications when spending reaches 80% or exceeds budget limits
19. **Data Export**: Export all personal data as CSV or JSON
20. **Auto-Sync Scheduling**: Configure automatic bank account sync times
21. **AI Auto-Reconciliation**: Pattern-based transaction categorization that learns from user behavior
22. **In-App Notifications**: Real-time notification center for alerts (budget warnings, sync status, system messages)
23. **Rate Limiting**: Security protection on authentication and sensitive API endpoints
24. **Multi-User Data Isolation**: Bills and expenses are scoped per-user with userId filtering in all storage operations
25. **Demo Account**: Try Demo button on landing page allows exploring the app with sample data in read-only mode
26. **Money Timeline**: 90-day cash flow forecast with danger day detection and emotional urgency messaging
27. **What-If Simulator**: Financial sandbox for scenario testing (cancel subscription, extra debt payment, new income)
28. **Silent Money Leaks Detector**: AI-powered detection of recurring small charges and price increases
29. **Financial Autopilot**: Spendability meter showing safe daily spending allowance with bills awareness
30. **Payday Optimizer**: Optimal bill payment timing recommendations to maximize cash flow
31. **AI Money Coach**: Proactive daily briefings with financial warnings and personalized insights
32. **Trial Conversion Flow**: Day 3/7/10/12 engagement system tracking value-realized metrics

## API Endpoints

### Bills & Expenses
- `GET/POST /api/bills` - List/create bills
- `GET /api/bills/template` - Download CSV template for bills import
- `POST /api/bills/import` - Import bills from CSV data
- `GET/PATCH/DELETE /api/bills/:id` - Get/update/delete bill
- `GET/POST /api/expenses` - List/create expenses
- `GET /api/expenses/template` - Download CSV template for expenses import
- `POST /api/expenses/import` - Import expenses from CSV data
- `GET/PATCH/DELETE /api/expenses/:id` - Get/update/delete expense
- `POST /api/check-reminders` - Manually trigger email check

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/demo-login` - Login as demo user (read-only)
- `POST /api/auth/verify-mfa` - Verify MFA code
- `POST /api/auth/logout` - Logout
- `GET /api/auth/session` - Check authentication status and get profile (includes isDemo flag)
- `PATCH /api/auth/profile` - Update user profile (requires auth)
- `GET /api/auth/mfa/setup` - Get MFA setup QR code (requires auth)
- `POST /api/auth/mfa/enable` - Enable MFA (requires auth)
- `POST /api/auth/mfa/disable` - Disable MFA (requires auth)

### Contact
- `POST /api/contact` - Send contact form email to info@budgetpal.sbs

## Environment Variables (Secrets)
- `SESSION_SECRET` - Session encryption key
- `USER_PASSWORD` - Password for admin user "mahabir" (bcrypt hashed on startup)
- `POSTMARK_SERVER` - SMTP server hostname
- `POSTMARK_PORT` - SMTP port (typically 587)
- `POSTMARK_USERNAME` - SMTP username
- `POSTMARK_PASSWORD` - SMTP password
- `ALERT_EMAIL_FROM` - Sender email address
- `ALERT_EMAIL_TO` - Recipient email address for bill reminders

## Authentication
- **Default Admin**: mahabir (created on startup, password via `USER_PASSWORD` secret, defaults to 'changeme123')
- **Demo Account**: username "demo" with pre-populated sample bills/expenses, read-only mode (all write operations blocked)
- **User Registration**: New users can sign up via the login page, accounts require admin approval
- **Account Approval**: New accounts are created with pending status; admin must approve before user can log in
- **Sessions**: 24-hour expiration, HTTP-only cookies
- **MFA**: Optional TOTP-based, configure in Settings page
- **Admin Access**: Admin users see "Users" menu to manage all users and approve pending accounts

## Running the App
The workflow `Start application` runs `npm run dev` which starts both the Express backend and Vite frontend on port 5000.

## Design System
- Primary color: Teal (173 58% 39%)
- Clean, professional financial app aesthetic
- Light/dark mode support
- Sidebar navigation layout

## Security & Encryption
See `SECURITY.md` for detailed encryption and security documentation required for Plaid integration.
