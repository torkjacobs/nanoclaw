/**
 * Tork Marketing Engine (Skill 8)
 *
 * Host-level skill covering:
 *   A) Directory submissions — 30+ directories with pre-filled copy, status tracking
 *   B) Content generation + approval queue — Claude API per-platform drafts
 *   C) Auto-publishing — Dev.to first, placeholder for Twitter/LinkedIn/Hashnode
 *
 * Commands: @tork directories, @tork marketing, @tork submit [name],
 * @tork submit done [name], @tork submit next, @tork content [platform] [topic],
 * @tork refine [feedback], @tork approve [id], @tork queue, @tork published
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { STORE_DIR } from './config.js';
import { verifyContent, formatVerificationResult } from './tork-claims.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';
import {
  onArticlePublished,
  onDirectorySubmitted,
  onThreadPublished,
} from './tork-swarm.js';

// ══════════════════════════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════════════════════════

type DirectoryStatus = 'submitted' | 'pending' | 'live' | 'deferred';

interface DirectoryEntry {
  name: string;
  url: string;
  status: DirectoryStatus;
  type?: 'product' | 'book';
  fields: Record<string, string>;
}

type ContentPlatform =
  | 'linkedin'
  | 'twitter'
  | 'thread'
  | 'devto'
  | 'reddit'
  | 'hackernews'
  | 'blog'
  | 'email'
  | 'comment'
  | 'guestpost'
  | 'answer'
  | 'bookpromo'
  | 'bookdrip'
  | 'hashnode';

type ContentStatus = 'draft' | 'approved' | 'published' | 'rejected';

interface ContentItem {
  id: string;
  platform: ContentPlatform;
  topic: string;
  content: string;
  status: ContentStatus;
  createdAt: Date;
  publishedUrl?: string;
}

// ══════════════════════════════════════════════════════════════
//  CONSTANTS — Tork Copy
// ══════════════════════════════════════════════════════════════

const STATUS_FILE = path.join(STORE_DIR, 'marketing-status.json');
const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL_FAST = 'claude-haiku-4-5-20251001';
const MODEL_QUALITY = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;

function getModelForPlatform(platform: string): string {
  const fastPlatforms = ['twitter', 'comment', 'answer'];
  if (fastPlatforms.includes(platform)) return MODEL_FAST;
  return MODEL_QUALITY;
}

const TORK_NAME = 'Tork Network';
const TORK_URL = 'https://tork.network';
const TORK_EMAIL = 'hello@tork.network';
const TORK_TAGLINE =
  'AI governance for autonomous agents \u2014 PII detection, policy enforcement & compliance receipts';
const TORK_SHORT_DESC =
  'Tork is the governance layer between AI agents and everything they touch. Real-time PII detection in ~20ms, 79+ compliance frameworks, 11 SDKs.';
const TORK_LONG_DESC =
  'Tork provides enterprise-grade AI governance for autonomous agents. Features include real-time PII detection and redaction (~20ms, 50+ patterns, 12 regional variants), policy enforcement across 79+ compliance frameworks (SOC 2, GDPR, HIPAA, EU AI Act), cryptographic compliance receipts with HMAC signatures, and the TORKING-X measurement standard. Available as API, MCP server, and 11 native SDKs. Free tier: 5,000 API calls/month.';
const TORK_PRICING =
  'Freemium \u2014 Free (5K calls/mo), Starter $29/yr, Pro $99/yr, Business $399/yr, Enterprise from $2,500/mo';

// ══════════════════════════════════════════════════════════════
//  MODULE A: DIRECTORY TEMPLATES
// ══════════════════════════════════════════════════════════════

const BOOK_FIELDS: Record<string, string> = {
  'Book title': 'The Agent Crisis',
  Authors: 'Yusuf Jacobs & Zunaid Mohidin',
  ISBN: '978-1-7644797-2-1',
  Pages: '94',
  Price: 'Free',
  Format: 'PDF ebook',
  URL: 'https://tork.network',
  Category: 'AI / Technology / Business',
  'Description short':
    'Why AI agents need governance \u2014 a practical guide to PII detection, compliance receipts, and policy enforcement for autonomous AI systems. Free 94-page ebook.',
  'Description long':
    'The Agent Crisis is a 94-page practical guide to AI agent governance. It covers why autonomous AI agents pose unique security and compliance risks, how PII detection and redaction work in real-time, cryptographic compliance receipts for audit trails, the TORKING-X measurement standard for governance quality, and implementation patterns across SOC 2, GDPR, HIPAA, PCI DSS, POPIA, CCPA, and the EU AI Act. Co-authored by Yusuf Jacobs and Zunaid Mohidin, founders of Tork Network. Available as a free PDF download at tork.network.',
};

const DIRECTORY_TEMPLATES: DirectoryEntry[] = [
  // ── Live ──
  {
    name: 'mcp.so',
    url: 'https://mcp.so',
    status: 'live',
    fields: { notes: 'Listed as MCP server' },
  },
  {
    name: 'cursor.directory',
    url: 'https://cursor.directory',
    status: 'live',
    fields: { notes: 'Listed in MCP directory' },
  },
  {
    name: 'awesome-mcp-servers',
    url: 'https://github.com/punkpeye/awesome-mcp-servers',
    status: 'live',
    fields: { notes: 'GitHub awesome list \u2014 PR merged' },
  },

  // ── Submitted ──
  {
    name: 'glama.ai',
    url: 'https://glama.ai',
    status: 'submitted',
    fields: { notes: 'MCP marketplace submission' },
  },
  {
    name: 'PulseMCP',
    url: 'https://pulsemcp.com',
    status: 'submitted',
    fields: { notes: 'MCP directory submission' },
  },
  {
    name: 'awesome-openclaw-skills',
    url: 'https://github.com/nicobailey/awesome-openclaw-skills',
    status: 'submitted',
    fields: { notes: 'PR submitted' },
  },
  {
    name: 'AlternativeTo',
    url: 'https://alternativeto.net',
    status: 'submitted',
    fields: { notes: 'Product page submitted' },
  },
  {
    name: 'MCPMarket',
    url: 'https://mcpmarket.com',
    status: 'submitted',
    fields: { notes: 'MCP marketplace listing' },
  },
  {
    name: 'DevHunt',
    url: 'https://devhunt.org',
    status: 'submitted',
    fields: { notes: 'Developer tools listing' },
  },
  {
    name: 'SaaSHub',
    url: 'https://www.saashub.com',
    status: 'submitted',
    fields: { notes: 'SaaS directory listing' },
  },

  // ── Pending ──
  {
    name: 'BetaList',
    url: 'https://betalist.com/submit',
    status: 'pending',
    fields: {
      'Startup name': TORK_NAME,
      URL: TORK_URL,
      Tagline: TORK_TAGLINE,
      Description: TORK_LONG_DESC,
      Email: TORK_EMAIL,
    },
  },
  {
    name: 'Futurepedia',
    url: 'https://www.futurepedia.io',
    status: 'pending',
    fields: {
      'Tool name': TORK_NAME,
      URL: TORK_URL,
      Category: 'AI Security',
      Description: TORK_LONG_DESC,
      Pricing: TORK_PRICING,
    },
  },
  {
    name: 'StackShare',
    url: 'https://stackshare.io',
    status: 'pending',
    fields: {
      'Tool name': TORK_NAME,
      Description: TORK_SHORT_DESC,
      Category: 'Developer Tools',
      Features:
        'PII detection (~20ms), Policy enforcement (79+ frameworks), Compliance receipts (HMAC), MCP server, 11 SDKs',
    },
  },
  {
    name: 'G2',
    url: 'https://www.g2.com',
    status: 'pending',
    fields: {
      'Product name': TORK_NAME,
      Description: TORK_LONG_DESC,
      Category: 'AI Governance',
      Pricing: TORK_PRICING,
    },
  },
  {
    name: 'Product Hunt',
    url: 'https://www.producthunt.com',
    status: 'pending',
    fields: {
      Name: TORK_NAME,
      Tagline: TORK_TAGLINE,
      Description: TORK_LONG_DESC,
      'First comment':
        "We built Tork because every AI agent we deployed was touching sensitive data with zero guardrails. Tork sits between your agent and everything it touches \u2014 detecting PII in ~20ms, enforcing policies across 79+ compliance frameworks, and generating cryptographic receipts for every interaction. Free tier: 5K calls/month. We'd love your feedback.",
      'Maker comment':
        "Hey PH! I'm Yusuf, founder of Tork. We're solving the governance gap for autonomous AI agents. Happy to answer any questions about our approach to PII detection, compliance receipts, or the TORKING-X measurement standard.",
    },
  },
  {
    name: "There's An AI For That",
    url: 'https://theresanaiforthat.com/submit',
    status: 'pending',
    fields: {
      Name: TORK_NAME,
      URL: TORK_URL,
      Description: TORK_SHORT_DESC,
      Category: 'AI Security',
      Pricing: TORK_PRICING,
      Email: TORK_EMAIL,
    },
  },
  {
    name: 'The Rundown Supertools',
    url: 'https://supertools.therundown.ai/submit',
    status: 'pending',
    fields: {
      Name: TORK_NAME,
      URL: TORK_URL,
      Description: TORK_SHORT_DESC,
    },
  },
  {
    name: 'Altern.ai',
    url: 'https://altern.ai',
    status: 'pending',
    fields: {
      Name: TORK_NAME,
      URL: TORK_URL,
      Description: TORK_SHORT_DESC,
      Category: 'AI Governance',
    },
  },
  {
    name: 'AI Tools Directory',
    url: 'https://aitoolsdirectory.com',
    status: 'pending',
    fields: {
      Name: TORK_NAME,
      URL: TORK_URL,
      Description: TORK_LONG_DESC,
      Category: 'AI Security',
      Pricing: TORK_PRICING,
      Email: TORK_EMAIL,
    },
  },
  {
    name: 'OpenTools.ai',
    url: 'https://opentools.ai',
    status: 'pending',
    fields: {
      Name: TORK_NAME,
      URL: TORK_URL,
      Description: TORK_SHORT_DESC,
      Category: 'AI Governance',
    },
  },
  {
    name: 'Ainave',
    url: 'https://www.ainave.com',
    status: 'pending',
    fields: {
      Name: TORK_NAME,
      URL: TORK_URL,
      Description: TORK_SHORT_DESC,
      Category: 'AI Security',
    },
  },
  {
    name: 'TopAI.tools',
    url: 'https://topai.tools',
    status: 'pending',
    fields: {
      Name: TORK_NAME,
      URL: TORK_URL,
      Description: TORK_SHORT_DESC,
      Category: 'AI Security',
    },
  },
  {
    name: 'AI Tools Club',
    url: 'https://www.aitoolsclub.com',
    status: 'pending',
    fields: {
      Name: TORK_NAME,
      URL: TORK_URL,
      Description: TORK_SHORT_DESC,
      Category: 'AI Governance',
    },
  },
  {
    name: 'Productivity Directory',
    url: 'https://productivity.directory',
    status: 'pending',
    fields: {
      Name: TORK_NAME,
      URL: TORK_URL,
      Description: TORK_SHORT_DESC,
      Category: 'Developer Tools',
    },
  },
  {
    name: 'GPTs Hunter',
    url: 'https://www.gptshunter.com',
    status: 'pending',
    fields: {
      Name: TORK_NAME,
      URL: TORK_URL,
      Description: TORK_SHORT_DESC,
      Category: 'AI Governance',
    },
  },
  {
    name: 'AI Agent Store',
    url: 'https://aiagentstore.ai',
    status: 'pending',
    fields: {
      Name: TORK_NAME,
      URL: TORK_URL,
      Description: TORK_SHORT_DESC,
      Category: 'AI Governance',
      Pricing: TORK_PRICING,
    },
  },
  {
    name: 'best-of-ai/ai-directories',
    url: 'https://github.com/best-of-ai/ai-directories',
    status: 'pending',
    fields: {
      'PR description':
        'Add Tork Network (https://tork.network) \u2014 AI governance platform providing PII detection, policy enforcement across 79+ frameworks, and compliance receipts for autonomous agents. Available as API, MCP server, and 11 native SDKs.',
    },
  },
  {
    name: 'Capterra',
    url: 'https://www.capterra.com',
    status: 'pending',
    fields: {
      'Product name': TORK_NAME,
      Description: TORK_LONG_DESC,
      Category: 'AI Governance',
      Pricing: TORK_PRICING,
    },
  },
  {
    name: 'Toolify.ai',
    url: 'https://www.toolify.ai',
    status: 'pending',
    fields: {
      Name: TORK_NAME,
      URL: TORK_URL,
      Description: TORK_SHORT_DESC,
      Category: 'AI Security',
      Pricing: TORK_PRICING,
    },
  },
  {
    name: 'SideProjectors',
    url: 'https://www.sideprojectors.com',
    status: 'pending',
    fields: {
      Name: TORK_NAME,
      URL: TORK_URL,
      Tagline: TORK_TAGLINE,
      Description: TORK_LONG_DESC,
      Category: 'Developer Tools',
      Pricing: TORK_PRICING,
      Email: TORK_EMAIL,
    },
  },

  // ── Book Directories ──
  {
    name: 'Free-Ebooks.net',
    url: 'https://www.free-ebooks.net/submit',
    status: 'pending',
    type: 'book',
    fields: { ...BOOK_FIELDS, notes: 'Free ebook directory \u2014 submit PDF' },
  },
  {
    name: 'E-Books Directory',
    url: 'https://www.e-booksdirectory.com/submit.php',
    status: 'pending',
    type: 'book',
    fields: { ...BOOK_FIELDS, notes: 'Categorized free ebook directory' },
  },
  {
    name: 'Smashwords',
    url: 'https://www.smashwords.com/',
    status: 'pending',
    type: 'book',
    fields: {
      ...BOOK_FIELDS,
      notes: 'Major ebook distribution \u2014 free option',
    },
  },
  {
    name: 'Google Play Books',
    url: 'https://play.google.com/books/publish',
    status: 'pending',
    type: 'book',
    fields: { ...BOOK_FIELDS, notes: 'Google Play partner program' },
  },
  {
    name: 'Apple Books',
    url: 'https://authors.apple.com/',
    status: 'pending',
    type: 'book',
    fields: { ...BOOK_FIELDS, notes: 'Apple Books for Authors' },
  },
  {
    name: 'Leanpub',
    url: 'https://leanpub.com/',
    status: 'pending',
    type: 'book',
    fields: {
      ...BOOK_FIELDS,
      notes: 'Tech ebook platform \u2014 pay what you want',
    },
  },
  {
    name: 'Gumroad',
    url: 'https://gumroad.com/',
    status: 'pending',
    type: 'book',
    fields: {
      ...BOOK_FIELDS,
      notes: 'Digital products \u2014 free ebook listing',
    },
  },
  {
    name: 'Issuu',
    url: 'https://issuu.com/',
    status: 'pending',
    type: 'book',
    fields: { ...BOOK_FIELDS, notes: 'Digital publishing platform' },
  },
  {
    name: 'SlideShare',
    url: 'https://www.slideshare.net/',
    status: 'pending',
    type: 'book',
    fields: {
      ...BOOK_FIELDS,
      notes: 'Upload as presentation/PDF \u2014 high DA backlink',
    },
  },
  {
    name: 'Amazon KDP',
    url: 'https://kdp.amazon.com/',
    status: 'pending',
    type: 'book',
    fields: {
      ...BOOK_FIELDS,
      notes: 'Kindle Direct Publishing \u2014 free ebook listing',
    },
  },
  {
    name: 'Scribd',
    url: 'https://www.scribd.com/',
    status: 'pending',
    type: 'book',
    fields: {
      ...BOOK_FIELDS,
      notes: 'Document sharing platform \u2014 high DA',
    },
  },
  {
    name: 'ManyBooks',
    url: 'https://manybooks.net/',
    status: 'pending',
    type: 'book',
    fields: { ...BOOK_FIELDS, notes: 'Free ebook library' },
  },
  {
    name: 'Goodreads',
    url: 'https://www.goodreads.com/author/program',
    status: 'pending',
    type: 'book',
    fields: {
      ...BOOK_FIELDS,
      notes: 'Author program \u2014 list book, get reviews',
    },
  },
  {
    name: 'Open Library',
    url: 'https://openlibrary.org/',
    status: 'pending',
    type: 'book',
    fields: { ...BOOK_FIELDS, notes: 'Open library \u2014 add book listing' },
  },
  {
    name: 'ResearchGate',
    url: 'https://www.researchgate.net/',
    status: 'pending',
    type: 'book',
    fields: {
      ...BOOK_FIELDS,
      notes:
        'Academic platform \u2014 upload as publication. Good for AI governance credibility.',
    },
  },
];

// ══════════════════════════════════════════════════════════════
//  MODULE B: CONTENT SYSTEM PROMPTS
// ══════════════════════════════════════════════════════════════

const SHARED_CONTEXT = `You are a content writer for Tork Network, an AI governance platform. Key facts: Real-time PII detection in ~20ms with 50+ patterns and 12 regional variants. Policy enforcement across 79+ compliance frameworks (SOC 2, GDPR, HIPAA, PCI DSS, POPIA, CCPA, EU AI Act, ISO 27001, NIST AI RMF). Cryptographic compliance receipts with HMAC signatures. TORKING-X measurement standard. 11 native SDKs (Python, JavaScript, Go, Ruby, Rust, Java, PHP, .NET, Swift, Elixir, Kotlin). Multi-protocol: MCP, A2A, ACP, AG-UI. Free tier: 5,000 API calls/month. Founded by Yusuf Jacobs, Co-Founded by Zunaid Mohidin, based in Sydney Australia. Book: 'The Agent Crisis' available free at tork.network. Brand voice: authoritative but approachable, technical but accessible, never salesy. CRITICAL SEO RULE: Every piece of content MUST include at least one natural, contextual link to tork.network (or tork.network/docs, tork.network/pricing, tork.network/demo as appropriate). This is for SEO backlinks. Make the link feel organic, not forced. ACCURACY RULE: Never fabricate statistics. Only use these verified numbers: PII detection ~20ms, 50+ PII patterns, 12 regional variants, 79+ compliance frameworks, 11 SDKs, 116 adapters, 3784+ tests, 5000 free API calls/month, 717 req/s load test, 100/100 security score, book is 94 pages. Do not invent percentages or statistics that aren't in this list. If you want to cite a statistic, use one from this list or phrase it as a general observation without a specific number.`;

const PLATFORM_PROMPTS: Record<string, string> = {
  linkedin: `${SHARED_CONTEXT}

Write a professional thought leadership post, 1200-1500 chars. Hook in first line. Use line breaks for readability. End with 3-5 hashtags (#AIGovernance #AIAgents #Compliance #Tork etc). Include a call-to-action with tork.network link.`,

  twitter: `${SHARED_CONTEXT}

Write a single punchy tweet under 280 chars. Conversational tone. No hashtags unless space permits. Include tork.network link if space allows.`,

  devto: `${SHARED_CONTEXT}

Write a complete technical article in markdown, 800-1500 words. Include frontmatter block with title, description (SEO meta), tags (max 4: ai, security, governance, mcp). Tutorial-style with code examples showing Tork SDK usage. Include at least 2 links to tork.network pages. Code examples should show pip install tork or npm install @tork/sdk patterns.`,

  reddit: `${SHARED_CONTEXT}

Write an educational post, 200-400 words. Conversational and helpful. Provide value first \u2014 never lead with product. Mention Tork naturally as something you built/use. Subreddits: r/MachineLearning, r/LocalLLaMA, r/Python, r/langchain.`,

  hackernews: `${SHARED_CONTEXT}

Write a Show HN post. Format: 'Show HN: Tork \u2013 [subtitle]' then 3-5 paragraphs. 100% technical, zero marketing speak. Focus on what's architecturally novel. Link to tork.network.`,

  blog: `${SHARED_CONTEXT}

Write a full markdown blog post for tork.network/blog, 600-1200 words. SEO title, meta description line at top. Headers with ##. Professional tone. Include internal links to /docs, /pricing, /demo.`,

  email: `${SHARED_CONTEXT}

Write a professional outreach email. Personalized to the recipient context provided. Concise \u2014 under 200 words. Clear ask. Mention specific relevance to their audience. Include tork.network link.`,

  comment: `${SHARED_CONTEXT}

Write a thoughtful, value-adding comment for an online discussion about AI governance, security, or agents. 50-150 words. Add genuine insight. Only mention Tork if directly relevant and natural. Never spammy.`,

  guestpost: `${SHARED_CONTEXT}

Write a guest post pitch email to a technical publication editor. Include: who you are (CEO of Tork Network), proposed article topic, why their audience cares, your credentials, and a 3-sentence article outline. Under 200 words.`,

  answer: `${SHARED_CONTEXT}

Write a helpful Stack Overflow or Quora answer about AI governance, MCP security, or PII detection. Lead with the solution. Mention Tork only if directly solving the question. Include a tork.network/docs link as a reference.`,

  thread: `${SHARED_CONTEXT}

Write a Twitter/X thread of 5-7 tweets. Format rules:
- First tweet is the HOOK — must grab attention, end with 🧵
- Each tweet MUST be under 280 characters
- Number each tweet: 1/, 2/, 3/, etc.
- Separate each tweet with ---TWEET--- on its own line
- Last tweet is the CTA — include tork.network link
- Topics should flow as a narrative story
- Use concrete numbers and examples, not vague claims
- No hashtags except optionally on the last tweet
- Tone: authoritative founder sharing real experience, not corporate marketing`,

  hashnode: `${SHARED_CONTEXT}

Write a complete technical article in markdown, 800-1500 words. Tutorial-style with code examples showing Tork SDK usage. Include at least 2 links to tork.network pages. Code examples should show pip install tork or npm install @tork/sdk patterns. No frontmatter needed \u2014 title will be extracted from the first # heading.`,

  bookpromo: `${SHARED_CONTEXT}

Write promotional content for "The Agent Crisis" by Yusuf Jacobs and Zunaid Mohidin. The book is 94 pages, available as a free ebook download at tork.network. ISBN: 978-1-7644797-2-1. It covers: why AI agents need governance, compliance frameworks (SOC 2, GDPR, HIPAA, EU AI Act, POPIA), PII detection architecture, compliance receipts, the TORKING-X measurement standard, and practical implementation patterns. The book companion platform is tork.network where readers can try the governance API described in the book. Tone: proud but not pushy, educational, emphasise it's FREE. Always include the download link tork.network.`,

  bookdrip: `${SHARED_CONTEXT}

Write an email for a book download drip sequence for "The Agent Crisis". The reader downloaded the free ebook from tork.network. The sequence has 4 emails: Day 0 (thank you + what to read first), Day 3 (chapter highlight on compliance receipts), Day 7 (practical guide — add governance in 5 minutes), Day 14 (free trial CTA — 5,000 API calls). Write the specific email number requested. Professional but warm tone. Short — under 200 words. Include tork.network link.`,
};

// ══════════════════════════════════════════════════════════════
//  CONTENT QUEUE + ID MANAGEMENT
// ══════════════════════════════════════════════════════════════

const contentQueue: ContentItem[] = [];
const idCounters: Record<string, number> = {};

/** Last generated draft ID — used by @tork refine and @tork approve (no id) */
let lastDraftId: string | null = null;

