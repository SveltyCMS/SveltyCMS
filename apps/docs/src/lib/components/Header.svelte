<script lang="ts">
	export let toggleSidebar: () => void;
	export let sidebarOpen: boolean;
</script>

<header class="border-b border-surface-700 bg-surface-800 p-4">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<button on:click={toggleSidebar} class="variant-ghost-surface btn btn-sm" aria-label="Toggle Sidebar">
				<iconify-icon icon={sidebarOpen ? 'mdi:menu-open' : 'mdi:menu'}></iconify-icon>
			</button>

			<a href="/" class="flex items-center gap-2">
				<iconify-icon icon="mdi:book-open-variant" class="text-2xl text-primary-500"></iconify-icon>
				<span class="text-xl font-bold">SveltyCMS Docs</span>
			</a>
		</div>

		<div class="flex items-center gap-4">
			<a
				href="https://github.com/SveltyCMS/SveltyCMS"
				target="_blank"
				rel="noopener noreferrer"
				class="variant-ghost-surface btn btn-sm"
				aria-label="GitHub"
			>
				<iconify-icon icon="mdi:github"></iconify-icon>
			</a>
		</div>
	</div>
</header>
