<script lang="ts">
  let { label, value, subtitle = '', icon = '', color = 'blue' } = $props<{
    label: string;
    value: string | number;
    subtitle?: string;
    icon?: string;
    color?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'cyan';
  }>();
</script>

<div class="stat-card" data-color={color}>
  <div class="card-inner">
    <div class="stat-header">
      <span class="stat-label">{label}</span>
      {#if icon}
        <span class="stat-icon">{icon}</span>
      {/if}
    </div>
    <span class="stat-value">{value}</span>
    {#if subtitle}
      <span class="stat-subtitle">{subtitle}</span>
    {/if}
  </div>
  <div class="card-glow"></div>
</div>

<style>
  .stat-card {
    position: relative;
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition: transform var(--duration-normal) var(--ease-out),
                box-shadow var(--duration-normal) var(--ease-out);
    animation: fadeIn var(--duration-slow) var(--ease-out) forwards;
  }

  .stat-card:hover {
    transform: translateY(-2px);
  }

  .card-inner {
    position: relative;
    z-index: 1;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-xl) var(--space-xl) var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    background-image: var(--gradient-card);
  }

  .card-glow {
    position: absolute;
    top: -1px;
    left: 0;
    right: 0;
    height: 2px;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    opacity: 0;
    transition: opacity var(--duration-normal) var(--ease-out);
  }

  .stat-card:hover .card-glow {
    opacity: 1;
  }

  .stat-card[data-color="blue"] .card-glow { background: var(--accent-blue); }
  .stat-card[data-color="green"] .card-glow { background: var(--accent-green); }
  .stat-card[data-color="amber"] .card-glow { background: var(--accent-amber); }
  .stat-card[data-color="red"] .card-glow { background: var(--accent-red); }
  .stat-card[data-color="purple"] .card-glow { background: var(--accent-purple); }
  .stat-card[data-color="cyan"] .card-glow { background: var(--accent-cyan); }

  .stat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stat-label {
    font-size: 0.72rem;
    color: var(--text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .stat-icon {
    font-size: 1rem;
  }

  .stat-value {
    font-size: 1.85rem;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.5px;
    font-family: var(--font-mono);
    animation: countUp var(--duration-slow) var(--ease-out);
  }

  .stat-card[data-color="blue"] .stat-value { color: var(--accent-blue); }
  .stat-card[data-color="green"] .stat-value { color: var(--accent-green); }
  .stat-card[data-color="amber"] .stat-value { color: var(--accent-amber); }
  .stat-card[data-color="red"] .stat-value { color: var(--accent-red); }
  .stat-card[data-color="purple"] .stat-value { color: var(--accent-purple); }
  .stat-card[data-color="cyan"] .stat-value { color: var(--accent-cyan); }

  .stat-subtitle {
    font-size: 0.72rem;
    color: var(--text-secondary);
    margin-top: var(--space-2xs);
  }
</style>
