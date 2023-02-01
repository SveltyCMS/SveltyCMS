<script lang="ts">
	export let field: any = undefined;
	export let value = '';

	export let widgetValue;
	$: widgetValue = value;

	import { languageSystem } from '@src/stores/store';
	import dayjs from 'dayjs';
	import 'dayjs/locale/fr';

	if (dayjs.isDayjsLocale(languageSystem)) {
		dayjs.locale(languageSystem);
	} else {
		console.log('Invalid locale');
	}

	const today: Date = new Date();
	const tomorrow: Date = dayjs().add(1, 'day').toDate();
</script>

<input
	type="date"
	bind:value={widgetValue}
	min={today.toISOString().substring(0, 10)}
	max={tomorrow.toISOString().substring(0, 10)}
/>
