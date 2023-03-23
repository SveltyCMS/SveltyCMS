<script lang="ts">
	export let field: any = undefined;
	export let value = '';

	export let widgetValue: any;
	$: widgetValue = value;

	import { PUBLIC_TRANSLATIONS } from '$env/static/public';
	import dayjs from 'dayjs';
	// import 'dayjs/locale/fr';

	// if (dayjs.isDayjsLocale(PUBLIC_TRANSLATIONS)) {
	// 	dayjs.locale(PUBLIC_TRANSLATIONS);
	// } else {
	// 	console.log('Invalid locale');
	// }

	const today: Date = new Date();
	const tomorrow: Date = dayjs().add(1, 'day').toDate();

	import * as z from 'zod';

	var widgetValueObject = {
		db_fieldName: field.db_fieldName,
		icon: field.icon,
		format: field.format,
		required: field.required
	};

	const dateRangeSchema = z.object({
		db_fieldName: z.string(),
		icon: z.string().optional(),
		format: z.string().optional(),
		required: z.boolean().optional()
	});

	let validationError: string | null = null;

	$: validationError = (() => {
		try {
			dateRangeSchema.parse(widgetValueObject);
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	})();
</script>

<input
	type="date"
	bind:value={widgetValue}
	min={today.toISOString().substring(0, 10)}
	max={tomorrow.toISOString().substring(0, 10)}
/>
{#if validationError !== null}
	<p class="text-red-500">{validationError}</p>
{/if}
