/**
 * Module C: Auto-Publish Connectors
 *
 * Publishes approved content to external platforms.
 * Each connector reads from the approved queue, publishes,
 * and updates status with the returned URL.
 *
 * All API keys read from process.env — never hardcoded.
 *
 * Commands: !publish, !comment, !guestpost, !answer
 */
import crypto from 'crypto';

import { readEnvFile } from '../../env.js';
import { logger } from '../../logger.js';

import {
  type ContentRow,
  getContentById,
  markPublished,
  rewriteForPublish,
} from './module-b-content.js';

// ══════════════════════════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════════════════════════

type PublishResult =
  | { ok: true; url: string; platform: string }
  | { ok: false; error: string; platform: string };

// ══════════════════════════════════════════════════════════════
//  API KEY HELPERS
// ══════════════════════════════════════════════════════════════

function getAnthropicKey(): string | null {
  return (
    process.env.ANTHROPIC_API_KEY ||
    readEnvFile(['ANTHROPIC_API_KEY']).ANTHROPIC_API_KEY ||
    null
  );
}

function getDevtoKey(): string | null {
  // TODO: Add DEVTO_API_KEY to .env — get from https://dev.to/settings/extensions
  const val =
    process.env.DEVTO_API_KEY || readEnvFile(['DEVTO_API_KEY']).DEVTO_API_KEY;
  return val && val !== 'MISSING' ? val : null;
}

function getTwitterCredentials(): {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessSecret: string;
} | null {
  // TODO: Add Twitter API keys to .env — get from https://developer.twitter.com/
  // Needs: TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET
  const env = readEnvFile([
    'TWITTER_API_KEY',
    'TWITTER_API_SECRET',
    'TWITTER_ACCESS_TOKEN',
    'TWITTER_ACCESS_SECRET',
  ]);
  const consumerKey = process.env.TWITTER_API_KEY || env.TWITTER_API_KEY;
  const consumerSecret =
    process.env.TWITTER_API_SECRET || env.TWITTER_API_SECRET;
  const accessToken =
    process.env.TWITTER_ACCESS_TOKEN || env.TWITTER_ACCESS_TOKEN;
  const accessSecret =
    process.env.TWITTER_ACCESS_SECRET || env.TWITTER_ACCESS_SECRET;

  if (!consumerKey || !consumerSecret || !accessToken || !accessSecret)
    return null;
  return { consumerKey, consumerSecret, accessToken, accessSecret };
}

function getLinkedInCredentials(): {
  accessToken: string;
  personId: string;
} | null {
  // TODO: Add LinkedIn API keys to .env — get from https://www.linkedin.com/developers/
  // Needs: LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_ID
  const env = readEnvFile(['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_PERSON_ID']);
  const accessToken =
    process.env.LINKEDIN_ACCESS_TOKEN || env.LINKEDIN_ACCESS_TOKEN;
  const personId = process.env.LINKEDIN_PERSON_ID || env.LINKEDIN_PERSON_ID;

  if (
    !accessToken ||
    !personId ||
    accessToken === 'MISSING' ||
    personId === 'MISSING'
  )
    return null;
  return { accessToken, personId };
}

function getHashnodeConfig(): {
  token: string;
  publicationId: string;
} | null {
  // TODO: Add Hashnode API keys to .env — get from https://hashnode.com/settings/developer
  // Needs: HASHNODE_TOKEN, HASHNODE_PUBLICATION_ID
  const env = readEnvFile(['HASHNODE_TOKEN', 'HASHNODE_PUBLICATION_ID']);
  const token = process.env.HASHNODE_TOKEN || env.HASHNODE_TOKEN;
  const publicationId =
    process.env.HASHNODE_PUBLICATION_ID || env.HASHNODE_PUBLICATION_ID;

  if (
    !token ||
    !publicationId ||
    token === 'MISSING' ||
    publicationId === 'MISSING'
  )
    return null;
  return { token, publicationId };
}

