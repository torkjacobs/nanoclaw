/**
 * Tork Content Drafter
 *
 * Host-level content generation using the Claude API directly (no container).
 * Intercepts "@tork draft ..." and "@tork refine ..." commands.
 * Stores the last draft per group for iterative refinement.
 */
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

const SYSTEM_PROMPT = `You are a content writer for Tork Network, an AI governance platform. Tork provides policy enforcement, PII detection/redaction, compliance receipts, and governance controls across 79+ frameworks. The tone should be professional but approachable, technically credible, and focused on real value — not hype. The founder is Yusuf Jacobs. Twitter: @torknetwork1. Website: tork.network. Never use emojis in LinkedIn posts. Keep tweets under 280 characters. Always end LinkedIn posts with a subtle CTA to tork.network.`;

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1024;

interface DraftState {
  type: string;
  content: string;
  description: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

// Per-group last draft for refinement
const lastDrafts = new Map<string, DraftState>();

const DRAFT_PATTERN = /^@tork\s+draft\s+(.+)/is;
const REFINE_PATTERN = /^@tork\s+refine\s+(.+)/is;

export function isDraftRequest(content: string): boolean {
  return DRAFT_PATTERN.test(content.trim());
}

export function isRefineRequest(content: string): boolean {
  return REFINE_PATTERN.test(content.trim());
}

function detectContentType(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes('tweet') || lower.includes('twitter') || lower.includes(' x post'))
    return 'Tweet';
  if (lower.includes('linkedin')) return 'LinkedIn Post';
  if (lower.includes('blog')) return 'Blog Post';
  if (lower.includes('email')) return 'Email';
  if (lower.includes('thread')) return 'Thread';
  return 'LinkedIn Post'; // default
}

function getApiCredentials(): { token: string; isOAuth: boolean } | null {
  const env = readEnvFile(['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY']);

  if (env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { token: env.CLAUDE_CODE_OAUTH_TOKEN, isOAuth: true };
  }
  if (env.ANTHROPIC_API_KEY) {
    return { token: env.ANTHROPIC_API_KEY, isOAuth: false };
  }
  return null;
}

async function callClaudeAPI(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  const creds = getApiCredentials();
  if (!creds) {
    throw new Error(
      'No Claude API credentials found. Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY in .env',
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };

  if (creds.isOAuth) {
    headers['Authorization'] = `Bearer ${creds.token}`;
  } else {
    headers['x-api-key'] = creds.token;
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  const textBlock = data.content.find((b) => b.type === 'text');
  if (!textBlock?.text) {
    throw new Error('No text content in Claude API response');
  }

  return textBlock.text;
}

export async function handleDraftRequest(
  content: string,
  chatJid: string,
): Promise<string> {
  const match = content.trim().match(DRAFT_PATTERN);
  if (!match) return 'Could not parse draft request.';

  const description = match[1].trim();
  const contentType = detectContentType(description);

  logger.info({ contentType, description }, 'Drafting content');

  try {
    const userMessage = `Write ${contentType === 'Tweet' ? 'a tweet' : `a ${contentType.toLowerCase()}`}: ${description}`;
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: userMessage },
    ];

    const draft = await callClaudeAPI(messages);

    // Store for refinement
    lastDrafts.set(chatJid, {
      type: contentType,
      content: draft,
      description,
      messages: [...messages, { role: 'assistant', content: draft }],
    });

    return [
      `\u270F\uFE0F Draft \u2014 ${contentType}`,
      '---',
      draft,
      '---',
      "Reply '@tork refine [feedback]' to adjust",
    ].join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Draft generation failed');
    return `Failed to generate draft: ${msg}`;
  }
}

export async function handleRefineRequest(
  content: string,
  chatJid: string,
): Promise<string> {
  const match = content.trim().match(REFINE_PATTERN);
  if (!match) return 'Could not parse refine request.';

  const feedback = match[1].trim();
  const previous = lastDrafts.get(chatJid);

  if (!previous) {
    return "No previous draft to refine. Use '@tork draft [description]' first.";
  }

  logger.info(
    { contentType: previous.type, feedback },
    'Refining draft',
  );

  try {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...previous.messages,
      { role: 'user', content: `Revise the draft with this feedback: ${feedback}` },
    ];

    const refined = await callClaudeAPI(messages);

    // Update stored state
    lastDrafts.set(chatJid, {
      ...previous,
      content: refined,
      messages: [...messages, { role: 'assistant', content: refined }],
    });

    return [
      `\u270F\uFE0F Refined Draft \u2014 ${previous.type}`,
      '---',
      refined,
      '---',
      "Reply '@tork refine [feedback]' to adjust further",
    ].join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Draft refinement failed');
    return `Failed to refine draft: ${msg}`;
  }
}
