/**
 * Unit Tests: Parser Normalizer
 * Tests hashtag extraction, engagement count parsing, HTML text extraction,
 * and the JSON normalizer for all 3 platforms.
 */
import { describe, it, expect } from 'vitest';
import {
  extractHashtags,
  parseEngagementCount,
  extractTextFromHtml,
} from '../../src/modules/parser/normalizer';

// ── extractHashtags ───────────────────────────────────────────────────────────

describe('extractHashtags', () => {
  it('returns empty array for null input', () => {
    expect(extractHashtags(null)).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(extractHashtags(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractHashtags('')).toEqual([]);
  });

  it('extracts single hashtag', () => {
    expect(extractHashtags('Hello #world')).toEqual(['world']);
  });

  it('extracts multiple hashtags', () => {
    const result = extractHashtags('Check out #trending and #viral content #shorts');
    expect(result).toContain('trending');
    expect(result).toContain('viral');
    expect(result).toContain('shorts');
  });

  it('deduplicates hashtags', () => {
    const result = extractHashtags('#shorts #funny #shorts #funny #comedy');
    expect(result.length).toBe(3);
    expect(new Set(result).size).toBe(result.length);
  });

  it('normalizes hashtags to lowercase', () => {
    const result = extractHashtags('#TRENDING #Viral #Comedy');
    expect(result).toContain('trending');
    expect(result).toContain('viral');
    expect(result).toContain('comedy');
  });

  it('strips the # prefix', () => {
    const result = extractHashtags('#funny');
    expect(result[0]).toBe('funny');
    expect(result[0]).not.toContain('#');
  });

  it('handles Instagram-style caption with emojis', () => {
    const caption = '🔥 Amazing content! #trending #viral #shorts 🚀 #comedy';
    const tags = extractHashtags(caption);
    expect(tags).toContain('trending');
    expect(tags).toContain('viral');
    expect(tags.length).toBe(4);
  });

  it('handles YouTube double-posted hashtag captions (repeated at end)', () => {
    const caption = 'Good Students 🎓 #shorts #funny #trending\n\nGood Students 🎓 #shorts #funny #trending';
    const tags = extractHashtags(caption);
    // Should deduplicate
    expect(tags.length).toBe(3);
  });

  it('ignores hashtag-like patterns over 150 chars', () => {
    const longTag = '#' + 'a'.repeat(151);
    const result = extractHashtags(longTag);
    expect(result).toEqual([]);
  });
});

// ── parseEngagementCount ─────────────────────────────────────────────────────

describe('parseEngagementCount', () => {
  it('returns 0 for null', () => {
    expect(parseEngagementCount(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(parseEngagementCount(undefined)).toBe(0);
  });

  it('returns 0 for non-numeric strings', () => {
    expect(parseEngagementCount('No likes')).toBe(0);
    expect(parseEngagementCount('N/A')).toBe(0);
  });

  it('parses plain integer strings', () => {
    expect(parseEngagementCount('12345')).toBe(12345);
  });

  it('parses comma-separated numbers', () => {
    expect(parseEngagementCount('12,345')).toBe(12345);
    expect(parseEngagementCount('1,234,567')).toBe(1234567);
  });

  it('parses K suffix (thousands)', () => {
    expect(parseEngagementCount('1.2K')).toBe(1200);
    expect(parseEngagementCount('53.3K')).toBe(53300);
  });

  it('parses M suffix (millions)', () => {
    expect(parseEngagementCount('6.4M')).toBe(6400000);
    expect(parseEngagementCount('1M')).toBe(1000000);
  });

  it('parses B suffix (billions)', () => {
    expect(parseEngagementCount('1.5B')).toBe(1500000000);
  });

  it('is case-insensitive for suffixes', () => {
    expect(parseEngagementCount('2.5k')).toBe(2500);
    expect(parseEngagementCount('3.1m')).toBe(3100000);
  });
});

// ── extractTextFromHtml ───────────────────────────────────────────────────────

describe('extractTextFromHtml', () => {
  it('strips HTML tags', () => {
    const result = extractTextFromHtml('<p>Hello <b>world</b></p>');
    expect(result).toBe('Hello world');
  });

  it('strips script tags and their content', () => {
    const html = '<div>Content</div><script>var x = 1;</script>';
    const result = extractTextFromHtml(html);
    expect(result).not.toContain('var x');
    expect(result).toContain('Content');
  });

  it('strips style tags and their content', () => {
    const html = '<div>Text</div><style>.cls { color: red; }</style>';
    const result = extractTextFromHtml(html);
    expect(result).not.toContain('color: red');
    expect(result).toContain('Text');
  });

  it('collapses multiple whitespace into single space', () => {
    const html = '<p>Hello    World</p>';
    expect(extractTextFromHtml(html)).toBe('Hello World');
  });

  it('handles empty string', () => {
    expect(extractTextFromHtml('')).toBe('');
  });
});
