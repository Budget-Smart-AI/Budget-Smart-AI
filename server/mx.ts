/**
 * MX Platform Integration — Official SDK v3
 *
 * Migrated from custom Axios client to the official mx-platform-node SDK.
 * This provides type safety, access to the latest API endpoints (v20250224),
 * and support for enhanced transaction enrichment.
 *
 * Key capabilities:
 * - User, Member, Account, Transaction CRUD
 * - Connect widget URL generation
 * - Merchant enrichment (logos, clean names, websites)
 * - Enhanced transaction data (recurring detection, geolocation)
 * - Institution lookup
 */

import {
  Configuration as MxConfiguration,
  UsersApi,
  MembersApi,
  AccountsApi,
  TransactionsApi,
  MerchantsApi,
  InstitutionsApi,
  WidgetsApi,
} from "mx-platform-node";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { mxMembers, plaidTransactions, users } from "@shared/schema";
import * as crypto from "crypto";
// §6.2.6 dual-write: resolve canonical_category_id inline during MX sync so
// new MX rows carry the shadow column from day one. Sync-only (no Bedrock).
import { resolveCanonicalCategorySync } from "./migrations/category-unification/resolver";

// ─── SDK Configuration ──────────────────────────────────────────────────────

const MX_CLIENT_ID = process.env.MX_CLIENT_ID;
const MX_API_KEY = process.env.MX_API_KEY;

if (!MX_CLIENT_ID || !MX_API_KEY) {
  console.warn("[MX] Warning: MX_CLIENT_ID or MX_API_KEY not set. MX integration will not work.");
}

const isProduction = process.env.NODE_ENV === "production";
const MX_API_BASE_URL = process.env.MX_API_BASE_URL ||
  (isProduction ? "https://api.mx.com" : "https://int-api.mx.com");

console.log(`[MX] Using API base URL: ${MX_API_BASE_URL} (NODE_ENV=${process.env.NODE_ENV || "not set"})`);

// Initialize the MX Platform API clients (one per domain)
const mxConfiguration = new MxConfiguration({
  basePath: MX_API_BASE_URL,
  username: MX_CLIENT_ID || "",
  password: MX_API_KEY || "",
  baseOptions: {
    headers: {
      "Accept": "application/vnd.mx.api.v1+json",
    },
  },
});

// MX API version — must be passed as first arg to every SDK method
const MX_API_VERSION = "v20250224";

const usersApi = new UsersApi(mxConfiguration);
const membersApi = new MembersApi(mxConfiguration);
const accountsApi = new AccountsApi(mxConfiguration);
const transactionsApi = new TransactionsApi(mxConfiguration);
const merchantsApi = new MerchantsApi(mxConfiguration);
const institutionsApi = new InstitutionsApi(mxConfiguration);
const widgetsApi = new WidgetsApi(mxConfiguration);

// ─── Legacy Axios client (kept for backward compat with routes that import it) ─
import axios, { AxiosInstance, AxiosError } from "axios";
const mxClient: AxiosInstance = axios.create({
  baseURL: MX_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/vnd.mx.api.v1+json",
  },
  auth: {
    username: MX_CLIENT_ID || "",
    password: MX_API_KEY || "",
  },
});

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MXUser {
  guid: string;
  id?: string;
  email?: string;
  is_disabled?: boolean;
  metadata?: string;
}

export interface MXMember {
  guid: string;
  user_guid: string;
  institution_code: string;
  name?: string;
  connection_status: string;
  is_being_aggregated: boolean;
  is_oauth: boolean;
  successfully_aggregated_at?: string;
  aggregated_at?: string;
}

export interface MXAccount {
  guid: string;
  member_guid: string;
  user_guid: string;
  institution_code: string;
  name: string;
  type: string;
  subtype?: string;
  balance: number;
  available_balance?: number;
  credit_limit?: number;
  apr?: number;
  apy?: number;
  minimum_payment?: number;
  payment_due_at?: string;
  original_balance?: number;
  interest_rate?: number;
  currency_code: string;
  is_closed: boolean;
  is_hidden: boolean;
  account_number?: string;
  routing_number?: string;
  last_payment?: number;
  last_payment_at?: string;
  started_on?: string;
  day_payment_is_due?: number;
}

