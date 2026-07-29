/**
 * Tork Swarm Coordinator (Skill 16)
 *
 * Connects existing NanoClaw skills so they trigger each other
 * automatically. All generated content goes through the approval
 * queue — nothing is published without @tork approve.
 *
 * Trigger chains:
 *   1. Competitor change  -> auto-draft response (not yet wired)
 *   2. Dev.to published   -> auto-draft promo tweet
 *   3. Directory submitted-> auto-draft announcement tweet
 *   4. Social mention     -> auto-draft engagement comment
 *   5. Analytics milestone-> auto-draft celebration tweet
 *   6. Thread published   -> auto-draft LinkedIn cross-promo
 */
import fs from 'fs';
import path from 'path';

import { STORE_DIR } from './config.js';
import { logger } from './logger.js';

// ══════════════════════════════════════════════════════════════
//  INIT — set by index.ts at startup
// ══════════════════════════════════════════════════════════════

let generateContentFn:
  | ((platform: string, topic: string) => Promise<string>)
  | null = null;
let swarmSendFn: ((text: string) => Promise<void>) | null = null;

export function initSwarm(opts: {
  generateContent: (platform: string, topic: string) => Promise<string>;
  sendMessage: (text: string) => Promise<void>;
}): void {
  generateContentFn = opts.generateContent;
  swarmSendFn = opts.sendMessage;
  logger.info('Swarm coordinator initialized');
}

// ══════════════════════════════════════════════════════════════
//  RATE LIMITER — max 3 swarm auto-drafts per hour
// ══════════════════════════════════════════════════════════════

const recentSwarmTimestamps: number[] = [];
const MAX_SWARM_PER_HOUR = 3;

function canSend(): boolean {
  const oneHourAgo = Date.now() - 3_600_000;
  while (
    recentSwarmTimestamps.length > 0 &&
    recentSwarmTimestamps[0] < oneHourAgo
  ) {
    recentSwarmTimestamps.shift();
  }
  return recentSwarmTimestamps.length < MAX_SWARM_PER_HOUR;
}

async function sendSwarm(text: string): Promise<void> {
  if (!swarmSendFn) {
    logger.warn('Swarm sendMessage not initialized, skipping');
    return;
  }
  if (!canSend()) {
    logger.info('Swarm rate limit reached, skipping auto-draft');
    return;
  }
  recentSwarmTimestamps.push(Date.now());
  await swarmSendFn(text);
}

