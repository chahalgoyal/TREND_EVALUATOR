<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { LayoutDashboard, Hash, FileText, Activity, Radar } from 'lucide-svelte';

  interface NavItem {
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
  }

  const navItems: NavItem[] = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/hashtags', label: 'Hashtags', icon: Hash },
    { href: '/posts', label: 'Posts', icon: FileText },
  ];

  let { children } = $props();
</script>

<div class="app-shell">
  <nav class="sidebar">
    <div class="sidebar-brand">
      <div class="brand-icon">
        <Radar size={18} />
      </div>
      <div class="brand-text">
        <span class="brand-name">TrendPulse</span>
        <span class="brand-sub">Analytics Dashboard</span>
      </div>
    </div>

    <div class="nav-section">
      <span class="nav-section-label">Navigation</span>
      <ul class="nav-list">
        {#each navItems as item}
          <li>
            <a
              href={item.href}
              class="nav-link"
              class:active={$page.url.pathname === item.href || ($page.url.pathname.startsWith(item.href) && item.href !== '/')}
            >
              <div class="nav-icon">
                <item.icon size={17} strokeWidth={1.8} />
              </div>
              <span>{item.label}</span>
              {#if $page.url.pathname === item.href || ($page.url.pathname.startsWith(item.href) && item.href !== '/')}
                <div class="nav-active-dot"></div>
              {/if}
            </a>
          </li>
        {/each}
      </ul>
    </div>

    <div class="sidebar-footer">
      <div class="system-status">
        <Activity size={13} strokeWidth={2} />
        <span>Live Pipeline</span>
        <div class="status-dot"></div>
      </div>
    </div>
  </nav>

  <main class="main-content">
    {@render children()}
  </main>
</div>

<style>
  .app-shell {
    display: flex;
    min-height: 100vh;
  }

  /* ── Sidebar ── */
  .sidebar {
    width: var(--sidebar-width);
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 50;
    overflow-y: auto;
  }

  /* ── Brand ── */
  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-xl) var(--space-xl) var(--space-2xl);
  }

  .brand-icon {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    background: var(--gradient-brand);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    flex-shrink: 0;
    box-shadow: var(--shadow-glow-blue);
  }

  .brand-name {
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: -0.3px;
    color: var(--text-primary);
  }

  .brand-sub {
    display: block;
    font-size: 0.68rem;
    color: var(--text-muted);
    letter-spacing: 0.2px;
    margin-top: -1px;
  }

  /* ── Nav ── */
  .nav-section {
    flex: 1;
    padding: 0 var(--space-md);
  }

  .nav-section-label {
    display: block;
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    padding: 0 var(--space-md);
    margin-bottom: var(--space-sm);
  }

  .nav-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 0.84rem;
    font-weight: 500;
    transition: all var(--duration-fast) var(--ease-out);
    text-decoration: none;
    position: relative;
  }

  .nav-icon {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast) var(--ease-out);
    background: transparent;
  }

  .nav-link:hover {
    color: var(--text-primary);
    text-decoration: none;
  }

  .nav-link:hover .nav-icon {
    background: var(--bg-elevated);
  }

  .nav-link.active {
    color: var(--accent-blue);
  }

  .nav-link.active .nav-icon {
    background: var(--accent-blue-soft);
    color: var(--accent-blue);
  }

  .nav-active-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent-blue);
    margin-left: auto;
    box-shadow: 0 0 6px var(--accent-blue);
  }

  /* ── Footer ── */
  .sidebar-footer {
    padding: var(--space-lg) var(--space-xl);
    border-top: 1px solid var(--border-subtle);
  }

  .system-status {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: 0.72rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent-green);
    margin-left: auto;
    box-shadow: 0 0 8px rgba(61, 217, 160, 0.5);
    animation: pulse 2s ease-in-out infinite;
  }

  /* ── Main ── */
  .main-content {
    flex: 1;
    margin-left: var(--sidebar-width);
    padding: var(--space-2xl) var(--space-2xl) var(--space-3xl);
    min-width: 0;
    max-width: 100%;
  }

  @media (max-width: 768px) {
    .sidebar {
      width: 100%;
      position: relative;
      flex-direction: row;
      bottom: auto;
      padding: var(--space-sm);
    }

    .main-content {
      margin-left: 0;
      padding: var(--space-lg);
    }

    .sidebar-brand, .nav-section-label, .sidebar-footer {
      display: none;
    }

    .nav-list {
      flex-direction: row;
      gap: var(--space-xs);
    }
  }
</style>
