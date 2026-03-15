import axios, { AxiosInstance, AxiosError } from "axios";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { mxMembers, plaidTransactions, users } from "@shared/schema";

const MX_CLIENT_ID = process.env.MX_CLIENT_ID;
const MX_API_KEY = process.env.MX_API_KEY;

if (!MX_CLIENT_ID || !MX_API_KEY) {
  console.warn("[MX] Warning: MX_CLIENT_ID or MX_API_KEY not set. MX integration will not work.");
}

// Select API base URL from environment; fall back to the integration (dev) endpoint
// so the application starts cleanly without crashing.
const MX_API_BASE_URL = process.env.MX_API_BASE_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://api.mx.com"
    : "https://int-api.mx.com");

console.log(`[MX] Using API base URL: ${MX_API_BASE_URL} (NODE_ENV=${process.env.NODE_ENV || "not set"})`);

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

// MX API Types
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
  type: string; // CHECKING, SAVINGS, CREDIT_CARD, LOAN, MORTGAGE, INVESTMENT, etc.
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
  type: string; // DEBIT, CREDIT
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

// User Management
export async function createMXUser(userId: string, email?: string): Promise<MXUser> {
  try {
    console.log(`[MX DEBUG] Creating MX user with ID: ${userId}, email: ${email || 'none'}`);
    
    const userData = {
      user: {
        id: userId,
        email: email,
        metadata: JSON.stringify({ app_user_id: userId }),
      },
    };
    
    console.log(`[MX DEBUG] User creation payload:`, JSON.stringify(userData, null, 2));
    
    const response = await mxClient.post("/users", userData);
    
    console.log(`[MX DEBUG] User creation response status: ${response.status}`);
    console.log(`[MX DEBUG] Created user GUID: ${response.data.user.guid}`);
    
    return response.data.user;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error("[MX DEBUG] Error creating MX user:");
    console.error("[MX DEBUG] Status:", axiosError.response?.status);
    console.error("[MX DEBUG] Headers:", axiosError.response?.headers);
    console.error("[MX DEBUG] Data:", axiosError.response?.data);
    console.error("[MX DEBUG] Message:", axiosError.message);
    console.error("[MX DEBUG] Full error:", error);
    throw error;
  }
}

export async function getMXUser(userGuid: string): Promise<MXUser | null> {
  try {
    console.log(`[MX DEBUG] Getting MX user with GUID: ${userGuid}`);
    
    const response = await mxClient.get(`/users/${userGuid}`);
    
    console.log(`[MX DEBUG] Get user response status: ${response.status}`);
    
    return response.data.user;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error("[MX DEBUG] Error getting MX user:");
    console.error("[MX DEBUG] Status:", axiosError.response?.status);
    console.error("[MX DEBUG] Data:", axiosError.response?.data);
    
    if (axiosError.response?.status === 404) {
      console.log(`[MX DEBUG] User ${userGuid} not found, returning null`);
      return null;
    }
    
    throw error;
  }
}

export async function deleteMXUser(userGuid: string): Promise<void> {
  await mxClient.delete(`/users/${userGuid}`);
}

// Widget URL Generation
export async function getConnectWidgetUrl(userGuid: string, currentMemberGuid?: string): Promise<string> {
  try {
    console.log(`[MX DEBUG] Getting connect widget for user: ${userGuid}, member: ${currentMemberGuid || 'none'}`);
    
    const widgetConfig: any = {
      widget_url: {
        widget_type: "connect_widget",
        is_mobile_webview: false,
        mode: "aggregation",
        ui_message_version: 4,
        include_transactions: true,
        wait_for_full_aggregation: false,
      },
    };

    // If updating existing member
    if (currentMemberGuid) {
      widgetConfig.widget_url.current_member_guid = currentMemberGuid;
    }

    console.log(`[MX DEBUG] Widget config:`, JSON.stringify(widgetConfig, null, 2));
    
    const response = await mxClient.post(`/users/${userGuid}/widget_urls`, widgetConfig);
    
    console.log(`[MX DEBUG] Widget URL response status: ${response.status}`);
    
    return response.data.widget_url.url;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error("[MX DEBUG] Error getting connect widget URL:");
    console.error("[MX DEBUG] Status:", axiosError.response?.status);
    console.error("[MX DEBUG] Headers:", axiosError.response?.headers);
    console.error("[MX DEBUG] Data:", axiosError.response?.data);
    console.error("[MX DEBUG] Message:", axiosError.message);
    console.error("[MX DEBUG] Full error:", error);
    throw error;
  }
}

