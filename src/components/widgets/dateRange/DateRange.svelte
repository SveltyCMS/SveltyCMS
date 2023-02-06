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
</script>

<input
	type="date"
	bind:value={widgetValue}
	min={today.toISOString().substring(0, 10)}
	max={tomorrow.toISOString().substring(0, 10)}
/>
