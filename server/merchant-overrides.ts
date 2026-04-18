/**
 * Hardcoded merchant overrides — Monarch-parity categorization.
 *
 * Plaid's PFC enum is usually correct, but some merchants are miscategorized at the primary
 * level (e.g. Bell Canada returns `primary: MEDICAL` while `detailed: RENT_AND_UTILITIES_TELEPHONE`
 * is correct). When we can't trust Plaid's own enrichment, we fall back here.
 *
 * Pattern matching is substring-based (case-insensitive) against the normalized transaction
 * description. Add new entries by writing `{ pattern: 'FRAGMENT', ...result }`.
 *
 * This list intentionally covers Canadian merchants (Ryan's test account) plus top US
 * consumer brands so Monarch-parity is achieved out of the box.
 */

export interface MerchantOverride {
  /** Case-insensitive substring match against normalized description */
  pattern: string;
  cleanName: string;
  category: string;
  subcategory: string;
  merchantType: string;
  isSubscription: boolean;
}

/**
 * IMPORTANT: order matters — more specific patterns must come before more generic ones.
 * (e.g. 'BELL CANADA' before 'BELL').
 */
export const MERCHANT_OVERRIDES: MerchantOverride[] = [
  // ── Canadian Telecom ────────────────────────────────────────────────────
  { pattern: 'BELL CANADA',     cleanName: 'Bell Canada',    category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'BELL MOBILITY',   cleanName: 'Bell Mobility',  category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'BELL ',           cleanName: 'Bell',           category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'ROGERS COMM',     cleanName: 'Rogers',         category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'ROGERS WIRELESS', cleanName: 'Rogers',         category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'ROGERS',          cleanName: 'Rogers',         category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'TELUS',           cleanName: 'Telus',          category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'FREEDOM MOBILE',  cleanName: 'Freedom Mobile', category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'FIDO',            cleanName: 'Fido',           category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'KOODO',           cleanName: 'Koodo',          category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'VIRGIN MOBILE',   cleanName: 'Virgin Mobile',  category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'SHAW',            cleanName: 'Shaw',           category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'VIDEOTRON',       cleanName: 'Videotron',      category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },

  // ── US Telecom ──────────────────────────────────────────────────────────
  { pattern: 'VERIZON',     cleanName: 'Verizon',    category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'AT&T',        cleanName: 'AT&T',       category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'T-MOBILE',    cleanName: 'T-Mobile',   category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'T MOBILE',    cleanName: 'T-Mobile',   category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'SPRINT',      cleanName: 'Sprint',     category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'XFINITY',     cleanName: 'Xfinity',    category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'COMCAST',     cleanName: 'Comcast',    category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },
  { pattern: 'SPECTRUM',    cleanName: 'Spectrum',   category: 'Utilities',  subcategory: 'Phone & Internet', merchantType: 'utility', isSubscription: true },

  // ── Canadian Utilities ──────────────────────────────────────────────────
  { pattern: 'HYDRO ONE',        cleanName: 'Hydro One',        category: 'Utilities', subcategory: 'Electricity', merchantType: 'utility', isSubscription: true },
  { pattern: 'HYDRO QUEBEC',     cleanName: 'Hydro Québec',     category: 'Utilities', subcategory: 'Electricity', merchantType: 'utility', isSubscription: true },
  { pattern: 'BC HYDRO',         cleanName: 'BC Hydro',         category: 'Utilities', subcategory: 'Electricity', merchantType: 'utility', isSubscription: true },
  { pattern: 'TORONTO HYDRO',    cleanName: 'Toronto Hydro',    category: 'Utilities', subcategory: 'Electricity', merchantType: 'utility', isSubscription: true },
  { pattern: 'ENBRIDGE',         cleanName: 'Enbridge Gas',     category: 'Utilities', subcategory: 'Gas',         merchantType: 'utility', isSubscription: true },
  { pattern: 'FORTIS BC',        cleanName: 'FortisBC',         category: 'Utilities', subcategory: 'Gas',         merchantType: 'utility', isSubscription: true },
  { pattern: 'UNION GAS',        cleanName: 'Union Gas',        category: 'Utilities', subcategory: 'Gas',         merchantType: 'utility', isSubscription: true },
  { pattern: 'EPCOR',            cleanName: 'EPCOR',            category: 'Utilities', subcategory: 'Electricity', merchantType: 'utility', isSubscription: true },

  // ── Streaming / Subscriptions ───────────────────────────────────────────
  { pattern: 'NETFLIX',     cleanName: 'Netflix',     category: 'Entertainment',  subcategory: 'Streaming',     merchantType: 'subscription', isSubscription: true },
  { pattern: 'SPOTIFY',     cleanName: 'Spotify',     category: 'Entertainment',  subcategory: 'Music',         merchantType: 'subscription', isSubscription: true },
  { pattern: 'DISNEY+',     cleanName: 'Disney+',     category: 'Entertainment',  subcategory: 'Streaming',     merchantType: 'subscription', isSubscription: true },
  { pattern: 'DISNEY PLUS', cleanName: 'Disney+',     category: 'Entertainment',  subcategory: 'Streaming',     merchantType: 'subscription', isSubscription: true },
  { pattern: 'HULU',        cleanName: 'Hulu',        category: 'Entertainment',  subcategory: 'Streaming',     merchantType: 'subscription', isSubscription: true },
  { pattern: 'HBO MAX',     cleanName: 'HBO Max',     category: 'Entertainment',  subcategory: 'Streaming',     merchantType: 'subscription', isSubscription: true },
  { pattern: 'CRAVE',       cleanName: 'Crave',       category: 'Entertainment',  subcategory: 'Streaming',     merchantType: 'subscription', isSubscription: true },
  { pattern: 'APPLE TV',    cleanName: 'Apple TV+',   category: 'Entertainment',  subcategory: 'Streaming',     merchantType: 'subscription', isSubscription: true },
  { pattern: 'AMAZON PRIME',cleanName: 'Amazon Prime',category: 'Shopping',       subcategory: 'Membership',    merchantType: 'subscription', isSubscription: true },
  { pattern: 'YOUTUBE PREM',cleanName: 'YouTube Premium', category: 'Entertainment', subcategory: 'Streaming',  merchantType: 'subscription', isSubscription: true },
  { pattern: 'APPLE MUSIC', cleanName: 'Apple Music', category: 'Entertainment',  subcategory: 'Music',         merchantType: 'subscription', isSubscription: true },

  // ── Cloud / Software ────────────────────────────────────────────────────
  { pattern: 'ICLOUD',       cleanName: 'iCloud',       category: 'Subscriptions', subcategory: 'Cloud Storage', merchantType: 'subscription', isSubscription: true },
  { pattern: 'GOOGLE ONE',   cleanName: 'Google One',   category: 'Subscriptions', subcategory: 'Cloud Storage', merchantType: 'subscription', isSubscription: true },
  { pattern: 'DROPBOX',      cleanName: 'Dropbox',      category: 'Subscriptions', subcategory: 'Cloud Storage', merchantType: 'subscription', isSubscription: true },
  { pattern: 'MICROSOFT 365',cleanName: 'Microsoft 365',category: 'Subscriptions', subcategory: 'Software',      merchantType: 'subscription', isSubscription: true },
  { pattern: 'ADOBE',        cleanName: 'Adobe',        category: 'Subscriptions', subcategory: 'Software',      merchantType: 'subscription', isSubscription: true },
  { pattern: 'CHATGPT',      cleanName: 'ChatGPT',      category: 'Subscriptions', subcategory: 'Software',      merchantType: 'subscription', isSubscription: true },
  { pattern: 'OPENAI',       cleanName: 'OpenAI',       category: 'Subscriptions', subcategory: 'Software',      merchantType: 'subscription', isSubscription: true },
  { pattern: 'ANTHROPIC',    cleanName: 'Anthropic',    category: 'Subscriptions', subcategory: 'Software',      merchantType: 'subscription', isSubscription: true },

  // ── Grocery (Canadian) ──────────────────────────────────────────────────
  { pattern: 'LOBLAWS',    cleanName: 'Loblaws',     category: 'Groceries', subcategory: 'Groceries', merchantType: 'grocery', isSubscription: false },
  { pattern: 'NO FRILLS',  cleanName: 'No Frills',   category: 'Groceries', subcategory: 'Groceries', merchantType: 'grocery', isSubscription: false },
  { pattern: 'SOBEYS',     cleanName: 'Sobeys',      category: 'Groceries', subcategory: 'Groceries', merchantType: 'grocery', isSubscription: false },
  { pattern: 'METRO',      cleanName: 'Metro',       category: 'Groceries', subcategory: 'Groceries', merchantType: 'grocery', isSubscription: false },
  { pattern: 'FRESHCO',    cleanName: 'FreshCo',     category: 'Groceries', subcategory: 'Groceries', merchantType: 'grocery', isSubscription: false },
  { pattern: 'COSTCO',     cleanName: 'Costco',      category: 'Groceries', subcategory: 'Warehouse', merchantType: 'grocery', isSubscription: false },
  { pattern: 'WALMART',    cleanName: 'Walmart',     category: 'Shopping',  subcategory: 'General',   merchantType: 'retail',  isSubscription: false },
  { pattern: 'FARM BOY',   cleanName: 'Farm Boy',    category: 'Groceries', subcategory: 'Groceries', merchantType: 'grocery', isSubscription: false },
  { pattern: 'LONGO',      cleanName: 'Longo\'s',    category: 'Groceries', subcategory: 'Groceries', merchantType: 'grocery', isSubscription: false },
  { pattern: 'WHOLE FOODS',cleanName: 'Whole Foods', category: 'Groceries', subcategory: 'Groceries', merchantType: 'grocery', isSubscription: false },
  { pattern: 'TRADER JOE', cleanName: 'Trader Joe\'s', category: 'Groceries', subcategory: 'Groceries', merchantType: 'grocery', isSubscription: false },
  { pattern: 'KROGER',     cleanName: 'Kroger',      category: 'Groceries', subcategory: 'Groceries', merchantType: 'grocery', isSubscription: false },
  { pattern: 'SAFEWAY',    cleanName: 'Safeway',     category: 'Groceries', subcategory: 'Groceries', merchantType: 'grocery', isSubscription: false },

  // ── Gas / Fuel ──────────────────────────────────────────────────────────
  { pattern: 'PETRO-CANADA', cleanName: 'Petro-Canada', category: 'Transportation', subcategory: 'Gas & Fuel', merchantType: 'transport', isSubscription: false },
  { pattern: 'ESSO',         cleanName: 'Esso',         category: 'Transportation', subcategory: 'Gas & Fuel', merchantType: 'transport', isSubscription: false },
  { pattern: 'SHELL',        cleanName: 'Shell',        category: 'Transportation', subcategory: 'Gas & Fuel', merchantType: 'transport', isSubscription: false },
  { pattern: 'CHEVRON',      cleanName: 'Chevron',      category: 'Transportation', subcategory: 'Gas & Fuel', merchantType: 'transport', isSubscription: false },
  { pattern: 'EXXON',        cleanName: 'Exxon',        category: 'Transportation', subcategory: 'Gas & Fuel', merchantType: 'transport', isSubscription: false },
  { pattern: 'MOBIL',        cleanName: 'Mobil',        category: 'Transportation', subcategory: 'Gas & Fuel', merchantType: 'transport', isSubscription: false },
  { pattern: 'BP GAS',       cleanName: 'BP',           category: 'Transportation', subcategory: 'Gas & Fuel', merchantType: 'transport', isSubscription: false },

  // ── Ride / Transit ──────────────────────────────────────────────────────
  { pattern: 'UBER EATS',    cleanName: 'Uber Eats', category: 'Food & Dining',   subcategory: 'Food Delivery', merchantType: 'restaurant', isSubscription: false },
  { pattern: 'UBER',         cleanName: 'Uber',      category: 'Transportation',  subcategory: 'Rideshare',     merchantType: 'transport',  isSubscription: false },
  { pattern: 'LYFT',         cleanName: 'Lyft',      category: 'Transportation',  subcategory: 'Rideshare',     merchantType: 'transport',  isSubscription: false },
  { pattern: 'DOORDASH',     cleanName: 'DoorDash',  category: 'Food & Dining',   subcategory: 'Food Delivery', merchantType: 'restaurant', isSubscription: false },
  { pattern: 'SKIP THE DISHES',cleanName: 'SkipTheDishes', category: 'Food & Dining', subcategory: 'Food Delivery', merchantType: 'restaurant', isSubscription: false },
  { pattern: 'SKIPTHEDISHES',cleanName: 'SkipTheDishes', category: 'Food & Dining', subcategory: 'Food Delivery', merchantType: 'restaurant', isSubscription: false },
  { pattern: 'PRESTO',       cleanName: 'Presto',    category: 'Transportation',  subcategory: 'Public Transit', merchantType: 'transport', isSubscription: false },
  { pattern: 'TTC',          cleanName: 'TTC',       category: 'Transportation',  subcategory: 'Public Transit', merchantType: 'transport', isSubscription: false },
  { pattern: 'GO TRANSIT',   cleanName: 'GO Transit',category: 'Transportation',  subcategory: 'Public Transit', merchantType: 'transport', isSubscription: false },

  // ── Coffee / Fast Food ──────────────────────────────────────────────────
  { pattern: 'STARBUCKS',    cleanName: 'Starbucks',   category: 'Food & Dining', subcategory: 'Coffee Shops', merchantType: 'restaurant', isSubscription: false },
  { pattern: 'TIM HORTONS',  cleanName: 'Tim Hortons', category: 'Food & Dining', subcategory: 'Coffee Shops', merchantType: 'restaurant', isSubscription: false },
  { pattern: 'SECOND CUP',   cleanName: 'Second Cup',  category: 'Food & Dining', subcategory: 'Coffee Shops', merchantType: 'restaurant', isSubscription: false },
  { pattern: "MCDONALD'S",   cleanName: "McDonald's",  category: 'Food & Dining', subcategory: 'Fast Food',    merchantType: 'restaurant', isSubscription: false },
  { pattern: 'MCDONALDS',    cleanName: "McDonald's",  category: 'Food & Dining', subcategory: 'Fast Food',    merchantType: 'restaurant', isSubscription: false },
  { pattern: 'SUBWAY',       cleanName: 'Subway',      category: 'Food & Dining', subcategory: 'Fast Food',    merchantType: 'restaurant', isSubscription: false },
  { pattern: 'CHIPOTLE',     cleanName: 'Chipotle',    category: 'Food & Dining', subcategory: 'Fast Food',    merchantType: 'restaurant', isSubscription: false },

  // ── Financial / Banks (transfers, payments) ─────────────────────────────
  { pattern: 'E-TRANSFER',   cleanName: 'E-Transfer',   category: 'Transfers', subcategory: 'E-Transfer',      merchantType: 'transfer', isSubscription: false },
  { pattern: 'E TRANSFER',   cleanName: 'E-Transfer',   category: 'Transfers', subcategory: 'E-Transfer',      merchantType: 'transfer', isSubscription: false },
  { pattern: 'INTERAC',      cleanName: 'Interac',      category: 'Transfers', subcategory: 'E-Transfer',      merchantType: 'transfer', isSubscription: false },
  { pattern: 'ZELLE',        cleanName: 'Zelle',        category: 'Transfers', subcategory: 'Peer Payments',   merchantType: 'transfer', isSubscription: false },
  { pattern: 'VENMO',        cleanName: 'Venmo',        category: 'Transfers', subcategory: 'Peer Payments',   merchantType: 'transfer', isSubscription: false },
  { pattern: 'PAYPAL',       cleanName: 'PayPal',       category: 'Financial', subcategory: 'Online Payment',  merchantType: 'financial', isSubscription: false },

  // ── Insurance ───────────────────────────────────────────────────────────
  { pattern: 'GEICO',        cleanName: 'GEICO',        category: 'Insurance', subcategory: 'Auto Insurance', merchantType: 'financial', isSubscription: true },
  { pattern: 'STATE FARM',   cleanName: 'State Farm',   category: 'Insurance', subcategory: 'Auto Insurance', merchantType: 'financial', isSubscription: true },
  { pattern: 'PROGRESSIVE',  cleanName: 'Progressive',  category: 'Insurance', subcategory: 'Auto Insurance', merchantType: 'financial', isSubscription: true },
  { pattern: 'ALLSTATE',     cleanName: 'Allstate',     category: 'Insurance', subcategory: 'Auto Insurance', merchantType: 'financial', isSubscription: true },
  { pattern: 'INTACT INS',   cleanName: 'Intact Insurance', category: 'Insurance', subcategory: 'Auto Insurance', merchantType: 'financial', isSubscription: true },
  { pattern: 'SONNET INS',   cleanName: 'Sonnet Insurance', category: 'Insurance', subcategory: 'Auto Insurance', merchantType: 'financial', isSubscription: true },
];

/**
 * Lookup a merchant override by normalized description.
 * Returns the first matching override, or null if no patterns match.
 */
export function getMerchantOverride(normalized: string): MerchantOverride | null {
  const upper = normalized.toUpperCase();
  for (const override of MERCHANT_OVERRIDES) {
    if (upper.includes(override.pattern.toUpperCase())) {
      return override;
    }
  }
  return null;
}