const PLATFORM_PREFIX: Record<string, string> = {
  linkedin: 'L',
  twitter: 'T',
  devto: 'D',
  reddit: 'R',
  hackernews: 'H',
  blog: 'B',
  email: 'E',
  comment: 'C',
  guestpost: 'G',
  answer: 'A',
  thread: 'TH',
  bookpromo: 'BP',
  bookdrip: 'BD',
  hashnode: 'HN',
};

function nextId(platform: string): string {
  const prefix = PLATFORM_PREFIX[platform] || 'X';
  idCounters[prefix] = (idCounters[prefix] || 0) + 1;
  return `${prefix}-${String(idCounters[prefix]).padStart(3, '0')}`;
}

function findItem(id: string): ContentItem | undefined {
  return contentQueue.find((i) => i.id === id);
}

/** Get the content of the last draft — used by @tork verify */
export function getLastDraftContent(): string | null {
  if (!lastDraftId) return null;
  const item = findItem(lastDraftId);
  return item?.content ?? null;
}

// ══════════════════════════════════════════════════════════════
//  PATTERNS
// ══════════════════════════════════════════════════════════════

const MARKETING_PATTERN = /^@tork\s+(directories|marketing)\s*$/i;
const SUBMIT_DONE_PATTERN = /^@tork\s+submit\s+done\s+(.+)/is;
const SUBMIT_NEXT_PATTERN = /^@tork\s+submit\s+next\s*$/i;
const SUBMIT_NEXT_BOOK_PATTERN = /^@tork\s+submit\s+next\s+book\s*$/i;
const SUBMIT_PATTERN = /^@tork\s+submit\s+(.+)/is;
const CONTENT_PATTERN = /^@tork\s+content\s+(\w+)(?:\s+([\s\S]+))?\s*$/i;
const REFINE_PATTERN = /^@tork\s+refine\s+([\s\S]+)/i;
const APPROVE_PATTERN = /^@tork\s+approve(?:\s+(\S+))?\s*$/i;
const FORCE_APPROVE_PATTERN = /^@tork\s+approve\s+force\s*$/i;
const LINKEDIN_APPROVE_PATTERN = /^@tork\s+approve\s+linkedin\s*$/i;
const QUEUE_PATTERN = /^@tork\s+queue\s*$/i;
const PUBLISHED_PATTERN = /^@tork\s+published\s*$/i;

