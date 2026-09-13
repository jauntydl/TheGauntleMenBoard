#!/usr/bin/env tsx
/**
 * Seed roster.json from a dump of the Discord #introductions channel.
 *
 *   npm run roster:parse -- intros.txt
 *
 * Writes roster.json and prints anything it could not parse. Run once; after
 * that roster.json is the source of truth, edited by commit.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseIntros } from '../lib/parse-intros';

const input = process.argv[2];
if (!input) {
  console.error('usage: npm run roster:parse -- <intros.txt>');
  process.exit(1);
}

if (existsSync('roster.json')) {
  console.error('roster.json already exists — refusing to overwrite it.');
  process.exit(1);
}

const { entries, failures } = parseIntros(readFileSync(input, 'utf8'));

writeFileSync('roster.json', JSON.stringify(entries, null, 2) + '\n');
console.log(`Wrote roster.json with ${entries.length} members.`);

if (failures.length) {
  console.warn(`\n${failures.length} post(s) could not be parsed — add these by hand:`);
  for (const f of failures) console.warn(`  - ${f}`);
}
