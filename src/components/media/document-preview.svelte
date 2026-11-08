<!--
@file src/components/media/document-preview.svelte
@component
**Document viewer for the media details modal — PDF, CSV/TSV and Office assets**

### Props
- `fileId` (string, optional): Stable asset id; keys the delimited fetch so switching assets aborts the previous request.
- `filename` (string): Display name and the extension used for document detection.
- `mimeType` (string, optional): MIME type; the extension wins when both are present.
- `url` (string): Byte-exact original asset URL (`mediaUrl(file)`).
- `thumbnailUrl` (string, optional): Pipeline-generated document thumbnail; never the original document.
- `mimeLabel` (string, optional): Label for the generic document fallback.

### Features:
- PDF: same-origin `<iframe>` around the browser's native viewer, plus an "Open PDF" escape hatch.
- CSV/TSV: bounded streaming read (256 KB) parsed into a 50-row × 8-column sticky-header table.
- Office: generated first-page thumbnail on a white card, generic icon when the pipeline produced none.
- Loading skeleton and downloadable error fallback for delimited previews; requests are aborted per asset.
- Detection mirrors `detectDocumentPreviewKind()` on the server, so a generic octet-stream upload still previews.
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import { logger } from '@utils/logger';

	interface Props {
		fileId?: string;
		filename: string;
		mimeType?: string;
		url: string;
		thumbnailUrl?: string;
		mimeLabel?: string;
	}

	let {
		fileId = '',
		filename,
		mimeType = '',
		url,
		thumbnailUrl = '',
		mimeLabel = ''
	}: Props = $props();

	/** Delimited preview budget — enough rows to orient the reader without fetching an export. */
	const MAX_PREVIEW_BYTES = 256 * 1024;
	const MAX_PREVIEW_ROWS = 50;
	const MAX_PREVIEW_COLUMNS = 8;
	/** The header record is prepended, so the cap below yields 50 data rows plus the header. */
	const MAX_PREVIEW_RECORDS = MAX_PREVIEW_ROWS + 1;

	const DELIMITERS = [',', ';', '\t'] as const;
	type Delimiter = (typeof DELIMITERS)[number];

	const PDF_MIME_TYPES = new Set(['application/pdf', 'application/x-pdf']);
	const CSV_MIME_TYPES = new Set([
		'text/csv',
		'application/csv',
		'text/tab-separated-values',
		'application/tsv',
		'text/tsv'
	]);
	const OFFICE_EXTENSIONS = new Set(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp']);
	const OFFICE_MIME_TYPES = new Set([
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		'application/vnd.oasis.opendocument.text',
		'application/vnd.oasis.opendocument.spreadsheet',
		'application/vnd.oasis.opendocument.presentation'
	]);

	type DocumentPreviewKind = 'pdf' | 'delimited' | 'office' | 'file';

	interface CsvTable {
		header: string[];
		rows: string[][];
		columns: number;
	}

	interface CsvReadyState extends CsvTable {
		key: string;
		status: 'ready';
	}

	type CsvStatus = 'loading' | 'ready' | 'error';
	type CsvState =
		| { key: string; status: 'loading' }
		| CsvReadyState
		| { key: string; status: 'error' };

	/** File extension without the dot, lower-cased — `''` when the name carries none. */
	const extension = $derived.by(() => {
		const name = filename.toLowerCase();
		const dot = name.lastIndexOf('.');
		return dot >= 0 ? name.slice(dot + 1) : '';
	});

	const normalizedMime = $derived((mimeType.split(';')[0] ?? '').trim().toLowerCase());

	const kind = $derived.by((): DocumentPreviewKind => {
		if (extension === 'pdf' || PDF_MIME_TYPES.has(normalizedMime)) return 'pdf';
		if (extension === 'csv' || extension === 'tsv' || CSV_MIME_TYPES.has(normalizedMime)) {
			return 'delimited';
		}
		if (OFFICE_EXTENSIONS.has(extension) || OFFICE_MIME_TYPES.has(normalizedMime)) return 'office';
		return 'file';
	});

	/** Asset identity — a cached or in-flight table must never leak onto another asset. */
	const assetKey = $derived(`${fileId}:${url}`);

	/**
	 * Thumbnail guard, mirroring the image branch: the DB row can outlive its generated
	 * preview (re-processing, cleaned cache), and a broken `<img>` is worse than the icon.
	 */
	const thumbnailKey = $derived(`${fileId}:${thumbnailUrl}`);
	let failedThumbnailKey = $state<string | null>(null);
	const showThumbnail = $derived(Boolean(thumbnailUrl) && failedThumbnailKey !== thumbnailKey);

	let csvState = $state<CsvState | null>(null);

	const csvReady = $derived(
		csvState && csvState.key === assetKey && csvState.status === 'ready' ? csvState : null
	);

	const csvStatus: CsvStatus = $derived(
		!url ? 'error' : csvState && csvState.key === assetKey ? csvState.status : 'loading'
	);

	/** Column ordinals for the parsed table, and placeholder cells for the skeleton. */
	const columnIndexes = $derived(
		Array.from({ length: csvReady?.columns ?? 0 }, (_, index) => index)
	);
	const skeletonRows = Array.from({ length: 6 }, (_, index) => index);
	const skeletonColumns = Array.from({ length: 4 }, (_, index) => index);

	/**
	 * Delimited previews read a bounded head of the original file. The effect only
	 * starts the request — every state write happens after an `await`, so the write
	 * cannot retrigger this effect — and cleanup aborts a superseded request.
	 */
	$effect(() => {
		if (kind !== 'delimited' || !url) return;

		const key = assetKey;
		const controller = new AbortController();

		void (async () => {
			try {
				const response = await fetch(url, {
					credentials: 'same-origin',
					signal: controller.signal
				});
				if (!response.ok) throw new Error(`HTTP ${response.status}`);

				const text = await readCappedText(response, MAX_PREVIEW_BYTES);
				const table = parseDelimitedPreview(text);
				if (!table) throw new Error('No tabular rows found');

				csvState = { key, status: 'ready', ...table };
			} catch (err) {
				if (controller.signal.aborted) return;
				logger.debug(
					`[DocumentPreview] Delimited preview failed: ${
						err instanceof Error ? err.message : String(err)
					}`
				);
				csvState = { key, status: 'error' };
			}
		})();

		return () => controller.abort();
	});

	/** Read at most `limit` bytes of a response body, decoded as UTF-8 text. */
	async function readCappedText(response: Response, limit: number): Promise<string> {
		const body = response.body;
		if (!body) return (await response.text()).slice(0, limit);

		const reader = body.getReader();
		const decoder = new TextDecoder();
		let text = '';
		let bytes = 0;

		try {
			while (bytes < limit) {
				const { done, value } = await reader.read();
				if (done) break;
				bytes += value.byteLength;
				text += decoder.decode(value, { stream: true });
			}
		} finally {
			// Only the head matters — cancel so the remainder of the export is never pulled.
			void reader.cancel().catch(() => {});
		}

		return (text + decoder.decode()).slice(0, limit);
	}

	/** Highest delimiter count outside quotes in the first record — enough for `,` vs `;` vs tab. */
	function detectDelimiter(text: string): Delimiter {
		const counts: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0 };
		let quoted = false;

		for (let i = 0; i < text.length; i++) {
			const char = text[i]!;
			if (char === '"') {
				if (quoted && text[i + 1] === '"') i++;
				else quoted = !quoted;
				continue;
			}
			if (quoted) continue;
			if (char === '\n' || char === '\r') break;
			if (char === ',' || char === ';' || char === '\t') counts[char]++;
		}

		return DELIMITERS.reduce((best, candidate) =>
			counts[candidate] > counts[best] ? candidate : best
		);
	}

	/**
	 * Minimal RFC-4180 reader for the preview: quotes, escaped quotes and CRLF.
	 * Cells past the column cap are consumed but dropped, so the row cap still counts
	 * whole records instead of stopping mid-row.
	 */
	function parseDelimitedPreview(text: string): CsvTable | null {
		const content = text.replace(/^\uFEFF/, '');
		if (!content.trim() || content.includes('\u0000')) return null;

		const delimiter = detectDelimiter(content);
		const records: string[][] = [];
		let record: string[] = [];
		let cell = '';
		let quoted = false;

		const pushCell = () => {
			if (record.length < MAX_PREVIEW_COLUMNS) record.push(cell);
			cell = '';
		};
		const pushRecord = () => {
			pushCell();
			// Blank physical lines carry no data; keeping them would only shift row numbers.
			if (record.some((value) => value.length > 0)) records.push(record);
			record = [];
		};

		for (let i = 0; i < content.length && records.length < MAX_PREVIEW_RECORDS; i++) {
			const char = content[i]!;
			if (quoted) {
				if (char !== '"') {
					cell += char;
				} else if (content[i + 1] === '"') {
					cell += '"';
					i++;
				} else {
					quoted = false;
				}
				continue;
			}
			if (char === '"') {
				quoted = true;
			} else if (char === delimiter) {
				pushCell();
			} else if (char === '\r' || char === '\n') {
				if (char === '\r' && content[i + 1] === '\n') i++;
				pushRecord();
			} else {
				cell += char;
			}
		}
		if (records.length < MAX_PREVIEW_RECORDS && (cell.length > 0 || record.length > 0)) {
			pushRecord();
		}

		const [header = [], ...rows] = records;
		if (header.length === 0 && rows.length === 0) return null;

		return {
			header,
			rows,
			columns: Math.max(header.length, 1, ...rows.map((row) => row.length))
		};
	}
