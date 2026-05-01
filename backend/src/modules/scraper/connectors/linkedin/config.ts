/**
 * LinkedIn-specific scraper configuration.
 */
export const linkedinConfig = {
  urls: {
    base: 'https://www.linkedin.com',
    login: 'https://www.linkedin.com/login',
    feed: 'https://www.linkedin.com/feed/',
    search: 'https://www.linkedin.com/search/results/content/',
  },
  selectors: {
    // Login
    usernameInput: '#username',
    passwordInput: '#password',
    loginButton: 'button[type="submit"]',

    // Feed / Post detection
    postContainer: '.feed-shared-update-v2, .occludable-update, div[data-urn]',
    postUrn: '[data-urn]',

    // Post content
    caption: '.feed-shared-text, .break-words span[dir="ltr"]',
    reactionCount: '.social-details-social-counts__reactions-count',
    commentCount: '.social-details-social-counts__comments a span',

    // Logged-in indicators
    loggedInIndicator: '.feed-identity-module, .global-nav__me',
  },
  scraping: {
    scrollDelay: 2500,
    maxScrolls: 8,
    defaultMaxPosts: 10,
    postLoadWait: 4000,
    loginWait: 6000,
  },
};
