import { NormalizedPostDTO } from '../../queues/dto';
import { logger } from '../../shared/logger';

/**
 * Parser Normalizer — converts raw extracted data into NormalizedPostDTO.
 * SRS §6.2 Stage 5: Normalization + Stage 6: Schema Validation.
 */

// ── Hashtag extraction regex (SRS §6.2 Stage 4) ─────────────────────────────
const HASHTAG_REGEX = /#(\w+)/g;

/**
 * Extract hashtags from a text string.
 * Normalizes: lowercase, no '#', deduplicated.
 */
export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.matchAll(HASHTAG_REGEX);
  const tags = new Set<string>();
  for (const m of matches) {
    const tag = m[1].toLowerCase();
    if (tag.length > 0 && tag.length <= 150) {
      tags.add(tag);
    }
  }
  return Array.from(tags);
}

// Instagram's all-time record is ~60M likes. 100M is a safe cap.
// Anything above this is almost certainly a timestamp or media ID.
const MAX_REALISTIC_ENGAGEMENT = 100_000_000;

/**
 * Parse engagement count string into a number.
 * Handles: '12,345', '1.2K', '3.5M', '246K', 'No likes', etc.
 * Hard caps at MAX_REALISTIC_ENGAGEMENT to prevent ID/timestamp pollution.
 */
export function parseEngagementCount(raw: string | null | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/,/g, '').trim().toLowerCase();

  // Use endsWith to avoid false positives (e.g. 'likes' contains 'k', 'comments' contains 'm')
  if (cleaned.endsWith('k')) {
    const parsed = parseFloat(cleaned);
    const result = isNaN(parsed) ? 0 : Math.round(parsed * 1000);
    return Math.min(result, MAX_REALISTIC_ENGAGEMENT);
  }
  if (cleaned.endsWith('m')) {
    const parsed = parseFloat(cleaned);
    const result = isNaN(parsed) ? 0 : Math.round(parsed * 1_000_000);
    return Math.min(result, MAX_REALISTIC_ENGAGEMENT);
  }
  // 'b' suffix is NEVER a real engagement metric on any platform — reject entirely.
  // A raw string ending in 'b' is almost certainly a hash, ID, or word fragment.
  if (cleaned.endsWith('b')) {
    return 0;
  }

  const num = parseInt(cleaned, 10);
  if (isNaN(num)) return 0;
  // Raw integer counts above the cap are IDs/timestamps, not engagement.
  return num < MAX_REALISTIC_ENGAGEMENT ? num : 0;
}

/**
 * Extract text content from HTML using regex (for server-side extraction without DOM).
 */
export function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Try to extract embedded JSON from HTML (window.__INITIAL_STATE__ etc).
 */
export function extractEmbeddedJson(html: string): any | null {
  // Try window._sharedData
  const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({.+?});<\/script>/s);
  if (sharedDataMatch) {
    try { return JSON.parse(sharedDataMatch[1]); } catch { /* invalid JSON */ }
  }

  // Try application/json script tags
  const jsonScriptMatch = html.match(/<script[^>]*type="application\/json"[^>]*>({.+?})<\/script>/s);
  if (jsonScriptMatch) {
    try { return JSON.parse(jsonScriptMatch[1]); } catch { /* invalid JSON */ }
  }

  return null;
}

/**
 * Extract engagement from embedded JSON for Instagram.
 */
function extractInstagramEngagementFromJson(json: any): { likes: number; comments: number } {
  try {
    const media = json?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media;
    if (media) {
      return {
        likes: media.edge_media_preview_like?.count ?? 0,
        comments: media.edge_media_to_parent_comment?.count ?? 0,
      };
    }
  } catch { /* not the expected structure */ }
  return { likes: 0, comments: 0 };
}

/**
 * Deep-search intercepted API JSON for full captions, engagement, and author data.
 * Instagram's internal APIs (/api/v1/feed/timeline/, graphql) contain the complete,
 * untruncated caption text that the feed HTML hides behind "...more".
 */