// ══════════════════════════════════════════════════════════════
//  CONNECTOR 1: DEV.TO
// ══════════════════════════════════════════════════════════════

function parseMarkdownArticle(markdown: string): {
  title: string;
  tags: string[];
  body: string;
} {
  let title = '';
  let tags: string[] = [];
  let body = markdown;

  // Try frontmatter
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fmMatch) {
    const fm = fmMatch[1];
    body = fmMatch[2];
    const titleMatch = fm.match(/^title:\s*["']?(.+?)["']?\s*$/m);
    if (titleMatch) title = titleMatch[1];
    const tagsMatch = fm.match(/^tags:\s*(.+)$/m);
    if (tagsMatch) {
      tags = tagsMatch[1]
        .split(',')
        .map((t) => t.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
        .slice(0, 4);
    }
  }

  // Fallback: first # heading
  if (!title) {
    const headingMatch = body.match(/^#\s+(.+)$/m);
    if (headingMatch) title = headingMatch[1];
  }

  if (!title) title = 'Tork Network — AI Governance';

  return { title, tags, body };
}

async function publishToDevto(item: ContentRow): Promise<PublishResult> {
  const apiKey = getDevtoKey();
  if (!apiKey) {
    return {
      ok: false,
      error:
        'DEVTO_API_KEY not set. Get yours at https://dev.to/settings/extensions and add to .env',
      platform: 'Dev.to',
    };
  }

  const { title, tags, body } = parseMarkdownArticle(item.body);

  try {
    const response = await fetch('https://dev.to/api/articles', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        article: { title, body_markdown: body, published: true, tags },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return {
        ok: false,
        error: `${response.status} ${errBody}`,
        platform: 'Dev.to',
      };
    }

    const data = (await response.json()) as { url?: string };
    return { ok: true, url: data.url || '', platform: 'Dev.to' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      platform: 'Dev.to',
    };
  }
}

// ══════════════════════════════════════════════════════════════
//  CONNECTOR 2: X / TWITTER
// ══════════════════════════════════════════════════════════════

function buildOAuthHeader(
  method: string,
  url: string,
  creds: {
    consumerKey: string;
    consumerSecret: string;
    accessToken: string;
    accessSecret: string;
  },
): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };

  const paramString = Object.keys(oauthParams)
    .sort()
    .map(
      (k) => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`,
    )
    .join('&');

  const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
  const signingKey = `${encodeURIComponent(creds.consumerSecret)}&${encodeURIComponent(creds.accessSecret)}`;
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');

  return (
    'OAuth ' +
    Object.keys(oauthParams)
      .sort()
      .map(
        (k) =>
          `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`,
      )
      .concat(`oauth_signature="${encodeURIComponent(signature)}"`)
      .join(', ')
  );
}

async function postTweet(
  creds: {
    consumerKey: string;
    consumerSecret: string;
    accessToken: string;
    accessSecret: string;
  },
  text: string,
  replyToId?: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const url = 'https://api.twitter.com/2/tweets';
  const authHeader = buildOAuthHeader('POST', url, creds);
  const body: Record<string, unknown> = { text };
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errBody = await response.text();
      return { ok: false, error: `${response.status} ${errBody}` };
    }
    const data = (await response.json()) as { data?: { id?: string } };
    return { ok: true, id: data.data?.id || '' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function publishToTwitter(item: ContentRow): Promise<PublishResult> {
  const creds = getTwitterCredentials();
  if (!creds) {
    return {
      ok: false,
      error:
        'Twitter API keys not set. Add TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET to .env',
      platform: 'X/Twitter',
    };
  }

  // If it's a thread (contains ---TWEET--- separators), publish as thread
  const tweets = item.body
    .split('---TWEET---')
    .map((t) => t.trim())
    .filter(Boolean);

  if (tweets.length > 1) {
    // Publish as thread
    const tweetIds: string[] = [];
    let previousId: string | undefined;

    for (let i = 0; i < tweets.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1500));
      const result = await postTweet(creds, tweets[i], previousId);
      if (!result.ok) {
        return {
          ok: false,
          error: `Thread failed at tweet ${i + 1}: ${result.error}. ${i} tweets posted.`,
          platform: 'X/Twitter',
        };
      }
      tweetIds.push(result.id);
      previousId = result.id;
    }

    const threadUrl = tweetIds[0]
      ? `https://x.com/i/status/${tweetIds[0]}`
      : '';
    return { ok: true, url: threadUrl, platform: 'X/Twitter' };
  }

  // Single tweet
  const result = await postTweet(creds, item.body);
  if (!result.ok) {
    return { ok: false, error: result.error, platform: 'X/Twitter' };
  }
  const tweetUrl = result.id ? `https://x.com/i/status/${result.id}` : '';
  return { ok: true, url: tweetUrl, platform: 'X/Twitter' };
}

// ══════════════════════════════════════════════════════════════
//  CONNECTOR 3: LINKEDIN
// ══════════════════════════════════════════════════════════════

async function publishToLinkedIn(item: ContentRow): Promise<PublishResult> {
  const creds = getLinkedInCredentials();
  if (!creds) {
    return {
      ok: false,
      error:
        'LinkedIn credentials not set. Add LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_ID to .env',
      platform: 'LinkedIn',
    };
  }

  try {
    const response = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': '202401',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: `urn:li:person:${creds.personId}`,
        lifecycleState: 'PUBLISHED',
        visibility: 'PUBLIC',
        commentary: item.body,
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return {
        ok: false,
        error: `${response.status} ${errBody}`,
        platform: 'LinkedIn',
      };
    }

    const postUrn = response.headers.get('x-restli-id') || '';
    const postUrl = postUrn
      ? `https://www.linkedin.com/feed/update/${postUrn}`
      : '';
    return { ok: true, url: postUrl, platform: 'LinkedIn' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      platform: 'LinkedIn',
    };
  }
}

