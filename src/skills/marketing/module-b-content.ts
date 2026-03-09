/**
 * Module B: Content Generation + Approval Queue
 *
 * SQLite-backed content queue with Claude API generation,
 * approval workflow, and WhatsApp command handlers.
 *
 * Content types: blog, devto, linkedin, twitter thread, hashnode
 * Commands: !content generate, !content list, !content approve, !content reject
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { STORE_DIR } from '../../config.js';
import { readEnvFile } from '../../env.js';
import { logger } from '../../logger.js';

// ══════════════════════════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════════════════════════

export type ContentType = 'blog' | 'devto' | 'linkedin' | 'twitter' | 'hashnode';

export type ContentStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'published';

export interface ContentRow {
  id: number;
  type: ContentType;
  topic: string;
  body: string;
  status: ContentStatus;
  created_at: string;
  approved_at: string | null;
  published_at: string | null;
  published_url: string | null;
  reject_reason: string | null;
}

// ══════════════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════════════

const DB_PATH = path.join(STORE_DIR, 'marketing-content.db');
const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL_DRAFT = 'claude-haiku-4-5-20251001';
const MODEL_REWRITE = 'claude-sonnet-4-6-20250514';
const MAX_TOKENS = 4096;

// ══════════════════════════════════════════════════════════════
//  TOPIC TEMPLATES
// ══════════════════════════════════════════════════════════════

export const TOPIC_TEMPLATES: string[] = [
  'Why AI Governance is the missing layer in your LLM stack',
  'How to detect PII in 6ms using Tork',
  'A2A, ACP, AG-UI: Governing the new agent protocols',
  'The case for middleware-level AI governance',
  'Building compliant multi-agent systems with session context',
  'PII near-misses: why your AI detector has false positives',
  '79+ compliance frameworks: what Tork actually checks',
  'SHA256 receipt anchoring: cryptographic proof of AI governance',
  'From RAG to governed RAG: adding Tork to your pipeline',
  'Agent session tracking: why turn-by-turn context matters',
];

// ══════════════════════════════════════════════════════════════
//  SYSTEM PROMPTS
// ══════════════════════════════════════════════════════════════

const SHARED_CONTEXT = `You are a content writer for Tork Network (tork.network), an AI governance platform. Key facts:
- Real-time PII detection in ~20ms with 50+ patterns and 12 regional variants
- Policy enforcement across 79+ compliance frameworks (SOC 2, GDPR, HIPAA, PCI DSS, POPIA, CCPA, EU AI Act, ISO 27001, NIST AI RMF)
- Cryptographic compliance receipts with HMAC signatures
- TORKING-X measurement standard
- 11 native SDKs (Python, JavaScript, Go, Ruby, Rust, Java, PHP, .NET, Swift, Elixir, Kotlin)
- Multi-protocol: MCP, A2A, ACP, AG-UI
- Free tier: 5,000 API calls/month
- Founded by Yusuf Jacobs, based in Sydney, Australia

RULES:
- Every piece of content MUST include at least one natural link to tork.network
- Never use "RAG Bot", "chatbot", or "RAGBOT" — use "AI governance platform" or "AI assistant"
- Never mention internal costs, margins, server expenses, or lines of code
- Only use verified statistics from the list above — never fabricate numbers
- Brand voice: authoritative but approachable, technical but accessible, never salesy`;

const CONTENT_PROMPTS: Record<ContentType, string> = {
  blog: `${SHARED_CONTEXT}

Write a blog post for tork.network/blog, 800-1200 words. Include:
- SEO-optimized title
- Meta description (under 160 chars)
- Headers with ## for sections
- At least 2 links to tork.network pages (/docs, /pricing, /demo)
- Professional but engaging tone`,

  devto: `${SHARED_CONTEXT}

Write a technical article for Dev.to, 800-1200 words. Include:
- Frontmatter block with title, description, tags (max 4: ai, security, governance, mcp)
- Code examples showing Tork SDK usage (pip install tork / npm install @tork/sdk)
- Tutorial-style with clear steps
- At least 2 links to tork.network`,

  linkedin: `${SHARED_CONTEXT}

Write a LinkedIn thought leadership post, 150-300 words. Include:
- Strong hook in the first line
- Line breaks for readability (short paragraphs)
- Professional but personal tone
- 3-5 hashtags at the end (#AIGovernance #AIAgents #Compliance #Tork)
- Call-to-action with tork.network link`,

  twitter: `${SHARED_CONTEXT}

Write a Twitter/X thread of 5-7 tweets. Format rules:
- First tweet is the HOOK — must grab attention
- Each tweet MUST be under 280 characters
- Number each tweet: 1/, 2/, 3/, etc.
- Separate each tweet with ---TWEET--- on its own line
- Last tweet is the CTA — include tork.network link
- Conversational founder tone, not corporate marketing
- Use concrete numbers and examples`,

  hashnode: `${SHARED_CONTEXT}

Write a technical deep-dive article for Hashnode, 800-1200 words. Include:
- Markdown formatting with headers
- Code examples showing Tork SDK integration
- Architecture diagrams described in text
- At least 2 links to tork.network
- Technical depth suitable for senior developers`,
};

// ══════════════════════════════════════════════════════════════
//  DATABASE
// ══════════════════════════════════════════════════════════════

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS marketing_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      topic TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      approved_at TEXT,
      published_at TEXT,
      published_url TEXT,
      reject_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mc_status ON marketing_content(status);
    CREATE INDEX IF NOT EXISTS idx_mc_type ON marketing_content(type);
  `);

  return db;
}

// ══════════════════════════════════════════════════════════════
//  CLAUDE API
// ══════════════════════════════════════════════════════════════

function getAnthropicKey(): string | null {
  const fromEnv = process.env.ANTHROPIC_API_KEY;
  if (fromEnv) return fromEnv;
  const env = readEnvFile(['ANTHROPIC_API_KEY']);
  return env.ANTHROPIC_API_KEY || null;
}

async function callClaude(
  systemPrompt: string,
  userMessage: string,
  model: string,
): Promise<string> {
  const apiKey = getAnthropicKey();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in environment');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Claude API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    const textBlock = data.content.find((b) => b.type === 'text');
    if (!textBlock?.text)
      throw new Error('No text content in Claude API response');
    return textBlock.text;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ══════════════════════════════════════════════════════════════
//  CONTENT OPERATIONS
// ══════════════════════════════════════════════════════════════

/** Generate a content draft and save to the queue */
export async function generateContent(
  type: ContentType,
  topicIndex: number,
): Promise<ContentRow> {
  const prompt = CONTENT_PROMPTS[type];
  if (!prompt) throw new Error(`Unknown content type: ${type}`);

  const topic =
    topicIndex >= 0 && topicIndex < TOPIC_TEMPLATES.length
      ? TOPIC_TEMPLATES[topicIndex]
      : TOPIC_TEMPLATES[0];

  logger.info({ type, topic, topicIndex }, 'Generating marketing content draft');

  const body = await callClaude(
    prompt,
    `Write content about: ${topic}`,
    MODEL_DRAFT,
  );

  const database = getDb();
  const now = new Date().toISOString();
  const result = database
    .prepare(
      `INSERT INTO marketing_content (type, topic, body, status, created_at)
       VALUES (?, ?, ?, 'draft', ?)`,
    )
    .run(type, topic, body, now);

  const row = database
    .prepare('SELECT * FROM marketing_content WHERE id = ?')
    .get(result.lastInsertRowid) as ContentRow;

  logger.info({ id: row.id, type, topic }, 'Content draft generated');
  return row;
}

