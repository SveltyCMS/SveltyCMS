<!--
@file src/routes/(app)/config/api/+page.svelte
@description Interactive Developer & API Playground for REST (OpenAPI) and GraphQL.
@component
@props {object} data - Server load data containing endpoints and collection list.
-->
<script lang="ts">
	import AdminPageShell from "@components/admin-page-shell.svelte";
	import AdminCard from "@components/admin-card.svelte";
	import Button from "@components/ui/button.svelte";
	import Badge from "@components/ui/badge.svelte";
	import Input from "@components/ui/input.svelte";
	import Textarea from "@components/ui/textarea.svelte";
	import Select from "@components/ui/select.svelte";
	import { toast } from "@src/stores/toast.svelte.ts";
	import { clientJsonHeaders } from "@utils/security/client-csrf";

	interface Props {
		data: {
			isAdmin: boolean;
			tenantId: string | null;
			openapiSpecUrl: string;
			graphqlEndpoint: string;
			collections: { id: string; name: string; icon?: string }[];
		};
	}

	let { data }: Props = $props();

	type Tab = "rest" | "graphql" | "codegen";
	let activeTab = $state<Tab>("rest");

	// ── REST State ──
	let restMethod = $state<"GET" | "POST">("GET");
	let restEndpoint = $state("/api/openapi.json");
	let restBody = $state("");
	let restLoading = $state(false);
	let restResponse = $state<string | null>(null);
	let restStatus = $state<number | null>(null);
	let restDuration = $state<number | null>(null);

	// ── GraphQL State ──
	const DEFAULT_GQL_QUERY = `query SystemHealth {
  contentSystemHealth {
    systemMemory
    status
    database
  }
  allCollections {
    _id
    name
  }
}`;
	let gqlQuery = $state(DEFAULT_GQL_QUERY);
	let gqlVariables = $state("{}");
	let gqlLoading = $state(false);
	let gqlResponse = $state<string | null>(null);
	let gqlStatus = $state<number | null>(null);
	let gqlDuration = $state<number | null>(null);

	// ── CodeGen State ──
	let customCollection = $state<string | null>(null);
	const selectedCollection = $derived(customCollection ?? (data.collections[0]?.id || "system"));
	let selectedSnippetType = $state<"curl" | "typescript" | "python" | "localcms">("typescript");

	async function executeRestQuery() {
		restLoading = true;
		restResponse = null;
		restStatus = null;
		restDuration = null;
		const t0 = performance.now();

		try {
			const options: RequestInit = {
				method: restMethod,
				headers: clientJsonHeaders(),
			};
			if (restMethod === "POST" && restBody.trim()) {
				options.body = restBody;
			}
			const res = await fetch(restEndpoint, options);
			restDuration = Math.round(performance.now() - t0);
			restStatus = res.status;
			const text = await res.text();
			try {
				restResponse = JSON.stringify(JSON.parse(text), null, 2);
			} catch {
				restResponse = text;
			}
		} catch (err: unknown) {
			restDuration = Math.round(performance.now() - t0);
			restStatus = 500;
			restResponse = err instanceof Error ? err.message : String(err);
		} finally {
			restLoading = false;
		}
	}

	async function executeGraphqlQuery() {
		gqlLoading = true;
		gqlResponse = null;
		gqlStatus = null;
		gqlDuration = null;
		const t0 = performance.now();

		try {
			let parsedVariables = {};
			if (gqlVariables.trim()) {
				try {
					parsedVariables = JSON.parse(gqlVariables);
				} catch (e: unknown) {
					toast.error("GraphQL variables must be valid JSON");
					gqlLoading = false;
					return;
				}
			}

			const res = await fetch(data.graphqlEndpoint, {
				method: "POST",
				headers: clientJsonHeaders(),
				body: JSON.stringify({
					query: gqlQuery,
					variables: parsedVariables,
				}),
			});

			gqlDuration = Math.round(performance.now() - t0);
			gqlStatus = res.status;
			const json = await res.json();
			gqlResponse = JSON.stringify(json, null, 2);
		} catch (err: unknown) {
			gqlDuration = Math.round(performance.now() - t0);
			gqlStatus = 500;
			gqlResponse = err instanceof Error ? err.message : String(err);
		} finally {
			gqlLoading = false;
		}
	}

	function copyToClipboard(text: string, label: string) {
		if (typeof navigator !== "undefined" && navigator.clipboard) {
			navigator.clipboard.writeText(text);
			toast.success(`${label} copied to clipboard`);
		}
	}

	const generatedSnippet = $derived.by(() => {
		const col = selectedCollection;
		if (selectedSnippetType === "curl") {
			return `# Query ${col} collection via cURL
curl -X GET "http://localhost:5173/api/content/${col}" \\
  -H "Accept: application/json" \\
  -H "Cookie: token=YOUR_SESSION_TOKEN"`;
		}

		if (selectedSnippetType === "typescript") {
			return `// Fetch ${col} using modern TypeScript / fetch
interface ApiResponse<T> {
  success: boolean;
  data: T[];
  total?: number;
}

export async function fetch${col.charAt(0).toUpperCase() + col.slice(1)}() {
  const response = await fetch('/api/content/${col}', {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(\`Failed to fetch ${col}: \${response.statusText}\`);
  }

  const result: ApiResponse<Record<string, unknown>> = await response.json();
  return result.data;
}`;
		}

		if (selectedSnippetType === "python") {
			return `# Fetch ${col} using Python requests
import requests

def get_${col}():
    url = "http://localhost:5173/api/content/${col}"
    headers = {"Accept": "application/json"}
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json().get("data", [])

if __name__ == "__main__":
    records = get_${col}()
    print(f"Retrieved {len(records)} entries")`;
		}

		// LocalCMS SvelteKit Server Function (Zero Latency)
		return `// Server-to-server zero-latency SDK call (+page.server.ts)
import { LocalCMS } from '@src/services/sdk';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const cms = new LocalCMS(locals.dbAdapter);

  // Direct in-process query — 10-50x faster than internal HTTP fetch
  const entries = await cms.collections.getEntries('${col}', {
    tenantId: locals.tenantId,
    limit: 50
  });

  return { entries };
};`;
	});
