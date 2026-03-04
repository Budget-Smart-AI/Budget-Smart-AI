import { db } from './db';
import { routeAI } from './ai-router';
import { mapProviderCategory } from './merchant-categories';

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

async function fetchBrandfetchLogo(merchantName: string): Promise<{ logoUrl: string | null; website: string | null }> {
  const apiKey = process.env.BRANDFETCH_API_KEY;
  if (!apiKey) return { logoUrl: null, website: null };

  try {
    const searchRes = await fetch(
      `https://api.brandfetch.io/v2/search/${encodeURIComponent(merchantName)}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );
    if (!searchRes.ok) return { logoUrl: null, website: null };

    const results = await searchRes.json() as Array<{ domain?: string }>;
    if (!results?.length) return { logoUrl: null, website: null };

    const domain = results[0]?.domain;
    if (!domain) return { logoUrl: null, website: null };

    const brandRes = await fetch(
      `https://api.brandfetch.io/v2/brands/${domain}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );
    if (!brandRes.ok) return { logoUrl: null, website: `https://${domain}` };

    const brandData = await brandRes.json() as { logos?: Array<{ formats?: Array<{ format: string; src?: string }> }> };
    let logoUrl: string | null = null;

    for (const logoSet of (brandData.logos || [])) {
      const formats = logoSet.formats || [];
      const png = formats.find((f) => f.format === 'png');
      const svg = formats.find((f) => f.format === 'svg');
      if (png?.src) { logoUrl = png.src; break; }
      if (svg?.src) { logoUrl = svg.src; break; }
    }

    return { logoUrl, website: `https://${domain}` };
  } catch {
    console.warn('[Enricher] Brandfetch failed:', merchantName);
    return { logoUrl: null, website: null };
  }
}

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
}): Promise<EnrichmentResult> {
  const { rawDescription, amount, providerCategory } = params;
  const normalized = normalizeRawDescription(rawDescription);

  // Check cache first
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

  // Use provider category mapping as base if available
  const providerMapped = providerCategory ? mapProviderCategory(providerCategory) : null;

  // Run AI enrichment
  const aiResult = await enrichWithAI(rawDescription, normalized, amount, providerCategory);

  // Fetch brand logo
  const brandData = await fetchBrandfetchLogo(aiResult.cleanName);

  // Merge results — use provider category as fallback if AI confidence is low
  const final: EnrichmentResult = {
    ...aiResult,
    logoUrl: brandData.logoUrl,
    website: brandData.website,
    category: (providerMapped && aiResult.confidence < 0.6) ? providerMapped.category : aiResult.category,
    subcategory: (providerMapped && aiResult.confidence < 0.6) ? providerMapped.subcategory : aiResult.subcategory,
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

  // Enrich plaid_transactions
  const plaidPending = await pool.query(
    `SELECT t.id, t.name AS description, t.amount, t.category
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
      const result = await enrichTransaction({
        rawDescription: tx.description,
        amount: Math.abs(parseFloat(tx.amount)),
        providerCategory: tx.category,
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

  // Enrich mx_transactions
  const mxPending = await pool.query(
    `SELECT t.id, t.description, t.amount, t.category
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
        providerCategory: tx.category,
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
