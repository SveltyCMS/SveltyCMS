<!--
@file src/routes/setup/DatabaseConfig.svelte
@description Database configuration step component extracted from +page.svelte for maintainability.
Provides DB type, host, port, name, user, password inputs, validation display, test button, and change warning.
-->
<script lang="ts">
	// popup and PopupSettings not available in skeleton-svelte v4
	// import { popup, type PopupSettings } from '@skeletonlabs/skeleton-svelte';
	import * as m from '@src/paraglide/messages';
	import { logger } from '@utils/logger';
	import type { ValidationErrors } from '@stores/setupStore.svelte';
	import { safeParse } from 'valibot';
	import { dbConfigSchema } from '@utils/formSchemas';

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
	const isAtlas = $derived(dbConfig.type === 'mongodb+srv');
	let isInstallingDriver = $state(false);
	let installError = $state('');
	let installSuccess = $state('');
	let showConnectionStringHelper = $state(false);
	let showAtlasHelper = $state(true); // Collapsible Atlas helper

	// Track which fields have been touched (blurred)
	let touchedFields = $state(new Set<string>());

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
		touchedFields = touchedFields; // Trigger reactivity
	} // Parse MongoDB connection string (Atlas or standard)
	function parseMongoConnectionString(connStr: string): { host: string; user: string; password: string; database?: string } | null {
		try {
			// MongoDB connection string patterns:
			// mongodb://[username:password@]host[:port][/database]
			// mongodb+srv://[username:password@]host[/database]

			const stdPattern = /^mongodb:\/\/(?:([^:]+):([^@]+)@)?([^/?]+)(?:\/([^?]+))?/;
			const srvPattern = /^mongodb\+srv:\/\/(?:([^:]+):([^@]+)@)?([^/?]+)(?:\/([^?]+))?/;

			let match = connStr.match(srvPattern);
			let isSrv = true;

			if (!match) {
				match = connStr.match(stdPattern);
				isSrv = false;
			}

			if (!match) return null;

			const [, user, password, host, database] = match;

			return {
				host: isSrv ? host : host.includes(':') ? host.split(':')[0] : host,
				user: user || '',
				password: password === '<db_password>' || password === '<password>' ? '' : password || '',
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

				// Show helper message
				showConnectionStringHelper = true;
				setTimeout(() => {
					showConnectionStringHelper = false;
				}, 5000);

				// Clear any previous test errors
				clearDbTestError();
			}
		}
	}

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
		// Preserve database name when switching between Atlas and localhost
		const previousDbName = dbConfig.name;

		if (isAtlas) {
			dbConfig.port = ''; // Port is not used for Atlas SRV
			if (dbConfig.host === 'localhost') {
				dbConfig.host = ''; // Clear default host when switching to Atlas
			}
		} else if (dbConfig.type === 'mongodb' && !dbConfig.port) {
			dbConfig.port = '27017'; // Default port for standard MongoDB
		}

		// Restore database name if it was cleared
		if (!dbConfig.name && previousDbName) {
			dbConfig.name = previousDbName;
		}

		// Set default database name if empty
		if (!dbConfig.name) {
			dbConfig.name = 'SveltyCMS';
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

	<!-- MongoDB Atlas Helper Message -->
	{#if dbConfig.type === 'mongodb+srv'}
		<div class="mb-6 rounded border border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10">
			<button
				type="button"
				onclick={() => (showAtlasHelper = !showAtlasHelper)}
				aria-expanded={showAtlasHelper}
				aria-controls="atlas-helper-content"
				class="flex w-full items-center justify-between p-4 text-left text-blue-900 dark:text-blue-200"
			>
				<div class="flex items-center gap-3">
					<iconify-icon icon="mdi:information" width="20" class="shrink-0" aria-hidden="true"></iconify-icon>
					<span class="font-semibold">MongoDB Atlas Quick Setup</span>
				</div>
				<iconify-icon icon={showAtlasHelper ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="24" aria-hidden="true"></iconify-icon>
			</button>

			{#if showAtlasHelper}
				<div id="atlas-helper-content" class="border-t border-blue-200 p-4 pt-3 text-blue-900 dark:border-blue-500/30 dark:text-blue-200">
					<p class="text-sm">
						To connect to MongoDB Atlas, paste your connection string into the <strong>Host</strong> field:
					</p>
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

	{#if dbConfig.type === 'postgresql' || dbConfig.type === 'mysql'}
		<div class="mb-6 rounded border border-blue-200 bg-blue-50 p-4 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
			<p class="font-semibold">{m.setup_db_coming_soon()}</p>
			<p class="mt-1">
				{m.setup_db_postgres_mysql_note()}
			</p>
			<p class="mt-2">
				{m.setup_db_postgres_mysql_timeline()}
			</p>
		</div>
	{/if}
	<form
		onsubmit={(e) => {
			e.preventDefault();
			handleTestConnection();
		}}
		class="space-y-4 sm:space-y-6"
	>
		<div class="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
			<div>
				<label for="db-type" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:database" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span>{m.setup_label_database_type()}</span>
					<button
						type="button"
						tabindex="-1"
						title="Help available"
						aria-label="Help: Database Type"
						class="ml-1 text-slate-400 hover:text-primary-500"
						><iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon></button
					>
				</label>

				<select id="db-type" bind:value={dbConfig.type} onchange={clearDbTestError} class="input rounded">
					<option value="mongodb">MongoDB (localhost/Docker)</option>
					<option value="mongodb+srv">MongoDB Atlas (SRV)</option>
					<option value="postgresql">PostgreSQL</option>
					<option value="mysql">MySQL</option>
				</select>
				{#if isInstallingDriver}
					<div class="mt-2 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400" role="status">
						<iconify-icon icon="mdi:loading" class="animate-spin" width="16" aria-hidden="true"></iconify-icon>
						<span>Installing database driver...</span>
					</div>
				{/if}
				{#if installSuccess}
					<div class="mt-2 flex items-center gap-2 text-sm text-green-600 dark:text-green-400" role="status">
						<iconify-icon icon="mdi:check-circle" width="16" aria-hidden="true"></iconify-icon>
						<span>{installSuccess}</span>
					</div>
				{/if}
				{#if installError}
					<div
						class="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
						role="alert"
					>
						<div class="flex items-center gap-2">
							<iconify-icon icon="mdi:alert-circle" width="16" aria-hidden="true"></iconify-icon>
							<span class="font-medium">Driver Installation Failed</span>
						</div>
						<p class="mt-1">{installError}</p>
						<p class="mt-2 text-xs">
							You can install the driver manually or continue with the setup (connection test will show installation instructions).
						</p>
					</div>
				{/if}
			</div>

			<div>
				<label for="db-host" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:server-network" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span>{isAtlas ? 'Atlas Cluster Host' : m.setup_database_host()}</span>
					<button type="button" tabindex="-1" title="Help available" aria-label="Help: Host" class="ml-1 text-slate-400 hover:text-primary-500"
						><iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon></button
					>
				</label>

				<input
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
					placeholder={isAtlas ? 'cluster0.abcde.mongodb.net' : m.setup_database_host_placeholder?.() || 'localhost'}
					class="input w-full rounded {displayErrors.host ? 'border-error-500 focus:border-error-500 focus:ring-error-500' : 'border-slate-200'}"
					aria-invalid={!!displayErrors.host}
					aria-describedby={displayErrors.host ? 'db-host-error' : undefined}
				/>
				{#if displayErrors.host}<div id="db-host-error" class="mt-1 text-xs text-error-500" role="alert">{displayErrors.host}</div>{/if}
				{#if showConnectionStringHelper}
					<div
						class="mt-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300"
						role="status"
					>
						<div class="flex items-center gap-2">
							<iconify-icon icon="mdi:check-circle" width="16" aria-hidden="true"></iconify-icon>
							<span class="font-medium">Connection string parsed!</span>
						</div>
						<p class="mt-1 text-xs">
							Hostname, username, and password have been automatically extracted. Please verify the values and replace
							<code>&lt;db_password&gt;</code> placeholder if needed.
						</p>
					</div>
				{/if}
			</div>

			{#if !isAtlas}
				<div>
					<label for="db-port" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:ethernet" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span>{m.setup_database_port()}</span>
						<button type="button" tabindex="-1" title="Help available" aria-label="Help: Port" class="ml-1 text-slate-400 hover:text-primary-500"
							><iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon></button
						>
					</label>

					<input
						id="db-port"
						bind:value={dbConfig.port}
						type="text"
						onchange={clearDbTestError}
						onblur={() => handleBlur('port')}
						placeholder={m.setup_database_port_placeholder?.() || '27017'}
						class="input w-full rounded {displayErrors.port ? 'border-error-500 focus:border-error-500 focus:ring-error-500' : 'border-slate-200'}"
						aria-invalid={!!displayErrors.port}
						aria-describedby={displayErrors.port ? 'db-port-error' : undefined}
					/>
					{#if displayErrors.port}<div id="db-port-error" class="mt-1 text-xs text-error-500" role="alert">{displayErrors.port}</div>{/if}
				</div>
			{/if}
			<div>
				<label for="db-name" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:database-outline" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span>{m.setup_database_name()}</span>
					<button
						type="button"
						tabindex="-1"
						title="Help available"
						aria-label="Help: Database Name"
						class="ml-1 text-slate-400 hover:text-primary-500"
						><iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon></button
					>
				</label>

				<input
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
					placeholder={m.setup_database_name_placeholder?.() || 'SveltyCMS'}
					class="input w-full rounded {displayErrors.name ? 'border-error-500 focus:border-error-500 focus:ring-error-500' : 'border-slate-200'}"
					aria-invalid={!!displayErrors.name}
					aria-describedby={displayErrors.name ? 'db-name-error' : undefined}
				/>
				{#if displayErrors.name}<div id="db-name-error" class="mt-1 text-xs text-error-500" role="alert">{displayErrors.name}</div>{/if}
			</div>
			<div>
				<label for="db-user" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:account-key" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span>{m.setup_database_user()}</span>
					<button
						type="button"
						tabindex="-1"
						title="Help available"
						aria-label="Help: Database User"
						class="ml-1 text-slate-400 hover:text-primary-500"
						><iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon></button
					>
				</label>

				<input
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
					placeholder={m.setup_database_user_placeholder?.() || 'Database username'}
					class="input rounded {displayErrors.user ? 'border-error-500 focus:border-error-500 focus:ring-error-500' : 'border-slate-200'}"
					aria-invalid={!!displayErrors.user}
					aria-describedby={displayErrors.user ? 'db-user-error' : undefined}
				/>
				{#if displayErrors.user}<div id="db-user-error" class="mt-1 text-xs text-error-500" role="alert">{displayErrors.user}</div>{/if}
			</div>
			<div>
				<label for="db-password" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:key-variant" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span>{m.setup_database_password()}</span>
					<button
						type="button"
						tabindex="-1"
						title="Help available"
						aria-label="Help: Database Password"
						class="ml-1 text-slate-400 hover:text-primary-500"
						><iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon></button
					>
				</label>

				<div class="relative">
					<input
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
						placeholder={m.setup_database_password_placeholder?.() || 'Leave blank if none'}
						class="input w-full rounded {displayErrors.password
							? 'border-error-500 focus:border-error-500 focus:ring-error-500'
							: 'border-slate-200'}"
						aria-invalid={!!displayErrors.password}
						aria-describedby={displayErrors.password ? 'db-password-error' : undefined}
					/>
					<button
						type="button"
						onclick={toggleDbPassword}
						class="absolute inset-y-0 right-0 flex min-w-10 items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none dark:text-slate-500 dark:hover:text-slate-400"
						aria-label={showDbPassword ? 'Hide database password' : 'Show database password'}
					>
						<iconify-icon icon={showDbPassword ? 'mdi:eye-off' : 'mdi:eye'} width="18" height="18" aria-hidden="true"></iconify-icon>
					</button>
				</div>
				{#if displayErrors.password}
					<div id="db-password-error" class="mt-1 text-xs text-error-500" role="alert">{displayErrors.password}</div>
				{/if}
			</div>
		</div>
		{#if !unsupportedDbSelected}
			<button
				type="submit"
				disabled={isLoading}
				aria-label={isLoading ? 'Testing database connection, please wait' : 'Test database connection'}
				class="btn w-full preset-filled-tertiary-500 dark:preset-filled-primary-500 font-bold"
			>
				{#if isLoading}
					<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-t-2 border-transparent border-t-white"
						role="status"
						aria-label="Loading"
					></div>
					Testing Connection...
				{:else}
					{m.setup_button_test_connection()}
				{/if}
			</button>
		{/if}
		{#if dbConfigChangedSinceTest}
			<div
				class="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
				role="alert"
			>
				{m.setup_help_database_type?.() || 'Database settings changed since last successful test. Please re-test to proceed.'}
			</div>
		{/if}
	</form>
</div>
