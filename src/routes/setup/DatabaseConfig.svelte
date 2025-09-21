<!--
@file src/routes/setup/DatabaseConfig.svelte
@description Database configuration step component extracted from +page.svelte for maintainability.
Provides DB type, host, port, name, user, password inputs, validation display, test button, and change warning.
-->
<script lang="ts">
	import { popup, type PopupSettings } from '@skeletonlabs/skeleton';
	import * as m from '@src/paraglide/messages';
	import type { DbConfig } from '@stores/setupStore.svelte';

	// Popup settings (click to toggle)
	const popupDbType: PopupSettings = { event: 'click', target: 'popupDbType', placement: 'top' };
	const popupDbHost: PopupSettings = { event: 'click', target: 'popupDbHost', placement: 'top' };
	const popupDbPort: PopupSettings = { event: 'click', target: 'popupDbPort', placement: 'top' };
	const popupDbName: PopupSettings = { event: 'click', target: 'popupDbName', placement: 'top' };
	const popupDbUser: PopupSettings = { event: 'click', target: 'popupDbUser', placement: 'top' };
	const popupDbPassword: PopupSettings = { event: 'click', target: 'popupDbPassword', placement: 'top' };

	// Type definitions for validation errors and component props
	type ValidationErrors = {
		host?: string;
		port?: string;
		name?: string;
		user?: string;
		password?: string;
		[key: string]: string | undefined;
	};

	// Props from parent wizard (destructure via $props to allow internal mutation without warnings)
	let {
		dbConfig = $bindable(),
		validationErrors,
		isLoading,
		showDbPassword = $bindable(),
		toggleDbPassword,
		testDatabaseConnection,
		dbConfigChangedSinceTest,
		clearDbTestError
	} = $props<{
		dbConfig: DbConfig;
		validationErrors: ValidationErrors;
		isLoading: boolean;
		showDbPassword: boolean;
		toggleDbPassword: () => void;
		testDatabaseConnection: () => Promise<void>;
		dbConfigChangedSinceTest: boolean;
		clearDbTestError: () => void;
		installDatabaseDriver?: (dbType: string) => Promise<void>;
	}>();

	let unsupportedDbSelected = $state(false);
	let isAtlas = $derived(dbConfig.type === 'mongodb+srv');
	let isInstallingDriver = $state(false);
	let installError = $state('');
	let installSuccess = $state('');

	// Expose installDatabaseDriver to parent
	export async function installDatabaseDriver(dbType: string) {
		if (!dbType || dbType === 'mongodb' || dbType === 'mongodb+srv') {
			// MongoDB drivers are always available, no installation needed
			return;
		}

		isInstallingDriver = true;
		installError = '';
		installSuccess = '';

		try {
			const response = await fetch('/api/setup/install-driver', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dbType })
			});

			const data = await response.json();

			if (data.success) {
				installSuccess = data.message || `Successfully installed driver for ${dbType}`;
				if (data.alreadyInstalled) {
					installSuccess = `Driver for ${dbType} is already installed`;
				}
			} else {
				installError = data.error || `Failed to install driver for ${dbType}`;
			}
		} catch (error) {
			installError = `Network error while installing driver: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			isInstallingDriver = false;
		}
	}

	async function handleTestConnection() {
		await installDatabaseDriver(dbConfig.type);
		await testDatabaseConnection();
	}

	$effect(() => {
		if (isAtlas) {
			dbConfig.port = ''; // Port is not used for Atlas SRV
			if (dbConfig.host === 'localhost') dbConfig.host = ''; // Clear default host
		} else if (dbConfig.type === 'mongodb' && !dbConfig.port) {
			dbConfig.port = '27017'; // Default port for standard MongoDB
		}
		unsupportedDbSelected = false; // All database types are now supported
		// No automatic driver install here
	});
</script>

<div class="fade-in">
	<div class="mb-6 sm:mb-8">
		<p class="text-center text-sm text-tertiary-500 dark:text-primary-500 sm:text-base">
			{m.setup_database_intro()}
		</p>
	</div>
	{#if dbConfig.type === 'postgresql' || dbConfig.type === 'mysql'}
		<div class="mb-6 rounded border border-blue-200 bg-blue-50 p-4 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
			<p class="font-semibold">Coming Soon!</p>
			<p class="mt-1">
				Support for {dbConfig.type === 'postgresql' ? 'PostgreSQL' : 'MySQL'} is under development. We are looking for contributors to help accelerate
				this process.
			</p>
			<p class="mt-2">
				If you're interested in helping, please visit our
				<a
					href="https://github.com/SveltyCMS/SveltyCMS"
					target="_blank"
					rel="noopener noreferrer"
					class="font-medium underline hover:text-blue-600 dark:hover:text-blue-200"
				>
					GitHub repository
				</a>.
			</p>
		</div>
	{/if}
	<div class="space-y-4 sm:space-y-6">
		<div class="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
			<div>
				<label for="db-type" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:database" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span>{m.setup_label_database_type()}</span>
					<button
						type="button"
						tabindex="-1"
						use:popup={popupDbType}
						aria-label="Help: Database Type"
						class="ml-1 text-slate-400 hover:text-primary-500"><iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon></button
					>
				</label>
				<div
					data-popup="popupDbType"
					class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
				>
					<p>{m.setup_help_database_type?.() || 'Select the database engine to use. Ensure the server & driver are installed.'}</p>
					<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
				</div>
				<select id="db-type" bind:value={dbConfig.type} onchange={clearDbTestError} class="input rounded">
					<option value="mongodb">MongoDB (localhost/Docker)</option>
					<option value="mongodb+srv">MongoDB Atlas (SRV)</option>
					<option value="postgresql">PostgreSQL</option>
					<option value="mysql">MySQL</option>
				</select>
				{#if isInstallingDriver}
					<div class="mt-2 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
						<iconify-icon icon="mdi:loading" class="animate-spin" width="16"></iconify-icon>
						<span>Installing database driver...</span>
					</div>
				{/if}
				{#if installSuccess}
					<div class="mt-2 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
						<iconify-icon icon="mdi:check-circle" width="16"></iconify-icon>
						<span>{installSuccess}</span>
					</div>
				{/if}
				{#if installError}
					<div
						class="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
					>
						<div class="flex items-center gap-2">
							<iconify-icon icon="mdi:alert-circle" width="16"></iconify-icon>
							<span class="font-medium">Driver Installation Failed</span>
						</div>
						<p class="mt-1">{installError}</p>
						<p class="mt-2 text-xs">
							You can install the driver manually or continue with the setup (connection test will show installation instructions).
						</p>
					</div>
				{/if}
			</div>

			{#if true}
				<div>
					<label for="db-host" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:server-network" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span>{isAtlas ? 'Atlas Connection String (SRV)' : m.setup_database_host()}</span>
						<button type="button" tabindex="-1" use:popup={popupDbHost} aria-label="Help: Host" class="ml-1 text-slate-400 hover:text-primary-500"
							><iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon></button
						>
					</label>
					<div
						data-popup="popupDbHost"
						class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
					>
						<p>
							{isAtlas
								? 'Your MongoDB Atlas SRV connection string. Usually starts with "mongodb+srv://".'
								: m.setup_help_database_host?.() || 'Hostname or IP address where the database server is reachable.'}
						</p>
						<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
					</div>
					<input
						id="db-host"
						bind:value={dbConfig.host}
						type="text"
						onchange={clearDbTestError}
						placeholder={isAtlas ? 'my-cluster.abcde.mongodb.net' : 'localhost'}
						class="input w-full rounded {validationErrors.host ? 'border-error-500 focus:border-error-500 focus:ring-error-500' : 'border-slate-200'}"
					/>
					{#if validationErrors.host}<div class="mt-1 text-xs text-error-500">{validationErrors.host}</div>{/if}
				</div>

				{#if !isAtlas}
					<div>
						<label for="db-port" class="mb-1 flex items-center gap-1 text-sm font-medium">
							<iconify-icon icon="mdi:ethernet" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
							<span>{m.setup_database_port()}</span>
							<button type="button" tabindex="-1" use:popup={popupDbPort} aria-label="Help: Port" class="ml-1 text-slate-400 hover:text-primary-500"
								><iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon></button
							>
						</label>
						<div
							data-popup="popupDbPort"
							class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
						>
							<p>{m.setup_help_database_port?.() || 'Network port the database server listens on. Defaults vary by engine.'}</p>
							<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
						</div>
						<input
							id="db-port"
							bind:value={dbConfig.port}
							type="text"
							onchange={clearDbTestError}
							placeholder={m.setup_database_port_placeholder?.() || '27017'}
							class="input w-full rounded {validationErrors.port
								? 'border-error-500 focus:border-error-500 focus:ring-error-500'
								: 'border-slate-200'}"
						/>
						{#if validationErrors.port}<div class="mt-1 text-xs text-error-500">{validationErrors.port}</div>{/if}
					</div>
				{/if}
				<div>
					<label for="db-name" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:database-outline" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span>{m.setup_database_name()}</span>
						<button
							type="button"
							tabindex="-1"
							use:popup={popupDbName}
							aria-label="Help: Database Name"
							class="ml-1 text-slate-400 hover:text-primary-500"><iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon></button
						>
					</label>
					<div
						data-popup="popupDbName"
						class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
					>
						<p>{m.setup_help_database_name?.() || 'Name of the database/schema to use or create.'}</p>
						<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
					</div>
					<input
						id="db-name"
						bind:value={dbConfig.name}
						type="text"
						onchange={clearDbTestError}
						placeholder={m.setup_database_name_placeholder?.() || 'SveltyCMS'}
						class="input w-full rounded {validationErrors.name ? 'border-error-500 focus:border-error-500 focus:ring-error-500' : 'border-slate-200'}"
					/>
					{#if validationErrors.name}<div class="mt-1 text-xs text-error-500">{validationErrors.name}</div>{/if}
				</div>
				<div>
					<label for="db-user" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:account-key" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span>{m.setup_database_user()}</span>
						<button
							type="button"
							tabindex="-1"
							use:popup={popupDbUser}
							aria-label="Help: Database User"
							class="ml-1 text-slate-400 hover:text-primary-500"><iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon></button
						>
					</label>
					<div
						data-popup="popupDbUser"
						class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
					>
						<p>{m.setup_help_database_user?.() || 'Database user with rights to create tables and read/write data.'}</p>
						<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
					</div>
					<input
						id="db-user"
						bind:value={dbConfig.user}
						type="text"
						onchange={clearDbTestError}
						placeholder={m.setup_database_user_placeholder?.() || 'Database username'}
						class="input rounded {validationErrors.user ? 'border-error-500 focus:border-error-500 focus:ring-error-500' : 'border-slate-200'}"
					/>
					{#if validationErrors.user}<div class="mt-1 text-xs text-error-500">{validationErrors.user}</div>{/if}
				</div>
				<div>
					<label for="db-password" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:key-variant" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span>{m.setup_database_password()}</span>
						<button
							type="button"
							tabindex="-1"
							use:popup={popupDbPassword}
							aria-label="Help: Database Password"
							class="ml-1 text-slate-400 hover:text-primary-500"><iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon></button
						>
					</label>
					<div
						data-popup="popupDbPassword"
						class="card z-30 hidden w-80 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
					>
						<p>{m.setup_help_database_password?.() || 'Password for the database user. Store securely; not shown in logs.'}</p>
						<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
					</div>
					<div class="relative">
						<input
							id="db-password"
							bind:value={dbConfig.password}
							onchange={clearDbTestError}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									handleTestConnection();
								}
							}}
							type={showDbPassword ? 'text' : 'password'}
							placeholder={m.setup_database_password_placeholder?.() || 'Leave blank if none'}
							class="input w-full rounded {validationErrors.password
								? 'border-error-500 focus:border-error-500 focus:ring-error-500'
								: 'border-slate-200'}"
						/>
						<button
							type="button"
							onclick={toggleDbPassword}
							class="absolute inset-y-0 right-0 flex min-w-[2.5rem] items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none"
							aria-label={showDbPassword ? 'Hide password' : 'Show password'}
						>
							<iconify-icon icon={showDbPassword ? 'mdi:eye-off' : 'mdi:eye'} width="18" height="18"></iconify-icon>
						</button>
					</div>
					{#if validationErrors.password}<div class="mt-1 text-xs text-error-500">{validationErrors.password}</div>{/if}
				</div>
			{/if}
		</div>
		{#if !unsupportedDbSelected}
			<button onclick={handleTestConnection} disabled={isLoading} class="variant-filled-tertiary btn w-full dark:variant-filled-primary">
				{#if isLoading}
					<div class="h-4 w-4 animate-spin rounded-full border-2 border-t-2 border-transparent border-t-white"></div>
					Testing Connection...
				{:else}
					{m.setup_button_test_connection()}
				{/if}
			</button>
		{/if}
		{#if dbConfigChangedSinceTest}
			<div
				class="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
			>
				{m.setup_help_database_type?.() || 'Database settings changed since last successful test. Please re-test to proceed.'}
			</div>
		{/if}
	</div>
</div>
