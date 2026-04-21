/**
 * Detection Provenance — Zod schema validation tests
 *
 * Validates that the insertBillSchema and insertIncomeSchema correctly
 * accept all detection provenance fields (detectionSource, detectionRef,
 * detectionRefType, detectionConfidence, lastVerifiedAt, lastVerifiedBy)
 * plus autoDetected/detectedAt on bills.
 */

import { describe, it, expect } from "vitest";
import {
  insertBillSchema,
  insertIncomeSchema,
  DETECTION_SOURCES,
  DETECTION_REF_TYPES,
  DETECTION_CONFIDENCES,
  DETECTION_VERIFIERS,
} from "../shared/schema";

// ── Enum exports ────────────────────────────────────────────────────────────

describe("Detection provenance enums", () => {
  it("exports DETECTION_SOURCES with expected values", () => {
    expect(DETECTION_SOURCES).toEqual(["plaid", "mx", "ai", "manual"]);
  });

  it("exports DETECTION_REF_TYPES with expected values", () => {
    expect(DETECTION_REF_TYPES).toEqual([
      "plaid_stream_id",
      "mx_feed_id",
      "ai_run_id",
    ]);
  });

  it("exports DETECTION_CONFIDENCES with expected values", () => {
    expect(DETECTION_CONFIDENCES).toEqual(["high", "medium", "low"]);
  });

  it("exports DETECTION_VERIFIERS with expected values", () => {
    expect(DETECTION_VERIFIERS).toEqual(["user", "system"]);
  });
});

// ── Bill schema ─────────────────────────────────────────────────────────────

describe("insertBillSchema — provenance fields", () => {
  const baseBill = {
    userId: "user-1",
    name: "Netflix",
    amount: "15.99",
    category: "Subscriptions",
    dueDay: 15,
    recurrence: "monthly",
  };

  it("accepts a bill with no provenance fields (all optional)", () => {
    const result = insertBillSchema.safeParse(baseBill);
    expect(result.success).toBe(true);
  });

  it("accepts a bill with full provenance (plaid auto-detected)", () => {
    const result = insertBillSchema.safeParse({
      ...baseBill,
      autoDetected: true,
      detectedAt: new Date().toISOString(),
      detectionSource: "plaid",
      detectionRef: "stream_abc123",
      detectionRefType: "plaid_stream_id",
      detectionConfidence: "high",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a bill with detectionSource = 'manual'", () => {
    const result = insertBillSchema.safeParse({
      ...baseBill,
      detectionSource: "manual",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid detectionSource", () => {
    const result = insertBillSchema.safeParse({
      ...baseBill,
      detectionSource: "invalid_source",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid detectionConfidence", () => {
    const result = insertBillSchema.safeParse({
      ...baseBill,
      detectionConfidence: "very_high",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null values for nullable provenance fields", () => {
    const result = insertBillSchema.safeParse({
      ...baseBill,
      detectionSource: null,
      detectionRef: null,
      detectionRefType: null,
      detectionConfidence: null,
      lastVerifiedAt: null,
      lastVerifiedBy: null,
    });
    expect(result.success).toBe(true);
  });
});

// ── Income schema ───────────────────────────────────────────────────────────

describe("insertIncomeSchema — provenance fields", () => {
  const baseIncome = {
    userId: "user-1",
    source: "Employer Inc",
    amount: "5000.00",
    date: "2026-04-01",
  };

  it("accepts income with no provenance fields", () => {
    const result = insertIncomeSchema.safeParse(baseIncome);
    expect(result.success).toBe(true);
  });

  it("accepts income with full provenance (plaid auto-detected)", () => {
    const result = insertIncomeSchema.safeParse({
      ...baseIncome,
      detectionSource: "plaid",
      detectionRef: "txn_xyz789",
      detectionRefType: "plaid_stream_id",
      detectionConfidence: "high",
    });
    expect(result.success).toBe(true);
  });

  it("accepts income with detectionSource = 'ai'", () => {
    const result = insertIncomeSchema.safeParse({
      ...baseIncome,
      detectionSource: "ai",
      detectionConfidence: "medium",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid detectionRefType", () => {
    const result = insertIncomeSchema.safeParse({
      ...baseIncome,
      detectionRefType: "invalid_ref_type",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null values for nullable provenance fields", () => {
    const result = insertIncomeSchema.safeParse({
      ...baseIncome,
      detectionSource: null,
      detectionRef: null,
      detectionRefType: null,
      detectionConfidence: null,
      lastVerifiedAt: null,
      lastVerifiedBy: null,
    });
    expect(result.success).toBe(true);
  });
});
