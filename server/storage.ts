import {
  type User, type InsertUser,
  type Bill, type InsertBill,
  type Expense, type InsertExpense,
  type Income, type InsertIncome,
  type Budget, type InsertBudget,
  type SavingsGoal, type InsertSavingsGoal,
  type PlaidItem, type InsertPlaidItem,
  type PlaidAccount, type InsertPlaidAccount,
  type PlaidTransaction, type InsertPlaidTransaction,
  type NotificationSettings, type InsertNotificationSettings,
  type CustomCategory, type InsertCustomCategory,
  type RecurringExpense, type InsertRecurringExpense,
  type ReconciliationRule, type InsertReconciliationRule,
  type SyncSchedule, type InsertSyncSchedule,
  type Notification, type InsertNotification,
  type BudgetAlert, type InsertBudgetAlert,
  type OnboardingAnalysis, type InsertOnboardingAnalysis,
  type Household, type InsertHousehold,
  type HouseholdMember, type InsertHouseholdMember,
  type HouseholdInvitation, type InsertHouseholdInvitation,
  type ReferralCode, type InsertReferralCode,
  type Referral, type InsertReferral,
  type ManualAccount, type InsertManualAccount,
  type ManualTransaction, type InsertManualTransaction,
  type DebtDetails, type InsertDebtDetails,
  type AiInsight, type InsertAiInsight,
  type TransactionAnomaly, type InsertTransactionAnomaly,
  type SavingsRecommendation, type InsertSavingsRecommendation,
  type InvestmentAccount, type InsertInvestmentAccount,
  type Holding, type InsertHolding,
  type HoldingsHistory, type InsertHoldingsHistory,
  type Asset, type InsertAsset,
  type AssetValueHistory, type InsertAssetValueHistory,
  type NetWorthSnapshot, type InsertNetWorthSnapshot,
  type SplitExpense, type InsertSplitExpense,
  type SplitParticipant, type InsertSplitParticipant,
  type SettlementPayment, type InsertSettlementPayment,
  type LandingSetting, type InsertLandingSetting,
  type LandingFeature, type InsertLandingFeature,
  type LandingTestimonial, type InsertLandingTestimonial,
  type LandingPricing, type InsertLandingPricing,
  type LandingComparison, type InsertLandingComparison,
  type LandingFaq, type InsertLandingFaq,
  type AffiliateSetting, type InsertAffiliateSetting,
  type LandingVideoAnnotation, type InsertLandingVideoAnnotation,
  type SalesChatSession, type InsertSalesChatSession,
  type SalesChatMessage, type InsertSalesChatMessage,
  type SalesLead, type InsertSalesLead,
  type AutopilotRule, type InsertAutopilotRule,
  type LeakAlert, type InsertLeakAlert,
  type TrialEvent, type InsertTrialEvent,
  type WhatIfScenario, type InsertWhatIfScenario,
  type SpendabilitySnapshot, type InsertSpendabilitySnapshot,
  type PaydayRecommendation, type InsertPaydayRecommendation,
  type Receipt, type InsertReceipt,
  type SupportTicket, type InsertSupportTicket,
  type SupportTicketMessage, type InsertSupportTicketMessage,
  type FinancialProfessional,
  supportTickets, supportTicketMessages,
  users, bills, expenses, income, budgets, savingsGoals,
  plaidItems, plaidAccounts, plaidTransactions,
  mxMembers, mxAccounts, mxTransactions,
  type MxMember, type InsertMxMember,
  type MxAccount, type InsertMxAccount,
  type MxTransaction, type InsertMxTransaction,
  notificationSettings, customCategories, recurringExpenses,
  reconciliationRules, syncSchedules, notifications, budgetAlerts, spendingAlerts,
  onboardingAnalysis, households, householdMembers, householdInvitations,
  referralCodes, referrals, manualAccounts, manualTransactions, debtDetails,
  aiInsights, transactionAnomalies, savingsRecommendations,
  investmentAccounts, holdings, holdingsHistory,
  assets, assetValueHistory, netWorthSnapshots,
  splitExpenses, splitParticipants, settlementPayments,
  landingSettings, landingFeatures, landingTestimonials,
  landingPricing, landingComparison, landingFaq,
  affiliateSettings, landingVideoAnnotations,
  salesChatSessions, salesChatMessages, salesLeads,
  autopilotRules, leakAlerts, trialEvents, whatIfScenarios,
  spendabilitySnapshots, paydayRecommendations,
  receipts,
  financialProfessionals
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, and, gte, lte, inArray, desc, like, sql } from "drizzle-orm";
import { encrypt as fieldEncrypt, decrypt as fieldDecrypt } from "./encryption";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser & { isAdmin?: boolean; isApproved?: boolean; email?: string; firstName?: string; lastName?: string; googleId?: string; emailVerified?: string; mfaRequired?: string }): Promise<User>;
  updateUser(id: string, updates: { username?: string; password?: string; isAdmin?: boolean; isApproved?: boolean; email?: string | null; firstName?: string | null; lastName?: string | null; phone?: string | null; googleId?: string; emailVerified?: string; mxUserGuid?: string; displayName?: string | null; birthday?: string | null; timezone?: string | null; avatarUrl?: string | null; country?: string | null }): Promise<User | undefined>;
  updateUserPreferences(id: string, updates: { prefNeedsReview?: boolean; prefEditPending?: boolean; prefMerchantDisplay?: string }): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  updateUserMfa(id: string, mfaSecret: string, mfaEnabled: boolean, backupCodes?: string[]): Promise<User | undefined>;
  // Email verification
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  setEmailVerificationToken(userId: string, token: string, expiry: string): Promise<void>;
  verifyUserEmail(userId: string): Promise<User | undefined>;

  // Bills
  getBills(userId: string): Promise<Bill[]>;
  getAllBills(): Promise<Bill[]>; // For email scheduler - gets all bills across users
  getBill(id: string): Promise<Bill | undefined>;
  createBill(bill: InsertBill & { userId: string }): Promise<Bill>;
  updateBill(id: string, bill: Partial<InsertBill>): Promise<Bill | undefined>;
  deleteBill(id: string): Promise<boolean>;
  updateBillNotifiedCycle(id: string, cycle: string): Promise<void>;

  // Expenses
  getExpenses(userId: string): Promise<Expense[]>;
  getAllExpenses(): Promise<Expense[]>; // For admin/reports - gets all expenses across users
  getExpense(id: string): Promise<Expense | undefined>;
  createExpense(expense: InsertExpense & { userId: string }): Promise<Expense>;
  updateExpense(id: string, expense: Partial<InsertExpense>): Promise<Expense | undefined>;
  deleteExpense(id: string): Promise<boolean>;

  // Income
  getIncomes(userId: string): Promise<Income[]>;
  getIncome(id: string): Promise<Income | undefined>;
  createIncome(income: InsertIncome & { userId: string }): Promise<Income>;
  updateIncome(id: string, income: Partial<InsertIncome>): Promise<Income | undefined>;
  deleteIncome(id: string): Promise<boolean>;

  // Budgets
  getBudgets(userId: string): Promise<Budget[]>;
  getBudget(id: string): Promise<Budget | undefined>;
  getBudgetsByMonth(userId: string, month: string): Promise<Budget[]>;
  createBudget(budget: InsertBudget & { userId: string }): Promise<Budget>;
  updateBudget(id: string, budget: Partial<InsertBudget>): Promise<Budget | undefined>;
  deleteBudget(id: string): Promise<boolean>;

  // Savings Goals
  getSavingsGoals(userId: string): Promise<SavingsGoal[]>;
  getSavingsGoal(id: string): Promise<SavingsGoal | undefined>;
  createSavingsGoal(goal: InsertSavingsGoal & { userId: string }): Promise<SavingsGoal>;
  updateSavingsGoal(id: string, goal: Partial<InsertSavingsGoal>): Promise<SavingsGoal | undefined>;
  deleteSavingsGoal(id: string): Promise<boolean>;

  // Plaid Items
  getPlaidItems(userId: string): Promise<PlaidItem[]>;
  getPlaidItem(id: string): Promise<PlaidItem | undefined>;
  getPlaidItemByItemId(itemId: string): Promise<PlaidItem | undefined>;
  createPlaidItem(item: InsertPlaidItem): Promise<PlaidItem>;
  updatePlaidItem(id: string, updates: Partial<PlaidItem>): Promise<PlaidItem | undefined>;
  deletePlaidItem(id: string): Promise<boolean>;

  // Plaid Accounts
  getPlaidAccounts(plaidItemId: string): Promise<PlaidAccount[]>;
  getAllPlaidAccounts(userId: string): Promise<PlaidAccount[]>;
  getPlaidAccountByAccountId(accountId: string): Promise<PlaidAccount | undefined>;
  createPlaidAccount(account: InsertPlaidAccount): Promise<PlaidAccount>;
  updatePlaidAccount(id: string, updates: Partial<PlaidAccount>): Promise<PlaidAccount | undefined>;
  deletePlaidAccountsByItemId(plaidItemId: string): Promise<void>;

  // Plaid Transactions
  getPlaidTransactions(accountIds: string[], options?: { startDate?: string; endDate?: string }): Promise<PlaidTransaction[]>;
  getPlaidTransactionByTransactionId(transactionId: string): Promise<PlaidTransaction | undefined>;
  getRecentTransactionIds(userId: string, daysBack: number): Promise<string[]>;
  createPlaidTransaction(transaction: InsertPlaidTransaction): Promise<PlaidTransaction>;
  updatePlaidTransaction(id: string, updates: Partial<PlaidTransaction>): Promise<PlaidTransaction | undefined>;
  deleteRemovedTransactions(transactionIds: string[]): Promise<void>;
  getUnmatchedTransactions(accountIds: string[]): Promise<PlaidTransaction[]>;

  // MX Members (Bank Connections)
  getMxMembers(userId: string): Promise<MxMember[]>;
  getMxMember(id: string): Promise<MxMember | undefined>;
  getMxMemberByGuid(memberGuid: string): Promise<MxMember | undefined>;
  createMxMember(member: InsertMxMember): Promise<MxMember>;
  updateMxMember(id: string, updates: Partial<MxMember>): Promise<MxMember | undefined>;
  deleteMxMember(id: string): Promise<boolean>;

  // MX Accounts
  getMxAccounts(mxMemberId: string): Promise<MxAccount[]>;
  getMxAccountsByUserId(userId: string): Promise<MxAccount[]>;
  getMxAccountByGuid(accountGuid: string): Promise<MxAccount | undefined>;
  createMxAccount(account: InsertMxAccount): Promise<MxAccount>;
  updateMxAccount(id: string, updates: Partial<MxAccount>): Promise<MxAccount | undefined>;
  deleteMxAccountsByMemberId(mxMemberId: string): Promise<void>;

  // MX Transactions
  getMxTransactions(accountIds: string[], options?: { startDate?: string; endDate?: string }): Promise<MxTransaction[]>;
  getMxTransactionByGuid(transactionGuid: string): Promise<MxTransaction | undefined>;
  createMxTransaction(transaction: InsertMxTransaction): Promise<MxTransaction>;
  upsertMxTransactions(transactions: InsertMxTransaction[]): Promise<void>;
  updateMxTransaction(id: string, updates: Partial<MxTransaction>): Promise<MxTransaction | undefined>;
  deleteMxTransactionsByAccountId(mxAccountId: string): Promise<void>;
  getUnmatchedMxTransactions(accountIds: string[]): Promise<MxTransaction[]>;

  // Notification Settings
  getNotificationSettings(userId: string): Promise<NotificationSettings | undefined>;
  createNotificationSettings(settings: InsertNotificationSettings): Promise<NotificationSettings>;
  updateNotificationSettings(userId: string, updates: Partial<NotificationSettings>): Promise<NotificationSettings | undefined>;

  // Custom Categories
  getCustomCategories(userId: string): Promise<CustomCategory[]>;
  createCustomCategory(category: InsertCustomCategory): Promise<CustomCategory>;
  updateCustomCategory(id: string, updates: Partial<CustomCategory>): Promise<CustomCategory | undefined>;
  deleteCustomCategory(id: string): Promise<boolean>;

  // Recurring Expenses
  getRecurringExpenses(userId: string): Promise<RecurringExpense[]>;
  getRecurringExpense(id: string): Promise<RecurringExpense | undefined>;
  createRecurringExpense(expense: InsertRecurringExpense): Promise<RecurringExpense>;
  updateRecurringExpense(id: string, updates: Partial<RecurringExpense>): Promise<RecurringExpense | undefined>;
  deleteRecurringExpense(id: string): Promise<boolean>;

  // Reconciliation Rules
  getReconciliationRules(userId: string): Promise<ReconciliationRule[]>;
  findMatchingRule(userId: string, merchantName: string): Promise<ReconciliationRule | undefined>;
  createReconciliationRule(rule: InsertReconciliationRule): Promise<ReconciliationRule>;
  updateReconciliationRule(id: string, updates: Partial<ReconciliationRule>): Promise<ReconciliationRule | undefined>;
  deleteReconciliationRule(id: string): Promise<boolean>;

  // Sync Schedules
  getSyncSchedules(userId: string): Promise<SyncSchedule[]>;
  getSyncSchedule(id: string): Promise<SyncSchedule | undefined>;
  createSyncSchedule(schedule: InsertSyncSchedule): Promise<SyncSchedule>;
  updateSyncSchedule(id: string, updates: Partial<SyncSchedule>): Promise<SyncSchedule | undefined>;
  deleteSyncSchedule(id: string): Promise<boolean>;
  getDueSyncSchedules(): Promise<SyncSchedule[]>;

  // Notifications
  getNotifications(userId: string, limit?: number): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  deleteNotification(id: string): Promise<boolean>;

  // Budget Alerts
  getBudgetAlerts(userId: string, month?: string): Promise<BudgetAlert[]>;
  createBudgetAlert(alert: InsertBudgetAlert): Promise<BudgetAlert>;
  updateBudgetAlert(id: string, updates: Partial<BudgetAlert>): Promise<BudgetAlert | undefined>;

  // Onboarding
  getOnboardingAnalysis(userId: string): Promise<OnboardingAnalysis | undefined>;
  createOnboardingAnalysis(analysis: InsertOnboardingAnalysis): Promise<OnboardingAnalysis>;
  updateOnboardingAnalysis(userId: string, updates: Partial<OnboardingAnalysis>): Promise<OnboardingAnalysis | undefined>;
  deleteOnboardingAnalysis(userId: string): Promise<boolean>;
  updateUserOnboarding(userId: string, complete: boolean, progress?: Record<string, boolean>): Promise<void>;

  // Households
  createHousehold(name: string, ownerId: string): Promise<Household>;
  getHousehold(id: string): Promise<Household | undefined>;
  getHouseholdByUserId(userId: string): Promise<Household | undefined>;
  updateHousehold(id: string, updates: Partial<Household>): Promise<Household | undefined>;
  deleteHousehold(id: string): Promise<boolean>;

  // Household Members
  getHouseholdMembers(householdId: string): Promise<(HouseholdMember & { user: User })[]>;
  getHouseholdMemberUserIds(householdId: string): Promise<string[]>;
  getHouseholdMember(householdId: string, userId: string): Promise<HouseholdMember | undefined>;
  addHouseholdMember(householdId: string, userId: string, role: string): Promise<HouseholdMember>;
  removeHouseholdMember(householdId: string, userId: string): Promise<boolean>;
  updateHouseholdMemberRole(householdId: string, userId: string, role: string): Promise<HouseholdMember | undefined>;

  // Household Invitations
  createInvitation(invitation: Omit<InsertHouseholdInvitation, 'token' | 'status' | 'createdAt' | 'expiresAt'>): Promise<HouseholdInvitation>;
  getInvitationByToken(token: string): Promise<HouseholdInvitation | undefined>;
  getInvitationsByEmail(email: string): Promise<HouseholdInvitation[]>;
  getInvitationsByHousehold(householdId: string): Promise<HouseholdInvitation[]>;
  updateInvitationStatus(id: string, status: string): Promise<HouseholdInvitation | undefined>;
  deleteInvitation(id: string): Promise<boolean>;

  // Multi-user data queries (for household filtering)
  getBillsByUserIds(userIds: string[]): Promise<Bill[]>;
  getExpensesByUserIds(userIds: string[]): Promise<Expense[]>;
  getIncomesByUserIds(userIds: string[]): Promise<Income[]>;
  getBudgetsByUserIds(userIds: string[]): Promise<Budget[]>;
  getBudgetsByUserIdsAndMonth(userIds: string[], month: string): Promise<Budget[]>;
  getSavingsGoalsByUserIds(userIds: string[]): Promise<SavingsGoal[]>;
  getPlaidItemsByUserIds(userIds: string[]): Promise<PlaidItem[]>;

  // Household address / general info
  updateUserHousehold(userId: string, updates: { householdName?: string | null; country?: string | null; addressLine1?: string | null; city?: string | null; provinceState?: string | null; postalCode?: string | null }): Promise<User | undefined>;

  // Financial Professional Access
  getFinancialProfessional(userId: string): Promise<FinancialProfessional | undefined>;
  grantFinancialAccess(userId: string, professionalEmail: string, professionalName: string | undefined, accessToken: string, expiresAt: string): Promise<FinancialProfessional>;
  revokeFinancialAccess(userId: string): Promise<boolean>;

  // Referral Program
  getReferralCode(userId: string): Promise<ReferralCode | undefined>;
  getReferralCodeByCode(code: string): Promise<ReferralCode | undefined>;
  createReferralCode(userId: string, code: string): Promise<ReferralCode>;
  incrementReferralCount(userId: string, successful?: boolean): Promise<void>;
  getReferrals(referrerId: string): Promise<Referral[]>;
  getReferralByEmail(email: string): Promise<Referral | undefined>;
  createReferral(referral: InsertReferral): Promise<Referral>;
  updateReferralStatus(id: string, status: string, referredUserId?: string): Promise<Referral | undefined>;

  // Manual Accounts (Transaction-Centric Architecture)
  getManualAccounts(userId: string): Promise<ManualAccount[]>;
  getManualAccount(id: string): Promise<ManualAccount | undefined>;
  createManualAccount(account: InsertManualAccount & { userId: string }): Promise<ManualAccount>;
  updateManualAccount(id: string, updates: Partial<InsertManualAccount>): Promise<ManualAccount | undefined>;
  deleteManualAccount(id: string): Promise<boolean>;

  // Manual Transactions
  getManualTransactions(accountId: string, options?: { startDate?: string; endDate?: string }): Promise<ManualTransaction[]>;
  getManualTransactionsByUser(userId: string, options?: { startDate?: string; endDate?: string }): Promise<ManualTransaction[]>;
  getManualTransaction(id: string): Promise<ManualTransaction | undefined>;
  createManualTransaction(transaction: InsertManualTransaction & { userId: string; accountId: string }): Promise<ManualTransaction>;
  updateManualTransaction(id: string, updates: Partial<InsertManualTransaction>): Promise<ManualTransaction | undefined>;
  deleteManualTransaction(id: string): Promise<boolean>;

  // Bulk delete methods for account deletion
  deleteAllManualTransactionsByUser(userId: string): Promise<void>;
  deleteAllManualAccountsByUser(userId: string): Promise<void>;
  deleteAllPlaidTransactionsByUser(userId: string): Promise<void>;
  deleteAllPlaidAccountsByUser(userId: string): Promise<void>;
  deleteAllPlaidItemsByUser(userId: string): Promise<void>;
  deleteAllReconciliationRulesByUser(userId: string): Promise<void>;
  deleteAllExpensesByUser(userId: string): Promise<void>;
  deleteAllBillsByUser(userId: string): Promise<void>;
  deleteAllIncomesByUser(userId: string): Promise<void>;
  deleteAllBudgetsByUser(userId: string): Promise<void>;
  deleteAllSavingsGoalsByUser(userId: string): Promise<void>;
  deleteAllCategoriesByUser(userId: string): Promise<void>;
  deleteAllNotificationsByUser(userId: string): Promise<void>;
  deleteAllHouseholdMembersByUser(userId: string): Promise<void>;
  deleteAllHouseholdsByUser(userId: string): Promise<void>;
  deleteAllInvitationCodesByUser(userId: string): Promise<void>;
  deleteAllNotificationSettingsByUser(userId: string): Promise<void>;
  deleteAllRecurringExpensesByUser(userId: string): Promise<void>;
  deleteAllSyncSchedulesByUser(userId: string): Promise<void>;
  deleteAllBudgetAlertsByUser(userId: string): Promise<void>;
  deleteAllOnboardingAnalysisByUser(userId: string): Promise<void>;
  deleteAllReferralCodesByUser(userId: string): Promise<void>;
  deleteAllSpendingAlertsByUser(userId: string): Promise<void>;
  deleteAllReferralsByUser(userId: string): Promise<void>;
  deleteAllDebtDetailsByUser(userId: string): Promise<void>;

  // Debt Details
  getDebtDetails(userId: string): Promise<DebtDetails[]>;
  getDebtDetail(id: string): Promise<DebtDetails | undefined>;
  getDebtDetailByPlaidAccount(plaidAccountId: string): Promise<DebtDetails | undefined>;
  createDebtDetail(debt: InsertDebtDetails & { userId: string }): Promise<DebtDetails>;
  updateDebtDetail(id: string, updates: Partial<InsertDebtDetails>): Promise<DebtDetails | undefined>;
  deleteDebtDetail(id: string): Promise<boolean>;

  // AI Insights
  getAiInsights(userId: string, options?: { includeRead?: boolean; includeDismissed?: boolean }): Promise<AiInsight[]>;
  getAiInsight(id: string): Promise<AiInsight | undefined>;
  createAiInsight(insight: InsertAiInsight): Promise<AiInsight>;
  updateAiInsight(id: string, updates: Partial<AiInsight>): Promise<AiInsight | undefined>;
  deleteAiInsight(id: string): Promise<boolean>;
  deleteExpiredAiInsights(): Promise<void>;

  // Transaction Anomalies
  getTransactionAnomalies(userId: string, options?: { includeReviewed?: boolean }): Promise<TransactionAnomaly[]>;
  getTransactionAnomaly(id: string): Promise<TransactionAnomaly | undefined>;
  getTransactionAnomalyByTransactionId(transactionId: string): Promise<TransactionAnomaly | undefined>;
  createTransactionAnomaly(anomaly: InsertTransactionAnomaly): Promise<TransactionAnomaly>;
  updateTransactionAnomaly(id: string, updates: Partial<TransactionAnomaly>): Promise<TransactionAnomaly | undefined>;
  deleteTransactionAnomaly(id: string): Promise<boolean>;

  // Savings Recommendations
  getSavingsRecommendations(userId: string, options?: { status?: string }): Promise<SavingsRecommendation[]>;
  getSavingsRecommendation(id: string): Promise<SavingsRecommendation | undefined>;
  createSavingsRecommendation(recommendation: InsertSavingsRecommendation): Promise<SavingsRecommendation>;
  updateSavingsRecommendation(id: string, updates: Partial<SavingsRecommendation>): Promise<SavingsRecommendation | undefined>;
  deleteSavingsRecommendation(id: string): Promise<boolean>;
  deleteExpiredSavingsRecommendations(): Promise<void>;

  // Investment Accounts
  getInvestmentAccounts(userId: string): Promise<InvestmentAccount[]>;
  getInvestmentAccount(id: string): Promise<InvestmentAccount | undefined>;
  createInvestmentAccount(account: InsertInvestmentAccount & { userId: string }): Promise<InvestmentAccount>;
  updateInvestmentAccount(id: string, updates: Partial<InsertInvestmentAccount>): Promise<InvestmentAccount | undefined>;
  deleteInvestmentAccount(id: string): Promise<boolean>;

  // Holdings
  getHoldings(investmentAccountId: string): Promise<Holding[]>;
  getHoldingsByUser(userId: string): Promise<Holding[]>;
  getHolding(id: string): Promise<Holding | undefined>;
  createHolding(holding: InsertHolding & { userId: string }): Promise<Holding>;
  updateHolding(id: string, updates: Partial<InsertHolding>): Promise<Holding | undefined>;
  deleteHolding(id: string): Promise<boolean>;

  // Holdings History
  getHoldingsHistory(holdingId: string, options?: { startDate?: string; endDate?: string }): Promise<HoldingsHistory[]>;
  createHoldingsHistory(history: InsertHoldingsHistory): Promise<HoldingsHistory>;

  // Assets
  getAssets(userId: string): Promise<Asset[]>;
  getAsset(id: string): Promise<Asset | undefined>;
  createAsset(asset: InsertAsset & { userId: string }): Promise<Asset>;
  updateAsset(id: string, updates: Partial<InsertAsset>): Promise<Asset | undefined>;
  deleteAsset(id: string): Promise<boolean>;

  // Asset Value History
  getAssetValueHistory(assetId: string): Promise<AssetValueHistory[]>;
  createAssetValueHistory(history: InsertAssetValueHistory): Promise<AssetValueHistory>;

  // Net Worth Snapshots
  getNetWorthSnapshots(userId: string, options?: { limit?: number }): Promise<NetWorthSnapshot[]>;
  getLatestNetWorthSnapshot(userId: string): Promise<NetWorthSnapshot | undefined>;
  createNetWorthSnapshot(snapshot: InsertNetWorthSnapshot & { userId: string }): Promise<NetWorthSnapshot>;

  // Split Expenses
  getSplitExpenses(householdId: string): Promise<SplitExpense[]>;
  getSplitExpense(id: string): Promise<SplitExpense | undefined>;
  createSplitExpense(expense: InsertSplitExpense): Promise<SplitExpense>;
  updateSplitExpense(id: string, updates: Partial<InsertSplitExpense>): Promise<SplitExpense | undefined>;
  deleteSplitExpense(id: string): Promise<boolean>;

  // Split Participants
  getSplitParticipants(splitExpenseId: string): Promise<SplitParticipant[]>;
  createSplitParticipant(participant: InsertSplitParticipant): Promise<SplitParticipant>;
  updateSplitParticipant(id: string, updates: Partial<SplitParticipant>): Promise<SplitParticipant | undefined>;
  deleteSplitParticipant(id: string): Promise<boolean>;

  // Settlement Payments
  getSettlementPayments(householdId: string): Promise<SettlementPayment[]>;
  createSettlementPayment(payment: InsertSettlementPayment): Promise<SettlementPayment>;

  // Bulk delete for new tables
  deleteAllInvestmentAccountsByUser(userId: string): Promise<void>;
  deleteAllHoldingsByUser(userId: string): Promise<void>;
  deleteAllAssetsByUser(userId: string): Promise<void>;
  deleteAllNetWorthSnapshotsByUser(userId: string): Promise<void>;

  // Landing Page Settings
  getLandingSettings(): Promise<LandingSetting[]>;
  getLandingSetting(key: string): Promise<LandingSetting | undefined>;
  upsertLandingSetting(key: string, value: string, type?: string): Promise<LandingSetting>;
  deleteLandingSetting(key: string): Promise<boolean>;

  // Landing Page Features
  getLandingFeatures(activeOnly?: boolean): Promise<LandingFeature[]>;
  getLandingFeature(id: string): Promise<LandingFeature | undefined>;
  createLandingFeature(feature: InsertLandingFeature): Promise<LandingFeature>;
  updateLandingFeature(id: string, updates: Partial<InsertLandingFeature>): Promise<LandingFeature | undefined>;
  deleteLandingFeature(id: string): Promise<boolean>;

  // Landing Page Testimonials
  getLandingTestimonials(activeOnly?: boolean): Promise<LandingTestimonial[]>;
  getLandingTestimonial(id: string): Promise<LandingTestimonial | undefined>;
  createLandingTestimonial(testimonial: InsertLandingTestimonial): Promise<LandingTestimonial>;
  updateLandingTestimonial(id: string, updates: Partial<InsertLandingTestimonial>): Promise<LandingTestimonial | undefined>;
  deleteLandingTestimonial(id: string): Promise<boolean>;

  // Landing Page Pricing
  getLandingPricing(activeOnly?: boolean): Promise<LandingPricing[]>;
  getLandingPricingPlan(id: string): Promise<LandingPricing | undefined>;
  getLandingPricingByStripePriceId(stripePriceId: string): Promise<LandingPricing | undefined>;
  createLandingPricing(pricing: InsertLandingPricing): Promise<LandingPricing>;
  updateLandingPricing(id: string, updates: Partial<InsertLandingPricing>): Promise<LandingPricing | undefined>;
  deleteLandingPricing(id: string): Promise<boolean>;

  // Stripe User Info
  getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined>;
  updateUserStripeInfo(userId: string, stripeInfo: {
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    subscriptionStatus?: string | null;
    subscriptionPlanId?: string | null;
    trialEndsAt?: string | null;
    subscriptionEndsAt?: string | null;
    plan?: string | null;
    planStatus?: string | null;
    planStartedAt?: string | null;
  }): Promise<User | undefined>;

  // Landing Page Comparison
  getLandingComparison(activeOnly?: boolean): Promise<LandingComparison[]>;
  getLandingComparisonRow(id: string): Promise<LandingComparison | undefined>;
  createLandingComparison(row: InsertLandingComparison): Promise<LandingComparison>;
  updateLandingComparison(id: string, updates: Partial<InsertLandingComparison>): Promise<LandingComparison | undefined>;
  deleteLandingComparison(id: string): Promise<boolean>;

  // Landing Page FAQ
  getLandingFaqs(activeOnly?: boolean): Promise<LandingFaq[]>;
  getLandingFaq(id: string): Promise<LandingFaq | undefined>;
  createLandingFaq(faq: InsertLandingFaq): Promise<LandingFaq>;
  updateLandingFaq(id: string, updates: Partial<InsertLandingFaq>): Promise<LandingFaq | undefined>;
  deleteLandingFaq(id: string): Promise<boolean>;

  // Affiliate Settings
  getAffiliateSettings(): Promise<AffiliateSetting[]>;
  getAffiliateSetting(key: string): Promise<AffiliateSetting | undefined>;
  upsertAffiliateSetting(key: string, value: string, type?: string): Promise<AffiliateSetting>;

  // Future Intelligence - Autopilot Rules
  getAutopilotRules(userId: string): Promise<AutopilotRule[]>;
  getAutopilotRule(id: string): Promise<AutopilotRule | undefined>;
  createAutopilotRule(rule: InsertAutopilotRule & { userId: string }): Promise<AutopilotRule>;
  updateAutopilotRule(id: string, updates: Partial<InsertAutopilotRule>): Promise<AutopilotRule | undefined>;
  deleteAutopilotRule(id: string): Promise<boolean>;

  // Future Intelligence - Leak Alerts
  getLeakAlerts(userId: string, options?: { includeDismissed?: boolean }): Promise<LeakAlert[]>;
  getLeakAlert(id: string): Promise<LeakAlert | undefined>;
  createLeakAlert(alert: InsertLeakAlert & { userId: string }): Promise<LeakAlert>;
  updateLeakAlert(id: string, updates: Partial<LeakAlert>): Promise<LeakAlert | undefined>;
  dismissLeakAlert(id: string): Promise<LeakAlert | undefined>;
  deleteLeakAlert(id: string): Promise<boolean>;

  // Future Intelligence - Trial Events
  getTrialEvents(userId: string): Promise<TrialEvent[]>;
  createTrialEvent(event: InsertTrialEvent & { userId: string }): Promise<TrialEvent>;
  hasTrialEvent(userId: string, eventType: string): Promise<boolean>;

  // Future Intelligence - What-If Scenarios
  getWhatIfScenarios(userId: string, savedOnly?: boolean): Promise<WhatIfScenario[]>;
  getWhatIfScenario(id: string): Promise<WhatIfScenario | undefined>;
  createWhatIfScenario(scenario: InsertWhatIfScenario & { userId: string }): Promise<WhatIfScenario>;
  updateWhatIfScenario(id: string, updates: Partial<InsertWhatIfScenario>): Promise<WhatIfScenario | undefined>;
  deleteWhatIfScenario(id: string): Promise<boolean>;

  // Future Intelligence - Spendability Snapshots
  getSpendabilitySnapshot(userId: string, date: string): Promise<SpendabilitySnapshot | undefined>;
  createSpendabilitySnapshot(snapshot: InsertSpendabilitySnapshot & { userId: string }): Promise<SpendabilitySnapshot>;

  // Future Intelligence - Payday Recommendations
  getPaydayRecommendations(userId: string): Promise<PaydayRecommendation[]>;
  getPaydayRecommendation(id: string): Promise<PaydayRecommendation | undefined>;
  createPaydayRecommendation(recommendation: InsertPaydayRecommendation & { userId: string }): Promise<PaydayRecommendation>;
  updatePaydayRecommendation(id: string, updates: Partial<PaydayRecommendation>): Promise<PaydayRecommendation | undefined>;
  deletePaydayRecommendation(id: string): Promise<boolean>;

  // Receipts
  getReceipts(userId: string, options?: { startDate?: string; endDate?: string; category?: string }): Promise<Receipt[]>;
  getReceipt(id: string): Promise<Receipt | undefined>;
  createReceipt(receipt: InsertReceipt & { userId: string }): Promise<Receipt>;
  updateReceipt(id: string, updates: Partial<InsertReceipt>): Promise<Receipt | undefined>;
  deleteReceipt(id: string): Promise<boolean>;

  // Support Tickets
  createSupportTicket(ticket: InsertSupportTicket): Promise<SupportTicket>;
  getSupportTickets(): Promise<SupportTicket[]>;
  getSupportTicketById(id: string): Promise<SupportTicket | undefined>;
  getSupportTicketByNumber(ticketNumber: string): Promise<SupportTicket | undefined>;
  getSupportTicketsByUserId(userId: string): Promise<SupportTicket[]>;
  updateSupportTicket(id: string, updates: Partial<SupportTicket>): Promise<SupportTicket | undefined>;
  // Support Ticket Messages
  createSupportTicketMessage(msg: InsertSupportTicketMessage): Promise<SupportTicketMessage>;
  getMessagesByTicketId(ticketId: string): Promise<SupportTicketMessage[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private bills: Map<string, Bill>;
  private expenses: Map<string, Expense>;
  private incomes: Map<string, Income>;
  private budgets: Map<string, Budget>;
  private savingsGoals: Map<string, SavingsGoal>;

  constructor() {
    this.users = new Map();
    this.bills = new Map();
    this.expenses = new Map();
    this.incomes = new Map();
    this.budgets = new Map();
    this.savingsGoals = new Map();
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.googleId === googleId,
    );
  }

  async getUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async createUser(insertUser: InsertUser & { isAdmin?: boolean; isApproved?: boolean; email?: string; firstName?: string; lastName?: string; googleId?: string; trialEmailReminder?: string; selectedPlanId?: string | null; emailVerified?: string; mfaRequired?: string }): Promise<User> {
    const id = randomUUID();
    const user: User = {
      ...insertUser,
      id,
      email: insertUser.email || null,
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null,
      phone: null,
      mfaSecret: null,
      mfaEnabled: "false",
      isAdmin: insertUser.isAdmin ? "true" : "false",
      isApproved: insertUser.isApproved ? "true" : "false",
      onboardingComplete: "false",
      googleId: insertUser.googleId || null,
      trialEmailReminder: insertUser.trialEmailReminder || "true",
      selectedPlanId: insertUser.selectedPlanId || null,
      emailVerified: insertUser.emailVerified || "false",
      emailVerificationToken: null,
      emailVerificationExpiry: null,
      mfaRequired: insertUser.mfaRequired || "false",
      createdAt: new Date().toISOString(),
      phoneEnc: null,
    } as User;
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: { username?: string; password?: string; isAdmin?: boolean; isApproved?: boolean; email?: string | null; firstName?: string | null; lastName?: string | null; phone?: string | null; googleId?: string; emailVerified?: string; mxUserGuid?: string; displayName?: string | null; birthday?: string | null; timezone?: string | null; avatarUrl?: string | null; country?: string | null }): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    const updatedUser: User = {
      ...user,
      ...(updates.username && { username: updates.username }),
      ...(updates.password && { password: updates.password }),
      ...(updates.isAdmin !== undefined && { isAdmin: updates.isAdmin ? "true" : "false" }),
      ...(updates.isApproved !== undefined && { isApproved: updates.isApproved ? "true" : "false" }),
      ...(updates.email !== undefined && { email: updates.email }),
      ...(updates.firstName !== undefined && { firstName: updates.firstName }),
      ...(updates.lastName !== undefined && { lastName: updates.lastName }),
      ...(updates.phone !== undefined && { phone: updates.phone }),
      ...(updates.emailVerified !== undefined && { emailVerified: updates.emailVerified }),
      ...(updates.displayName !== undefined && { displayName: updates.displayName }),
      ...(updates.birthday !== undefined && { birthday: updates.birthday }),
      ...(updates.timezone !== undefined && { timezone: updates.timezone }),
      ...(updates.avatarUrl !== undefined && { avatarUrl: updates.avatarUrl }),
      ...(updates.country !== undefined && { country: updates.country }),
    };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async updateUserPreferences(id: string, updates: { prefNeedsReview?: boolean; prefEditPending?: boolean; prefMerchantDisplay?: string }): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updatedUser: User = {
      ...user,
      ...(updates.prefNeedsReview !== undefined && { prefNeedsReview: updates.prefNeedsReview }),
      ...(updates.prefEditPending !== undefined && { prefEditPending: updates.prefEditPending }),
      ...(updates.prefMerchantDisplay !== undefined && { prefMerchantDisplay: updates.prefMerchantDisplay }),
    };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  async updateUserMfa(id: string, mfaSecret: string, mfaEnabled: boolean, backupCodes?: string[]): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    const updatedUser: User = {
      ...user,
      mfaSecret,
      mfaEnabled: mfaEnabled ? "true" : "false",
      mfaBackupCodes: backupCodes ?? (mfaEnabled ? user.mfaBackupCodes : null),
    };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.emailVerificationToken === token);
  }

  async setEmailVerificationToken(userId: string, token: string, expiry: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      this.users.set(userId, { ...user, emailVerificationToken: token, emailVerificationExpiry: expiry });
    }
  }

  async verifyUserEmail(userId: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    const updatedUser: User = { ...user, emailVerified: "true", emailVerificationToken: null, emailVerificationExpiry: null };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  // Bills
  async getBills(userId: string): Promise<Bill[]> {
    return Array.from(this.bills.values()).filter(b => b.userId === userId);
  }

  async getAllBills(): Promise<Bill[]> {
    return Array.from(this.bills.values());
  }

  async getBill(id: string): Promise<Bill | undefined> {
    return this.bills.get(id);
  }

  async createBill(insertBill: InsertBill & { userId: string }): Promise<Bill> {
    const id = randomUUID();
    const bill: Bill = {
      ...insertBill,
      id,
      userId: insertBill.userId,
      lastNotifiedCycle: null,
      notes: insertBill.notes || null,
      customDates: insertBill.customDates || null,
      startingBalance: insertBill.startingBalance || null,
      paymentsRemaining: insertBill.paymentsRemaining || null,
      startDate: insertBill.startDate || null,
      endDate: insertBill.endDate ?? null,
      isPaused: insertBill.isPaused || null,
      merchant: insertBill.merchant || null,
      linkedPlaidAccountId: insertBill.linkedPlaidAccountId ?? null,
    };
    this.bills.set(id, bill);
    return bill;
  }

  async updateBill(id: string, updates: Partial<InsertBill>): Promise<Bill | undefined> {
    const bill = this.bills.get(id);
    if (!bill) return undefined;

    const updatedBill: Bill = {
      ...bill,
      ...updates,
      notes: updates.notes !== undefined ? updates.notes || null : bill.notes,
      customDates: updates.customDates !== undefined ? updates.customDates || null : bill.customDates,
    };
    this.bills.set(id, updatedBill);
    return updatedBill;
  }

  async deleteBill(id: string): Promise<boolean> {
    return this.bills.delete(id);
  }

  async updateBillNotifiedCycle(id: string, cycle: string): Promise<void> {
    const bill = this.bills.get(id);
    if (bill) {
      bill.lastNotifiedCycle = cycle;
      this.bills.set(id, bill);
    }
  }

  // Expenses
  async getExpenses(userId: string): Promise<Expense[]> {
    return Array.from(this.expenses.values()).filter(e => e.userId === userId);
  }

  async getAllExpenses(): Promise<Expense[]> {
    return Array.from(this.expenses.values());
  }

  async getExpense(id: string): Promise<Expense | undefined> {
    return this.expenses.get(id);
  }

  async createExpense(insertExpense: InsertExpense & { userId: string }): Promise<Expense> {
    const id = randomUUID();
    const expense: Expense = { 
      ...insertExpense, 
      id,
      userId: insertExpense.userId,
      notes: insertExpense.notes || null,
      taxDeductible: insertExpense.taxDeductible ?? null,
      taxCategory: insertExpense.taxCategory ?? null,
      isBusinessExpense: insertExpense.isBusinessExpense ?? null,
    };
    this.expenses.set(id, expense);
    return expense;
  }

  async updateExpense(id: string, updates: Partial<InsertExpense>): Promise<Expense | undefined> {
    const expense = this.expenses.get(id);
    if (!expense) return undefined;
    
    const updatedExpense: Expense = { 
      ...expense, 
      ...updates,
      notes: updates.notes !== undefined ? updates.notes || null : expense.notes
    };
    this.expenses.set(id, updatedExpense);
    return updatedExpense;
  }

  async deleteExpense(id: string): Promise<boolean> {
    return this.expenses.delete(id);
  }

  // Income
  async getIncomes(userId: string): Promise<Income[]> {
    return Array.from(this.incomes.values()).filter(i => i.userId === userId);
  }

  async getIncome(id: string): Promise<Income | undefined> {
    return this.incomes.get(id);
  }

  async createIncome(insertIncome: InsertIncome & { userId: string }): Promise<Income> {
    const id = randomUUID();
    const incomeRecord: Income = {
      ...insertIncome,
      id,
      userId: insertIncome.userId,
      isRecurring: insertIncome.isRecurring || "false",
      recurrence: insertIncome.recurrence || null,
      dueDay: insertIncome.dueDay ?? null,
      customDates: insertIncome.customDates || null,
      notes: insertIncome.notes || null,
      linkedPlaidAccountId: insertIncome.linkedPlaidAccountId ?? null,
      amountChangeDate: insertIncome.amountChangeDate ?? null,
      futureAmount: insertIncome.futureAmount ?? null,
    };
    this.incomes.set(id, incomeRecord);
    return incomeRecord;
  }

  async updateIncome(id: string, updates: Partial<InsertIncome>): Promise<Income | undefined> {
    const income = this.incomes.get(id);
    if (!income) return undefined;

    const updatedIncome: Income = {
      ...income,
      ...updates,
      notes: updates.notes !== undefined ? updates.notes || null : income.notes,
    };
    this.incomes.set(id, updatedIncome);
    return updatedIncome;
  }

  async deleteIncome(id: string): Promise<boolean> {
    return this.incomes.delete(id);
  }

  // Budgets
  async getBudgets(userId: string): Promise<Budget[]> {
    return Array.from(this.budgets.values()).filter(b => b.userId === userId);
  }

  async getBudget(id: string): Promise<Budget | undefined> {
    return this.budgets.get(id);
  }

  async getBudgetsByMonth(userId: string, month: string): Promise<Budget[]> {
    return Array.from(this.budgets.values()).filter(b => b.userId === userId && b.month === month);
  }

  async createBudget(insertBudget: InsertBudget & { userId: string }): Promise<Budget> {
    const id = randomUUID();
    const budget: Budget = {
      ...insertBudget,
      id,
      userId: insertBudget.userId,
    };
    this.budgets.set(id, budget);
    return budget;
  }

  async updateBudget(id: string, updates: Partial<InsertBudget>): Promise<Budget | undefined> {
    const budget = this.budgets.get(id);
    if (!budget) return undefined;

    const updatedBudget: Budget = {
      ...budget,
      ...updates,
    };
    this.budgets.set(id, updatedBudget);
    return updatedBudget;
  }

  async deleteBudget(id: string): Promise<boolean> {
    return this.budgets.delete(id);
  }

  // Savings Goals
  async getSavingsGoals(userId: string): Promise<SavingsGoal[]> {
    return Array.from(this.savingsGoals.values()).filter(g => g.userId === userId);
  }

  async getSavingsGoal(id: string): Promise<SavingsGoal | undefined> {
    return this.savingsGoals.get(id);
  }

  async createSavingsGoal(insertGoal: InsertSavingsGoal & { userId: string }): Promise<SavingsGoal> {
    const id = randomUUID();
    const goal: SavingsGoal = {
      ...insertGoal,
      id,
      userId: insertGoal.userId,
      currentAmount: insertGoal.currentAmount || "0",
      targetDate: insertGoal.targetDate || null,
      color: insertGoal.color || "#3b82f6",
      notes: insertGoal.notes || null,
    };
    this.savingsGoals.set(id, goal);
    return goal;
  }

  async updateSavingsGoal(id: string, updates: Partial<InsertSavingsGoal>): Promise<SavingsGoal | undefined> {
    const goal = this.savingsGoals.get(id);
    if (!goal) return undefined;

    const updatedGoal: SavingsGoal = {
      ...goal,
      ...updates,
      notes: updates.notes !== undefined ? updates.notes || null : goal.notes,
    };
    this.savingsGoals.set(id, updatedGoal);
    return updatedGoal;
  }

  async deleteSavingsGoal(id: string): Promise<boolean> {
    return this.savingsGoals.delete(id);
  }

  // Plaid Items (MemStorage stubs)
  async getPlaidItems(_userId: string): Promise<PlaidItem[]> { return []; }
  async getPlaidItem(_id: string): Promise<PlaidItem | undefined> { return undefined; }
  async getPlaidItemByItemId(_itemId: string): Promise<PlaidItem | undefined> { return undefined; }
  async createPlaidItem(item: InsertPlaidItem): Promise<PlaidItem> { return { id: randomUUID(), ...item, cursor: item.cursor || null, status: item.status || "active", institutionId: item.institutionId || null, institutionName: item.institutionName || null, createdAt: item.createdAt || null, accessTokenEnc: null, itemIdEnc: null }; }
  async updatePlaidItem(_id: string, _updates: Partial<PlaidItem>): Promise<PlaidItem | undefined> { return undefined; }
  async deletePlaidItem(_id: string): Promise<boolean> { return false; }

  // Plaid Accounts (MemStorage stubs)
  async getPlaidAccounts(_plaidItemId: string): Promise<PlaidAccount[]> { return []; }
  async getAllPlaidAccounts(_userId: string): Promise<PlaidAccount[]> { return []; }
  async getPlaidAccountByAccountId(_accountId: string): Promise<PlaidAccount | undefined> { return undefined; }
  async createPlaidAccount(account: InsertPlaidAccount): Promise<PlaidAccount> { return { id: randomUUID(), ...account, officialName: account.officialName || null, subtype: account.subtype || null, mask: account.mask || null, balanceCurrent: account.balanceCurrent || null, balanceAvailable: account.balanceAvailable || null, balanceLimit: account.balanceLimit || null, isoCurrencyCode: account.isoCurrencyCode || "CAD", lastSynced: account.lastSynced || null, isActive: account.isActive || "true" }; }
  async updatePlaidAccount(_id: string, _updates: Partial<PlaidAccount>): Promise<PlaidAccount | undefined> { return undefined; }
  async deletePlaidAccountsByItemId(_plaidItemId: string): Promise<void> {}

  // Plaid Transactions (MemStorage stubs)
  async getPlaidTransactions(_accountIds: string[], _options?: { startDate?: string; endDate?: string }): Promise<PlaidTransaction[]> { return []; }
  async getPlaidTransactionByTransactionId(_transactionId: string): Promise<PlaidTransaction | undefined> { return undefined; }
  async getRecentTransactionIds(_userId: string, _daysBack: number): Promise<string[]> { return []; }
  async createPlaidTransaction(transaction: InsertPlaidTransaction): Promise<PlaidTransaction> { return { id: randomUUID(), ...transaction, merchantName: transaction.merchantName || null, category: transaction.category || null, personalCategory: transaction.personalCategory || null, pending: transaction.pending || "false", matchType: transaction.matchType || null, matchedBillId: transaction.matchedBillId || null, matchedExpenseId: transaction.matchedExpenseId || null, matchedIncomeId: transaction.matchedIncomeId || null, reconciled: transaction.reconciled || "false", isoCurrencyCode: transaction.isoCurrencyCode || "CAD", taxDeductible: transaction.taxDeductible || null, taxCategory: transaction.taxCategory || null, isBusinessExpense: transaction.isBusinessExpense || null, logoUrl: transaction.logoUrl || null, createdAt: transaction.createdAt || null, merchantCleanName: null, merchantLogoUrl: null, subcategory: null, merchantType: null, isSubscription: "false", enrichmentSource: null, enrichmentConfidence: null } as PlaidTransaction; }
  async updatePlaidTransaction(_id: string, _updates: Partial<PlaidTransaction>): Promise<PlaidTransaction | undefined> { return undefined; }
  async deleteRemovedTransactions(_transactionIds: string[]): Promise<void> {}
  async getUnmatchedTransactions(_accountIds: string[]): Promise<PlaidTransaction[]> { return []; }

  // MX stubs (MemStorage)
  async getMxMembers(_userId: string): Promise<MxMember[]> { return []; }
  async getMxMember(_id: string): Promise<MxMember | undefined> { return undefined; }
  async getMxMemberByGuid(_memberGuid: string): Promise<MxMember | undefined> { return undefined; }
  async createMxMember(member: InsertMxMember): Promise<MxMember> { return { id: randomUUID(), ...member } as MxMember; }
  async updateMxMember(_id: string, _updates: Partial<MxMember>): Promise<MxMember | undefined> { return undefined; }
  async deleteMxMember(_id: string): Promise<boolean> { return false; }
  async getMxAccounts(_mxMemberId: string): Promise<MxAccount[]> { return []; }
  async getMxAccountsByUserId(_userId: string): Promise<MxAccount[]> { return []; }
  async getMxAccountByGuid(_accountGuid: string): Promise<MxAccount | undefined> { return undefined; }
  async createMxAccount(account: InsertMxAccount): Promise<MxAccount> { return { id: randomUUID(), ...account } as MxAccount; }
  async updateMxAccount(_id: string, _updates: Partial<MxAccount>): Promise<MxAccount | undefined> { return undefined; }
  async deleteMxAccountsByMemberId(_mxMemberId: string): Promise<void> {}
  async getMxTransactions(_accountIds: string[], _options?: { startDate?: string; endDate?: string }): Promise<MxTransaction[]> { return []; }
  async getMxTransactionByGuid(_transactionGuid: string): Promise<MxTransaction | undefined> { return undefined; }
  async createMxTransaction(transaction: InsertMxTransaction): Promise<MxTransaction> { return { id: randomUUID(), ...transaction } as MxTransaction; }
  async upsertMxTransactions(_transactions: InsertMxTransaction[]): Promise<void> {}
  async updateMxTransaction(_id: string, _updates: Partial<MxTransaction>): Promise<MxTransaction | undefined> { return undefined; }
  async deleteMxTransactionsByAccountId(_mxAccountId: string): Promise<void> {}
  async getUnmatchedMxTransactions(_accountIds: string[]): Promise<MxTransaction[]> { return []; }

  // Onboarding stubs
  async getOnboardingAnalysis(_userId: string): Promise<OnboardingAnalysis | undefined> { return undefined; }
  async createOnboardingAnalysis(_analysis: InsertOnboardingAnalysis): Promise<OnboardingAnalysis> { return {} as OnboardingAnalysis; }
  async updateOnboardingAnalysis(_userId: string, _updates: Partial<OnboardingAnalysis>): Promise<OnboardingAnalysis | undefined> { return undefined; }
  async deleteOnboardingAnalysis(_userId: string): Promise<boolean> { return false; }
  async updateUserOnboarding(_userId: string, _complete: boolean): Promise<void> {}

  // Household stubs (MemStorage)
  async createHousehold(_name: string, _ownerId: string): Promise<Household> { return {} as Household; }
  async getHousehold(_id: string): Promise<Household | undefined> { return undefined; }
  async getHouseholdByUserId(_userId: string): Promise<Household | undefined> { return undefined; }
  async updateHousehold(_id: string, _updates: Partial<Household>): Promise<Household | undefined> { return undefined; }
  async deleteHousehold(_id: string): Promise<boolean> { return false; }
  async getHouseholdMembers(_householdId: string): Promise<(HouseholdMember & { user: User })[]> { return []; }
  async getHouseholdMemberUserIds(_householdId: string): Promise<string[]> { return []; }
  async getHouseholdMember(_householdId: string, _userId: string): Promise<HouseholdMember | undefined> { return undefined; }
  async addHouseholdMember(_householdId: string, _userId: string, _role: string): Promise<HouseholdMember> { return {} as HouseholdMember; }
  async removeHouseholdMember(_householdId: string, _userId: string): Promise<boolean> { return false; }
  async updateHouseholdMemberRole(_householdId: string, _userId: string, _role: string): Promise<HouseholdMember | undefined> { return undefined; }
  async createInvitation(_invitation: Omit<InsertHouseholdInvitation, 'token' | 'status' | 'createdAt' | 'expiresAt'>): Promise<HouseholdInvitation> { return {} as HouseholdInvitation; }
  async getInvitationByToken(_token: string): Promise<HouseholdInvitation | undefined> { return undefined; }
  async getInvitationsByEmail(_email: string): Promise<HouseholdInvitation[]> { return []; }
  async getInvitationsByHousehold(_householdId: string): Promise<HouseholdInvitation[]> { return []; }
  async updateInvitationStatus(_id: string, _status: string): Promise<HouseholdInvitation | undefined> { return undefined; }
  async deleteInvitation(_id: string): Promise<boolean> { return false; }
  async getBillsByUserIds(_userIds: string[]): Promise<Bill[]> { return []; }
  async getExpensesByUserIds(_userIds: string[]): Promise<Expense[]> { return []; }
  async getIncomesByUserIds(_userIds: string[]): Promise<Income[]> { return []; }
  async getBudgetsByUserIds(_userIds: string[]): Promise<Budget[]> { return []; }
  async getBudgetsByUserIdsAndMonth(_userIds: string[], _month: string): Promise<Budget[]> { return []; }
  async getSavingsGoalsByUserIds(_userIds: string[]): Promise<SavingsGoal[]> { return []; }
  async getPlaidItemsByUserIds(_userIds: string[]): Promise<PlaidItem[]> { return []; }

  async updateUserHousehold(_userId: string, _updates: { householdName?: string | null; country?: string | null; addressLine1?: string | null; city?: string | null; provinceState?: string | null; postalCode?: string | null }): Promise<User | undefined> { return undefined; }
  async getFinancialProfessional(_userId: string): Promise<FinancialProfessional | undefined> { return undefined; }
  async grantFinancialAccess(_userId: string, professionalEmail: string, professionalName: string | undefined, accessToken: string, expiresAt: string): Promise<FinancialProfessional> {
    return { id: randomUUID(), userId: _userId, professionalEmail, professionalName: professionalName || null, accessToken, grantedAt: new Date().toISOString(), expiresAt, isActive: "true", createdAt: new Date().toISOString() };
  }
  async revokeFinancialAccess(_userId: string): Promise<boolean> { return false; }

  // Manual Accounts stubs (MemStorage)
  async getManualAccounts(_userId: string): Promise<ManualAccount[]> { return []; }
  async getManualAccount(_id: string): Promise<ManualAccount | undefined> { return undefined; }
  async createManualAccount(account: InsertManualAccount & { userId: string }): Promise<ManualAccount> {
    return { id: randomUUID(), ...account, balance: account.balance || "0", currency: account.currency || "USD", isActive: "true", createdAt: new Date().toISOString() } as ManualAccount;
  }
  async updateManualAccount(_id: string, _updates: Partial<InsertManualAccount>): Promise<ManualAccount | undefined> { return undefined; }
  async deleteManualAccount(_id: string): Promise<boolean> { return false; }

  // Manual Transactions stubs (MemStorage)
  async getManualTransactions(_accountId: string, _options?: { startDate?: string; endDate?: string }): Promise<ManualTransaction[]> { return []; }
  async getManualTransactionsByUser(_userId: string, _options?: { startDate?: string; endDate?: string }): Promise<ManualTransaction[]> { return []; }
  async getManualTransaction(_id: string): Promise<ManualTransaction | undefined> { return undefined; }
  async createManualTransaction(transaction: InsertManualTransaction & { userId: string; accountId: string }): Promise<ManualTransaction> {
    return { id: randomUUID(), ...transaction, isTransfer: "false", createdAt: new Date().toISOString() } as ManualTransaction;
  }
  async updateManualTransaction(_id: string, _updates: Partial<InsertManualTransaction>): Promise<ManualTransaction | undefined> { return undefined; }
  async deleteManualTransaction(_id: string): Promise<boolean> { return false; }

  // Bulk delete stubs (MemStorage)
  async deleteAllManualTransactionsByUser(_userId: string): Promise<void> {}
  async deleteAllManualAccountsByUser(_userId: string): Promise<void> {}
  async deleteAllPlaidTransactionsByUser(_userId: string): Promise<void> {}
  async deleteAllPlaidAccountsByUser(_userId: string): Promise<void> {}
  async deleteAllPlaidItemsByUser(_userId: string): Promise<void> {}
  async deleteAllReconciliationRulesByUser(_userId: string): Promise<void> {}
  async deleteAllExpensesByUser(_userId: string): Promise<void> {}
  async deleteAllBillsByUser(_userId: string): Promise<void> {}
  async deleteAllIncomesByUser(_userId: string): Promise<void> {}
  async deleteAllBudgetsByUser(_userId: string): Promise<void> {}
  async deleteAllSavingsGoalsByUser(_userId: string): Promise<void> {}
  async deleteAllCategoriesByUser(_userId: string): Promise<void> {}
  async deleteAllNotificationsByUser(_userId: string): Promise<void> {}
  async deleteAllHouseholdMembersByUser(_userId: string): Promise<void> {}
  async deleteAllHouseholdsByUser(_userId: string): Promise<void> {}
  async deleteAllInvitationCodesByUser(_userId: string): Promise<void> {}
  async deleteAllNotificationSettingsByUser(_userId: string): Promise<void> {}
  async deleteAllRecurringExpensesByUser(_userId: string): Promise<void> {}
  async deleteAllSyncSchedulesByUser(_userId: string): Promise<void> {}
  async deleteAllBudgetAlertsByUser(_userId: string): Promise<void> {}
  async deleteAllOnboardingAnalysisByUser(_userId: string): Promise<void> {}
  async deleteAllSpendingAlertsByUser(_userId: string): Promise<void> {}
  async deleteAllReferralCodesByUser(_userId: string): Promise<void> {}
  async deleteAllReferralsByUser(_userId: string): Promise<void> {}
  async deleteAllDebtDetailsByUser(_userId: string): Promise<void> {}

  // Debt Details (MemStorage stubs)
  async getDebtDetails(_userId: string): Promise<DebtDetails[]> { return []; }
  async getDebtDetail(_id: string): Promise<DebtDetails | undefined> { return undefined; }
  async getDebtDetailByPlaidAccount(_plaidAccountId: string): Promise<DebtDetails | undefined> { return undefined; }
  async createDebtDetail(_debt: InsertDebtDetails & { userId: string }): Promise<DebtDetails> { throw new Error("Not implemented"); }
  async updateDebtDetail(_id: string, _updates: Partial<InsertDebtDetails>): Promise<DebtDetails | undefined> { return undefined; }
  async deleteDebtDetail(_id: string): Promise<boolean> { return false; }

  // AI Insights (MemStorage stubs)
  async getAiInsights(_userId: string, _options?: { includeRead?: boolean; includeDismissed?: boolean }): Promise<AiInsight[]> { return []; }
  async getAiInsight(_id: string): Promise<AiInsight | undefined> { return undefined; }
  async createAiInsight(_insight: InsertAiInsight): Promise<AiInsight> { throw new Error("Not implemented"); }
  async updateAiInsight(_id: string, _updates: Partial<AiInsight>): Promise<AiInsight | undefined> { return undefined; }
  async deleteAiInsight(_id: string): Promise<boolean> { return false; }
  async deleteExpiredAiInsights(): Promise<void> {}

  // Transaction Anomalies (MemStorage stubs)
  async getTransactionAnomalies(_userId: string, _options?: { includeReviewed?: boolean }): Promise<TransactionAnomaly[]> { return []; }
  async getTransactionAnomaly(_id: string): Promise<TransactionAnomaly | undefined> { return undefined; }
  async getTransactionAnomalyByTransactionId(_transactionId: string): Promise<TransactionAnomaly | undefined> { return undefined; }
  async createTransactionAnomaly(_anomaly: InsertTransactionAnomaly): Promise<TransactionAnomaly> { throw new Error("Not implemented"); }
  async updateTransactionAnomaly(_id: string, _updates: Partial<TransactionAnomaly>): Promise<TransactionAnomaly | undefined> { return undefined; }
  async deleteTransactionAnomaly(_id: string): Promise<boolean> { return false; }

  // Savings Recommendations (MemStorage stubs)
  async getSavingsRecommendations(_userId: string, _options?: { status?: string }): Promise<SavingsRecommendation[]> { return []; }
  async getSavingsRecommendation(_id: string): Promise<SavingsRecommendation | undefined> { return undefined; }
  async createSavingsRecommendation(_recommendation: InsertSavingsRecommendation): Promise<SavingsRecommendation> { throw new Error("Not implemented"); }
  async updateSavingsRecommendation(_id: string, _updates: Partial<SavingsRecommendation>): Promise<SavingsRecommendation | undefined> { return undefined; }
  async deleteSavingsRecommendation(_id: string): Promise<boolean> { return false; }
  async deleteExpiredSavingsRecommendations(): Promise<void> {}

  // Landing Page (MemStorage stubs)
  async getLandingSettings(): Promise<LandingSetting[]> { return []; }
  async getLandingSetting(_key: string): Promise<LandingSetting | undefined> { return undefined; }
  async upsertLandingSetting(_key: string, _value: string, _type?: string): Promise<LandingSetting> { throw new Error("Not implemented"); }
  async deleteLandingSetting(_key: string): Promise<boolean> { return false; }

  async getLandingFeatures(_activeOnly?: boolean): Promise<LandingFeature[]> { return []; }
  async getLandingFeature(_id: string): Promise<LandingFeature | undefined> { return undefined; }
  async createLandingFeature(_feature: InsertLandingFeature): Promise<LandingFeature> { throw new Error("Not implemented"); }
  async updateLandingFeature(_id: string, _updates: Partial<InsertLandingFeature>): Promise<LandingFeature | undefined> { return undefined; }
  async deleteLandingFeature(_id: string): Promise<boolean> { return false; }

  async getLandingTestimonials(_activeOnly?: boolean): Promise<LandingTestimonial[]> { return []; }
  async getLandingTestimonial(_id: string): Promise<LandingTestimonial | undefined> { return undefined; }
  async createLandingTestimonial(_testimonial: InsertLandingTestimonial): Promise<LandingTestimonial> { throw new Error("Not implemented"); }
  async updateLandingTestimonial(_id: string, _updates: Partial<InsertLandingTestimonial>): Promise<LandingTestimonial | undefined> { return undefined; }
  async deleteLandingTestimonial(_id: string): Promise<boolean> { return false; }

  async getLandingPricing(_activeOnly?: boolean): Promise<LandingPricing[]> { return []; }
  async getLandingPricingPlan(_id: string): Promise<LandingPricing | undefined> { return undefined; }
  async getLandingPricingByStripePriceId(_stripePriceId: string): Promise<LandingPricing | undefined> { return undefined; }
  async createLandingPricing(_pricing: InsertLandingPricing): Promise<LandingPricing> { throw new Error("Not implemented"); }
  async updateLandingPricing(_id: string, _updates: Partial<InsertLandingPricing>): Promise<LandingPricing | undefined> { return undefined; }
  async deleteLandingPricing(_id: string): Promise<boolean> { return false; }

  // Stripe user info stubs
  async getUserByStripeCustomerId(_stripeCustomerId: string): Promise<User | undefined> { return undefined; }
  async updateUserStripeInfo(_userId: string, _stripeInfo: any): Promise<User | undefined> { return undefined; }

  async getLandingComparison(_activeOnly?: boolean): Promise<LandingComparison[]> { return []; }
  async getLandingComparisonRow(_id: string): Promise<LandingComparison | undefined> { return undefined; }
  async createLandingComparison(_row: InsertLandingComparison): Promise<LandingComparison> { throw new Error("Not implemented"); }
  async updateLandingComparison(_id: string, _updates: Partial<InsertLandingComparison>): Promise<LandingComparison | undefined> { return undefined; }
  async deleteLandingComparison(_id: string): Promise<boolean> { return false; }

  async getLandingFaqs(_activeOnly?: boolean): Promise<LandingFaq[]> { return []; }
  async getLandingFaq(_id: string): Promise<LandingFaq | undefined> { return undefined; }
  async createLandingFaq(_faq: InsertLandingFaq): Promise<LandingFaq> { throw new Error("Not implemented"); }
  async updateLandingFaq(_id: string, _updates: Partial<InsertLandingFaq>): Promise<LandingFaq | undefined> { return undefined; }
  async deleteLandingFaq(_id: string): Promise<boolean> { return false; }

  // Affiliate settings stubs
  async getAffiliateSettings(): Promise<AffiliateSetting[]> { return []; }
  async getAffiliateSetting(_key: string): Promise<AffiliateSetting | undefined> { return undefined; }
  async upsertAffiliateSetting(_key: string, _value: string, _type?: string): Promise<AffiliateSetting> { throw new Error("Not implemented"); }

  // Receipts stubs (MemStorage)
  async getReceipts(_userId: string, _options?: { startDate?: string; endDate?: string; category?: string }): Promise<Receipt[]> { return []; }
  async getReceipt(_id: string): Promise<Receipt | undefined> { return undefined; }
  async createReceipt(receipt: InsertReceipt & { userId: string }): Promise<Receipt> {
    return {
      id: randomUUID(),
      ...receipt,
      merchant: receipt.merchant || "Unknown",
      amount: String(receipt.amount || "0"),
      date: receipt.date,
      category: receipt.category || "Uncategorized",
      confidence: receipt.confidence ?? 0,
      matchStatus: receipt.matchStatus || "unmatched",
      createdAt: new Date().toISOString(),
    } as Receipt;
  }
  async updateReceipt(_id: string, _updates: Partial<InsertReceipt>): Promise<Receipt | undefined> { return undefined; }
  async deleteReceipt(_id: string): Promise<boolean> { return false; }

  // Support Tickets stubs (MemStorage)
  async createSupportTicket(ticket: InsertSupportTicket): Promise<SupportTicket> {
    return { id: randomUUID(), ...ticket, status: ticket.status || "open", emailSent: ticket.emailSent || "false", createdAt: new Date().toISOString() } as SupportTicket;
  }
  async getSupportTickets(): Promise<SupportTicket[]> { return []; }
  async getSupportTicketById(_id: string): Promise<SupportTicket | undefined> { return undefined; }
  async getSupportTicketByNumber(_ticketNumber: string): Promise<SupportTicket | undefined> { return undefined; }
  async getSupportTicketsByUserId(_userId: string): Promise<SupportTicket[]> { return []; }
  async updateSupportTicket(_id: string, _updates: Partial<SupportTicket>): Promise<SupportTicket | undefined> { return undefined; }
  async createSupportTicketMessage(msg: InsertSupportTicketMessage): Promise<SupportTicketMessage> {
    return { id: randomUUID(), ...msg, createdAt: new Date().toISOString() } as SupportTicketMessage;
  }
  async getMessagesByTicketId(_ticketId: string): Promise<SupportTicketMessage[]> { return []; }

  // Stub implementations for methods not used by MemStorage
  async getNotificationSettings(_userId: string): Promise<NotificationSettings | undefined> { return undefined; }
  async createNotificationSettings(_settings: InsertNotificationSettings): Promise<NotificationSettings> { return undefined as any; }
  async updateNotificationSettings(_userId: string, _updates: Partial<NotificationSettings>): Promise<NotificationSettings | undefined> { return undefined; }
  async getCustomCategories(_userId: string): Promise<CustomCategory[]> { return []; }
  async createCustomCategory(_category: InsertCustomCategory): Promise<CustomCategory> { return undefined as any; }
  async updateCustomCategory(_id: string, _updates: Partial<CustomCategory>): Promise<CustomCategory | undefined> { return undefined; }
  async deleteCustomCategory(_id: string): Promise<boolean> { return false; }
  async getNotifications(_userId: string, _limit?: number): Promise<Notification[]> { return []; }
  async getUnreadNotificationCount(_userId: string): Promise<number> { return 0; }
  async createNotification(_notification: InsertNotification): Promise<Notification> { return undefined as any; }
  async markNotificationRead(_id: string): Promise<void> {}
  async markAllNotificationsRead(_userId: string): Promise<void> {}
  async deleteNotification(_id: string): Promise<boolean> { return false; }
  async getReconciliationRules(_userId: string): Promise<ReconciliationRule[]> { return []; }
  async getReconciliationRule(_id: string): Promise<ReconciliationRule | undefined> { return undefined; }
  async findMatchingRule(_userId: string, _merchantName: string): Promise<ReconciliationRule | undefined> { return undefined; }
  async createReconciliationRule(_rule: InsertReconciliationRule): Promise<ReconciliationRule> { return undefined as any; }
  async updateReconciliationRule(_id: string, _updates: Partial<ReconciliationRule>): Promise<ReconciliationRule | undefined> { return undefined; }
  async deleteReconciliationRule(_id: string): Promise<boolean> { return false; }
  async getRecurringExpenses(_userId: string): Promise<RecurringExpense[]> { return []; }
  async getRecurringExpense(_id: string): Promise<RecurringExpense | undefined> { return undefined; }
  async createRecurringExpense(_expense: InsertRecurringExpense): Promise<RecurringExpense> { return undefined as any; }
  async updateRecurringExpense(_id: string, _updates: Partial<RecurringExpense>): Promise<RecurringExpense | undefined> { return undefined; }
  async deleteRecurringExpense(_id: string): Promise<boolean> { return false; }
  async getSyncSchedules(_userId: string): Promise<SyncSchedule[]> { return []; }
  async getSyncSchedule(_id: string): Promise<SyncSchedule | undefined> { return undefined; }
  async getDueSyncSchedules(): Promise<SyncSchedule[]> { return []; }
  async createSyncSchedule(_schedule: InsertSyncSchedule): Promise<SyncSchedule> { return undefined as any; }
  async updateSyncSchedule(_id: string, _updates: Partial<SyncSchedule>): Promise<SyncSchedule | undefined> { return undefined; }
  async deleteSyncSchedule(_id: string): Promise<boolean> { return false; }
  async getBudgetAlerts(_userId: string, _month?: string): Promise<BudgetAlert[]> { return []; }
  async createBudgetAlert(_alert: InsertBudgetAlert): Promise<BudgetAlert> { return undefined as any; }
  async updateBudgetAlert(_id: string, _updates: Partial<BudgetAlert>): Promise<BudgetAlert | undefined> { return undefined; }
  async getReferralCode(_userId: string): Promise<ReferralCode | undefined> { return undefined; }
  async getReferralCodeByCode(_code: string): Promise<ReferralCode | undefined> { return undefined; }
  async createReferralCode(_userId: string, _code: string): Promise<ReferralCode> { return undefined as any; }
  async getReferrals(_referrerId: string): Promise<Referral[]> { return []; }
  async getReferralByEmail(_email: string): Promise<Referral | undefined> { return undefined; }
  async createReferral(_referral: InsertReferral): Promise<Referral> { return undefined as any; }
  async updateReferralStatus(_id: string, _status: string, _referredUserId?: string): Promise<Referral | undefined> { return undefined; }
  async incrementReferralCount(_userId: string, _successful?: boolean): Promise<void> {}
  async getInvestmentAccounts(_userId: string): Promise<InvestmentAccount[]> { return []; }
  async getInvestmentAccount(_id: string): Promise<InvestmentAccount | undefined> { return undefined; }
  async createInvestmentAccount(_account: InsertInvestmentAccount & { userId: string }): Promise<InvestmentAccount> { return undefined as any; }
  async updateInvestmentAccount(_id: string, _updates: Partial<InsertInvestmentAccount>): Promise<InvestmentAccount | undefined> { return undefined; }
  async deleteInvestmentAccount(_id: string): Promise<boolean> { return false; }
  async getHoldings(_investmentAccountId: string): Promise<Holding[]> { return []; }
  async getHoldingsByUser(_userId: string): Promise<Holding[]> { return []; }
  async getHolding(_id: string): Promise<Holding | undefined> { return undefined; }
  async createHolding(_holding: InsertHolding & { userId: string }): Promise<Holding> { return undefined as any; }
  async updateHolding(_id: string, _updates: Partial<InsertHolding>): Promise<Holding | undefined> { return undefined; }
  async deleteHolding(_id: string): Promise<boolean> { return false; }
  async getHoldingsHistory(_holdingId: string, _options?: { startDate?: string; endDate?: string }): Promise<HoldingsHistory[]> { return []; }
  async createHoldingsHistory(_history: InsertHoldingsHistory): Promise<HoldingsHistory> { return undefined as any; }
  async getAssets(_userId: string): Promise<Asset[]> { return []; }
  async getAsset(_id: string): Promise<Asset | undefined> { return undefined; }
  async createAsset(_asset: InsertAsset & { userId: string }): Promise<Asset> { return undefined as any; }
  async updateAsset(_id: string, _updates: Partial<InsertAsset>): Promise<Asset | undefined> { return undefined; }
  async deleteAsset(_id: string): Promise<boolean> { return false; }
  async getAssetValueHistory(_assetId: string): Promise<AssetValueHistory[]> { return []; }
  async createAssetValueHistory(_history: InsertAssetValueHistory): Promise<AssetValueHistory> { return undefined as any; }
  async getNetWorthSnapshots(_userId: string, _options?: { limit?: number }): Promise<NetWorthSnapshot[]> { return []; }
  async getLatestNetWorthSnapshot(_userId: string): Promise<NetWorthSnapshot | undefined> { return undefined; }
  async createNetWorthSnapshot(_snapshot: InsertNetWorthSnapshot & { userId: string }): Promise<NetWorthSnapshot> { return undefined as any; }
  async getSplitExpenses(_householdId: string): Promise<SplitExpense[]> { return []; }
  async getSplitExpense(_id: string): Promise<SplitExpense | undefined> { return undefined; }
  async createSplitExpense(_expense: InsertSplitExpense): Promise<SplitExpense> { return undefined as any; }
  async updateSplitExpense(_id: string, _updates: Partial<InsertSplitExpense>): Promise<SplitExpense | undefined> { return undefined; }
  async deleteSplitExpense(_id: string): Promise<boolean> { return false; }
  async getSplitParticipants(_splitExpenseId: string): Promise<SplitParticipant[]> { return []; }
  async createSplitParticipant(_participant: InsertSplitParticipant): Promise<SplitParticipant> { return undefined as any; }
  async updateSplitParticipant(_id: string, _updates: Partial<SplitParticipant>): Promise<SplitParticipant | undefined> { return undefined; }
  async deleteSplitParticipant(_id: string): Promise<boolean> { return false; }
  async getSettlementPayments(_householdId: string): Promise<SettlementPayment[]> { return []; }
  async createSettlementPayment(_payment: InsertSettlementPayment): Promise<SettlementPayment> { return undefined as any; }
  async deleteAllInvestmentAccountsByUser(_userId: string): Promise<void> {}
  async deleteAllHoldingsByUser(_userId: string): Promise<void> {}
  async deleteAllAssetsByUser(_userId: string): Promise<void> {}
  async deleteAllNetWorthSnapshotsByUser(_userId: string): Promise<void> {}
  async getAutopilotRules(_userId: string): Promise<AutopilotRule[]> { return []; }
  async getAutopilotRule(_id: string): Promise<AutopilotRule | undefined> { return undefined; }
  async createAutopilotRule(_rule: InsertAutopilotRule & { userId: string }): Promise<AutopilotRule> { return undefined as any; }
  async updateAutopilotRule(_id: string, _updates: Partial<InsertAutopilotRule>): Promise<AutopilotRule | undefined> { return undefined; }
  async deleteAutopilotRule(_id: string): Promise<boolean> { return false; }
  async getLeakAlerts(_userId: string, _options?: { includeDismissed?: boolean }): Promise<LeakAlert[]> { return []; }
  async getLeakAlert(_id: string): Promise<LeakAlert | undefined> { return undefined; }
  async createLeakAlert(_alert: InsertLeakAlert & { userId: string }): Promise<LeakAlert> { return undefined as any; }
  async updateLeakAlert(_id: string, _updates: Partial<LeakAlert>): Promise<LeakAlert | undefined> { return undefined; }
  async dismissLeakAlert(_id: string): Promise<LeakAlert | undefined> { return undefined; }
  async deleteLeakAlert(_id: string): Promise<boolean> { return false; }
  async getTrialEvents(_userId: string): Promise<TrialEvent[]> { return []; }
  async createTrialEvent(_event: InsertTrialEvent & { userId: string }): Promise<TrialEvent> { return undefined as any; }
  async hasTrialEvent(_userId: string, _eventType: string): Promise<boolean> { return false; }
  async getWhatIfScenarios(_userId: string, _savedOnly?: boolean): Promise<WhatIfScenario[]> { return []; }
  async getWhatIfScenario(_id: string): Promise<WhatIfScenario | undefined> { return undefined; }
  async createWhatIfScenario(_scenario: InsertWhatIfScenario & { userId: string }): Promise<WhatIfScenario> { return undefined as any; }
  async updateWhatIfScenario(_id: string, _updates: Partial<InsertWhatIfScenario>): Promise<WhatIfScenario | undefined> { return undefined; }
  async deleteWhatIfScenario(_id: string): Promise<boolean> { return false; }
  async getSpendabilitySnapshot(_userId: string, _date: string): Promise<SpendabilitySnapshot | undefined> { return undefined; }
  async createSpendabilitySnapshot(_snapshot: InsertSpendabilitySnapshot & { userId: string }): Promise<SpendabilitySnapshot> { return undefined as any; }
  async getPaydayRecommendations(_userId: string): Promise<PaydayRecommendation[]> { return []; }
  async getPaydayRecommendation(_id: string): Promise<PaydayRecommendation | undefined> { return undefined; }
  async createPaydayRecommendation(_recommendation: InsertPaydayRecommendation & { userId: string }): Promise<PaydayRecommendation> { return undefined as any; }
  async updatePaydayRecommendation(_id: string, _updates: Partial<PaydayRecommendation>): Promise<PaydayRecommendation | undefined> { return undefined; }
  async deletePaydayRecommendation(_id: string): Promise<boolean> { return false; }
}

