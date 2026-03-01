/**
 * Tork Guardian — Governance Middleware
 *
 * Host-level middleware that governs ALL agent interactions via Tork's
 * governance API. Runs PII detection, policy enforcement, and generates
 * compliance receipts for every inbound and outbound message.
 *
 * Not a command skill — this is pipeline middleware that wraps the
 * entire message flow. Fail-open: if the API is unreachable or
 * TORK_API_KEY is missing, messages pass through unmodified.
 *
 * On-demand status via "@tork governance".
 */
import fs from 'fs';
import path from 'path';

import { STORE_DIR, TIMEZONE } from './config.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

// --- Types ---

export interface GovernResult {
  allowed: boolean;
  sanitizedInput: string;
  piiDetected: string[];
  receipt_id: string;
  flags: string[];
}

interface GovernanceStats {
  date: string;
  messagesGoverned: number;
  piiDetections: number;
  policyBlocks: number;
  lastReceiptId: string;
}

interface GovernRequestBody {
  content: string;
}

// --- Constants ---

const STATS_FILE = path.join(STORE_DIR, 'guardian-stats.json');
const REQUEST_TIMEOUT_MS = 10_000;
const GOVERNANCE_PATTERN = /^@tork\s+governance\s*$/i;

// --- Stats persistence ---

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadStats(): GovernanceStats {
  try {
    const data = fs.readFileSync(STATS_FILE, 'utf-8');
    const stats = JSON.parse(data) as GovernanceStats;
    // Reset if the date has rolled over
    if (stats.date !== todayDateStr()) {
      return {
        date: todayDateStr(),
        messagesGoverned: 0,
        piiDetections: 0,
        policyBlocks: 0,
        lastReceiptId: '',
      };
    }
    return stats;
  } catch {
    return {
      date: todayDateStr(),
      messagesGoverned: 0,
      piiDetections: 0,
      policyBlocks: 0,
      lastReceiptId: '',
    };
  }
}

function saveStats(stats: GovernanceStats): void {
  fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

function incrementStats(
  update: Partial<Pick<GovernanceStats, 'messagesGoverned' | 'piiDetections' | 'policyBlocks' | 'lastReceiptId'>>,
): void {
  const stats = loadStats();
  if (update.messagesGoverned) stats.messagesGoverned += update.messagesGoverned;
  if (update.piiDetections) stats.piiDetections += update.piiDetections;
  if (update.policyBlocks) stats.policyBlocks += update.policyBlocks;
  if (update.lastReceiptId) stats.lastReceiptId = update.lastReceiptId;
  saveStats(stats);
}

// --- API key ---

function getApiKey(): string | undefined {
  const fromEnv = process.env.TORK_API_KEY;
  if (fromEnv) return fromEnv;

  const envFile = readEnvFile(['TORK_API_KEY']);
  return envFile.TORK_API_KEY;
}

// --- Core governance call ---

async function callGovernApi(
  input: string,
  metadata: { groupJid?: string },
): Promise<GovernResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn('TORK_API_KEY not set — skipping governance');
    return {
      allowed: true,
      sanitizedInput: input,
      piiDetected: [],
      receipt_id: '',
      flags: [],
    };
  }

  const body: GovernRequestBody = { content: input };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('https://tork.network/api/v1/govern', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tork-API-Key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      logger.error(
        { status: response.status },
        'Tork governance API returned non-OK status — allowing message through',
      );
      return {
        allowed: true,
        sanitizedInput: input,
        piiDetected: [],
        receipt_id: '',
        flags: [],
      };
    }

    const raw: unknown = await response.json();

    // Validate expected shape
    if (typeof raw !== 'object' || raw === null) {
      logger.error('Tork governance API returned unexpected format — allowing message through');
      return {
        allowed: true,
        sanitizedInput: input,
        piiDetected: [],
        receipt_id: '',
        flags: [],
      };
    }

    const data = raw as Record<string, unknown>;

    // Map API fields: output → sanitizedInput, pii_detected → piiDetected,
    // receipt.receipt_id → receipt_id, action → allowed
    const piiField = data.pii_detected as string[] | undefined;
    const receipt = data.receipt as Record<string, unknown> | undefined;
    const action = data.action as string | undefined;

    return {
      allowed: action !== 'deny',
      sanitizedInput: (data.output as string) || input,
      piiDetected: Array.isArray(piiField) ? piiField : [],
      receipt_id: (receipt?.receipt_id as string) || '',
      flags: Array.isArray(data.flags) ? (data.flags as string[]) : [],
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: message },
      'Tork governance API unreachable — allowing message through (fail-open)',
    );
    return {
      allowed: true,
      sanitizedInput: input,
      piiDetected: [],
      receipt_id: '',
      flags: [],
    };
  }
}