function extractFromInterceptedApis(
  apis: any[],
  targetPostId: string,
  platform: string
): {
  caption: string | null;
  likes: number;
  comments: number;
  authorUsername: string | null;
  authorId: string | null;
  postedAt: string | null;
} {
  let bestCaption: string | null = null;
  let bestLikes = 0;
  let bestComments = 0;
  let authorUsername: string | null = null;
  let authorId: string | null = null;
  let postedAt: string | null = null;

  let exactMatchFound = false;

  for (const api of apis) {
    if (exactMatchFound) break;
    // Recursively find media items in the JSON tree
    const items = collectMediaItems(api);
    if (items.length > 0) {
      logger.debug({ 
        targetPostId, 
        itemsFound: items.length,
        itemCodes: items.slice(0, 3).map(i => ({ code: i.code || i.shortcode, likes: i.like_count || i.edge_media_preview_like?.count }))
      }, 'API matching debug');
    }
    for (const item of items) {
      // Match against the target post ID (Instagram shortcodes, IDs, etc.)
      const itemCode = item.code || item.shortcode || '';
      const itemId = String(item.id || item.pk || '');
      const isMatch = targetPostId === itemCode ||
                      targetPostId === itemId ||
                      (itemCode && targetPostId && itemCode.includes(targetPostId)) ||
                      (itemCode && targetPostId && targetPostId.includes(itemCode));

      // Extract caption text
      const captionText = item?.caption?.text
        || item?.edge_media_to_caption?.edges?.[0]?.node?.text
        || null;

      // Extract engagement
      // Sanity cap: Instagram's all-time record is ~60M likes. Anything above 100M
      // is almost certainly a timestamp or media ID being confused for a count.
      const MAX_REALISTIC_COUNT = 100_000_000;
      const rawLikes    = item?.like_count ?? item?.edge_media_preview_like?.count ?? 0;
      const rawComments = item?.comment_count ?? item?.edge_media_to_parent_comment?.count ?? item?.edge_media_to_comment?.count ?? 0;
      const itemLikes    = typeof rawLikes    === 'number' && rawLikes    < MAX_REALISTIC_COUNT ? rawLikes    : 0;
      const itemComments = typeof rawComments === 'number' && rawComments < MAX_REALISTIC_COUNT ? rawComments : 0;

      // Extract author
      const user = item?.user || item?.owner;
      const itemAuthor = user?.username || null;
      const itemAuthorId = user?.pk ? String(user.pk) : (user?.id ? String(user.id) : null);

      if (isMatch) {
        // Exact match — use ALL data (caption, engagement, author)
        if (captionText) bestCaption = captionText;
        bestLikes = Math.max(bestLikes, itemLikes);
        bestComments = Math.max(bestComments, itemComments);
        if (itemAuthor) authorUsername = itemAuthor;
        if (itemAuthorId) authorId = itemAuthorId;
        
        // Extract timestamp (Instagram uses 'taken_at' as unix timestamp)
        if (item.taken_at) {
          postedAt = new Date(item.taken_at * 1000).toISOString();
        } else if (item.device_timestamp) {
          // Sometimes it's microseconds or milliseconds, safely parse
          const ts = typeof item.device_timestamp === 'string' ? parseInt(item.device_timestamp) : item.device_timestamp;
          postedAt = new Date(ts > 9999999999 ? ts / 1000 : ts * 1000).toISOString();
        }

        exactMatchFound = true;
        break; // Exact match found, stop looking
      }

      // Non-match fallback: ONLY collect caption text for hashtag extraction
      // Do NOT copy engagement/author — it belongs to a different post
      if (!exactMatchFound && captionText && (!bestCaption || captionText.length > bestCaption.length)) {
        bestCaption = captionText;
      }
    }
  }

  return { caption: bestCaption, likes: bestLikes, comments: bestComments, authorUsername, authorId, postedAt };
}

/**
 * Recursively collect media item objects from deeply nested API JSON.
 * Instagram nests items under many different keys depending on the API endpoint.
 */