// ══════════════════════════════════════════════════════════════
//  CONNECTOR 4: HASHNODE
// ══════════════════════════════════════════════════════════════

async function publishToHashnode(item: ContentRow): Promise<PublishResult> {
  const config = getHashnodeConfig();
  if (!config) {
    return {
      ok: false,
      error:
        'Hashnode credentials not set. Add HASHNODE_TOKEN and HASHNODE_PUBLICATION_ID to .env',
      platform: 'Hashnode',
    };
  }

  const { title, body } = parseMarkdownArticle(item.body);

  const mutation = `mutation PublishPost($input: PublishPostInput!) {
    publishPost(input: $input) {
      post { id url slug }
    }
  }`;

  const variables = {
    input: {
      publicationId: config.publicationId,
      title,
      contentMarkdown: body,
      tags: [],
      originalArticleURL: 'https://tork.network',
    },
  };

  try {
    const response = await fetch('https://gql.hashnode.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: config.token,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return {
        ok: false,
        error: `${response.status} ${errBody}`,
        platform: 'Hashnode',
      };
    }

    const data = (await response.json()) as {
      data?: { publishPost?: { post?: { url?: string } } };
      errors?: { message: string }[];
    };

    if (data.errors?.length) {
      return {
        ok: false,
        error: data.errors[0].message,
        platform: 'Hashnode',
      };
    }

    const url = data.data?.publishPost?.post?.url || '';
    return { ok: true, url, platform: 'Hashnode' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      platform: 'Hashnode',
    };
  }
}

// ══════════════════════════════════════════════════════════════
//  PUBLISH ORCHESTRATOR
// ══════════════════════════════════════════════════════════════

type PlatformKey = 'devto' | 'twitter' | 'linkedin' | 'hashnode';

const PUBLISHERS: Record<
  PlatformKey,
  (item: ContentRow) => Promise<PublishResult>
