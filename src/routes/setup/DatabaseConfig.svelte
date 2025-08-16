<!--
@file src/routes/setup/DatabaseConfig.svelte
@description Database configuration step component extracted from +page.svelte for maintainability.
Provides DB type, host, port, name, user, password inputs, validation display, test button, and change warning.
-->
<script lang="ts">
	import { popup, type PopupSettings } from '@skeletonlabs/skeleton';
	import * as m from '@src/paraglide/messages';

	// Popup settings (click to toggle)
	const popupDbType: PopupSettings = { event: 'click', target: 'popupDbType', placement: 'top' };
	const popupDbHost: PopupSettings = { event: 'click', target: 'popupDbHost', placement: 'top' };
	const popupDbPort: PopupSettings = { event: 'click', target: 'popupDbPort', placement: 'top' };
	const popupDbName: PopupSettings = { event: 'click', target: 'popupDbName', placement: 'top' };
	const popupDbUser: PopupSettings = { event: 'click', target: 'popupDbUser', placement: 'top' };
	const popupDbPassword: PopupSettings = { event: 'click', target: 'popupDbPassword', placement: 'top' };

	// Props from parent wizard (destructure via $props to allow internal mutation without warnings)
	interface DbConfig {
		type: string;
		host: string;
		port: string;
		name: string;
		user: string;
		password: string;
	}
	interface ValidationErrors {
		host?: string;
		port?: string;
		name?: string;
		[key: string]: string | undefined;
	}
	let {
		dbConfig = $bindable(),
		validationErrors,
		isLoading,
		showDbPassword,
		toggleDbPassword,
		testDatabaseConnection,
		dbConfigChangedSinceTest
	} = $props<{
		dbConfig: DbConfig;
		validationErrors: ValidationErrors;
		isLoading: boolean;
		showDbPassword: boolean;
		toggleDbPassword: () => void;
		testDatabaseConnection: () => void | Promise<void>;
		dbConfigChangedSinceTest: boolean;
	}>();
</script>

<div class="fade-in">
	<div class="mb-6 sm:mb-8">
		<p class="text-sm text-tertiary-500 dark:text-primary-500 sm:text-base">
			{m.setup_database_intro()}
		</p>
	</div>
	<div class="space-y-4 sm:space-y-6">
		<div class="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
			<div>
				<label for="db-type" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:database" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span>{m.setup_label_database_type()}</span>
					<button type="button" use:popup={popupDbType} aria-label="Help: Database Type" class="ml-1 text-slate-400 hover:text-primary-500"
						><iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon></button
					>
				</label>
				<div
					data-popup="popupDbType"
					class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
				>
					<p>{m.setup_help_database_type?.() || 'Select the database engine to use. Ensure the server & driver are installed.'}</p>
					<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
				</div>
				<select id="db-type" value={dbConfig.type} onchange={(e) => (dbConfig.type = (e.target as HTMLSelectElement).value)} class="input rounded">
					<option value="mongodb">MongoDB</option>
					<option value="postgresql">PostgreSQL</option>
					<option value="mysql">MySQL</option>
				</select>
			</div>
			<div>
				<label for="db-host" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:server-network" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span>{m.setup_database_host()}</span>
					<button type="button" use:popup={popupDbHost} aria-label="Help: Host" class="ml-1 text-slate-400 hover:text-primary-500"
						><iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon></button
					>
				</label>
				<div
					data-popup="popupDbHost"
					class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
				>
					<p>{m.setup_help_database_host?.() || 'Hostname or IP address where the database server is reachable.'}</p>
					<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
				</div>
				<input
					id="db-host"
					value={dbConfig.host}
					oninput={(e) => (dbConfig.host = (e.target as HTMLInputElement).value)}
					type="text"
					placeholder={m.setup_database_host_placeholder?.() || 'localhost'}
					class="input w-full rounded {validationErrors.host ? 'border-error-500' : 'border-slate-200'}"
				/>
				{#if validationErrors.host}<div class="mt-1 text-xs text-error-500">{validationErrors.host}</div>{/if}
			</div>
			<div>
				<label for="db-port" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:ethernet" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span>{m.setup_database_port()}</span>
					<button type="button" use:popup={popupDbPort} aria-label="Help: Port" class="ml-1 text-slate-400 hover:text-primary-500"
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
					value={dbConfig.port}
					oninput={(e) => (dbConfig.port = (e.target as HTMLInputElement).value)}
					type="text"
					placeholder={m.setup_database_port_placeholder?.() || '27017'}
					class="input w-full rounded {validationErrors.port ? 'border-error-500' : 'border-slate-200'}"
				/>
				{#if validationErrors.port}<div class="mt-1 text-xs text-error-500">{validationErrors.port}</div>{/if}
			</div>
			<div>
				<label for="db-name" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:database-outline" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span>{m.setup_database_name()}</span>
					<button type="button" use:popup={popupDbName} aria-label="Help: Database Name" class="ml-1 text-slate-400 hover:text-primary-500"
						><iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon></button
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
					value={dbConfig.name}
					oninput={(e) => (dbConfig.name = (e.target as HTMLInputElement).value)}
					type="text"
					placeholder={m.setup_database_name_placeholder?.() || 'SveltyCMS'}
					class="input w-full rounded {validationErrors.name ? 'border-error-500' : 'border-slate-200'}"
				/>
				{#if validationErrors.name}<div class="mt-1 text-xs text-error-500">{validationErrors.name}</div>{/if}
			</div>
			<div>
				<label for="db-user" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:account-key" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span>{m.setup_database_user()}</span>
					<button type="button" use:popup={popupDbUser} aria-label="Help: Database User" class="ml-1 text-slate-400 hover:text-primary-500"
						><iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon></button
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
					value={dbConfig.user}
					oninput={(e) => (dbConfig.user = (e.target as HTMLInputElement).value)}
					type="text"
					placeholder={m.setup_database_user_placeholder?.() || 'Database username'}
					class="input rounded"
				/>
			</div>
			<div>
				<label for="db-password" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:key-variant" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span>{m.setup_database_password()}</span>
					<button type="button" use:popup={popupDbPassword} aria-label="Help: Database Password" class="ml-1 text-slate-400 hover:text-primary-500"
						><iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon></button
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
						value={dbConfig.password}
						oninput={(e) => (dbConfig.password = (e.target as HTMLInputElement).value)}
						type={showDbPassword ? 'text' : 'password'}
						placeholder={m.setup_database_password_placeholder?.() || 'Database password'}
						class="input w-full rounded"
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
			</div>
		</div>
		<button onclick={testDatabaseConnection} disabled={isLoading} class="variant-filled-tertiary btn w-full dark:variant-filled-primary">
			{#if isLoading}
				<div class="h-4 w-4 animate-spin rounded-full border-2 border-t-2 border-transparent border-t-white"></div>
				Testing Connection...
			{:else}
				{m.setup_button_test_connection()}
			{/if}
		</button>
		{#if dbConfigChangedSinceTest}
			<div
				class="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
			>
				{m.setup_help_database_type?.() || 'Database settings changed since last successful test. Please re-test to proceed.'}
			</div>
		{/if}
	</div>
</div>
