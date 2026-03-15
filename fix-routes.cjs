const fs = require('fs');
let content = fs.readFileSync('server/routes.ts', 'utf8');

// 1. Update import to add getEffectivePlan
content = content.replace(
  'import { checkAndConsume, getFeatureLimit } from "./lib/featureGate";',
  'import { checkAndConsume, getFeatureLimit } from "./lib/featureGate";\nimport { getEffectivePlan } from "./lib/planResolver";'
);

// 2. Replace all 'const plan = user?.plan || "free";' with getEffectivePlan
const before2 = (content.match(/const plan = user\?\.plan \|\| "free";/g) || []).length;
content = content.replace(
  /const plan = user\?\.plan \|\| "free";/g,
  'const plan = await getEffectivePlan(userId);'
);
console.log(`Replaced ${before2} occurrences of 'const plan = user?.plan || "free"'`);

// 3. Fix the SELECT plan FROM users pattern (admin feature-usage endpoint)
const before3 = (content.match(/const userResult = await pool\.query\(`SELECT plan FROM users WHERE id = \$1`, \[userId\]\);\s*const plan = userResult\.rows\[0\]\?\.plan \|\| "free";/g) || []).length;
content = content.replace(
  /const userResult = await pool\.query\(`SELECT plan FROM users WHERE id = \$1`, \[userId\]\);\s*const plan = userResult\.rows\[0\]\?\.plan \|\| "free";/g,
  'const plan = await getEffectivePlan(userId);'
);
console.log(`Replaced ${before3} occurrences of SELECT plan FROM users pattern`);

// 4. Fix isPremium check - it references user.plan directly
const before4 = (content.match(/isPremium: user\.plan === "pro" \|\| user\.plan === "family"/g) || []).length;
content = content.replace(
  /isPremium: user\.plan === "pro" \|\| user\.plan === "family"/g,
  'isPremium: plan === "pro" || plan === "family"'
);
console.log(`Replaced ${before4} occurrences of isPremium check`);

fs.writeFileSync('server/routes.ts', content, 'utf8');
console.log('Done - server/routes.ts updated');