function collectMediaItems(obj: any, depth = 0): any[] {
  if (!obj || typeof obj !== 'object' || depth > 12) return [];
  const results: any[] = [];

  // If this object looks like a media item (has caption or code), collect it
  if (obj.caption !== undefined || obj.code || obj.shortcode || obj.like_count !== undefined) {
    results.push(obj);
  }

  // Recurse into known container keys (must include every nesting level in the Instagram API path)
  // Real path: data.xdt_api__v1__feed__timeline__connection.edges[].node.explore_story.media
  const containerKeys = [
    'items', 'feed_items', 'edges', 'node', 'media',
    'data', 'graphql', 'shortcode_media', 'media_or_ad',
    'xdt_api__v1__feed__timeline__connection', 'xdt_shortcode_media',
    'explore_story',  // Instagram nests feed items under node.explore_story.media
  ];

  for (const key of containerKeys) {
    if (obj[key]) {
      if (Array.isArray(obj[key])) {
        for (const child of obj[key]) {
          results.push(...collectMediaItems(child, depth + 1));
        }
      } else if (typeof obj[key] === 'object') {
        results.push(...collectMediaItems(obj[key], depth + 1));
      }
    }
  }

  return results;
}

/**
 * Main normalization function — produces a NormalizedPostDTO from raw data.
 */
