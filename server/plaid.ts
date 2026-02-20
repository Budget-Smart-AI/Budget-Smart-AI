import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";

const configuration = new Configuration({
  basePath: PlaidEnvironments.production,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

export const PLAID_COUNTRY_CODES: CountryCode[] = [CountryCode.Ca];
export const PLAID_PRODUCTS: Products[] = [Products.Transactions, Products.Auth, Products.Liabilities];
export const PLAID_LANGUAGE = "en";

// Re-export Products enum for filtering
export { Products };