// ══════════════════════════════════════════════════════════════
//  DIRECTORY STATUS PERSISTENCE
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

function getDirectories(): DirectoryEntry[] {
  const overrides = loadStatusOverrides();
  return DIRECTORY_TEMPLATES.map((d) => ({
    ...d,
    type: d.type || 'product',
    status: overrides[d.name] || d.status,
  }));
}

function markSubmitted(name: string): void {
  const overrides = loadStatusOverrides();
  overrides[name] = 'submitted';
  saveStatusOverrides(overrides);
}

// ══════════════════════════════════════════════════════════════
//  FUZZY MATCH
// ══════════════════════════════════════════════════════════════

function fuzzyMatch(
  query: string,
  dirs: DirectoryEntry[],
): DirectoryEntry | null {
  const q = query.toLowerCase().trim();
  const exact = dirs.find((d) => d.name.toLowerCase() === q);
  if (exact) return exact;
  const prefix = dirs.find((d) => d.name.toLowerCase().startsWith(q));
  if (prefix) return prefix;
  const includes = dirs.find((d) => d.name.toLowerCase().includes(q));
  if (includes) return includes;
  const reverse = dirs.find((d) => q.includes(d.name.toLowerCase()));
  if (reverse) return reverse;
  return null;
}

// ══════════════════════════════════════════════════════════════
//  API KEYS
// ══════════════════════════════════════════════════════════════

