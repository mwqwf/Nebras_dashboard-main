<!--
  Sidebar.svelte — Dashboard navigation sidebar
  Layout: Logo top → Nav middle (scrollable) → User + Logout bottom
  Matches the Futirify-style reference layout.
-->

<script>
	import { getAuthState } from '$lib/stores/auth.svelte.js';
	import { page } from '$app/state';
	import { t } from '$lib/i18n/store.svelte.js';

	let { isOpen = $bindable(false) } = $props();

	const authState = getAuthState();

	let currentPath = $derived(page.url?.pathname || '');

	let displayName = $derived(
		authState.user?.first_name
			? `${authState.user.first_name} ${authState.user.last_name || ''}`.trim()
			: authState.user?.username || 'User'
	);
	let userEmail = $derived(authState.user?.email || '');
	let userRole = $derived('User');

	// ─── Menu Items ────────────────────────────────────────

	let menuItems = $derived([
		{ label: t('common.dashboard'), href: '/moderator', icon: 'dashboard' },
		{ label: t('common.sections'), href: '/moderator/sections', icon: 'sections' },
		{ label: t('common.content'), href: '/moderator/content/files', icon: 'content' },
		{ label: t('content.multi_upload'), href: '/moderator/content/multi', icon: 'multiUpload' },
		{ label: t('common.chat'), href: '/moderator/chat', icon: 'chat' }
	]);

	function isActive(href) {
		if (!href) return false;
		if (href === '/moderator') {
			return currentPath === href;
		}
		return currentPath.startsWith(href);
	}

	function hasActiveChild(item) {
		if (!item.children) return false;
		return item.children.some((child) => isActive(child.href));
	}

	function handleNavClick() {
		if (window.innerWidth <= 1024) {
			isOpen = false;
		}
	}

	const icons = {
		dashboard: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
		stats: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
		sections: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
		content: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
		multiUpload: 'M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M8 10l4-4 4 4M12 6v10',
		chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z'
	};
</script>

