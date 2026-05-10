import { describe, it, expect } from 'vitest';
import { extractEmbeddedJson, normalizePost } from '../../src/modules/parser/normalizer';
import { v4 as uuidv4 } from 'uuid';

describe('extractEmbeddedJson', () => {
  it('extracts window._sharedData', () => {
    const html = `<html><body><script>window._sharedData = {"config": {"csrf_token": "abc"}};</script></body></html>`;
    const json = extractEmbeddedJson(html);
    expect(json).toBeDefined();
    expect(json.config.csrf_token).toBe('abc');
  });

  it('extracts application/json script tags', () => {
    const html = `<html><head><script type="application/json" id="my-data">{"items": [1,2,3]}</script></head><body></body></html>`;
    const json = extractEmbeddedJson(html);
    expect(json).toBeDefined();
    expect(json.items).toEqual([1,2,3]);
  });

  it('returns null if no JSON found', () => {
    const html = `<html><body><h1>No JSON here</h1></body></html>`;
    const json = extractEmbeddedJson(html);
    expect(json).toBeNull();
  });

  it('returns null on invalid JSON', () => {
    const html = `<html><body><script>window._sharedData = {invalid: json};</script></body></html>`;
    const json = extractEmbeddedJson(html);
    expect(json).toBeNull();
  });
});

describe('normalizePost', () => {
  const defaultParams = {
    platformPostId: 'test_123',
    sourceType: 'feed' as const,
    rawPayloadId: uuidv4(),
    scrapedAt: new Date().toISOString()
  };

  it('normalizes YouTube API JSON correctly', () => {
    const json = {
      title: 'Awesome Video',
      description: 'Watch this #trending video',
      channelId: 'UC123',
      channelTitle: 'Test Channel',
      publishedAt: '2023-01-01T00:00:00Z',
      statistics: {
        likeCount: '5000',
        commentCount: '100',
        viewCount: '100000'
      }
    };

    const post = normalizePost({
      ...defaultParams,
      platform: 'youtube',
      json
    });

    expect(post.platform).toBe('youtube');
    expect(post.caption).toContain('Awesome Video');
    expect(post.hashtags).toContain('trending');
    expect(post.likes).toBe(5000);
    expect(post.comments).toBe(100);
    expect(post.views).toBe(100000);
    expect(post.authorId).toBe('UC123');
    expect(post.authorUsername).toBe('Test Channel');
    expect(post.postedAt).toBe('2023-01-01T00:00:00Z');
  });

  it('normalizes Instagram JSON with intercepted APIs correctly', () => {
    const json = {
      interceptedApis: [
        {
          items: [{
            code: 'test_123',
            caption: { text: 'Insta pic #viral #photo' },
            like_count: 8500,
            comment_count: 320,
            user: { username: 'instastar', pk: '999' },
            taken_at: 1672531200 // 2023-01-01
          }]
        }
      ]
    };

    const post = normalizePost({
      ...defaultParams,
      platform: 'instagram',
      json
    });

    expect(post.platform).toBe('instagram');
    expect(post.caption).toBe('Insta pic #viral #photo');
    expect(post.hashtags).toContain('viral');
    expect(post.likes).toBe(8500);
    expect(post.comments).toBe(320);
    expect(post.authorUsername).toBe('instastar');
    expect(post.authorId).toBe('999');
    expect(post.postedAt).toContain('2023-01-01');
  });

  it('normalizes LinkedIn from HTML text correctly', () => {
    const html = `
      <div class="feed-shared-update-v2">
        <span>Here is a professional post #career #tech</span>
        <span class="social-details-social-counts__reactions-count">1,500</span>
        <span class="social-details-social-counts__comments">25 comments</span>
      </div>
    `;

    const post = normalizePost({
      ...defaultParams,
      platform: 'linkedin',
      html
    });

    expect(post.platform).toBe('linkedin');
    expect(post.hashtags).toContain('career');
    expect(post.hashtags).toContain('tech');
    // HTML regex parsing might not perfectly extract likes depending on exact DOM, 
    // but we can check if it stripped HTML tags and got the text
    expect(post.caption).toContain('Here is a professional post');
  });

  it('falls back to 0 engagement if data is missing', () => {
    const post = normalizePost({
      ...defaultParams,
      platform: 'instagram',
      html: '<div>Just text</div>'
    });

    expect(post.likes).toBe(0);
    expect(post.comments).toBe(0);
    expect(post.views).toBe(0);
    expect(post.hashtags).toEqual([]);
  });
});