export function normalizePost(params: {
  platform: string;
  platformPostId: string;
  html?: string;
  json?: any;
  sourceType: 'feed' | 'keyword' | 'profile';
  rawPayloadId: string;
  scrapedAt: string;
}): NormalizedPostDTO {
  const { platform, platformPostId, html, json, sourceType, rawPayloadId, scrapedAt } = params;

  // Extract text from HTML
  const textContent = html ? extractTextFromHtml(html) : '';

  // Try extracting engagement from intercepted API data
  let likes = 0, comments = 0, shares = 0, views = 0;
  let caption = textContent.slice(0, 2000); // cap caption length
  let authorId: string | undefined;
  let authorUsername: string | undefined;
  let postedAt: string | undefined;

  // Strategy 0: YouTube Data API v3 JSON payload
  if (platform === 'youtube' && json && !json.interceptedApis) {
    caption = (json.title || '') + (json.description ? `\n\n${json.description}` : '');
    caption = caption.slice(0, 5000);
    likes = parseInt(json.statistics?.likeCount || '0', 10);
    comments = parseInt(json.statistics?.commentCount || '0', 10);
    views = parseInt(json.statistics?.viewCount || '0', 10);
    authorId = json.channelId;
    authorUsername = json.channelTitle;
    postedAt = json.publishedAt;
    
    // YouTube specific hashtags can also come from tags array
    if (json.tags && Array.isArray(json.tags)) {
      json.tags.forEach((t: string) => {
        const clean = t.replace(/\s+/g, '').toLowerCase();
        if (clean) caption += ` #${clean}`; // append to caption so extractHashtags picks it up
      });
    }
  }

  // Strategy 1: API/GraphQL JSON — extract full caption, engagement, and author
  if (json?.interceptedApis && Array.isArray(json.interceptedApis)) {
    const apiData = extractFromInterceptedApis(json.interceptedApis, platformPostId, platform);

    // Use API caption if it exists — it's way cleaner than the full post page HTML text
    if (apiData.caption) {
      caption = apiData.caption.slice(0, 5000);
      logger.debug({ platformPostId, captionLen: caption.length }, 'Using clean caption from intercepted API');
    }

    // Use API engagement (exact numbers, not "161.8K" approximations)
    if (apiData.likes > likes) likes = apiData.likes;
    if (apiData.comments > comments) comments = apiData.comments;

    // Use API author info
    if (apiData.authorUsername) authorUsername = apiData.authorUsername;
    if (apiData.authorId) authorId = apiData.authorId;
    if (apiData.postedAt) postedAt = apiData.postedAt;

    // Fallback: also try the old embedded JSON extraction
    for (const api of json.interceptedApis) {
      const igEngagement = extractInstagramEngagementFromJson(api);
      if (igEngagement.likes > likes) likes = igEngagement.likes;
      if (igEngagement.comments > comments) comments = igEngagement.comments;
    }
  }

  // Strategy 1.5: OG/Twitter meta description — most reliable for Instagram HTML.
  // Instagram injects "246K likes, 1,961 comments - username on DATE: caption"
  // directly into the <meta name="description"> and <meta property="og:description"> tags.
  // The raw HTML stores attributes as content="246K likes..." so we match accordingly.
  if (html && likes === 0) {
    // Matches: content="246K likes, 1,961 comments"
    const metaDescMatch = html.match(/content="([\d,.]+[KkMm]?)\s+likes?,\s*([\d,.]+[KkMm]?)\s+comments?/i);
    if (metaDescMatch) {
      const metaLikes = parseEngagementCount(metaDescMatch[1]);
      const metaComments = parseEngagementCount(metaDescMatch[2]);
      if (metaLikes > 0) likes = metaLikes;
      if (metaComments > 0) comments = metaComments;
      logger.debug({ platformPostId, metaLikes, metaComments }, 'Used OG meta description for engagement');
    }
  }

  // Strategy 2: Embedded JSON in HTML
  if (html && likes === 0) {
    const embedded = extractEmbeddedJson(html);
    if (embedded) {
      const igEngagement = extractInstagramEngagementFromJson(embedded);
      if (igEngagement.likes > likes) likes = igEngagement.likes;
      if (igEngagement.comments > comments) comments = igEngagement.comments;
    }
  }

  // Strategy 3: aria-label on like/comment buttons — reliable short-form counts.
  // Instagram renders these as aria-label="246K likes" on the heart button.
  if (html && likes === 0) {
    const likeMatch = html.match(/aria-label="([\d,.]+[KkMm]?)\s*like/i);
    if (likeMatch) likes = parseEngagementCount(likeMatch[1]);

    const commentMatch = html.match(/aria-label="([\d,.]+[KkMm]?)\s*comment/i);
    if (commentMatch) comments = parseEngagementCount(commentMatch[1]);
  }

  // Strategy 4: Plain text last-resort fallback.
  // IMPORTANT: Only allow K/M suffixed values here. Raw integers from textContent
  // are extremely likely to be media IDs, timestamps, or CSS pixel values.
  // The regex explicitly requires a K or M suffix to be accepted.
  if (likes === 0 && textContent) {
    const likePatterns = [
      /([\d,.]+[KkMm])\s+likes?/i,        // "246K likes"
      /likes?[:\s]+([\d,.]+[KkMm])/i,      // "likes: 246K"
    ];
    for (const pattern of likePatterns) {
      const m = textContent.match(pattern);
      if (m) { likes = parseEngagementCount(m[1]); break; }
    }
  }
  if (comments === 0 && textContent) {
    const commentPatterns = [
      /([\d,.]+[KkMm])\s+comments?/i,
      /comments?[:\s]+([\d,.]+[KkMm])/i,
    ];
    for (const pattern of commentPatterns) {
      const m = textContent.match(pattern);
      if (m) { comments = parseEngagementCount(m[1]); break; }
    }
  }

  // LinkedIn engagement from HTML
  if (platform === 'linkedin' && html) {
    const reactionMatch = html.match(/([\d,.]+[KkMm]?)\s*(?:reaction|like)/i) || textContent.match(/([\d,.]+[KkMm]?)\s*(?:reaction|like)/i);
    if (reactionMatch) likes = parseEngagementCount(reactionMatch[1]);

    const commentMatch = html.match(/([\d,.]+[KkMm]?)\s*comment/i) || textContent.match(/([\d,.]+[KkMm]?)\s*comment/i);
    if (commentMatch) comments = parseEngagementCount(commentMatch[1]);
  }

  // Extract hashtags from the full caption (now includes untruncated text from API)
  const hashtags = extractHashtags(caption);

  if (hashtags.length > 0) {
    logger.debug({ platformPostId, hashtagCount: hashtags.length, sample: hashtags.slice(0, 5) }, 'Hashtags extracted');
  }

  // Validate required fields
  if (!platformPostId || !platform) {
    logger.warn({ platformPostId, platform }, 'Normalization: missing required fields');
  }

  return {
    platform,
    platformPostId,
    authorId,
    authorUsername,
    caption: caption || undefined,
    hashtags,
    likes: Math.max(0, likes),
    comments: Math.max(0, comments),
    shares: Math.max(0, shares),
    views: Math.max(0, views),
    sourceType,
    scrapedAt,
    postedAt,
    rawPayloadId,
    schemaVersion: 'v1',
  };
}