// --- Public API ---

/**
 * Govern an inbound message before it reaches the agent container.
 */
export async function governInbound(
  message: string,
  metadata: { groupJid?: string },
): Promise<GovernResult> {
  const result = await callGovernApi(message, metadata);

  incrementStats({
    messagesGoverned: 1,
    lastReceiptId: result.receipt_id || undefined,
    piiDetections: result.piiDetected.length > 0 ? 1 : undefined,
    policyBlocks: !result.allowed ? 1 : undefined,
  });

  if (!result.allowed) {
    logger.warn(
      { receiptId: result.receipt_id, flags: result.flags },
      'Tork governance BLOCKED inbound message',
    );
  } else if (result.piiDetected.length > 0) {
    logger.warn(
      { receiptId: result.receipt_id, pii: result.piiDetected },
      'Tork governance detected PII in inbound message — using sanitized version',
    );
  } else {
    logger.info(
      { receiptId: result.receipt_id },
      'Tork governance approved inbound message',
    );
  }

  return result;
}

/**
 * Govern an outbound response before it's sent to the user.
 */
export async function governOutbound(
  response: string,
  metadata: { groupJid?: string },
): Promise<GovernResult> {
  const result = await callGovernApi(response, metadata);

  incrementStats({
    messagesGoverned: 1,
    lastReceiptId: result.receipt_id || undefined,
    piiDetections: result.piiDetected.length > 0 ? 1 : undefined,
    policyBlocks: !result.allowed ? 1 : undefined,
  });

  if (!result.allowed) {
    logger.warn(
      { receiptId: result.receipt_id, flags: result.flags },
      'Tork governance BLOCKED outbound response',
    );
  } else if (result.piiDetected.length > 0) {
    logger.warn(
      { receiptId: result.receipt_id, pii: result.piiDetected },
      'Tork governance detected PII in outbound response — using sanitized version',
    );
  } else {
    logger.info(
      { receiptId: result.receipt_id },
      'Tork governance approved outbound response',
    );
  }

  return result;
}

/**
 * Full governance wrapper for the message pipeline.
 *
 * Returns null if the inbound message was blocked.
 * Otherwise returns { sanitizedInput, governOutboundFn } where
 * governOutboundFn should be called on the agent's response.
 */
export async function governedProcess(
  message: string,
  metadata: { groupJid?: string },
): Promise<{
  sanitizedInput: string;
  inboundResult: GovernResult;
  governOutboundFn: (response: string) => Promise<{ text: string; result: GovernResult }>;
} | null> {
  const inboundResult = await governInbound(message, metadata);

  if (!inboundResult.allowed) {
    return null;
  }

  const sanitizedInput =
    inboundResult.piiDetected.length > 0
      ? inboundResult.sanitizedInput
      : message;

  return {
    sanitizedInput,
    inboundResult,
    governOutboundFn: async (response: string) => {
      const outboundResult = await governOutbound(response, metadata);
      const text =
        outboundResult.piiDetected.length > 0
          ? outboundResult.sanitizedInput
          : response;
      return { text, result: outboundResult };
    },
  };
}

// --- On-demand command ---

export function isGovernanceRequest(content: string): boolean {
  return GOVERNANCE_PATTERN.test(content.trim());
}

export function getGovernanceStatus(): string {
  const stats = loadStats();
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TIMEZONE,
  });
  const tzLabel = now
    .toLocaleTimeString('en-AU', {
      timeZoneName: 'short',
      timeZone: TIMEZONE,
    })
    .split(' ')
    .pop();

  const apiKey = getApiKey();
  const isActive = !!apiKey;

  const lines = [
    `\u{1F6E1}\uFE0F Tork Guardian \u2014 ${isActive ? 'Active' : 'Inactive (no API key)'}`,
    `\u2022 Messages governed today: ${stats.messagesGoverned}`,
    `\u2022 PII detections: ${stats.piiDetections}`,
    `\u2022 Policy blocks: ${stats.policyBlocks}`,
    `\u2022 Last receipt: ${stats.lastReceiptId || 'none'}`,
    `\u2022 Status: ${isActive ? 'Protected \u2705' : 'Unprotected \u26A0\uFE0F'}`,
    '',
    `${timeStr} ${tzLabel}`,
  ];

  return lines.join('\n');
}
