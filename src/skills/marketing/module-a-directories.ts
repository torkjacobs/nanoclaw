/**
 * Module A: Directory Submission Templates
 *
 * 28 directory templates with pre-filled submission copy,
 * priority tiers (P0/P1/P2), and status tracking.
 *
 * All descriptions reference tork.network and position Tork
 * as an AI governance platform.
 */
import fs from 'fs';
import path from 'path';

import { STORE_DIR } from '../../config.js';
import { logger } from '../../logger.js';

// ══════════════════════════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════════════════════════

export type DirectoryCategory =
  | 'AI Tools'
  | 'Developer Tools'
  | 'SaaS'
  | 'Security';

export type DirectoryPriority = 'P0' | 'P1' | 'P2';

export type DirectoryStatus = 'pending' | 'submitted' | 'live';

export interface DirectoryTemplate {
  name: string;
  url: string;
  category: DirectoryCategory;
  priority: DirectoryPriority;
  status: DirectoryStatus;
  template: {
    tagline: string;
    description: string;
    tags: string[];
    website: string;
  };
  notes: string;
}

// ══════════════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════════════

const STATUS_FILE = path.join(STORE_DIR, 'marketing-dir-status.json');

const TAGLINE =
  'AI governance for autonomous agents — PII detection & compliance';

const DESC_SHORT =
  'Tork is the governance layer for AI agents. Real-time PII detection in ~20ms, policy enforcement across 79+ compliance frameworks (SOC 2, GDPR, HIPAA, EU AI Act), and cryptographic compliance receipts. Available as API, MCP server, and 11 native SDKs. Free tier: 5,000 API calls/month.';

const TAGS_AI = ['ai-governance', 'pii-detection', 'compliance', 'ai-security', 'mcp'];
const TAGS_DEV = ['developer-tools', 'ai-governance', 'sdk', 'api', 'security'];
const TAGS_SAAS = ['saas', 'ai-governance', 'compliance', 'security', 'api'];

// ══════════════════════════════════════════════════════════════
//  DIRECTORY TEMPLATES — 28 entries
// ══════════════════════════════════════════════════════════════