export interface MXTransaction {
  guid: string;
  account_guid: string;
  member_guid: string;
  user_guid: string;
  amount: number;
  date: string;
  created_at: string;
  updated_at: string;
  description: string;
  original_description: string;
  merchant_guid?: string;
  merchant_category_code?: number;
  category: string;
  top_level_category: string;
  type: string;
  status: string;
  is_bill_pay: boolean;
  is_direct_deposit: boolean;
  is_expense: boolean;
  is_fee: boolean;
  is_income: boolean;
  is_international: boolean;
  is_overdraft_fee: boolean;
  is_payroll_advance: boolean;
  is_recurring: boolean;
  is_subscription: boolean;
  memo?: string;
  check_number_string?: string;
  transacted_at: string;
  posted_at?: string;
  latitude?: number;
  longitude?: number;
  extended_transaction_type?: string;
}

export interface MXMerchant {
  guid: string;
  name: string;
  logo_url?: string;
  website_url?: string;
}

export interface MXInstitution {
  code: string;
  name: string;
  url?: string;
  small_logo_url?: string;
  medium_logo_url?: string;
}

export interface MXWidgetRequest {
  widget_url: {
    type: string;
    url: string;
  };
}

// ─── Merchant Cache ─────────────────────────────────────────────────────────
// In-memory cache to avoid re-fetching merchant data for every transaction
const merchantCache = new Map<string, MXMerchant | null>();
const MERCHANT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const merchantCacheTimestamps = new Map<string, number>();

// ─── User Management ────────────────────────────────────────────────────────

export async function createMXUser(userId: string, email?: string): Promise<MXUser> {
  try {
    console.log(`[MX] Creating user: ${userId}`);
    const response = await usersApi.createUser(MX_API_VERSION, {
      user: {
        id: userId,
        email: email,
        metadata: JSON.stringify({ app_user_id: userId }),
      },
    });
    console.log(`[MX] Created user GUID: ${response.data.user?.guid}`);
    return response.data.user as any;
  } catch (error: any) {
    console.error("[MX] Error creating user:", error?.response?.data || error.message);
    throw error;
  }
}

export async function getMXUser(userGuid: string): Promise<MXUser | null> {
  try {
    const response = await usersApi.readUser(MX_API_VERSION, userGuid);
    return response.data.user as any;
  } catch (error: any) {
    if (error?.response?.status === 404) return null;
    console.error("[MX] Error getting user:", error?.response?.data || error.message);
    throw error;
  }
}

export async function deleteMXUser(userGuid: string): Promise<void> {
  await usersApi.deleteUser(MX_API_VERSION, "application/vnd.mx.api.v1+json", userGuid);
}

// ─── Widget URL Generation ──────────────────────────────────────────────────

export async function getConnectWidgetUrl(userGuid: string, currentMemberGuid?: string): Promise<string> {
  try {
    console.log(`[MX] Getting connect widget for user: ${userGuid}`);
    const widgetRequest: any = {
      widget_url: {
        widget_type: "connect_widget",
        is_mobile_webview: false,
        mode: "aggregation",
        ui_message_version: 4,
        include_transactions: true,
        wait_for_full_aggregation: false,
        webhook_url: process.env.MX_WEBHOOK_URL ||
          `${process.env.APP_URL}/api/mx/webhook`,
      },
    };
    if (currentMemberGuid) {
      widgetRequest.widget_url.current_member_guid = currentMemberGuid;
    }
    const response = await widgetsApi.requestWidgetURL(MX_API_VERSION, userGuid, widgetRequest);
    return (response.data as any).widget_url?.url;
  } catch (error: any) {
    console.error("[MX] Error getting widget URL:", error?.response?.data || error.message);
    throw error;
  }
}