function getAnthropicKey(): string | null {
  const env = readEnvFile(['ANTHROPIC_API_KEY']);
  return env.ANTHROPIC_API_KEY || null;
}

function getDevtoKey(): string | null {
  const fromEnv = process.env.DEVTO_API_KEY;
  if (fromEnv && fromEnv !== 'MISSING') return fromEnv;
  const env = readEnvFile(['DEVTO_API_KEY']);
  const val = env.DEVTO_API_KEY || null;
  if (val === 'MISSING') return null;
  return val;
}

// ══════════════════════════════════════════════════════════════
//  CLAUDE API
// ══════════════════════════════════════════════════════════════

async function callClaudeAPI(
  systemPrompt: string,
  userMessage: string,
  model?: string,
): Promise<string> {
  const apiKey = getAnthropicKey();
  if (!apiKey) throw new Error('No ANTHROPIC_API_KEY found in .env');

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model: model || MODEL_QUALITY,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
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
  if (!textBlock?.text)
    throw new Error('No text content in Claude API response');
  return textBlock.text;
}

// ══════════════════════════════════════════════════════════════
//  MODULE C: PUBLISHERS
// ══════════════════════════════════════════════════════════════

/** Extract title and tags from Dev.to markdown frontmatter or first heading */
function parseDevtoContent(markdown: string): {
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

  if (!title) title = 'Tork Network \u2014 AI Governance';

  return { title, tags, body };
}

async function publishToDevto(item: ContentItem): Promise<string> {
  const apiKey = getDevtoKey();
  if (!apiKey) {
    return '\u{1F4CB} No API key for Dev.to. Copy the content above and paste manually. Add DEVTO_API_KEY to .env to enable auto-publish.';
  }

  const { title, tags, body } = parseDevtoContent(item.content);

  try {
    const response = await fetch('https://dev.to/api/articles', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        article: {
          title,
          body_markdown: body,
          published: true,
          tags,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return `\u274C Dev.to publish failed: ${response.status} ${errBody}. Content saved \u2014 copy and paste manually.`;
    }

    const data = (await response.json()) as { url?: string };
    const url = data.url || '';
    item.status = 'published';
    item.publishedUrl = url;

    // Swarm: auto-draft promo tweet for the published article
    if (url) {
      onArticlePublished(title, url).catch((err) =>
        logger.error({ err }, 'Swarm onArticlePublished failed'),
      );
    }

    return `\u2705 Published to Dev.to!\n\u{1F517} ${url}\n\u{1F4CA} Tracked as ${item.id}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `\u274C Dev.to publish failed: ${msg}. Content saved \u2014 copy and paste manually.`;
  }
}

function getHashnodeConfig(): { token: string; publicationId: string } | null {
  const env = readEnvFile(['HASHNODE_TOKEN', 'HASHNODE_PUBLICATION_ID']);
  const token = env.HASHNODE_TOKEN;
  const publicationId = env.HASHNODE_PUBLICATION_ID;
  if (
    !token ||
    !publicationId ||
    token === 'MISSING' ||
    publicationId === 'MISSING'
  )
    return null;
  return { token, publicationId };
}

async function publishToHashnode(item: ContentItem): Promise<string> {
  const config = getHashnodeConfig();
  if (!config) {
    return '\u{1F4CB} No API keys for Hashnode. Copy the content above and paste manually. Add HASHNODE_TOKEN and HASHNODE_PUBLICATION_ID to .env to enable auto-publish.';
  }

  const { title, body } = parseDevtoContent(item.content);

  const mutation = `mutation PublishPost($input: PublishPostInput!) { publishPost(input: $input) { post { id url slug } } }`;
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
      return `\u274C Hashnode publish failed: ${response.status} ${errBody}. Content saved \u2014 copy and paste manually.`;
    }

    const data = (await response.json()) as {
      data?: { publishPost?: { post?: { url?: string } } };
      errors?: { message: string }[];
    };

    if (data.errors?.length) {
      return `\u274C Hashnode publish failed: ${data.errors[0].message}. Content saved \u2014 copy and paste manually.`;
    }

    const url = data.data?.publishPost?.post?.url || '';
    item.status = 'published';
    item.publishedUrl = url;

    return `\u2705 Published to Hashnode!\n\u{1F517} ${url}\n\u{1F4CA} Tracked as ${item.id}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `\u274C Hashnode publish failed: ${msg}. Content saved \u2014 copy and paste manually.`;
  }
}

async function publishToAllArticlePlatforms(
  item: ContentItem,
): Promise<string> {
  const devtoResult = await publishToDevto(item);
  const results = [devtoResult];

  const hashnodeConfig = getHashnodeConfig();
  if (hashnodeConfig) {
    // Clone item for Hashnode with its own ID
    const hnItem: ContentItem = {
      ...item,
      id: nextId('hashnode'),
      platform: 'hashnode' as ContentPlatform,
      status: 'approved',
    };
    contentQueue.push(hnItem);
    const hnResult = await publishToHashnode(hnItem);
    results.push('', hnResult);
  }

  return results.join('\n');
}

function getTwitterCredentials(): {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessSecret: string;
} | null {
  const env = readEnvFile([
    'TWITTER_API_KEY',
    'TWITTER_API_SECRET',
    'TWITTER_ACCESS_TOKEN',
    'TWITTER_ACCESS_SECRET',
  ]);
  const consumerKey = env.TWITTER_API_KEY;
  const consumerSecret = env.TWITTER_API_SECRET;
  const accessToken = env.TWITTER_ACCESS_TOKEN;
  const accessSecret = env.TWITTER_ACCESS_SECRET;
  if (!consumerKey || !consumerSecret || !accessToken || !accessSecret)
    return null;
  return { consumerKey, consumerSecret, accessToken, accessSecret };
}

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

async function publishToTwitter(item: ContentItem): Promise<string> {
  const creds = getTwitterCredentials();
  if (!creds) {
    return '\u{1F4CB} Missing Twitter API keys in .env. Add TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET.';
  }

  const result = await postTweet(creds, item.content);
  if (!result.ok) {
    return `\u274C X publish failed: ${result.error}. Content saved \u2014 copy and paste manually.`;
  }

  const tweetUrl = result.id
    ? `https://x.com/yusufjacobsAI/status/${result.id}`
    : '';
  item.status = 'published';
  item.publishedUrl = tweetUrl;
  return `\u2705 Published to X!\n\u{1F517} ${tweetUrl}\n\u{1F4CA} Tracked as ${item.id}`;
}

async function publishThread(item: ContentItem): Promise<string> {
  const creds = getTwitterCredentials();
  if (!creds) {
    return '\u{1F4CB} Missing Twitter API keys in .env. Add TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET.';
  }

  const tweets = item.content
    .split('---TWEET---')
    .map((t) => t.trim())
    .filter(Boolean);

  if (tweets.length === 0) {
    return '\u274C No tweets found in thread content. Expected ---TWEET--- separators.';
  }

  const tweetIds: string[] = [];
  let previousId: string | undefined;

  for (let i = 0; i < tweets.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500));

    const result = await postTweet(creds, tweets[i], previousId);
    if (!result.ok) {
      return `\u274C X thread publish failed at tweet ${i + 1}: ${result.error}. ${i} tweet${i !== 1 ? 's' : ''} were posted. Content saved.`;
    }
    tweetIds.push(result.id);
    previousId = result.id;
  }

  const threadUrl = tweetIds[0]
    ? `https://x.com/yusufjacobsAI/status/${tweetIds[0]}`
    : '';
  item.status = 'published';
  item.publishedUrl = threadUrl;

  // Swarm: auto-draft LinkedIn cross-promo
  if (threadUrl) {
    onThreadPublished(threadUrl, tweets.length).catch((err) =>
      logger.error({ err }, 'Swarm onThreadPublished failed'),
    );
  }

  return `\u2705 Thread published to X! (${tweets.length} tweets)\n\u{1F517} ${threadUrl}\n\u{1F4CA} Tracked as ${item.id}`;
}