export const DIRECTORY_TEMPLATES: DirectoryTemplate[] = [
  // ── P0: Submit this week (12) ──
  {
    name: 'Product Hunt',
    url: 'https://www.producthunt.com/posts/new',
    category: 'AI Tools',
    priority: 'P0',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description: DESC_SHORT,
      tags: TAGS_AI,
      website: 'https://tork.network',
    },
    notes:
      'Schedule launch for a Tuesday or Wednesday. Prepare maker comment, first comment, and hunter. Coordinate with community upvotes.',
  },
  {
    name: 'BetaList',
    url: 'https://betalist.com/submit',
    category: 'SaaS',
    priority: 'P0',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description: DESC_SHORT,
      tags: TAGS_SAAS,
      website: 'https://tork.network',
    },
    notes: 'Free submission takes 2-4 weeks for review. Paid option for faster listing.',
  },
  {
    name: 'StackShare',
    url: 'https://stackshare.io/submit',
    category: 'Developer Tools',
    priority: 'P0',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description:
        'Tork provides AI governance middleware for autonomous agents. PII detection in ~20ms, policy enforcement across 79+ compliance frameworks, cryptographic compliance receipts with HMAC signatures, and 11 native SDKs. Integrates via API and MCP server.',
      tags: TAGS_DEV,
      website: 'https://tork.network',
    },
    notes: 'Add to Developer Tools > Security category. Include SDK integrations list.',
  },
  {
    name: 'G2',
    url: 'https://www.g2.com/products/new',
    category: 'SaaS',
    priority: 'P0',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description: DESC_SHORT,
      tags: TAGS_SAAS,
      website: 'https://tork.network',
    },
    notes:
      'Requires vendor claim. Category: AI Governance. Add pricing tiers and screenshot.',
  },
  {
    name: 'Futurepedia',
    url: 'https://www.futurepedia.io/submit-tool',
    category: 'AI Tools',
    priority: 'P0',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description: DESC_SHORT,
      tags: TAGS_AI,
      website: 'https://tork.network',
    },
    notes: 'AI tools directory. Category: AI Security. Include pricing and features.',
  },
  {
    name: 'AlternativeTo',
    url: 'https://alternativeto.net/add-application/',
    category: 'SaaS',
    priority: 'P0',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description:
        'Tork is an AI governance platform providing real-time PII detection, policy enforcement across 79+ compliance frameworks, and cryptographic compliance receipts for autonomous AI agents. Alternative to manual compliance auditing and ad-hoc PII scrubbing.',
      tags: TAGS_SAAS,
      website: 'https://tork.network',
    },
    notes: 'Position as alternative to: Presidio, Private AI, Nightfall AI. Add comparison points.',
  },
  {
    name: 'SaaSHub',
    url: 'https://www.saashub.com/submit',
    category: 'SaaS',
    priority: 'P0',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description: DESC_SHORT,
      tags: TAGS_SAAS,
      website: 'https://tork.network',
    },
    notes: 'SaaS comparison directory. Include pricing tiers and alternatives.',
  },
  {
    name: 'DevHunt',
    url: 'https://devhunt.org/submit',
    category: 'Developer Tools',
    priority: 'P0',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description:
        'Tork is the governance layer between AI agents and everything they touch. Real-time PII detection in ~20ms, 79+ compliance frameworks, cryptographic receipts, and 11 native SDKs. Built for developers shipping AI agents to production.',
      tags: TAGS_DEV,
      website: 'https://tork.network',
    },
    notes: 'Developer-focused Product Hunt alternative. Good for dev tool launches.',
  },
  {
    name: "There's An AI For That",
    url: 'https://theresanaiforthat.com/submit/',
    category: 'AI Tools',
    priority: 'P0',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description: DESC_SHORT,
      tags: TAGS_AI,
      website: 'https://tork.network',
    },
    notes: 'High-traffic AI directory. Category: AI Security / Governance. Free submission.',
  },
  {
    name: 'AI Tools Directory',
    url: 'https://aitoolsdirectory.com/submit',
    category: 'AI Tools',
    priority: 'P0',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description: DESC_SHORT,
      tags: TAGS_AI,
      website: 'https://tork.network',
    },
    notes: 'Curated AI tools list. Include pricing and category: AI Security.',
  },
  {
    name: 'Toolify.ai',
    url: 'https://www.toolify.ai/submit',
    category: 'AI Tools',
    priority: 'P0',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description: DESC_SHORT,
      tags: TAGS_AI,
      website: 'https://tork.network',
    },
    notes: 'Large AI tools aggregator. Category: AI Security. Include pricing model.',
  },
  {
    name: 'TopAI.tools',
    url: 'https://topai.tools/submit',
    category: 'AI Tools',
    priority: 'P0',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description: DESC_SHORT,
      tags: TAGS_AI,
      website: 'https://tork.network',
    },
    notes: 'AI tools ranking site. Free submission. Category: AI Security.',
  },

  // ── P1: Submit next week (10) ──
  {
    name: 'Hacker News',
    url: 'https://news.ycombinator.com/submitlink',
    category: 'Developer Tools',
    priority: 'P1',
    status: 'pending',
    template: {
      tagline: 'Show HN: Tork — AI governance middleware for autonomous agents',
      description:
        'Tork sits between AI agents and everything they touch. Real-time PII detection in ~20ms across 50+ patterns, policy enforcement for 79+ compliance frameworks, and cryptographic receipts. 11 SDKs, MCP server, free tier. Built because every agent we deployed was touching sensitive data with zero guardrails.',
      tags: ['show-hn', 'ai', 'security', 'governance', 'open-source'],
      website: 'https://tork.network',
    },
    notes:
      'Post as "Show HN: Tork — AI governance for autonomous agents". Keep it technical, zero marketing. Best time: weekday mornings US time.',
  },
  {
    name: 'Dev.to',
    url: 'https://dev.to/new',
    category: 'Developer Tools',
    priority: 'P1',
    status: 'pending',
    template: {
      tagline: 'How to add AI governance to your agent pipeline',
      description:
        'Technical tutorial showing how to integrate Tork governance middleware into an AI agent pipeline. Covers PII detection, policy enforcement, and compliance receipts with code examples in Python and JavaScript. Visit tork.network for docs.',
      tags: ['ai', 'security', 'governance', 'tutorial'],
      website: 'https://tork.network',
    },
    notes:
      'Publish as a technical article with code examples. Use frontmatter tags: ai, security, governance, mcp. Include SDK install commands.',
  },
  {
    name: 'Indie Hackers',
    url: 'https://www.indiehackers.com/new-product',
    category: 'SaaS',
    priority: 'P1',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description:
        'Tork is an AI governance platform providing PII detection, policy enforcement, and compliance receipts for autonomous agents. Freemium model with 5,000 free API calls/month. Built by indie founders in Sydney. Learn more at tork.network.',
      tags: TAGS_SAAS,
      website: 'https://tork.network',
    },
    notes: 'Add product listing + write a milestone post about the launch. Engage in community.',
  },
  {
    name: 'Startup Buffer',
    url: 'https://startupbuffer.com/submit',
    category: 'SaaS',
    priority: 'P1',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description: DESC_SHORT,
      tags: TAGS_SAAS,
      website: 'https://tork.network',
    },
    notes: 'Startup discovery platform. Free submission. Include logo and screenshot.',
  },
  {
    name: 'Launching Next',
    url: 'https://www.launchingnext.com/submit/',
    category: 'SaaS',
    priority: 'P1',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description: DESC_SHORT,
      tags: TAGS_SAAS,
      website: 'https://tork.network',
    },
    notes: 'Startup launch directory. Free tier available.',
  },
  {
    name: 'StartupBase',
    url: 'https://startupbase.io/submit',
    category: 'SaaS',
    priority: 'P1',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description: DESC_SHORT,
      tags: TAGS_SAAS,
      website: 'https://tork.network',
    },
    notes: 'Brazilian startup directory with international reach.',
  },
  {
    name: 'Crunchbase',
    url: 'https://www.crunchbase.com/add-new',
    category: 'SaaS',
    priority: 'P1',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description:
        'Tork Network is an AI governance platform that provides real-time PII detection, policy enforcement across 79+ compliance frameworks, and cryptographic compliance receipts for autonomous AI agents. Based in Sydney, Australia. Visit tork.network.',
      tags: TAGS_SAAS,
      website: 'https://tork.network',
    },
    notes:
      'Create company profile. Add founders, funding status (bootstrapped), HQ location (Sydney). Important for credibility.',
  },
  {
    name: 'AngelList / Wellfound',
    url: 'https://wellfound.com/company/new',
    category: 'SaaS',
    priority: 'P1',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description: DESC_SHORT,
      tags: TAGS_SAAS,
      website: 'https://tork.network',
    },
    notes: 'Create company profile. Add team, market (AI Security), and stage (Pre-seed / Bootstrapped).',
  },
  {
    name: 'GetApp',
    url: 'https://www.getapp.com/submit',
    category: 'SaaS',
    priority: 'P1',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description: DESC_SHORT,
      tags: TAGS_SAAS,
      website: 'https://tork.network',
    },
    notes: 'Gartner-owned software comparison. Category: AI & Machine Learning > AI Governance.',
  },
  {
    name: 'Capterra',
    url: 'https://www.capterra.com/vendors/sign-up',
    category: 'SaaS',
    priority: 'P1',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description: DESC_SHORT,
      tags: TAGS_SAAS,
      website: 'https://tork.network',
    },
    notes: 'Gartner-owned review site. Create vendor profile. Category: AI & Machine Learning.',
  },

  // ── P2: Submit this month (6) ──
  {
    name: 'Reddit — r/MachineLearning',
    url: 'https://www.reddit.com/r/MachineLearning/submit',
    category: 'AI Tools',
    priority: 'P2',
    status: 'pending',
    template: {
      tagline: '[P] Tork — AI governance middleware for autonomous agents',
      description:
        'Open-source governance layer for AI agents. PII detection in ~20ms, policy enforcement for 79+ frameworks, cryptographic compliance receipts. We built this because every agent we deployed touched sensitive data with zero guardrails. Details at tork.network.',
      tags: ['machine-learning', 'ai-safety', 'governance'],
      website: 'https://tork.network',
    },
    notes: 'Use [P] tag for project posts. Keep technical, no marketing. Engage with comments.',
  },
  {
    name: 'Reddit — r/artificial',
    url: 'https://www.reddit.com/r/artificial/submit',
    category: 'AI Tools',
    priority: 'P2',
    status: 'pending',
    template: {
      tagline: 'Tork: Governance middleware for AI agents',
      description:
        'Built a governance layer that sits between AI agents and the systems they interact with. Detects PII in ~20ms, enforces policies across 79+ compliance frameworks, generates cryptographic receipts. Free tier available at tork.network.',
      tags: ['ai', 'governance', 'safety'],
      website: 'https://tork.network',
    },
    notes: 'Discussion-oriented sub. Frame as educational, not promotional.',
  },
  {
    name: 'Reddit — r/SideProject',
    url: 'https://www.reddit.com/r/SideProject/submit',
    category: 'Developer Tools',
    priority: 'P2',
    status: 'pending',
    template: {
      tagline: 'Built an AI governance platform for autonomous agents',
      description:
        'After deploying several AI agents that touched sensitive data without guardrails, we built Tork — a governance middleware that detects PII, enforces compliance policies, and generates cryptographic receipts. Free tier at tork.network.',
      tags: ['side-project', 'ai', 'saas'],
      website: 'https://tork.network',
    },
    notes: 'Personal story angle works best. Share the journey, not just the product.',
  },
  {
    name: 'Reddit — r/startups',
    url: 'https://www.reddit.com/r/startups/submit',
    category: 'SaaS',
    priority: 'P2',
    status: 'pending',
    template: {
      tagline: 'Tork Network — AI governance platform',
      description:
        'We are building Tork, an AI governance platform for autonomous agents. PII detection, compliance enforcement, cryptographic receipts. Bootstrapped from Sydney. Free tier at tork.network.',
      tags: ['startup', 'ai', 'saas'],
      website: 'https://tork.network',
    },
    notes: 'Post in weekly share thread. Follow sub rules strictly — no direct promotion outside threads.',
  },
  {
    name: 'Slant',
    url: 'https://www.slant.co/suggest',
    category: 'Developer Tools',
    priority: 'P2',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description:
        'Tork is an AI governance platform that provides real-time PII detection, policy enforcement, and compliance receipts for autonomous agents. 11 SDKs, MCP server integration, free tier. Visit tork.network for documentation.',
      tags: TAGS_DEV,
      website: 'https://tork.network',
    },
    notes:
      'Add to relevant "What are the best..." questions about AI security, governance tools, MCP servers.',
  },
  {
    name: 'SourceForge',
    url: 'https://sourceforge.net/create/',
    category: 'Developer Tools',
    priority: 'P2',
    status: 'pending',
    template: {
      tagline: TAGLINE,
      description:
        'Tork is an AI governance platform providing PII detection in ~20ms, policy enforcement across 79+ compliance frameworks, and cryptographic compliance receipts. Available as API, MCP server, and 11 native SDKs. Free at tork.network.',
      tags: TAGS_DEV,
      website: 'https://tork.network',
    },
    notes: 'Create project listing. Category: Security > AI. Good for SEO backlink.',
  },
];

