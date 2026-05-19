<script lang="ts">
  import type { TrendingPost } from '$lib/api/client';
  import PlatformBadge from '$lib/components/PlatformBadge.svelte';
  import { Clock, Heart, MessageCircle, Eye, Flame } from 'lucide-svelte';

  let { data } = $props();
  let posts: TrendingPost[] = $derived(data.posts);

  // Platform filter
  let activePlatform = $state('all');
  const platforms = ['all', 'instagram', 'youtube'];

  let filteredPosts = $derived(
    activePlatform === 'all'
      ? posts
      : posts.filter(p => p.platform === activePlatform)
  );

  function formatNumber(n: number): string {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  }

  function cleanCaption(caption: string | null): string {
    if (!caption) return 'No caption available';
    let cleaned = caption
      .replace(/^Instagram\s+Instagram\s+Home\s+Home\s+Reels.*?Follow\s+More options\s+/is, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length > 280) cleaned = cleaned.slice(0, 280) + '…';
    return cleaned || 'No caption available';
  }

  function relativeTime(dateStr: string | null): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days > 365) return Math.floor(days / 365) + 'y ago';
    if (days > 30) return Math.floor(days / 30) + 'mo ago';
    if (days > 7) return Math.floor(days / 7) + 'w ago';
    if (days > 0) return days + 'd ago';
    return 'Today';
  }

  function scoreColor(score: number): string {
    if (score >= 35) return 'var(--accent-red)';
    if (score >= 25) return 'var(--accent-amber)';
    if (score >= 15) return 'var(--accent-green)';
    return 'var(--accent-blue)';
  }
</script>

