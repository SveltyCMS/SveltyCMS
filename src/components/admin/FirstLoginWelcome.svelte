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
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	// Icons
	import Icon from '@iconify/svelte';

	// Components
	import Button from '@components/system/buttons/Button.svelte';
	import { getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';
	import ImportExportManager from '@components/admin/ImportExportManager.svelte';

	// Utils
	import { logger } from '@utils/logger.svelte';

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
	export let user: any;
	export let showWelcome = true;

	// State
	let currentStep = 0;
	// Modal store for import/export
	const modalStore = getModalStore();

	function openImportExportModal() {
		showImportExport = true;
	}
	let dismissedWelcome = false;

	// Welcome steps for new admin users
	const welcomeSteps: WelcomeStep[] = [
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
	];

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
		const index = welcomeSteps.findIndex(s => s.id === stepId);
		if (index !== -1) {
			welcomeSteps[index].completed = true;
		}

		// Save progress to localStorage
		const completedSteps = welcomeSteps.filter(s => s.completed).map(s => s.id);
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
				welcomeSteps.forEach(step => {
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
	<div class="welcome-container max-w-4xl mx-auto p-6 bg-surface-50 dark:bg-surface-800 rounded-lg shadow-lg">
		<!-- Header -->
		<div class="text-center mb-8">
			<div class="mx-auto w-20 h-20 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
				<Icon icon="mdi:rocket-launch" class="w-10 h-10 text-blue-600 dark:text-blue-400" />
			</div>
			<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
				Congratulations, {user?.username || 'Admin'}!
			</h2>
			<p class="text-gray-600 dark:text-gray-400">
				Your SveltyCMS installation is ready. Let's get you started with the essential features.
			</p>
		</div>

			<!-- Progress Indicator -->
			<div class="flex justify-center mb-8">
				<div class="flex space-x-2">
					{#each welcomeSteps as step, index}
						<button
							class="w-3 h-3 rounded-full transition-colors duration-200 {
								index === currentStep
									? 'bg-blue-600'
									: step.completed
										? 'bg-green-500'
										: 'bg-gray-300 dark:bg-gray-600'
							}"
							on:click={() => currentStep = index}
						/>
					{/each}
				</div>
			</div>

			<!-- Current Step -->
			{#if currentStep < welcomeSteps.length}
				{@const step = welcomeSteps[currentStep]}
				<div class="step-content">
					<div class="text-center mb-6">
						<div class="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
							<Icon icon={step.icon} class="w-8 h-8 text-gray-600 dark:text-gray-400" />
						</div>
						<h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
							{step.title}
						</h3>
						<p class="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
							{step.description}
						</p>
					</div>

					<!-- Step Action -->
					<div class="text-center mb-6">
						<Button
							on:click={() => handleStepAction(step)}
							variant="primary"
							size="lg"
							class="px-8"
						>
							<Icon icon={step.icon} class="w-5 h-5 mr-2" />
							{step.action}
						</Button>
					</div>

					<!-- Special content for data management step -->
					{#if step.id === 'data-management'}
						<div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6">
							<div class="flex items-start space-x-3">
								<Icon icon="mdi:information" class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
								<div class="text-sm">
									<p class="font-medium text-blue-900 dark:text-blue-100 mb-1">
										Data Management Tips
									</p>
									<ul class="text-blue-700 dark:text-blue-300 space-y-1">
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
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
				<div class="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
					<div class="text-2xl font-bold text-green-600">✓</div>
					<div class="text-sm text-gray-600 dark:text-gray-400">Setup Complete</div>
				</div>
				<div class="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
					<div class="text-2xl font-bold text-blue-600">0</div>
					<div class="text-sm text-gray-600 dark:text-gray-400">Collections</div>
				</div>
				<div class="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
					<div class="text-2xl font-bold text-purple-600">1</div>
					<div class="text-sm text-gray-600 dark:text-gray-400">Admin User</div>
				</div>
				<div class="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
					<div class="text-2xl font-bold text-orange-600">∞</div>
					<div class="text-sm text-gray-600 dark:text-gray-400">Possibilities</div>
				</div>
			</div>
		</div>

		<svelte:fragment slot="footer">
			<div class="flex justify-between items-center w-full">
				<div class="flex space-x-2">
					<Button
						on:click={previousStep}
						variant="ghost"
						disabled={currentStep === 0}
					>
						<Icon icon="mdi:chevron-left" class="w-4 h-4 mr-1" />
						Previous
					</Button>
				</div>

				<div class="flex space-x-2">
					<Button
						on:click={dismissWelcome}
						variant="ghost"
					>
						Skip Tour
					</Button>

					{#if currentStep < welcomeSteps.length - 1}
						<Button
							on:click={nextStep}
							variant="secondary"
						>
							Next
							<Icon icon="mdi:chevron-right" class="w-4 h-4 ml-1" />
						</Button>
					{:else}
						<Button
							on:click={goToDashboard}
							variant="primary"
						>
							Go to Dashboard
							<Icon icon="mdi:view-dashboard" class="w-4 h-4 ml-2" />
						</Button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Import/Export Overlay -->
{#if showImportExport}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-surface-50 dark:bg-surface-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
			<div class="flex justify-between items-center p-6 border-b">
				<h3 class="text-xl font-semibold">Data Import & Export</h3>
				<button
					on:click={() => showImportExport = false}
					class="btn btn-sm variant-ghost"
				>
					<Icon icon="mdi:close" class="w-5 h-5" />
				</button>
			</div>

			<div class="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
				<ImportExportManager />
			</div>

			<div class="flex justify-between items-center p-6 border-t bg-surface-100 dark:bg-surface-700">
				<div class="text-sm text-gray-600 dark:text-gray-400">
					<Icon icon="mdi:shield-check" class="w-4 h-4 inline mr-1" />
					Your data is securely managed and never leaves your server
				</div>
				<div class="flex space-x-2">
					<Button
						on:click={() => {
							showImportExport = false;
							markStepCompleted('data-management');
						}}
						variant="primary"
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
		@apply max-w-4xl mx-auto;
	}

	.step-content {
		@apply min-h-[300px] flex flex-col justify-center;
	}
</style>
