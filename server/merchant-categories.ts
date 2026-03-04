export const CATEGORY_TAXONOMY: Record<string, string[]> = {
  'Food & Dining': [
    'Groceries', 'Supermarket', 'Restaurants',
    'Fast Food', 'Coffee Shops', 'Bars & Alcohol',
    'Food Delivery', 'Meal Kits',
  ],
  'Shopping': [
    'Online Shopping', 'Clothing & Apparel',
    'Electronics', 'Home & Garden',
    'Sporting Goods', 'Pharmacies',
    'Department Stores', 'Wholesale Clubs',
  ],
  'Transportation': [
    'Gas & Fuel', 'Parking', 'Rideshare',
    'Public Transit', 'Auto Insurance',
    'Auto Maintenance', 'Car Payments', 'Tolls',
  ],
  'Housing': [
    'Rent', 'Mortgage', 'Home Insurance',
    'Home Maintenance', 'Utilities - Electric',
    'Utilities - Gas', 'Utilities - Water',
    'Internet', 'Cable & Satellite',
  ],
  'Health & Wellness': [
    'Doctor & Medical', 'Dental', 'Vision',
    'Pharmacy & Prescriptions', 'Health Insurance',
    'Gym & Fitness', 'Mental Health',
  ],
  'Entertainment': [
    'Streaming Services', 'Gaming',
    'Movies & Events', 'Music',
    'Sports & Recreation', 'Hobbies',
  ],
  'Subscriptions': [
    'Software & Apps', 'News & Magazines',
    'Cloud Storage', 'Membership Clubs',
  ],
  'Financial': [
    'Bank Fees', 'ATM Withdrawals',
    'Credit Card Payments', 'Loan Payments',
    'Investment Contributions', 'Tax Payments',
  ],
  'Income': [
    'Salary & Wages', 'Freelance Income',
    'Business Income', 'Investment Returns',
    'Government Benefits', 'Refunds & Cashback',
  ],
  'Personal Care': [
    'Hair & Beauty', 'Spa & Massage',
    'Personal Products',
  ],
  'Education': [
    'Tuition & Fees', 'Books & Supplies',
    'Online Courses', 'Childcare',
  ],
  'Travel': [
    'Hotels & Lodging', 'Flights',
    'Vacation Packages', 'Travel Insurance',
    'Car Rental',
  ],
  'Gifts & Donations': [
    'Charitable Donations', 'Gifts',
    'Religious Contributions',
  ],
  'Transfers': [
    'Account Transfers', 'E-Transfers',
    'Peer Payments',
  ],
  'Other': ['Uncategorized', 'Miscellaneous'],
};

export const CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining':    'orange',
  'Shopping':         'blue',
  'Transportation':   'purple',
  'Housing':          'green',
  'Health & Wellness':'pink',
  'Entertainment':    'yellow',
  'Subscriptions':    'cyan',
  'Financial':        'gray',
  'Income':           'emerald',
  'Personal Care':    'rose',
  'Education':        'indigo',
  'Travel':           'sky',
  'Gifts & Donations':'violet',
  'Transfers':        'slate',
  'Other':            'zinc',
};

export const PROVIDER_CATEGORY_MAP: Record<string, { category: string; subcategory: string }> = {
  'Food and Drink':             { category: 'Food & Dining', subcategory: 'Restaurants' },
  'Food and Drink:Groceries':   { category: 'Food & Dining', subcategory: 'Groceries' },
  'Food and Drink:Restaurants': { category: 'Food & Dining', subcategory: 'Restaurants' },
  'Food and Drink:Coffee Shop': { category: 'Food & Dining', subcategory: 'Coffee Shops' },
  'Shops':                      { category: 'Shopping', subcategory: 'Online Shopping' },
  'Shops:Online Marketplaces':  { category: 'Shopping', subcategory: 'Online Shopping' },
  'Travel:Gas Stations':        { category: 'Transportation', subcategory: 'Gas & Fuel' },
  'Travel:Taxi':                { category: 'Transportation', subcategory: 'Rideshare' },
  'Travel:Airlines':            { category: 'Travel', subcategory: 'Flights' },
  'Travel:Lodging':             { category: 'Travel', subcategory: 'Hotels & Lodging' },
  'Recreation:Gyms and Fitness Centers': { category: 'Health & Wellness', subcategory: 'Gym & Fitness' },
  'Service:Utilities':          { category: 'Housing', subcategory: 'Utilities - Electric' },
  'Service:Telecommunication Services': { category: 'Housing', subcategory: 'Internet' },
  'Transfer:Payroll':           { category: 'Income', subcategory: 'Salary & Wages' },
  'Transfer:Debit':             { category: 'Transfers', subcategory: 'Account Transfers' },
  'GROCERIES':                  { category: 'Food & Dining', subcategory: 'Groceries' },
  'RESTAURANTS':                { category: 'Food & Dining', subcategory: 'Restaurants' },
  'GAS_STATIONS':               { category: 'Transportation', subcategory: 'Gas & Fuel' },
  'ENTERTAINMENT':              { category: 'Entertainment', subcategory: 'Movies & Events' },
  'INCOME':                     { category: 'Income', subcategory: 'Salary & Wages' },
};

export function mapProviderCategory(providerCategory: string): { category: string; subcategory: string } {
  return PROVIDER_CATEGORY_MAP[providerCategory] || { category: 'Other', subcategory: 'Uncategorized' };
}

export function getAllCategories(): string[] {
  return Object.keys(CATEGORY_TAXONOMY);
}

export function getSubcategories(category: string): string[] {
  return CATEGORY_TAXONOMY[category] || [];
}