</script>

{#if kind === 'pdf'}
	<div class="flex w-full min-w-0 flex-col gap-2" data-testid="media-pdf-preview" data-kind="pdf">
		<div class="flex items-center justify-end">
			<Button
				variant="surface"
				size="sm"
				href={url}
				target="_blank"
				rel="noopener noreferrer"
				class="h-8 gap-1.5"
				trailingIcon="mdi:open-in-new"
			>
				<span>Open PDF</span>
			</Button>
		</div>
		<!-- Native browser viewer: no `sandbox`, which would block the PDF plugin. -->
		<iframe
			src={url}
			title={filename}
			loading="lazy"
			data-testid="media-pdf-frame"
			class="h-full min-h-96 w-full rounded-lg border border-surface-500/30 bg-white dark:border-surface-500/40"
		></iframe>
	</div>
{:else if kind === 'delimited'}
	<div
		class="flex w-full min-w-0 flex-col gap-2"
		data-testid="media-csv-preview"
		data-state={csvStatus}
	>
		{#if csvStatus === 'loading'}
			<div class="flex flex-col gap-2" aria-busy="true">
				<p class="flex items-center gap-2 text-xs text-(--admin-text-muted)">
					<iconify-icon icon="mdi:table-large" width="16"></iconify-icon>
					<span>Loading table preview…</span>
				</p>
				<div
					class="overflow-hidden rounded-lg border border-surface-500/30 bg-white dark:border-surface-500/40 dark:bg-surface-900"
					aria-hidden="true"
				>
					{#each skeletonRows as rowIndex (rowIndex)}
						<div class="flex gap-2 border-b border-surface-500/20 p-2 last:border-b-0">
							{#each skeletonColumns as columnIndex (columnIndex)}
								<div
									class="h-3 flex-1 rounded-sm bg-surface-500/10 motion-safe:animate-pulse"
								></div>
							{/each}
						</div>
					{/each}
				</div>
			</div>
		{:else if !csvReady}
			<div class="flex flex-col items-center gap-2 text-center" data-state="error">
				<div
					class="rounded-xl border border-surface-500/30 bg-surface-500/10 p-5 text-surface-500 dark:border-surface-500/40 dark:bg-surface-800"
				>
					<iconify-icon icon="mdi:table-off" width="36"></iconify-icon>
				</div>
				<p class="text-sm font-semibold text-surface-600 dark:text-surface-100">
					Table preview unavailable
				</p>
				<p class="max-w-xs text-xs text-(--admin-text-muted)">
					The file could not be read in the browser. Download it to inspect the rows.
				</p>
				{#if url}
					<Button
						variant="surface"
						size="sm"
						href={url}
						download={filename}
						target="_blank"
						rel="noopener noreferrer"
						class="mt-1 h-8 gap-1.5"
					>
						<iconify-icon icon="mdi:download-outline" width="14"></iconify-icon>
						<span>Download original</span>
					</Button>
				{/if}
			</div>
		{:else}
			<div class="flex items-center justify-between gap-2">
				<span
					class="truncate font-mono text-[10px] uppercase tracking-wide text-(--admin-text-muted)"
				>
					{csvReady.rows.length} rows · {csvReady.columns} columns
				</span>
				<Button
					variant="surface"
					size="sm"
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					class="h-8 shrink-0 gap-1.5"
					aria-label={`Open ${filename}`}
				>
					<iconify-icon icon="mdi:open-in-new" width="14"></iconify-icon>
					<span>Open</span>
				</Button>
			</div>
			<!-- Scrollable region: `tabindex="0"` is what makes keyboard scrolling (WCAG 2.1.1)
			     possible, so the region is intentionally focusable. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				class="max-h-[min(50dvh,16rem)] overflow-auto rounded-lg border border-surface-500/30 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary-500 dark:border-surface-500/40 dark:bg-surface-900 dark:focus-visible:outline-primary-500"
				role="region"
				aria-label={`Table preview of ${filename}`}
				tabindex="0"
			>
				<table
					class="w-full min-w-max border-collapse font-mono text-[11px]"
					aria-label={`Table preview of ${filename}`}
					data-testid="media-csv-table"
				>
					<thead>
						<tr>
							<th
								scope="col"
								class="sticky top-0 z-10 border-b border-e border-surface-500/30 bg-surface-500/10 px-2 py-1.5 text-end font-semibold text-(--admin-text-muted) backdrop-blur-sm"
							>
								#
							</th>
							{#each columnIndexes as columnIndex (columnIndex)}
								{@const label = csvReady.header[columnIndex] || `Column ${columnIndex + 1}`}
								<th
									scope="col"
									title={label}
									class="sticky top-0 z-10 border-b border-e border-surface-500/30 bg-surface-500/10 px-2 py-1.5 text-start font-semibold text-surface-600 backdrop-blur-sm last:border-e-0 dark:text-surface-100"
								>
									<div class="max-w-48 truncate" dir="auto">{label}</div>
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each csvReady.rows as row, rowIndex (rowIndex)}
							<tr class="even:bg-surface-500/10">
								<th
									scope="row"
									dir="ltr"
									class="border-b border-e border-surface-500/20 px-2 py-1 text-end align-top font-normal tabular-nums text-(--admin-text-muted)"
								>
									{rowIndex + 2}
								</th>
								{#each columnIndexes as columnIndex (columnIndex)}
									{@const value = row[columnIndex] ?? ''}
									<td
										class="border-b border-e border-surface-500/20 px-2 py-1 align-top text-surface-600 last:border-e-0 dark:text-surface-100"
									>
										<div class="max-w-48 truncate" dir="auto" title={value}>{value}</div>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{:else if kind === 'office'}
	<div
		class="flex w-full min-w-0 flex-col items-center gap-3"
		data-testid="media-document-preview"
		data-kind="office"
	>
		{#if showThumbnail}
			<div
				class="flex max-h-[min(30dvh,11rem)] w-full items-center justify-center overflow-hidden rounded-lg border border-surface-500/30 bg-white p-2 sm:max-h-[min(38dvh,20rem)] lg:max-h-[min(32dvh,18rem)] dark:border-surface-500/40"
			>
				<img
					src={thumbnailUrl}
					alt={`First page of ${filename}`}
					loading="lazy"
					class="max-h-full max-w-full object-contain"
					data-testid="media-document-thumbnail"
					onerror={() => (failedThumbnailKey = thumbnailKey)}
				/>
			</div>
		{:else}
			<div
				class="rounded-xl border border-surface-500/30 bg-surface-500/10 p-6 text-surface-500 dark:border-surface-500/40 dark:bg-surface-800"
			>
				<iconify-icon icon="mdi:file-document-outline" width="48"></iconify-icon>
			</div>
			<span class="font-mono text-xs uppercase tracking-wide text-(--admin-text-muted)">
				{mimeLabel || 'Unknown'}
			</span>
		{/if}
		<Button
			variant="surface"
			size="sm"
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			class="h-8 gap-1.5"
			trailingIcon="mdi:open-in-new"
		>
			<span>Open document</span>
		</Button>
	</div>
{:else}
	<div
		class="flex flex-col items-center gap-3 py-6"
		data-testid="media-document-preview"
		data-kind="file"
	>
		<div
			class="rounded-xl border border-surface-500/30 bg-surface-500/10 p-6 text-surface-500 dark:border-surface-500/40 dark:bg-surface-800"
		>
			<iconify-icon icon="mdi:file-document-outline" width="48"></iconify-icon>
		</div>
		<span class="font-mono text-xs uppercase tracking-wide text-(--admin-text-muted)">
			{mimeLabel || 'Unknown'}
		</span>
	</div>
{/if}