// Member (Bank Connection) Management
export async function listMembers(userGuid: string): Promise<MXMember[]> {
  try {
    const response = await mxClient.get(`/users/${userGuid}/members`);
    return response.data.members || [];
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error("Error listing members:", axiosError.response?.data || axiosError.message);
    throw error;
  }
}

export async function getMember(userGuid: string, memberGuid: string): Promise<MXMember | null> {
  try {
    const response = await mxClient.get(`/users/${userGuid}/members/${memberGuid}`);
    return response.data.member;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getMemberStatus(userGuid: string, memberGuid: string): Promise<any> {
  try {
    const response = await mxClient.get(`/users/${userGuid}/members/${memberGuid}/status`);
    return response.data.member;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error("Error getting member status:", axiosError.response?.data || axiosError.message);
    throw error;
  }
}

export async function aggregateMember(userGuid: string, memberGuid: string): Promise<MXMember> {
  try {
    const response = await mxClient.post(`/users/${userGuid}/members/${memberGuid}/aggregate`);
    return response.data.member;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error("Error aggregating member:", axiosError.response?.data || axiosError.message);
    throw error;
  }
}

export async function deleteMember(userGuid: string, memberGuid: string): Promise<void> {
  try {
    await mxClient.delete(`/users/${userGuid}/members/${memberGuid}`);
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error("Error deleting member:", axiosError.response?.data || axiosError.message);
    throw error;
  }
}

// Account Management
export async function listAccounts(userGuid: string, memberGuid?: string): Promise<MXAccount[]> {
  try {
    const endpoint = memberGuid 
      ? `/users/${userGuid}/members/${memberGuid}/accounts`
      : `/users/${userGuid}/accounts`;
    const response = await mxClient.get(endpoint);
    return response.data.accounts || [];
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error("Error listing accounts:", axiosError.response?.data || axiosError.message);
    throw error;
  }
}

export async function getAccount(userGuid: string, accountGuid: string): Promise<MXAccount | null> {
  try {
    const response = await mxClient.get(`/users/${userGuid}/accounts/${accountGuid}`);
    return response.data.account;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

// Transaction Management - fetch maximum history
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
    const params: any = {
      records_per_page: options?.recordsPerPage || 100,
      page: options?.page || 1,
    };

    // For maximum history, request 3 years back if no fromDate specified
    if (options?.fromDate) {
      params.from_date = options.fromDate;
    } else {
      // Default to 3 years of history for AI insights
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
      params.from_date = threeYearsAgo.toISOString().split('T')[0];
    }

    if (options?.toDate) {
      params.to_date = options.toDate;
    }

    let endpoint = `/users/${userGuid}/transactions`;
    if (options?.accountGuid) {
      endpoint = `/users/${userGuid}/accounts/${options.accountGuid}/transactions`;
    }

    const response = await mxClient.get(endpoint, { params });
    return {
      transactions: response.data.transactions || [],
      pagination: response.data.pagination,
    };
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error("Error listing transactions:", axiosError.response?.data || axiosError.message);
    throw error;
  }
}

// Fetch ALL transactions with pagination (for initial sync with maximum history)
export async function fetchAllTransactions(
  userGuid: string,
  fromDate?: string
): Promise<MXTransaction[]> {
  const allTransactions: MXTransaction[] = [];
  let page = 1;
  let hasMore = true;

  // Default to 3 years of history
  const startDate = fromDate || (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 3);
    return d.toISOString().split('T')[0];
  })();

  console.log(`[MX] Fetching transactions from ${startDate} (up to 3 years of history)...`);

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

    // Rate limiting - MX allows ~30 requests/second but let's be conservative
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`[MX] Fetched ${allTransactions.length} transactions total`);
  return allTransactions;
}

