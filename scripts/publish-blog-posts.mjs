#!/usr/bin/env node
/**
 * Publish 7 Tork Chat blog posts to Dev.to and Hashnode.
 * Reads API keys from .env, publishes with 30s delays, saves results.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, basename } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
process.chdir(ROOT);

// Parse .env for specific keys
function loadEnvKey(key) {
  const env = readFileSync('.env', 'utf-8');
  const match = env.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

const DEVTO_API_KEY = loadEnvKey('DEVTO_API_KEY');
const HASHNODE_TOKEN = loadEnvKey('HASHNODE_TOKEN');
const HASHNODE_PUBLICATION_ID = loadEnvKey('HASHNODE_PUBLICATION_ID') || '69a922583b896f7ad6abba4c';

if (!DEVTO_API_KEY) { console.error('Missing DEVTO_API_KEY'); process.exit(1); }
if (!HASHNODE_TOKEN) { console.error('Missing HASHNODE_TOKEN'); process.exit(1); }

const BLOG_FILES = [
  'content/blog/tork-chat-launch.md',
  'content/blog/ai-governance-before-features.md',
  'content/blog/langraph-multi-agent-tutorial.md',
  'content/blog/ai-seatbelt-not-invincibility.md',
  'content/blog/vehicle-rental-ai-case-study.md',
  'content/blog/ai-chatbot-governance-comparison.md',
  'content/blog/ai-deployment-checklist.md',
];

function parseMarkdown(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) return { title: 'Untitled', tags: [], body: raw, canonical_url: '' };

  const fm = fmMatch[1];
  const body = fmMatch[2].trim();

  const titleMatch = fm.match(/^title:\s*["'](.+?)["']\s*$/m);
  const title = titleMatch ? titleMatch[1] : 'Untitled';

  const tagsMatch = fm.match(/^tags:\s*(.+)$/m);
  const tags = tagsMatch
    ? tagsMatch[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean).slice(0, 4)
    : [];

  const canonicalMatch = fm.match(/^canonical_url:\s*(.+)$/m);
  const canonical_url = canonicalMatch ? canonicalMatch[1].trim() : '';

  const descMatch = fm.match(/^description:\s*["'](.+?)["']\s*$/m);
  const description = descMatch ? descMatch[1] : '';

  return { title, tags, body, canonical_url, description };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function publishToDevto(post) {
  const res = await fetch('https://dev.to/api/articles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': DEVTO_API_KEY,
    },
    body: JSON.stringify({
      article: {
        title: post.title,
        body_markdown: post.body,
        published: true,
        tags: post.tags,
        canonical_url: post.canonical_url || undefined,
        description: post.description || undefined,
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: JSON.stringify(data) };
  }
  return { ok: true, url: data.url };
}

async function publishToHashnode(post, slug) {
  const mutation = `mutation PublishPost($input: PublishPostInput!) {
    publishPost(input: $input) {
      post { id url slug }
    }
  }`;

  const variables = {
    input: {
      publicationId: HASHNODE_PUBLICATION_ID,
      title: post.title,
      contentMarkdown: post.body,
      slug,
      tags: [],
    },
  };

  // Only add originalArticleURL if it's a valid URL
  if (post.canonical_url && post.canonical_url.startsWith('http')) {
    variables.input.originalArticleURL = post.canonical_url;
  }

  const res = await fetch('https://gql.hashnode.com', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: HASHNODE_TOKEN,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  const data = await res.json();
  if (data.errors?.length) {
    return { ok: false, error: data.errors[0].message };
  }
  const url = data.data?.publishPost?.post?.url;
  if (url) {
    return { ok: true, url };
  }
  return { ok: false, error: JSON.stringify(data) };
}

async function main() {
  mkdirSync('store', { recursive: true });
  const results = [];

  for (let i = 0; i < BLOG_FILES.length; i++) {
    const file = BLOG_FILES[i];
    const slug = basename(file, '.md');
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${i + 1}/7] ${file}`);
    console.log('='.repeat(60));

    const post = parseMarkdown(file);
    console.log(`Title: ${post.title}`);
    console.log(`Tags: ${post.tags.join(', ')}`);
    console.log(`Canonical: ${post.canonical_url}`);

    // Dev.to
    console.log('\nPublishing to Dev.to...');
    const devtoResult = await publishToDevto(post);
    if (devtoResult.ok) {
      console.log(`  SUCCESS: ${devtoResult.url}`);
    } else {
      console.log(`  FAILED: ${devtoResult.error}`);
    }

    // Hashnode
    console.log('Publishing to Hashnode...');
    const hashnodeResult = await publishToHashnode(post, slug);
    if (hashnodeResult.ok) {
      console.log(`  SUCCESS: ${hashnodeResult.url}`);
    } else {
      console.log(`  FAILED: ${hashnodeResult.error}`);
    }

    results.push({
      title: post.title,
      file,
      devto_url: devtoResult.ok ? devtoResult.url : `FAILED: ${devtoResult.error}`,
      hashnode_url: hashnodeResult.ok ? hashnodeResult.url : `FAILED: ${hashnodeResult.error}`,
    });

    // 30s delay between posts (except last)
    if (i < BLOG_FILES.length - 1) {
      console.log('\nWaiting 30 seconds...');
      await sleep(30000);
    }
  }

  writeFileSync('store/published-blog-posts.json', JSON.stringify(results, null, 2));
  console.log(`\n${'='.repeat(60)}`);
  console.log('ALL DONE — Results:');
  console.log('='.repeat(60));
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
