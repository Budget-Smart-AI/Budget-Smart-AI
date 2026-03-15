const fs = require('fs');
const lines = fs.readFileSync('server/routes.ts', 'utf8').split('\n');

// Find the GET /api/admin/users endpoint
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('app.get("/api/admin/users"') && lines[i].includes('requireAdmin')) {
    console.log('=== GET /api/admin/users endpoint ===');
    for (let j = i; j < Math.min(i+60, lines.length); j++) {
      console.log((j+1) + ': ' + lines[j]);
      // Stop at next app. route definition
      if (j > i+5 && (lines[j].includes('app.post(') || lines[j].includes('app.get(') || lines[j].includes('app.patch(') || lines[j].includes('app.delete('))) {
        break;
      }
    }
    break;
  }
}