async function generateContent(
  platform: string,
  topic: string,
): Promise<string | null> {
  if (!generateContentFn) {
    logger.warn('Swarm generateContent not initialized, skipping');
    return null;
  }
  try {
    return await generateContentFn(platform, topic);
  } catch (err) {
    logger.error({ err, platform, topic }, 'Swarm content generation failed');
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
//  MILESTONE TRACKING
// ══════════════════════════════════════════════════════════════

const MILESTONES_FILE = path.join(STORE_DIR, 'swarm-milestones.json');
const MILESTONE_THRESHOLDS = [
  10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
];

interface MilestoneStore {
  lastKnownUsers: number;
  lastKnownDownloads: number;
  celebratedUsers: number[];
  celebratedDownloads: number[];
}

function loadMilestones(): MilestoneStore {
  try {
    const data = fs.readFileSync(MILESTONES_FILE, 'utf-8');
    return JSON.parse(data) as MilestoneStore;
  } catch {
    return {
      lastKnownUsers: 0,
      lastKnownDownloads: 0,
      celebratedUsers: [],
      celebratedDownloads: [],
    };
  }
}

function saveMilestones(store: MilestoneStore): void {
  fs.mkdirSync(path.dirname(MILESTONES_FILE), { recursive: true });
  fs.writeFileSync(MILESTONES_FILE, JSON.stringify(store, null, 2));
}

function findNewMilestone(
  current: number,
  celebrated: number[],
): number | null {
  const celebratedSet = new Set(celebrated);
  for (const threshold of MILESTONE_THRESHOLDS) {
    if (current >= threshold && !celebratedSet.has(threshold)) {
      return threshold;
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════
//  CHAIN 1: COMPETITOR CHANGE (stub — not wired yet)
// ══════════════════════════════════════════════════════════════

export async function onCompetitorAlert(alertMessage: string): Promise<void> {
  // Parse competitor name and change from alert message
  const companyMatch = alertMessage.match(
    /(?:competitor|company|alert)[:\s]+([A-Za-z0-9. ]+)/i,
  );
  const company = companyMatch?.[1]?.trim() || 'a competitor';
  const change = 'made changes to their offering';

  const [linkedinDraft, twitterDraft] = await Promise.all([
    generateContent(
      'linkedin',
      `our competitor ${company} just ${change} — here's how Tork's approach differs`,
    ),
    generateContent(
      'twitter',
      `${company} just ${change} — here's why Tork takes a different approach to AI governance`,
    ),
  ]);

  if (!linkedinDraft && !twitterDraft) return;

  const parts = [
    '\u{1F916} Swarm Auto-Draft (triggered by competitor change)',
    'I noticed a competitor update and drafted responses. Reply @tork approve to publish any, or ignore.',
  ];

  if (linkedinDraft) {
    parts.push('', '\u{1F4DD} LinkedIn:', linkedinDraft);
  }
  if (twitterDraft) {
    parts.push('', '\u{1F4DD} Twitter:', twitterDraft);
  }

  await sendSwarm(parts.join('\n'));
  logger.info({ company }, 'Swarm: competitor auto-draft sent');
}

// ══════════════════════════════════════════════════════════════
//  CHAIN 2: DEV.TO ARTICLE PUBLISHED -> PROMO TWEET
// ══════════════════════════════════════════════════════════════

export async function onArticlePublished(
  title: string,
  url: string,
): Promise<void> {
  const draft = await generateContent(
    'twitter',
    `just published: ${title} — ${url}`,
  );
  if (!draft) return;

  const message = [
    '\u{1F916} Swarm Auto-Draft (article published)',
    "Your Dev.to article is live. Here's a promo tweet:",
    '',
    draft,
    '',
    'Reply @tork approve to publish.',
  ].join('\n');

  await sendSwarm(message);
  logger.info({ title, url }, 'Swarm: article promo tweet drafted');
}

// ══════════════════════════════════════════════════════════════
//  CHAIN 3: DIRECTORY SUBMITTED -> ANNOUNCEMENT TWEET
// ══════════════════════════════════════════════════════════════

export async function onDirectorySubmitted(
  directoryName: string,
): Promise<void> {
  const draft = await generateContent(
    'twitter',
    `Tork is now listed on ${directoryName} — another step toward making AI governance accessible everywhere. Check us out at tork.network`,
  );
  if (!draft) return;

  const message = [
    '\u{1F916} Swarm Auto-Draft (new directory listing)',
    '',
    draft,
    '',
    'Reply @tork approve to publish.',
  ].join('\n');

  await sendSwarm(message);
  logger.info({ directoryName }, 'Swarm: directory announcement drafted');
}

// ══════════════════════════════════════════════════════════════
//  CHAIN 4: SOCIAL MENTION -> ENGAGEMENT COMMENT
// ══════════════════════════════════════════════════════════════

export async function onSocialMention(
  platform: string,
  title: string,
  url: string,
): Promise<void> {
  const draft = await generateContent(
    'comment',
    `respond to this discussion: "${title}" at ${url} — relate it to AI governance and Tork if natural`,
  );
  if (!draft) return;

  const message = [
    `\u{1F916} Swarm Auto-Draft (social mention detected on ${platform})`,
    "Found a relevant discussion. Here's a suggested comment:",
    '',
    draft,
    '',
    'Copy and post manually if you like it, or @tork refine [feedback].',
  ].join('\n');

  await sendSwarm(message);
  logger.info({ platform, title, url }, 'Swarm: social engagement drafted');
}

// ══════════════════════════════════════════════════════════════
//  CHAIN 5: ANALYTICS MILESTONE -> CELEBRATION TWEET
// ══════════════════════════════════════════════════════════════

export async function onAnalyticsReport(metrics: {
  totalUsers: number;
  newToday: number;
  totalDownloads: number;
}): Promise<void> {
  const store = loadMilestones();
  const drafts: string[] = [];

  // Check user milestone
  const userMilestone = findNewMilestone(
    metrics.totalUsers,
    store.celebratedUsers,
  );
  if (userMilestone) {
    const draft = await generateContent(
      'twitter',
      `milestone: Tork just reached ${userMilestone} users — AI governance is gaining momentum. Thank you to everyone building safer AI agents with us.`,
    );
    if (draft) drafts.push(draft);
    store.celebratedUsers.push(userMilestone);
  }

  // Check signups momentum
  if (metrics.newToday > 3) {
    const draft = await generateContent(
      'twitter',
      `momentum: ${metrics.newToday} new signups today — more developers are choosing to govern their AI agents. The shift toward responsible AI is accelerating.`,
    );
    if (draft) drafts.push(draft);
  }

  // Check download milestone
  const dlMilestone = findNewMilestone(
    metrics.totalDownloads,
    store.celebratedDownloads,
  );
  if (dlMilestone) {
    const draft = await generateContent(
      'twitter',
      `milestone: ${dlMilestone} book downloads — the Tork AI governance guide is resonating. Developers want practical, hands-on governance.`,
    );
    if (draft) drafts.push(draft);
    store.celebratedDownloads.push(dlMilestone);
  }

  store.lastKnownUsers = metrics.totalUsers;
  store.lastKnownDownloads = metrics.totalDownloads;
  saveMilestones(store);

  if (drafts.length === 0) return;

  const message = [
    '\u{1F916} Swarm Auto-Draft (milestone detected)',
    '',
    ...drafts,
    '',
    'Reply @tork approve to publish.',
  ].join('\n');

  await sendSwarm(message);
  logger.info(
    { userMilestone, dlMilestone, newToday: metrics.newToday },
    'Swarm: milestone auto-draft sent',
  );
}

// ══════════════════════════════════════════════════════════════
//  CHAIN 6: THREAD PUBLISHED -> LINKEDIN CROSS-PROMO
// ══════════════════════════════════════════════════════════════

export async function onThreadPublished(
  threadUrl: string,
  tweetCount: number,
): Promise<void> {
  const draft = await generateContent(
    'linkedin',
    `I just published a ${tweetCount}-tweet thread on X about AI governance. Read the full thread: ${threadUrl}`,
  );
  if (!draft) return;

  const message = [
    '🤖 Swarm Auto-Draft (thread published) — @Zunaid please review:',
    '',
    "⚠️ LinkedIn posts require Zunaid's approval before publishing.",
    '',
    "Your thread is live. Here's a LinkedIn post to cross-promote:",
    '',
    draft,
    '',
    'Reply @tork approve linkedin to publish.',
  ].join('\n');

  await sendSwarm(message);
  logger.info({ threadUrl, tweetCount }, 'Swarm: thread cross-promo drafted');
}