</script>

<AdminPageShell
	title="Developer & API Playground"
	description="Test REST and GraphQL endpoints directly with active session credentials"
>
	{#snippet actions()}
		<div class="flex items-center gap-2">
			{#if data.tenantId}
				<Badge variant="tertiary" size="sm">
					Tenant: {data.tenantId}
				</Badge>
			{/if}
			<a
				href="/api/docs"
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-1.5 rounded-lg border border-surface-500/20 bg-surface-500/10 px-3 py-1.5 text-xs font-medium text-surface-900 transition-colors hover:bg-surface-500/10 dark:bg-surface-800 dark:text-surface-100"
			>
				<iconify-icon icon="mdi:open-in-new" width="14"></iconify-icon>
				Full Swagger UI
			</a>
		</div>
	{/snippet}

	<!-- Tab Switcher -->
	<div class="mb-6 flex border-b border-surface-500/20">
		<button
			type="button"
			onclick={() => (activeTab = "rest")}
			class="flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 {activeTab === 'rest' ? 'border-primary-500 text-primary-500' : 'border-transparent text-surface-500 hover:text-surface-900 dark:hover:text-surface-100'}"
		>
			<iconify-icon icon="mdi:swap-horizontal-bold" width="18"></iconify-icon>
			REST / OpenAPI
		</button>
		<button
			type="button"
			onclick={() => (activeTab = "graphql")}
			class="flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 {activeTab === 'graphql' ? 'border-primary-500 text-primary-500' : 'border-transparent text-surface-500 hover:text-surface-900 dark:hover:text-surface-100'}"
		>
			<iconify-icon icon="teenyicons:graphql-solid" width="16"></iconify-icon>
			GraphQL Console
		</button>
		<button
			type="button"
			onclick={() => (activeTab = "codegen")}
			class="flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 {activeTab === 'codegen' ? 'border-primary-500 text-primary-500' : 'border-transparent text-surface-500 hover:text-surface-900 dark:hover:text-surface-100'}"
		>
			<iconify-icon icon="mdi:code-tags" width="18"></iconify-icon>
			SDK & Code Snippets
		</button>
	</div>

	<!-- TAB 1: REST API / OpenAPI -->
	{#if activeTab === "rest"}
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Request Form -->
			<AdminCard>
				<h3 class="mb-4 text-base font-semibold text-surface-900 dark:text-surface-50">
					Send API Request
				</h3>

				<div class="space-y-4">
					<!-- Method + Endpoint Bar -->
					<div class="flex gap-2">
						<div class="w-28">
							<Select
								value={restMethod}
								options={[
									{ value: "GET", label: "GET" },
									{ value: "POST", label: "POST" },
								]}
								onchange={(val: string) => (restMethod = val as "GET" | "POST")}
							/>
						</div>
						<div class="flex-1">
							<Input
								bind:value={restEndpoint}
								placeholder="/api/openapi.json or /api/content/..."
							/>
						</div>
					</div>

					<!-- Presets for fast testing -->
					<div class="flex flex-wrap items-center gap-1.5">
						<span class="text-xs text-surface-500">Quick Presets:</span>
						<button
							type="button"
							onclick={() => { restMethod = "GET"; restEndpoint = "/api/openapi.json"; }}
							class="rounded bg-surface-500/10 px-2 py-0.5 text-xs text-surface-600 hover:bg-surface-500/20 dark:text-surface-400"
						>
							OpenAPI Spec
						</button>
						<button
							type="button"
							onclick={() => { restMethod = "GET"; restEndpoint = "/api/system/version"; }}
							class="rounded bg-surface-500/10 px-2 py-0.5 text-xs text-surface-600 hover:bg-surface-500/20 dark:text-surface-400"
						>
							System Version
						</button>
						{#each data.collections.slice(0, 3) as col}
							<button
								type="button"
								onclick={() => { restMethod = "GET"; restEndpoint = `/api/content/${col.id}`; }}
								class="rounded bg-surface-500/10 px-2 py-0.5 text-xs text-surface-600 hover:bg-surface-500/20 dark:text-surface-400"
							>
								{col.name}
							</button>
						{/each}
					</div>

					<!-- Request Body (for POST) -->
					{#if restMethod === "POST"}
						<div class="space-y-1">
							<label for="rest-body-input" class="block text-xs font-medium text-surface-500">
								Request Body (JSON)
							</label>
							<Textarea
								id="rest-body-input"
								value={restBody}
								rows={6}
								placeholder={"{\n  \"field\": \"value\"\n}"}
								oninput={(e) => (restBody = (e.target as HTMLTextAreaElement).value)}
							/>
						</div>
					{/if}

					<div class="pt-2">
						<Button
							variant="primary"
							disabled={restLoading || !restEndpoint.trim()}
							onclick={executeRestQuery}
						>
							{#if restLoading}
								<iconify-icon icon="mdi:loading" class="animate-spin me-1.5"></iconify-icon>
								Executing...
							{:else}
								<iconify-icon icon="mdi:send" width="16" class="me-1.5"></iconify-icon>
								Execute Request
							{/if}
						</Button>
					</div>
				</div>
			</AdminCard>

			<!-- Response Viewer -->
			<AdminCard>
				<div class="mb-4 flex items-center justify-between">
					<h3 class="text-base font-semibold text-surface-900 dark:text-surface-50">
						Response
					</h3>
					<div class="flex items-center gap-2">
						{#if restStatus !== null}
							<Badge variant={restStatus >= 200 && restStatus < 300 ? "success" : "error"} size="sm">
								Status: {restStatus}
							</Badge>
						{/if}
						{#if restDuration !== null}
							<Badge variant="surface" size="sm">
								{restDuration}ms
							</Badge>
						{/if}
						{#if restResponse}
							<button
								type="button"
								onclick={() => copyToClipboard(restResponse || "", "Response")}
								class="rounded p-1 text-surface-400 hover:bg-surface-500/10 focus-visible:ring-2 focus-visible:ring-primary-500"
								aria-label="Copy response payload"
							>
								<iconify-icon icon="mdi:content-copy" width="16"></iconify-icon>
							</button>
						{/if}
					</div>
				</div>

				<div class="relative min-h-65 rounded-lg border border-surface-500/20 bg-surface-900 p-4 text-xs font-mono text-surface-100 overflow-x-auto max-h-125">
					{#if restLoading}
						<div class="flex h-full min-h-55 items-center justify-center text-surface-400">
							<iconify-icon icon="mdi:loading" width="28" class="animate-spin"></iconify-icon>
						</div>
					{:else if restResponse}
						<pre>{restResponse}</pre>
					{:else}
						<div class="flex h-full min-h-55 items-center justify-center text-surface-500 italic">
							Click "Execute Request" to inspect the live response.
						</div>
					{/if}
				</div>
			</AdminCard>
		</div>
	{/if}

	<!-- TAB 2: GraphQL Console -->
	{#if activeTab === "graphql"}
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Query Editor -->
			<AdminCard>
				<div class="mb-4 flex items-center justify-between">
					<h3 class="text-base font-semibold text-surface-900 dark:text-surface-50">
						GraphQL Query
					</h3>
					<span class="font-mono text-xs text-surface-500">{data.graphqlEndpoint}</span>
				</div>

				<div class="space-y-4">
					<div class="space-y-1">
						<label for="gql-query-input" class="block text-xs font-medium text-surface-500">
							Operation Definition
						</label>
						<Textarea
							id="gql-query-input"
							value={gqlQuery}
							rows={10}
							class="font-mono text-xs"
							oninput={(e) => (gqlQuery = (e.target as HTMLTextAreaElement).value)}
						/>
					</div>

					<div class="space-y-1">
						<label for="gql-vars-input" class="block text-xs font-medium text-surface-500">
							Query Variables (JSON)
						</label>
						<Textarea
							id="gql-vars-input"
							value={gqlVariables}
							rows={3}
							class="font-mono text-xs"
							oninput={(e) => (gqlVariables = (e.target as HTMLTextAreaElement).value)}
						/>
					</div>

					<div class="flex items-center gap-2 pt-2">
						<Button
							variant="primary"
							disabled={gqlLoading || !gqlQuery.trim()}
							onclick={executeGraphqlQuery}
						>
							{#if gqlLoading}
								<iconify-icon icon="mdi:loading" class="animate-spin me-1.5"></iconify-icon>
								Running Query...
							{:else}
								<iconify-icon icon="mdi:play" width="16" class="me-1.5"></iconify-icon>
								Run GraphQL Query
							{/if}
						</Button>

						<Button
							variant="secondary"
							onclick={() => { gqlQuery = DEFAULT_GQL_QUERY; gqlVariables = "{}"; }}
						>
							Reset Example
						</Button>
					</div>
				</div>
			</AdminCard>

			<!-- Response Viewer -->
			<AdminCard>
				<div class="mb-4 flex items-center justify-between">
					<h3 class="text-base font-semibold text-surface-900 dark:text-surface-50">
						GraphQL Result
					</h3>
					<div class="flex items-center gap-2">
						{#if gqlStatus !== null}
							<Badge variant={gqlStatus === 200 ? "success" : "error"} size="sm">
								Status: {gqlStatus}
							</Badge>
						{/if}
						{#if gqlDuration !== null}
							<Badge variant="surface" size="sm">
								{gqlDuration}ms
							</Badge>
						{/if}
						{#if gqlResponse}
							<button
								type="button"
								onclick={() => copyToClipboard(gqlResponse || "", "GraphQL Result")}
								class="rounded p-1 text-surface-400 hover:bg-surface-500/10 focus-visible:ring-2 focus-visible:ring-primary-500"
								aria-label="Copy GraphQL response"
							>
								<iconify-icon icon="mdi:content-copy" width="16"></iconify-icon>
							</button>
						{/if}
					</div>
				</div>

				<div class="relative min-h- rounded-lg border border-surface-500/20 bg-surface-900 p-4 text-xs font-mono text-surface-100 overflow-x-auto max-h-125">
					{#if gqlLoading}
						<div class="flex h-full min-h- items-center justify-center text-surface-400">
							<iconify-icon icon="mdi:loading" width="28" class="animate-spin"></iconify-icon>
						</div>
					{:else if gqlResponse}
						<pre>{gqlResponse}</pre>
					{:else}
						<div class="flex h-full min-h- items-center justify-center text-surface-500 italic">
							Click "Run GraphQL Query" to execute operation.
						</div>
					{/if}
				</div>
			</AdminCard>
		</div>
	{/if}

	<!-- TAB 3: Code Generator -->
	{#if activeTab === "codegen"}
		<AdminCard>
			<div class="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-surface-500/15 pb-4">
				<div>
					<h3 class="text-base font-semibold text-surface-900 dark:text-surface-50">
						Client SDK & Query Generator
					</h3>
					<p class="text-xs text-surface-500">
						Copy-pasteable code examples for integrating SveltyCMS into external frontend frameworks or internal server actions.
					</p>
				</div>

				<div class="flex flex-wrap items-center gap-3">
					<!-- Target Collection -->
					<div class="flex items-center gap-2">
						<span class="text-xs text-surface-500">Collection:</span>
						<Select
							value={selectedCollection}
							options={data.collections.map((col) => ({ value: col.id, label: col.name }))}
							onchange={(val: string) => (customCollection = val)}
						/>
					</div>

					<!-- Language Selector -->
					<div class="flex items-center gap-1 rounded-lg border border-surface-500/20 bg-surface-500/10 p-1 dark:bg-surface-800">
						<button
							type="button"
							onclick={() => (selectedSnippetType = "typescript")}
							class="rounded px-2.5 py-1 text-xs font-medium transition-colors {selectedSnippetType === 'typescript' ? 'bg-primary-500 text-white' : 'text-surface-600 hover:text-surface-900 dark:text-surface-400'}"
						>
							TypeScript
						</button>
						<button
							type="button"
							onclick={() => (selectedSnippetType = "localcms")}
							class="rounded px-2.5 py-1 text-xs font-medium transition-colors {selectedSnippetType === 'localcms' ? 'bg-primary-500 text-white' : 'text-surface-600 hover:text-surface-900 dark:text-surface-400'}"
						>
							LocalCMS (SvelteKit)
						</button>
						<button
							type="button"
							onclick={() => (selectedSnippetType = "curl")}
							class="rounded px-2.5 py-1 text-xs font-medium transition-colors {selectedSnippetType === 'curl' ? 'bg-primary-500 text-white' : 'text-surface-600 hover:text-surface-900 dark:text-surface-400'}"
						>
							cURL
						</button>
						<button
							type="button"
							onclick={() => (selectedSnippetType = "python")}
							class="rounded px-2.5 py-1 text-xs font-medium transition-colors {selectedSnippetType === 'python' ? 'bg-primary-500 text-white' : 'text-surface-600 hover:text-surface-900 dark:text-surface-400'}"
						>
							Python
						</button>
					</div>
				</div>
			</div>

			<!-- Generated Snippet Display -->
			<div class="relative rounded-lg border border-surface-500/20 bg-surface-900 p-4 text-xs font-mono text-surface-100">
				<div class="absolute top-3 right-3">
					<Button
						variant="secondary"
						size="sm"
						onclick={() => copyToClipboard(generatedSnippet, "Code snippet")}
					>
						<iconify-icon icon="mdi:content-copy" width="14" class="me-1.5"></iconify-icon>
						Copy Code
					</Button>
				</div>
				<pre class="overflow-x-auto pt-8">{generatedSnippet}</pre>
			</div>
		</AdminCard>
	{/if}
</AdminPageShell>
