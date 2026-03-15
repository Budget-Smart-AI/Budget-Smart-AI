const fs = require('fs');
const lines = fs.readFileSync('server/routes.ts', 'utf8').split('\n');

// Find the admin feature-usage endpoint
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('admin/users/:id/feature-usage') && lines[i].includes('app.get')) {
    console.log('=== Admin feature-usage endpoint (lines ' + (i+1) + ' to ' + (i+25) + ') ===');
    for (let j = i; j < Math.min(i+25, lines.length); j++) {
      console.log((j+1) + ': ' + lines[j]);
    }
    break;
  }
}

// Also check the plan that's used in the admin endpoint context
console.log('\n=== Checking for plan used before userId in admin endpoint ===');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const plan = await getEffectivePlan')) {
    // Check 5 lines before for userId definition
    const context = lines.slice(Math.max(0, i-5), i+3).join('\n');
    if (!context.includes('const userId')) {
      console.log('WARNING - plan used without nearby userId at line ' + (i+1));
      console.log(context);
      console.log('---');
    }
  }
}
console.log('Check complete');