// ══════════════════════════════════════════════════════════════
//  STATUS PERSISTENCE
// ══════════════════════════════════════════════════════════════

type StatusOverrides = Record<string, DirectoryStatus>;

function loadStatusOverrides(): StatusOverrides {
  try {
    const data = fs.readFileSync(STATUS_FILE, 'utf-8');
    return JSON.parse(data) as StatusOverrides;
  } catch {
    return {};
  }
}

function saveStatusOverrides(overrides: StatusOverrides): void {
  fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
  fs.writeFileSync(STATUS_FILE, JSON.stringify(overrides, null, 2));
}

// ══════════════════════════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════════════════════════

/** Get all directories with persisted status overrides applied */
export function getDirectories(): DirectoryTemplate[] {
  const overrides = loadStatusOverrides();
  return DIRECTORY_TEMPLATES.map((d) => ({
    ...d,
    status: overrides[d.name] || d.status,
  }));
}

/** Get directories filtered by priority */
export function getDirectoriesByPriority(
  priority: DirectoryPriority,
): DirectoryTemplate[] {
  return getDirectories().filter((d) => d.priority === priority);
}

/** Get directories filtered by status */
export function getDirectoriesByStatus(
  status: DirectoryStatus,
): DirectoryTemplate[] {
  return getDirectories().filter((d) => d.status === status);
}

