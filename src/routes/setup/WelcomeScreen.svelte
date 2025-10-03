<!--
@file src/routes/setup/WelcomeScreen.svelte
@description Welcome screen for first-time setup of SveltyCMS
-->
<script lang="ts">
	import * as m from '@src/paraglide/messages';

	let { onStart } = $props<{
		onStart: () => void;
	}>();

	const features = [
		{
			icon: '🗄️',
			title: 'Configure Database',
			description: 'Connect to MongoDB, PostgreSQL, or MySQL'
		},
		{
			icon: '👤',
			title: 'Create Admin Account',
			description: 'Set up your administrator credentials'
		},
		{
			icon: '⚙️',
			title: 'Customize Settings',
			description: 'Configure your CMS preferences'
		}
	];
</script>

<div class="flex min-h-[60vh] items-center justify-center">
	<div class="w-full max-w-2xl text-center">
		<!-- Logo and Title -->
		<div class="mb-8 flex flex-col items-center gap-6">
			<div class="rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-6 shadow-2xl">
				<img src="/SveltyCMS_Logo.svg" alt="SveltyCMS Logo" class="h-20 w-20 drop-shadow-lg" />
			</div>

			<div>
				<h1
					class="mb-2 bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-4xl font-bold text-transparent dark:from-indigo-400 dark:to-purple-400 sm:text-5xl"
				>
					Welcome to SveltyCMS
				</h1>
				<p class="text-lg text-surface-600 dark:text-surface-300">A Modern Headless CMS Built with SvelteKit</p>
			</div>
		</div>

		<!-- Description -->
		<div class="mb-12">
			<p class="mx-auto max-w-xl text-surface-600 dark:text-surface-300">
				This setup wizard will guide you through the initial configuration of your CMS. It should only take a few minutes to get started.
			</p>
		</div>

		<!-- Features Grid -->
		<div class="mb-12 grid gap-6 sm:grid-cols-3">
			{#each features as feature}
				<div
					class="rounded-xl border border-surface-200 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-surface-700 dark:bg-surface-800"
				>
					<div class="mb-3 text-4xl">{feature.icon}</div>
					<h3 class="mb-2 font-semibold text-surface-900 dark:text-surface-50">
						{feature.title}
					</h3>
					<p class="text-sm text-surface-600 dark:text-surface-400">
						{feature.description}
					</p>
				</div>
			{/each}
		</div>

		<!-- CTA Button -->
		<div class="flex flex-col items-center gap-4">
			<button
				onclick={onStart}
				class="group variant-filled-primary btn relative overflow-hidden rounded-xl px-8 py-4 text-lg font-semibold transition-all hover:scale-105"
			>
				<span class="relative z-10 flex items-center gap-2">
					Get Started
					<svg class="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
					</svg>
				</span>
			</button>

			<p class="text-sm text-surface-500 dark:text-surface-400">
				<span class="mr-1 inline-block">⏱️</span>
				Setup takes approximately 5 minutes
			</p>
		</div>

		<!-- Help Links -->
		<div class="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-surface-500 dark:text-surface-400">
			<a href="/docs" class="transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"> 📚 Documentation </a>
			<span class="text-surface-300 dark:text-surface-600">•</span>
			<a
				href="https://github.com/sveltycms/sveltycms"
				target="_blank"
				rel="noopener noreferrer"
				class="transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
			>
				💻 GitHub
			</a>
			<span class="text-surface-300 dark:text-surface-600">•</span>
			<a href="/docs/troubleshooting" class="transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"> 🔧 Troubleshooting </a>
		</div>
	</div>
</div>

<style>
	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	div {
		animation: fadeIn 0.6s ease-out;
	}
</style>
