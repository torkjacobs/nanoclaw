#!/usr/bin/env node
// File-size budget (ratchet). Fails when a tracked source file is over the
// line limit and is not in the baseline, or when a baselined file grows past
// its recorded size. Shrinking is always allowed; run with --update to record
// the smaller sizes and drop files that are back under the limit.
//
//   node scripts/check-file-size.mjs           check (CI)
//   node scripts/check-file-size.mjs --update  rewrite file-size-budget.json
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BUDGET_FILE = 'file-size-budget.json';
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|py)$/;
const ALWAYS_SKIP = /(\.d\.ts|\.min\.js|\.generated\.[a-z]+)$/;

const budget = existsSync(BUDGET_FILE)
  ? JSON.parse(readFileSync(BUDGET_FILE, 'utf8'))
  : { limit: 800, exclude: [], allow: {} };
const limit = budget.limit ?? 800;
const exclude = budget.exclude ?? [];
const allow = budget.allow ?? {};

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0')
  .filter((f) => f && EXTENSIONS.test(f) && !ALWAYS_SKIP.test(f))
  .filter((f) => !exclude.some((prefix) => f.startsWith(prefix)))
  .filter((f) => existsSync(f));

function countLines(path) {
  const text = readFileSync(path, 'utf8');
  if (text.length === 0) return 0;
  const lines = text.split('\n').length;
  return text.endsWith('\n') ? lines - 1 : lines;
}

const oversize = {};
for (const f of files) {
  const n = countLines(f);
  if (n > limit) oversize[f] = n;
}

if (process.argv.includes('--update')) {
  const sorted = Object.fromEntries(Object.entries(oversize).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BUDGET_FILE, JSON.stringify({ limit, exclude, allow: sorted }, null, 2) + '\n');
  console.log(`${BUDGET_FILE}: ${Object.keys(sorted).length} file(s) over ${limit} lines recorded.`);
  process.exit(0);
}

const failures = [];
for (const [f, n] of Object.entries(oversize)) {
  if (!(f in allow)) failures.push(`${f}: ${n} lines, over the ${limit}-line budget (new). Split it.`);
  else if (n > allow[f]) failures.push(`${f}: ${n} lines, grew past its baseline of ${allow[f]}. Shrink it or split it.`);
}
const shrunk = Object.keys(allow).filter((f) => !(f in oversize) || oversize[f] < allow[f]);

if (shrunk.length) {
  console.log(`Notice: ${shrunk.length} baselined file(s) shrank or were removed; run --update to tighten the baseline.`);
}
if (failures.length) {
  console.error(`File-size budget failed (${failures.length}):`);
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`File-size budget ok: ${files.length} files checked, ${Object.keys(oversize).length} baselined over ${limit} lines.`);