// ─── Member Management ──────────────────────────────────────────────────────

export async function listMembers(userGuid: string): Promise<MXMember[]> {
  try {
    const response = await membersApi.listMembers(MX_API_VERSION, userGuid);
    return (response.data as any).members || [];
  } catch (error: any) {
    console.error("[MX] Error listing members:", error?.response?.data || error.message);
    throw error;
  }
}

export async function getMember(userGuid: string, memberGuid: string): Promise<MXMember | null> {
  try {
    const response = await membersApi.readMember(MX_API_VERSION, memberGuid, userGuid);
    return (response.data as any).member;
  } catch (error: any) {
    if (error?.response?.status === 404) return null;
    throw error;
  }
}

export async function getMemberStatus(userGuid: string, memberGuid: string): Promise<any> {
  try {
    const response = await membersApi.readMemberStatus(MX_API_VERSION, memberGuid, userGuid);
    return (response.data as any).member;
  } catch (error: any) {
    console.error("[MX] Error getting member status:", error?.response?.data || error.message);
    throw error;
  }
}

export async function aggregateMember(userGuid: string, memberGuid: string): Promise<MXMember> {
  try {
    const response = await membersApi.aggregateMember(MX_API_VERSION, memberGuid, userGuid);
    return (response.data as any).member;
  } catch (error: any) {
    console.error("[MX] Error aggregating member:", error?.response?.data || error.message);
    throw error;
  }
}

export async function deleteMember(userGuid: string, memberGuid: string): Promise<void> {
  try {
    await membersApi.deleteMember(MX_API_VERSION, memberGuid, userGuid);
  } catch (error: any) {
    console.error("[MX] Error deleting member:", error?.response?.data || error.message);
    throw error;
  }
}

// ─── Account Management ─────────────────────────────────────────────────────

export async function listAccounts(userGuid: string, memberGuid?: string): Promise<MXAccount[]> {
  try {
    if (memberGuid) {
      const response = await accountsApi.listMemberAccounts(MX_API_VERSION, userGuid, memberGuid);
      return (response.data as any).accounts || [];
    }
    const response = await accountsApi.listUserAccounts(MX_API_VERSION, "application/vnd.mx.api.v1+json", userGuid);
    return (response.data as any).accounts || [];
  } catch (error: any) {
    console.error("[MX] Error listing accounts:", error?.response?.data || error.message);
    throw error;
  }
}

export async function getAccount(userGuid: string, accountGuid: string): Promise<MXAccount | null> {
  try {
    const response = await accountsApi.readAccount(MX_API_VERSION, accountGuid, userGuid);
    return (response.data as any).account;
  } catch (error: any) {
    if (error?.response?.status === 404) return null;
    throw error;
  }
}

// ─── Transaction Management ─────────────────────────────────────────────────

export async function listTransactions(
  userGuid: string,
  options?: {
    fromDate?: string;
    toDate?: string;
    page?: number;
    recordsPerPage?: number;
    accountGuid?: string;
  }
): Promise<{ transactions: MXTransaction[]; pagination: any }> {
  try {
    const fromDate = options?.fromDate || (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 3);
      return d.toISOString().split('T')[0];
    })();
    const toDate = options?.toDate;
    const page = options?.page || 1;
    const recordsPerPage = options?.recordsPerPage || 100;

    let response: any;
    if (options?.accountGuid) {
      response = await transactionsApi.listTransactionsByAccount(
        MX_API_VERSION, userGuid, options.accountGuid, page, recordsPerPage, fromDate, toDate
      );
    } else {
      // List all user transactions (not member-scoped)
      response = await transactionsApi.listTransactions(
        MX_API_VERSION, userGuid, page, recordsPerPage, fromDate, toDate
      );
    }

    return {
      transactions: response.data.transactions || [],
      pagination: response.data.pagination,
    };
  } catch (error: any) {
    console.error("[MX] Error listing transactions:", error?.response?.data || error.message);
    // Fallback to legacy Axios for endpoints with different signatures
    try {
      const params: any = {
        records_per_page: options?.recordsPerPage || 100,
        page: options?.page || 1,
      };
      if (options?.fromDate) params.from_date = options.fromDate;
      if (options?.toDate) params.to_date = options.toDate;

      const endpoint = options?.accountGuid
        ? `/users/${userGuid}/accounts/${options.accountGuid}/transactions`
        : `/users/${userGuid}/transactions`;
      const resp = await mxClient.get(endpoint, { params });
      return {
        transactions: resp.data.transactions || [],
        pagination: resp.data.pagination,
      };
    } catch (fallbackErr: any) {
      console.error("[MX] Fallback also failed:", fallbackErr?.response?.data || fallbackErr.message);
      throw error;
    }
  }
}

