import axios, { AxiosInstance, AxiosError } from "axios";

// DEBUG: Log which MX API we're using
console.log(`[MX DEBUG] NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`[MX DEBUG] MX_CLIENT_ID: ${process.env.MX_CLIENT_ID ? 'SET' : 'NOT SET'}`);
console.log(`[MX DEBUG] MX_API_KEY: ${process.env.MX_API_KEY ? 'SET' : 'NOT SET'}`);

// TEMPORARY FIX (2026-02-18): Hardcoded to development API due to Railway env var caching issue
// TODO: When production MX keys arrive, revert to dynamic environment-based URL selection
// const MX_API_BASE_URL = process.env.NODE_ENV === "production" 
//   ? "https://api.mx.com" 
//   : "https://int-api.mx.com"; // Integration/Development environment

const MX_API_BASE_URL = "https://int-api.mx.com"; // Development API (temporary hardcode)

console.log(`[MX DEBUG] Using MX API base URL: ${MX_API_BASE_URL} (TEMPORARY: Hardcoded to development)`);

const MX_CLIENT_ID = process.env.MX_CLIENT_ID;
const MX_API_KEY = process.env.MX_API_KEY;

if (!MX_CLIENT_ID || !MX_API_KEY) {
  console.warn("Warning: MX_CLIENT_ID or MX_API_KEY not set. MX integration will not work.");
} else {
  console.log(`[MX DEBUG] MX credentials loaded successfully`);
}

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

// Map MX categories to our internal categories
export function mapMXCategory(mxCategory: string, topLevelCategory: string): string {
  const categoryMap: Record<string, string> = {
    "Groceries": "Groceries",
    "Restaurants": "Restaurant & Bars",
    "Fast Food": "Restaurant & Bars",
    "Coffee Shops": "Coffee Shops",
    "Bars & Alcohol": "Restaurant & Bars",
    "Gas & Fuel": "Gas",
    "Auto & Transport": "Transportation",
    "Parking": "Parking & Tolls",
    "Public Transportation": "Public Transit",
    "Taxi & Ride Sharing": "Taxi & Ride Share",
    "Entertainment": "Entertainment",
    "Movies & DVDs": "Entertainment",
    "Music": "Entertainment",
    "Games": "Entertainment",
    "Shopping": "Shopping",
    "Clothing": "Clothing",
    "Electronics & Software": "Shopping",
    "Health & Fitness": "Fitness",
    "Gym": "Fitness",
    "Doctor": "Healthcare",
    "Pharmacy": "Healthcare",
    "Health Insurance": "Healthcare",
    "Travel": "Travel",
    "Hotels": "Travel",
    "Air Travel": "Travel",
    "Vacation": "Travel",
    "Education": "Education",
    "Books & Supplies": "Education",
    "Tuition": "Education",
    "Bills & Utilities": "Utilities",
    "Internet": "Communications",
    "Mobile Phone": "Communications",
    "Television": "Subscriptions",
    "Utilities": "Electrical",
    "Rent": "Mortgage",
    "Mortgage & Rent": "Mortgage",
    "Home Improvement": "Maintenance",
    "Home Services": "Maintenance",
    "Personal Care": "Personal",
    "Hair": "Personal",
    "Spa & Massage": "Personal",
    "Pets": "Personal",
    "Gifts & Donations": "Fun Money",
    "Charity": "Fun Money",
    "Business Services": "Business Travel & Meals",
    "Office Supplies": "Business Travel & Meals",
    "Fees & Charges": "Credit Card",
    "Bank Fee": "Credit Card",
    "Interest Paid": "Credit Card",
    "ATM Fee": "Cash & ATM",
    "Cash & ATM": "Cash & ATM",
    "Transfer": "Check",
    "Check": "Check",
    "Income": "Other",
    "Paycheck": "Other",
    "Investment": "Other",
    "Returned Purchase": "Other",
    "Uncategorized": "Other",
  };

  // Try exact match first
  if (categoryMap[mxCategory]) {
    return categoryMap[mxCategory];
  }

  // Try top level category
  if (categoryMap[topLevelCategory]) {
    return categoryMap[topLevelCategory];
  }

  // Default
  return "Other";
}

export { mxClient };
