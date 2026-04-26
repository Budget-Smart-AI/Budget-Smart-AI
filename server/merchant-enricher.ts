import { db } from './db';
import { routeAI } from './ai-router';
import { mapProviderCategory } from './merchant-categories';
import { mapPlaidCategoryDetailed, mapPlaidCategory } from './plaid';
import { getMerchantOverride } from './merchant-overrides';

export interface EnrichmentResult {
  cleanName: string;
  category: string;
  subcategory: string;
  merchantType: string;
  isSubscription: boolean;
  logoUrl: string | null;
  website: string | null;
  confidence: number;
  source: string;
}

function normalizeRawDescription(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\*[A-Z0-9]{4,}/g, '')
    .replace(
      /\b(SEATTLE|NEW YORK|LOS ANGELES|TORONTO|VANCOUVER|CHICAGO|HOUSTON|PHOENIX|SAN FRANCISCO|BOSTON|DENVER|CALGARY|EDMONTON|MONTREAL|OTTAWA|MISSISSAUGA|BRAMPTON|HAMILTON)\b/g,
      ''
    )
    .replace(/\s+[A-Z]{2}\s*$/, '')
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '')
    .replace(/^(SQ \*|TST\*|PP\*|PAYPAL\*|RECURRING PYMT[-\s]*|CHECKCARD\s*|POS\s*|ACH\s*|PREAUTH\s*|PURCHASE\s*)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Logo fetching is handled directly by Plaid (merchant.logo_url / counterparties[0].logo_url)
// and MX (logo_url field). No external logo API is used.

async function enrichWithAI(
  rawDescription: string,
  normalized: string,
  amount: number,
  providerCategory?: string
): Promise<EnrichmentResult> {
  const result = await routeAI({
    taskSlot: 'detection_auto',
    featureContext: 'merchant_enrichment',
    maxTokens: 200,
    temperature: 0.1,
    messages: [{
      role: 'system',
      content: 'You are a financial transaction enrichment system. Given a raw bank transaction, identify the merchant and categorize it accurately. JSON only.',
    }, {
      role: 'user',
      content: `Enrich this transaction:
Raw: "${rawDescription}"
Normalized: "${normalized}"
Amount: $${amount}
${providerCategory ? `Provider category: ${providerCategory}` : ''}

Return JSON:
{
  "cleanName": "human readable merchant name",
  "category": "one of: Food & Dining, Shopping, Transportation, Housing, Health & Wellness, Entertainment, Subscriptions, Financial, Income, Personal Care, Education, Travel, Gifts & Donations, Transfers, Other",
  "subcategory": "specific subcategory",
  "merchantType": "retail|restaurant|grocery|subscription|utility|transport|financial|healthcare|entertainment|transfer|other",
  "isSubscription": false,
  "confidence": 0.5
}`,
    }],
  });

  try {
    const parsed = JSON.parse(
      result.content
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim()
    ) as Partial<EnrichmentResult & { isSubscription: boolean; confidence: number }>;
    return {
      cleanName: parsed.cleanName || normalized,
      category: parsed.category || 'Other',
      subcategory: parsed.subcategory || 'Uncategorized',
      merchantType: parsed.merchantType || 'other',
      isSubscription: parsed.isSubscription || false,
      logoUrl: null,
      website: null,
      confidence: (parsed as any).confidence || 0.5,
      source: 'ai',
    };
  } catch {
    return {
      cleanName: normalized,
      category: 'Other',
      subcategory: 'Uncategorized',
      merchantType: 'other',
      isSubscription: false,
      logoUrl: null,
      website: null,
      confidence: 0.3,
      source: 'ai_fallback',
    };
  }
}

export async function enrichTransaction(params: {
  rawDescription: string;
  amount: number;
  providerCategory?: string;
  /**
   * Plaid Personal Finance Category detailed enum (e.g. RENT_AND_UTILITIES_TELEPHONE).
   * When available, this is the highest-confidence source and Monarch-parity categorization.
   */
  plaidCategoryDetailed?: string | null;
  /**
   * Plaid Personal Finance Category primary enum (e.g. RENT_AND_UTILITIES).
   * Used as a second-tier fallback when detailed is absent.
   */
  plaidCategoryPrimary?: string | null;
}): Promise<EnrichmentResult> {
  const { rawDescription, amount, providerCategory, plaidCategoryDetailed, plaidCategoryPrimary } = params;
  const normalized = normalizeRawDescription(rawDescription);

  // 1. Hardcoded merchant override — for known-wrong-from-Plaid merchants
  //    (Bell Canada flagged as Medical, Rogers as Shopping, etc.)
  //    These take absolute priority over everything else.
  const hardcoded = getMerchantOverride(normalized);
  if (hardcoded) {
    return {
      cleanName: hardcoded.cleanName,
      category: hardcoded.category,
      subcategory: hardcoded.subcategory,
      merchantType: hardcoded.merchantType,
      isSubscription: hardcoded.isSubscription,
      logoUrl: null,
      website: null,
      confidence: 1.0,
      source: 'override',
    };
  }

  // 2. Check cache (merchant_enrichment table holds both AI results and user corrections)
  try {
    const pool = (db as any).$client as import('pg').Pool;
    const cached = await pool.query(
      `SELECT * FROM merchant_enrichment WHERE raw_pattern = $1`,
      [normalized]
    );
    if (cached.rows.length > 0) {
      const r = cached.rows[0];
      pool.query(
        `UPDATE merchant_enrichment SET use_count = use_count + 1, last_used_at = NOW() WHERE raw_pattern = $1`,
        [normalized]
      ).catch(() => {});
      return {
        cleanName: r.clean_name,
        category: r.category || 'Other',
        subcategory: r.subcategory || 'Uncategorized',
        merchantType: r.merchant_type || 'other',
        isSubscription: r.is_subscription || false,
        logoUrl: r.logo_url,
        website: r.website,
        confidence: parseFloat(r.confidence) || 0.5,
        source: 'cache',
      };
    }
  } catch (err) {
    console.error('[Enricher] Cache lookup:', err);
  }

  // 3. Use Plaid's detailed PFC enum when available — this is Monarch-parity.
  //    Plaid's ML on `personal_finance_category.detailed` is more accurate than our AI for
  //    well-known merchants. We only fall through to AI when Plaid returns nothing.
  const plaidDetailedMapped = plaidCategoryDetailed
    ? mapPlaidCategoryDetailed(plaidCategoryDetailed)
    : null;
  const plaidPrimaryMapped = plaidCategoryPrimary
    ? mapPlaidCategory(plaidCategoryPrimary)
    : null;

  // 4. Legacy provider-category fallback (MX and historical Plaid basic categories)
  const providerMapped = providerCategory ? mapProviderCategory(providerCategory) : null;

  // 5. Run AI enrichment (still useful for subcategory, merchantType, isSubscription)
  const aiResult = await enrichWithAI(rawDescription, normalized, amount, providerCategory);

  // 6. Merge with priority: Plaid detailed > Plaid primary (if high confidence) >
  //    low-confidence AI overridden by provider map > AI
  let finalCategory = aiResult.category;
  let finalSubcategory = aiResult.subcategory;
  let finalSource = aiResult.source;
  let finalConfidence = aiResult.confidence;

  if (plaidDetailedMapped) {
    finalCategory = plaidDetailedMapped;
    finalSubcategory = aiResult.subcategory; // keep AI's more specific subcategory
    finalSource = 'plaid_detailed';
    finalConfidence = Math.max(aiResult.confidence, 0.85);
  } else if (plaidPrimaryMapped && plaidPrimaryMapped !== 'Other') {
    finalCategory = plaidPrimaryMapped;
    finalSource = 'plaid_primary';
    finalConfidence = Math.max(aiResult.confidence, 0.75);
  } else if (providerMapped && aiResult.confidence < 0.6) {
    finalCategory = providerMapped.category;
    finalSubcategory = providerMapped.subcategory;
    finalSource = 'provider_map';
  }

  const final: EnrichmentResult = {
    ...aiResult,
    logoUrl: null,
    website: null,
    category: finalCategory,
    subcategory: finalSubcategory,
    source: finalSource,
    confidence: finalConfidence,
  };

  // Cache the result
  try {
    const pool = (db as any).$client as import('pg').Pool;
    await pool.query(
      `INSERT INTO merchant_enrichment (
        raw_pattern, clean_name, category, subcategory, merchant_type,
        is_subscription, logo_url, website, confidence, source
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (raw_pattern) DO UPDATE SET
        clean_name = EXCLUDED.clean_name,
        logo_url = COALESCE(EXCLUDED.logo_url, merchant_enrichment.logo_url),
        use_count = merchant_enrichment.use_count + 1,
        last_used_at = NOW(),
        updated_at = NOW()`,
      [
        normalized, final.cleanName, final.category, final.subcategory,
        final.merchantType, final.isSubscription, final.logoUrl, final.website,
        final.confidence, final.source,
      ]
    );
  } catch (err) {
    console.error('[Enricher] Cache store:', err);
  }

  return final;
}

export async function enrichPendingTransactions(userId: string, limit = 50): Promise<number> {
  const pool = (db as any).$client as import('pg').Pool;
  let count = 0;

  // Enrich plaid_transactions — also pass through Plaid's detailed PFC enum
  // §6.2.8: legacy `category` and `personal_category` columns dropped — derive
  // primary PFC from `personal_finance_category_detailed` (e.g.
  // FOOD_AND_DRINK_GROCERIES → FOOD_AND_DRINK).
  const plaidPending = await pool.query(
    `SELECT t.id, t.name AS description, t.amount,
            t.personal_finance_category_detailed
     FROM plaid_transactions t
     JOIN plaid_accounts pa ON pa.id = t.plaid_account_id
     WHERE pa.plaid_item_id IN (SELECT id FROM plaid_items WHERE user_id = $1)
       AND t.merchant_clean_name IS NULL
     ORDER BY t.date DESC
     LIMIT $2`,
    [userId, limit]
  );

  for (const tx of plaidPending.rows) {
    try {
      // Derive Plaid's primary PFC (e.g. "FOOD_AND_DRINK") from the detailed
      // enum (e.g. "FOOD_AND_DRINK_GROCERIES") by stripping the last segment.
      const pfcDetailed: string | null = tx.personal_finance_category_detailed || null;
      const pfcPrimary: string | null = pfcDetailed
        ? pfcDetailed.split('_').slice(0, -1).join('_') || pfcDetailed
        : null;
      const result = await enrichTransaction({
        rawDescription: tx.description,
        amount: Math.abs(parseFloat(tx.amount)),
        providerCategory: pfcPrimary ?? undefined,
        plaidCategoryDetailed: pfcDetailed ?? undefined,
        plaidCategoryPrimary: pfcPrimary ?? undefined,
      });
      await pool.query(
        `UPDATE plaid_transactions SET
          merchant_clean_name = $1,
          merchant_logo_url = $2,
          subcategory = $3,
          merchant_type = $4,
          is_subscription = $5,
          enrichment_source = $6,
          enrichment_confidence = $7
         WHERE id = $8`,
        [result.cleanName, result.logoUrl, result.subcategory, result.merchantType,
         result.isSubscription ? 'true' : 'false', result.source, result.confidence, tx.id]
      );
      count++;
      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      console.error('[Enricher] Backfill failed plaid tx:', tx.id, err);
    }
  }

  // Enrich mx_transactions (MX doesn't have PFC detailed).
  // §6.2.8: legacy `category` column dropped — fall back to MX's
  // `top_level_category` for the providerCategory hint.
  const mxPending = await pool.query(
    `SELECT t.id, t.description, t.amount, t.top_level_category
     FROM mx_transactions t
     JOIN mx_accounts ma ON ma.id = t.mx_account_id
     WHERE ma.mx_member_id IN (SELECT id FROM mx_members WHERE user_id = $1)
       AND t.merchant_clean_name IS NULL
     ORDER BY t.date DESC
     LIMIT $2`,
    [userId, limit]
  );

  for (const tx of mxPending.rows) {
    try {
      const result = await enrichTransaction({
        rawDescription: tx.description,
        amount: Math.abs(parseFloat(tx.amount)),
        providerCategory: tx.top_level_category || undefined,
      });
      await pool.query(
        `UPDATE mx_transactions SET
          merchant_clean_name = $1,
          merchant_logo_url = $2,
          subcategory = $3,
          merchant_type = $4,
          is_subscription = $5,
          enrichment_source = $6,
          enrichment_confidence = $7
         WHERE id = $8`,
        [result.cleanName, result.logoUrl, result.subcategory, result.merchantType,
         result.isSubscription ? 'true' : 'false', result.source, result.confidence, tx.id]
      );
      count++;
      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      console.error('[Enricher] Backfill failed mx tx:', tx.id, err);
    }
  }

  console.log(`[Enricher] Enriched ${count} transactions for user: ${userId}`);
  return count;
}

export async function pruneEnrichmentCache(): Promise<void> {
  const pool = (db as any).$client as import('pg').Pool;
  await pool.query(
    `DELETE FROM merchant_enrichment
     WHERE use_count = 1
       AND confidence < 0.6
       AND created_at < NOW() - INTERVAL '90 days'`
  );
  console.log('[Cleanup] Merchant cache pruned');
}
