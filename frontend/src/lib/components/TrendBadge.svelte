<script lang="ts">
  import { ArrowUpRight } from 'lucide-svelte';

  let { velocity, compact = false } = $props<{
    velocity: number;
    compact?: boolean;
  }>();

  let tier = $derived(
    velocity >= 5000 ? 'extreme' :
    velocity >= 2000 ? 'high' :
    velocity >= 500 ? 'medium' :
    'low'
  );
</script>

<span class="trend-badge {tier}" class:compact>
  <ArrowUpRight size={compact ? 10 : 12} strokeWidth={2.5} />
  <span>{velocity.toFixed(0)}%</span>
</span>

<style>
  .trend-badge {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 0.72rem;
    font-weight: 700;
    font-family: var(--font-mono);
    white-space: nowrap;
    transition: transform var(--duration-fast) var(--ease-spring);
  }

  .trend-badge:hover {
    transform: scale(1.05);
  }

  .trend-badge.compact {
    padding: 1px 6px;
    font-size: 0.65rem;
  }

  .trend-badge.extreme {
    background: rgba(255, 107, 122, 0.15);
    color: var(--accent-red);
    border: 1px solid rgba(255, 107, 122, 0.25);
    animation: glowPulse 2s ease-in-out infinite;
  }

  .trend-badge.high {
    background: var(--accent-green-soft);
    color: var(--accent-green);
    border: 1px solid rgba(61, 217, 160, 0.2);
  }

  .trend-badge.medium {
    background: var(--accent-amber-soft);
    color: var(--accent-amber);
    border: 1px solid rgba(255, 181, 69, 0.2);
  }

  .trend-badge.low {
    background: var(--accent-blue-soft);
    color: var(--accent-blue);
    border: 1px solid rgba(99, 138, 255, 0.15);
  }

  @keyframes glowPulse {
    0%, 100% { box-shadow: 0 0 4px rgba(255, 107, 122, 0.15); }
    50% { box-shadow: 0 0 12px rgba(255, 107, 122, 0.3); }
  }
</style>
