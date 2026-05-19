/**
 * Demo Pipeline — Pushes realistic social media data through the FULL queue pipeline.
 * 
 * Flow: raw_payloads → parseQueue → (parser worker) → thresholdQueue → (threshold worker) → DB
 * 
 * Usage: npx tsx src/database/demo-pipeline.ts
 * NOTE: The server (npm run dev) must be running for workers to process the jobs.
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { env } from '../config/env';
import redis from '../config/redis';
import { parseQueue } from '../queues/parse.queue';
import { ParseJobDTO } from '../queues/dto';
import { logger } from '../shared/logger';

// ── Realistic demo posts ────────────────────────────────────────────────────
const DEMO_POSTS = [
  // Instagram — viral posts
  {
    platform: 'instagram',
    platformId: 1,
    postId: 'CzAb1234567',
    caption: 'The future of AI is here 🤖 #artificialintelligence #ai #machinelearning #deeplearning #tech #innovation #futuretech #coding #developer #python',
    likes: 245000,
    comments: 8200,
    shares: 12000,
    views: 3500000,
    authorUsername: 'techcrunch',
    source: 'feed' as const,
  },
  {
    platform: 'instagram',
    platformId: 1,
    postId: 'CzBx9876543',
    caption: 'Sunset vibes in Bali 🌅 #travel #bali #sunset #wanderlust #explore #photography #nature #beautiful #travelgram #vacation',
    likes: 189000,
    comments: 6300,
    shares: 4500,
    views: 2100000,
    authorUsername: 'natgeotravel',
    source: 'feed' as const,
  },
  {
    platform: 'instagram',
    platformId: 1,
    postId: 'CzCd5551234',
    caption: 'New sneaker drop! 🔥 #sneakers #fashion #nike #streetwear #hypebeast #kicks #shoes #style #outfit #trending',
    likes: 312000,
    comments: 15400,
    shares: 8900,
    views: 5200000,
    authorUsername: 'sneakernews',
    source: 'feed' as const,
  },
  {
    platform: 'instagram',
    platformId: 1,
    postId: 'CzDe7771234',
    caption: 'Morning workout routine 💪 #fitness #gym #workout #motivation #health #bodybuilding #exercise #fitlife #gains #strong',
    likes: 156000,
    comments: 7800,
    shares: 3200,
    views: 1800000,
    authorUsername: 'chloeting',
    source: 'feed' as const,
  },
  {
    platform: 'instagram',
    platformId: 1,
    postId: 'CzEf9991234',
    caption: 'Homemade pasta from scratch 🍝 #food #cooking #pasta #homemade #recipe #foodie #italian #delicious #yummy #chef',
    likes: 98000,
    comments: 4200,
    shares: 6100,
    views: 1200000,
    authorUsername: 'gordonramsay',
    source: 'feed' as const,
  },
  {
    platform: 'instagram',
    platformId: 1,
    postId: 'CzFg1112345',
    caption: 'Spring collection is here 🌸 #fashion #spring #collection #design #luxury #style #couture #runway #model #ootd',
    likes: 420000,
    comments: 21000,
    shares: 15600,
    views: 8900000,
    authorUsername: 'gucci',
    source: 'keyword' as const,
  },
  {
    platform: 'instagram',
    platformId: 1,
    postId: 'CzGh2223456',
    caption: 'Electric cars are changing the game ⚡ #tesla #electric #cars #ev #sustainable #green #automotive #future #elonmusk #technology',
    likes: 275000,
    comments: 12300,
    shares: 9400,
    views: 4100000,
    authorUsername: 'tesla',
    source: 'keyword' as const,
  },
  {
    platform: 'instagram',
    platformId: 1,
    postId: 'CzHi3334567',
    caption: 'This puppy stole my heart 🐶 #puppy #dog #cute #pets #dogsofinstagram #love #adorable #animals #goldenretriever #puppylove',
    likes: 780000,
    comments: 32000,
    shares: 45000,
    views: 12000000,
    authorUsername: 'dogsofinstagram',
    source: 'feed' as const,
  },
];

// ── Build HTML fragments that look like real scraped content ──────────────────
function buildInstagramHtml(post: typeof DEMO_POSTS[0]): string {
  const hashtagHtml = post.caption.match(/#\w+/g)?.map(t => `<a href="/explore/tags/${t.slice(1)}/">${t}</a>`).join(' ') ?? '';
  return `
<article role="presentation" data-post-id="${post.postId}">
  <header>
    <a href="/${post.authorUsername}/" title="${post.authorUsername}">
      <span>${post.authorUsername}</span>
    </a>
  </header>
  <div class="_a9zs"><span class="_a9zr"><span>${post.caption}</span></span></div>
  <section class="_ae5m">
    <span class="_ae5z" aria-label="${post.likes.toLocaleString()} likes">${post.likes.toLocaleString()} likes</span>
  </section>
  <a href="/p/${post.postId}/comments/">
    <span class="_aacl">${post.comments.toLocaleString()} comments</span>
  </a>
  <div class="hashtags">${hashtagHtml}</div>
</article>`;
}


async function runDemoPipeline() {
  console.log('🚀 Demo Pipeline — pushing realistic data through the full queue system\n');

  let enqueued = 0;

  for (const post of DEMO_POSTS) {
    const jobId = uuidv4();
    const rawPayloadId = uuidv4();

    // 1. Store raw payload in DB (simulates scraper output)
    const html = buildInstagramHtml(post);

    // Build a JSON payload with engagement data (simulates API interception)
    const apiJson = {
      interceptedApis: [{
        entry_data: {
          PostPage: [{
            graphql: {
              shortcode_media: {
                id: post.postId,
                shortcode: post.postId,
                owner: { username: post.authorUsername },
                edge_media_preview_like: { count: post.likes },
                edge_media_to_parent_comment: { count: post.comments },
                edge_media_to_caption: {
                  edges: [{ node: { text: post.caption } }],
                },
              },
            },
          }],
        },
      }],
    };

    await db.query(
      `INSERT INTO raw_payloads (id, platform_id, job_id, source_type, payload_html, payload_json, parse_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [rawPayloadId, post.platformId, jobId, post.source, html, JSON.stringify(apiJson)]
    );

    // 2. Push ParseJobDTO to parseQueue
    const parseJob: ParseJobDTO = {
      jobId: uuidv4(),
      jobType: 'PARSE_POST_HTML',
      platform: post.platform,
      schemaVersion: 'v1',
      metadata: { trigger: 'manual', attempt: 1, initiatedBy: 'demo-pipeline' },
      createdAt: new Date().toISOString(),
      rawPayloadId,
      payloadType: 'html',
      sourceType: post.source,
    };

    await parseQueue.add(parseJob.jobType, parseJob, { jobId: parseJob.jobId });
    enqueued++;

    console.log(`  ✅ [${post.platform.toUpperCase()}] "${post.caption.slice(0, 50)}..." → parseQueue`);
  }

  console.log(`\n🎯 Enqueued ${enqueued} posts to parseQueue`);
  console.log('   The parse worker will process them → thresholdQueue → DB');
  console.log('   Make sure "npm run dev" is running for workers to pick them up!\n');

  // Wait briefly for queue to accept, then disconnect
  await new Promise(r => setTimeout(r, 1000));
  await db.end();
  await redis.quit();
  process.exit(0);
}

runDemoPipeline().catch((err) => {
  console.error('❌ Demo pipeline failed:', err);
  process.exit(1);
});
