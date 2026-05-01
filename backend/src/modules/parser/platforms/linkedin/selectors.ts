/**
 * LinkedIn selectors for parser extraction.
 * SRS §6.3: Platform-specific selector rules.
 */
export const LinkedInSelectors = {
  postContainer:    '.feed-shared-update-v2, .occludable-update',
  caption:          '.feed-shared-text, .break-words span[dir="ltr"]',
  reactionCount:    '.social-details-social-counts__reactions-count',
  commentCount:     '.social-details-social-counts__comments a span',
  graphqlLikePath:  'data.feedDashUpdatesByActivitySnapshot.elements[*].socialDetail.totalSocialActivityCounts.numLikes',
};
