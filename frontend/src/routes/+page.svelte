<script lang="ts">
  import StatCard from '$lib/components/StatCard.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import PlatformBadge from '$lib/components/PlatformBadge.svelte';
  import TrendBadge from '$lib/components/TrendBadge.svelte';
  import HorizontalBar from '$lib/charts/HorizontalBar.svelte';
  import type { TrendingPost, TopHashtag, BreakoutHashtag } from '$lib/api/client';
  import { TrendingUp, ArrowUpRight, Zap, Hash, BarChart3, Clock } from 'lucide-svelte';

  let { data } = $props();

  let systemStatus = $derived(
    (data.health ? data.health.status : 'error') as 'healthy' | 'degraded' | 'error' | 'loading'
  );

  let trendingPosts: TrendingPost[] = $derived(data.trendingPosts);
  let topHashtags: TopHashtag[] = $derived(data.topHashtags);
  let breakouts: BreakoutHashtag[] = $derived(data.breakouts);

  let topScore = $derived(
    trendingPosts.length > 0
      ? Number(trendingPosts[0].total_trend_score).toFixed(1)
      : '—'
  );

  let totalPosts = $derived(trendingPosts.length);

  let platformSplit = $derived(() => {
    const counts: Record<string, number> = {};
    trendingPosts.forEach(p => {
      counts[p.platform] = (counts[p.platform] || 0) + 1;
    });
    return counts;
  });

  function formatNumber(n: number): string {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  }

  function cleanCaption(caption: string | null): string {
    if (!caption) return 'No caption';
    // Strip Instagram navigation debris
    let cleaned = caption
      .replace(/^Instagram\s+Instagram\s+Home\s+Home\s+Reels.*?Follow\s+More options\s+/is, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length > 120) cleaned = cleaned.slice(0, 120) + '…';
    return cleaned || 'No caption';
  }

  function relativeTime(dateStr: string | null): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days > 365) return Math.floor(days / 365) + 'y ago';
    if (days > 30) return Math.floor(days / 30) + 'mo ago';
    if (days > 0) return days + 'd ago';
    return 'Today';
  }
</script>

<svelte:head>
  <title>Dashboard — TrendPulse</title>
</svelte:head>

