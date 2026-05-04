/**
 * Trend Intelligence Algorithms
 * Purely statistical mathematical models to evaluate trends without external AI APIs.
 */

/**
 * Calculates a quality score based on engagement ratios.
 * Formula: ((Likes * 1) + (Comments * 5) + (Shares * 3)) / Views
 * Returns a percentage. If views are 0 or unknown, it returns a normalized score based on raw likes.
 */
export function calculateEngagementRate(likes: number, comments: number, views: number): number {
  if (views <= 0) {
    // If we don't have views (e.g. some IG posts), we cap engagement rate based on raw likes
    // We treat 100k likes as a "perfect" 100 score if no views exist.
    return Math.min((likes / 100000) * 100, 100);
  }

  const rawScore = (likes * 1) + (comments * 5);
  let rate = (rawScore / views) * 100;

  // Sometimes views count is lower than likes + comments combined due to API delays. Cap at 100%.
  if (rate > 100) rate = 100;
  
  return Number(rate.toFixed(4));
}

/**
 * Calculates a time-decay "Gravity" score (Similar to Hacker News hot algorithm).
 * Formula: Score = (BaseScore) / (AgeInHours + 2)^Gravity
 * 
 * @param engagementRate The base score (1-100)
 * @param postedAt ISO Date string. If undefined, assumed to be newly posted.
 * @returns Gravity-adjusted score
 */
export function calculateTimeDecayScore(engagementRate: number, postedAt?: string): number {
  if (!postedAt) return engagementRate; // No decay if we don't know the age

  const postedDate = new Date(postedAt);
  const now = new Date();
  const ageInHours = Math.max((now.getTime() - postedDate.getTime()) / (1000 * 60 * 60), 0);

  const gravity = 1.8; // Gravity constant. Higher means trends die faster.
  
  const score = engagementRate / Math.pow(ageInHours + 2, gravity);
  
  return Number(score.toFixed(4));
}

/**
 * Calculates hashtag velocity (growth percentage).
 * @param currentMentions Mentions today
 * @param previousMentions Mentions yesterday
 */
export function calculateVelocity(currentMentions: number, previousMentions: number): number {
  if (previousMentions === 0) {
    // If it's a brand new hashtag, and it got some mentions, it's infinite growth.
    // We cap it at 1000% for mathematical sanity.
    return currentMentions > 0 ? 1000.0 : 0.0;
  }

  const growth = ((currentMentions - previousMentions) / previousMentions) * 100;
  return Number(growth.toFixed(2));
}

/**
 * Final Trend Score formula.
 * Combines raw volume (likes mapped logarithmically) + time-decayed engagement quality.
 */
export function calculateFinalTrendScore(likes: number, decayedEngagementScore: number): number {
  // Base 10 log of likes gives us a magnitude (e.g. 1,000,000 likes = 6)
  // We multiply by 10 to give it a 1-100ish scale
  const volumeScore = likes > 0 ? Math.log10(likes) * 10 : 0;
  
  // Final score is a mix of volume and quality
  const finalScore = (volumeScore * 0.4) + (decayedEngagementScore * 0.6);
  return Number(finalScore.toFixed(4));
}
