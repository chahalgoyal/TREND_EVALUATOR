<script lang="ts">
  import LineChart from '$lib/charts/LineChart.svelte';
  import TrendBadge from '$lib/components/TrendBadge.svelte';
  import {
    fetchHashtagHistory,
    type TopHashtag,
    type BreakoutHashtag,
    type HashtagHistoryPoint,
  } from '$lib/api/client';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { Search, TrendingUp, X, ArrowUpDown, ChevronUp, ChevronDown, Filter } from 'lucide-svelte';

  let { data } = $props();

  let topHashtags: TopHashtag[] = $derived(data.topHashtags);
  let breakouts: BreakoutHashtag[] = $derived(data.breakouts);

  let allHashtags = $derived(() => {
    const map = new Map<string, TopHashtag>();
    for (const h of topHashtags) {
      map.set(h.tag, { ...h });
    }
    for (const b of breakouts) {
      if (!map.has(b.tag)) {
        map.set(b.tag, {
          tag: b.tag,
          total_mentions: b.mentions_count || 0,
          peak_velocity: b.velocity_percentage || 0,
          active_days: 1
        });
      }
    }
    return Array.from(map.values());
  });

  let searchQuery = $state('');

  onMount(() => {
    const q = $page.url.searchParams.get('search');
    if (q) {
      searchQuery = q;
      if (allHashtags().some(h => h.tag === q)) {
        selectTag(q);
      }
    }
  });

  // Sort state
  type SortKey = 'tag' | 'total_mentions' | 'peak_velocity' | 'active_days' | 'status';
  let sortKey = $state<SortKey>('total_mentions');
  let sortDir = $state<'asc' | 'desc'>('desc');

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      sortKey = key;
      sortDir = 'desc';
    }
  }

  // Detail panel state
  let selectedTag = $state<string | null>(null);
  let tagHistory = $state<HashtagHistoryPoint[]>([]);
  let historyLoading = $state(false);

  async function selectTag(tag: string) {
    selectedTag = tag;
    historyLoading = true;
    try {
      tagHistory = await fetchHashtagHistory(tag);
    } catch {
      tagHistory = [];
    } finally {
      historyLoading = false;
    }
  }

  function closeDetail() {
    selectedTag = null;
    tagHistory = [];
  }

  let filteredHashtags = $derived(() => {
    const baseList = allHashtags();
    let list = searchQuery.trim()
      ? baseList.filter(h => h.tag.includes(searchQuery.toLowerCase().replace('#', '')))
      : [...baseList];

    list.sort((a, b) => {
      if (sortKey === 'status') {
        const vA = getBreakoutVelocity(a.tag) || Number(a.peak_velocity) || 0;
        const vB = getBreakoutVelocity(b.tag) || Number(b.peak_velocity) || 0;
        return sortDir === 'asc' ? vA - vB : vB - vA;
      }
      const av = sortKey === 'tag' ? a.tag : Number(a[sortKey]);
      const bv = sortKey === 'tag' ? b.tag : Number(b[sortKey]);
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

    return list;
  });

  function getBreakoutVelocity(tag: string): number | null {
    const b = breakouts.find(br => br.tag === tag);
    return b ? Number(b.velocity_percentage) : null;
  }

  let selectedHashtagData = $derived(() => {
    if (!selectedTag) return null;
    return allHashtags().find(h => h.tag === selectedTag) || null;
  });
</script>

<svelte:head>
  <title>Hashtag Explorer — TrendPulse</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <h1 class="page-title">Hashtag Explorer</h1>
      <p class="page-desc">Analyze hashtag performance, velocity trends, and breakout detection</p>
    </div>
    <div class="header-meta">
      <span class="meta-tag">{allHashtags().length} hashtags</span>
      <span class="meta-tag accent">{breakouts.length} breakouts</span>
    </div>
  </header>

  <!-- Search -->
  <div class="search-bar">
    <Search size={15} strokeWidth={2} />
    <input
      type="text"
      placeholder="Search hashtags..."
      bind:value={searchQuery}
      id="hashtag-search"
    />
    {#if searchQuery}
      <button class="search-clear" onclick={() => searchQuery = ''}>
        <X size={14} />
      </button>
    {/if}
  </div>

  <!-- Active Filters Bar -->
  <div class="active-filters">
    <div class="filters-inner">
      <Filter size={14} />
      <span class="filter-label">Current View:</span>
      {#if searchQuery}
        <span class="filter-chip filter-chip-interactive">
          Search: <strong>{searchQuery}</strong>
          <button class="chip-remove" onclick={() => searchQuery = ''}><X size={12} /></button>
        </span>
      {/if}
      <span class="filter-chip">
        Sorted by: <strong>{sortKey.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} ({sortDir === 'asc' ? 'Ascending' : 'Descending'})</strong>
      </span>
    </div>
  </div>

  <div class="content-layout" class:has-detail={selectedTag !== null}>
    <!-- Table -->
    <section class="card table-section">
      {#if filteredHashtags().length === 0}
        <div class="empty-state">No hashtags match your search</div>
      {:else}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th onclick={() => toggleSort('tag')}>
                  <span class="th-sortable">
                    Hashtag
                    {#if sortKey === 'tag'}
                      {#if sortDir === 'asc'}<ChevronUp size={12} />{:else}<ChevronDown size={12} />{/if}
                    {/if}
                  </span>
                </th>
                <th class="th-num" onclick={() => toggleSort('total_mentions')}>
                  <span class="th-sortable th-sort-right">
                    Mentions
                    {#if sortKey === 'total_mentions'}
                      {#if sortDir === 'asc'}<ChevronUp size={12} />{:else}<ChevronDown size={12} />{/if}
                    {/if}
                  </span>
                </th>
                <th class="th-num" onclick={() => toggleSort('peak_velocity')}>
                  <span class="th-sortable th-sort-right">
                    Peak Velocity
                    {#if sortKey === 'peak_velocity'}
                      {#if sortDir === 'asc'}<ChevronUp size={12} />{:else}<ChevronDown size={12} />{/if}
                    {/if}
                  </span>
                </th>
                <th class="th-num" onclick={() => toggleSort('active_days')}>
                  <span class="th-sortable th-sort-right">
                    Active
                    {#if sortKey === 'active_days'}
                      {#if sortDir === 'asc'}<ChevronUp size={12} />{:else}<ChevronDown size={12} />{/if}
                    {/if}
                  </span>
                </th>
                <th onclick={() => toggleSort('status')}>
                  <span class="th-sortable">
                    Status
                    {#if sortKey === 'status'}
                      {#if sortDir === 'asc'}<ChevronUp size={12} />{:else}<ChevronDown size={12} />{/if}
                    {/if}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {#each filteredHashtags() as hashtag, i}
                {@const velocity = getBreakoutVelocity(hashtag.tag)}
                <tr
                  class:selected={selectedTag === hashtag.tag}
                  onclick={() => selectTag(hashtag.tag)}
                  style="animation-delay: {i * 20}ms"
                >
                  <td class="cell-tag">#{hashtag.tag}</td>
                  <td class="cell-num mono">{hashtag.total_mentions.toLocaleString()}</td>
                  <td class="cell-num">
                    {#if Number(hashtag.peak_velocity) > 0}
                      <TrendBadge velocity={Number(hashtag.peak_velocity)} compact />
                    {:else}
                      <span class="text-muted mono">0%</span>
                    {/if}
                  </td>
                  <td class="cell-num mono">{hashtag.active_days}d</td>
                  <td>
                    {#if velocity !== null && velocity > 500}
                      <span class="breakout-badge">
                        <TrendingUp size={11} strokeWidth={2.5} /> Breakout
                      </span>
                    {:else if velocity !== null && velocity > 0}
                      <span class="trending-badge">Trending</span>
                    {:else if velocity !== null && velocity < 0}
                      <span class="declining-badge">Declining</span>
                    {:else}
                      <span class="stable-badge">Stable</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>

    <!-- Detail Panel -->
    {#if selectedTag}
      <section class="card detail-panel">
        <div class="detail-header">
          <div class="detail-title-row">
            <h2>#{selectedTag}</h2>
            {#if selectedHashtagData()}
              <TrendBadge velocity={Number(selectedHashtagData()?.peak_velocity || 0)} />
            {/if}
          </div>
          <button class="close-btn" onclick={closeDetail}>
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        {#if selectedHashtagData()}
          <div class="detail-stats">
            <div class="detail-stat">
              <span class="detail-stat-value mono">{selectedHashtagData()?.total_mentions.toLocaleString()}</span>
              <span class="detail-stat-label">Total Mentions</span>
            </div>
            <div class="detail-stat">
              <span class="detail-stat-value mono">{Number(selectedHashtagData()?.peak_velocity).toFixed(0)}%</span>
              <span class="detail-stat-label">Peak Velocity</span>
            </div>
            <div class="detail-stat">
              <span class="detail-stat-value mono">{selectedHashtagData()?.active_days}d</span>
              <span class="detail-stat-label">Active Days</span>
            </div>
          </div>
        {/if}

        {#if historyLoading}
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <span>Loading history...</span>
          </div>
        {:else if tagHistory.length > 0}
          <div class="chart-section">
            <h3 class="chart-label">Daily Mentions</h3>
            <LineChart
              labels={tagHistory.map(h => h.date.slice(5))}
              datasets={[{
                label: 'Mentions',
                data: tagHistory.map(h => h.mentions),
                color: '#638aff',
                fill: true,
              }]}
              height={220}
            />
          </div>

          <div class="chart-section">
            <h3 class="chart-label">Velocity (%)</h3>
            <LineChart
              labels={tagHistory.map(h => h.date.slice(5))}
              datasets={[{
                label: 'Velocity',
                data: tagHistory.map(h => Number(h.velocity)),
                color: '#3dd9a0',
                fill: false,
              }]}
              height={220}
            />
          </div>
        {:else}
          <div class="empty-state">No history data available</div>
        {/if}
      </section>
    {/if}
  </div>
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

  .header-meta {
    display: flex;
    gap: var(--space-sm);
  }

  .meta-tag {
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-full);
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-secondary);
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
  }

  .meta-tag.accent {
    color: var(--accent-green);
    border-color: rgba(61, 217, 160, 0.2);
  }

  /* ── Search ── */
  .search-bar {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-xl);
    color: var(--text-muted);
    transition: border-color var(--duration-fast);
  }

  .search-bar:focus-within {
    border-color: var(--accent-blue);
    box-shadow: 0 0 0 3px var(--accent-blue-soft);
  }

  .search-bar input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-size: 0.85rem;
    font-family: var(--font-sans);
  }

  .search-bar input::placeholder { color: var(--text-muted); }

  .search-clear {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    padding: 4px;
    border-radius: var(--radius-xs);
    transition: color var(--duration-fast);
  }

  .search-clear:hover { color: var(--text-primary); }

  /* ── Active Filters ── */
  .active-filters {
    margin-bottom: var(--space-xl);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-card);
    border: 1px dashed var(--border-active);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
  }

  .filters-inner {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .filter-label {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .filter-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 3px 8px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
  }

  .filter-chip strong {
    color: var(--text-primary);
  }

  .filter-chip-interactive {
    padding-right: 4px;
  }

  .chip-remove {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    padding: 2px;
    border-radius: var(--radius-xs);
  }

  .chip-remove:hover {
    background: var(--bg-card-hover);
    color: var(--accent-red);
  }

  /* ── Content Layout ── */
  .content-layout {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-lg);
  }

  .content-layout.has-detail {
    grid-template-columns: 1fr 420px;
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

  .empty-state {
    color: var(--text-muted);
    font-size: 0.82rem;
    padding: var(--space-3xl) 0;
    text-align: center;
  }

  /* ── Table ── */
  .table-wrap { overflow-x: auto; }

  table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }

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

  th[onclick] {
    cursor: pointer;
    user-select: none;
  }

  th[onclick]:hover {
    color: var(--text-primary);
  }

  .th-sortable {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    transition: color var(--duration-fast);
  }

  .th-sort-right {
    float: right;
  }

  .th-num { text-align: right; }

  td {
    padding: var(--space-md) var(--space-md);
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    vertical-align: middle;
  }

  tr {
    cursor: pointer;
    transition: background var(--duration-fast);
    animation: fadeIn var(--duration-normal) var(--ease-out) both;
  }

  tbody tr:hover td { background: var(--bg-card-hover); }

  tr.selected td {
    background: var(--bg-elevated);
    border-left: 2px solid var(--accent-blue);
  }

  .cell-tag {
    color: var(--text-primary);
    font-weight: 600;
    font-size: 0.84rem;
  }

  .cell-num { text-align: right; }
  .text-muted { color: var(--text-muted); }

  .breakout-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 0.65rem;
    font-weight: 700;
    background: var(--accent-green-soft);
    color: var(--accent-green);
    border: 1px solid rgba(61, 217, 160, 0.15);
  }

  .trending-badge, .declining-badge, .stable-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 0.65rem;
    font-weight: 600;
  }

  .trending-badge {
    background: rgba(61, 217, 160, 0.08);
    color: var(--accent-green);
  }

  .declining-badge {
    background: rgba(255, 107, 122, 0.08);
    color: var(--accent-red);
  }

  .stable-badge {
    background: var(--bg-elevated);
    color: var(--text-muted);
  }

  /* ── Detail Panel ── */
  .detail-panel {
    position: sticky;
    top: var(--space-2xl);
    max-height: calc(100vh - 80px);
    overflow-y: auto;
    animation: slideInRight var(--duration-normal) var(--ease-out) forwards;
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-xl);
  }

  .detail-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .detail-header h2 {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .close-btn {
    background: none;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    padding: 6px;
    cursor: pointer;
    display: flex;
    transition: all var(--duration-fast);
  }

  .close-btn:hover {
    color: var(--text-primary);
    background: var(--bg-elevated);
    border-color: var(--border-active);
  }

  /* ── Detail Stats ── */
  .detail-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-md);
    margin-bottom: var(--space-xl);
    padding: var(--space-lg);
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-subtle);
  }

  .detail-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2xs);
  }

  .detail-stat-value {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--accent-blue);
  }

  .detail-stat-label {
    font-size: 0.65rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }

  /* ── Loading ── */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-3xl) 0;
    color: var(--text-muted);
    font-size: 0.82rem;
  }

  .loading-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--border-subtle);
    border-top-color: var(--accent-blue);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Charts ── */
  .chart-section { margin-bottom: var(--space-xl); }

  .chart-label {
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-bottom: var(--space-md);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  @media (max-width: 1024px) {
    .content-layout.has-detail { grid-template-columns: 1fr; }
    .detail-panel { position: relative; top: 0; max-height: none; }
  }
</style>
