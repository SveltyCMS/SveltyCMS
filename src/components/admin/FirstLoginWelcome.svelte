<!--
@file src/components/admin/FirstLoginWelcome.svelte
@description Welcome screen for admin users on their first login after setup
@features
- Welcome message and system overview
- Import/Export management for data backup/restore
- Quick setup guides and next steps
- Dashboard widget preview
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	// Icons
	import Icon from '@iconify/svelte';

	// Components
	import ImportExportManager from '@components/admin/ImportExportManager.svelte';
	import Button from '@components/system/buttons/Button.svelte';
	// Utils
	import { logger } from '@utils/logger';

	// Types
	interface WelcomeStep {
		id: string;
		title: string;
		description: string;
		icon: string;
		action: string;
		actionUrl?: string;
		completed?: boolean;
	}

	// Props
	let { user, showWelcome = true } = $props();

	// State
	let currentStep = $state(0);
	let showImportExport = $state(false);
	let dismissedWelcome = $state(false);

	function openImportExportModal() {
		showImportExport = true;
	}

	// Welcome steps for new admin users
	const welcomeSteps = $state([
		{
			id: 'data-management',
			title: 'Data Import & Export',
			description: 'Backup and restore your content with our import/export tools. Essential for data migration and backups.',
			icon: 'mdi:database-import',
			action: 'Open Import/Export',
			completed: false
		},
		{
			id: 'collections',
			title: 'Create Collections',
			description: 'Build your content structure by creating collections. These define the types of content you can manage.',
			icon: 'mdi:folder-plus',
			action: 'Create Collection',
			actionUrl: '/config/collectionbuilder/create',
			completed: false
		},
		{
			id: 'users',
			title: 'Manage Users',
			description: 'Invite team members and manage user permissions to collaborate on your content.',
			icon: 'mdi:account-group',
			action: 'Manage Users',
			actionUrl: '/config/accessManagement',
			completed: false
		},
		{
			id: 'settings',
			title: 'System Settings',
			description: 'Configure your site settings, themes, and system preferences to match your needs.',
			icon: 'mdi:cog',
			action: 'Open Settings',
			actionUrl: '/config/systemsetting',
			completed: false
		}
	]);

	onMount(() => {
		// Check if user has already seen the welcome screen
		const hasSeenWelcome = localStorage.getItem('sveltycms-welcome-seen');
		if (hasSeenWelcome) {
			showWelcome = false;
		}
	});

	function handleStepAction(step: WelcomeStep) {
		if (step.id === 'data-management') {
			openImportExportModal();
		} else if (step.actionUrl) {
			goto(step.actionUrl);
			markStepCompleted(step.id);
		}
	}

	function markStepCompleted(stepId: string) {
		const index = welcomeSteps.findIndex((s) => s.id === stepId);
		if (index !== -1) {
			welcomeSteps[index].completed = true;
		}

		// Save progress to localStorage
		const completedSteps = welcomeSteps.filter((s) => s.completed).map((s) => s.id);
		localStorage.setItem('sveltycms-welcome-progress', JSON.stringify(completedSteps));
	}

	function dismissWelcome() {
		dismissedWelcome = true;
		showWelcome = false;
		localStorage.setItem('sveltycms-welcome-seen', 'true');
	}

	function nextStep() {
		if (currentStep < welcomeSteps.length - 1) {
			currentStep++;
		}
	}

	function previousStep() {
		if (currentStep > 0) {
			currentStep--;
		}
	}

	function goToDashboard() {
		dismissWelcome();
		goto('/dashboard');
	}

	// Load saved progress
	onMount(() => {
		try {
			const savedProgress = localStorage.getItem('sveltycms-welcome-progress');
			if (savedProgress) {
				const completedSteps = JSON.parse(savedProgress);
				welcomeSteps.forEach((step) => {
					if (completedSteps.includes(step.id)) {
						step.completed = true;
					}
				});
			}
		} catch (error) {
			logger.error('Error loading welcome progress:', error);
		}
	});
</script>