/** List content by status */
export function listContent(status?: ContentStatus): ContentRow[] {
  const database = getDb();
  if (status) {
    return database
      .prepare(
        'SELECT * FROM marketing_content WHERE status = ? ORDER BY created_at DESC',
      )
      .all(status) as ContentRow[];
  }
  return database
    .prepare('SELECT * FROM marketing_content ORDER BY created_at DESC')
    .all() as ContentRow[];
}

/** Get a single content item by ID */
export function getContentById(id: number): ContentRow | null {
  const database = getDb();
  const row = database
    .prepare('SELECT * FROM marketing_content WHERE id = ?')
    .get(id) as ContentRow | undefined;
  return row || null;
}

/** Approve a content item */
export function approveContent(id: number): ContentRow | null {
  const database = getDb();
  const now = new Date().toISOString();
  database
    .prepare(
      `UPDATE marketing_content SET status = 'approved', approved_at = ? WHERE id = ?`,
    )
    .run(now, id);

  logger.info({ id }, 'Content approved');
  return getContentById(id);
}

/** Reject a content item */
export function rejectContent(id: number, reason: string): ContentRow | null {
  const database = getDb();
  database
    .prepare(
      `UPDATE marketing_content SET status = 'draft', reject_reason = ? WHERE id = ?`,
    )
    .run(reason, id);

  logger.info({ id, reason }, 'Content rejected');
  return getContentById(id);
}

/** Mark content as published */
export function markPublished(
  id: number,
  url: string,
): ContentRow | null {
  const database = getDb();
  const now = new Date().toISOString();
  database
    .prepare(
      `UPDATE marketing_content SET status = 'published', published_at = ?, published_url = ? WHERE id = ?`,
    )
    .run(now, url, id);

  logger.info({ id, url }, 'Content marked as published');
  return getContentById(id);
}