> = {
  devto: publishToDevto,
  twitter: publishToTwitter,
  linkedin: publishToLinkedIn,
  hashnode: publishToHashnode,
};

async function publishTo(
  platform: PlatformKey,
  contentId: number,
): Promise<string> {
  const item = getContentById(contentId);
  if (!item) return `Content #${contentId} not found.`;
  if (item.status !== 'approved') {
    return `Content #${contentId} is not approved (status: ${item.status}). Approve it first with @tork !content approve ${contentId}`;
  }

  const publisher = PUBLISHERS[platform];
  if (!publisher) {
    return `Unknown platform "${platform}". Supported: ${Object.keys(PUBLISHERS).join(', ')}`;
  }

  logger.info({ platform, contentId }, 'Publishing content');

  const result = await publisher(item);
  if (result.ok) {
    markPublished(contentId, result.url);
    return `Published to ${result.platform}!\nURL: ${result.url}\nContent #${contentId} marked as published.`;
  }
  return `${result.platform} publish failed: ${result.error}. Content saved — copy and paste manually.`;
}

async function publishToAll(contentId: number): Promise<string> {
  const item = getContentById(contentId);
  if (!item) return `Content #${contentId} not found.`;
  if (item.status !== 'approved') {
    return `Content #${contentId} is not approved (status: ${item.status}).`;
  }

  const results: string[] = [];
  for (const platform of Object.keys(PUBLISHERS) as PlatformKey[]) {
    const result = await publishTo(platform, contentId);
    results.push(result);
  }
  return results.join('\n\n');
}

// ══════════════════════════════════════════════════════════════
//  EXTRA COMMANDS: !comment, !guestpost, !answer
// ══════════════════════════════════════════════════════════════

