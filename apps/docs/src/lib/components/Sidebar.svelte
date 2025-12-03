<script lang="ts">
	import { page } from '$app/stores';

	interface DocLink {
		title: string;
		href: string;
		icon?: string;
	}

	interface DocSection {
		title: string;
		links: DocLink[];
	}

	const sections: DocSection[] = [
		{
			title: 'Getting Started',
			links: [
				{ title: 'Introduction', href: '/getting-started', icon: 'mdi:rocket-launch' },
				{ title: 'Installation', href: '/installation', icon: 'mdi:download' },
				{ title: 'Troubleshooting', href: '/troubleshooting', icon: 'mdi:wrench' }
			]
		},
		{
			title: 'API Reference',
			links: [
				{ title: 'Overview', href: '/api', icon: 'mdi:api' },
				{ title: 'Authentication', href: '/api/Authentication_2FA_API', icon: 'mdi:lock' },
				{ title: 'Collections', href: '/api/Collection_API', icon: 'mdi:folder-multiple' },
				{ title: 'Media', href: '/api/Media_API', icon: 'mdi:image' },
				{ title: 'GraphQL', href: '/api/GraphQL_API', icon: 'mdi:graphql' }
			]
		},
		{
			title: 'Architecture',
			links: [
				{ title: 'Overview', href: '/architecture', icon: 'mdi:cube-outline' },
				{ title: 'Code Structure', href: '/architecture/code-structure', icon: 'mdi:file-tree' },
				{ title: 'Cache System', href: '/architecture/cache-system', icon: 'mdi:cached' },
				{ title: 'Security', href: '/architecture/security-plugin', icon: 'mdi:shield-check' }
			]
		},
		{
			title: 'Widgets',
			links: [
				{ title: 'Overview', href: '/widgets', icon: 'mdi:widgets' },
				{ title: 'Widget System', href: '/widgets/widget-system-overview', icon: 'mdi:apps' },
				{ title: 'Development Guide', href: '/widgets/widget-development-guide', icon: 'mdi:code-braces' }
			]
		},
		{
			title: 'Database',
			links: [
				{ title: 'Overview', href: '/database', icon: 'mdi:database' },
				{ title: 'Methods', href: '/architecture/database-methods', icon: 'mdi:function' }
			]
		},
		{
			title: 'Testing',
			links: [{ title: 'Testing Guide', href: '/testing', icon: 'mdi:test-tube' }]
		}
	];
</script>

<aside class="h-full w-64 overflow-y-auto border-r border-surface-700 bg-surface-800">
	<nav class="p-4">
		{#each sections as section}
			<div class="mb-6">
				<h3 class="mb-2 text-xs font-bold uppercase text-surface-400">{section.title}</h3>
				<ul class="space-y-1">
					{#each section.links as link}
						<li>
							<a
								href={link.href}
								class="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-surface-700
									{$page.url.pathname === link.href ? 'bg-primary-500/20 text-primary-500' : ''}"
							>
								{#if link.icon}
									<iconify-icon icon={link.icon} class="text-lg"></iconify-icon>
								{/if}
								<span class="text-sm">{link.title}</span>
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</nav>
</aside>
