/**
 * Instagram-specific scraper configuration.
 */
export const instagramConfig = {
  urls: {
    base: 'https://www.instagram.com',
    login: 'https://www.instagram.com/accounts/login/',
    feed: 'https://www.instagram.com/',
    explore: 'https://www.instagram.com/explore/tags/',
  },
  selectors: {
    // Login
    usernameInput: 'input[name="username"]',
    passwordInput: 'input[name="password"]',
    loginButton: 'button[type="submit"]',
    notNowButton: 'button:has-text("Not Now"), button:has-text("Not now")',

    // Feed / Post detection
    postContainer: 'article[role="presentation"], article',
    postLink: 'a[href*="/p/"], a[href*="/reel/"]',

    // Post content
    caption: 'h1, span._ap3a, div._a9zs span, ul li span',
    likeCount: 'section span, button span',
    commentCount: 'a[href$="comments/"] span',

    // Logged-in indicators
    loggedInIndicator: 'svg[aria-label="Home"], a[href="/direct/inbox/"]',
  },
  scraping: {
    scrollDelay: 2000,       // ms between scrolls
    maxScrolls: 10,          // max scroll iterations
    defaultMaxPosts: 15,     // default posts per scrape
    postLoadWait: 3000,      // wait after navigation for posts to load
    loginWait: 5000,         // wait after login submission
  },
};
