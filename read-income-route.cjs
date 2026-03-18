const fs = require('fs');
const content = fs.readFileSync('server/routes.ts', 'utf8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('app.get("/api/income"'));
console.log('GET /api/income starts at line:', start + 1);
// Find the closing }); by counting braces
let depth = 0;
let end = start;
for (let i = start; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
  }
  if (depth === 0 && i > start) { end = i; break; }
}
console.log('GET /api/income ends at line:', end + 1);
console.log(lines.slice(start, end + 1).join('\n'));