/** Rewrite an approved draft using the quality model */
export async function rewriteForPublish(id: number): Promise<ContentRow | null> {
  const item = getContentById(id);
  if (!item || item.status !== 'approved') return null;

  const prompt = CONTENT_PROMPTS[item.type as ContentType];
  if (!prompt) return null;

  logger.info({ id, type: item.type }, 'Rewriting content with quality model');

  const rewritten = await callClaude(
    prompt,
    `Rewrite and improve this ${item.type} draft. Make it more polished, ensure all links to tork.network are included, and tighten the prose:\n\n${item.body}`,
    MODEL_REWRITE,
  );

  const database = getDb();
  database
    .prepare('UPDATE marketing_content SET body = ? WHERE id = ?')
    .run(rewritten, id);

  return getContentById(id);
}

// ══════════════════════════════════════════════════════════════
//  WHATSAPP COMMAND HANDLERS
// ══════════════════════════════════════════════════════════════

// Patterns accept both "!content ..." and "@tork !content ..."
const PREFIX = /^(?:@tork\s+)?/;
const CONTENT_GENERATE_PATTERN =
  new RegExp(PREFIX.source + /!content\s+generate\s+(\w+)\s+(\d+)\s*$/.source, 'i');
const CONTENT_LIST_PATTERN =
  new RegExp(PREFIX.source + /!content\s+list\s*$/.source, 'i');
const CONTENT_APPROVE_PATTERN =
  new RegExp(PREFIX.source + /!content\s+approve\s+(\d+)\s*$/.source, 'i');
const CONTENT_REJECT_PATTERN =
  new RegExp(PREFIX.source + /!content\s+reject\s+(\d+)\s+([\s\S]+)/.source, 'i');

// Broad detection: matches any message starting with "!content"
const CONTENT_CMD_DETECT = /^(?:@tork\s+)?!content\b/i;

/** Check if a message is a content queue command */
export function isContentQueueRequest(content: string): boolean {
  return CONTENT_CMD_DETECT.test(content.trim());
}

/** Handle a content queue command and return the response */
export async function handleContentQueueCommand(
  content: string,
): Promise<string> {
  const text = content.trim();

  // !content generate <type> <topic_index>
  const generateMatch = text.match(CONTENT_GENERATE_PATTERN);
  if (generateMatch) {
    const type = generateMatch[1].toLowerCase() as ContentType;
    const topicIndex = parseInt(generateMatch[2], 10);

    if (!CONTENT_PROMPTS[type]) {
      const supported = Object.keys(CONTENT_PROMPTS).join(', ');
      return `Unknown content type "${type}". Supported: ${supported}`;
    }

    if (topicIndex < 0 || topicIndex >= TOPIC_TEMPLATES.length) {
      return `Topic index must be 0-${TOPIC_TEMPLATES.length - 1}. Topics:\n${TOPIC_TEMPLATES.map((t, i) => `  ${i}: ${t}`).join('\n')}`;
    }

    try {
      const row = await generateContent(type, topicIndex);
      return [
        `Draft #${row.id} generated (${row.type}):`,
        `Topic: ${row.topic}`,
        '---',
        row.body.slice(0, 1000) + (row.body.length > 1000 ? '\n...(truncated)' : ''),
        '---',
        `Use @tork !content approve ${row.id} to approve`,
      ].join('\n');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'Content generation failed');
      return `Content generation failed: ${msg}`;
    }
  }

  // !content list
  if (CONTENT_LIST_PATTERN.test(text)) {
    const items = listContent();
    if (items.length === 0) {
      return 'Content queue is empty. Use @tork !content generate <type> <topic_index> to create a draft.';
    }

    const lines = items.slice(0, 20).map((item) => {
      const status =
        item.status === 'draft'
          ? 'DRAFT'
          : item.status === 'approved'
            ? 'APPROVED'
            : item.status === 'published'
              ? 'PUBLISHED'
              : item.status.toUpperCase();
      return `#${item.id} | ${item.type} | ${status} | ${item.topic.slice(0, 40)}`;
    });

    return [
      `Content Queue (${items.length} items):`,
      '',
      ...lines,
      '',
      'Commands:',
      '  @tork !content approve <id>',
      '  @tork !content reject <id> <reason>',
    ].join('\n');
  }

  // !content approve <id>
  const approveMatch = text.match(CONTENT_APPROVE_PATTERN);
  if (approveMatch) {
    const id = parseInt(approveMatch[1], 10);
    const item = approveContent(id);
    if (!item) return `Content #${id} not found.`;
    return `Content #${id} approved. Ready for publishing via @tork !publish <platform> ${id}`;
  }

  // !content reject <id> <reason>
  const rejectMatch = text.match(CONTENT_REJECT_PATTERN);
  if (rejectMatch) {
    const id = parseInt(rejectMatch[1], 10);
    const reason = rejectMatch[2].trim();
    const item = rejectContent(id, reason);
    if (!item) return `Content #${id} not found.`;
    return `Content #${id} rejected. Reason: ${reason}`;
  }

  return 'Unknown content command. Use: !content generate | list | approve | reject';
}
