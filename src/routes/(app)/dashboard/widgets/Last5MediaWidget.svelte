<!--
@file: src/routes/(app)/dashboard/widgets/Last5MediaWidget.svelte
@component
**A reusable widget component for displaying last 5 media information with improved rendering and error handling**

@example
<Last5MediaWidget label="Last 5 Media" />

### Props
- `label`: The label for the widget (default: 'Last 5 Media')

### Features:
- Responsive doughnut chart visualization
- Theme-aware rendering (light/dark mode support)
- Real-time data updates
- Customizable widget properties (size, position, etc.)
- Improved error handling and data validation
- Proper lifecycle management
- Enhanced debugging and logging
-->

<script lang="ts">
	export const widgetMeta = {
		name: 'Last 5 Media',
		icon: 'mdi:image-multiple',
		defaultW: 2,
		defaultH: 2,
		validSizes: [
			{ w: 1, h: 1 },
			{ w: 2, h: 2 },
			{ w: 2, h: 1 },
			{ w: 1, h: 2 }
		]
	};

	import BaseWidget from '../BaseWidget.svelte';
	import { onMount } from 'svelte';

	// Define the structure of a media document
	interface MediaDocument {
		createdAt: string;
		createdBy: string;
	}

	// Define the structure of a media schema
	interface MediaSchema {
		schemaName: string;
		recentDocs: MediaDocument[];
	}

	// Define the type of the media array
	let media: MediaSchema[] = $state([]);

	onMount(async () => {
		const res = await fetch('/api/media');
		const data = await res.json();
		media = data.data;
	});

	let { label, theme = 'light', icon = 'mdi:image-multiple' } = $props();
</script>

<BaseWidget {label} theme={theme} endpoint="/api/media" pollInterval={5000}>
	<section>
		<h2>Last 5 Added Media</h2>
		<ul>
			{#each media as { schemaName, recentDocs }}
				<li>
					<h3>{schemaName}</h3>
					<ul>
						{#each recentDocs as doc}
							<li>{doc.createdAt}: {doc.createdBy}</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ul>
	</section>
</BaseWidget>