export async function fetchAllTransactions(
  userGuid: string,
  fromDate?: string
): Promise<MXTransaction[]> {
  const allTransactions: MXTransaction[] = [];
  let page = 1;
  let hasMore = true;

  const startDate = fromDate || (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 3);
    return d.toISOString().split('T')[0];
  })();

  console.log(`[MX] Fetching transactions from ${startDate} (up to 3 years)...`);

  while (hasMore) {
    const { transactions, pagination } = await listTransactions(userGuid, {
      fromDate: startDate,
      page,
      recordsPerPage: 100,
    });

    allTransactions.push(...transactions);

    if (transactions.length < 100 || !pagination?.total_pages || page >= pagination.total_pages) {
      hasMore = false;
    } else {
      page++;
    }

    // Rate limiting — MX allows ~30 req/sec
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`[MX] Fetched ${allTransactions.length} transactions total`);
  return allTransactions;
}

// ─── Merchant Enrichment ────────────────────────────────────────────────────

/**
 * Fetch merchant details from MX (logo, clean name, website).
 * Results are cached in-memory for 24 hours.
 */
export async function getMerchant(merchantGuid: string): Promise<MXMerchant | null> {
  if (!merchantGuid) return null;

  // Check cache
  const cached = merchantCache.get(merchantGuid);
  const cachedAt = merchantCacheTimestamps.get(merchantGuid);
  if (cached !== undefined && cachedAt && Date.now() - cachedAt < MERCHANT_CACHE_TTL) {
    return cached;
  }

  try {
    const response = await merchantsApi.readMerchant(MX_API_VERSION, merchantGuid);
    const merchant = response.data.merchant as any;
    const result: MXMerchant = {
      guid: merchant?.guid || merchantGuid,
      name: merchant?.name || "",
      logo_url: merchant?.logo_url || null,
      website_url: merchant?.website_url || null,
    };
    merchantCache.set(merchantGuid, result);
    merchantCacheTimestamps.set(merchantGuid, Date.now());
    return result;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      merchantCache.set(merchantGuid, null);
      merchantCacheTimestamps.set(merchantGuid, Date.now());
      return null;
    }
    // Don't cache errors — let next call retry
    return null;
  }
}

// ─── Institution Lookup ─────────────────────────────────────────────────────

export async function getInstitution(institutionCode: string): Promise<MXInstitution | null> {
  try {
    const response = await institutionsApi.readInstitution(MX_API_VERSION, institutionCode);
    return (response.data as any).institution;
  } catch (error: any) {
    if (error?.response?.status === 404) return null;
    throw error;
  }
}

export async function searchInstitutions(query: string): Promise<MXInstitution[]> {
  try {
    const response = await institutionsApi.listInstitutions(MX_API_VERSION, query);
    return (response.data as any).institutions || [];
  } catch (error: any) {
    console.error("[MX] Error searching institutions:", error?.response?.data || error.message);
    throw error;
  }
}

// ─── Account Type Mapper ────────────────────────────────────────────────────

