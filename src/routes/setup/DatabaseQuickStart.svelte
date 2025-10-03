<!--
@file src/routes/setup/DatabaseQuickStart.svelte
@description Quick-start templates for common database configurations
-->
<script lang="ts">
	import type { DbConfig } from '@stores/setupStore.svelte';

	let { onSelectTemplate, currentConfig } = $props<{
		onSelectTemplate: (config: Partial<DbConfig>) => void;
		currentConfig: DbConfig;
	}>();

	type DbTemplate = {
		id: string;
		name: string;
		description: string;
		icon: string;
		config: Partial<DbConfig>;
		popular?: boolean;
	};

	const templates: DbTemplate[] = [
		{
			id: 'local-mongo',
			name: 'Local MongoDB',
			description: 'MongoDB running on your local machine',
			icon: '🖥️',
			config: {
				type: 'mongodb',
				host: 'localhost',
				port: 27017,
				name: 'sveltycms',
				user: '',
				password: ''
			},
			popular: true
		},
		{
			id: 'atlas',
			name: 'MongoDB Atlas',
			description: 'Cloud-hosted MongoDB database',
			icon: '☁️',
			config: {
				type: 'mongodb+srv',
				host: 'cluster0.xxxxx.mongodb.net',
				port: undefined,
				name: 'sveltycms',
				user: '',
				password: ''
			},
			popular: true
		},
		{
			id: 'docker-mongo',
			name: 'Docker MongoDB',
			description: 'MongoDB in a Docker container',
			icon: '🐳',
			config: {
				type: 'mongodb',
				host: 'mongo',
				port: 27017,
				name: 'sveltycms',
				user: '',
				password: ''
			}
		},
		{
			id: 'local-postgres',
			name: 'Local PostgreSQL',
			description: 'PostgreSQL on your local machine',
			icon: '🐘',
			config: {
				type: 'postgresql',
				host: 'localhost',
				port: 5432,
				name: 'sveltycms',
				user: 'postgres',
				password: ''
			}
		},
		{
			id: 'docker-postgres',
			name: 'Docker PostgreSQL',
			description: 'PostgreSQL in a Docker container',
			icon: '🐳',
			config: {
				type: 'postgresql',
				host: 'postgres',
				port: 5432,
				name: 'sveltycms',
				user: 'postgres',
				password: ''
			}
		},
		{
			id: 'local-mysql',
			name: 'Local MySQL',
			description: 'MySQL/MariaDB on your local machine',
			icon: '🐬',
			config: {
				type: 'mysql',
				host: 'localhost',
				port: 3306,
				name: 'sveltycms',
				user: 'root',
				password: ''
			}
		}
	];

	let showTemplates = $state(true);

	function selectTemplate(template: DbTemplate) {
		onSelectTemplate(template.config);
		showTemplates = false;
	}

	function toggleTemplates() {
		showTemplates = !showTemplates;
	}
</script>

<div class="mb-6">
	<button
		onclick={toggleTemplates}
		class="flex w-full items-center justify-between rounded-lg border border-surface-200 bg-surface-50 p-3 text-left transition-colors hover:bg-surface-100 dark:border-surface-700 dark:bg-surface-800/50 dark:hover:bg-surface-800"
	>
		<div class="flex items-center gap-2">
			<span class="text-xl">⚡</span>
			<span class="font-semibold text-surface-900 dark:text-surface-50"> Quick Start Templates </span>
		</div>
		<svg class="h-5 w-5 transition-transform {showTemplates ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if showTemplates}
		<div class="mt-3 grid gap-3 sm:grid-cols-2">
			{#each templates as template}
				<button
					onclick={() => selectTemplate(template)}
					class="group relative overflow-hidden rounded-lg border border-surface-200 bg-white p-4 text-left transition-all hover:border-indigo-300 hover:shadow-md dark:border-surface-700 dark:bg-surface-800 dark:hover:border-indigo-600"
				>
					{#if template.popular}
						<div
							class="absolute right-2 top-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
						>
							Popular
						</div>
					{/if}

					<div class="mb-2 flex items-center gap-2">
						<span class="text-2xl">{template.icon}</span>
						<h3 class="font-semibold text-surface-900 dark:text-surface-50">
							{template.name}
						</h3>
					</div>

					<p class="mb-3 text-sm text-surface-600 dark:text-surface-400">
						{template.description}
					</p>

					<div class="flex items-center gap-2 text-xs text-surface-500 dark:text-surface-500">
						<span class="font-mono">{template.config.host}:{template.config.port || 'default'}</span>
					</div>

					<!-- Hover effect -->
					<div class="absolute bottom-0 left-0 h-1 w-0 bg-gradient-to-r from-indigo-500 to-purple-500 transition-all group-hover:w-full"></div>
				</button>
			{/each}
		</div>

		<div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
			<div class="flex gap-2">
				<span class="text-lg">💡</span>
				<div class="text-sm text-amber-800 dark:text-amber-200">
					<strong>Tip:</strong> These templates pre-fill common settings. You can always customize them after selection.
					{#if currentConfig.type === 'mongodb+srv'}
						For Atlas, update the host with your cluster address.
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	button:focus-visible {
		outline: 2px solid theme('colors.indigo.500');
		outline-offset: 2px;
	}
</style>
