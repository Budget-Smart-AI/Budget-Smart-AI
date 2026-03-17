const fs = require('fs');
const content = fs.readFileSync('server/routes.ts', 'utf8');
const lines = content.split('\n');

// Find main GET /api/investment-accounts
const mainGetIdx = lines.findIndex(l => l.includes('app.get("/api/investment-accounts"'));
console.log('Main GET line:', mainGetIdx + 1);
console.log(lines.slice(mainGetIdx, mainGetIdx + 15).join('\n'));
console.log('\n--- /:id route ---');
const idGetIdx = lines.findIndex((l, i) => i > mainGetIdx && l.includes('app.get("/api/investment-accounts/:id"'));
console.log('/:id GET line:', idGetIdx + 1);
console.log(lines.slice(idGetIdx, idGetIdx + 5).join('\n'));

console.log('\n--- linkable-plaid-accounts route ---');
const linkableIdx = lines.findIndex(l => l.includes('linkable-plaid-accounts'));
console.log('linkable line:', linkableIdx + 1);
console.log(lines.slice(linkableIdx - 2, linkableIdx + 45).join('\n'));
