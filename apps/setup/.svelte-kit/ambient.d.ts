// this file is generated — do not edit it

/// <reference types="@sveltejs/kit" />

/**
 * Environment variables [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env`. Like [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), this module cannot be imported into client-side code. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 *
 * _Unlike_ [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), the values exported from this module are statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 *
 * ```ts
 * import { API_KEY } from '$env/static/private';
 * ```
 *
 * Note that all environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 *
 * ```
 * MY_FEATURE_FLAG=""
 * ```
 *
 * You can override `.env` values from the command line like so:
 *
 * ```sh
 * MY_FEATURE_FLAG="enabled" npm run dev
 * ```
 */
declare module '$env/static/private' {
	export const NX_WORKSPACE_ROOT: string;
	export const SSH_CLIENT: string;
	export const USER: string;
	export const npm_config_user_agent: string;
	export const GIT_ASKPASS: string;
	export const XDG_SESSION_TYPE: string;
	export const npm_node_execpath: string;
	export const BROWSER: string;
	export const NX_VERBOSE_LOGGING: string;
	export const SHLVL: string;
	export const ANTIGRAVITY_CLI_ALIAS: string;
	export const HOME: string;
	export const NODENV_HOOK_PATH: string;
	export const OLDPWD: string;
	export const TERM_PROGRAM_VERSION: string;
	export const VSCODE_IPC_HOOK_CLI: string;
	export const npm_package_json: string;
	export const PAGER: string;
	export const VSCODE_GIT_ASKPASS_MAIN: string;
	export const VSCODE_GIT_ASKPASS_NODE: string;
	export const npm_config_local_prefix: string;
	export const DBUS_SESSION_BUS_ADDRESS: string;
	export const NODENV_VERSION: string;
	export const VSCODE_PYTHON_AUTOACTIVATE_GUARD: string;
	export const ANTIGRAVITY_AGENT: string;
	export const COLORTERM: string;
	export const FORCE_COLOR: string;
	export const LOGNAME: string;
	export const XDG_SESSION_CLASS: string;
	export const TERM: string;
	export const XDG_SESSION_ID: string;
	export const NODENV_ROOT: string;
	export const NX_TASK_HASH: string;
	export const PATH: string;
	export const NODE: string;
	export const npm_package_name: string;
	export const LERNA_PACKAGE_NAME: string;
	export const XDG_RUNTIME_DIR: string;
	export const LANG: string;
	export const LS_COLORS: string;
	export const TERM_PROGRAM: string;
	export const VSCODE_GIT_IPC_HANDLE: string;
	export const npm_lifecycle_script: string;
	export const SSH_AUTH_SOCK: string;
	export const SHELL: string;
	export const npm_lifecycle_event: string;
	export const npm_package_version: string;
	export const NX_CLI_SET: string;
	export const NX_TASK_TARGET_TARGET: string;
	export const NX_LOAD_DOT_ENV_FILES: string;
	export const NODENV_SHELL: string;
	export const NX_TASK_TARGET_PROJECT: string;
	export const VSCODE_GIT_ASKPASS_EXTRA_ARGS: string;
	export const PWD: string;
	export const npm_execpath: string;
	export const SSH_CONNECTION: string;
	export const XDG_DATA_DIRS: string;
	export const NODENV_DIR: string;
	export const NX_TUI: string;
	export const npm_command: string;
	export const NODE_ENV: string;
}

/**
 * Similar to [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private), except that it only includes environment variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 *
 * Values are replaced statically at build time.
 *
 * ```ts
 * import { PUBLIC_BASE_URL } from '$env/static/public';
 * ```
 */
declare module '$env/static/public' {}

/**
 * This module provides access to runtime environment variables, as defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 *
 * This module cannot be imported into client-side code.
 *
 * ```ts
 * import { env } from '$env/dynamic/private';
 * console.log(env.DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 *
 * > [!NOTE] In `dev`, `$env/dynamic` always includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 */
declare module '$env/dynamic/private' {
	export const env: {
		NX_WORKSPACE_ROOT: string;
		SSH_CLIENT: string;
		USER: string;
		npm_config_user_agent: string;
		GIT_ASKPASS: string;
		XDG_SESSION_TYPE: string;
		npm_node_execpath: string;
		BROWSER: string;
		NX_VERBOSE_LOGGING: string;
		SHLVL: string;
		ANTIGRAVITY_CLI_ALIAS: string;
		HOME: string;
		NODENV_HOOK_PATH: string;
		OLDPWD: string;
		TERM_PROGRAM_VERSION: string;
		VSCODE_IPC_HOOK_CLI: string;
		npm_package_json: string;
		PAGER: string;
		VSCODE_GIT_ASKPASS_MAIN: string;
		VSCODE_GIT_ASKPASS_NODE: string;
		npm_config_local_prefix: string;
		DBUS_SESSION_BUS_ADDRESS: string;
		NODENV_VERSION: string;
		VSCODE_PYTHON_AUTOACTIVATE_GUARD: string;
		ANTIGRAVITY_AGENT: string;
		COLORTERM: string;
		FORCE_COLOR: string;
		LOGNAME: string;
		XDG_SESSION_CLASS: string;
		TERM: string;
		XDG_SESSION_ID: string;
		NODENV_ROOT: string;
		NX_TASK_HASH: string;
		PATH: string;
		NODE: string;
		npm_package_name: string;
		LERNA_PACKAGE_NAME: string;
		XDG_RUNTIME_DIR: string;
		LANG: string;
		LS_COLORS: string;
		TERM_PROGRAM: string;
		VSCODE_GIT_IPC_HANDLE: string;
		npm_lifecycle_script: string;
		SSH_AUTH_SOCK: string;
		SHELL: string;
		npm_lifecycle_event: string;
		npm_package_version: string;
		NX_CLI_SET: string;
		NX_TASK_TARGET_TARGET: string;
		NX_LOAD_DOT_ENV_FILES: string;
		NODENV_SHELL: string;
		NX_TASK_TARGET_PROJECT: string;
		VSCODE_GIT_ASKPASS_EXTRA_ARGS: string;
		PWD: string;
		npm_execpath: string;
		SSH_CONNECTION: string;
		XDG_DATA_DIRS: string;
		NODENV_DIR: string;
		NX_TUI: string;
		npm_command: string;
		NODE_ENV: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	};
}

/**
 * Similar to [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), but only includes variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 *
 * Note that public dynamic environment variables must all be sent from the server to the client, causing larger network requests — when possible, use `$env/static/public` instead.
 *
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.PUBLIC_DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	};
}
