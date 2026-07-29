/**
 * Tork Claims Verification
 *
 * Verifies marketing content against store/verified-claims.json
 * before publishing. Catches incorrect numbers, banned claims,
 * and sensitive information leaks.
 */
import fs from 'fs';
import path from 'path';

import { STORE_DIR } from './config.js';
import { logger } from './logger.js';
import { getLastDraftContent } from './tork-marketing.js';

const CLAIMS_PATTERN = /^@tork\s+(claims|verify)\s*$/i;

const CLAIMS_FILE = path.join(STORE_DIR, 'verified-claims.json');

interface Claim {
  verified: string;
  context?: string;
  wrong_claims: string[];
  source: string;
  note?: string;
}

interface ClaimsData {
  lastUpdated: string;
  claims: Record<string, Claim>;
}

// Sensitive topics — flag if content mentions these
const SENSITIVE_PATTERNS = [
  {
    pattern: /\$[\d,]+\s*\/?\s*(?:mo|month|year|yr)/i,
    label: 'infrastructure cost or pricing detail',
  },
  { pattern: /\bserver\s+cost/i, label: 'server costs' },
  { pattern: /\binfra(?:structure)?\s+cost/i, label: 'infrastructure costs' },
  { pattern: /\bmargin/i, label: 'business margins' },
  { pattern: /\blines?\s+of\s+code\b/i, label: 'lines of code' },
  { pattern: /\b\d{3},?\d{3}\+?\s*lines?\b/i, label: 'lines of code count' },
];

function loadClaims(): ClaimsData | null {
  try {
    const data = fs.readFileSync(CLAIMS_FILE, 'utf-8');
    return JSON.parse(data) as ClaimsData;
  } catch (err) {
    logger.warn({ err }, 'Failed to load verified-claims.json');
    return null;
  }
}

export interface VerificationResult {
  passed: boolean;
  warnings: string[];
}

export function verifyContent(content: string): VerificationResult {
  const warnings: string[] = [];
  const claimsData = loadClaims();

  if (!claimsData) {
    return { passed: true, warnings: [] };
  }

  const lowerContent = content.toLowerCase();

  for (const [key, claim] of Object.entries(claimsData.claims)) {
    // Check for wrong claims (skip short numeric patterns like "10", "90" — too many false positives)
    for (const wrong of claim.wrong_claims) {
      if (/^\d{1,3}$/.test(wrong)) continue;
      const wrongLower = wrong.toLowerCase();
      if (lowerContent.includes(wrongLower)) {
        warnings.push(
          `Found '${wrong}' \u2014 verified claim for ${key} is '${claim.verified}' (source: ${claim.source})`,
        );
      }
    }

    // Check for "DO NOT SHARE" items appearing in content
    if (claim.verified === 'DO NOT SHARE PUBLICLY') {
      // Check sensitive patterns for this category
      if (key === 'infrastructure_cost') {
        for (const sp of SENSITIVE_PATTERNS.filter((p) =>
          [
            'infrastructure cost or pricing detail',
            'server costs',
            'infrastructure costs',
            'business margins',
          ].includes(p.label),
        )) {
          if (sp.pattern.test(content)) {
            warnings.push(
              `Potential ${sp.label} detected \u2014 ${claim.source}`,
            );
          }
        }
      }
      if (key === 'lines_of_code') {
        for (const sp of SENSITIVE_PATTERNS.filter((p) =>
          ['lines of code', 'lines of code count'].includes(p.label),
        )) {
          if (sp.pattern.test(content)) {
            warnings.push(`Mentions ${sp.label} \u2014 ${claim.source}`);
          }
        }
      }
    }
  }

  return {
    passed: warnings.length === 0,
    warnings,
  };
}

export function formatVerificationResult(result: VerificationResult): string {
  if (result.passed) {
    return '\u2705 Claims verified';
  }

  return [
    '\u26A0\uFE0F Claims Check Failed:',
    ...result.warnings.map((w) => `\u2022 ${w}`),
    '',
    'Fix with @tork refine [corrections] or reply @tork approve force to publish anyway.',
  ].join('\n');
}

export function formatAllClaims(): string {
  const claimsData = loadClaims();
  if (!claimsData) {
    return '\u274C Could not load verified-claims.json';
  }

  const lines = [
    `\u{1F4CB} Tork Verified Claims (updated ${claimsData.lastUpdated})`,
    '\u2501'.repeat(30),
    '',
  ];

  for (const [key, claim] of Object.entries(claimsData.claims)) {
    const label = key.replace(/_/g, ' ');
    if (claim.verified === 'DO NOT SHARE PUBLICLY') {
      lines.push(`\u{1F6AB} ${label}: DO NOT SHARE PUBLICLY`);
      if (claim.note) lines.push(`   \u2514 ${claim.note}`);
    } else {
      lines.push(`\u2705 ${label}: ${claim.verified}`);
      if (claim.context) lines.push(`   \u2514 ${claim.context}`);
      if (claim.wrong_claims.length > 0) {
        lines.push(`   \u274C Wrong: ${claim.wrong_claims.join(', ')}`);
      }
    }
  }

  lines.push(
    '',
    '\u2501'.repeat(30),
    'Use @tork verify to check the last draft.',
  );

  return lines.join('\n');
}

export function isClaimsRequest(content: string): boolean {
  return CLAIMS_PATTERN.test(content.trim());
}

export async function handleClaimsCommand(text: string): Promise<string> {
  const trimmed = text.trim().toLowerCase();

  if (trimmed.includes('verify')) {
    const content = getLastDraftContent();
    if (!content) {
      return 'No draft in queue to verify. Use @tork content [platform] [topic] first.';
    }
    const result = verifyContent(content);
    return formatVerificationResult(result);
  }

  // "@tork claims"
  return formatAllClaims();
}
