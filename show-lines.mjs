import { readFileSync } from 'fs';
const lines = readFileSync('server/routes.ts', 'utf8').split('\n');
// Show the detectRecurringIncome block in exchange-token handler
for (let i = 6118; i <= 6145; i++) {
  console.log(`${i}: ${lines[i-1]}`);
}
