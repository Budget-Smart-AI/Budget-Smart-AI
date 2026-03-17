const fs = require('fs');
const lines = fs.readFileSync('server/routes.ts', 'utf8').split('\n');
lines.forEach((line, i) => {
  if (line.includes('investment-accounts') || line.includes('linkable-plaid') || line.includes('import-from-plaid')) {
    console.log((i+1) + ': ' + line);
  }
});