// Institution lookup
export async function getInstitution(institutionCode: string): Promise<MXInstitution | null> {
  try {
    const response = await mxClient.get(`/institutions/${institutionCode}`);
    return response.data.institution;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function searchInstitutions(query: string): Promise<MXInstitution[]> {
  try {
    const response = await mxClient.get("/institutions", {
      params: { name: query },
    });
    return response.data.institutions || [];
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error("Error searching institutions:", axiosError.response?.data || axiosError.message);
    throw error;
  }
}

// Merchant lookup (for enrichment data)
export async function getMerchant(merchantGuid: string): Promise<MXMerchant | null> {
  try {
    const response = await mxClient.get(`/merchants/${merchantGuid}`);
    return response.data.merchant;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

// Map MX account types to our internal types
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

// ─── MX User GUID helper ────────────────────────────────────────────────────

async function getMXUserGuid(userId: string): Promise<string> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user?.mxUserGuid) {
    throw new Error(`[MX] No mxUserGuid found for user ${userId}`);
  }
  return user.mxUserGuid;
}

// ─── Category mapper ─────────────────────────────────────────────────────────

// Map MX categories to our internal categories
export function mapMXCategory(
  topLevel: string,
  category: string,
  isIncome: boolean
): string {
  if (isIncome) return 'Salary';

  const categoryMap: Record<string, string> = {
    'Food & Drink': 'Restaurant & Bars',
    'Groceries': 'Groceries',
    'Shopping': 'Shopping',
    'Travel': 'Travel',
    'Transportation': 'Transportation',
    'Entertainment': 'Entertainment',
    'Healthcare': 'Healthcare',
    'Utilities': 'Utilities',
    'Rent': 'Housing',
    'Insurance': 'Insurance',
    'Loans': 'Loans',
    'Transfer': 'Other',
    'Income': 'Salary',
    'ATM': 'Other',
    'Fees': 'Other',
  };

  return categoryMap[topLevel] || categoryMap[category] || 'Other';
}

// ─── Upsert a single MX transaction ─────────────────────────────────────────

async function upsertMXTransaction(
  userId: string,
  memberId: string,
  tx: any
): Promise<void> {
  // MX AMOUNT CONVENTION:
  // Positive amount = DEBIT (money going OUT)
  // Negative amount = CREDIT (money coming IN)
  // This is OPPOSITE to Plaid convention
  // Store as-is but flag income correctly

  const isIncome = tx.amount < 0 ||
    tx.top_level_category === 'Income' ||
    tx.type === 'CREDIT';

  const normalizedAmount = Math.abs(tx.amount).toFixed(2);

  // Map MX category to our personalCategory
  const personalCategory = mapMXCategory(
    tx.top_level_category,
    tx.category,
    isIncome
  );

  const transactionData = {
    plaidAccountId: memberId,
    amount: isIncome ? `-${normalizedAmount}` : normalizedAmount,
    date: tx.transacted_at?.split('T')[0] || tx.posted_at?.split('T')[0],
    name: tx.description,
    merchantName: tx.merchant_category_code ? String(tx.merchant_category_code) : null,
    merchantCleanName: tx.description,
    category: tx.top_level_category || 'OTHER',
    personalCategory,
    pending: tx.is_pending ? 'true' : 'false',
    isoCurrencyCode: 'CAD',
    matchType: 'unmatched',
    reconciled: 'false',
    enrichmentSource: 'mx',
    enrichmentConfidence: '0.85',
  };

  // Upsert — insert or update on conflict
  await db.insert(plaidTransactions)
    .values({
      id: crypto.randomUUID(),
      transactionId: tx.guid,
      ...transactionData,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: plaidTransactions.transactionId,
      set: transactionData,
    });
}

// ─── Sync MX transactions (page-based, no cursor) ────────────────────────────

export async function syncMXTransactions(
  userId: string,
  memberGuid: string,
  memberId: string
): Promise<{ added: number; updated: number; removed: number }> {
  let addedCount = 0;
  const updatedCount = 0;

  try {
    // Get MX user guid for this BudgetSmart user
    const mxUserGuid = await getMXUserGuid(userId);

    // Get member's last sync date from DB
    const member = await db.query.mxMembers.findFirst({
      where: eq(mxMembers.id, memberId),
    });

    // Fetch 2 years of history on first sync
    // Incremental after that using lastSyncedAt
    const fromDate = member?.lastSyncedAt
      ? new Date(member.lastSyncedAt).toISOString().split('T')[0]
      : new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const toDate = new Date().toISOString().split('T')[0];

    console.log(`[MX Sync] Fetching transactions from ${fromDate} to ${toDate} for member ${memberGuid}`);

    let page = 1;
    let hasMore = true;

    while (hasMore) {
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

      // Check if more pages exist
      hasMore = pagination?.current_page < pagination?.total_pages;
      page++;
    }

    // Update lastSyncedAt on the member
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

export { mxClient };