function getLinkedInCredentials(): {
  accessToken: string;
  personId: string;
} | null {
  const env = readEnvFile(['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_PERSON_ID']);
  const accessToken = env.LINKEDIN_ACCESS_TOKEN;
  const personId = env.LINKEDIN_PERSON_ID;
  if (
    !accessToken ||
    !personId ||
    accessToken === 'MISSING' ||
    personId === 'MISSING'
  )
    return null;
  return { accessToken, personId };
}

async function publishToLinkedIn(item: ContentItem): Promise<string> {
  const creds = getLinkedInCredentials();
  if (!creds) {
    return '\u{1F4CB} No LinkedIn credentials. Add LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_ID to .env. Run: node scripts/linkedin-oauth.js';
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
        commentary: item.content,
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return `\u274C LinkedIn publish failed: ${response.status} ${errBody}. Content saved \u2014 copy and paste manually.`;
    }

    const postUrn = response.headers.get('x-restli-id') || '';
    const postUrl = postUrn
      ? `https://www.linkedin.com/feed/update/${postUrn}`
      : '';
    item.status = 'published';
    item.publishedUrl = postUrl;

    return `\u2705 Published to LinkedIn!\n\u{1F517} ${postUrl}\n\u{1F4CA} Tracked as ${item.id}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `\u274C LinkedIn publish failed: ${msg}. Content saved \u2014 copy and paste manually.`;
  }
}

function placeholderPublisher(platform: string, envVarName: string): string {
  const key = readEnvFile([envVarName])[envVarName] || process.env[envVarName];
  if (key) {
    return `\u2705 ${platform} API key found but auto-publish is not yet implemented. Copy the content above and paste manually.`;
  }
  return `\u{1F4CB} No API key for ${platform}. Copy the content above and paste manually. Add ${envVarName} to .env to enable auto-publish.`;
}

async function publishItem(item: ContentItem): Promise<string> {
  switch (item.platform) {
    case 'devto':
      return publishToAllArticlePlatforms(item);
    case 'twitter':
      return publishToTwitter(item);
    case 'thread':
      return publishThread(item);
    case 'linkedin':
      return publishToLinkedIn(item);
    case 'blog':
    case 'hashnode':
      return publishToHashnode(item);
    default: {
      item.status = 'approved';
      return `\u{1F4CB} No auto-publisher for ${item.platform}. Copy the content above and post manually.`;
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  COMMAND DETECTION
// ══════════════════════════════════════════════════════════════

export function isMarketingRequest(content: string): boolean {
  const text = content.trim();
  return (
    MARKETING_PATTERN.test(text) ||
    SUBMIT_DONE_PATTERN.test(text) ||
    SUBMIT_NEXT_BOOK_PATTERN.test(text) ||
    SUBMIT_NEXT_PATTERN.test(text) ||
    SUBMIT_PATTERN.test(text) ||
    CONTENT_PATTERN.test(text) ||
    REFINE_PATTERN.test(text) ||
    APPROVE_PATTERN.test(text) ||
    FORCE_APPROVE_PATTERN.test(text) ||
    LINKEDIN_APPROVE_PATTERN.test(text) ||
    QUEUE_PATTERN.test(text) ||
    PUBLISHED_PATTERN.test(text)
  );
}

// ══════════════════════════════════════════════════════════════
//  DIRECTORY HANDLERS
// ══════════════════════════════════════════════════════════════

function handleDirectoriesDashboard(): string {
  const dirs = getDirectories();
  const productDirs = dirs.filter((d) => d.type !== 'book');
  const bookDirs = dirs.filter((d) => d.type === 'book');

  const pLive = productDirs.filter((d) => d.status === 'live');
  const pSubmitted = productDirs.filter((d) => d.status === 'submitted');
  const pPending = productDirs.filter((d) => d.status === 'pending');
  const pDeferred = productDirs.filter((d) => d.status === 'deferred');

  const bLive = bookDirs.filter((d) => d.status === 'live');
  const bSubmitted = bookDirs.filter((d) => d.status === 'submitted');
  const bPending = bookDirs.filter((d) => d.status === 'pending');

  const lines = [
    '\u{1F4CB} Tork Directory Submissions',
    '',
    `\u2705 Live (${pLive.length}): ${pLive.map((d) => d.name).join(', ')}`,
    `\u{1F4E8} Submitted (${pSubmitted.length}): ${pSubmitted.map((d) => d.name).join(', ')}`,
    `\u2B1C Pending (${pPending.length}): ${pPending.map((d) => d.name).join(', ')}`,
    `\u{1F6AB} Deferred (${pDeferred.length}): ${pDeferred.length > 0 ? pDeferred.map((d) => `${d.name}${d.fields.notes ? ` \u2014 ${d.fields.notes}` : ''}`).join(', ') : 'none'}`,
    '',
    '\u{1F4D6} Book Directory Submissions',
    '',
    `\u2705 Live: ${bLive.length}`,
    `\u{1F4E8} Submitted: ${bSubmitted.length}`,
    `\u2B1C Pending: ${bPending.length}`,
    ...(bLive.length > 0 ? [`  ${bLive.map((d) => d.name).join(', ')}`] : []),
    ...(bSubmitted.length > 0
      ? [`  ${bSubmitted.map((d) => d.name).join(', ')}`]
      : []),
    ...(bPending.length > 0
      ? [`  ${bPending.map((d) => d.name).join(', ')}`]
      : []),
    '',
    '\u2022 @tork submit [name] \u2014 get copy for a directory',
    '\u2022 @tork submit next \u2014 get the next pending product directory',
    '\u2022 @tork submit next book \u2014 get the next pending book directory',
    '\u2022 @tork submit done [name] \u2014 mark as submitted',
  ];
  return lines.join('\n');
}

function handleSubmitCopy(query: string): string {
  const dirs = getDirectories();
  const dir = fuzzyMatch(query, dirs);

  if (!dir) {
    return `Could not find a directory matching "${query}". Use @tork directories to see all.`;
  }

  if (dir.status === 'live') {
    return `\u2705 ${dir.name} is already live! No submission needed.`;
  }
  if (dir.status === 'submitted') {
    return `\u{1F4E8} ${dir.name} has already been submitted. Waiting for approval.`;
  }

  const fieldLines = Object.entries(dir.fields)
    .filter(([key]) => key !== 'notes')
    .map(([key, value]) => `${key}: ${value}`);

  const lines = [
    `\u{1F4DD} ${dir.name} \u2014 Submission Ready`,
    `\u{1F517} Submit at: ${dir.url}`,
    '',
    ...fieldLines,
    '',
    `Copy each field and paste into the form. Reply @tork submit done ${dir.name} when submitted.`,
  ];
  return lines.join('\n');
}

function handleSubmitDone(query: string): string {
  const dirs = getDirectories();
  const dir = fuzzyMatch(query, dirs);

  if (!dir) {
    return `Could not find a directory matching "${query}".`;
  }

  markSubmitted(dir.name);

  // Swarm: auto-draft announcement tweet
  onDirectorySubmitted(dir.name).catch((err) =>
    logger.error({ err }, 'Swarm onDirectorySubmitted failed'),
  );

  const remaining = getDirectories().filter(
    (d) => d.status === 'pending',
  ).length;
  return `\u2705 ${dir.name} marked as submitted! ${remaining} pending remaining.`;
}

function handleSubmitNext(): string {
  const dirs = getDirectories();
  const next = dirs.find((d) => d.status === 'pending' && d.type !== 'book');

  if (!next) {
    return '\u{1F389} All product directories have been submitted or are live!';
  }

  return handleSubmitCopy(next.name);
}

function handleSubmitNextBook(): string {
  const dirs = getDirectories();
  const next = dirs.find((d) => d.status === 'pending' && d.type === 'book');

  if (!next) {
    return '\u{1F389} All book directories have been submitted or are live!';
  }

  return handleSubmitCopy(next.name);
}

// ══════════════════════════════════════════════════════════════
//  CONTENT HANDLERS
// ══════════════════════════════════════════════════════════════

export async function handleContentGeneration(
  platform: string,
  topic?: string,
): Promise<string> {
  const key = platform.toLowerCase();
  const systemPrompt = PLATFORM_PROMPTS[key];

  if (!systemPrompt) {
    const supported = Object.keys(PLATFORM_PROMPTS).join(', ');
    return `Unknown platform "${platform}". Supported: ${supported}`;
  }

  logger.info({ platform: key, topic }, 'Generating marketing content');

  try {
    const userMessage = topic
      ? `Write content about: ${topic}`
      : `Write a post about Tork Network's AI governance capabilities.`;

    const model = getModelForPlatform(key);
    let content = await callClaudeAPI(systemPrompt, userMessage, model);

    // Claims pre-check: verify content before showing to user
    let claimsResult = verifyContent(content);
    logger.info(
      { platform: key, claimsResult },
      'Claims pre-check on generated content',
    );

    let warningPrefix = '';
    if (!claimsResult.passed) {
      // Auto-correct: retry up to 2 times
      for (let attempt = 0; attempt < 2 && !claimsResult.passed; attempt++) {
        const revisionMessage = `Here is a draft that contains incorrect claims. Please fix these issues and regenerate:\n\n${content}\n\nIssues to fix:\n${claimsResult.warnings.join('\n')}\n\nGenerate a corrected version with accurate claims only.`;
        content = await callClaudeAPI(systemPrompt, revisionMessage, model);
        claimsResult = verifyContent(content);
        logger.info(
          { platform: key, claimsResult, attempt: attempt + 1 },
          'Claims pre-check on revised content',
        );
      }

      if (!claimsResult.passed) {
        warningPrefix = `⚠️ Auto-correction attempted but some claims may still need review:\n${claimsResult.warnings.join('\n')}\n\n`;
      }
    }

    const id = nextId(key);

    contentQueue.push({
      id,
      platform: key as ContentPlatform,
      topic: topic || 'general',
      content,
      status: 'draft',
      createdAt: new Date(),
    });
    lastDraftId = id;

    const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
    const linkedInTag =
      key === 'linkedin'
        ? ` — @Zunaid please review:\n\n⚠️ LinkedIn posts require Zunaid's approval before publishing.\n`
        : ':';

    return [
      `${warningPrefix}📝 [${platformLabel}] Draft #${id}${linkedInTag}`,
      '---',
      content,
      '---',
      key === 'linkedin'
        ? `✏️ @tork refine [feedback] or ✅ @tork approve linkedin (Zunaid only)`
        : `✏️ @tork refine [feedback] or ✅ @tork approve`,
    ].join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Marketing content generation failed');
    return `Failed to generate content: ${msg}`;
  }
}