export class DatabaseStorage implements IStorage {
  // Users

  /** Decrypt the phone field of a User: prefers AES-256-GCM column, falls back to plaintext. */
  private _decryptUser(user: User): User {
    if (user.phoneEnc) {
      try {
        return { ...user, phone: fieldDecrypt(user.phoneEnc) };
      } catch {
        // fallback to stored phone
      }
    }
    return user;
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0] ? this._decryptUser(result[0]) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0] ? this._decryptUser(result[0]) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0] ? this._decryptUser(result[0]) : undefined;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.googleId, googleId));
    return result[0] ? this._decryptUser(result[0]) : undefined;
  }

  async getUsers(): Promise<User[]> {
    const rows = await db.select().from(users);
    return rows.map(r => this._decryptUser(r));
  }

  async createUser(insertUser: InsertUser & { isAdmin?: boolean; isApproved?: boolean; email?: string; firstName?: string; lastName?: string; googleId?: string; trialEmailReminder?: string; selectedPlanId?: string | null; emailVerified?: string; mfaRequired?: string }): Promise<User> {
    const result = await db.insert(users).values({
      username: insertUser.username,
      password: insertUser.password || null,
      email: insertUser.email || null,
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null,
      phone: null,
      mfaSecret: null,
      mfaEnabled: "false",
      isAdmin: insertUser.isAdmin ? "true" : "false",
      isApproved: insertUser.isApproved ? "true" : "false",
      googleId: insertUser.googleId || null,
      trialEmailReminder: insertUser.trialEmailReminder || "true",
      selectedPlanId: insertUser.selectedPlanId || null,
      emailVerified: insertUser.emailVerified || "false",
      mfaRequired: insertUser.mfaRequired || "false",
      plan: "free", // Explicitly set default plan
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateUser(id: string, updates: { username?: string; password?: string; isAdmin?: boolean; isApproved?: boolean; email?: string | null; firstName?: string | null; lastName?: string | null; phone?: string | null; googleId?: string; emailVerified?: string; mxUserGuid?: string; displayName?: string | null; birthday?: string | null; timezone?: string | null; avatarUrl?: string | null; country?: string | null }): Promise<User | undefined> {
    const updateData: Partial<User> = {};
    if (updates.username) updateData.username = updates.username;
    if (updates.password) updateData.password = updates.password;
    if (updates.googleId) updateData.googleId = updates.googleId;
    if (updates.isAdmin !== undefined) updateData.isAdmin = updates.isAdmin ? "true" : "false";
    if (updates.isApproved !== undefined) updateData.isApproved = updates.isApproved ? "true" : "false";
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.firstName !== undefined) updateData.firstName = updates.firstName;
    if (updates.lastName !== undefined) updateData.lastName = updates.lastName;
    if (updates.phone !== undefined) {
      updateData.phone = updates.phone;
      if (updates.phone) {
        try {
          updateData.phoneEnc = fieldEncrypt(updates.phone);
        } catch {
          // FIELD_ENCRYPTION_KEY not set; enc column stays unchanged
        }
      } else {
        updateData.phoneEnc = null;
      }
    }
    if (updates.emailVerified !== undefined) updateData.emailVerified = updates.emailVerified;
    if (updates.mxUserGuid !== undefined) updateData.mxUserGuid = updates.mxUserGuid;
    if (updates.displayName !== undefined) updateData.displayName = updates.displayName;
    if (updates.birthday !== undefined) updateData.birthday = updates.birthday;
    if (updates.timezone !== undefined) updateData.timezone = updates.timezone;
    if (updates.avatarUrl !== undefined) updateData.avatarUrl = updates.avatarUrl;
    if (updates.country !== undefined) updateData.country = updates.country;

    const result = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
    return result[0] ? this._decryptUser(result[0]) : undefined;
  }

  async deleteUser(id: string): Promise<boolean> {
    // Delete all child rows that have FK constraints on users.id before deleting the user
    await db.delete(spendingAlerts).where(eq(spendingAlerts.userId, id));
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  async updateUserPreferences(id: string, updates: { prefNeedsReview?: boolean; prefEditPending?: boolean; prefMerchantDisplay?: string }): Promise<User | undefined> {
    const updateData: Partial<User> = {};
    if (updates.prefNeedsReview !== undefined) updateData.prefNeedsReview = updates.prefNeedsReview;
    if (updates.prefEditPending !== undefined) updateData.prefEditPending = updates.prefEditPending;
    if (updates.prefMerchantDisplay !== undefined) updateData.prefMerchantDisplay = updates.prefMerchantDisplay;
    if (Object.keys(updateData).length === 0) {
      const result = await db.select().from(users).where(eq(users.id, id));
      return result[0] ? this._decryptUser(result[0]) : undefined;
    }
    const result = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
    return result[0] ? this._decryptUser(result[0]) : undefined;
  }

  async updateUserMfa(id: string, mfaSecret: string, mfaEnabled: boolean, backupCodes?: string[]): Promise<User | undefined> {
    const result = await db.update(users).set({
      mfaSecret,
      mfaEnabled: mfaEnabled ? "true" : "false",
      mfaBackupCodes: backupCodes ?? (mfaEnabled ? undefined : null),
    }).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.emailVerificationToken, token));
    return result[0];
  }

  async setEmailVerificationToken(userId: string, token: string, expiry: string): Promise<void> {
    await db.update(users).set({
      emailVerificationToken: token,
      emailVerificationExpiry: expiry
    }).where(eq(users.id, userId));
  }

  async verifyUserEmail(userId: string): Promise<User | undefined> {
    const result = await db.update(users).set({
      emailVerified: "true",
      emailVerificationToken: null,
      emailVerificationExpiry: null
    }).where(eq(users.id, userId)).returning();
    return result[0];
  }

  // Bills
  async getBills(userId: string): Promise<Bill[]> {
    return db.select().from(bills).where(eq(bills.userId, userId));
  }

  async getAllBills(): Promise<Bill[]> {
    return db.select().from(bills);
  }

  async getBill(id: string): Promise<Bill | undefined> {
    const result = await db.select().from(bills).where(eq(bills.id, id));
    return result[0];
  }

  async createBill(insertBill: InsertBill & { userId: string }): Promise<Bill> {
    const result = await db.insert(bills).values({
      userId: insertBill.userId,
      name: insertBill.name,
      amount: String(parseFloat(String(insertBill.amount))),
      category: insertBill.category,
      dueDay: parseInt(String(insertBill.dueDay), 10),
      recurrence: insertBill.recurrence,
      customDates: insertBill.customDates || null,
      notes: insertBill.notes || null,
      startingBalance: insertBill.startingBalance || null,
      paymentsRemaining: insertBill.paymentsRemaining || null,
      startDate: insertBill.startDate || null,
      endDate: insertBill.endDate ?? null,
      isPaused: insertBill.isPaused || "false",
      merchant: insertBill.merchant || null,
      linkedPlaidAccountId: insertBill.linkedPlaidAccountId ?? null,
    }).returning();
    return result[0];
  }

  async updateBill(id: string, updates: Partial<InsertBill>): Promise<Bill | undefined> {
    const result = await db.update(bills).set(updates).where(eq(bills.id, id)).returning();
    return result[0];
  }

  async deleteBill(id: string): Promise<boolean> {
    const result = await db.delete(bills).where(eq(bills.id, id)).returning();
    return result.length > 0;
  }

  async updateBillNotifiedCycle(id: string, cycle: string): Promise<void> {
    await db.update(bills).set({ lastNotifiedCycle: cycle }).where(eq(bills.id, id));
  }

  // Expenses
  async getExpenses(userId: string): Promise<Expense[]> {
    return db.select().from(expenses).where(eq(expenses.userId, userId));
  }

  async getAllExpenses(): Promise<Expense[]> {
    return db.select().from(expenses);
  }

  async getExpense(id: string): Promise<Expense | undefined> {
    const result = await db.select().from(expenses).where(eq(expenses.id, id));
    return result[0];
  }

  async createExpense(insertExpense: InsertExpense & { userId: string }): Promise<Expense> {
    const result = await db.insert(expenses).values({
      userId: insertExpense.userId,
      merchant: insertExpense.merchant,
      amount: insertExpense.amount,
      date: insertExpense.date,
      category: insertExpense.category,
      notes: insertExpense.notes || null,
    }).returning();
    return result[0];
  }

  async updateExpense(id: string, updates: Partial<InsertExpense>): Promise<Expense | undefined> {
    const result = await db.update(expenses).set(updates).where(eq(expenses.id, id)).returning();
    return result[0];
  }

  async deleteExpense(id: string): Promise<boolean> {
    const result = await db.delete(expenses).where(eq(expenses.id, id)).returning();
    return result.length > 0;
  }

  // Income
  async getIncomes(userId: string): Promise<Income[]> {
    return db.select().from(income).where(eq(income.userId, userId));
  }

  async getIncome(id: string): Promise<Income | undefined> {
    const result = await db.select().from(income).where(eq(income.id, id));
    return result[0];
  }

  async createIncome(insertIncome: InsertIncome & { userId: string }): Promise<Income> {
    const result = await db.insert(income).values({
      userId: insertIncome.userId,
      source: insertIncome.source,
      amount: insertIncome.amount,
      date: insertIncome.date,
      category: insertIncome.category,
      isRecurring: insertIncome.isRecurring || "false",
      recurrence: insertIncome.recurrence || null,
      dueDay: insertIncome.dueDay ?? null,
      customDates: insertIncome.customDates || null,
      notes: insertIncome.notes || null,
    }).returning();
    return result[0];
  }

  async updateIncome(id: string, updates: Partial<InsertIncome>): Promise<Income | undefined> {
    const result = await db.update(income).set(updates).where(eq(income.id, id)).returning();
    return result[0];
  }

  async deleteIncome(id: string): Promise<boolean> {
    const result = await db.delete(income).where(eq(income.id, id)).returning();
    return result.length > 0;
  }

  // Budgets
  async getBudgets(userId: string): Promise<Budget[]> {
    return db.select().from(budgets).where(eq(budgets.userId, userId));
  }

  async getBudget(id: string): Promise<Budget | undefined> {
    const result = await db.select().from(budgets).where(eq(budgets.id, id));
    return result[0];
  }

  async getBudgetsByMonth(userId: string, month: string): Promise<Budget[]> {
    return db.select().from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.month, month)));
  }

  async createBudget(insertBudget: InsertBudget & { userId: string }): Promise<Budget> {
    const result = await db.insert(budgets).values({
      userId: insertBudget.userId,
      category: insertBudget.category,
      amount: insertBudget.amount,
      month: insertBudget.month,
    }).returning();
    return result[0];
  }

  async updateBudget(id: string, updates: Partial<InsertBudget>): Promise<Budget | undefined> {
    const result = await db.update(budgets).set(updates).where(eq(budgets.id, id)).returning();
    return result[0];
  }

  async deleteBudget(id: string): Promise<boolean> {
    const result = await db.delete(budgets).where(eq(budgets.id, id)).returning();
    return result.length > 0;
  }

  // Savings Goals
  async getSavingsGoals(userId: string): Promise<SavingsGoal[]> {
    return db.select().from(savingsGoals).where(eq(savingsGoals.userId, userId));
  }

  async getSavingsGoal(id: string): Promise<SavingsGoal | undefined> {
    const result = await db.select().from(savingsGoals).where(eq(savingsGoals.id, id));
    return result[0];
  }

  async createSavingsGoal(insertGoal: InsertSavingsGoal & { userId: string }): Promise<SavingsGoal> {
    const result = await db.insert(savingsGoals).values({
      userId: insertGoal.userId,
      name: insertGoal.name,
      targetAmount: insertGoal.targetAmount,
      currentAmount: insertGoal.currentAmount || "0",
      targetDate: insertGoal.targetDate || null,
      color: insertGoal.color || "#3b82f6",
      notes: insertGoal.notes || null,
    }).returning();
    return result[0];
  }

  async updateSavingsGoal(id: string, updates: Partial<InsertSavingsGoal>): Promise<SavingsGoal | undefined> {
    const result = await db.update(savingsGoals).set(updates).where(eq(savingsGoals.id, id)).returning();
    return result[0];
  }

  async deleteSavingsGoal(id: string): Promise<boolean> {
    const result = await db.delete(savingsGoals).where(eq(savingsGoals.id, id)).returning();
    return result.length > 0;
  }

  // Plaid Items
  async getPlaidItems(userId: string): Promise<PlaidItem[]> {
    const items = await db.select().from(plaidItems).where(eq(plaidItems.userId, userId));
    return items.map(item => this._decryptPlaidItem(item));
  }

  async getPlaidItem(id: string): Promise<PlaidItem | undefined> {
    const result = await db.select().from(plaidItems).where(eq(plaidItems.id, id));
    if (!result[0]) return undefined;
    return this._decryptPlaidItem(result[0]);
  }

  async getPlaidItemByItemId(itemId: string): Promise<PlaidItem | undefined> {
    const result = await db.select().from(plaidItems).where(eq(plaidItems.itemId, itemId));
    if (!result[0]) return undefined;
    return this._decryptPlaidItem(result[0]);
  }

  async createPlaidItem(item: InsertPlaidItem): Promise<PlaidItem> {
    const accessTokenEnc = fieldEncrypt(item.accessToken);
    const itemIdEnc = fieldEncrypt(item.itemId);
    const result = await db.insert(plaidItems).values({
      userId: item.userId,
      // access_token is NOT NULL in the schema; store a sentinel so the
      // plaintext never lands in the database — all reads use access_token_enc.
      accessToken: "ENCRYPTED",
      itemId: item.itemId,
      institutionId: item.institutionId || null,
      institutionName: item.institutionName || null,
      cursor: null,
      status: "active",
      createdAt: new Date().toISOString(),
      accessTokenEnc,
      itemIdEnc,
    }).returning();
    return this._decryptPlaidItem(result[0]);
  }

  /** Decrypt the accessToken (and itemId) of a PlaidItem returned from the database.
   *  Reads from the AES-256-GCM encrypted column first, falls back to the plaintext
   *  legacy column for rows created before field encryption was introduced. */
  private _decryptPlaidItem(item: PlaidItem): PlaidItem {
    try {
      const accessToken = item.accessTokenEnc
        ? fieldDecrypt(item.accessTokenEnc)
        : item.accessToken;
      const itemId = item.itemIdEnc
        ? fieldDecrypt(item.itemIdEnc)
        : item.itemId;
      return { ...item, accessToken, itemId };
    } catch (err) {
      console.error(`[Encryption] Failed to decrypt PlaidItem ${item.id}:`, err);
      throw err;
    }
  }

  async updatePlaidItem(id: string, updates: Partial<PlaidItem>): Promise<PlaidItem | undefined> {
    const result = await db.update(plaidItems).set(updates).where(eq(plaidItems.id, id)).returning();
    return result[0];
  }

  async deletePlaidItem(id: string): Promise<boolean> {
    const result = await db.delete(plaidItems).where(eq(plaidItems.id, id)).returning();
    return result.length > 0;
  }

  // Plaid Accounts
  async getPlaidAccounts(plaidItemId: string): Promise<PlaidAccount[]> {
    return db.select().from(plaidAccounts).where(eq(plaidAccounts.plaidItemId, plaidItemId));
  }

  async getAllPlaidAccounts(userId: string): Promise<PlaidAccount[]> {
    const items = await this.getPlaidItems(userId);
    if (items.length === 0) return [];
    const itemIds = items.map(i => i.id);
    return db.select().from(plaidAccounts).where(inArray(plaidAccounts.plaidItemId, itemIds));
  }

  async getPlaidAccountByAccountId(accountId: string): Promise<PlaidAccount | undefined> {
    const result = await db.select().from(plaidAccounts).where(eq(plaidAccounts.accountId, accountId));
    return result[0];
  }

  async createPlaidAccount(account: InsertPlaidAccount): Promise<PlaidAccount> {
    const result = await db.insert(plaidAccounts).values({
      plaidItemId: account.plaidItemId,
      accountId: account.accountId,
      name: account.name,
      officialName: account.officialName || null,
      type: account.type,
      subtype: account.subtype || null,
      mask: account.mask || null,
      balanceCurrent: account.balanceCurrent || null,
      balanceAvailable: account.balanceAvailable || null,
      balanceLimit: account.balanceLimit || null,
      isoCurrencyCode: account.isoCurrencyCode || "CAD",
      lastSynced: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updatePlaidAccount(id: string, updates: Partial<PlaidAccount>): Promise<PlaidAccount | undefined> {
    const result = await db.update(plaidAccounts).set(updates).where(eq(plaidAccounts.id, id)).returning();
    return result[0];
  }

  async deletePlaidAccountsByItemId(plaidItemId: string): Promise<void> {
    await db.delete(plaidAccounts).where(eq(plaidAccounts.plaidItemId, plaidItemId));
  }

  // Plaid Transactions
  async getPlaidTransactions(accountIds: string[], options?: { startDate?: string; endDate?: string }): Promise<PlaidTransaction[]> {
    if (accountIds.length === 0) return [];

    const conditions = [inArray(plaidTransactions.plaidAccountId, accountIds)];
    if (options?.startDate) {
      conditions.push(gte(plaidTransactions.date, options.startDate));
    }
    if (options?.endDate) {
      conditions.push(lte(plaidTransactions.date, options.endDate));
    }

    return db.select().from(plaidTransactions).where(and(...conditions));
  }

  async getPlaidTransactionByTransactionId(transactionId: string): Promise<PlaidTransaction | undefined> {
    const result = await db.select().from(plaidTransactions).where(eq(plaidTransactions.transactionId, transactionId));
    return result[0];
  }

  async getRecentTransactionIds(userId: string, daysBack: number): Promise<string[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    const userAccounts = await this.getAllPlaidAccounts(userId);
    const accountIds = userAccounts.map(a => a.id);
    if (accountIds.length === 0) return [];
    const rows = await db
      .select({ id: plaidTransactions.id })
      .from(plaidTransactions)
      .where(
        and(
          inArray(plaidTransactions.plaidAccountId, accountIds),
          gte(plaidTransactions.date, cutoffStr)
        )
      )
      .limit(50);
    return rows.map(r => r.id);
  }

  async createPlaidTransaction(transaction: InsertPlaidTransaction): Promise<PlaidTransaction> {
    // Use upsert to handle duplicate transactions gracefully
    const result = await db.insert(plaidTransactions).values({
      plaidAccountId: transaction.plaidAccountId,
      transactionId: transaction.transactionId,
      amount: transaction.amount,
      date: transaction.date,
      name: transaction.name,
      merchantName: transaction.merchantName || null,
      logoUrl: (transaction as any).logoUrl || null,
      category: transaction.category || null,
      personalCategory: transaction.personalCategory || null,
      personalFinanceCategoryDetailed: (transaction as any).personalFinanceCategoryDetailed || null,
      personalFinanceCategoryConfidence: (transaction as any).personalFinanceCategoryConfidence || null,
      paymentChannel: (transaction as any).paymentChannel || null,
      merchantEntityId: (transaction as any).merchantEntityId || null,
      pending: transaction.pending || "false",
      matchType: transaction.matchType || null,
      matchedBillId: transaction.matchedBillId || null,
      matchedExpenseId: transaction.matchedExpenseId || null,
      matchedIncomeId: transaction.matchedIncomeId || null,
      reconciled: transaction.reconciled || "false",
      isoCurrencyCode: transaction.isoCurrencyCode || "CAD",
      createdAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: plaidTransactions.transactionId,
      set: {
        amount: transaction.amount,
        date: transaction.date,
        name: transaction.name,
        // Preserve enrichment fields on upsert — use COALESCE so existing data is not overwritten with null
        merchantName: sql`COALESCE(${transaction.merchantName || null}, plaid_transactions.merchant_name)`,
        logoUrl: sql`COALESCE(${transaction.logoUrl || null}, plaid_transactions.logo_url)`,
        category: sql`COALESCE(${transaction.category || null}, plaid_transactions.category)`,
        personalFinanceCategoryDetailed: sql`COALESCE(${(transaction as any).personalFinanceCategoryDetailed || null}, plaid_transactions.personal_finance_category_detailed)`,
        personalFinanceCategoryConfidence: sql`COALESCE(${(transaction as any).personalFinanceCategoryConfidence || null}, plaid_transactions.personal_finance_category_confidence)`,
        paymentChannel: sql`COALESCE(${(transaction as any).paymentChannel || null}, plaid_transactions.payment_channel)`,
        merchantEntityId: sql`COALESCE(${(transaction as any).merchantEntityId || null}, plaid_transactions.merchant_entity_id)`,
        pending: transaction.pending || "false",
      }
    }).returning();

    const saved = result[0];
    // Fire-and-forget enrichment
    import('./merchant-enricher').then(({ enrichTransaction }) => {
      enrichTransaction({
        rawDescription: transaction.name,
        amount: Math.abs(parseFloat(transaction.amount)),
        providerCategory: transaction.category || undefined,
      }).then(async (enriched) => {
        await db.update(plaidTransactions).set({
          merchantCleanName: enriched.cleanName,
          merchantLogoUrl: enriched.logoUrl,
          subcategory: enriched.subcategory,
          merchantType: enriched.merchantType,
          isSubscription: enriched.isSubscription ? "true" : "false",
          enrichmentSource: enriched.source,
          enrichmentConfidence: String(enriched.confidence),
        } as any).where(eq(plaidTransactions.id, saved.id));
      }).catch(err => console.error('[Enricher] Post-save Plaid failed:', err));
    }).catch(() => {});
    return saved;
  }

  async updatePlaidTransaction(id: string, updates: Partial<PlaidTransaction>): Promise<PlaidTransaction | undefined> {
    const result = await db.update(plaidTransactions).set(updates).where(eq(plaidTransactions.id, id)).returning();
    return result[0];
  }

  async deleteRemovedTransactions(transactionIds: string[]): Promise<void> {
    if (transactionIds.length === 0) return;
    await db.delete(plaidTransactions).where(inArray(plaidTransactions.transactionId, transactionIds));
  }

  async getUnmatchedTransactions(accountIds: string[]): Promise<PlaidTransaction[]> {
    if (accountIds.length === 0) return [];
    return db.select().from(plaidTransactions).where(
      and(
        inArray(plaidTransactions.plaidAccountId, accountIds),
        eq(plaidTransactions.matchType, "unmatched")
      )
    );
  }

  // ============ MX INTEGRATION ============

  /** Decrypt the memberGuid of an MxMember: prefers AES-256-GCM column, falls back to plaintext. */
  private _decryptMxMember(member: MxMember): MxMember {
    if (member.memberGuidEnc) {
      try {
        return { ...member, memberGuid: fieldDecrypt(member.memberGuidEnc) };
      } catch {
        // fallback to stored memberGuid
      }
    }
    return member;
  }

  // MX Members (Bank Connections)
  async getMxMembers(userId: string): Promise<MxMember[]> {
    const rows = await db.select().from(mxMembers).where(eq(mxMembers.userId, userId));
    return rows.map(r => this._decryptMxMember(r));
  }

  async getMxMember(id: string): Promise<MxMember | undefined> {
    const result = await db.select().from(mxMembers).where(eq(mxMembers.id, id));
    return result[0] ? this._decryptMxMember(result[0]) : undefined;
  }

  async getMxMemberByGuid(memberGuid: string): Promise<MxMember | undefined> {
    const result = await db.select().from(mxMembers).where(eq(mxMembers.memberGuid, memberGuid));
    return result[0] ? this._decryptMxMember(result[0]) : undefined;
  }

  async createMxMember(member: InsertMxMember): Promise<MxMember> {
    let memberGuidEnc: string | null = null;
    try {
      memberGuidEnc = fieldEncrypt(member.memberGuid);
    } catch {
      // FIELD_ENCRYPTION_KEY not set; enc column stays null
    }
    const result = await db.insert(mxMembers).values({
      ...member,
      memberGuidEnc,
      createdAt: new Date().toISOString(),
    }).returning();
    return this._decryptMxMember(result[0]);
  }

  async updateMxMember(id: string, updates: Partial<MxMember>): Promise<MxMember | undefined> {
    const result = await db.update(mxMembers).set(updates).where(eq(mxMembers.id, id)).returning();
    return result[0];
  }

  async deleteMxMember(id: string): Promise<boolean> {
    const result = await db.delete(mxMembers).where(eq(mxMembers.id, id)).returning();
    return result.length > 0;
  }

  // MX Accounts
  async getMxAccounts(mxMemberId: string): Promise<MxAccount[]> {
    return db.select().from(mxAccounts).where(eq(mxAccounts.mxMemberId, mxMemberId));
  }

  async getMxAccountsByUserId(userId: string): Promise<MxAccount[]> {
    const members = await this.getMxMembers(userId);
    if (members.length === 0) return [];
    const memberIds = members.map(m => m.id);
    return db.select().from(mxAccounts).where(inArray(mxAccounts.mxMemberId, memberIds));
  }

  async getMxAccountByGuid(accountGuid: string): Promise<MxAccount | undefined> {
    const result = await db.select().from(mxAccounts).where(eq(mxAccounts.accountGuid, accountGuid));
    return result[0];
  }

  async createMxAccount(account: InsertMxAccount): Promise<MxAccount> {
    const result = await db.insert(mxAccounts).values({
      ...account,
      lastSynced: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateMxAccount(id: string, updates: Partial<MxAccount>): Promise<MxAccount | undefined> {
    const result = await db.update(mxAccounts).set(updates).where(eq(mxAccounts.id, id)).returning();
    return result[0];
  }

  async deleteMxAccountsByMemberId(mxMemberId: string): Promise<void> {
    await db.delete(mxAccounts).where(eq(mxAccounts.mxMemberId, mxMemberId));
  }

  // MX Transactions
  async getMxTransactions(accountIds: string[], options?: { startDate?: string; endDate?: string }): Promise<MxTransaction[]> {
    if (accountIds.length === 0) return [];

    const conditions = [inArray(mxTransactions.mxAccountId, accountIds)];
    if (options?.startDate) {
      conditions.push(gte(mxTransactions.date, options.startDate));
    }
    if (options?.endDate) {
      conditions.push(lte(mxTransactions.date, options.endDate));
    }

    return db.select().from(mxTransactions).where(and(...conditions));
  }

  async getMxTransactionByGuid(transactionGuid: string): Promise<MxTransaction | undefined> {
    const result = await db.select().from(mxTransactions).where(eq(mxTransactions.transactionGuid, transactionGuid));
    return result[0];
  }

  async createMxTransaction(transaction: InsertMxTransaction): Promise<MxTransaction> {
    const result = await db.insert(mxTransactions).values({
      ...transaction,
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async upsertMxTransactions(transactions: InsertMxTransaction[]): Promise<void> {
    if (transactions.length === 0) return;
    
    for (const transaction of transactions) {
      const result = await db.insert(mxTransactions).values({
        ...transaction,
        createdAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: mxTransactions.transactionGuid,
        set: {
          amount: transaction.amount,
          description: transaction.description,
          category: transaction.category,
          topLevelCategory: transaction.topLevelCategory,
          status: transaction.status,
          postedAt: transaction.postedAt,
        },
      }).returning();
      const saved = result[0];
      // Fire-and-forget enrichment
      import('./merchant-enricher').then(({ enrichTransaction }) => {
        enrichTransaction({
          rawDescription: transaction.description,
          amount: Math.abs(parseFloat(transaction.amount)),
          providerCategory: transaction.category || undefined,
        }).then(async (enriched) => {
          await db.update(mxTransactions).set({
            merchantCleanName: enriched.cleanName,
            merchantLogoUrl: enriched.logoUrl,
            subcategory: enriched.subcategory,
            merchantType: enriched.merchantType,
            isSubscription: enriched.isSubscription ? "true" : "false",
            enrichmentSource: enriched.source,
            enrichmentConfidence: String(enriched.confidence),
          } as any).where(eq(mxTransactions.id, saved.id));
        }).catch(err => console.error('[Enricher] Post-save MX failed:', err));
      }).catch(() => {});
    }
  }

  async updateMxTransaction(id: string, updates: Partial<MxTransaction>): Promise<MxTransaction | undefined> {
    const result = await db.update(mxTransactions).set(updates).where(eq(mxTransactions.id, id)).returning();
    return result[0];
  }

  async deleteMxTransactionsByAccountId(mxAccountId: string): Promise<void> {
    await db.delete(mxTransactions).where(eq(mxTransactions.mxAccountId, mxAccountId));
  }

  async getUnmatchedMxTransactions(accountIds: string[]): Promise<MxTransaction[]> {
    if (accountIds.length === 0) return [];
    return db.select().from(mxTransactions).where(
      and(
        inArray(mxTransactions.mxAccountId, accountIds),
        eq(mxTransactions.matchType, "unmatched")
      )
    );
  }

  // ============ NEW FEATURE IMPLEMENTATIONS ============

  // Notification Settings
  async getNotificationSettings(userId: string): Promise<NotificationSettings | undefined> {
    const result = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId));
    return result[0];
  }

  async createNotificationSettings(settings: InsertNotificationSettings): Promise<NotificationSettings> {
    const result = await db.insert(notificationSettings).values(settings).returning();
    return result[0];
  }

  async updateNotificationSettings(userId: string, updates: Partial<NotificationSettings>): Promise<NotificationSettings | undefined> {
    const result = await db.update(notificationSettings).set(updates).where(eq(notificationSettings.userId, userId)).returning();
    return result[0];
  }

  // Custom Categories
  async getCustomCategories(userId: string): Promise<CustomCategory[]> {
    return db.select().from(customCategories).where(eq(customCategories.userId, userId));
  }

  async createCustomCategory(category: InsertCustomCategory): Promise<CustomCategory> {
    const result = await db.insert(customCategories).values(category).returning();
    return result[0];
  }

  async updateCustomCategory(id: string, updates: Partial<CustomCategory>): Promise<CustomCategory | undefined> {
    const result = await db.update(customCategories).set(updates).where(eq(customCategories.id, id)).returning();
    return result[0];
  }

  async deleteCustomCategory(id: string): Promise<boolean> {
    const result = await db.delete(customCategories).where(eq(customCategories.id, id)).returning();
    return result.length > 0;
  }

  // Recurring Expenses
  async getRecurringExpenses(userId: string): Promise<RecurringExpense[]> {
    return db.select().from(recurringExpenses).where(eq(recurringExpenses.userId, userId));
  }

  async getRecurringExpense(id: string): Promise<RecurringExpense | undefined> {
    const result = await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, id));
    return result[0];
  }

  async createRecurringExpense(expense: InsertRecurringExpense): Promise<RecurringExpense> {
    const result = await db.insert(recurringExpenses).values(expense).returning();
    return result[0];
  }

  async updateRecurringExpense(id: string, updates: Partial<RecurringExpense>): Promise<RecurringExpense | undefined> {
    const result = await db.update(recurringExpenses).set(updates).where(eq(recurringExpenses.id, id)).returning();
    return result[0];
  }

  async deleteRecurringExpense(id: string): Promise<boolean> {
    const result = await db.delete(recurringExpenses).where(eq(recurringExpenses.id, id)).returning();
    return result.length > 0;
  }

  // Reconciliation Rules
  async getReconciliationRules(userId: string): Promise<ReconciliationRule[]> {
    return db.select().from(reconciliationRules).where(eq(reconciliationRules.userId, userId));
  }

  async findMatchingRule(userId: string, merchantName: string): Promise<ReconciliationRule | undefined> {
    // Get all rules for user and find matching pattern
    const rules = await db.select().from(reconciliationRules).where(eq(reconciliationRules.userId, userId));
    const lowerMerchant = merchantName.toLowerCase();
    
    for (const rule of rules) {
      const pattern = rule.merchantPattern.toLowerCase();
      if (lowerMerchant.includes(pattern) || pattern.includes(lowerMerchant)) {
        return rule;
      }
    }
    return undefined;
  }

  async createReconciliationRule(rule: InsertReconciliationRule): Promise<ReconciliationRule> {
    const result = await db.insert(reconciliationRules).values({
      ...rule,
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateReconciliationRule(id: string, updates: Partial<ReconciliationRule>): Promise<ReconciliationRule | undefined> {
    const result = await db.update(reconciliationRules).set(updates).where(eq(reconciliationRules.id, id)).returning();
    return result[0];
  }

  async deleteReconciliationRule(id: string): Promise<boolean> {
    const result = await db.delete(reconciliationRules).where(eq(reconciliationRules.id, id)).returning();
    return result.length > 0;
  }

  // Sync Schedules
  async getSyncSchedules(userId: string): Promise<SyncSchedule[]> {
    return db.select().from(syncSchedules).where(eq(syncSchedules.userId, userId));
  }

  async getSyncSchedule(id: string): Promise<SyncSchedule | undefined> {
    const result = await db.select().from(syncSchedules).where(eq(syncSchedules.id, id));
    return result[0];
  }

  async createSyncSchedule(schedule: InsertSyncSchedule): Promise<SyncSchedule> {
    const result = await db.insert(syncSchedules).values(schedule).returning();
    return result[0];
  }

  async updateSyncSchedule(id: string, updates: Partial<SyncSchedule>): Promise<SyncSchedule | undefined> {
    const result = await db.update(syncSchedules).set(updates).where(eq(syncSchedules.id, id)).returning();
    return result[0];
  }

  async deleteSyncSchedule(id: string): Promise<boolean> {
    const result = await db.delete(syncSchedules).where(eq(syncSchedules.id, id)).returning();
    return result.length > 0;
  }

  async getDueSyncSchedules(): Promise<SyncSchedule[]> {
    const now = new Date().toISOString();
    return db.select().from(syncSchedules).where(
      and(
        eq(syncSchedules.isEnabled, "true"),
        lte(syncSchedules.nextSyncAt, now)
      )
    );
  }

  // Notifications
  async getNotifications(userId: string, limit: number = 50): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db.select().from(notifications).where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, "false")
      )
    );
    return result.length;
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const result = await db.insert(notifications).values({
      ...notification,
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async markNotificationRead(id: string): Promise<void> {
    await db.update(notifications).set({ isRead: "true" }).where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ isRead: "true" }).where(eq(notifications.userId, userId));
  }

  async deleteNotification(id: string): Promise<boolean> {
    const result = await db.delete(notifications).where(eq(notifications.id, id)).returning();
    return result.length > 0;
  }

  // Budget Alerts
  async getBudgetAlerts(userId: string, month?: string): Promise<BudgetAlert[]> {
    const conditions = [eq(budgetAlerts.userId, userId)];
    if (month) conditions.push(eq(budgetAlerts.month, month));
    return db.select().from(budgetAlerts).where(and(...conditions));
  }

  async createBudgetAlert(alert: InsertBudgetAlert): Promise<BudgetAlert> {
    const result = await db.insert(budgetAlerts).values({
      ...alert,
      alertSentAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateBudgetAlert(id: string, updates: Partial<BudgetAlert>): Promise<BudgetAlert | undefined> {
    const result = await db.update(budgetAlerts).set(updates).where(eq(budgetAlerts.id, id)).returning();
    return result[0];
  }

  // Onboarding
  async getOnboardingAnalysis(userId: string): Promise<OnboardingAnalysis | undefined> {
    const result = await db.select().from(onboardingAnalysis).where(eq(onboardingAnalysis.userId, userId));
    return result[0];
  }

  async createOnboardingAnalysis(analysis: InsertOnboardingAnalysis): Promise<OnboardingAnalysis> {
    const result = await db.insert(onboardingAnalysis).values({
      ...analysis,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateOnboardingAnalysis(userId: string, updates: Partial<OnboardingAnalysis>): Promise<OnboardingAnalysis | undefined> {
    const result = await db.update(onboardingAnalysis).set({
      ...updates,
      updatedAt: new Date().toISOString(),
    }).where(eq(onboardingAnalysis.userId, userId)).returning();
    return result[0];
  }

  async deleteOnboardingAnalysis(userId: string): Promise<boolean> {
    const result = await db.delete(onboardingAnalysis).where(eq(onboardingAnalysis.userId, userId)).returning();
    return result.length > 0;
  }

  async updateUserOnboarding(userId: string, complete: boolean, progress?: Record<string, boolean>): Promise<void> {
    const updates: Partial<User> = { onboardingComplete: complete ? "true" : "false" };
    if (progress !== undefined) {
      updates.onboardingProgress = JSON.stringify(progress);
    }
    await db.update(users).set(updates).where(eq(users.id, userId));
  }

  // ============ HOUSEHOLD COLLABORATION ============

  // Households
  async createHousehold(name: string, ownerId: string): Promise<Household> {
    const result = await db.insert(households).values({
      name,
      createdAt: new Date().toISOString(),
    }).returning();

    const household = result[0];

    // Add owner as first member
    await this.addHouseholdMember(household.id, ownerId, "owner");

    return household;
  }

  async getHousehold(id: string): Promise<Household | undefined> {
    const result = await db.select().from(households).where(eq(households.id, id));
    return result[0];
  }

  async getHouseholdByUserId(userId: string): Promise<Household | undefined> {
    // Find the household this user belongs to
    const memberResult = await db.select().from(householdMembers).where(eq(householdMembers.userId, userId));
    if (memberResult.length === 0) return undefined;

    const householdId = memberResult[0].householdId;
    return this.getHousehold(householdId);
  }

  async updateHousehold(id: string, updates: Partial<Household>): Promise<Household | undefined> {
    const result = await db.update(households).set(updates).where(eq(households.id, id)).returning();
    return result[0];
  }

  async deleteHousehold(id: string): Promise<boolean> {
    // Delete all members first
    await db.delete(householdMembers).where(eq(householdMembers.householdId, id));
    // Delete all invitations
    await db.delete(householdInvitations).where(eq(householdInvitations.householdId, id));
    // Delete household
    const result = await db.delete(households).where(eq(households.id, id)).returning();
    return result.length > 0;
  }

  // Household Members
  async getHouseholdMembers(householdId: string): Promise<(HouseholdMember & { user: User })[]> {
    const members = await db.select().from(householdMembers).where(eq(householdMembers.householdId, householdId));

    // Fetch user details for each member
    const membersWithUsers: (HouseholdMember & { user: User })[] = [];
    for (const member of members) {
      const user = await this.getUser(member.userId);
      if (user) {
        membersWithUsers.push({ ...member, user });
      }
    }

    return membersWithUsers;
  }

  async getHouseholdMemberUserIds(householdId: string): Promise<string[]> {
    const members = await db.select().from(householdMembers).where(eq(householdMembers.householdId, householdId));
    return members.map(m => m.userId);
  }

  async getHouseholdMember(householdId: string, userId: string): Promise<HouseholdMember | undefined> {
    const result = await db.select().from(householdMembers).where(
      and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId))
    );
    return result[0];
  }

  async addHouseholdMember(householdId: string, userId: string, role: string): Promise<HouseholdMember> {
    const result = await db.insert(householdMembers).values({
      householdId,
      userId,
      role,
      joinedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async removeHouseholdMember(householdId: string, userId: string): Promise<boolean> {
    const result = await db.delete(householdMembers).where(
      and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId))
    ).returning();
    return result.length > 0;
  }

  async updateHouseholdMemberRole(householdId: string, userId: string, role: string): Promise<HouseholdMember | undefined> {
    const result = await db.update(householdMembers).set({ role }).where(
      and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId))
    ).returning();
    return result[0];
  }

  // Household Invitations
  async createInvitation(invitation: Omit<InsertHouseholdInvitation, 'token' | 'status' | 'createdAt' | 'expiresAt'>): Promise<HouseholdInvitation> {
    const token = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

    const result = await db.insert(householdInvitations).values({
      ...invitation,
      token,
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    }).returning();
    return result[0];
  }

  async getInvitationByToken(token: string): Promise<HouseholdInvitation | undefined> {
    const result = await db.select().from(householdInvitations).where(eq(householdInvitations.token, token));
    return result[0];
  }

  async getInvitationsByEmail(email: string): Promise<HouseholdInvitation[]> {
    return db.select().from(householdInvitations).where(
      and(eq(householdInvitations.email, email), eq(householdInvitations.status, "pending"))
    );
  }

  async getInvitationsByHousehold(householdId: string): Promise<HouseholdInvitation[]> {
    return db.select().from(householdInvitations).where(eq(householdInvitations.householdId, householdId));
  }

  async updateInvitationStatus(id: string, status: string): Promise<HouseholdInvitation | undefined> {
    const result = await db.update(householdInvitations).set({ status }).where(eq(householdInvitations.id, id)).returning();
    return result[0];
  }

  async deleteInvitation(id: string): Promise<boolean> {
    const result = await db.delete(householdInvitations).where(eq(householdInvitations.id, id)).returning();
    return result.length > 0;
  }

  // Multi-user data queries (for household filtering)
  async getBillsByUserIds(userIds: string[]): Promise<Bill[]> {
    if (userIds.length === 0) return [];
    return db.select().from(bills).where(inArray(bills.userId, userIds));
  }

  async getExpensesByUserIds(userIds: string[]): Promise<Expense[]> {
    if (userIds.length === 0) return [];
    return db.select().from(expenses).where(inArray(expenses.userId, userIds));
  }

  async getIncomesByUserIds(userIds: string[]): Promise<Income[]> {
    if (userIds.length === 0) return [];
    return db.select().from(income).where(inArray(income.userId, userIds));
  }

  async getBudgetsByUserIds(userIds: string[]): Promise<Budget[]> {
    if (userIds.length === 0) return [];
    return db.select().from(budgets).where(inArray(budgets.userId, userIds));
  }

  async getBudgetsByUserIdsAndMonth(userIds: string[], month: string): Promise<Budget[]> {
    if (userIds.length === 0) return [];
    return db.select().from(budgets).where(
      and(inArray(budgets.userId, userIds), eq(budgets.month, month))
    );
  }

  async getSavingsGoalsByUserIds(userIds: string[]): Promise<SavingsGoal[]> {
    if (userIds.length === 0) return [];
    return db.select().from(savingsGoals).where(inArray(savingsGoals.userId, userIds));
  }

  async getPlaidItemsByUserIds(userIds: string[]): Promise<PlaidItem[]> {
    if (userIds.length === 0) return [];
    return db.select().from(plaidItems).where(inArray(plaidItems.userId, userIds));
  }

  async updateUserHousehold(userId: string, updates: { householdName?: string | null; country?: string | null; addressLine1?: string | null; city?: string | null; provinceState?: string | null; postalCode?: string | null }): Promise<User | undefined> {
    const updateData: Record<string, unknown> = {};
    if (updates.householdName !== undefined) updateData.householdName = updates.householdName;
    if (updates.country !== undefined) updateData.country = updates.country;
    if (updates.addressLine1 !== undefined) updateData.addressLine1 = updates.addressLine1;
    if (updates.city !== undefined) updateData.city = updates.city;
    if (updates.provinceState !== undefined) updateData.provinceState = updates.provinceState;
    if (updates.postalCode !== undefined) updateData.postalCode = updates.postalCode;
    if (Object.keys(updateData).length === 0) {
      return db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
    }
    const result = await db.update(users).set(updateData as Partial<User>).where(eq(users.id, userId)).returning();
    return result[0] ? this._decryptUser(result[0]) : undefined;
  }

  async getFinancialProfessional(userId: string): Promise<FinancialProfessional | undefined> {
    const result = await db.select().from(financialProfessionals)
      .where(and(eq(financialProfessionals.userId, userId), eq(financialProfessionals.isActive, "true")))
      .orderBy(desc(financialProfessionals.createdAt))
      .limit(1);
    return result[0];
  }

  async grantFinancialAccess(userId: string, professionalEmail: string, professionalName: string | undefined, accessToken: string, expiresAt: string): Promise<FinancialProfessional> {
    // Revoke any existing active access first
    await db.update(financialProfessionals)
      .set({ isActive: "false" })
      .where(and(eq(financialProfessionals.userId, userId), eq(financialProfessionals.isActive, "true")));
    const now = new Date().toISOString();
    const result = await db.insert(financialProfessionals).values({
      id: randomUUID(),
      userId,
      professionalEmail,
      professionalName: professionalName || null,
      accessToken,
      grantedAt: now,
      expiresAt,
      isActive: "true",
      createdAt: now,
    }).returning();
    return result[0];
  }

  async revokeFinancialAccess(userId: string): Promise<boolean> {
    const result = await db.update(financialProfessionals)
      .set({ isActive: "false" })
      .where(and(eq(financialProfessionals.userId, userId), eq(financialProfessionals.isActive, "true")))
      .returning();
    return result.length > 0;
  }

  // Referral Program
  async getReferralCode(userId: string): Promise<ReferralCode | undefined> {
    const result = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId));
    return result[0];
  }

  async getReferralCodeByCode(code: string): Promise<ReferralCode | undefined> {
    const result = await db.select().from(referralCodes).where(eq(referralCodes.code, code.toUpperCase()));
    return result[0];
  }

  async createReferralCode(userId: string, code: string): Promise<ReferralCode> {
    const result = await db.insert(referralCodes).values({
      userId,
      code: code.toUpperCase(),
      totalReferrals: 0,
      successfulReferrals: 0,
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async incrementReferralCount(userId: string, successful = false): Promise<void> {
    const existing = await this.getReferralCode(userId);
    if (existing) {
      const updates: Partial<ReferralCode> = {
        totalReferrals: (existing.totalReferrals || 0) + 1,
      };
      if (successful) {
        updates.successfulReferrals = (existing.successfulReferrals || 0) + 1;
      }
      await db.update(referralCodes).set(updates).where(eq(referralCodes.userId, userId));
    }
  }

  async getReferrals(referrerId: string): Promise<Referral[]> {
    return db.select().from(referrals).where(eq(referrals.referrerId, referrerId)).orderBy(desc(referrals.invitedAt));
  }

  async getReferralByEmail(email: string): Promise<Referral | undefined> {
    const result = await db.select().from(referrals).where(eq(referrals.referredEmail, email.toLowerCase()));
    return result[0];
  }

  async createReferral(referral: InsertReferral): Promise<Referral> {
    const result = await db.insert(referrals).values({
      ...referral,
      referredEmail: referral.referredEmail.toLowerCase(),
      status: "pending",
      invitedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateReferralStatus(id: string, status: string, referredUserId?: string): Promise<Referral | undefined> {
    const updates: Partial<Referral> = { status };
    if (referredUserId) {
      updates.referredUserId = referredUserId;
    }
    if (status === "registered") {
      updates.registeredAt = new Date().toISOString();
    }
    if (status === "active") {
      updates.activatedAt = new Date().toISOString();
    }
    if (status === "rewarded") {
      updates.rewardedAt = new Date().toISOString();
    }
    const result = await db.update(referrals).set(updates).where(eq(referrals.id, id)).returning();
    return result[0];
  }

  // ============ MANUAL ACCOUNTS (Transaction-Centric Architecture) ============

  async getManualAccounts(userId: string): Promise<ManualAccount[]> {
    return db.select().from(manualAccounts).where(eq(manualAccounts.userId, userId));
  }

  async getManualAccount(id: string): Promise<ManualAccount | undefined> {
    const result = await db.select().from(manualAccounts).where(eq(manualAccounts.id, id));
    return result[0];
  }

  async createManualAccount(account: InsertManualAccount & { userId: string }): Promise<ManualAccount> {
    const result = await db.insert(manualAccounts).values({
      userId: account.userId,
      name: account.name,
      type: account.type,
      balance: account.balance || "0",
      currency: account.currency || "USD",
      isActive: "true",
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateManualAccount(id: string, updates: Partial<InsertManualAccount>): Promise<ManualAccount | undefined> {
    const result = await db.update(manualAccounts).set(updates).where(eq(manualAccounts.id, id)).returning();
    return result[0];
  }

  async deleteManualAccount(id: string): Promise<boolean> {
    // First delete all transactions in this account
    await db.delete(manualTransactions).where(eq(manualTransactions.accountId, id));
    // Then delete the account
    const result = await db.delete(manualAccounts).where(eq(manualAccounts.id, id)).returning();
    return result.length > 0;
  }

  // Manual Transactions
  async getManualTransactions(accountId: string, options?: { startDate?: string; endDate?: string }): Promise<ManualTransaction[]> {
    const conditions = [eq(manualTransactions.accountId, accountId)];
    if (options?.startDate) {
      conditions.push(gte(manualTransactions.date, options.startDate));
    }
    if (options?.endDate) {
      conditions.push(lte(manualTransactions.date, options.endDate));
    }
    return db.select().from(manualTransactions).where(and(...conditions)).orderBy(desc(manualTransactions.date));
  }

  async getManualTransactionsByUser(userId: string, options?: { startDate?: string; endDate?: string }): Promise<ManualTransaction[]> {
    const conditions = [eq(manualTransactions.userId, userId)];
    if (options?.startDate) {
      conditions.push(gte(manualTransactions.date, options.startDate));
    }
    if (options?.endDate) {
      conditions.push(lte(manualTransactions.date, options.endDate));
    }
    return db.select().from(manualTransactions).where(and(...conditions)).orderBy(desc(manualTransactions.date));
  }

  async getManualTransaction(id: string): Promise<ManualTransaction | undefined> {
    const result = await db.select().from(manualTransactions).where(eq(manualTransactions.id, id));
    return result[0];
  }

  async createManualTransaction(transaction: InsertManualTransaction & { userId: string; accountId: string }): Promise<ManualTransaction> {
    const result = await db.insert(manualTransactions).values({
      accountId: transaction.accountId,
      userId: transaction.userId,
      amount: transaction.amount,
      date: transaction.date,
      merchant: transaction.merchant,
      category: transaction.category || null,
      notes: transaction.notes || null,
      isTransfer: transaction.isTransfer || "false",
      createdAt: new Date().toISOString(),
    }).returning();

    // Update account balance
    const account = await this.getManualAccount(transaction.accountId);
    if (account) {
      const currentBalance = parseFloat(account.balance || "0");
      const txAmount = parseFloat(transaction.amount);
      // Positive amount = expense (reduces balance), negative = deposit (increases balance)
      const newBalance = (currentBalance - txAmount).toFixed(2);
      await this.updateManualAccount(transaction.accountId, { balance: newBalance });
    }

    return result[0];
  }

  async updateManualTransaction(id: string, updates: Partial<InsertManualTransaction>): Promise<ManualTransaction | undefined> {
    // Get original transaction to adjust balance if amount changed
    const original = await this.getManualTransaction(id);

    const result = await db.update(manualTransactions).set(updates).where(eq(manualTransactions.id, id)).returning();

    // Adjust account balance if amount changed
    if (original && updates.amount !== undefined && result[0]) {
      const account = await this.getManualAccount(original.accountId);
      if (account) {
        const currentBalance = parseFloat(account.balance || "0");
        const oldAmount = parseFloat(original.amount);
        const newAmount = parseFloat(updates.amount);
        // Reverse old amount, apply new amount
        const newBalance = (currentBalance + oldAmount - newAmount).toFixed(2);
        await this.updateManualAccount(original.accountId, { balance: newBalance });
      }
    }

    return result[0];
  }

  async deleteManualTransaction(id: string): Promise<boolean> {
    // Get transaction to adjust balance
    const transaction = await this.getManualTransaction(id);

    const result = await db.delete(manualTransactions).where(eq(manualTransactions.id, id)).returning();

    // Reverse the balance change
    if (transaction && result.length > 0) {
      const account = await this.getManualAccount(transaction.accountId);
      if (account) {
        const currentBalance = parseFloat(account.balance || "0");
        const txAmount = parseFloat(transaction.amount);
        // Reverse: add back the amount that was subtracted
        const newBalance = (currentBalance + txAmount).toFixed(2);
        await this.updateManualAccount(transaction.accountId, { balance: newBalance });
      }
    }

    return result.length > 0;
  }

  // Bulk delete methods for account deletion
  async deleteAllManualTransactionsByUser(userId: string): Promise<void> {
    await db.delete(manualTransactions).where(eq(manualTransactions.userId, userId));
  }

  async deleteAllManualAccountsByUser(userId: string): Promise<void> {
    await db.delete(manualAccounts).where(eq(manualAccounts.userId, userId));
  }

  async deleteAllPlaidTransactionsByUser(userId: string): Promise<void> {
    // Get all plaid accounts for this user first
    const userAccounts = await this.getAllPlaidAccounts(userId);
    const accountIds = userAccounts.map(a => a.id);
    if (accountIds.length > 0) {
      await db.delete(plaidTransactions).where(inArray(plaidTransactions.plaidAccountId, accountIds));
    }
  }

  async deleteAllPlaidAccountsByUser(userId: string): Promise<void> {
    // Get all plaid items for this user
    const userItems = await this.getPlaidItems(userId);
    const itemIds = userItems.map(i => i.id);
    if (itemIds.length > 0) {
      await db.delete(plaidAccounts).where(inArray(plaidAccounts.plaidItemId, itemIds));
    }
  }

  async deleteAllPlaidItemsByUser(userId: string): Promise<void> {
    await db.delete(plaidItems).where(eq(plaidItems.userId, userId));
  }

  async deleteAllReconciliationRulesByUser(userId: string): Promise<void> {
    await db.delete(reconciliationRules).where(eq(reconciliationRules.userId, userId));
  }

  async deleteAllExpensesByUser(userId: string): Promise<void> {
    await db.delete(expenses).where(eq(expenses.userId, userId));
  }

  async deleteAllBillsByUser(userId: string): Promise<void> {
    await db.delete(bills).where(eq(bills.userId, userId));
  }

  async deleteAllIncomesByUser(userId: string): Promise<void> {
    await db.delete(income).where(eq(income.userId, userId));
  }

  async deleteAllBudgetsByUser(userId: string): Promise<void> {
    await db.delete(budgets).where(eq(budgets.userId, userId));
  }

  async deleteAllSavingsGoalsByUser(userId: string): Promise<void> {
    await db.delete(savingsGoals).where(eq(savingsGoals.userId, userId));
  }

  async deleteAllCategoriesByUser(userId: string): Promise<void> {
    await db.delete(customCategories).where(eq(customCategories.userId, userId));
  }

  async deleteAllNotificationsByUser(userId: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.userId, userId));
  }

  async deleteAllHouseholdMembersByUser(userId: string): Promise<void> {
    await db.delete(householdMembers).where(eq(householdMembers.userId, userId));
  }

  async deleteAllHouseholdsByUser(userId: string): Promise<void> {
    // Get households where user is owner via householdMembers
    const ownedHouseholds = await db.select({ householdId: householdMembers.householdId })
      .from(householdMembers)
      .where(and(eq(householdMembers.userId, userId), eq(householdMembers.role, 'owner')));
    
    for (const h of ownedHouseholds) {
      // Delete all members first
      await db.delete(householdMembers).where(eq(householdMembers.householdId, h.householdId));
      // Delete the household
      await db.delete(households).where(eq(households.id, h.householdId));
    }
  }

  async deleteAllInvitationCodesByUser(userId: string): Promise<void> {
    await db.delete(householdInvitations).where(eq(householdInvitations.invitedBy, userId));
  }

  async deleteAllNotificationSettingsByUser(userId: string): Promise<void> {
    await db.delete(notificationSettings).where(eq(notificationSettings.userId, userId));
  }

  async deleteAllRecurringExpensesByUser(userId: string): Promise<void> {
    await db.delete(recurringExpenses).where(eq(recurringExpenses.userId, userId));
  }

  async deleteAllSyncSchedulesByUser(userId: string): Promise<void> {
    await db.delete(syncSchedules).where(eq(syncSchedules.userId, userId));
  }

  async deleteAllBudgetAlertsByUser(userId: string): Promise<void> {
    await db.delete(budgetAlerts).where(eq(budgetAlerts.userId, userId));
  }

  async deleteAllOnboardingAnalysisByUser(userId: string): Promise<void> {
    await db.delete(onboardingAnalysis).where(eq(onboardingAnalysis.userId, userId));
  }

  async deleteAllSpendingAlertsByUser(userId: string): Promise<void> {
    await db.delete(spendingAlerts).where(eq(spendingAlerts.userId, userId));
  }

  async deleteAllReferralCodesByUser(userId: string): Promise<void> {
    await db.delete(referralCodes).where(eq(referralCodes.userId, userId));
  }

  async deleteAllReferralsByUser(userId: string): Promise<void> {
    await db.delete(referrals).where(eq(referrals.referrerId, userId));
    await db.delete(referrals).where(eq(referrals.referredUserId, userId));
  }

  async deleteAllDebtDetailsByUser(userId: string): Promise<void> {
    await db.delete(debtDetails).where(eq(debtDetails.userId, userId));
  }

  // Debt Details
  async getDebtDetails(userId: string): Promise<DebtDetails[]> {
    return db.select().from(debtDetails)
      .where(and(eq(debtDetails.userId, userId), eq(debtDetails.isActive, "true")))
      .orderBy(desc(debtDetails.currentBalance));
  }

  async getDebtDetail(id: string): Promise<DebtDetails | undefined> {
    const result = await db.select().from(debtDetails).where(eq(debtDetails.id, id));
    return result[0];
  }

  async getDebtDetailByPlaidAccount(plaidAccountId: string): Promise<DebtDetails | undefined> {
    const result = await db.select().from(debtDetails)
      .where(eq(debtDetails.linkedPlaidAccountId, plaidAccountId));
    return result[0];
  }

  async createDebtDetail(debt: InsertDebtDetails & { userId: string }): Promise<DebtDetails> {
    const now = new Date().toISOString();
    const result = await db.insert(debtDetails).values({
      ...debt,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return result[0];
  }

  async updateDebtDetail(id: string, updates: Partial<InsertDebtDetails>): Promise<DebtDetails | undefined> {
    const result = await db.update(debtDetails)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(debtDetails.id, id))
      .returning();
    return result[0];
  }

  async deleteDebtDetail(id: string): Promise<boolean> {
    const result = await db.update(debtDetails)
      .set({ isActive: "false" })
      .where(eq(debtDetails.id, id))
      .returning();
    return result.length > 0;
  }

  // AI Insights
  async getAiInsights(userId: string, options?: { includeRead?: boolean; includeDismissed?: boolean }): Promise<AiInsight[]> {
    let conditions = [eq(aiInsights.userId, userId)];
    if (!options?.includeRead) {
      conditions.push(eq(aiInsights.isRead, "false"));
    }
    if (!options?.includeDismissed) {
      conditions.push(eq(aiInsights.isDismissed, "false"));
    }
    return db.select().from(aiInsights)
      .where(and(...conditions))
      .orderBy(desc(aiInsights.createdAt));
  }

  async getAiInsight(id: string): Promise<AiInsight | undefined> {
    const result = await db.select().from(aiInsights).where(eq(aiInsights.id, id));
    return result[0];
  }

  async createAiInsight(insight: InsertAiInsight): Promise<AiInsight> {
    const result = await db.insert(aiInsights).values({
      ...insight,
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateAiInsight(id: string, updates: Partial<AiInsight>): Promise<AiInsight | undefined> {
    const result = await db.update(aiInsights)
      .set(updates)
      .where(eq(aiInsights.id, id))
      .returning();
    return result[0];
  }

  async deleteAiInsight(id: string): Promise<boolean> {
    const result = await db.delete(aiInsights).where(eq(aiInsights.id, id)).returning();
    return result.length > 0;
  }

  async deleteExpiredAiInsights(): Promise<void> {
    const now = new Date().toISOString();
    await db.delete(aiInsights).where(lte(aiInsights.expiresAt, now));
  }

  // Transaction Anomalies
  async getTransactionAnomalies(userId: string, options?: { includeReviewed?: boolean }): Promise<TransactionAnomaly[]> {
    let conditions = [eq(transactionAnomalies.userId, userId)];
    if (!options?.includeReviewed) {
      conditions.push(eq(transactionAnomalies.isReviewed, "false"));
    }
    return db.select().from(transactionAnomalies)
      .where(and(...conditions))
      .orderBy(desc(transactionAnomalies.createdAt));
  }

  async getTransactionAnomaly(id: string): Promise<TransactionAnomaly | undefined> {
    const result = await db.select().from(transactionAnomalies).where(eq(transactionAnomalies.id, id));
    return result[0];
  }

  async getTransactionAnomalyByTransactionId(transactionId: string): Promise<TransactionAnomaly | undefined> {
    const result = await db.select().from(transactionAnomalies)
      .where(eq(transactionAnomalies.transactionId, transactionId));
    return result[0];
  }

  async createTransactionAnomaly(anomaly: InsertTransactionAnomaly): Promise<TransactionAnomaly> {
    const result = await db.insert(transactionAnomalies).values({
      ...anomaly,
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateTransactionAnomaly(id: string, updates: Partial<TransactionAnomaly>): Promise<TransactionAnomaly | undefined> {
    const result = await db.update(transactionAnomalies)
      .set(updates)
      .where(eq(transactionAnomalies.id, id))
      .returning();
    return result[0];
  }

  async deleteTransactionAnomaly(id: string): Promise<boolean> {
    const result = await db.delete(transactionAnomalies).where(eq(transactionAnomalies.id, id)).returning();
    return result.length > 0;
  }

  // Savings Recommendations
  async getSavingsRecommendations(userId: string, options?: { status?: string }): Promise<SavingsRecommendation[]> {
    let conditions = [eq(savingsRecommendations.userId, userId)];
    if (options?.status) {
      conditions.push(eq(savingsRecommendations.status, options.status));
    }
    return db.select().from(savingsRecommendations)
      .where(and(...conditions))
      .orderBy(desc(savingsRecommendations.createdAt));
  }

  async getSavingsRecommendation(id: string): Promise<SavingsRecommendation | undefined> {
    const result = await db.select().from(savingsRecommendations).where(eq(savingsRecommendations.id, id));
    return result[0];
  }

  async createSavingsRecommendation(recommendation: InsertSavingsRecommendation): Promise<SavingsRecommendation> {
    const result = await db.insert(savingsRecommendations).values({
      ...recommendation,
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateSavingsRecommendation(id: string, updates: Partial<SavingsRecommendation>): Promise<SavingsRecommendation | undefined> {
    const result = await db.update(savingsRecommendations)
      .set(updates)
      .where(eq(savingsRecommendations.id, id))
      .returning();
    return result[0];
  }

  async deleteSavingsRecommendation(id: string): Promise<boolean> {
    const result = await db.delete(savingsRecommendations).where(eq(savingsRecommendations.id, id)).returning();
    return result.length > 0;
  }

  async deleteExpiredSavingsRecommendations(): Promise<void> {
    const now = new Date().toISOString();
    await db.delete(savingsRecommendations)
      .where(and(
        lte(savingsRecommendations.validUntil, now),
        eq(savingsRecommendations.status, "pending")
      ));
  }

  // Investment Accounts
  async getInvestmentAccounts(userId: string): Promise<InvestmentAccount[]> {
    return db.select().from(investmentAccounts)
      .where(and(eq(investmentAccounts.userId, userId), eq(investmentAccounts.isActive, "true")))
      .orderBy(desc(investmentAccounts.createdAt));
  }

  async getInvestmentAccount(id: string): Promise<InvestmentAccount | undefined> {
    const result = await db.select().from(investmentAccounts).where(eq(investmentAccounts.id, id));
    return result[0];
  }

  async createInvestmentAccount(account: InsertInvestmentAccount & { userId: string }): Promise<InvestmentAccount> {
    const result = await db.insert(investmentAccounts).values({
      ...account,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateInvestmentAccount(id: string, updates: Partial<InsertInvestmentAccount>): Promise<InvestmentAccount | undefined> {
    const result = await db.update(investmentAccounts)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(investmentAccounts.id, id))
      .returning();
    return result[0];
  }

  async deleteInvestmentAccount(id: string): Promise<boolean> {
    const result = await db.update(investmentAccounts)
      .set({ isActive: "false" })
      .where(eq(investmentAccounts.id, id))
      .returning();
    return result.length > 0;
  }

  // Holdings
  async getHoldings(investmentAccountId: string): Promise<Holding[]> {
    return db.select().from(holdings)
      .where(eq(holdings.investmentAccountId, investmentAccountId))
      .orderBy(desc(holdings.currentValue));
  }

  async getHoldingsByUser(userId: string): Promise<Holding[]> {
    return db.select().from(holdings)
      .where(eq(holdings.userId, userId))
      .orderBy(desc(holdings.currentValue));
  }

  async getHolding(id: string): Promise<Holding | undefined> {
    const result = await db.select().from(holdings).where(eq(holdings.id, id));
    return result[0];
  }

  async createHolding(holding: InsertHolding & { userId: string }): Promise<Holding> {
    const result = await db.insert(holdings).values({
      ...holding,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateHolding(id: string, updates: Partial<InsertHolding>): Promise<Holding | undefined> {
    const result = await db.update(holdings)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(holdings.id, id))
      .returning();
    return result[0];
  }

  async deleteHolding(id: string): Promise<boolean> {
    const result = await db.delete(holdings).where(eq(holdings.id, id)).returning();
    return result.length > 0;
  }

  // Holdings History
  async getHoldingsHistory(holdingId: string, options?: { startDate?: string; endDate?: string }): Promise<HoldingsHistory[]> {
    let conditions = [eq(holdingsHistory.holdingId, holdingId)];
    if (options?.startDate) conditions.push(gte(holdingsHistory.date, options.startDate));
    if (options?.endDate) conditions.push(lte(holdingsHistory.date, options.endDate));
    return db.select().from(holdingsHistory)
      .where(and(...conditions))
      .orderBy(desc(holdingsHistory.date));
  }

  async createHoldingsHistory(history: InsertHoldingsHistory): Promise<HoldingsHistory> {
    const result = await db.insert(holdingsHistory).values({
      ...history,
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  // Assets
  async getAssets(userId: string): Promise<Asset[]> {
    return db.select().from(assets)
      .where(and(eq(assets.userId, userId), eq(assets.isActive, "true")))
      .orderBy(desc(assets.currentValue));
  }

  async getAsset(id: string): Promise<Asset | undefined> {
    const result = await db.select().from(assets).where(eq(assets.id, id));
    return result[0];
  }

  async createAsset(asset: InsertAsset & { userId: string }): Promise<Asset> {
    const result = await db.insert(assets).values({
      ...asset,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateAsset(id: string, updates: Partial<InsertAsset>): Promise<Asset | undefined> {
    const result = await db.update(assets)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(assets.id, id))
      .returning();
    return result[0];
  }

  async deleteAsset(id: string): Promise<boolean> {
    const result = await db.update(assets)
      .set({ isActive: "false" })
      .where(eq(assets.id, id))
      .returning();
    return result.length > 0;
  }

  // Asset Value History
  async getAssetValueHistory(assetId: string): Promise<AssetValueHistory[]> {
    return db.select().from(assetValueHistory)
      .where(eq(assetValueHistory.assetId, assetId))
      .orderBy(desc(assetValueHistory.date));
  }

  async createAssetValueHistory(history: InsertAssetValueHistory): Promise<AssetValueHistory> {
    const result = await db.insert(assetValueHistory).values({
      ...history,
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  // Net Worth Snapshots
  async getNetWorthSnapshots(userId: string, options?: { limit?: number }): Promise<NetWorthSnapshot[]> {
    const query = db.select().from(netWorthSnapshots)
      .where(eq(netWorthSnapshots.userId, userId))
      .orderBy(desc(netWorthSnapshots.date));
    if (options?.limit) {
      return query.limit(options.limit);
    }
    return query;
  }

  async getLatestNetWorthSnapshot(userId: string): Promise<NetWorthSnapshot | undefined> {
    const result = await db.select().from(netWorthSnapshots)
      .where(eq(netWorthSnapshots.userId, userId))
      .orderBy(desc(netWorthSnapshots.date))
      .limit(1);
    return result[0];
  }

  async createNetWorthSnapshot(snapshot: InsertNetWorthSnapshot & { userId: string }): Promise<NetWorthSnapshot> {
    const result = await db.insert(netWorthSnapshots).values({
      ...snapshot,
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  // Split Expenses
  async getSplitExpenses(householdId: string): Promise<SplitExpense[]> {
    return db.select().from(splitExpenses)
      .where(eq(splitExpenses.householdId, householdId))
      .orderBy(desc(splitExpenses.date));
  }

  async getSplitExpense(id: string): Promise<SplitExpense | undefined> {
    const result = await db.select().from(splitExpenses).where(eq(splitExpenses.id, id));
    return result[0];
  }

  async createSplitExpense(expense: InsertSplitExpense): Promise<SplitExpense> {
    const result = await db.insert(splitExpenses).values({
      ...expense,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateSplitExpense(id: string, updates: Partial<InsertSplitExpense>): Promise<SplitExpense | undefined> {
    const result = await db.update(splitExpenses)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(splitExpenses.id, id))
      .returning();
    return result[0];
  }

  async deleteSplitExpense(id: string): Promise<boolean> {
    const result = await db.delete(splitExpenses).where(eq(splitExpenses.id, id)).returning();
    return result.length > 0;
  }

  // Split Participants
  async getSplitParticipants(splitExpenseId: string): Promise<SplitParticipant[]> {
    return db.select().from(splitParticipants)
      .where(eq(splitParticipants.splitExpenseId, splitExpenseId));
  }

  async createSplitParticipant(participant: InsertSplitParticipant): Promise<SplitParticipant> {
    const result = await db.insert(splitParticipants).values({
      ...participant,
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateSplitParticipant(id: string, updates: Partial<SplitParticipant>): Promise<SplitParticipant | undefined> {
    const result = await db.update(splitParticipants)
      .set(updates)
      .where(eq(splitParticipants.id, id))
      .returning();
    return result[0];
  }

  async deleteSplitParticipant(id: string): Promise<boolean> {
    const result = await db.delete(splitParticipants).where(eq(splitParticipants.id, id)).returning();
    return result.length > 0;
  }

  // Settlement Payments
  async getSettlementPayments(householdId: string): Promise<SettlementPayment[]> {
    return db.select().from(settlementPayments)
      .where(eq(settlementPayments.householdId, householdId))
      .orderBy(desc(settlementPayments.createdAt));
  }

  async createSettlementPayment(payment: InsertSettlementPayment): Promise<SettlementPayment> {
    const result = await db.insert(settlementPayments).values({
      ...payment,
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  // Bulk delete for new tables
  async deleteAllInvestmentAccountsByUser(userId: string): Promise<void> {
    await db.delete(investmentAccounts).where(eq(investmentAccounts.userId, userId));
  }

  async deleteAllHoldingsByUser(userId: string): Promise<void> {
    await db.delete(holdings).where(eq(holdings.userId, userId));
  }

  async deleteAllAssetsByUser(userId: string): Promise<void> {
    await db.delete(assets).where(eq(assets.userId, userId));
  }

  async deleteAllNetWorthSnapshotsByUser(userId: string): Promise<void> {
    await db.delete(netWorthSnapshots).where(eq(netWorthSnapshots.userId, userId));
  }

  // Landing Page Settings
  async getLandingSettings(): Promise<LandingSetting[]> {
    try {
      return await db.select().from(landingSettings);
    } catch (err) {
      // If the table doesn't exist yet (first deploy before migration runs)
      // or the DB connection fails, return an empty array so the chatbot
      // and landing page degrade gracefully instead of throwing a 500.
      console.error("getLandingSettings failed — returning empty defaults:", err);
      return [];
    }
  }

  async getLandingSetting(key: string): Promise<LandingSetting | undefined> {
    try {
      const result = await db.select().from(landingSettings).where(eq(landingSettings.key, key));
      return result[0];
    } catch (err) {
      console.error(`getLandingSetting(${key}) failed — returning undefined:`, err);
      return undefined;
    }
  }

  async upsertLandingSetting(key: string, value: string, type: string = "text"): Promise<LandingSetting> {
    const existing = await this.getLandingSetting(key);
    if (existing) {
      const result = await db.update(landingSettings)
        .set({ value, type, updatedAt: new Date().toISOString() })
        .where(eq(landingSettings.key, key))
        .returning();
      return result[0];
    }
    const result = await db.insert(landingSettings).values({
      key,
      value,
      type,
      updatedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async deleteLandingSetting(key: string): Promise<boolean> {
    const result = await db.delete(landingSettings).where(eq(landingSettings.key, key)).returning();
    return result.length > 0;
  }

  // Landing Page Features
  async getLandingFeatures(activeOnly: boolean = false): Promise<LandingFeature[]> {
    if (activeOnly) {
      return db.select().from(landingFeatures)
        .where(eq(landingFeatures.isActive, "true"))
        .orderBy(landingFeatures.sortOrder);
    }
    return db.select().from(landingFeatures).orderBy(landingFeatures.sortOrder);
  }

  async getLandingFeature(id: string): Promise<LandingFeature | undefined> {
    const result = await db.select().from(landingFeatures).where(eq(landingFeatures.id, id));
    return result[0];
  }

  async createLandingFeature(feature: InsertLandingFeature): Promise<LandingFeature> {
    const result = await db.insert(landingFeatures).values({
      ...feature,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateLandingFeature(id: string, updates: Partial<InsertLandingFeature>): Promise<LandingFeature | undefined> {
    const result = await db.update(landingFeatures)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(landingFeatures.id, id))
      .returning();
    return result[0];
  }

  async deleteLandingFeature(id: string): Promise<boolean> {
    const result = await db.delete(landingFeatures).where(eq(landingFeatures.id, id)).returning();
    return result.length > 0;
  }

  // Landing Page Testimonials
  async getLandingTestimonials(activeOnly: boolean = false): Promise<LandingTestimonial[]> {
    if (activeOnly) {
      return db.select().from(landingTestimonials)
        .where(eq(landingTestimonials.isActive, "true"))
        .orderBy(landingTestimonials.sortOrder);
    }
    return db.select().from(landingTestimonials).orderBy(landingTestimonials.sortOrder);
  }

  async getLandingTestimonial(id: string): Promise<LandingTestimonial | undefined> {
    const result = await db.select().from(landingTestimonials).where(eq(landingTestimonials.id, id));
    return result[0];
  }

  async createLandingTestimonial(testimonial: InsertLandingTestimonial): Promise<LandingTestimonial> {
    const result = await db.insert(landingTestimonials).values({
      ...testimonial,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateLandingTestimonial(id: string, updates: Partial<InsertLandingTestimonial>): Promise<LandingTestimonial | undefined> {
    const result = await db.update(landingTestimonials)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(landingTestimonials.id, id))
      .returning();
    return result[0];
  }

  async deleteLandingTestimonial(id: string): Promise<boolean> {
    const result = await db.delete(landingTestimonials).where(eq(landingTestimonials.id, id)).returning();
    return result.length > 0;
  }

  // Landing Page Pricing
  async getLandingPricing(activeOnly: boolean = false): Promise<LandingPricing[]> {
    if (activeOnly) {
      return db.select().from(landingPricing)
        .where(eq(landingPricing.isActive, "true"))
        .orderBy(landingPricing.sortOrder);
    }
    return db.select().from(landingPricing).orderBy(landingPricing.sortOrder);
  }

  async getLandingPricingPlan(id: string): Promise<LandingPricing | undefined> {
    const result = await db.select().from(landingPricing).where(eq(landingPricing.id, id));
    return result[0];
  }

  async createLandingPricing(pricing: InsertLandingPricing): Promise<LandingPricing> {
    const result = await db.insert(landingPricing).values({
      ...pricing,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateLandingPricing(id: string, updates: Partial<InsertLandingPricing>): Promise<LandingPricing | undefined> {
    const result = await db.update(landingPricing)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(landingPricing.id, id))
      .returning();
    return result[0];
  }

  async deleteLandingPricing(id: string): Promise<boolean> {
    const result = await db.delete(landingPricing).where(eq(landingPricing.id, id)).returning();
    return result.length > 0;
  }

  async getLandingPricingByStripePriceId(stripePriceId: string): Promise<LandingPricing | undefined> {
    const result = await db.select().from(landingPricing)
      .where(eq(landingPricing.stripePriceId, stripePriceId));
    return result[0];
  }

  // Stripe User Info
  async getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined> {
    const result = await db.select().from(users)
      .where(eq(users.stripeCustomerId, stripeCustomerId));
    return result[0];
  }

  async updateUserStripeInfo(userId: string, stripeInfo: {
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    subscriptionStatus?: string | null;
    subscriptionPlanId?: string | null;
    trialEndsAt?: string | null;
    subscriptionEndsAt?: string | null;
    plan?: string | null;
    planStatus?: string | null;
    planStartedAt?: string | null;
  }): Promise<User | undefined> {
    const updates: Record<string, any> = {};
    if (stripeInfo.stripeCustomerId !== undefined) updates.stripeCustomerId = stripeInfo.stripeCustomerId;
    if (stripeInfo.stripeSubscriptionId !== undefined) updates.stripeSubscriptionId = stripeInfo.stripeSubscriptionId;
    if (stripeInfo.subscriptionStatus !== undefined) updates.subscriptionStatus = stripeInfo.subscriptionStatus;
    if (stripeInfo.subscriptionPlanId !== undefined) updates.subscriptionPlanId = stripeInfo.subscriptionPlanId;
    if (stripeInfo.trialEndsAt !== undefined) updates.trialEndsAt = stripeInfo.trialEndsAt;
    if (stripeInfo.subscriptionEndsAt !== undefined) updates.subscriptionEndsAt = stripeInfo.subscriptionEndsAt;
    if (stripeInfo.plan !== undefined) updates.plan = stripeInfo.plan;
    if (stripeInfo.planStatus !== undefined) updates.planStatus = stripeInfo.planStatus;
    if (stripeInfo.planStartedAt !== undefined) updates.planStartedAt = stripeInfo.planStartedAt;

    if (Object.keys(updates).length === 0) return this.getUser(userId);

    const result = await db.update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();
    return result[0];
  }

  // Landing Page Comparison
  async getLandingComparison(activeOnly: boolean = false): Promise<LandingComparison[]> {
    if (activeOnly) {
      return db.select().from(landingComparison)
        .where(eq(landingComparison.isActive, "true"))
        .orderBy(landingComparison.sortOrder);
    }
    return db.select().from(landingComparison).orderBy(landingComparison.sortOrder);
  }

  async getLandingComparisonRow(id: string): Promise<LandingComparison | undefined> {
    const result = await db.select().from(landingComparison).where(eq(landingComparison.id, id));
    return result[0];
  }

  async createLandingComparison(row: InsertLandingComparison): Promise<LandingComparison> {
    const result = await db.insert(landingComparison).values({
      ...row,
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateLandingComparison(id: string, updates: Partial<InsertLandingComparison>): Promise<LandingComparison | undefined> {
    const result = await db.update(landingComparison)
      .set(updates)
      .where(eq(landingComparison.id, id))
      .returning();
    return result[0];
  }

  async deleteLandingComparison(id: string): Promise<boolean> {
    const result = await db.delete(landingComparison).where(eq(landingComparison.id, id)).returning();
    return result.length > 0;
  }

  // Landing Page FAQ
  async getLandingFaqs(activeOnly: boolean = false): Promise<LandingFaq[]> {
    if (activeOnly) {
      return db.select().from(landingFaq)
        .where(eq(landingFaq.isActive, "true"))
        .orderBy(landingFaq.sortOrder);
    }
    return db.select().from(landingFaq).orderBy(landingFaq.sortOrder);
  }

  async getLandingFaq(id: string): Promise<LandingFaq | undefined> {
    const result = await db.select().from(landingFaq).where(eq(landingFaq.id, id));
    return result[0];
  }

  async createLandingFaq(faq: InsertLandingFaq): Promise<LandingFaq> {
    const result = await db.insert(landingFaq).values({
      ...faq,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateLandingFaq(id: string, updates: Partial<InsertLandingFaq>): Promise<LandingFaq | undefined> {
    const result = await db.update(landingFaq)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(landingFaq.id, id))
      .returning();
    return result[0];
  }

  async deleteLandingFaq(id: string): Promise<boolean> {
    const result = await db.delete(landingFaq).where(eq(landingFaq.id, id)).returning();
    return result.length > 0;
  }

  // Affiliate Settings
  async getAffiliateSettings(): Promise<AffiliateSetting[]> {
    return db.select().from(affiliateSettings);
  }

  async getAffiliateSetting(key: string): Promise<AffiliateSetting | undefined> {
    const result = await db.select().from(affiliateSettings).where(eq(affiliateSettings.key, key));
    return result[0];
  }

  async upsertAffiliateSetting(key: string, value: string, type: string = "string"): Promise<AffiliateSetting> {
    const existing = await this.getAffiliateSetting(key);
    if (existing) {
      const result = await db.update(affiliateSettings)
        .set({ value, type, updatedAt: new Date().toISOString() })
        .where(eq(affiliateSettings.key, key))
        .returning();
      return result[0];
    }
    const result = await db.insert(affiliateSettings).values({
      key,
      value,
      type,
      updatedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  // Landing Video Annotations
  async getVideoAnnotations(activeOnly: boolean = false): Promise<LandingVideoAnnotation[]> {
    if (activeOnly) {
      return db.select().from(landingVideoAnnotations)
        .where(eq(landingVideoAnnotations.isActive, "true"))
        .orderBy(landingVideoAnnotations.sortOrder);
    }
    return db.select().from(landingVideoAnnotations).orderBy(landingVideoAnnotations.sortOrder);
  }

  async getVideoAnnotation(id: string): Promise<LandingVideoAnnotation | undefined> {
    const result = await db.select().from(landingVideoAnnotations).where(eq(landingVideoAnnotations.id, id));
    return result[0];
  }

  async createVideoAnnotation(annotation: InsertLandingVideoAnnotation): Promise<LandingVideoAnnotation> {
    const result = await db.insert(landingVideoAnnotations).values({
      ...annotation,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateVideoAnnotation(id: string, updates: Partial<InsertLandingVideoAnnotation>): Promise<LandingVideoAnnotation | undefined> {
    const result = await db.update(landingVideoAnnotations)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(landingVideoAnnotations.id, id))
      .returning();
    return result[0];
  }

  async deleteVideoAnnotation(id: string): Promise<boolean> {
    const result = await db.delete(landingVideoAnnotations).where(eq(landingVideoAnnotations.id, id)).returning();
    return result.length > 0;
  }

  // ============ SALES CHATBOT ============

  // Sales Chat Sessions
  async getSalesChatSessions(options?: {
    startDate?: string;
    endDate?: string;
    status?: string;
    hasLead?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ sessions: SalesChatSession[]; total: number }> {
    const conditions = [];

    if (options?.startDate) {
      conditions.push(gte(salesChatSessions.startedAt, options.startDate));
    }
    if (options?.endDate) {
      conditions.push(lte(salesChatSessions.startedAt, options.endDate));
    }
    if (options?.status) {
      conditions.push(eq(salesChatSessions.status, options.status));
    }
    if (options?.hasLead) {
      conditions.push(eq(salesChatSessions.hasLeadForm, options.hasLead));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [sessions, countResult] = await Promise.all([
      db.select()
        .from(salesChatSessions)
        .where(whereClause)
        .orderBy(desc(salesChatSessions.startedAt))
        .limit(options?.limit || 50)
        .offset(options?.offset || 0),
      db.select().from(salesChatSessions).where(whereClause)
    ]);

    return { sessions, total: countResult.length };
  }

  async getSalesChatSession(id: string): Promise<SalesChatSession | undefined> {
    const result = await db.select().from(salesChatSessions).where(eq(salesChatSessions.id, id));
    return result[0];
  }

  async getSalesChatSessionByVisitor(visitorId: string): Promise<SalesChatSession | undefined> {
    const result = await db.select()
      .from(salesChatSessions)
      .where(and(
        eq(salesChatSessions.visitorId, visitorId),
        eq(salesChatSessions.status, "active")
      ))
      .orderBy(desc(salesChatSessions.startedAt))
      .limit(1);
    return result[0];
  }

  async createSalesChatSession(session: InsertSalesChatSession): Promise<SalesChatSession> {
    const result = await db.insert(salesChatSessions).values({
      ...session,
      startedAt: session.startedAt || new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateSalesChatSession(id: string, updates: Partial<SalesChatSession>): Promise<SalesChatSession | undefined> {
    const result = await db.update(salesChatSessions)
      .set(updates)
      .where(eq(salesChatSessions.id, id))
      .returning();
    return result[0];
  }

  // Sales Chat Messages
  async getSalesChatMessages(sessionId: string): Promise<SalesChatMessage[]> {
    return db.select()
      .from(salesChatMessages)
      .where(eq(salesChatMessages.sessionId, sessionId))
      .orderBy(salesChatMessages.createdAt);
  }

  async createSalesChatMessage(message: InsertSalesChatMessage): Promise<SalesChatMessage> {
    const result = await db.insert(salesChatMessages).values({
      ...message,
      createdAt: message.createdAt || new Date().toISOString(),
    }).returning();

    // Update message count on session
    const messages = await db.select().from(salesChatMessages).where(eq(salesChatMessages.sessionId, message.sessionId));
    await db.update(salesChatSessions)
      .set({ messageCount: messages.length })
      .where(eq(salesChatSessions.id, message.sessionId));

    return result[0];
  }

  // Sales Leads
  async getSalesLeads(options?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ leads: SalesLead[]; total: number }> {
    const conditions = [];

    if (options?.status) {
      conditions.push(eq(salesLeads.status, options.status));
    }
    if (options?.startDate) {
      conditions.push(gte(salesLeads.createdAt, options.startDate));
    }
    if (options?.endDate) {
      conditions.push(lte(salesLeads.createdAt, options.endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [leads, countResult] = await Promise.all([
      db.select()
        .from(salesLeads)
        .where(whereClause)
        .orderBy(desc(salesLeads.createdAt))
        .limit(options?.limit || 50)
        .offset(options?.offset || 0),
      db.select().from(salesLeads).where(whereClause)
    ]);

    return { leads, total: countResult.length };
  }

  async getSalesLead(id: string): Promise<SalesLead | undefined> {
    const result = await db.select().from(salesLeads).where(eq(salesLeads.id, id));
    return result[0];
  }

  async getSalesLeadBySession(sessionId: string): Promise<SalesLead | undefined> {
    const result = await db.select().from(salesLeads).where(eq(salesLeads.sessionId, sessionId));
    return result[0];
  }

  async createSalesLead(lead: InsertSalesLead): Promise<SalesLead> {
    const result = await db.insert(salesLeads).values({
      ...lead,
      createdAt: lead.createdAt || new Date().toISOString(),
    }).returning();

    // Mark session as having a lead
    await db.update(salesChatSessions)
      .set({ hasLeadForm: "true" })
      .where(eq(salesChatSessions.id, lead.sessionId));

    return result[0];
  }

  async updateSalesLead(id: string, updates: Partial<SalesLead>): Promise<SalesLead | undefined> {
    const result = await db.update(salesLeads)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(salesLeads.id, id))
      .returning();
    return result[0];
  }

  // ============ FUTURE INTELLIGENCE IMPLEMENTATIONS ============

  // Autopilot Rules
  async getAutopilotRules(userId: string): Promise<AutopilotRule[]> {
    return db.select().from(autopilotRules).where(eq(autopilotRules.userId, userId));
  }

  async getAutopilotRule(id: string): Promise<AutopilotRule | undefined> {
    const result = await db.select().from(autopilotRules).where(eq(autopilotRules.id, id));
    return result[0];
  }

  async createAutopilotRule(rule: InsertAutopilotRule & { userId: string }): Promise<AutopilotRule> {
    const result = await db.insert(autopilotRules).values({
      ...rule,
      createdAt: rule.createdAt || new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateAutopilotRule(id: string, updates: Partial<InsertAutopilotRule>): Promise<AutopilotRule | undefined> {
    const result = await db.update(autopilotRules).set(updates).where(eq(autopilotRules.id, id)).returning();
    return result[0];
  }

  async deleteAutopilotRule(id: string): Promise<boolean> {
    const result = await db.delete(autopilotRules).where(eq(autopilotRules.id, id)).returning();
    return result.length > 0;
  }

  // Leak Alerts
  async getLeakAlerts(userId: string, options?: { includeDismissed?: boolean }): Promise<LeakAlert[]> {
    if (options?.includeDismissed) {
      return db.select().from(leakAlerts).where(eq(leakAlerts.userId, userId)).orderBy(desc(leakAlerts.detectedAt));
    }
    return db.select().from(leakAlerts)
      .where(and(eq(leakAlerts.userId, userId), eq(leakAlerts.isDismissed, "false")))
      .orderBy(desc(leakAlerts.detectedAt));
  }

  async getLeakAlert(id: string): Promise<LeakAlert | undefined> {
    const result = await db.select().from(leakAlerts).where(eq(leakAlerts.id, id));
    return result[0];
  }

  async createLeakAlert(alert: InsertLeakAlert & { userId: string }): Promise<LeakAlert> {
    const result = await db.insert(leakAlerts).values({
      ...alert,
      detectedAt: alert.detectedAt || new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateLeakAlert(id: string, updates: Partial<LeakAlert>): Promise<LeakAlert | undefined> {
    const result = await db.update(leakAlerts).set(updates).where(eq(leakAlerts.id, id)).returning();
    return result[0];
  }

  async dismissLeakAlert(id: string): Promise<LeakAlert | undefined> {
    const result = await db.update(leakAlerts)
      .set({ isDismissed: "true", dismissedAt: new Date().toISOString() })
      .where(eq(leakAlerts.id, id))
      .returning();
    return result[0];
  }

  async deleteLeakAlert(id: string): Promise<boolean> {
    const result = await db.delete(leakAlerts).where(eq(leakAlerts.id, id)).returning();
    return result.length > 0;
  }

  // Trial Events
  async getTrialEvents(userId: string): Promise<TrialEvent[]> {
    return db.select().from(trialEvents).where(eq(trialEvents.userId, userId)).orderBy(desc(trialEvents.createdAt));
  }

  async createTrialEvent(event: InsertTrialEvent & { userId: string }): Promise<TrialEvent> {
    const result = await db.insert(trialEvents).values({
      ...event,
      createdAt: event.createdAt || new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async hasTrialEvent(userId: string, eventType: string): Promise<boolean> {
    const result = await db.select().from(trialEvents)
      .where(and(eq(trialEvents.userId, userId), eq(trialEvents.eventType, eventType)));
    return result.length > 0;
  }

  // What-If Scenarios
  async getWhatIfScenarios(userId: string, savedOnly?: boolean): Promise<WhatIfScenario[]> {
    if (savedOnly) {
      return db.select().from(whatIfScenarios)
        .where(and(eq(whatIfScenarios.userId, userId), eq(whatIfScenarios.isSaved, "true")))
        .orderBy(desc(whatIfScenarios.createdAt));
    }
    return db.select().from(whatIfScenarios).where(eq(whatIfScenarios.userId, userId)).orderBy(desc(whatIfScenarios.createdAt));
  }

  async getWhatIfScenario(id: string): Promise<WhatIfScenario | undefined> {
    const result = await db.select().from(whatIfScenarios).where(eq(whatIfScenarios.id, id));
    return result[0];
  }

  async createWhatIfScenario(scenario: InsertWhatIfScenario & { userId: string }): Promise<WhatIfScenario> {
    const result = await db.insert(whatIfScenarios).values({
      ...scenario,
      createdAt: scenario.createdAt || new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateWhatIfScenario(id: string, updates: Partial<InsertWhatIfScenario>): Promise<WhatIfScenario | undefined> {
    const result = await db.update(whatIfScenarios).set(updates).where(eq(whatIfScenarios.id, id)).returning();
    return result[0];
  }

  async deleteWhatIfScenario(id: string): Promise<boolean> {
    const result = await db.delete(whatIfScenarios).where(eq(whatIfScenarios.id, id)).returning();
    return result.length > 0;
  }

  // Spendability Snapshots
  async getSpendabilitySnapshot(userId: string, date: string): Promise<SpendabilitySnapshot | undefined> {
    const result = await db.select().from(spendabilitySnapshots)
      .where(and(eq(spendabilitySnapshots.userId, userId), eq(spendabilitySnapshots.date, date)));
    return result[0];
  }

  async createSpendabilitySnapshot(snapshot: InsertSpendabilitySnapshot & { userId: string }): Promise<SpendabilitySnapshot> {
    const result = await db.insert(spendabilitySnapshots).values({
      ...snapshot,
      calculatedAt: snapshot.calculatedAt || new Date().toISOString(),
    }).returning();
    return result[0];
  }

  // Payday Recommendations
  async getPaydayRecommendations(userId: string): Promise<PaydayRecommendation[]> {
    return db.select().from(paydayRecommendations)
      .where(eq(paydayRecommendations.userId, userId))
      .orderBy(desc(paydayRecommendations.estimatedSavings));
  }

  async getPaydayRecommendation(id: string): Promise<PaydayRecommendation | undefined> {
    const result = await db.select().from(paydayRecommendations).where(eq(paydayRecommendations.id, id));
    return result[0];
  }

  async createPaydayRecommendation(recommendation: InsertPaydayRecommendation & { userId: string }): Promise<PaydayRecommendation> {
    const result = await db.insert(paydayRecommendations).values({
      ...recommendation,
      createdAt: recommendation.createdAt || new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updatePaydayRecommendation(id: string, updates: Partial<PaydayRecommendation>): Promise<PaydayRecommendation | undefined> {
    const result = await db.update(paydayRecommendations).set(updates).where(eq(paydayRecommendations.id, id)).returning();
    return result[0];
  }

  async deletePaydayRecommendation(id: string): Promise<boolean> {
    const result = await db.delete(paydayRecommendations).where(eq(paydayRecommendations.id, id)).returning();
    return result.length > 0;
  }

  // Receipts
  async getReceipts(userId: string, options?: { startDate?: string; endDate?: string; category?: string }): Promise<Receipt[]> {
    const conditions = [eq(receipts.userId, userId)];
    if (options?.startDate) conditions.push(gte(receipts.date, options.startDate));
    if (options?.endDate) conditions.push(lte(receipts.date, options.endDate));
    if (options?.category) conditions.push(eq(receipts.category, options.category));
    return db.select().from(receipts).where(and(...conditions)).orderBy(desc(receipts.createdAt));
  }

  async getReceipt(id: string): Promise<Receipt | undefined> {
    const result = await db.select().from(receipts).where(eq(receipts.id, id));
    return result[0];
  }

  async createReceipt(receipt: InsertReceipt & { userId: string }): Promise<Receipt> {
    const result = await db.insert(receipts).values({
      ...receipt,
      createdAt: receipt.createdAt || new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async updateReceipt(id: string, updates: Partial<InsertReceipt>): Promise<Receipt | undefined> {
    const result = await db.update(receipts).set(updates).where(eq(receipts.id, id)).returning();
    return result[0];
  }

  async deleteReceipt(id: string): Promise<boolean> {
    const result = await db.delete(receipts).where(eq(receipts.id, id)).returning();
    return result.length > 0;
  }

  // Support Tickets
  async createSupportTicket(ticket: InsertSupportTicket): Promise<SupportTicket> {
    const result = await db.insert(supportTickets).values({
      ...ticket,
      status: ticket.status || "open",
      emailSent: ticket.emailSent || "false",
      createdAt: ticket.createdAt || new Date().toISOString(),
      updatedAt: ticket.updatedAt || new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async getSupportTickets(): Promise<SupportTicket[]> {
    return db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
  }

  async getSupportTicketById(id: string): Promise<SupportTicket | undefined> {
    const result = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
    return result[0];
  }

  async getSupportTicketByNumber(ticketNumber: string): Promise<SupportTicket | undefined> {
    const result = await db.select().from(supportTickets).where(eq(supportTickets.ticketNumber, ticketNumber));
    return result[0];
  }

  async getSupportTicketsByUserId(userId: string): Promise<SupportTicket[]> {
    return db.select().from(supportTickets)
      .where(eq(supportTickets.userId, userId))
      .orderBy(desc(supportTickets.createdAt));
  }

  async updateSupportTicket(id: string, updates: Partial<SupportTicket>): Promise<SupportTicket | undefined> {
    const result = await db.update(supportTickets)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(supportTickets.id, id))
      .returning();
    return result[0];
  }

  async createSupportTicketMessage(msg: InsertSupportTicketMessage): Promise<SupportTicketMessage> {
    const result = await db.insert(supportTicketMessages).values({
      ...msg,
      createdAt: msg.createdAt || new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async getMessagesByTicketId(ticketId: string): Promise<SupportTicketMessage[]> {
    return db.select().from(supportTicketMessages)
      .where(eq(supportTicketMessages.ticketId, ticketId))
      .orderBy(supportTicketMessages.createdAt);
  }
}

// Use database storage for persistence
export const storage = new DatabaseStorage();