export function mapMXAccountType(mxType: string): string {
  const typeMap: Record<string, string> = {
    "CHECKING": "depository",
    "SAVINGS": "depository",
    "CREDIT_CARD": "credit",
    "CREDIT": "credit",
    "LOAN": "loan",
    "MORTGAGE": "loan",
    "LINE_OF_CREDIT": "credit",
    "INVESTMENT": "investment",
    "BROKERAGE": "investment",
    "RETIREMENT": "investment",
    "401K": "investment",
    "IRA": "investment",
    "PROPERTY": "other",
    "VEHICLE": "other",
    "INSURANCE": "other",
    "OTHER": "other",
  };
  return typeMap[mxType.toUpperCase()] || "other";
}

// ─── MX User GUID Helper ───────────────────────────────────────────────────

async function getMXUserGuid(userId: string): Promise<string> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user?.mxUserGuid) {
    throw new Error(`[MX] No mxUserGuid found for user ${userId}`);
  }
  return user.mxUserGuid;
}

// ─── Category Mapper ────────────────────────────────────────────────────────

/**
 * Map MX top_level_category and category to Budget Smart internal categories.
 *
 * MX provides a two-level taxonomy: top_level_category (broad) and category (specific).
 * We first try the specific `category` for precision, then fall back to `top_level_category`.
 */
export function mapMXCategory(
  topLevel: string,
  category: string,
  isIncome: boolean
): string {
  if (isIncome) return 'Salary';

  const specificMap: Record<string, string> = {
    // Food & Dining
    'Restaurants': 'Restaurant & Bars',
    'Fast Food': 'Restaurant & Bars',
    'Coffee Shops': 'Restaurant & Bars',
    'Bars & Pubs': 'Restaurant & Bars',
    'Food Delivery': 'Restaurant & Bars',
    'Groceries': 'Groceries',
    'Alcohol & Bars': 'Restaurant & Bars',

    // Shopping
    'Clothing': 'Clothing',
    'Electronics & Software': 'Shopping',
    'Sporting Goods': 'Shopping',
    'Books': 'Shopping',
    'Home Furnishings': 'Shopping',
    'Office Supplies': 'Shopping',
    'Pet Food & Supplies': 'Shopping',
    'General Merchandise': 'Shopping',

    // Transportation
    'Gas & Fuel': 'Transportation',
    'Parking': 'Transportation',
    'Public Transportation': 'Transportation',
    'Taxi': 'Transportation',
    'Ride Share': 'Transportation',
    'Auto Insurance': 'Insurance',
    'Auto Maintenance': 'Transportation',
    'Auto Payment': 'Loans',

    // Home
    'Mortgage & Rent': 'Housing',
    'Rent': 'Housing',
    'Mortgage': 'Housing',
    'Home Improvement': 'Maintenance',
    'Home Services': 'Maintenance',
    'Home Insurance': 'Insurance',

    // Bills & Utilities
    'Utilities': 'Utilities',
    'Internet': 'Utilities',
    'Phone': 'Utilities',
    'Television': 'Utilities',
    'Mobile Phone': 'Utilities',

    // Health
    'Doctor': 'Healthcare',
    'Dentist': 'Healthcare',
    'Pharmacy': 'Healthcare',
    'Eyecare': 'Healthcare',
    'Health Insurance': 'Insurance',
    'Gym': 'Healthcare',
    'Sports': 'Healthcare',

    // Personal Care
    'Hair': 'Personal',
    'Spa & Massage': 'Personal',
    'Laundry': 'Personal',

    // Entertainment
    'Movies & DVDs': 'Entertainment',
    'Music': 'Entertainment',
    'Newspapers & Magazines': 'Entertainment',
    'Arts': 'Entertainment',
    'Amusement': 'Entertainment',
    'Streaming Services': 'Entertainment',

    // Education
    'Tuition': 'Education',
    'Student Loan': 'Loans',
    'Books & Supplies': 'Education',

    // Financial
    'Bank Fee': 'Financial',
    'ATM Fee': 'Financial',
    'Late Fee': 'Financial',
    'Interest Charge': 'Financial',
    'Finance Charge': 'Financial',
    'Financial Advisor': 'Financial',
    'Life Insurance': 'Insurance',

    // Travel
    'Air Travel': 'Travel',
    'Hotel': 'Travel',
    'Rental Car & Taxi': 'Travel',
    'Vacation': 'Travel',

    // Income
    'Paycheck': 'Salary',
    'Investment Income': 'Income',
    'Returned Purchase': 'Other',
    'Bonus': 'Salary',
    'Interest Income': 'Income',
    'Reimbursement': 'Income',
    'Rental Income': 'Income',

    // Gifts & Charity
    'Gift': 'Other',
    'Charity': 'Other',
    'Church': 'Other',

    // Taxes
    'Federal Tax': 'Financial',
    'State Tax': 'Financial',
    'Local Tax': 'Financial',
    'Property Tax': 'Housing',
    'Sales Tax': 'Financial',

    // Kids
    'Kids Activities': 'Education',
    'Child Support': 'Other',
    'Baby Supplies': 'Shopping',
    'Babysitter & Daycare': 'Education',
    'Allowance': 'Other',

    // Pets
    'Pet Grooming': 'Shopping',
    'Veterinary': 'Healthcare',

    // Business
    'Advertising': 'Other',
    'Office Maintenance': 'Other',
    'Printing': 'Other',
    'Shipping': 'Other',

    // Transfers
    'Transfer': 'Transfers',
    'Credit Card Payment': 'Transfers',
    'Loan Payment': 'Loans',
    'Loan': 'Loans',
  };

  const topLevelMap: Record<string, string> = {
    'Food & Dining': 'Restaurant & Bars',
    'Groceries': 'Groceries',
    'Shopping': 'Shopping',
    'Travel': 'Travel',
    'Transportation': 'Transportation',
    'Entertainment': 'Entertainment',
    'Health & Fitness': 'Healthcare',
    'Healthcare': 'Healthcare',
    'Bills & Utilities': 'Utilities',
    'Utilities': 'Utilities',
    'Home': 'Housing',
    'Rent': 'Housing',
    'Insurance': 'Insurance',
    'Loans': 'Loans',
    'Personal Care': 'Personal',
    'Education': 'Education',
    'Gifts & Donations': 'Other',
    'Kids': 'Education',
    'Pets': 'Shopping',
    'Business Services': 'Other',
    'Taxes': 'Financial',
    'Fees & Charges': 'Financial',
    'Financial': 'Financial',
    'Transfer': 'Transfers',
    'Income': 'Salary',
    'ATM/Cash': 'Other',
    'ATM': 'Other',
    'Fees': 'Financial',
    'Uncategorized': 'Other',
    'Check': 'Other',
    'Investments': 'Financial',
  };

  return specificMap[category] || topLevelMap[topLevel] || topLevelMap[category] || 'Other';
}

