import { describe, it, expect } from 'vitest';

// Emulating the extraction logic found in parser.worker.ts
function extractPostId(html: string, platform: string, json?: any): string | null {
  if (platform === 'youtube' && json?.videoId) {
    return json.videoId;
  }

  const dataPostIdMatch = html.match(/data-post-id="([^"]+)"/);
  if (dataPostIdMatch) return dataPostIdMatch[1];
  
  const postIdMatch = html.match(/\/(p|reel)\/([^/"]+)/);
  if (postIdMatch) return postIdMatch[2];

  const urnMatch = html.match(/data-urn="([^"]+)"/);
  if (urnMatch) return urnMatch[1];

  return null;
}

describe('Parser Worker: extractPostId', () => {
  it('extracts YouTube ID from JSON', () => {
    expect(extractPostId('', 'youtube', { videoId: 'XYZ123' })).toBe('XYZ123');
  });

  it('extracts Instagram data-post-id', () => {
    const html = `<div class="post" data-post-id="123456789"></div>`;
    expect(extractPostId(html, 'instagram')).toBe('123456789');
  });

  it('extracts Instagram /p/ shortcode', () => {
    const html = `<a href="/p/CqAbCdEfGh/">Link</a>`;
    expect(extractPostId(html, 'instagram')).toBe('CqAbCdEfGh');
  });

  it('extracts Instagram /reel/ shortcode', () => {
    const html = `<a href="/reel/ReElAbCdEf/">Watch</a>`;
    expect(extractPostId(html, 'instagram')).toBe('ReElAbCdEf');
  });

  it('extracts LinkedIn data-urn', () => {
    const html = `<div data-urn="urn:li:activity:987654321"></div>`;
    expect(extractPostId(html, 'linkedin')).toBe('urn:li:activity:987654321');
  });

  it('returns null if no matches', () => {
    expect(extractPostId('<div>Empty</div>', 'instagram')).toBeNull();
  });
});
