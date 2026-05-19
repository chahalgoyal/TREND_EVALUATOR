<script lang="ts">
  let { platform, size = 'md' } = $props<{
    platform: string;
    size?: 'sm' | 'md';
  }>();

  let label = $derived(
    platform === 'instagram' ? 'IG' :
    platform === 'youtube' ? 'YT' :
    platform.slice(0, 2).toUpperCase()
  );
</script>

<span class="platform-badge {size}" data-platform={platform}>
  {label}
</span>

<style>
  .platform-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-xs);
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    transition: transform var(--duration-fast) var(--ease-out);
    flex-shrink: 0;
    line-height: 1;
    white-space: nowrap;
  }

  .platform-badge.md {
    padding: 4px 8px;
    font-size: 0.7rem;
  }

  .platform-badge.sm {
    padding: 2px 6px;
    font-size: 0.6rem;
  }

  .platform-badge[data-platform="instagram"] {
    background: var(--instagram-soft);
    color: var(--instagram);
    border: 1px solid rgba(225, 48, 108, 0.15);
  }

  .platform-badge[data-platform="youtube"] {
    background: var(--youtube-soft);
    color: var(--youtube);
    border: 1px solid rgba(255, 59, 59, 0.15);
  }


</style>