// ─── Upsert MX Transaction ─────────────────────────────────────────────────

async function upsertMXTransaction(
  userId: string,
  memberId: string,
  tx: any
): Promise<void> {
  // MX AMOUNT CONVENTION:
  // Positive amount = DEBIT (money going OUT)
  // Negative amount = CREDIT (money coming IN)
  const isIncome = tx.amount < 0 ||
    tx.top_level_category === 'Income' ||
    tx.type === 'CREDIT';

  const normalizedAmount = Math.abs(tx.amount).toFixed(2);

  const personalCategory = mapMXCategory(
    tx.top_level_category,
    tx.category,
    isIncome
  );

  // Merchant enrichment — fetch logo and clean name from MX if merchant_guid exists
  let merchantCleanName: string | null = tx.description;
  let merchantLogoUrl: string | null = null;
  if (tx.merchant_guid) {
    try {
      const merchant = await getMerchant(tx.merchant_guid);
      if (merchant) {
        merchantCleanName = merchant.name || tx.description;
        merchantLogoUrl = merchant.logo_url || null;
      }
    } catch {
      // Silently fall back — merchant enrichment is best-effort
    }
  }

  // §6.2.6 dual-write: resolve canonical slug for this MX row. MX doesn't
  // expose Plaid's PFC field, so only the deterministic legacy-string map
  // runs here — the adapter-derived `personalCategory` above is the key.
  // Misses fall through to NULL and are picked up by the nightly reconcile.
  const canonicalCategoryId = resolveCanonicalCategorySync({
    legacyCategory: personalCategory,
    merchantName: merchantCleanName ?? tx.description ?? null,
    amount: Number(normalizedAmount) || null,
    rowKind: "mx",
  }).canonicalId;

  const transactionData = {
    plaidAccountId: memberId,
    amount: isIncome ? `-${normalizedAmount}` : normalizedAmount,
    date: tx.transacted_at?.split('T')[0] || tx.posted_at?.split('T')[0],
    name: tx.description,
    merchantName: merchantCleanName,
    merchantCleanName: merchantCleanName,
    merchantLogoUrl: merchantLogoUrl,
    logoUrl: merchantLogoUrl,
    category: tx.top_level_category || 'OTHER',
    personalCategory,
    canonicalCategoryId,
    pending: tx.status === 'PENDING' ? 'true' : 'false',
    isoCurrencyCode: 'CAD',
    matchType: 'unmatched',
    reconciled: 'false',
    enrichmentSource: 'mx',
    enrichmentConfidence: '0.85',
    // MX enrichment flags
    isSubscription: tx.is_subscription ? 'true' : 'false',
  };

  // For the upsert SET clause, keep canonical_category_id idempotent on
  // re-sync: only fill if currently NULL. If a human has manually corrected
  // the category after the first insert, we mustn't clobber their fix.
  const { canonicalCategoryId: _omit, ...updateData } = transactionData;

  await db.insert(plaidTransactions)
    .values({
      id: crypto.randomUUID(),
      transactionId: tx.guid,
      ...transactionData,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: plaidTransactions.transactionId,
      set: {
        ...updateData,
        canonicalCategoryId: sql`COALESCE(plaid_transactions.canonical_category_id, ${canonicalCategoryId})`,
      },
    });
}

