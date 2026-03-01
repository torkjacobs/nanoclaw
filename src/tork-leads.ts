/**
 * Tork Lead Response
 *
 * Host-level sales response drafting using the Claude API directly.
 * Intercepts "@tork reply ..." and "@tork adjust ..." commands.
 * Stores the last lead response per group for iterative adjustment.
 * Separate conversation history from the content drafter.
 */
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

const SYSTEM_PROMPT = `You are drafting a sales response on behalf of Tork Network, an AI governance platform. Tork provides: policy enforcement, PII detection/redaction (1ms processing, 12 regional variants), compliance receipts across 79+ frameworks, 11 SDKs, and enterprise features. Pricing: Free (5K calls), Starter $29/yr, Pro $99/yr, Business $399/yr, Enterprise from $2,500/mo. Founded by Yusuf Jacobs. Website: tork.network. Demo: demo.tork.network.

Rules:
- Be warm, professional, and concise
- Address their specific question/need directly
- Include 1-2 relevant Tork features that match their use case
- End with a clear next step (book a demo, try free tier, etc.)
- Keep responses under 200 words
- Never oversell or make claims we can't back up
- If they mention a specific industry (finance, healthcare, legal), reference relevant compliance frameworks`;

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 512;

interface LeadState {
  inboundMessage: string;
  response: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

// Per-group last lead response for adjustment
const lastLeadResponses = new Map<string, LeadState>();

const REPLY_PATTERN = /^@tork\s+reply\s+(.+)/is;
const ADJUST_PATTERN = /^@tork\s+adjust\s+(.+)/is;

export function isLeadReplyRequest(content: string): boolean {
  return REPLY_PATTERN.test(content.trim());
}

export function isLeadAdjustRequest(content: string): boolean {
  return ADJUST_PATTERN.test(content.trim());
}

function getApiKey(): string | null {
  const env = readEnvFile(['ANTHROPIC_API_KEY']);
  return env.ANTHROPIC_API_KEY || null;
}

async function callClaudeAPI(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('No ANTHROPIC_API_KEY found in .env');
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
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

export async function handleLeadReply(
  content: string,
  chatJid: string,
): Promise<string> {
  const match = content.trim().match(REPLY_PATTERN);
  if (!match) return 'Could not parse reply request.';

  const inboundMessage = match[1].trim();

  logger.info(
    { messagePreview: inboundMessage.slice(0, 80) },
    'Generating lead response',
  );

  try {
    const userMessage = `A potential customer sent this message. Draft a reply:\n\n"${inboundMessage}"`;
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: userMessage },
    ];

    const reply = await callClaudeAPI(messages);

    lastLeadResponses.set(chatJid, {
      inboundMessage,
      response: reply,
      messages: [...messages, { role: 'assistant', content: reply }],
    });

    return [
      '\u{1F4BC} Lead Response Draft',
      '---',
      reply,
      '---',
      "Reply '@tork adjust [feedback]' to refine",
    ].join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Lead response generation failed');
    return `Failed to generate lead response: ${msg}`;
  }
}

export async function handleLeadAdjust(
  content: string,
  chatJid: string,
): Promise<string> {
  const match = content.trim().match(ADJUST_PATTERN);
  if (!match) return 'Could not parse adjust request.';

  const feedback = match[1].trim();
  const previous = lastLeadResponses.get(chatJid);

  if (!previous) {
    return "No previous lead response to adjust. Use '@tork reply [message]' first.";
  }

  logger.info(
    { feedback: feedback.slice(0, 80) },
    'Adjusting lead response',
  );

  try {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...previous.messages,
      {
        role: 'user',
        content: `Revise the response with this feedback: ${feedback}`,
      },
    ];

    const adjusted = await callClaudeAPI(messages);

    lastLeadResponses.set(chatJid, {
      ...previous,
      response: adjusted,
      messages: [...messages, { role: 'assistant', content: adjusted }],
    });

    return [
      '\u{1F4BC} Adjusted Lead Response',
      '---',
      adjusted,
      '---',
      "Reply '@tork adjust [feedback]' to refine further",
    ].join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Lead response adjustment failed');
    return `Failed to adjust lead response: ${msg}`;
  }
}
