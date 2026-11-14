<!--
@file src/routes/setup/DatabaseConfig.svelte
@description Database configuration step component extracted from +page.svelte for maintainability.
Provides DB type, host, port, name, user, password inputs, validation display, test button, and change warning.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Alert from '@components/ui/alert.svelte';
	import HelpIcon from '@components/ui/help-icon.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import {
		common_confirm_no,
		common_confirm_overwrite,
		common_confirm_yes,
		label_database,
		label_host,
		label_port,
		label_user,
		setup_button_test_connection,
		setup_connection_ready,
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
		setup_db_test_details_hide,
		setup_db_test_details_show,
		setup_db_test_engine,
		setup_db_test_latency,
		setup_db_test_user,
		setup_db_test_redis_button,
		setup_db_test_redis_success,
		setup_help_database_host,
		setup_help_database_name,
		setup_help_database_password,
		setup_help_database_port,
		setup_help_database_type,
		setup_help_database_user,
		setup_label_database_type,
		setup_review_label_path,
		setup_system_media_path_placeholder
	} from '@src/paraglide/messages';
	import type { ValidationErrors } from '@src/stores/setup-store.svelte';
	import { setupStore } from '@src/stores/setup-store.svelte.ts';
	import { dbConfigSchema } from '@utils/schemas';
	import { showConfirm } from '@utils/modal.svelte';
	import { parseConnectionString } from '@utils/connection-parser';
	import { safeParse } from 'valibot';
	// Static import: +page.svelte already pulls setup.remote into this chunk, so
	// a dynamic import here would be ineffective (Rolldown cannot split it out).
	import { installDatabaseDriver as installDbDriver } from './setup.remote';

	// Popup settings (click to toggle)

	// Props from parent wizard (destructure via $props to allow internal mutation without warnings)
	let {
		dbConfig = $bindable(),
		systemSettings = $bindable(),
		validationErrors,
		isLoading,
		showDbPassword = $bindable(),
		toggleDbPassword,
		testDatabaseConnection,
		dbConfigChangedSinceTest,
		clearDbTestError,
		redisAvailable
	} = $props();

	const wizard = setupStore.wizard;
	// A full connection URI embeds the port, so the details grid omits it.
	const isFullUri = $derived(() => {
		return (
			wizard.dbConfig.host.includes('mongodb://') || wizard.dbConfig.host.includes('mongodb+srv://')
		);
	});

	let unsupportedDbSelected = $state(false);
	let isAtlas = $derived(dbConfig.type === 'mongodb+srv');
	let isInstallingDriver = $state(false);
	let installError = $state('');
	let installSuccess = $state('');
	let showConnectionStringHelper = $state(false);
	let showAtlasHelper = $state(true); // Collapsible Atlas helper
	let showAdvanced = $state(false); // Collapsible Advanced options

	import { SvelteSet } from 'svelte/reactivity';

	// Engines whose adapters can route reads to regional read-only replicas.
	const REPLICA_ENGINES = new Set(['postgresql', 'mongodb']);
	const supportsReplicas = $derived(REPLICA_ENGINES.has(dbConfig.type));

	// Drivers verified in this wizard session: the install command runs at most once per
	// engine per session (SV-016). A failed attempt stays retryable.
	const verifiedDrivers = new SvelteSet<string>();
	// Not reactive: concurrent Test/Next clicks must not issue the same install twice.
	const pendingDriverInstalls = new Set<string>();

	// Flips once the operator edits the name, so the default is never reapplied mid-edit.
	let nameTouched = false;

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
	}

	interface EngineDefaults {
		name: string;
		host: string;
		port: string;
		user: string;
		password: string;
	}

	/**
	 * Connection defaults per engine. Applied on mount and on every engine change so no
	 * value (custom name, Atlas host, credentials) leaks from the previously selected engine.
	 */
	function engineDefaults(type: string): EngineDefaults {
		switch (type) {
			case 'sqlite':
				return { host: 'config/database', port: '', name: 'sveltycms.db', user: '', password: '' };
			case 'mongodb':
				return { host: 'localhost', port: '27017', name: 'sveltycms', user: '', password: '' };
			case 'mongodb+srv':
				return { host: '', port: '', name: 'sveltycms', user: '', password: '' };
			case 'mariadb':
				return { host: 'localhost', port: '3306', name: 'sveltycms', user: '', password: '' };
			case 'postgresql':
				return { host: 'localhost', port: '5432', name: 'sveltycms', user: '', password: '' };
			default:
				return { host: 'localhost', port: '', name: 'sveltycms', user: '', password: '' };
		}
	}

	/**
	 * Per-field assignment (never a whole-object replace) keeps the bound inputs from
	 * re-rendering the untouched fields.
	 */
	function applyEngineDefaults(type: string) {
		const defaults = engineDefaults(type);
		dbConfig.host = defaults.host;
		dbConfig.port = defaults.port;
		dbConfig.name = defaults.name;
		dbConfig.user = defaults.user;
		dbConfig.password = defaults.password;
	}

	/**
	 * Invalidate the last probe. A success only covers the exact configuration that was
	 * tested, so any edit must close the Next gate (`dbTestPassed`) and drop the success
	 * banner — the parent's `clearDbTestError` only resets the result and error text.
	 * `lastTestFingerprint` is deliberately kept so the "settings changed" hint shows.
	 */
	function markDbConfigEdited() {
		clearDbTestError();
		wizard.dbTestPassed = false;
		wizard.successMessage = '';
	}

	/**
	 * Name edits mark the field as touched so the engine default is never reapplied
	 * while the operator is typing (SV-009).
	 */
	function handleNameInput() {
		nameTouched = true;
		markDbConfigEdited();
	}

	// Handle paste event to detect connection strings
	function handleHostPaste(event: ClipboardEvent) {
		const pastedText = event.clipboardData?.getData('text') || '';
		const parsed = parseConnectionString(pastedText);

		if (parsed) {
			event.preventDefault();
			dbConfig.type = parsed.type;
			dbConfig.host = parsed.host;
			dbConfig.user = parsed.user;
			dbConfig.password = parsed.password;

			if (parsed.database) {
				dbConfig.name = parsed.database;
			}
			if (parsed.port) {
				dbConfig.port = Number(parsed.port);
			}

			// A pasted URI replaces every connection field: invalidate the probe and the
			// driver state belonging to the previously selected engine.
			markDbConfigEdited();
			installSuccess = '';
			installError = '';
			if (!REPLICA_ENGINES.has(parsed.type)) {
				dbConfig.replicaUrls = [];
				showAdvanced = false;
			}
		}
	}

	// Expose installDatabaseDriver to parent
	export async function installDatabaseDriver(dbType: string) {
		if (!dbType || dbType === 'mongodb' || dbType === 'mongodb+srv' || dbType === 'sqlite') {
			// MongoDB and SQLite drivers are always available, no installation needed
			return;
		}

		// One install per engine per wizard session: the command is expensive and
		// idempotent, and it used to run on every Test click and every Next.
		if (verifiedDrivers.has(dbType) || pendingDriverInstalls.has(dbType)) {
			return;
		}

		pendingDriverInstalls.add(dbType);
		isInstallingDriver = true;
		installError = '';
		installSuccess = '';

		try {
			const result = await installDbDriver(dbType);

			// The operator may have switched engines while the command ran — never show
			// the previous engine's install banner on the current one.
			if (dbConfig.type === dbType) {
				if (result.success) {
					verifiedDrivers.add(dbType);
					if (result.alreadyInstalled) {
						installSuccess = `Driver for ${dbType} is already installed`;
					} else {
						installSuccess = result.message || `Successfully installed driver for ${dbType}`;
					}
				} else {
					installError = result.error || `Failed to install driver for ${dbType}`;
				}
			}
		} catch (error) {
			if (dbConfig.type === dbType) {
				installError = `Network error while installing driver: ${error instanceof Error ? error.message : String(error)}`;
			}
		} finally {
			pendingDriverInstalls.delete(dbType);
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
		markDbConfigEdited();

		// Fresh engine ⇒ fresh connection defaults and fresh driver state. Resetting the
		// name/host/port/credentials stops a custom name or an Atlas host leaking across
		// engines; `installSuccess` must not survive a switch to MongoDB/SQLite.
		applyEngineDefaults(dbConfig.type);
		// SQLite is a local file: it has no credentials and no TCP port, so anything a
		// previous engine left behind must not reach the Review step or the completion
		// payload as "Username: …" (SV-044).
		if (dbConfig.type === 'sqlite') {
			dbConfig.user = '';
			dbConfig.password = '';
			dbConfig.port = '';
		}
		nameTouched = false;
		installSuccess = '';
		installError = '';
		isInstallingDriver = false;

		// Replicas are a PostgreSQL/MongoDB feature — drop rows the new engine cannot use.
		if (!REPLICA_ENGINES.has(dbConfig.type)) {
			dbConfig.replicaUrls = [];
			showAdvanced = false;
		}
	}

	// Mount only: seed the engine default when the persisted config has no name yet
	// (SV-009). Runs once — an operator edit is never overwritten while typing.
	onMount(() => {
		if (!nameTouched && !dbConfig.name) {
			dbConfig.name = engineDefaults(dbConfig.type).name;
		}
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
		<p
			class="text-center md:text-start text-sm text-tertiary-500 dark:text-primary-500 sm:text-base"
		>
			{setup_database_intro()}
		</p>
	</div>

	<!-- Redis recommendation (moved from the System step — Redis caches DB queries) -->
	{#if redisAvailable && !systemSettings.useRedis}
		<Alert variant="info" class="mb-4 animate-in fade-in slide-in-from-top-4 duration-500 sm:mb-6">
			<div class="flex items-start justify-between gap-4">
				<div class="flex flex-wrap items-center gap-4">
					<h4 class="font-bold leading-tight text-base text-white">
						Performance Optimization Detected
					</h4>
					<Badge variant="error" class="uppercase">Recommended</Badge>
				</div>
				<Button
					variant="outline"
					type="button"
					size="sm"
					onclick={() => (redisAvailable = false)}
					aria-label="Dismiss recommendation"
					rounded
					class="p-0 aspect-square min-w-0 shrink-0 flex items-center justify-center"
				>
					<iconify-icon icon="mdi:close" width="14"></iconify-icon>
				</Button>
			</div>
			<p class="mt-1 text-sm leading-relaxed italic">
				A local <span class="font-bold">Redis server</span> was detected on this system. Enabling Redis
				caching can reduce database load under concurrent traffic and share cached query results across
				instances.
			</p>
		</Alert>
	{/if}

	<!-- MongoDB Atlas Helper Message -->
	{#if dbConfig.type === 'mongodb+srv'}
		<div
			class="mb-6 rounded border border-tertiary-500/20 bg-tertiary-500/10 dark:border-tertiary-500/30 dark:bg-tertiary-500/10"
		>
			<Button
				variant="transparent"
				type="button"
				onclick={() => (showAtlasHelper = !showAtlasHelper)}
				aria-expanded={showAtlasHelper}
				aria-controls="atlas-helper-content"
				class="flex w-full! items-center justify-between! p-4! h-auto! text-start text-tertiary-600! dark:text-tertiary-400 font-normal!"
			>
				<div class="flex items-center gap-3">
					<iconify-icon icon="mdi:information" width="20" class="shrink-0" aria-hidden="true"
					></iconify-icon>
					<span class="font-semibold">MongoDB Atlas Quick Setup</span>
				</div>
				<iconify-icon
					icon={showAtlasHelper ? 'mdi:chevron-up' : 'mdi:chevron-down'}
					width="24"
					aria-hidden="true"
				></iconify-icon>
			</Button>

			{#if showAtlasHelper}
				<div
					id="atlas-helper-content"
					class="border-t border-tertiary-500/30 p-4 pt-3 text-tertiary-600 dark:border-tertiary-500/40 dark:text-tertiary-400"
				>
					<p class="text-sm">
						To connect to MongoDB Atlas, paste your connection string into the <strong>Host</strong> field:
					</p>
					<ul class="mt-2 space-y-1 text-sm">
						<li class="flex items-start gap-2">
							<span class="text-tertiary-500 dark:text-primary-500">1.</span>
							<span
								>In MongoDB Atlas, click <strong>"Connect"</strong> → <strong>"Compass"</strong> or
								<strong>"VS Code"</strong></span
							>
						</li>
						<li class="flex items-start gap-2">
							<span class="text-tertiary-500 dark:text-primary-500">2.</span>
							<span
								>Copy the connection string: <code class="text-xs"
									>mongodb+srv://username:password@cluster0.abcde.mongodb.net/</code
								></span
							>
						</li>
						<li class="flex items-start gap-2">
							<span class="text-tertiary-500 dark:text-primary-500">3.</span>
							<span>Paste into Host field - we extract the credentials automatically!</span>
						</li>
					</ul>
					<p class="mt-2 text-xs italic">
						💡 The Host field will show only the cluster hostname (e.g., <code
							>cluster0.abcde.mongodb.net</code
						>) after parsing.
					</p>
				</div>
			{/if}
		</div>
	{/if}

	{#if dbConfig.type === 'mysql'}
		<div
			class="mb-6 rounded border border-tertiary-500/30 bg-tertiary-500/10 p-4 text-tertiary-600 dark:border-tertiary-500/40 dark:bg-tertiary-500/10 dark:text-tertiary-400"
		>
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
					<iconify-icon
						icon="mdi:database"
						width="18"
						class="text-tertiary-500 dark:text-primary-500"
						aria-hidden="true"
					></iconify-icon>
					<span class="text-(--admin-text-body)">{setup_label_database_type()}</span>
					<SystemTooltip title={setup_help_database_type()}>
						<HelpIcon ariaLabel="Help: Database Type" />
					</SystemTooltip>
				</label>

				<Select
					id="db-type"
					bind:value={dbConfig.type}
					options={dbTypeOptions}
					placeholder="Select database type..."
					onchange={() => handleTypeChange()}
				/>
			</div>

			<div>
				<label for="db-host" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon
						icon={dbConfig.type === 'sqlite' ? 'mdi:folder-outline' : 'mdi:server-network'}
						width="18"
						class="text-tertiary-500 dark:text-primary-500"
						aria-hidden="true"
					></iconify-icon>
					<!-- SQLite stores a directory, not a network host (SV-014). -->
					<span class="text-(--admin-text-body)">
						{#if dbConfig.type === 'sqlite'}{setup_review_label_path()}
						{:else if isAtlas}Atlas Cluster Host
						{:else}{setup_database_host()}{/if}
					</span>
					<SystemTooltip title={setup_help_database_host()}>
						<HelpIcon ariaLabel="Help: Host" />
					</SystemTooltip>
				</label>

				<Input
					id="db-host"
					bind:value={dbConfig.host}
					type="text"
					oninput={markDbConfigEdited}
					onblur={() => {
						const trimmed = dbConfig.host.trim();
						if (trimmed !== dbConfig.host) {
							dbConfig.host = trimmed;
						}
						handleBlur('host');
					}}
					onpaste={handleHostPaste}
					placeholder={isAtlas
						? 'cluster0.abcde.mongodb.net'
						: dbConfig.type === 'sqlite'
							? setup_system_media_path_placeholder()
							: setup_database_host_placeholder?.() || 'localhost'}
					error={displayErrors.host}
					required
				/>
				{#if showConnectionStringHelper}
					<div
						class="mt-2 rounded border border-success-500/20 bg-success-500/10 p-3 text-sm text-success-600 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"
						role="status"
					>
						<div class="flex items-center gap-2">
							<iconify-icon icon="mdi:check-circle" width="16" aria-hidden="true"></iconify-icon>
							<span class="font-medium">Connection string parsed!</span>
						</div>
						<p class="mt-1 text-xs">
							Hostname, username, and password have been automatically extracted. Please verify the
							values and replace
							<code>&lt;db_password&gt;</code>
							placeholder if needed.
						</p>
					</div>
				{/if}
			</div>

			{#if !isAtlas && dbConfig.type !== 'sqlite'}
				<div>
					<label for="db-port" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon
							icon="mdi:ethernet"
							width="18"
							class="text-tertiary-500 dark:text-primary-500"
							aria-hidden="true"
						></iconify-icon>
						<span class="text-(--admin-text-body)">{setup_database_port()}</span>
						<SystemTooltip title={setup_help_database_port()}>
							<HelpIcon ariaLabel="Help: Port" />
						</SystemTooltip>
					</label>

					<Input
						id="db-port"
						bind:value={dbConfig.port}
						type="text"
						oninput={markDbConfigEdited}
						onblur={() => handleBlur('port')}
						placeholder={setup_database_port_placeholder?.() || '27017'}
						error={displayErrors.port}
						required
					/>
				</div>
			{/if}
			<div>
				<label for="db-name" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon
						icon="mdi:database-outline"
						width="18"
						class="text-tertiary-500 dark:text-primary-500"
						aria-hidden="true"
					></iconify-icon>
					<span class="text-(--admin-text-body)">{setup_database_name()}</span>
					<SystemTooltip title={setup_help_database_name()}>
						<HelpIcon ariaLabel="Help: Database Name" />
					</SystemTooltip>
				</label>

				<Input
					id="db-name"
					bind:value={dbConfig.name}
					type="text"
					oninput={handleNameInput}
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
						<iconify-icon
							icon="mdi:account-key"
							width="18"
							class="text-tertiary-500 dark:text-primary-500"
							aria-hidden="true"
						></iconify-icon>
						<span class="text-(--admin-text-body)">{setup_database_user()}</span>
						<SystemTooltip title={setup_help_database_user()}>
							<HelpIcon ariaLabel="Help: Database User" />
						</SystemTooltip>
					</label>

					<Input
						id="db-user"
						name="username"
						bind:value={dbConfig.user}
						type="text"
						autocomplete="off"
						oninput={markDbConfigEdited}
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
						<iconify-icon
							icon="mdi:key-variant"
							width="18"
							class="text-tertiary-500 dark:text-primary-500"
							aria-hidden="true"
						></iconify-icon>
						<span class="text-(--admin-text-body)">{setup_database_password()}</span>
						<SystemTooltip title={setup_help_database_password()}>
							<HelpIcon ariaLabel="Help: Database Password" />
						</SystemTooltip>
					</label>

					<div class="relative">
						<!-- `new-password` stops browsers reusing the site login credentials. -->
						<Input
							id="db-password"
							name="password"
							bind:value={dbConfig.password}
							oninput={markDbConfigEdited}
							onblur={() => {
								const trimmed = dbConfig.password.trim();
								if (trimmed !== dbConfig.password) {
									dbConfig.password = trimmed;
								}
								handleBlur('password');
							}}
							type={showDbPassword ? 'text' : 'password'}
							autocomplete="new-password"
							placeholder={setup_database_password_placeholder?.() || 'Leave blank if none'}
							error={displayErrors.password}
							inputClass="pe-10"
						/>
						<Button
							variant="ghost"
							type="button"
							onclick={toggleDbPassword}
							class="absolute! inset-e-0 top-0 min-w-10 p-0!"
							aria-label={showDbPassword ? 'Hide database password' : 'Show database password'}
						>
							<iconify-icon
								icon={showDbPassword ? 'mdi:eye-off' : 'mdi:eye'}
								width="18"
								height="18"
								aria-hidden="true"
							></iconify-icon>
						</Button>
					</div>
				</div>
			{/if}
		</div>

		<!-- Driver status lives outside the md:grid-cols-2 grid so a test result cannot
		     shift Host/Port onto another row (SV-013). -->
		{#if isInstallingDriver || installSuccess || installError}
			<div class="space-y-2">
				{#if isInstallingDriver}
					<div
						class="flex items-center gap-2 text-sm text-tertiary-500 dark:text-primary-500"
						role="status"
					>
						<iconify-icon icon="mdi:loading" class="animate-spin" width="16" aria-hidden="true"
						></iconify-icon>
						<span>Installing database driver...</span>
					</div>
				{/if}
				{#if installSuccess}
					<div
						class="flex items-center gap-2 text-sm text-tertiary-500 dark:text-primary-500"
						role="status"
					>
						<iconify-icon icon="mdi:check-circle" width="16" aria-hidden="true"></iconify-icon>
						<span>{installSuccess}</span>
					</div>
				{/if}
				{#if installError}
					<Alert variant="error" title="Driver Installation Failed">
						<p>{installError}</p>
						<p class="mt-2 text-xs">
							You can install the driver manually or continue with the setup (connection test will
							show installation instructions).
						</p>
					</Alert>
				{/if}
			</div>
		{/if}

		<!-- Header row holds only the toggle + help; the panel is a full-width block below
		     it (SV-007). Replicas are a PostgreSQL/MongoDB feature only (SV-008). -->
		{#if supportsReplicas}
			<div class="mb-4 flex flex-wrap items-center gap-2">
				<Button
					variant="transparent"
					type="button"
					onclick={() => (showAdvanced = !showAdvanced)}
					aria-expanded={showAdvanced}
					class="flex items-center gap-2 text-sm font-semibold! text-(--admin-text-muted) dark:text-primary-500 hover:text-tertiary-500 transition-colors p-0! h-auto! justify-start! min-w-0!"
				>
					<iconify-icon icon={showAdvanced ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="18"
					></iconify-icon>
					Advanced Database Options (Clustering & Scaling)
				</Button>
				<SystemTooltip
					title="Offload reads to regional read-only replicas (PostgreSQL/MongoDB). Writes always go to the primary. Add one connection string per replica; append ?region=code for geo routing. Optional — leave empty to use the primary only."
				>
					<HelpIcon ariaLabel="Help: Advanced database options (clustering and scaling)" />
					{#snippet content()}
						Offload reads to regional read-only replicas (PostgreSQL/MongoDB). Writes always go to
						the primary. Add one connection string per replica; append
						<code class="whitespace-nowrap">?region=code</code> for geo routing. Optional — leave empty
						to use the primary only.
					{/snippet}
				</SystemTooltip>
			</div>

			{#if showAdvanced}
				<div
					class="mb-4 space-y-4 rounded border border-(--admin-border-default) p-4 transition-all duration-300"
				>
					<div class="flex flex-col gap-2">
						<label
							for="replica-urls"
							class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-(--admin-text-body)"
						>
							<iconify-icon
								icon="mdi:database-import"
								width="16"
								class="text-tertiary-500 dark:text-primary-500"
							></iconify-icon>
							Regional Read Replicas (Optional)
						</label>
						<p class="text-xs text-tertiary-500 dark:text-primary-500 mb-2">
							Add full connection strings for regional read-only replicas (PostgreSQL/MongoDB).
						</p>

						{#each dbConfig.replicaUrls as _, index (index)}
							<div class="flex gap-2 mb-2 animate-in fade-in slide-in-from-left-2 duration-200">
								<Input
									type="text"
									bind:value={dbConfig.replicaUrls[index]}
									oninput={markDbConfigEdited}
									placeholder={dbConfig.type === 'mongodb'
										? 'mongodb://user:pass@replica-host:27017/db?region=us-east'
										: 'postgresql://user:pass@replica-host:5432/db?region=us-east'}
									class="flex-1"
								/>
								{#if dbConfig.replicaUrls.length > 1}
									<Button
										variant="ghost"
										type="button"
										aria-label="Remove replica"
										onclick={() => {
											dbConfig.replicaUrls = dbConfig.replicaUrls.filter(
												(_: string, i: number) => i !== index
											);
											markDbConfigEdited();
										}}
										class="p-0! min-w-10 rounded-full bg-error-500/10 text-error-500 hover:bg-error-500 hover:text-white transition-all"
									>
										<iconify-icon icon="mdi:close" width="16"></iconify-icon>
									</Button>
								{/if}
							</div>
						{/each}

						<Button
							variant="tertiary"
							type="button"
							size="sm"
							class="w-fit mt-2"
							onclick={() => {
								dbConfig.replicaUrls = [...dbConfig.replicaUrls, ''];
								markDbConfigEdited();
							}}
						>
							<iconify-icon icon="mdi:plus" width="16"></iconify-icon>
							Add Replica Node
						</Button>
					</div>
				</div>
			{/if}
		{/if}

		{#if !unsupportedDbSelected}
			<Button
				variant="primary"
				type="submit"
				disabled={isLoading}
				aria-label={isLoading
					? 'Testing database connection, please wait'
					: 'Test database connection'}
				class="flex w-full items-center justify-center gap-2"
			>
				{#if isLoading}
					<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-t-2 border-transparent border-t-white"
						role="status"
						aria-label="Loading"
					></div>
					Testing Connection...
				{:else if wizard.dbTestPassed && !dbConfigChangedSinceTest}
					<iconify-icon icon="mdi:check-bold" width="16"></iconify-icon>
					{setup_button_test_connection()}
				{:else}
					<iconify-icon icon="mdi:database" width="16"></iconify-icon>
					{setup_button_test_connection()}
				{/if}
			</Button>
		{/if}
		{#if dbConfigChangedSinceTest}
			<!-- Re-test hint, not the engine help text (SV-015). -->
			<Alert variant="warning" class="mt-2 text-xs">
				{setup_connection_ready()}
			</Alert>
		{/if}
	</form>

	<!-- DB test result — each banner is tied to the gate it describes, so the UI can
	     never show "connection OK" while Next is disabled (SV-018). -->
	{#if wizard.lastDbTestResult && !setupStore.dbConfigChangedSinceTest && (wizard.dbTestPassed ? Boolean(wizard.successMessage) : Boolean(wizard.errorMessage))}
		<div
			class="mt-6 flex flex-col rounded border-s-4 p-0 text-sm overflow-hidden"
			class:border-primary-500={!!wizard.successMessage}
			class:border-error-500={!!wizard.errorMessage}
			aria-live="polite"
			aria-atomic="true"
		>
			<div
				class="flex items-center gap-2 px-4 py-3 {wizard.successMessage
					? 'bg-success-500/10 text-primary-600 dark:text-primary-400'
					: ''} {wizard.errorMessage ? 'bg-error-500/10 text-error-600 dark:text-error-400' : ''}"
			>
				<svg class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					{#if wizard.successMessage}
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/>
					{:else}
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					{/if}
				</svg>
				<div class="flex-1">
					{#if wizard.errorMessage}
						<span class="font-bold">Connection Failed</span>{#if wizard.showDbDetails}: <span
								class="font-normal">{wizard.errorMessage}</span
							>{/if}
					{:else}
						{wizard.successMessage}
					{/if}
				</div>
				<div class="flex gap-2">
					<Button
						variant="outline"
						type="button"
						onclick={() => (wizard.showDbDetails = !wizard.showDbDetails)}
						size="sm"
						class="text-(--admin-text-body) flex items-center gap-1"
					>
						<iconify-icon
							icon={wizard.showDbDetails ? 'mdi:chevron-up' : 'mdi:chevron-down'}
							class="h-4 w-4"
						></iconify-icon>
						<span class="hidden sm:inline"
							>{wizard.showDbDetails
								? setup_db_test_details_hide()
								: setup_db_test_details_show()}</span
						>
					</Button>
					<Button
						variant="outline"
						type="button"
						aria-label="Close message"
						onclick={setupStore.clearDbTestError}
						rounded
						size="sm"
						class="p-0! min-w-0 h-7 w-7"
					>
						<iconify-icon icon="mdi:close" size="16" class="dark:text-(--admin-text-body)"
						></iconify-icon>
					</Button>
				</div>
			</div>
			{#if wizard.showDbDetails && wizard.lastDbTestResult}
				<div
					class="border-t border-(--admin-border-default) bg-secondary-500/50 text-xs dark:bg-(--admin-bg-sidebar)"
				>
					<div class="grid grid-cols-2 gap-x-4 gap-y-2 p-4 sm:grid-cols-3 lg:grid-cols-6">
						<div class="flex flex-col">
							<span
								class="font-semibold text-(--admin-text-muted) uppercase text-[10px] tracking-wider"
								>{setup_db_test_latency()}:</span
							>
							<span class="text-tertiary-500 dark:text-primary-500 font-bold"
								>{wizard.lastDbTestResult.latencyMs ?? '—'} ms</span
							>
						</div>
						<div class="flex flex-col">
							<span
								class="font-semibold text-(--admin-text-muted) uppercase text-[10px] tracking-wider"
								>{setup_db_test_engine()}:</span
							>
							<span class="text-tertiary-500 dark:text-primary-500 font-bold"
								>{wizard.dbConfig.type}</span
							>
						</div>
						<div class="flex flex-col">
							<span
								class="font-semibold text-(--admin-text-muted) uppercase text-[10px] tracking-wider"
								>{label_host()}:</span
							>
							<span
								class="text-tertiary-500 dark:text-primary-500 font-bold truncate"
								title={wizard.dbConfig.host}>{wizard.dbConfig.host}</span
							>
						</div>
						{#if !isFullUri}
							<div class="flex flex-col">
								<span
									class="font-semibold text-(--admin-text-muted) uppercase text-[10px] tracking-wider"
									>{label_port()}:</span
								>
								<span class="text-tertiary-500 dark:text-primary-500 font-bold"
									>{wizard.dbConfig.port}</span
								>
							</div>
						{/if}
						<div class="flex flex-col">
							<span
								class="font-semibold text-(--admin-text-muted) uppercase text-[10px] tracking-wider"
								>{label_database()}:</span
							>
							<span
								class="text-tertiary-500 dark:text-primary-500 font-bold truncate"
								title={wizard.dbConfig.name}>{wizard.dbConfig.name}</span
							>
						</div>
						{#if wizard.dbConfig.user}
							<div class="flex flex-col">
								<span
									class="font-semibold text-(--admin-text-muted) uppercase text-[10px] tracking-wider"
									>{label_user?.() || setup_db_test_user()}:</span
								>
								<span
									class="text-tertiary-500 dark:text-primary-500 font-bold truncate"
									title={wizard.dbConfig.user}>{wizard.dbConfig.user}</span
								>
							</div>
						{/if}
					</div>
					{#if !wizard.lastDbTestResult.success && wizard.lastDbTestResult.hint}
						<div
							class="border-t border-(--admin-border-default) p-4 bg-warning-500/30 dark:bg-warning-900/10"
						>
							<div
								class="flex items-center gap-2 font-bold text-warning-600 dark:text-warning-400 mb-2"
							>
								<iconify-icon icon="mdi:lightbulb-outline" class="text-lg"></iconify-icon>
								<span class="uppercase tracking-widest text-[10px]"
									>Troubleshooting Suggestions</span
								>
							</div>
							<div class="space-y-2">
								{#each wizard.lastDbTestResult.hint.split('\n') as step (step)}
									<div class="flex gap-2 text-(--admin-text-muted)">
										<span class="shrink-0 text-warning-500">•</span>
										<span>{step.replace(/^\d+\.\s*/, '')}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Redis Caching (moved from the System step) -->
	<section id="redis-section" class="mt-6 border-t border-(--admin-border-default) pt-4">
		<div class="rounded-lg border border-(--admin-border-default) bg-(--admin-bg-chip) p-4">
			<div class="flex items-center justify-between gap-4">
				<Checkbox
					bind:checked={systemSettings.useRedis}
					label="Enable Redis Caching"
					description="Significantly improves performance by caching database queries and session data in-memory."
					variant="default"
				>
					{#snippet labelSnippet()}
						<span class="inline-flex items-center gap-1.5">
							Enable Redis Caching
							<SystemTooltip
								title="Caches database queries and session data in memory so repeated reads skip the database. Best for high read traffic or multi-instance deployments. Requires a reachable Redis server — use Test Redis Connection to verify. Leave off to use the built-in in-memory cache."
							>
								<HelpIcon ariaLabel="Help: Enable Redis caching" />
							</SystemTooltip>
						</span>
					{/snippet}
				</Checkbox>
				{#if systemSettings.useRedis}
					{#if setupStore.wizard.redisTestPassed}
						<span
							class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary-500/10 px-2.5 py-1 text-xs font-semibold text-primary-500"
						>
							<iconify-icon icon="mdi:check-circle" width="14"></iconify-icon>
							Connected
						</span>
					{:else}
						<span
							class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-warning-500/10 px-2.5 py-1 text-xs font-semibold text-warning-600 dark:text-warning-400"
						>
							<iconify-icon icon="mdi:clock-outline" width="14"></iconify-icon>
							Pending Test
						</span>
					{/if}
				{/if}
			</div>

			{#if systemSettings.useRedis}
				<div class="mt-4 space-y-4 border-t border-(--admin-border-default) pt-4">
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<Input
							id="redis-host"
							bind:value={systemSettings.redisHost}
							type="text"
							data-1p-ignore
							label="Redis Host"
							placeholder="localhost"
						/>
						<Input
							id="redis-port"
							bind:value={systemSettings.redisPort}
							type="text"
							data-1p-ignore
							label="Redis Port"
							placeholder="6379"
						/>
						<Input
							id="redis-password"
							bind:value={systemSettings.redisPassword}
							type="password"
							autocomplete="new-password"
							data-1p-ignore
							label="Redis Password (Optional)"
							placeholder="••••••••"
						/>
					</div>

					<div class="flex flex-wrap items-center justify-between gap-3 pt-2">
						<Button
							variant={setupStore.wizard.redisTestPassed ? 'success' : 'tertiary'}
							type="button"
							onclick={setupStore.testRedisConnection}
							aria-label="test-redis-connection"
							disabled={setupStore.wizard.isLoading}
							class="flex w-full items-center justify-center gap-2 rounded"
						>
							{#if setupStore.wizard.isLoading}
								<iconify-icon icon="line-md:loading-twotone-loop" width="16"></iconify-icon>
								<span>Testing Connection...</span>
							{:else if setupStore.wizard.redisTestPassed}
								<iconify-icon icon="mdi:check-bold" width="16" class="text-white"></iconify-icon>
								<span>{setup_db_test_redis_success?.() || 'Connected - Re-test'}</span>
							{:else}
								<iconify-icon icon="mdi:flash-outline" width="16"></iconify-icon>
								<span>{setup_db_test_redis_button?.() || 'Test Redis Connection'}</span>
							{/if}
						</Button>

						{#if setupStore.wizard.errorMessage && !setupStore.wizard.redisTestPassed}
							<p class="flex items-center gap-1.5 text-xs font-medium text-error-500">
								<iconify-icon icon="mdi:alert-circle" width="16"></iconify-icon>
								{setupStore.wizard.errorMessage}
							</p>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</section>
</div>