{#if showWelcome && !dismissedWelcome}
	<!-- Welcome Container -->
	<div class="welcome-container mx-auto max-w-4xl rounded-lg bg-surface-50 p-6 shadow-lg dark:bg-surface-800">
		<!-- Header -->
		<div class="mb-8 text-center">
			<div class="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 dark:bg-tertiary-900">
				<Icon icon="mdi:rocket-launch" class="h-10 w-10 text-tertiary-500 dark:text-tertiary-400" />
			</div>
			<h2 class="mb-2 text-2xl font-bold text-surface-900 dark:text-white">
				Congratulations, {user?.username || 'Admin'}!
			</h2>
			<p class="text-gray-600 dark:text-gray-400">Your SveltyCMS installation is ready. Let's get you started with the essential features.</p>
		</div>

		<!-- Progress Indicator -->
		<div class="mb-8 flex justify-center">
			<div class="flex space-x-2">
				{#each welcomeSteps as step, index}
					<button
						class="h-3 w-3 rounded-full transition-colors duration-200 {index === currentStep
							? 'bg-tertiary-500'
							: step.completed
								? 'bg-primary-500'
								: 'bg-surface-500 '}"
						onclick={() => (currentStep = index)}
						aria-label="Go to step {index + 1}: {step.title}"
					></button>
				{/each}
			</div>
		</div>

		<!-- Current Step -->
		{#if currentStep < welcomeSteps.length}
			{@const step = welcomeSteps[currentStep]}
			<div class="step-content">
				<div class="mb-6 text-center">
					<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
						<Icon icon={step.icon} class="h-8 w-8 text-gray-600 dark:text-gray-400" />
					</div>
					<h3 class="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
						{step.title}
					</h3>
					<p class="mx-auto max-w-md text-gray-600 dark:text-gray-400">
						{step.description}
					</p>
				</div>

				<!-- Step Action -->
				<div class="mb-6 text-center">
					<Button onclick={() => handleStepAction(step)} preset="primary" size="lg" class="px-8">
						<Icon icon={step.icon} class="mr-2 h-5 w-5" />
						{step.action}
					</Button>
				</div>

				<!-- Special content for data management step -->
				{#if step.id === 'data-management'}
					<div class="mb-6 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
						<div class="flex items-start space-x-3">
							<Icon icon="mdi:information" class="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" />
							<div class="text-sm">
								<p class="mb-1 font-medium text-blue-900 dark:text-blue-100">Data Management Tips</p>
								<ul class="space-y-1 text-blue-700 dark:text-blue-300">
									<li>• Regular backups protect your content from data loss</li>
									<li>• Export collections before major system changes</li>
									<li>• Import/export supports both JSON and CSV formats</li>
									<li>• You can migrate data from other CMS platforms</li>
								</ul>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Quick Stats -->
		<div class="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
			<div class="rounded-lg bg-gray-50 p-4 text-center dark:bg-gray-800">
				<div class="text-2xl font-bold text-green-600">✓</div>
				<div class="text-sm text-gray-600 dark:text-gray-400">Setup Complete</div>
			</div>
			<div class="rounded-lg bg-gray-50 p-4 text-center dark:bg-gray-800">
				<div class="text-2xl font-bold text-blue-600">0</div>
				<div class="text-sm text-gray-600 dark:text-gray-400">Collections</div>
			</div>
			<div class="rounded-lg bg-gray-50 p-4 text-center dark:bg-gray-800">
				<div class="text-2xl font-bold text-purple-600">1</div>
				<div class="text-sm text-gray-600 dark:text-gray-400">Admin User</div>
			</div>
			<div class="rounded-lg bg-gray-50 p-4 text-center dark:bg-gray-800">
				<div class="text-2xl font-bold text-orange-600">∞</div>
				<div class="text-sm text-gray-600 dark:text-gray-400">Possibilities</div>
			</div>
		</div>
	</div>

	<!-- Footer -->
	<div class="flex w-full items-center justify-between">
		<div class="flex space-x-2">
			<Button onclick={previousStep} preset="ghost" disabled={currentStep === 0}>
				<Icon icon="mdi:chevron-left" class="mr-1 h-4 w-4" />
				Previous
			</Button>
		</div>

		<div class="flex space-x-2">
			<Button onclick={dismissWelcome} preset="ghost">Skip Tour</Button>

			{#if currentStep < welcomeSteps.length - 1}
				<Button onclick={nextStep} preset="secondary">
					Next
					<Icon icon="mdi:chevron-right" class="ml-1 h-4 w-4" />
				</Button>
			{:else}
				<Button onclick={goToDashboard} preset="primary">
					Go to Dashboard
					<Icon icon="mdi:view-dashboard" class="ml-2 h-4 w-4" />
				</Button>
			{/if}
		</div>
	</div>
{/if}

<!-- Import/Export Overlay -->
{#if showImportExport}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
		<div class="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-lg bg-surface-50 shadow-xl dark:bg-surface-800">
			<div class="flex items-center justify-between border-b p-6">
				<h3 class="text-xl font-semibold">Data Import & Export</h3>
				<button onclick={() => (showImportExport = false)} class="preset-ghost btn btn-sm">
					<Icon icon="mdi:close" class="h-5 w-5" />
				</button>
			</div>

			<div class="max-h-[calc(90vh-140px)] overflow-y-auto p-6">
				<ImportExportManager />
			</div>

			<div class="flex items-center justify-between border-t bg-surface-100 p-6 dark:bg-surface-700">
				<div class="text-sm text-gray-600 dark:text-gray-400">
					<Icon icon="mdi:shield-check" class="mr-1 inline h-4 w-4" />
					Your data is securely managed and never leaves your server
				</div>
				<div class="flex space-x-2">
					<Button
						onclick={() => {
							showImportExport = false;
							markStepCompleted('data-management');
						}}
						preset="primary"
					>
						Done
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.welcome-container {
		max-width: 64rem;
		margin: 0 auto;
	}

	.step-content {
		min-height: 300px;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
</style>
