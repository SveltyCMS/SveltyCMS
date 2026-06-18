<!--
@file src/routes/setup/DatabaseConfig.svelte
@description Database configuration step component extracted from +page.svelte for maintainability.
Provides DB type, host, port, name, user, password inputs, validation display, test button, and change warning.
-->
<script lang="ts">
	import Alert from '@components/ui/alert.svelte';
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import {
		common_confirm_no,
		common_confirm_overwrite,
		common_confirm_yes,
		setup_button_test_connection,
		setup_database_host,
		setup_database_host_placeholder,
		setup_database_intro,
		setup_database_name,
		setup_database_name_placeholder,
		setup_database_password,
		setup_database_password_placeholder,
		setup_database_port,
		setup_database_port_placeholder,
		setup_database_user,
		setup_database_user_placeholder,
		setup_db_already_exists_desc,
		setup_db_already_exists_title,
		setup_db_coming_soon,
		setup_db_not_found_desc,
		setup_db_not_found_title,
		setup_db_postgres_mysql_note,
		setup_db_postgres_mysql_timeline,
		setup_help_database_host,
		setup_help_database_name,
		setup_help_database_password,
		setup_help_database_port,
		setup_help_database_type,
		setup_help_database_user,
		setup_label_database_type
	} from '@src/paraglide/messages';
	import type { ValidationErrors } from '@src/stores/setup-store.svelte';
	import { setupStore } from '@src/stores/setup-store.svelte.ts';
	import { dbConfigSchema } from '@utils/schemas';
	import { logger } from '@utils/logger';
	import { showConfirm } from '@utils/modal.svelte';
	import { safeParse } from 'valibot';

	// Popup settings (click to toggle)

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
	} = $props();

	let unsupportedDbSelected = $state(false);
	let isAtlas = $derived(dbConfig.type === 'mongodb+srv');
	let isInstallingDriver = $state(false);
	let installError = $state('');
	let installSuccess = $state('');
	let showConnectionStringHelper = $state(false);
	let showAtlasHelper = $state(true); // Collapsible Atlas helper
	let showAdvanced = $state(false); // Collapsible Advanced options

	import { SvelteSet } from 'svelte/reactivity';

	// Track which fields have been touched (blurred)
	let touchedFields = $state(new SvelteSet<string>());

	// Real-time validation state (always computed, but only shown for touched fields)
	let localValidationErrors = $state<ValidationErrors>({});

	// Validate form data in real-time
	const validationResult = $derived(
		safeParse(dbConfigSchema, {
			type: dbConfig.type,
			host: dbConfig.host,
			port: dbConfig.port,
			name: dbConfig.name,
			user: dbConfig.user,
			password: dbConfig.password
		})
	);

	// Update local validation errors when validation result changes
	$effect(() => {
		const newErrors: ValidationErrors = {};
		if (!validationResult.success) {
			for (const issue of validationResult.issues) {
				const path = issue.path?.[0]?.key as string;
				if (path) {
					newErrors[path] = issue.message;
				}
			}
		}
		localValidationErrors = newErrors;
	});

	// Only display errors for fields that have been touched (blurred)
	const displayErrors = $derived.by(() => {
		const errors: ValidationErrors = {};

		// Show validation errors only for touched fields
		for (const field of touchedFields) {
			if (localValidationErrors[field]) {
				errors[field] = localValidationErrors[field];
			}
		}

		// Parent validation errors always show (from API responses)
		return {
			...errors,
			...validationErrors
		};
	}); // Handle field blur to mark as touched
	function handleBlur(fieldName: string) {
		touchedFields.add(fieldName);
	} // Parse MongoDB connection string (Atlas or standard)
	function parseMongoConnectionString(
		connStr: string
	): { host: string; user: string; password: string; database?: string } | null {
		try {
			// Built-in URL parser is more robust for MongoDB URIs
			const url = new URL(connStr.replace('mongodb+srv://', 'http://').replace('mongodb://', 'http://'));

			const user = url.username ? decodeURIComponent(url.username) : '';
			const password = url.password ? decodeURIComponent(url.password) : '';
			const host = url.host;
			const database = url.pathname.slice(1);

			return {
				host,
				user,
				password: password === '<db_password>' || password === '<password>' ? '' : password,
				database: database || ''
			};
		} catch (error) {
			logger.error('Error parsing connection string:', error);
			return null;
		}
	}

	// Handle paste event to detect connection strings
	function handleHostPaste(event: ClipboardEvent) {
		const pastedText = event.clipboardData?.getData('text') || '';

		if (pastedText.startsWith('mongodb://') || pastedText.startsWith('mongodb+srv://')) {
			event.preventDefault();
			const parsed = parseMongoConnectionString(pastedText);

			if (parsed) {
				// Update dbConfig with parsed values
				dbConfig.type = pastedText.startsWith('mongodb+srv://') ? 'mongodb+srv' : 'mongodb';
				dbConfig.host = parsed.host;
				dbConfig.user = parsed.user;
				dbConfig.password = parsed.password;

				if (parsed.database) {
					dbConfig.name = parsed.database;
				}

				// Clear any previous test errors
				clearDbTestError();
			}
		}
	}

	// Expose installDatabaseDriver to parent
	export async function installDatabaseDriver(dbType: string) {
		if (!dbType || dbType === 'mongodb' || dbType === 'mongodb+srv' || dbType === 'sqlite') {
			// MongoDB and SQLite drivers are always available, no installation needed
			return;
		}

		isInstallingDriver = true;
		installError = '';
		installSuccess = '';

		try {
			const { installDatabaseDriver: installDbDriver } = await import('./setup.remote');
			const result = await installDbDriver(dbType);

			if (result.success) {
				if (result.alreadyInstalled) {
					installSuccess = `Driver for ${dbType} is already installed`;
				} else {
					installSuccess = result.message || `Successfully installed driver for ${dbType}`;
				}
			} else {
				installError = result.error || `Failed to install driver for ${dbType}`;
			}
		} catch (error) {
			installError = `Network error while installing driver: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			isInstallingDriver = false;
		}
	}

	async function handleTestConnection() {
		await installDatabaseDriver(dbConfig.type);
		const success = await testDatabaseConnection();

		// Handle missing database confirmation
		if (!success && setupStore.wizard.lastDbTestResult?.dbDoesNotExist) {
			showConfirm({
				title: setup_db_not_found_title({ dbName: dbConfig.name }),
				body: setup_db_not_found_desc({ dbName: dbConfig.name }),
				confirmText: common_confirm_yes(),
				cancelText: common_confirm_no(),
				onConfirm: async () => {
					await testDatabaseConnection(true);
				}
			});
		} else if (!success && setupStore.wizard.lastDbTestResult?.canOverwrite) {
			showConfirm({
				title: setup_db_already_exists_title({ dbName: dbConfig.name }),
				body: setup_db_already_exists_desc({ dbName: dbConfig.name }),
				confirmText: common_confirm_overwrite(),
				cancelText: common_confirm_no(),
				onConfirm: async () => {
					// Use allowOverwrite=true to drop and recreate the database
					await testDatabaseConnection(false, true);
				}
			});
		}
	}

	function handleTypeChange() {
		clearDbTestError();

		const isAtlas = dbConfig.type === 'mongodb+srv';

		// Smart host selection
		if (dbConfig.type === 'sqlite') {
			dbConfig.host = 'config/database';
			dbConfig.port = '';
			if (!dbConfig.name || dbConfig.name.toLowerCase() === 'sveltycms' || dbConfig.name.toLowerCase() === 'sveltycms.db') {
				dbConfig.name = 'sveltycms.db';
			}
		} else {
			// Non-SQLite database types
			if (dbConfig.host === 'config/database' || !dbConfig.host || (isAtlas && dbConfig.host === 'localhost')) {
				dbConfig.host = isAtlas ? '' : 'localhost';
			}
			if (
				!dbConfig.name ||
				dbConfig.name.toLowerCase() === 'sveltycms.db' ||
				dbConfig.name.toLowerCase() === 'sveltycms'
			) {
				dbConfig.name = 'sveltycms';
			}
		}

		// Smart port selection based on database type
		switch (dbConfig.type) {
			case 'mongodb':
				dbConfig.port = '27017';
				break;
			case 'mariadb':
				dbConfig.port = '3306';
				break;
			case 'postgresql':
				dbConfig.port = '5432';
				break;
			case 'mongodb+srv':
				dbConfig.port = '';
				break;
		}
	}

	$effect(() => {
		// Set default database name if empty
		if (!dbConfig.name) {
			dbConfig.name = 'sveltycms';
		}

		unsupportedDbSelected = false; // All database types are now supported
	});

	const dbTypeOptions = [
		{ value: 'sqlite', label: 'SQLite (via Drizzle) - RECOMMENDED' },
		{ value: 'mongodb', label: 'MongoDB (localhost/Docker)' },
		{ value: 'mongodb+srv', label: 'MongoDB Atlas (SRV)' },
		{ value: 'mariadb', label: 'MariaDB (via Drizzle)' },
		{ value: 'postgresql', label: 'PostgreSQL (via Drizzle)' }
	];
</script>

<div class="fade-in">
	<div class="mb-4 sm:mb-6">
		<p class="text-center md:text-start text-sm text-tertiary-500 dark:text-primary-500 sm:text-base">{setup_database_intro()}</p>
	</div>

	<!-- MongoDB Atlas Helper Message -->
	{#if dbConfig.type === 'mongodb+srv'}
		<div class="mb-6 rounded border border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10">
			<button
				type="button"
				onclick={() => (showAtlasHelper = !showAtlasHelper)}
				aria-expanded={showAtlasHelper}
				aria-controls="atlas-helper-content"
				class="flex w-full items-center justify-between p-4 text-start text-blue-900 dark:text-blue-200"
			>
				<div class="flex items-center gap-3">
					<iconify-icon icon="mdi:information" width="20" class="shrink-0" aria-hidden="true"></iconify-icon>
					<span class="font-semibold">MongoDB Atlas Quick Setup</span>
				</div>
				<iconify-icon icon={showAtlasHelper ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="24" aria-hidden="true"></iconify-icon>
			</button>

			{#if showAtlasHelper}
				<div id="atlas-helper-content" class="border-t border-tertiary-200 p-4 pt-3 text-tertiary-900 dark:border-tertiary-500/30 dark:text-tertiary-200">
					<p class="text-sm">To connect to MongoDB Atlas, paste your connection string into the <strong>Host</strong> field:</p>
					<ul class="mt-2 space-y-1 text-sm">
						<li class="flex items-start gap-2">
							<span class="text-tertiary-500 dark:text-primary-500">1.</span>
							<span>In MongoDB Atlas, click <strong>"Connect"</strong> → <strong>"Compass"</strong> or <strong>"VS Code"</strong></span>
						</li>
						<li class="flex items-start gap-2">
							<span class="text-tertiary-500 dark:text-primary-500">2.</span>
							<span>Copy the connection string: <code class="text-xs">mongodb+srv://username:password@cluster0.abcde.mongodb.net/</code></span>
						</li>
						<li class="flex items-start gap-2">
							<span class="text-tertiary-500 dark:text-primary-500">3.</span>
							<span>Paste into Host field - we extract the credentials automatically!</span>
						</li>
					</ul>
					<p class="mt-2 text-xs italic">
						💡 The Host field will show only the cluster hostname (e.g., <code>cluster0.abcde.mongodb.net</code>) after parsing.
					</p>
				</div>
			{/if}
		</div>
	{/if}

	{#if dbConfig.type === 'mysql'}
		<div class="mb-6 rounded border border-tertiary-200 bg-tertiary-50 p-4 text-tertiary-900 dark:border-tertiary-500/30 dark:bg-blue-500/10 dark:text-tertiary-200">
			<p class="font-semibold">{setup_db_coming_soon()}</p>
			<p class="mt-1">{setup_db_postgres_mysql_note()}</p>
			<p class="mt-2">{setup_db_postgres_mysql_timeline()}</p>
		</div>
	{/if}
	<form
		onsubmit={(e) => {
			e.preventDefault();
			handleTestConnection();
		}}
		class="space-y-4"
	>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<div>
				<label for="db-type" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:database" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span class="text-black dark:text-white">{setup_label_database_type()}</span>
					<SystemTooltip title={setup_help_database_type()}>
						<button
							type="button"
							tabindex="-1"
							aria-label="Help: Database Type"
							class="ms-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500  "
						>
							<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
						</button>
					</SystemTooltip>
				</label>

				<Select bind:value={dbConfig.type} options={dbTypeOptions} placeholder="Select database type..." onchange={() => handleTypeChange()} />
			</div>

			{#if isInstallingDriver}
				<div class="mt-2 flex items-center gap-2 text-sm text-tertiary-500 dark:text-primary-500" role="status">
					<iconify-icon icon="mdi:loading" class="animate-spin" width="16" aria-hidden="true"></iconify-icon>
					<span>Installing database driver...</span>
				</div>
			{/if}
			{#if installSuccess}
				<div class="mt-2 flex items-center gap-2 text-sm text-tertiary-500 dark:text-primary-500" role="status">
					<iconify-icon icon="mdi:check-circle" width="16" aria-hidden="true"></iconify-icon>
					<span>{installSuccess}</span>
				</div>
			{/if}
			{#if installError}
				<Alert variant="error" title="Driver Installation Failed" class="mt-2">
					<p>{installError}</p>
					<p class="mt-2 text-xs">
						You can install the driver manually or continue with the setup (connection test will show installation instructions).
					</p>
				</Alert>
			{/if}
			<div>
				<label for="db-host" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:server-network" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span class="text-black dark:text-white">{isAtlas ? 'Atlas Cluster Host' : setup_database_host()}</span>
					<SystemTooltip title={setup_help_database_host()}>
						<button
							type="button"
							tabindex="-1"
							aria-label="Help: Host"
							class="ms-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
						</button>
					</SystemTooltip>
				</label>

				<Input
					id="db-host"
					bind:value={dbConfig.host}
					type="text"
					onchange={clearDbTestError}
					onblur={() => {
						const trimmed = dbConfig.host.trim();
						if (trimmed !== dbConfig.host) {
							dbConfig.host = trimmed;
						}
						handleBlur('host');
					}}
					onpaste={handleHostPaste}
					placeholder={isAtlas ? 'cluster0.abcde.mongodb.net' : setup_database_host_placeholder?.() || 'localhost'}
					error={displayErrors.host}
					required
				/>
				{#if showConnectionStringHelper}
					<div
						class="mt-2 rounded border border-green-200 bg-green-50 p-3 text-sm text-emerald-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300"
						role="status"
					>
						<div class="flex items-center gap-2">
							<iconify-icon icon="mdi:check-circle" width="16" aria-hidden="true"></iconify-icon>
							<span class="font-medium">Connection string parsed!</span>
						</div>
						<p class="mt-1 text-xs">
							Hostname, username, and password have been automatically extracted. Please verify the values and replace
							<code>&lt;db_password&gt;</code>
							placeholder if needed.
						</p>
					</div>
				{/if}
			</div>

			{#if !isAtlas && dbConfig.type !== 'sqlite'}
				<div>
					<label for="db-port" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:ethernet" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="text-black dark:text-white">{setup_database_port()}</span>
						<SystemTooltip title={setup_help_database_port()}>
							<button
								type="button"
								tabindex="-1"
								aria-label="Help: Port"
								class="ms-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
							>
								<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</label>

					<Input
						id="db-port"
						bind:value={dbConfig.port}
						type="text"
						onchange={clearDbTestError}
						onblur={() => handleBlur('port')}
						placeholder={setup_database_port_placeholder?.() || '27017'}
						error={displayErrors.port}
						required
					/>
				</div>
			{/if}
			<div>
				<label for="db-name" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:database-outline" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span class="text-black dark:text-white">{setup_database_name()}</span>
					<SystemTooltip title={setup_help_database_name()}>
						<button
							type="button"
							tabindex="-1"
							aria-label="Help: Database Name"
							class="ms-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
						</button>
					</SystemTooltip>
				</label>

				<Input
					id="db-name"
					bind:value={dbConfig.name}
					type="text"
					onchange={clearDbTestError}
					onblur={() => {
						const trimmed = dbConfig.name.trim();
						if (trimmed !== dbConfig.name) {
							dbConfig.name = trimmed;
						}
						handleBlur('name');
					}}
					placeholder={setup_database_name_placeholder?.() || 'SveltyCMS'}
					error={displayErrors.name}
					required
				/>
			</div>
			{#if dbConfig.type !== 'sqlite'}
				<div>
					<label for="db-user" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:account-key" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="text-black dark:text-white">{setup_database_user()}</span>
						<SystemTooltip title={setup_help_database_user()}>
							<button
								type="button"
								tabindex="-1"
								aria-label="Help: Database User"
								class="ms-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
							>
								<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</label>

					<Input
						id="db-user"
						name="username"
						bind:value={dbConfig.user}
						type="text"
						autocomplete="username"
						onchange={clearDbTestError}
						onblur={() => {
							const trimmed = dbConfig.user.trim();
							if (trimmed !== dbConfig.user) {
								dbConfig.user = trimmed;
							}
							handleBlur('user');
						}}
						placeholder={setup_database_user_placeholder?.() || 'Database username'}
						error={displayErrors.user}
					/>
				</div>
				<div>
					<label for="db-password" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:key-variant" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="text-black dark:text-white">{setup_database_password()}</span>
						<SystemTooltip title={setup_help_database_password()}>
							<button
								type="button"
								tabindex="-1"
								aria-label="Help: Database Password"
								class="ms-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
							>
								<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</label>

					<div class="relative">
						<Input
							id="db-password"
							name="password"
							bind:value={dbConfig.password}
							onchange={clearDbTestError}
							onblur={() => {
								const trimmed = dbConfig.password.trim();
								if (trimmed !== dbConfig.password) {
									dbConfig.password = trimmed;
								}
								handleBlur('password');
							}}
							type={showDbPassword ? 'text' : 'password'}
							autocomplete="current-password"
							placeholder={setup_database_password_placeholder?.() || 'Leave blank if none'}
							error={displayErrors.password}
							inputClass="pe-10"
						/>
						<Button
							variant="ghost"
							type="button"
							onclick={toggleDbPassword}
							class="absolute inset-e-0 top-0 min-w-10 p-0!"
							aria-label={showDbPassword ? 'Hide database password' : 'Show database password'}
						>
							<iconify-icon icon={showDbPassword ? 'mdi:eye-off' : 'mdi:eye'} width="18" height="18" aria-hidden="true"></iconify-icon>
						</Button>
					</div>
				</div>
			{/if}
		</div>
		<div class="mb-4">
			<button
				type="button"
				class="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-primary-500 hover:text-tertiary-500 transition-colors"
				onclick={() => (showAdvanced = !showAdvanced)}
			>
				<iconify-icon icon={showAdvanced ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="18"></iconify-icon>
				Advanced Database Options (Clustering & Scaling)
			</button>

			{#if showAdvanced}
				<div class="mt-4 space-y-4 rounded border border-surface-200 dark:border-white/10 p-4 transition-all duration-300">
					<div class="flex flex-col gap-2">
						<label for="replica-urls" class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
							<iconify-icon icon="mdi:database-import" width="16"></iconify-icon>
							Regional Read Replicas (Optional)
						</label>
						<p class="text-xs text-slate-500 dark:text-white/40 mb-2">
							Add full connection strings for regional read-only replicas (PostgreSQL/MongoDB).
						</p>

						{#each dbConfig.replicaUrls as _, index}
							<div class="flex gap-2 mb-2 animate-in fade-in slide-in-from-left-2 duration-200">
								<Input
									type="text"
									bind:value={dbConfig.replicaUrls[index]}
									placeholder="postgresql://user:pass@replica-host:5432/db?region=us-east"
									class="flex-1"
								/>
								<Button variant="ghost"
									type="button"
									aria-label="Remove replica"
									onclick={() => {
										dbConfig.replicaUrls = dbConfig.replicaUrls.filter((_: string, i: number) => i !== index);
									}}
								 class="p-0! min-w-0 rounded-full bg-error-500/10 text-error-500 hover:bg-error-500 hover:text-white transition-all">
									<iconify-icon icon="mdi:close" width="16"></iconify-icon>
								</Button>
							</div>
						{/each}

						<Button
							variant="tertiary"
							type="button"
							size="sm"
							class="w-fit mt-2"
							onclick={() => {
								dbConfig.replicaUrls = [...dbConfig.replicaUrls, ''];
							}}
						>
							<iconify-icon icon="mdi:plus" width="16"></iconify-icon>
							Add Replica Node
						</Button>
					</div>
				</div>
			{/if}
		</div>

		{#if !unsupportedDbSelected}
			<Button variant="tertiary"
				type="submit"
				disabled={isLoading}
				aria-label={isLoading ? 'Testing database connection, please wait' : 'Test database connection'}
			 class="w-full dark:">
				{#if isLoading}
					<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-t-2 border-transparent border-t-white"
						role="status"
						aria-label="Loading"
					></div>
					Testing Connection...
				{:else}
					{setup_button_test_connection()}
				{/if}
			</Button>
		{/if}
		{#if dbConfigChangedSinceTest}
			<Alert variant="warning" class="mt-2 text-xs">
				{setup_help_database_type?.() || 'Database settings changed since last successful test. Please re-test to proceed.'}
			</Alert>
		{/if}
	</form>
</div>
