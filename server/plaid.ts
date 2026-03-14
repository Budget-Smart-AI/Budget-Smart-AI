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

/**
 * Wait for Plaid transactions to be ready before fetching historical data.
 * Plaid's INITIAL_UPDATE webhook typically fires after a few seconds,
 * but we poll to ensure transactions are available before fetching.
 */
export async function waitForTransactionsReady(
  accessToken: string, 
  maxAttempts: number = 10,
  delayMs: number = 3000
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: '2020-01-01',
        end_date: new Date().toISOString().split('T')[0],
        options: { count: 1, offset: 0 }
      });
      if (response.data.transactions !== undefined) {
        console.log(`Plaid transactions ready after ${attempt + 1} attempt(s)`);
        return true;
      }
    } catch (error: any) {
      if (error?.response?.data?.error_code === 'PRODUCT_NOT_READY') {
        console.log(`Plaid transactions not ready, attempt ${attempt + 1}/${maxAttempts}, waiting ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  console.warn(`Plaid transactions not ready after ${maxAttempts} attempts. User should check back in a few minutes.`);
  return false;
}