// ─── Sync MX Transactions ───────────────────────────────────────────────────

export async function syncMXTransactions(
  userId: string,
  memberGuid: string,
  memberId: string
): Promise<{ added: number; updated: number; removed: number }> {
  let addedCount = 0;
  const updatedCount = 0;

  try {
    const mxUserGuid = await getMXUserGuid(userId);

    const member = await db.query.mxMembers.findFirst({
      where: eq(mxMembers.id, memberId),
    });

    // Fetch 2 years on first sync, incremental after that
    const fromDate = member?.lastSyncedAt
      ? new Date(member.lastSyncedAt).toISOString().split('T')[0]
      : new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const toDate = new Date().toISOString().split('T')[0];

    console.log(`[MX Sync] Fetching transactions from ${fromDate} to ${toDate} for member ${memberGuid}`);

    let page = 1;
    let hasMore = true;

    while (hasMore) {
      // Use legacy Axios for member-scoped transaction fetching (SDK param order issues)
      const response = await mxClient.get(
        `/users/${mxUserGuid}/members/${memberGuid}/transactions`,
        {
          params: {
            from_date: fromDate,
            to_date: toDate,
            page,
            records_per_page: 100,
          },
        }
      );

      const transactions: any[] = response.data.transactions || [];
      const pagination = response.data.pagination;

      console.log(`[MX Sync] Page ${page}: ${transactions.length} transactions`);

      for (const tx of transactions) {
        await upsertMXTransaction(userId, memberId, tx);
        addedCount++;
      }

      hasMore = pagination?.current_page < pagination?.total_pages;
      page++;
    }

    // Update lastSyncedAt
    await db.update(mxMembers)
      .set({ lastSyncedAt: new Date() })
      .where(eq(mxMembers.id, memberId));

    console.log(`[MX Sync] Complete for user ${userId}: processed ${addedCount} transactions`);
    return { added: addedCount, updated: updatedCount, removed: 0 };

  } catch (error) {
    console.error('[MX Sync] Error:', error);
    throw error;
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

export { mxClient };