async function callClaudeForExtra(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const apiKey = getAnthropicKey();
  if (!apiKey) return 'ANTHROPIC_API_KEY not set — cannot generate content.';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return `Claude API error: ${response.status} ${body}`;
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    const textBlock = data.content.find((b) => b.type === 'text');
    return textBlock?.text || 'No content generated.';
  } catch (err) {
    return `Generation failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

const COMMENT_PROMPT = `You are a content writer for Tork Network (tork.network), an AI governance platform. Write a thoughtful, value-adding comment for an online discussion. 50-150 words. Add genuine insight. Only mention Tork if directly relevant and natural. Never spammy. Never mention internal costs or lines of code.`;

const GUESTPOST_TARGETS: Record<string, string> = {
  newstack:
    'The New Stack — DevOps, cloud-native, and infrastructure-focused publication. Audience: platform engineers, DevOps, SREs.',
  infoq:
    'InfoQ — Software architecture and engineering publication. Audience: senior developers, architects, tech leads.',
  dzone:
    'DZone — Developer community and publication. Audience: Java/enterprise developers, cloud engineers.',
};

const GUESTPOST_PROMPT = `You are the CEO of Tork Network (tork.network), an AI governance platform. Write a guest post pitch email to a technical publication editor. Include: who you are, proposed article topic on AI governance, why their audience cares, your credentials, and a 3-sentence article outline. Under 200 words. Professional but personable. Never mention internal costs or lines of code.`;

const ANSWER_PROMPT = `You are a technical expert on AI governance, MCP security, and PII detection from Tork Network (tork.network). Write a helpful answer for a Q&A platform. Lead with the solution. Mention Tork only if directly solving the question. Include a tork.network/docs link as a reference. 100-300 words. Never mention internal costs or lines of code.`;

async function handleCommentCommand(
  url: string,
  message: string,
): Promise<string> {
  const draft = await callClaudeForExtra(
    COMMENT_PROMPT,
    `Write a comment for this discussion (${url}). Context: ${message}`,
  );
  return [
    `Comment draft for ${url}:`,
    '---',
    draft,
    '---',
    'Copy and paste manually.',
  ].join('\n');
}

async function handleGuestpostCommand(target: string): Promise<string> {
  const targetInfo = GUESTPOST_TARGETS[target.toLowerCase()];
  if (!targetInfo) {
    return `Unknown target "${target}". Supported: ${Object.keys(GUESTPOST_TARGETS).join(', ')}`;
  }

  const draft = await callClaudeForExtra(
    GUESTPOST_PROMPT,
    `Write a guest post pitch for: ${targetInfo}`,
  );
  return [
    `Guest post pitch for ${target}:`,
    '---',
    draft,
    '---',
    'Review and send via email.',
  ].join('\n');
}

async function handleAnswerCommand(
  platform: string,
  questionSummary: string,
): Promise<string> {
  const draft = await callClaudeForExtra(
    ANSWER_PROMPT,
    `Write an answer for ${platform} about: ${questionSummary}`,
  );
  return [
    `Answer draft for ${platform}:`,
    '---',
    draft,
    '---',
    'Copy and paste to the platform.',
  ].join('\n');
}

// ══════════════════════════════════════════════════════════════
//  WHATSAPP COMMAND ROUTING
// ══════════════════════════════════════════════════════════════

// Patterns accept both "!command ..." and "@tork !command ..."
const P = '(?:@tork\\s+)?';
const PUBLISH_PLATFORM_PATTERN = new RegExp(
  `^${P}!publish\\s+(devto|twitter|linkedin|hashnode)\\s+(\\d+)\\s*$`,
  'i',
);
const PUBLISH_ALL_PATTERN = new RegExp(
  `^${P}!publish\\s+all\\s+(\\d+)\\s*$`,
  'i',
);
const COMMENT_PATTERN = new RegExp(
  `^${P}!comment\\s+(\\S+)\\s+([\\s\\S]+)`,
  'i',
);
const GUESTPOST_PATTERN = new RegExp(`^${P}!guestpost\\s+(\\w+)\\s*$`, 'i');
const ANSWER_PATTERN = new RegExp(`^${P}!answer\\s+(\\w+)\\s+([\\s\\S]+)`, 'i');

// Broad detection: matches any message starting with !publish, !comment, !guestpost, or !answer
const PUBLISH_CMD_DETECT =
  /^(?:@tork\s+)?!(publish|comment|guestpost|answer)\b/i;

/** Check if a message is a publish/extra command */
export function isPublishRequest(content: string): boolean {
  return PUBLISH_CMD_DETECT.test(content.trim());
}

/** Handle a publish/extra command and return the response */
export async function handlePublishCommand(content: string): Promise<string> {
  const text = content.trim();

  // !publish <platform> <content_id>
  const platformMatch = text.match(PUBLISH_PLATFORM_PATTERN);
  if (platformMatch) {
    const platform = platformMatch[1].toLowerCase() as PlatformKey;
    const contentId = parseInt(platformMatch[2], 10);
    return publishTo(platform, contentId);
  }

  // !publish all <content_id>
  const allMatch = text.match(PUBLISH_ALL_PATTERN);
  if (allMatch) {
    const contentId = parseInt(allMatch[1], 10);
    return publishToAll(contentId);
  }

  // !comment <url> <message>
  const commentMatch = text.match(COMMENT_PATTERN);
  if (commentMatch) {
    return handleCommentCommand(commentMatch[1], commentMatch[2].trim());
  }

  // !guestpost <target>
  const guestpostMatch = text.match(GUESTPOST_PATTERN);
  if (guestpostMatch) {
    return handleGuestpostCommand(guestpostMatch[1]);
  }

  // !answer <platform> <question_summary>
  const answerMatch = text.match(ANSWER_PATTERN);
  if (answerMatch) {
    return handleAnswerCommand(answerMatch[1], answerMatch[2].trim());
  }

  return 'Unknown publish command. Use: !publish <platform> <id> | !publish all <id> | !comment | !guestpost | !answer';
}