/** Mark a directory as submitted */
export function markDirectorySubmitted(name: string): boolean {
  const dir = DIRECTORY_TEMPLATES.find(
    (d) => d.name.toLowerCase() === name.toLowerCase(),
  );
  if (!dir) return false;

  const overrides = loadStatusOverrides();
  overrides[dir.name] = 'submitted';
  saveStatusOverrides(overrides);
  logger.info({ directory: dir.name }, 'Directory marked as submitted');
  return true;
}

/** Mark a directory as live */
export function markDirectoryLive(name: string): boolean {
  const dir = DIRECTORY_TEMPLATES.find(
    (d) => d.name.toLowerCase() === name.toLowerCase(),
  );
  if (!dir) return false;

  const overrides = loadStatusOverrides();
  overrides[dir.name] = 'live';
  saveStatusOverrides(overrides);
  logger.info({ directory: dir.name }, 'Directory marked as live');
  return true;
}

/** Format directory dashboard for WhatsApp */
export function formatDirectoryDashboard(): string {
  const dirs = getDirectories();
  const p0 = dirs.filter((d) => d.priority === 'P0');
  const p1 = dirs.filter((d) => d.priority === 'P1');
  const p2 = dirs.filter((d) => d.priority === 'P2');

  const formatGroup = (
    label: string,
    group: DirectoryTemplate[],
  ): string[] => {
    const live = group.filter((d) => d.status === 'live');
    const submitted = group.filter((d) => d.status === 'submitted');
    const pending = group.filter((d) => d.status === 'pending');

    return [
      `${label} (${group.length} total):`,
      live.length > 0
        ? `  Live (${live.length}): ${live.map((d) => d.name).join(', ')}`
        : '',
      submitted.length > 0
        ? `  Submitted (${submitted.length}): ${submitted.map((d) => d.name).join(', ')}`
        : '',
      pending.length > 0
        ? `  Pending (${pending.length}): ${pending.map((d) => d.name).join(', ')}`
        : '',
    ].filter(Boolean);
  };

  const totalPending = dirs.filter((d) => d.status === 'pending').length;
  const totalSubmitted = dirs.filter((d) => d.status === 'submitted').length;
  const totalLive = dirs.filter((d) => d.status === 'live').length;

  return [
    'Directory Submissions Dashboard',
    `Total: ${dirs.length} | Live: ${totalLive} | Submitted: ${totalSubmitted} | Pending: ${totalPending}`,
    '',
    ...formatGroup('P0 — Submit this week', p0),
    '',
    ...formatGroup('P1 — Submit next week', p1),
    '',
    ...formatGroup('P2 — Submit this month', p2),
  ].join('\n');
}

/** Get submission copy for a specific directory */
export function getSubmissionCopy(name: string): string | null {
  const dirs = getDirectories();
  const q = name.toLowerCase().trim();
  const dir =
    dirs.find((d) => d.name.toLowerCase() === q) ||
    dirs.find((d) => d.name.toLowerCase().includes(q));

  if (!dir) return null;

  return [
    `${dir.name} — Submission Copy`,
    `URL: ${dir.url}`,
    `Priority: ${dir.priority} | Category: ${dir.category} | Status: ${dir.status}`,
    '',
    `Tagline: ${dir.template.tagline}`,
    '',
    `Description:`,
    dir.template.description,
    '',
    `Tags: ${dir.template.tags.join(', ')}`,
    `Website: ${dir.template.website}`,
    '',
    `Notes: ${dir.notes}`,
  ].join('\n');
}