async function handleRefine(feedback: string): Promise<string> {
  if (!lastDraftId) {
    return 'No recent draft to refine. Use @tork content [platform] [topic] first.';
  }

  const item = findItem(lastDraftId);
  if (!item) {
    return `Draft ${lastDraftId} not found in queue.`;
  }

  const systemPrompt = PLATFORM_PROMPTS[item.platform];
  if (!systemPrompt) {
    return `No system prompt for platform "${item.platform}".`;
  }

  logger.info({ id: item.id, feedback }, 'Refining marketing content');

  try {
    const userMessage = `Here is a draft:\n\n${item.content}\n\nRevise with this feedback: ${feedback}`;
    const model = getModelForPlatform(item.platform);
    const revised = await callClaudeAPI(systemPrompt, userMessage, model);

    item.content = revised;
    item.status = 'draft';

    return [
      `\u{1F4DD} [${item.platform.charAt(0).toUpperCase() + item.platform.slice(1)}] Revised Draft #${item.id}:`,
      '---',
      revised,
      '---',
      `\u270F\uFE0F @tork refine [feedback] or \u2705 @tork approve`,
    ].join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Marketing content refinement failed');
    return `Failed to refine draft: ${msg}`;
  }
}

async function handleApprove(idArg?: string, force = false): Promise<string> {
  const targetId = idArg || lastDraftId;
  if (!targetId) {
    return 'No draft to approve. Use @tork content [platform] [topic] first.';
  }

  const item = findItem(targetId);
  if (!item) {
    return `Draft ${targetId} not found in queue.`;
  }

  if (item.status === 'published') {
    return `${item.id} is already published${item.publishedUrl ? ` at ${item.publishedUrl}` : ''}.`;
  }

  // LinkedIn gate — require @tork approve linkedin (which sets force=true)
  if (item.platform === 'linkedin' && !force) {
    return `⚠️ LinkedIn posts require Zunaid's approval. Zunaid, reply @tork approve linkedin to confirm.`;
  }

  // Claims verification — block unless force flag is set
  if (!force) {
    const verification = verifyContent(item.content);
    if (!verification.passed) {
      logger.info(
        { id: item.id, warnings: verification.warnings },
        'Claims verification failed, blocking publish',
      );
      return [
        formatVerificationResult(verification),
        '',
        `Draft ${item.id} NOT published. Fix the content or use @tork approve force to override.`,
      ].join('\n');
    }
  }

  item.status = 'approved';
  logger.info(
    { id: item.id, platform: item.platform, force },
    'Content approved',
  );

  const publishResult = await publishItem(item);

  return [
    `\u2705 Approved #${item.id} (${item.platform})`,
    '',
    publishResult,
  ].join('\n');
}

function handleQueue(): string {
  const active = contentQueue.filter(
    (i) => i.status === 'draft' || i.status === 'approved',
  );

  if (active.length === 0) {
    return '\u{1F4ED} Content queue is empty. Use @tork content [platform] [topic] to generate a draft.';
  }

  const lines = [
    `\u{1F4CB} Content Queue (${active.length} items)`,
    '',
    ...active.map(
      (i) =>
        `${i.status === 'draft' ? '\u270F\uFE0F' : '\u2705'} ${i.id} | ${i.platform} | ${i.status} | ${i.topic.slice(0, 40)}`,
    ),
    '',
    '\u2022 @tork approve [id] \u2014 approve and publish',
    '\u2022 @tork refine [feedback] \u2014 revise last draft',
  ];
  return lines.join('\n');
}

function handlePublished(): string {
  const published = contentQueue.filter((i) => i.status === 'published');

  if (published.length === 0) {
    return '\u{1F4ED} No published content yet.';
  }

  const lines = [
    `\u{1F4CA} Published Content (${published.length} items)`,
    '',
    ...published.map(
      (i) => `\u2705 ${i.id} | ${i.platform} | ${i.publishedUrl || 'no URL'}`,
    ),
  ];
  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════
//  WEEKLY DEV.TO ARTICLE GENERATOR
// ══════════════════════════════════════════════════════════════

const WEEKLY_TOPICS = [
  'how to add AI governance to your agent in 5 minutes with Tork SDK',
  'why every AI agent needs a governance layer before production',
  'real-time PII detection in under 20 milliseconds \u2014 how Tork does it',
  'securing MCP servers with governance middleware',
  'building HIPAA-compliant AI agents with real-time PII redaction',
  'cryptographic compliance receipts explained \u2014 proving your AI was governed',
  'the complete guide to AI agent governance for developers',
  'how we built a Tork-governed WhatsApp AI agent',
  'EU AI Act compliance made practical with governance middleware',
  'PII detection across 12 regional variants \u2014 AU TFN to EU IBAN',
  'why compliance receipts matter more than logs for AI governance',
  'multi-protocol AI governance \u2014 MCP, A2A, ACP and AG-UI in one SDK',
];

const WEEKLY_INDEX_FILE = path.join(STORE_DIR, 'marketing-weekly-index.json');

function loadWeeklyIndex(): number {
  try {
    const data = fs.readFileSync(WEEKLY_INDEX_FILE, 'utf-8');
    const parsed = JSON.parse(data) as { index: number };
    return typeof parsed.index === 'number' ? parsed.index : 0;
  } catch {
    return 0;
  }
}

function saveWeeklyIndex(index: number): void {
  fs.mkdirSync(path.dirname(WEEKLY_INDEX_FILE), { recursive: true });
  fs.writeFileSync(WEEKLY_INDEX_FILE, JSON.stringify({ index }, null, 2));
}

/**
 * Generate a weekly Dev.to article draft. Called by the scheduled timer.
 * Returns the draft message string (same format as @tork content devto).
 */
export async function generateWeeklyDevtoArticle(): Promise<string> {
  const index = loadWeeklyIndex();
  const topic = WEEKLY_TOPICS[index % WEEKLY_TOPICS.length];

  // Advance index for next week
  saveWeeklyIndex((index + 1) % WEEKLY_TOPICS.length);

  logger.info({ topic, weekIndex: index }, 'Generating weekly Dev.to article');

  return handleContentGeneration('devto', topic);
}

/** Calculate ms until next Friday 11:00 AM AEST */
function msUntilNextFriday11AM(): number {
  const TZ = 'Australia/Sydney';
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);
  const weekday = parts.find((p) => p.type === 'weekday')!.value;

  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');

  // Map weekday to number (0=Sun ... 5=Fri ... 6=Sat)
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const currentDay = dayMap[weekday] ?? 0;

  // Days until Friday
  let daysUntilFriday = (5 - currentDay + 7) % 7;

  // If it's Friday, check if we've passed 11 AM
  if (daysUntilFriday === 0) {
    const currentMinutes = hour * 60 + minute;
    const targetMinutes = 11 * 60;
    if (currentMinutes >= targetMinutes) {
      daysUntilFriday = 7; // Next Friday
    }
  }

  // Calculate ms: days + time offset to 11:00 AM
  const currentMs = (hour * 3600 + minute * 60 + second) * 1000;
  const targetMs = 11 * 3600 * 1000; // 11:00 AM in ms
  const dayMs = 24 * 60 * 60 * 1000;

  let delay = daysUntilFriday * dayMs + (targetMs - currentMs);
  if (delay <= 0) delay += 7 * dayMs;

  return delay;
}

