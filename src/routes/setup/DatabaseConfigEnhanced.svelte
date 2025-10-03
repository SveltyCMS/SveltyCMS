<!--
@file src/routes/setup/DatabaseConfigEnhanced.svelte
@description Enhanced database configuration with quick-start templates and improved status feedback
This is an example of how to integrate the new components into DatabaseConfig.svelte
-->
<script lang="ts">
	import { popup, type PopupSettings } from '@skeletonlabs/skeleton';
	import * as m from '@src/paraglide/messages';
	import type { DbConfig } from '@stores/setupStore.svelte';
	import DatabaseQuickStart from './DatabaseQuickStart.svelte';
	import ConnectionStatus from './ConnectionStatus.svelte';

	// Props from parent wizard
	let {
		dbConfig = $bindable(),
		validationErrors,
		isLoading,
		showDbPassword = $bindable(),
		toggleDbPassword,
		testDatabaseConnection,
		dbConfigChangedSinceTest,
		clearDbTestError,
		lastDbTestResult = $bindable()
	} = $props<{
		dbConfig: DbConfig;
		validationErrors: Record<string, string>;
		isLoading: boolean;
		showDbPassword: boolean;
		toggleDbPassword: () => void;
		testDatabaseConnection: () => Promise<void>;
		dbConfigChangedSinceTest: boolean;
		clearDbTestError: () => void;
		lastDbTestResult?: any;
	}>();

	// Connection state for status component
	let connectionState = $derived.by(() => {
		if (isLoading) return 'testing';
		if (lastDbTestResult?.success) return 'success';
		if (lastDbTestResult && !lastDbTestResult.success) return 'error';
		return 'idle';
	});

	// Handle template selection
	function handleTemplateSelect(templateConfig: Partial<DbConfig>) {
		Object.assign(dbConfig, templateConfig);
		clearDbTestError();
	}
</script>

<div class="fade-in space-y-6">
	<!-- Header Section -->
	<div class="text-center">
		<h2 class="mb-2 text-2xl font-bold">Configure Your Database</h2>
		<p class="text-surface-600 dark:text-surface-400">SveltyCMS supports MongoDB, PostgreSQL, and MySQL databases</p>
	</div>

	<!-- Quick Start Templates -->
	<DatabaseQuickStart onSelectTemplate={handleTemplateSelect} currentConfig={dbConfig} />

	<!-- Database Configuration Form -->
	<div class="rounded-xl border border-surface-200 bg-white p-6 shadow-sm dark:border-surface-700 dark:bg-surface-800">
		<h3 class="mb-4 font-semibold">Connection Details</h3>

		<div class="space-y-4">
			<!-- Database Type -->
			<div>
				<label for="db-type" class="mb-2 block text-sm font-medium"> Database Type </label>
				<select id="db-type" bind:value={dbConfig.type} onchange={clearDbTestError} class="input w-full">
					<option value="mongodb">MongoDB (localhost/Docker)</option>
					<option value="mongodb+srv">MongoDB Atlas (SRV)</option>
					<option value="postgresql">PostgreSQL</option>
					<option value="mysql">MySQL</option>
				</select>
			</div>

			<!-- Host -->
			<div>
				<label for="db-host" class="mb-2 block text-sm font-medium">
					{dbConfig.type === 'mongodb+srv' ? 'Atlas Connection String' : 'Host'}
				</label>
				<input
					id="db-host"
					type="text"
					bind:value={dbConfig.host}
					oninput={clearDbTestError}
					placeholder={dbConfig.type === 'mongodb+srv' ? 'cluster0.xxxxx.mongodb.net' : 'localhost'}
					class="input w-full"
					class:input-error={validationErrors.host}
				/>
				{#if validationErrors.host}
					<p class="mt-1 text-sm text-error-600">{validationErrors.host}</p>
				{/if}
			</div>

			<!-- Port (hidden for Atlas) -->
			{#if dbConfig.type !== 'mongodb+srv'}
				<div>
					<label for="db-port" class="mb-2 block text-sm font-medium"> Port </label>
					<input
						id="db-port"
						type="text"
						bind:value={dbConfig.port}
						oninput={clearDbTestError}
						placeholder="27017"
						class="input w-full"
						class:input-error={validationErrors.port}
					/>
					{#if validationErrors.port}
						<p class="mt-1 text-sm text-error-600">{validationErrors.port}</p>
					{/if}
				</div>
			{/if}

			<!-- Database Name -->
			<div>
				<label for="db-name" class="mb-2 block text-sm font-medium"> Database Name </label>
				<input
					id="db-name"
					type="text"
					bind:value={dbConfig.name}
					oninput={clearDbTestError}
					placeholder="sveltycms"
					class="input w-full"
					class:input-error={validationErrors.name}
				/>
				{#if validationErrors.name}
					<p class="mt-1 text-sm text-error-600">{validationErrors.name}</p>
				{/if}
			</div>

			<!-- Username -->
			<div>
				<label for="db-user" class="mb-2 block text-sm font-medium"> Username (optional for local) </label>
				<input
					id="db-user"
					type="text"
					bind:value={dbConfig.user}
					oninput={clearDbTestError}
					placeholder="admin"
					class="input w-full"
					class:input-error={validationErrors.user}
				/>
				{#if validationErrors.user}
					<p class="mt-1 text-sm text-error-600">{validationErrors.user}</p>
				{/if}
			</div>

			<!-- Password -->
			<div>
				<label for="db-password" class="mb-2 block text-sm font-medium"> Password (optional for local) </label>
				<div class="relative">
					<input
						id="db-password"
						type={showDbPassword ? 'text' : 'password'}
						bind:value={dbConfig.password}
						oninput={clearDbTestError}
						placeholder="••••••••"
						class="input w-full pr-10"
						class:input-error={validationErrors.password}
					/>
					<button type="button" onclick={toggleDbPassword} class="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-700">
						{#if showDbPassword}
							<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
								/>
							</svg>
						{:else}
							<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
								/>
							</svg>
						{/if}
					</button>
				</div>
				{#if validationErrors.password}
					<p class="mt-1 text-sm text-error-600">{validationErrors.password}</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Test Connection Button -->
	<div class="flex justify-center">
		<button onclick={testDatabaseConnection} disabled={isLoading} class="variant-filled-primary btn flex items-center gap-2 px-6 py-3">
			{#if isLoading}
				<svg class="h-5 w-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
					/>
				</svg>
				Testing Connection...
			{:else}
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
				</svg>
				Test Database Connection
			{/if}
		</button>
	</div>

	<!-- Connection Status -->
	{#if connectionState !== 'idle' || lastDbTestResult}
		<ConnectionStatus state={connectionState} result={lastDbTestResult} onRetry={testDatabaseConnection} />
	{/if}

	<!-- Configuration Changed Warning -->
	{#if dbConfigChangedSinceTest && lastDbTestResult?.success}
		<div class="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
			<div class="flex items-start gap-3">
				<svg class="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
				<div class="flex-1">
					<p class="font-semibold text-amber-900 dark:text-amber-100">Configuration Changed</p>
					<p class="mt-1 text-sm text-amber-800 dark:text-amber-200">
						You've modified the database settings since the last successful test. Please test the connection again before proceeding.
					</p>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.fade-in {
		animation: fadeIn 0.4s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.input-error {
		border-color: rgb(239 68 68);
	}
</style>
