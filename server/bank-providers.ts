import { db } from './db';

export interface BankProvider {
  providerId: string;
  displayName: string;
  description: string;
  isEnabled: boolean;
  showInWizard: boolean;
  showInAccounts: boolean;
  supportedCountries: string[];
  primaryRegions: string[];
  fallbackOrder: number;
  status: string;
  statusMessage: string | null;
  logoUrl: string | null;
}

// Cache providers for 60 seconds
let providerCache: {
  data: BankProvider[];
  expiresAt: number;
} | null = null;

const CACHE_TTL_MS = 60 * 1000;

function rowToProvider(row: any): BankProvider {
  return {
    providerId: row.provider_id,
    displayName: row.display_name,
    description: row.description ?? '',
    isEnabled: row.is_enabled,
    showInWizard: row.show_in_wizard,
    showInAccounts: row.show_in_accounts,
    supportedCountries: row.supported_countries ?? [],
    primaryRegions: row.primary_regions ?? [],
    fallbackOrder: row.fallback_order,
    status: row.status,
    statusMessage: row.status_message ?? null,
    logoUrl: row.logo_url ?? null,
  };
}

export async function getEnabledProviders(): Promise<BankProvider[]> {
  const now = Date.now();
  if (providerCache && now < providerCache.expiresAt) {
    return providerCache.data;
  }

  try {
    const result = await (db as any).$client.query(
      `SELECT * FROM bank_provider_config
       WHERE is_enabled = true AND status = 'active'
       ORDER BY fallback_order ASC, provider_id ASC`,
    );
    const data = result.rows.map(rowToProvider);
    providerCache = { data, expiresAt: now + CACHE_TTL_MS };
    return data;
  } catch (err) {
    // Table may not exist yet during startup – log for non-trivial errors
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('does not exist')) {
      console.error('[bank-providers] Error fetching enabled providers:', err);
    }
    return [];
  }
}

export async function getProvidersForCountry(countryCode: string): Promise<BankProvider[]> {
  const all = await getEnabledProviders();
  return all.filter(p => p.supportedCountries.includes(countryCode));
}

/** Invalidate cache after admin updates */
export function invalidateProviderCache(): void {
  providerCache = null;
}