/**
 * Start the weekly Dev.to article timer. Fires every Friday at 9 AM AEST.
 */
export function startWeeklyDevtoTimer(
  sendMessage: (text: string) => Promise<void>,
): void {
  const scheduleNext = () => {
    const delay = msUntilNextFriday11AM();
    const hours = Math.floor(delay / 3600000);
    const mins = Math.floor((delay % 3600000) / 60000);
    logger.info(
      { delayMs: delay, hours, mins },
      `Next weekly Dev.to article scheduled in ${hours}h ${mins}m`,
    );

    setTimeout(async () => {
      try {
        const draft = await generateWeeklyDevtoArticle();
        const message = [
          '\u{1F4C5} Weekly Dev.to Article (auto-generated)',
          'Review below and reply @tork approve to publish, or @tork refine [feedback] to revise.',
          '',
          draft,
        ].join('\n');
        await sendMessage(message);
      } catch (err) {
        logger.error({ err }, 'Weekly Dev.to article generation failed');
      }
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}

// ══════════════════════════════════════════════════════════════
//  DAILY AUTO-TWEET SCHEDULE
// ══════════════════════════════════════════════════════════════

const DAILY_TWEET_TOPICS = [
  'AI agents handle PII with zero governance \u2014 that needs to change',
  'every framework gets the same governance API \u2014 one integration, 79+ compliance frameworks',
  'compliance receipts are cryptographic proof your AI was governed \u2014 not just logs',
  'we built an AI agent on WhatsApp and governed every message through Tork',
  'PII detection in under 20 milliseconds \u2014 governance can\u2019t be a bottleneck',
  'the EU AI Act requires audit trails for high-risk AI \u2014 compliance receipts solve that',
  '11 SDKs across every major language \u2014 governance should meet developers where they are',
  'your AI agent just sent a customer\u2019s SSN to a third-party API \u2014 would you even know?',
  'governance isn\u2019t about slowing AI down \u2014 it\u2019s about letting it run faster with guardrails',
  '50+ PII patterns across 12 regional variants \u2014 AU TFN to EU IBAN to US SSN',
  'autonomous agents are the fastest-growing attack surface in enterprise \u2014 who\u2019s governing yours?',
  'every Tork compliance receipt is HMAC-signed \u2014 tamper-evident proof of governance',
  'MCP servers need governance middleware the same way APIs need authentication',
  'free tier: 5,000 governed API calls per month \u2014 no credit card needed',
  'the question isn\u2019t whether your AI agents need governance \u2014 it\u2019s when you\u2019ll add it',
  'TORKING-X: a measurement standard for AI governance \u2014 you can\u2019t improve what you don\u2019t measure',
  'we govern our own AI marketing agent with Tork \u2014 every message scanned and receipted',
  'SOC 2, GDPR, HIPAA, PCI DSS, POPIA, CCPA \u2014 one API call covers them all',
  'AI governance in 3 lines of code \u2014 pip install tork and you\u2019re governed',
  'the agent crisis is real \u2014 42% of enterprises run AI agents with zero governance',
];

const DAILY_TWEET_INDEX_FILE = path.join(
  STORE_DIR,
  'marketing-daily-tweet-index.json',
);

function loadDailyTweetIndex(): number {
  try {
    const data = fs.readFileSync(DAILY_TWEET_INDEX_FILE, 'utf-8');
    const parsed = JSON.parse(data) as { index: number };
    return typeof parsed.index === 'number' ? parsed.index : 0;
  } catch {
    return 0;
  }
}

function saveDailyTweetIndex(index: number): void {
  fs.mkdirSync(path.dirname(DAILY_TWEET_INDEX_FILE), { recursive: true });
  fs.writeFileSync(DAILY_TWEET_INDEX_FILE, JSON.stringify({ index }, null, 2));
}

export async function generateDailyTweet(): Promise<string> {
  const index = loadDailyTweetIndex();
  const topic = DAILY_TWEET_TOPICS[index % DAILY_TWEET_TOPICS.length];
  saveDailyTweetIndex((index + 1) % DAILY_TWEET_TOPICS.length);
  logger.info({ topic, dayIndex: index }, 'Generating daily tweet');
  return handleContentGeneration('twitter', topic);
}

/** Calculate ms until next weekday (Mon-Fri) at 10:00 AM AEST */
function msUntilNextWeekday10AM(): number {
  const TZ = 'Australia/Sydney';
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);
  const weekday = parts.find((p) => p.type === 'weekday')!.value;

  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const currentDay = dayMap[weekday] ?? 0;
  const currentMs = (hour * 3600 + minute * 60 + second) * 1000;
  const targetMs = 10 * 3600 * 1000; // 10:00 AM
  const dayMs = 24 * 60 * 60 * 1000;

  // Try today first, then each subsequent day
  for (let offset = 0; offset < 8; offset++) {
    const day = (currentDay + offset) % 7;
    // Skip weekends
    if (day === 0 || day === 6) continue;
    const delay = offset * dayMs + (targetMs - currentMs);
    if (delay > 0) return delay;
  }

  // Fallback: next Monday
  const daysUntilMon = (8 - currentDay) % 7 || 7;
  return daysUntilMon * dayMs + (targetMs - currentMs);
}

export function startDailyTweetTimer(
  sendMessage: (text: string) => Promise<void>,
): void {
  const scheduleNext = () => {
    const delay = msUntilNextWeekday10AM();
    const hours = Math.floor(delay / 3600000);
    const mins = Math.floor((delay % 3600000) / 60000);
    logger.info(
      { delayMs: delay, hours, mins },
      `Next daily tweet scheduled in ${hours}h ${mins}m`,
    );

    setTimeout(async () => {
      try {
        const draft = await generateDailyTweet();
        const message = [
          '\u{1F426} Daily Tweet (auto-generated)',
          'Review and reply @tork approve to publish, or @tork refine [feedback] to revise.',
          '',
          draft,
        ].join('\n');
        await sendMessage(message);
      } catch (err) {
        logger.error({ err }, 'Daily tweet generation failed');
      }
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}

// ══════════════════════════════════════════════════════════════
//  WEEKLY THREAD SCHEDULE (Tue & Thu 9 AM AEST)
// ══════════════════════════════════════════════════════════════

const WEEKLY_THREAD_TOPICS = [
  'we scanned 500 AI agent skills and 10% were actively dangerous \u2014 here\u2019s what we found',
  'how PII detection works in under 20 milliseconds \u2014 the architecture behind Tork',
  'the 3 things every enterprise gets wrong about AI agent governance',
  'we built a Tork-governed WhatsApp AI agent \u2014 here\u2019s the full architecture',
  'EU AI Act compliance for AI agents \u2014 a practical guide for CTOs',
  'compliance receipts vs audit logs \u2014 why cryptographic proof matters',
  'MCP security: why the fastest-growing AI protocol needs governance middleware',
  'from zero to governed: adding Tork to your AI agent in 5 minutes',
];

const WEEKLY_THREAD_INDEX_FILE = path.join(
  STORE_DIR,
  'marketing-weekly-thread-index.json',
);

function loadWeeklyThreadIndex(): number {
  try {
    const data = fs.readFileSync(WEEKLY_THREAD_INDEX_FILE, 'utf-8');
    const parsed = JSON.parse(data) as { index: number };
    return typeof parsed.index === 'number' ? parsed.index : 0;
  } catch {
    return 0;
  }
}

function saveWeeklyThreadIndex(index: number): void {
  fs.mkdirSync(path.dirname(WEEKLY_THREAD_INDEX_FILE), { recursive: true });
  fs.writeFileSync(
    WEEKLY_THREAD_INDEX_FILE,
    JSON.stringify({ index }, null, 2),
  );
}

export async function generateWeeklyThread(): Promise<string> {
  const index = loadWeeklyThreadIndex();
  const topic = WEEKLY_THREAD_TOPICS[index % WEEKLY_THREAD_TOPICS.length];
  saveWeeklyThreadIndex((index + 1) % WEEKLY_THREAD_TOPICS.length);
  logger.info({ topic, threadIndex: index }, 'Generating weekly thread');
  return handleContentGeneration('thread', topic);
}

/** Calculate ms until next Tuesday or Thursday at 11:00 AM AEST */
function msUntilNextTueOrThu11AM(): number {
  const TZ = 'Australia/Sydney';
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);
  const weekday = parts.find((p) => p.type === 'weekday')!.value;

  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const currentDay = dayMap[weekday] ?? 0;
  const currentMs = (hour * 3600 + minute * 60 + second) * 1000;
  const targetMs = 11 * 3600 * 1000; // 11:00 AM
  const dayMs = 24 * 60 * 60 * 1000;

  // Check today through next 7 days for Tue (2) or Thu (4)
  for (let offset = 0; offset < 8; offset++) {
    const day = (currentDay + offset) % 7;
    if (day !== 2 && day !== 4) continue;
    const delay = offset * dayMs + (targetMs - currentMs);
    if (delay > 0) return delay;
  }

  // Fallback
  const daysUntilTue = (2 - currentDay + 7) % 7 || 7;
  return daysUntilTue * dayMs + (targetMs - currentMs);
}

export function startWeeklyThreadTimer(
  sendMessage: (text: string) => Promise<void>,
): void {
  const scheduleNext = () => {
    const delay = msUntilNextTueOrThu11AM();
    const hours = Math.floor(delay / 3600000);
    const mins = Math.floor((delay % 3600000) / 60000);
    logger.info(
      { delayMs: delay, hours, mins },
      `Next weekly thread scheduled in ${hours}h ${mins}m`,
    );

    setTimeout(async () => {
      try {
        const draft = await generateWeeklyThread();
        const message = [
          '\u{1F9F5} Weekly Thread (auto-generated)',
          'Review and reply @tork approve to publish, or @tork refine [feedback] to revise.',
          '',
          draft,
        ].join('\n');
        await sendMessage(message);
      } catch (err) {
        logger.error({ err }, 'Weekly thread generation failed');
      }
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}

// ══════════════════════════════════════════════════════════════
//  WEEKLY BOOK PROMO TWEET (Wed 9 AM AEST)
// ══════════════════════════════════════════════════════════════

const WEEKLY_BOOK_TOPICS = [
  'I wrote a 94-page book about why AI agents need governance \u2014 and I\u2019m giving it away free at tork.network',
  'chapter 1 of The Agent Crisis: the moment I realised nobody was governing AI agents',
  '42% of enterprises run AI agents with zero governance \u2014 that stat inspired The Agent Crisis',
  'The Agent Crisis isn\u2019t about fear \u2014 it\u2019s about building trust in autonomous systems',
  'every AI framework chapter in The Agent Crisis includes real governance implementation patterns',
  'I co-authored The Agent Crisis with Zunaid Mohidin because CTOs kept asking the same question about AI governance',
  'free download: The Agent Crisis \u2014 94 pages on why AI governance is the next infrastructure layer at tork.network',
  'the compliance receipt concept from The Agent Crisis is now live in production at tork.network',
  'writing The Agent Crisis taught me that governance isn\u2019t a feature \u2014 it\u2019s a category',
  'The Agent Crisis covers SOC 2, GDPR, HIPAA, EU AI Act \u2014 practical AI governance for every framework',
  'most AI governance books are theoretical \u2014 The Agent Crisis has working code examples and real architecture',
  'download The Agent Crisis free at tork.network \u2014 then try the governance API it describes',
];

const BOOK_TWEET_INDEX_FILE = path.join(
  STORE_DIR,
  'marketing-book-tweet-index.json',
);

function loadBookTweetIndex(): number {
  try {
    const data = fs.readFileSync(BOOK_TWEET_INDEX_FILE, 'utf-8');
    const parsed = JSON.parse(data) as { index: number };
    return typeof parsed.index === 'number' ? parsed.index : 0;
  } catch {
    return 0;
  }
}

function saveBookTweetIndex(index: number): void {
  fs.mkdirSync(path.dirname(BOOK_TWEET_INDEX_FILE), { recursive: true });
  fs.writeFileSync(BOOK_TWEET_INDEX_FILE, JSON.stringify({ index }, null, 2));
}

export async function generateWeeklyBookTweet(): Promise<string> {
  const index = loadBookTweetIndex();
  const topic = WEEKLY_BOOK_TOPICS[index % WEEKLY_BOOK_TOPICS.length];
  saveBookTweetIndex((index + 1) % WEEKLY_BOOK_TOPICS.length);
  logger.info(
    { topic, bookIndex: index },
    'Generating weekly book promo tweet',
  );
  return handleContentGeneration('twitter', topic);
}

/** Calculate ms until next Wednesday at 11:00 AM AEST */
function msUntilNextWed11AM(): number {
  const TZ = 'Australia/Sydney';
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);
  const weekday = parts.find((p) => p.type === 'weekday')!.value;

  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const currentDay = dayMap[weekday] ?? 0;
  const currentMs = (hour * 3600 + minute * 60 + second) * 1000;
  const targetMs = 11 * 3600 * 1000; // 11:00 AM
  const dayMs = 24 * 60 * 60 * 1000;

  // Check today through next 7 days for Wed (3)
  for (let offset = 0; offset < 8; offset++) {
    const day = (currentDay + offset) % 7;
    if (day !== 3) continue;
    const delay = offset * dayMs + (targetMs - currentMs);
    if (delay > 0) return delay;
  }

  // Fallback
  const daysUntilWed = (3 - currentDay + 7) % 7 || 7;
  return daysUntilWed * dayMs + (targetMs - currentMs);
}

export function startWeeklyBookTweetTimer(
  sendMessage: (text: string) => Promise<void>,
): void {
  const scheduleNext = () => {
    const delay = msUntilNextWed11AM();
    const hours = Math.floor(delay / 3600000);
    const mins = Math.floor((delay % 3600000) / 60000);
    logger.info(
      { delayMs: delay, hours, mins },
      `Next weekly book tweet scheduled in ${hours}h ${mins}m`,
    );

    setTimeout(async () => {
      try {
        const draft = await generateWeeklyBookTweet();
        const message = [
          '\u{1F4D6} Book Promo Tweet (auto-generated)',
          'Review and reply @tork approve to publish, or @tork refine [feedback] to revise.',
          '',
          draft,
        ].join('\n');
        await sendMessage(message);
      } catch (err) {
        logger.error({ err }, 'Weekly book tweet generation failed');
      }
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}

// ══════════════════════════════════════════════════════════════
//  MAIN HANDLER
// ══════════════════════════════════════════════════════════════

export async function handleMarketingCommand(text: string): Promise<string> {
  const trimmed = text.trim();

  // "@tork submit done [name]" — check before generic submit
  const doneMatch = trimmed.match(SUBMIT_DONE_PATTERN);
  if (doneMatch) {
    return handleSubmitDone(doneMatch[1].trim());
  }

  // "@tork submit next book"
  if (SUBMIT_NEXT_BOOK_PATTERN.test(trimmed)) {
    return handleSubmitNextBook();
  }

  // "@tork submit next"
  if (SUBMIT_NEXT_PATTERN.test(trimmed)) {
    return handleSubmitNext();
  }

  // "@tork submit [name]"
  const submitMatch = trimmed.match(SUBMIT_PATTERN);
  if (submitMatch) {
    return handleSubmitCopy(submitMatch[1].trim());
  }

  // "@tork content [platform] [topic?]"
  const contentMatch = trimmed.match(CONTENT_PATTERN);
  if (contentMatch) {
    const platform = contentMatch[1];
    const topic = contentMatch[2]?.trim();
    return handleContentGeneration(platform, topic);
  }

  // "@tork refine [feedback]"
  const refineMatch = trimmed.match(REFINE_PATTERN);
  if (refineMatch) {
    return handleRefine(refineMatch[1].trim());
  }

  // "@tork approve linkedin" — Zunaid's LinkedIn approval
  if (LINKEDIN_APPROVE_PATTERN.test(trimmed)) {
    return handleApprove(undefined, true);
  }

  // "@tork approve force"
  if (FORCE_APPROVE_PATTERN.test(trimmed)) {
    return handleApprove(undefined, true);
  }

  // "@tork approve [id?]"
  const approveMatch = trimmed.match(APPROVE_PATTERN);
  if (approveMatch) {
    return handleApprove(approveMatch[1]?.trim());
  }

  // "@tork queue"
  if (QUEUE_PATTERN.test(trimmed)) {
    return handleQueue();
  }

  // "@tork published"
  if (PUBLISHED_PATTERN.test(trimmed)) {
    return handlePublished();
  }

  // "@tork directories" or "@tork marketing"
  return handleDirectoriesDashboard();
}
