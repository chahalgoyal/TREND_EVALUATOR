<script lang="ts">
  let { status } = $props<{
    status: 'healthy' | 'degraded' | 'loading' | 'error';
  }>();

  const config: Record<string, { label: string; class: string }> = {
    healthy: { label: 'All Systems Operational', class: 'healthy' },
    degraded: { label: 'Degraded Performance', class: 'degraded' },
    loading: { label: 'Checking Status...', class: 'loading' },
    error: { label: 'Connection Error', class: 'error' },
  };

  let current = $derived(config[status] || config.error);
</script>

<div class="status-pill {current.class}">
  <div class="status-dot"></div>
  <span>{current.label}</span>
</div>

<style>
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-full);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.2px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-card);
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-pill.healthy {
    border-color: rgba(61, 217, 160, 0.2);
    color: var(--accent-green);
  }
  .status-pill.healthy .status-dot {
    background: var(--accent-green);
    box-shadow: 0 0 8px rgba(61, 217, 160, 0.5);
    animation: pulse 2s ease-in-out infinite;
  }

  .status-pill.degraded {
    border-color: rgba(255, 181, 69, 0.2);
    color: var(--accent-amber);
  }
  .status-pill.degraded .status-dot {
    background: var(--accent-amber);
    box-shadow: 0 0 8px rgba(255, 181, 69, 0.5);
  }

  .status-pill.loading {
    color: var(--text-muted);
  }
  .status-pill.loading .status-dot {
    background: var(--text-muted);
    animation: pulse 1s ease-in-out infinite;
  }

  .status-pill.error {
    border-color: rgba(255, 107, 122, 0.2);
    color: var(--accent-red);
  }
  .status-pill.error .status-dot {
    background: var(--accent-red);
    box-shadow: 0 0 8px rgba(255, 107, 122, 0.5);
  }
</style>
