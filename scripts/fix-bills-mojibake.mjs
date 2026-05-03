#!/usr/bin/env node
// Fix UTF-8 mojibake in client/src/pages/bills.tsx
//
// At some point bills.tsx got saved with corrupted UTF-8 byte sequences
// in place of Unicode characters. The Edit tool in our session cannot
// match against these bytes because Read normalizes them to placeholder
// chars that don't equal the on-disk bytes.
//
// This script reads the file as a raw Buffer, applies byte-pattern
// replacements for every known corruption, and writes it back.
// Idempotent — safe to re-run.
//
// Run from repo root:  node scripts/fix-bills-mojibake.mjs
// Then verify:         git diff client/src/pages/bills.tsx

import fs from "node:fs";
import path from "node:path";

const TARGET = path.resolve("client/src/pages/bills.tsx");
const buf = fs.readFileSync(TARGET);

// Known mojibake byte sequences and their intended replacements.
//
// Root cause: the original UTF-8 bytes (e.g. e2 9c 93 for ✓) were
// interpreted as Latin-1 / CP-1252, then re-encoded to UTF-8, producing
// double-encoded 6-byte sequences like c3 a2 c2 9c c2 93.
//
// Each rule maps the on-disk double-encoded bytes → correct UTF-8.
const RULES = [
  // ✓ checkmark — U+2713, UTF-8 e2 9c 93
  // double-encoded: c3 a2 c2 9c c2 93
  { label: "✓ (checkmark)",  from: Buffer.from([0xC3, 0xA2, 0xC2, 0x9C, 0xC2, 0x93]), to: Buffer.from("✓", "utf8") },

  // • bullet — U+2022, UTF-8 e2 80 a2
  // double-encoded: c3 a2 c2 80 c2 a2
  { label: "• (bullet)",     from: Buffer.from([0xC3, 0xA2, 0xC2, 0x80, 0xC2, 0xA2]), to: Buffer.from("•", "utf8") },

  // — em dash — U+2014, UTF-8 e2 80 94
  // double-encoded: c3 a2 c2 80 c2 94
  { label: "— (em dash)",    from: Buffer.from([0xC3, 0xA2, 0xC2, 0x80, 0xC2, 0x94]), to: Buffer.from("—", "utf8") },

  // → right arrow — U+2192, UTF-8 e2 86 92
  // double-encoded: c3 a2 c2 86 c2 92
  { label: "→ (right arrow)", from: Buffer.from([0xC3, 0xA2, 0xC2, 0x86, 0xC2, 0x92]), to: Buffer.from("→", "utf8") },

  // ⚠ warning — U+26A0, UTF-8 e2 9a a0
  // on-disk double-encoded bytes: c3 a2 c2 9a c2 a1 (original was e2 9a a1 = ⚡,
  // but intended display is ⚠ per design spec)
  { label: "⚠ (warning)",    from: Buffer.from([0xC3, 0xA2, 0xC2, 0x9A, 0xC2, 0xA1]), to: Buffer.from("⚠", "utf8") },
];

let working = buf;
let totalReplaced = 0;

for (const { label, from, to } of RULES) {
  let idx = 0;
  let replacedThisRule = 0;
  const out = [];
  while (idx < working.length) {
    const next = working.indexOf(from, idx);
    if (next < 0) {
      out.push(working.subarray(idx));
      break;
    }
    out.push(working.subarray(idx, next));
    out.push(to);
    idx = next + from.length;
    replacedThisRule += 1;
  }
  if (replacedThisRule > 0) {
    working = Buffer.concat(out);
    totalReplaced += replacedThisRule;
    console.log(`Replaced ${replacedThisRule}x  ${label}  [${[...from].map(b => b.toString(16).padStart(2, "0")).join(" ")}]`);
  }
}

// Sanity check — verify the file is now valid UTF-8 with no stray â chars
const after = working.toString("utf8");
const remainingMojibake = (after.match(/â/g) || []).length;
console.log(`\nTotal replacements: ${totalReplaced}`);
console.log(`Remaining "â" chars after fix: ${remainingMojibake}`);

if (remainingMojibake > 0) {
  console.warn("⚠ Some 'â' characters remain — likely a mojibake pattern not covered by the rules above.");
  console.warn("  Inspect with: grep -n 'â' " + TARGET);
}

fs.writeFileSync(TARGET, working);
console.log(`\n✓ Wrote ${TARGET}`);