<svelte:head>
  <title>Top Posts — TrendPulse</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <h1 class="page-title">Posts Feed</h1>
      <p class="page-desc">All scraped posts ranked by trend score</p>
    </div>
    <div class="post-count">
      <span class="count-num">{filteredPosts.length}</span>
      <span class="count-label">posts</span>
    </div>
  </header>

  <!-- Platform Filter Tabs -->
  <div class="filter-tabs">
    {#each platforms as p}
      <button
        class="filter-tab"
        class:active={activePlatform === p}
        onclick={() => activePlatform = p}
      >
        {p === 'all' ? 'All Platforms' : p.charAt(0).toUpperCase() + p.slice(1)}
        {#if p !== 'all'}
          <span class="tab-count">{posts.filter(post => post.platform === p).length}</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Posts Grid -->
  {#if filteredPosts.length === 0}
    <div class="empty-state">No posts found for this filter</div>
  {:else}
    <div class="posts-grid">
      {#each filteredPosts as post, i}
        <article class="post-card" data-platform={post.platform} style="animation-delay: {i * 40}ms">
          <!-- Card Header -->
          <div class="post-header">
            <PlatformBadge platform={post.platform} />
            <div class="score-badge" style="color: {scoreColor(Number(post.total_trend_score))}">
              <Flame size={13} strokeWidth={2} />
              <span class="mono">{Number(post.total_trend_score).toFixed(1)}</span>
            </div>
          </div>

          <!-- Caption -->
          <p class="post-caption">
            {cleanCaption(post.caption)}
          </p>

          <!-- Metrics -->
          <div class="post-metrics">
            <div class="metric">
              <div class="metric-icon"><Heart size={13} strokeWidth={1.8} /></div>
              <div class="metric-data">
                <span class="metric-value mono">{formatNumber(Number(post.likes))}</span>
                <span class="metric-label">Likes</span>
              </div>
            </div>
            <div class="metric">
              <div class="metric-icon"><MessageCircle size={13} strokeWidth={1.8} /></div>
              <div class="metric-data">
                <span class="metric-value mono">{formatNumber(Number(post.comments))}</span>
                <span class="metric-label">Comments</span>
              </div>
            </div>
            {#if Number(post.views) > 0}
              <div class="metric">
                <div class="metric-icon"><Eye size={13} strokeWidth={1.8} /></div>
                <div class="metric-data">
                  <span class="metric-value mono">{formatNumber(Number(post.views))}</span>
                  <span class="metric-label">Views</span>
                </div>
              </div>
            {/if}
          </div>

          <!-- Footer -->
          <div class="post-footer">
            <div class="engagement-bar">
              <span class="eng-label">Engagement</span>
              <span class="eng-value mono">{Number(post.engagement_rate).toFixed(1)}%</span>
            </div>
            {#if post.posted_at}
              <div class="post-date">
                <Clock size={11} strokeWidth={2} />
                {relativeTime(post.posted_at)}
              </div>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page { max-width: 1280px; }

  /* ── Header ── */
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-xl);
    flex-wrap: wrap;
    gap: var(--space-md);
  }

  .page-title { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.3px; }
  .page-desc { color: var(--text-muted); font-size: 0.82rem; margin-top: 3px; }

  .post-count {
    display: flex;
    align-items: baseline;
    gap: var(--space-xs);
  }

  .count-num {
    font-size: 1.5rem;
    font-weight: 700;
    font-family: var(--font-mono);
    color: var(--accent-blue);
  }

  .count-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  /* ── Filter Tabs ── */
  .filter-tabs {
    display: flex;
    gap: var(--space-xs);
    margin-bottom: var(--space-2xl);
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 0;
  }

  .filter-tab {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    font-size: 0.82rem;
    font-weight: 600;
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
    margin-bottom: -1px;
  }

  .filter-tab:hover {
    color: var(--text-primary);
  }

  .filter-tab.active {
    color: var(--accent-blue);
    border-bottom-color: var(--accent-blue);
  }

  .tab-count {
    padding: 1px 6px;
    border-radius: var(--radius-full);
    font-size: 0.65rem;
    font-weight: 700;
    background: var(--bg-card);
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
    font-family: var(--font-mono);
  }

  .filter-tab.active .tab-count {
    background: var(--accent-blue-soft);
    color: var(--accent-blue);
    border-color: rgba(99, 138, 255, 0.2);
  }

  /* ── Posts Grid ── */
  .posts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: var(--space-lg);
  }

  .empty-state {
    color: var(--text-muted);
    font-size: 0.82rem;
    padding: var(--space-3xl) 0;
    text-align: center;
  }

  /* ── Post Card ── */
  .post-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    transition: all var(--duration-normal) var(--ease-out);
    background-image: var(--gradient-card);
    animation: fadeIn var(--duration-normal) var(--ease-out) both;
    position: relative;
    overflow: hidden;
  }

  .post-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    opacity: 0;
    transition: opacity var(--duration-normal);
  }

  .post-card[data-platform="instagram"]::before {
    background: linear-gradient(90deg, #833ab4, #e1306c, #fcaf45);
  }

  .post-card[data-platform="youtube"]::before {
    background: var(--youtube);
  }

  .post-card:hover {
    border-color: var(--border-active);
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
  }

  .post-card:hover::before {
    opacity: 1;
  }

  .post-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .score-badge {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.8rem;
    font-weight: 700;
  }

  .post-caption {
    font-size: 0.82rem;
    color: var(--text-secondary);
    line-height: 1.55;
    flex: 1;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* ── Metrics ── */
  .post-metrics {
    display: flex;
    gap: var(--space-xl);
  }

  .metric {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .metric-icon {
    color: var(--text-muted);
  }

  .metric-data {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .metric-value {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.2;
  }

  .metric-label {
    font-size: 0.6rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-weight: 500;
  }

  /* ── Footer ── */
  .post-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: var(--space-md);
    border-top: 1px solid var(--border-subtle);
  }

  .engagement-bar {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .eng-label {
    font-size: 0.68rem;
    color: var(--text-muted);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .eng-value {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--accent-green);
  }

  .post-date {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  @media (max-width: 768px) {
    .posts-grid { grid-template-columns: 1fr; }
    .post-metrics { flex-wrap: wrap; gap: var(--space-md); }
  }
</style>
