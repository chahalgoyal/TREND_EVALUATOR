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

/**
 * Parse engagement count string into a number.
 * Handles: '12,345', '1.2K', '3.5M', 'No likes', etc.
 */
export function parseEngagementCount(raw: string | null | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/,/g, '').trim().toLowerCase();

  if (cleaned.includes('k')) {
    return Math.round(parseFloat(cleaned) * 1000);
  }
  if (cleaned.includes('m')) {
    return Math.round(parseFloat(cleaned) * 1000000);
  }
  if (cleaned.includes('b')) {
    return Math.round(parseFloat(cleaned) * 1000000000);
  }

  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
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
} {
  let bestCaption: string | null = null;
  let bestLikes = 0;
  let bestComments = 0;
  let authorUsername: string | null = null;
  let authorId: string | null = null;

  let exactMatchFound = false;

  for (const api of apis) {
    if (exactMatchFound) break;
    // Recursively find media items in the JSON tree
    const items = collectMediaItems(api);
    for (const item of items) {
      // Match against the target post ID (Instagram shortcodes, URNs, etc.)
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
      const itemLikes = item?.like_count
        ?? item?.edge_media_preview_like?.count
        ?? 0;
      const itemComments = item?.comment_count
        ?? item?.edge_media_to_parent_comment?.count
        ?? item?.edge_media_to_comment?.count
        ?? 0;

      // Extract author
      const user = item?.user || item?.owner;
      const itemAuthor = user?.username || null;
      const itemAuthorId = user?.pk ? String(user.pk) : (user?.id ? String(user.id) : null);

      if (isMatch && captionText) {
        // Exact match — use ALL data (caption, engagement, author)
        bestCaption = captionText;
        bestLikes = Math.max(bestLikes, itemLikes);
        bestComments = Math.max(bestComments, itemComments);
        if (itemAuthor) authorUsername = itemAuthor;
        if (itemAuthorId) authorId = itemAuthorId;
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

  return { caption: bestCaption, likes: bestLikes, comments: bestComments, authorUsername, authorId };
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

  // Strategy 0: YouTube Data API v3 JSON payload
  if (platform === 'youtube' && json && !json.interceptedApis) {
    caption = (json.title || '') + (json.description ? `\n\n${json.description}` : '');
    caption = caption.slice(0, 5000);
    likes = parseInt(json.statistics?.likeCount || '0', 10);
    comments = parseInt(json.statistics?.commentCount || '0', 10);
    views = parseInt(json.statistics?.viewCount || '0', 10);
    authorId = json.channelId;
    authorUsername = json.channelTitle;
    
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

    // Use API caption if it's longer (the HTML caption is truncated by "...more")
    if (apiData.caption && apiData.caption.length > caption.length) {
      caption = apiData.caption.slice(0, 5000); // allow longer captions from API
      logger.debug({ platformPostId, captionLen: caption.length }, 'Using full caption from intercepted API');
    }

    // Use API engagement (exact numbers, not "161.8K" approximations)
    if (apiData.likes > likes) likes = apiData.likes;
    if (apiData.comments > comments) comments = apiData.comments;

    // Use API author info
    if (apiData.authorUsername) authorUsername = apiData.authorUsername;
    if (apiData.authorId) authorId = apiData.authorId;

    // Fallback: also try the old embedded JSON extraction
    for (const api of json.interceptedApis) {
      const igEngagement = extractInstagramEngagementFromJson(api);
      if (igEngagement.likes > likes) likes = igEngagement.likes;
      if (igEngagement.comments > comments) comments = igEngagement.comments;
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

  // Strategy 3: Regex extraction from HTML text for engagement
  if (html && likes === 0) {
    // Check aria-labels first
    const likeMatch = html.match(/aria-label="([\d,.]*[KkMm]?)\s*like/i);
    if (likeMatch) likes = parseEngagementCount(likeMatch[1]);

    const commentMatch = html.match(/aria-label="([\d,.]*[KkMm]?)\s*comment/i);
    if (commentMatch) comments = parseEngagementCount(commentMatch[1]);
  }

  // Strategy 4: Aggressive plain text parsing from textContent
  if (likes === 0 && textContent) {
    let textLikeMatch = textContent.match(/likes?\s+([\d,.]+[KkMm]?)/i);
    if (!textLikeMatch) textLikeMatch = textContent.match(/([\d,.]+[KkMm]?)\s+likes?/i);
    if (!textLikeMatch) textLikeMatch = textContent.match(/([\d,.]+[KkMm]?)\s+others?/i);
    if (textLikeMatch) likes = parseEngagementCount(textLikeMatch[1]);
  }
  if (comments === 0 && textContent) {
    let textCommentMatch = textContent.match(/comments?\s+([\d,.]+[KkMm]?)/i);
    if (!textCommentMatch) textCommentMatch = textContent.match(/([\d,.]+[KkMm]?)\s+comments?/i);
    if (textCommentMatch) comments = parseEngagementCount(textCommentMatch[1]);
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
    rawPayloadId,
    schemaVersion: 'v1',
  };
}