<aside class="sidebar {isOpen ? 'open' : ''}" id="sidebar">
	<!-- ─── Top: Logo ────────────────────────────── -->
	<div class="sidebar-top">
		<a href="/moderator" class="app-brand">
			<div class="brand-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z" />
				</svg>
			</div>
			<span class="brand-name">Nebras</span>
		</a>
	</div>

	<!-- ─── Middle: Navigation (scrollable) ──────── -->
	<nav class="sidebar-nav" id="sidebar-nav">
		{#each menuItems as item}
			{#if item.children}
				<!-- Parent with children -->
				<div class="nav-group" class:active={hasActiveChild(item)}>
					<div class="nav-group-label">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
							stroke-linecap="round" stroke-linejoin="round" class="nav-icon">
							<path d={icons[item.icon]} />
						</svg>
						<span>{item.label}</span>
					</div>
					<div class="nav-children">
						{#each item.children as child}
							<a
								href={child.href}
								class="nav-child-link"
								class:active={isActive(child.href)}
								onclick={handleNavClick}
							>
								<span class="child-dot"></span>
								<span>{child.label}</span>
							</a>
						{/each}
					</div>
				</div>
			{:else}
				<!-- Single link -->
				<a
					href={item.href}
					class="nav-link"
					class:active={isActive(item.href)}
					onclick={handleNavClick}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
						stroke-linecap="round" stroke-linejoin="round" class="nav-icon">
						<path d={icons[item.icon]} />
					</svg>
					<span>{item.label}</span>
				</a>
			{/if}
		{/each}
	</nav>

	<!-- ─── Bottom: User ───── -->
	<div class="sidebar-bottom">
		<!-- User info -->
		<div class="user-info">
			<div class="avatar">
				{#if authState.user?.profile?.profile_image}
					<img src={authState.user.profile.profile_image} alt="Avatar" />
				{:else}
					<span class="avatar-letter">{displayName.charAt(0).toUpperCase()}</span>
				{/if}
			</div>
			<div class="user-details">
				<span class="user-name">{displayName}</span>
				<span class="user-email">{userEmail || userRole}</span>
			</div>
		</div>

	</div>
</aside>

<style>
	/* ─── Sidebar Shell ──────────────────────────── */
	.sidebar {
		position: fixed;
		top: 0;
		inset-inline-start: 0;
		bottom: 0;
		width: 240px;
		background: var(--color-sidebar-bg);
		border-inline-end: 1px solid var(--color-sidebar-border);
		display: flex;
		flex-direction: column;
		z-index: 50;
		transition: transform 0.3s ease;
	}

	/* Mobile styles */
	@media (max-width: 1024px) {
		.sidebar {
			transform: translateX(-100%);
		}

		/* The default is LTR, so -100% hides it. 
		   If the layout is RTL (Arabic), maybe it needs different translation, 
		   but let's use standard -100% or we can rely on logical properties but transform doesn't have logical variants yet without using `html[dir="rtl"]`. 
		   Let's check if the current project supports RTL. */
		:global(html[dir='rtl']) .sidebar {
			transform: translateX(100%);
		}

		.sidebar.open {
			transform: translateX(0) !important;
		}
	}

	/* ─── Top: Brand ─────────────────────────────── */
	.sidebar-top {
		padding: 1.25rem 1rem;
		border-bottom: 1px solid var(--color-sidebar-border);
	}

	.app-brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		text-decoration: none;
	}

	.brand-icon {
		width: 36px;
		height: 36px;
		background: linear-gradient(135deg, var(--color-primary-700), var(--color-primary-500));
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		flex-shrink: 0;
	}

	.brand-icon svg {
		width: 18px;
		height: 18px;
	}

	.brand-name {
		font-size: 1.25rem;
		font-weight: 800;
		background: linear-gradient(135deg, var(--color-primary-300), var(--color-primary-100));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		letter-spacing: -0.02em;
	}

	/* ─── Middle: Navigation ──────────────────────── */
	.sidebar-nav {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem 0.625rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	/* Single nav link */
	.nav-link {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.75rem;
		border-radius: 8px;
		text-decoration: none;
		color: var(--color-surface-400);
		font-size: 0.8125rem;
		font-weight: 500;
		transition: all 0.15s ease;
	}

	.nav-link:hover {
		background: var(--color-sidebar-hover);
		color: var(--color-surface-200);
	}

	.nav-link.active {
		background: var(--color-sidebar-active);
		color: var(--color-primary-400);
		font-weight: 600;
	}

	.nav-icon {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		stroke-width: 1.75;
	}

	/* Nav group (parent + children) */
	.nav-group-label {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.75rem;
		color: var(--color-surface-400);
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.nav-group.active .nav-group-label {
		color: var(--color-surface-200);
	}

	.nav-children {
		padding-inline-start: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.nav-child-link {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		text-decoration: none;
		color: var(--color-surface-500);
		font-size: 0.8125rem;
		transition: all 0.15s ease;
	}

	.nav-child-link:hover {
		background: var(--color-sidebar-hover);
		color: var(--color-surface-300);
	}

	.nav-child-link.active {
		color: var(--color-primary-400);
		font-weight: 600;
	}

	.child-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--color-surface-600);
		flex-shrink: 0;
	}

	.nav-child-link.active .child-dot {
		background: var(--color-primary-500);
	}

	/* ─── Bottom: User ──────────── */
	.sidebar-bottom {
		padding: 0.75rem;
		border-top: 1px solid var(--color-sidebar-border);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	/* User info */
	.user-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem;
		text-decoration: none;
		border-radius: 10px;
		cursor: pointer;
		transition: background 0.15s;
	}
	.user-info:hover {
		background: var(--color-surface-700);
	}

	.avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		overflow: hidden;
		background: linear-gradient(135deg, var(--color-primary-700), var(--color-primary-500));
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-letter {
		font-size: 0.875rem;
		font-weight: 700;
		color: white;
	}

	.user-details {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.user-name {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-surface-200);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.user-email {
		font-size: 0.6875rem;
		color: var(--color-surface-500);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

</style>
