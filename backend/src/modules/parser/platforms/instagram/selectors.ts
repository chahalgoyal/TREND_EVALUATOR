/**
 * Instagram selectors for parser extraction.
 * SRS §6.3: Platform-specific selector rules.
 */
export const InstagramSelectors = {
  postContainer:    'article[role="presentation"]',
  caption:          '._a9zs ._a9zr span, h1._aacl, div._a9zs span, ul li span',
  likeCount:        'section._ae5m span._ae5z, section span[aria-label*="like"], button span',
  commentCount:     'a[href$="comments/"] span._aacl',
  embeddedJsonKey:  'window._sharedData',
  likeCountPath:    'entry_data.PostPage[0].graphql.shortcode_media.edge_media_preview_like.count',
  commentCountPath: 'entry_data.PostPage[0].graphql.shortcode_media.edge_media_to_parent_comment.count',
};