<div class="page">
  <!-- Header -->
  <header class="page-header">
    <div class="header-left">
      <h1 class="page-title">Dashboard</h1>
      <p class="page-desc">Real-time trend analysis across Instagram & YouTube</p>
    </div>
    <div class="header-right">
      <StatusPill status={systemStatus} />
    </div>
  </header>

  <!-- Stats Row -->
  <section class="stats-grid">
    <StatCard label="Top Trend Score" value={topScore} icon="🔥" color="blue" subtitle="Highest scoring post" />
    <StatCard label="Breakout Tags" value={breakouts.length} icon="⚡" color="green" subtitle="Velocity > 500%" />
    <StatCard label="Hashtags Tracked" value={topHashtags.length} icon="＃" color="purple" subtitle="Last 7 days" />
    <StatCard label="Posts Analyzed" value={totalPosts} icon="📊" color="amber" subtitle="Top ranked" />
  </section>

  <!-- Two Column Grid -->
  <div class="grid-two">
    <!-- Top Hashtags Chart -->
    <section class="card">
      <div class="card-header">
        <div class="card-title">
          <BarChart3 size={15} strokeWidth={2} />
          <span>Top Hashtags</span>
        </div>
        <span class="card-meta">by mentions · 7d</span>
      </div>
      {#if topHashtags.length > 0}
        <HorizontalBar
          labels={topHashtags.slice(0, 10).map(h => '#' + h.tag)}
          values={topHashtags.slice(0, 10).map(h => h.total_mentions)}
          color="#638aff"
        />
      {:else}
        <div class="empty-state">No hashtag data yet</div>
      {/if}
    </section>

    <!-- Breakout Tags -->
    <section class="card">
      <div class="card-header">
        <div class="card-title">
          <Zap size={15} strokeWidth={2} />
          <span>Breakout Hashtags</span>
        </div>
        <span class="card-meta">{breakouts.length} detected</span>
      </div>
      {#if breakouts.length > 0}
        <div class="breakout-grid">
          {#each breakouts.slice(0, 12) as b, i}
            <a
              href="/hashtags?search={b.tag}"
              class="breakout-chip"
              style="animation-delay: {i * 40}ms"
            >
              <span class="breakout-tag">#{b.tag}</span>
              <TrendBadge velocity={Number(b.velocity_percentage)} compact />
            </a>
          {/each}
        </div>
        {#if breakouts.length > 12}
          <a href="/hashtags" class="see-all">
            View all {breakouts.length} breakouts
            <ArrowUpRight size={13} />
          </a>
        {/if}
      {:else}
        <div class="empty-state">No breakouts detected today</div>
      {/if}
    </section>
  </div>

  <!-- Trending Posts Table -->
  <section class="card">
    <div class="card-header">
      <div class="card-title">
        <TrendingUp size={15} strokeWidth={2} />
        <span>Trending Posts</span>
      </div>
      <span class="card-meta">ranked by trend score</span>
    </div>
    {#if trendingPosts.length > 0}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="th-rank">#</th>
              <th>Platform</th>
              <th>Caption</th>
              <th class="th-num">Likes</th>
              <th class="th-num">Comments</th>
              <th class="th-num">Engagement</th>
              <th class="th-num">Score</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {#each trendingPosts as post, i}
              <tr style="animation-delay: {i * 30}ms">
                <td class="cell-rank">{i + 1}</td>
                <td>
                  <PlatformBadge platform={post.platform} />
                </td>
                <td class="cell-caption">
                  <span class="caption-text">{cleanCaption(post.caption)}</span>
                </td>
                <td class="cell-num mono">{formatNumber(Number(post.likes))}</td>
                <td class="cell-num mono">{formatNumber(Number(post.comments))}</td>
                <td class="cell-num mono">{Number(post.engagement_rate).toFixed(1)}%</td>
                <td class="cell-score mono">{Number(post.total_trend_score).toFixed(1)}</td>
                <td class="cell-date">
                  {#if post.posted_at}
                    <span class="date-text">
                      <Clock size={11} />
                      {relativeTime(post.posted_at)}
                    </span>
                  {:else}
                    <span class="date-na">—</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="empty-state">No trending posts found</div>
    {/if}
  </section>
</div>

<style>
  .page {
    max-width: 1280px;
  }

  /* ── Header ── */
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-2xl);
    flex-wrap: wrap;
    gap: var(--space-md);
  }

  .page-title {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.3px;
    color: var(--text-primary);
  }

  .page-desc {
    color: var(--text-muted);
    font-size: 0.82rem;
    margin-top: 3px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  /* ── Stats ── */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-lg);
    margin-bottom: var(--space-2xl);
  }

  /* ── Grid ── */
  .grid-two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-lg);
    margin-bottom: var(--space-2xl);
  }

  /* ── Card ── */
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-xl);
    background-image: var(--gradient-card);
    animation: fadeIn var(--duration-slow) var(--ease-out) forwards;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-xl);
  }

  .card-title {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .card-meta {
    font-size: 0.7rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  .empty-state {
    color: var(--text-muted);
    font-size: 0.82rem;
    padding: var(--space-3xl) 0;
    text-align: center;
  }

  /* ── Breakout Grid ── */
  .breakout-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .breakout-chip {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    text-decoration: none;
    transition: all var(--duration-fast) var(--ease-out);
    animation: fadeIn var(--duration-normal) var(--ease-out) both;
  }

  .breakout-chip:hover {
    border-color: var(--border-active);
    background: var(--bg-elevated);
    transform: translateY(-1px);
    text-decoration: none;
  }

  .breakout-tag {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .see-all {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-top: var(--space-lg);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent-blue);
    text-decoration: none;
    transition: gap var(--duration-fast) var(--ease-out);
  }

  .see-all:hover {
    gap: var(--space-sm);
    text-decoration: none;
  }

  /* ── Table ── */
  .table-wrap {
    overflow-x: auto;
    margin: 0 calc(-1 * var(--space-xl));
    padding: 0 var(--space-xl);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  th {
    text-align: left;
    padding: var(--space-sm) var(--space-md);
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    border-bottom: 1px solid var(--border-default);
    white-space: nowrap;
  }

  .th-rank { width: 36px; text-align: center; }
  .th-num { text-align: right; }

  td {
    padding: var(--space-md) var(--space-md);
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    vertical-align: middle;
  }

  tr {
    transition: background var(--duration-fast);
    animation: fadeIn var(--duration-normal) var(--ease-out) both;
  }

  tbody tr:hover td {
    background: var(--bg-card-hover);
  }

  .cell-rank {
    text-align: center;
    font-weight: 700;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .cell-caption {
    max-width: 320px;
  }

  .caption-text {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--text-primary);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .cell-num {
    text-align: right;
    font-size: 0.78rem;
    color: var(--text-secondary);
  }

  .cell-score {
    text-align: right;
    font-weight: 700;
    color: var(--accent-blue);
    font-size: 0.82rem;
  }

  .cell-date {
    white-space: nowrap;
  }

  .date-text {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  .date-na {
    color: var(--text-muted);
    font-size: 0.72rem;
  }

  @media (max-width: 1024px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .grid-two { grid-template-columns: 1fr; }
  }

  @media (max-width: 640px) {
    .stats-grid { grid-template-columns: 1fr; }
  }
</style>
